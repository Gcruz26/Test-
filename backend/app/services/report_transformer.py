from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.models.client_mapping_config import ClientMappingConfig
from app.models.interpreter_client_id import InterpreterClientID
from app.models.raw_row import RawRow
from app.models.standardized_transaction import StandardizedTransaction
from app.models.uploaded_file import UploadedFile
from app.models.validation_error import ValidationError
from app.services.routing_engine import route_uploaded_file_transactions
from app.services.validation_engine import validate_uploaded_file_transactions

STANDARD_FIELDS = [
    "service_date",
    "interpreter_name",
    "external_interpreter_id",
    "minutes",
    "hours",
    "rate",
    "amount",
    "location",
    "currency",
]

DEFAULT_ALIASES: dict[str, list[str]] = {
    "service_date": ["service_date", "service date", "date", "date_of_service", "dos"],
    "interpreter_name": ["interpreter_name", "interpreter", "name", "provider_name"],
    "external_interpreter_id": [
        "external_interpreter_id",
        "interpreter_id",
        "interpreter id",
        "external id",
        "provider_id",
    ],
    "minutes": ["minutes", "duration_minutes", "mins", "total_minutes"],
    "hours": ["hours", "duration_hours", "hrs", "total_hours"],
    "rate": ["rate", "hourly_rate", "unit_rate"],
    "amount": ["amount", "total", "charge", "line_total"],
    "location": ["location", "site", "department", "city"],
    "currency": ["currency", "currency_code", "curr"],
}


def _canonical_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]", "", value.lower())


def _pick_value(payload: dict[str, Any], aliases: list[str]) -> Any:
    canonical_payload = {_canonical_key(str(key)): payload[key] for key in payload.keys()}
    for alias in aliases:
        key = _canonical_key(alias)
        if key in canonical_payload:
            value = canonical_payload[key]
            if value is None:
                continue
            if isinstance(value, str) and not value.strip():
                continue
            return value
    return None


def _to_decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value
    if isinstance(value, (int, float)):
        return Decimal(str(value))
    if isinstance(value, str):
        cleaned = value.replace(",", "").strip()
        if not cleaned:
            return None
        try:
            return Decimal(cleaned)
        except InvalidOperation:
            return None
    return None


def _to_date(value: Any) -> date | None:
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, str):
        candidate = value.strip()
        if not candidate:
            return None

        for fmt in ("%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%m-%d-%Y", "%d-%m-%Y"):
            try:
                return datetime.strptime(candidate, fmt).date()
            except ValueError:
                pass

        try:
            return datetime.fromisoformat(candidate).date()
        except ValueError:
            return None
    return None


def _merge_aliases(config: ClientMappingConfig | None) -> dict[str, list[str]]:
    merged = {field: list(DEFAULT_ALIASES[field]) for field in STANDARD_FIELDS}
    if not config:
        return merged

    raw = config.field_aliases if isinstance(config.field_aliases, dict) else {}
    for field in STANDARD_FIELDS:
        aliases = raw.get(field)
        if isinstance(aliases, list):
            values = [str(item) for item in aliases if str(item).strip()]
            if values:
                merged[field] = values
    return merged


def _pick_mapping_config(db: Session, uploaded_file: UploadedFile) -> ClientMappingConfig | None:
    configs = (
        db.query(ClientMappingConfig)
        .filter(ClientMappingConfig.client_id == uploaded_file.client_id, ClientMappingConfig.is_active.is_(True))
        .all()
    )

    if not configs:
        return None

    source = (uploaded_file.source_platform or "").lower()
    report = (uploaded_file.report_type or "").lower()

    def score(cfg: ClientMappingConfig) -> tuple[int, int]:
        cfg_source = (cfg.source_platform or "").lower()
        cfg_report = (cfg.report_type or "").lower()

        source_match = int(not cfg_source or cfg_source == source)
        report_match = int(not cfg_report or cfg_report == report)
        specificity = int(bool(cfg_source)) + int(bool(cfg_report))
        return (source_match + report_match, specificity)

    eligible = [cfg for cfg in configs if score(cfg)[0] == 2]
    if not eligible:
        return None

    eligible.sort(key=score, reverse=True)
    return eligible[0]


