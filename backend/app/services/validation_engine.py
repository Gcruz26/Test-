from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
import re
from typing import Any

from sqlalchemy import delete
from sqlalchemy.orm import Session, joinedload

from app.models.client_mapping_config import ClientMappingConfig
from app.models.standardized_transaction import StandardizedTransaction
from app.models.uploaded_file import UploadedFile
from app.models.validation_error import ValidationError


REQUIRED_FIELDS = {
    "service_date": "Service date",
    "interpreter_name": "Interpreter name",
}

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


@dataclass
class ValidationIssue:
    field_name: str
    error_code: str
    message: str


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


def _normalize_text(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return cleaned or None


def _merge_aliases(config: ClientMappingConfig | None) -> dict[str, list[str]]:
    merged = {field: list(DEFAULT_ALIASES[field]) for field in DEFAULT_ALIASES}
    if not config:
        return merged

    raw = config.field_aliases if isinstance(config.field_aliases, dict) else {}
    for field in merged:
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


def _has_negative(value: Decimal | None) -> bool:
    return value is not None and value < 0


def _duplicate_key(tx: StandardizedTransaction) -> tuple[Any, ...]:
    return (
        tx.service_date.isoformat() if tx.service_date else None,
        (tx.external_interpreter_id or "").strip().lower() or None,
        (tx.interpreter_name or "").strip().lower() or None,
        str(tx.minutes) if tx.minutes is not None else None,
        str(tx.hours) if tx.hours is not None else None,
        str(tx.rate) if tx.rate is not None else None,
        str(tx.amount) if tx.amount is not None else None,
        (tx.location or "").strip().lower() or None,
        (tx.currency or "").strip().upper() or None,
    )


def _build_duplicate_messages(rows: list[StandardizedTransaction]) -> dict[int, str]:
    grouped: dict[tuple[Any, ...], list[StandardizedTransaction]] = defaultdict(list)
    for tx in rows:
        grouped[_duplicate_key(tx)].append(tx)

    messages: dict[int, str] = {}
    for txs in grouped.values():
        if len(txs) < 2:
            continue
        row_numbers = [str(tx.row_number or tx.id) for tx in txs]
        description = f"Duplicate of row(s): {', '.join(row_numbers)}."
        for tx in txs:
            messages[tx.id] = description
    return messages


def _validate_transaction(
    tx: StandardizedTransaction,
    aliases: dict[str, list[str]],
    duplicate_message: str | None,
) -> list[ValidationIssue]:
    issues: list[ValidationIssue] = []
    payload = tx.raw_row.raw_payload if tx.raw_row and isinstance(tx.raw_row.raw_payload, dict) else {}

    service_date_raw = _pick_value(payload, aliases.get("service_date", DEFAULT_ALIASES["service_date"]))
    if service_date_raw not in (None, "") and tx.service_date is None:
        issues.append(
            ValidationIssue(
                field_name="service_date",
                error_code="invalid_date",
                message=f"Invalid date value: {service_date_raw}.",
            )
        )

    missing_required = []
    if tx.service_date is None and service_date_raw in (None, ""):
        missing_required.append(REQUIRED_FIELDS["service_date"])
    if not _normalize_text(tx.interpreter_name):
        missing_required.append(REQUIRED_FIELDS["interpreter_name"])
    if missing_required:
        issues.append(
            ValidationIssue(
                field_name="required_fields",
                error_code="missing_required_fields",
                message=f"Missing required fields: {', '.join(missing_required)}.",
            )
        )

    if tx.interpreter_id is None:
        issues.append(
            ValidationIssue(
                field_name="interpreter_id",
                error_code="interpreter_not_found",
                message="Interpreter could not be matched to an existing interpreter record.",
            )
        )

    if not _normalize_text(tx.location):
        issues.append(
            ValidationIssue(
                field_name="location",
                error_code="missing_location",
                message="Location is required before export.",
            )
        )

    if tx.rate is None:
        issues.append(
            ValidationIssue(
                field_name="rate",
                error_code="missing_rate",
                message="Rate is required before export.",
            )
        )

    negative_fields = []
    if _has_negative(tx.minutes):
        negative_fields.append("minutes")
    if _has_negative(tx.hours):
        negative_fields.append("hours")
    if _has_negative(tx.rate):
        negative_fields.append("rate")
    if _has_negative(tx.amount):
        negative_fields.append("amount")
    if negative_fields:
        issues.append(
            ValidationIssue(
                field_name="numeric_values",
                error_code="negative_values",
                message=f"Negative values found in: {', '.join(negative_fields)}.",
            )
        )

    if duplicate_message:
        issues.append(
            ValidationIssue(
                field_name="row",
                error_code="duplicate_rows",
                message=duplicate_message,
            )
        )

    return issues


def validate_uploaded_file_transactions(
    db: Session,
    uploaded_file_id: int,
    aliases: dict[str, list[str]] | None = None,
) -> int:
    uploaded_file = db.query(UploadedFile).filter(UploadedFile.id == uploaded_file_id).first()
    alias_map = aliases or _merge_aliases(_pick_mapping_config(db, uploaded_file)) if uploaded_file else DEFAULT_ALIASES

    rows = (
        db.query(StandardizedTransaction)
        .options(joinedload(StandardizedTransaction.raw_row), joinedload(StandardizedTransaction.validation_errors))
        .filter(StandardizedTransaction.uploaded_file_id == uploaded_file_id)
        .order_by(StandardizedTransaction.row_number.asc(), StandardizedTransaction.id.asc())
        .all()
    )
    if not rows:
        return 0

    tx_ids = [tx.id for tx in rows]
    db.execute(delete(ValidationError).where(ValidationError.standardized_transaction_id.in_(tx_ids)))

    duplicate_messages = _build_duplicate_messages(rows)
    issues_to_persist: list[ValidationError] = []
    for tx in rows:
        issues = _validate_transaction(tx, alias_map, duplicate_messages.get(tx.id))
        tx.status = "validated" if not issues else "validation_failed"
        for issue in issues:
            issues_to_persist.append(
                ValidationError(
                    standardized_transaction_id=tx.id,
                    field_name=issue.field_name,
                    error_code=issue.error_code,
                    message=issue.message,
                    is_resolved=False,
                )
            )

    if issues_to_persist:
        db.add_all(issues_to_persist)

    return len(issues_to_persist)


def validate_transaction(db: Session, transaction: StandardizedTransaction) -> int:
    return validate_uploaded_file_transactions(db, transaction.uploaded_file_id)