def transform_uploaded_report(db: Session, uploaded_file: UploadedFile) -> dict[str, int | str]:
    mapping_config = _pick_mapping_config(db, uploaded_file)
    aliases = _merge_aliases(mapping_config)

    rows = (
        db.query(RawRow)
        .filter(RawRow.uploaded_file_id == uploaded_file.id)
        .order_by(RawRow.row_number.asc())
        .all()
    )

    existing_ids = [
        tx_id
        for (tx_id,) in db.query(StandardizedTransaction.id)
        .filter(StandardizedTransaction.uploaded_file_id == uploaded_file.id)
        .all()
    ]
    if existing_ids:
        db.execute(delete(ValidationError).where(ValidationError.standardized_transaction_id.in_(existing_ids)))
        db.execute(delete(StandardizedTransaction).where(StandardizedTransaction.id.in_(existing_ids)))

    interpreter_rows = (
        db.query(InterpreterClientID)
        .filter(InterpreterClientID.client_id == uploaded_file.client_id)
        .all()
    )
    interpreter_map = {row.external_id.strip().lower(): row.interpreter_id for row in interpreter_rows}

    transformed: list[StandardizedTransaction] = []
    unmatched = 0

    for row in rows:
        payload = row.raw_payload if isinstance(row.raw_payload, dict) else {}

        external_id_raw = _pick_value(payload, aliases["external_interpreter_id"])
        external_id = str(external_id_raw).strip() if external_id_raw is not None else None

        interpreter_id = None
        if external_id:
            interpreter_id = interpreter_map.get(external_id.lower())

        minutes = _to_decimal(_pick_value(payload, aliases["minutes"]))
        hours = _to_decimal(_pick_value(payload, aliases["hours"]))
        rate = _to_decimal(_pick_value(payload, aliases["rate"]))
        amount = _to_decimal(_pick_value(payload, aliases["amount"]))

        if hours is None and minutes is not None:
            hours = (minutes / Decimal("60")).quantize(Decimal("0.01"))
        if minutes is None and hours is not None:
            minutes = (hours * Decimal("60")).quantize(Decimal("0.01"))
        if amount is None and hours is not None and rate is not None:
            amount = (hours * rate).quantize(Decimal("0.01"))

        interpreter_name_value = _pick_value(payload, aliases["interpreter_name"])
        location_value = _pick_value(payload, aliases["location"])
        currency_value = _pick_value(payload, aliases["currency"])

        tx = StandardizedTransaction(
            uploaded_file_id=uploaded_file.id,
            raw_row_id=row.id,
            row_number=row.row_number,
            interpreter_id=interpreter_id,
            service_date=_to_date(_pick_value(payload, aliases["service_date"])),
            interpreter_name=(
                str(interpreter_name_value).strip()
                if interpreter_name_value is not None
                else None
            ),
            external_interpreter_id=external_id,
            minutes=minutes,
            hours=hours,
            rate=rate,
            amount=amount,
            location=(
                str(location_value).strip()
                if location_value is not None
                else None
            ),
            currency=(
                str(currency_value).strip().upper()
                if currency_value is not None
                else None
            ),
            status="transformed" if interpreter_id else "interpreter_unmatched",
        )
        transformed.append(tx)
        if not interpreter_id:
            unmatched += 1

    db.add_all(transformed)
    db.flush()
    validation_count = validate_uploaded_file_transactions(db, uploaded_file.id, aliases)
    routing_result = route_uploaded_file_transactions(db, uploaded_file)
    uploaded_file.status = "validation_pending" if validation_count else "transformed"
    db.commit()

    return {
        "uploaded_file_id": uploaded_file.id,
        "raw_rows": len(rows),
        "transformed_rows": len(transformed),
        "unmatched_interpreters": unmatched,
        "validation_errors": validation_count,
        "routed_rows": routing_result["routed_rows"],
        "routing_failures": routing_result["routing_failures"],
        "mapping_config_id": mapping_config.id if mapping_config else 0,
    }
