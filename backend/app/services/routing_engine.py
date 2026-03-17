from __future__ import annotations

import re
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session, joinedload

from app.models.routing_rule import RoutingRule
from app.models.standardized_transaction import StandardizedTransaction
from app.models.uploaded_file import UploadedFile
from app.services.validation_engine import DEFAULT_ALIASES, _merge_aliases, _pick_mapping_config, _pick_value


CONDITION_RE = re.compile(r"^\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*(=|==)\s*(.+?)\s*$")


def _report_type_to_output_type(report_type: str | None) -> str:
    value = (report_type or "").strip().lower()
    if "bill" in value or "billing" in value:
        return "Bill"
    return "Invoice"


def _parse_destination(destination: str | None) -> dict[str, str]:
    if not destination:
        return {}

    text = destination.strip()
    if not text:
        return {}

    lowered = text.lower()
    if lowered in {"bill", "invoice"}:
        return {"output_type": text.title()}

    parsed: dict[str, str] = {}
    parts = [part.strip() for part in text.split(";") if part.strip()]
    for part in parts:
        if "=" not in part:
            continue
        key, value = part.split("=", 1)
        parsed[key.strip().lower()] = value.strip()
    return parsed


def _build_context(
    transaction: StandardizedTransaction,
    uploaded_file: UploadedFile,
    alias_map: dict[str, list[str]],
) -> dict[str, str]:
    payload = transaction.raw_row.raw_payload if transaction.raw_row and isinstance(transaction.raw_row.raw_payload, dict) else {}
    return {
        "location": (transaction.location or "").strip(),
        "interpreter_location": (transaction.location or "").strip(),
        "client_name": uploaded_file.client.name if uploaded_file.client else "",
        "source_platform": uploaded_file.source_platform or "",
        "report_type": uploaded_file.report_type or "",
        "currency": transaction.currency or "",
        "interpreter_name": transaction.interpreter_name or "",
        "external_interpreter_id": transaction.external_interpreter_id or "",
        "raw_location": str(_pick_value(payload, alias_map.get("location", DEFAULT_ALIASES["location"])) or "").strip(),
    }


def _rule_matches(rule: RoutingRule, context: dict[str, str]) -> bool:
    conditions = (rule.conditions or "").strip()
    if not conditions:
        return True

    clauses = [clause.strip() for clause in re.split(r"\s+and\s+|;", conditions, flags=re.IGNORECASE) if clause.strip()]
    for clause in clauses:
        match = CONDITION_RE.match(clause)
        if not match:
            return False
        field, _, expected = match.groups()
        actual = context.get(field.strip().lower(), "")
        if actual.lower() != expected.strip().strip("'\"").lower():
            return False
    return True


def _choose_rule(rules: list[RoutingRule], context: dict[str, str]) -> RoutingRule | None:
    matched = [rule for rule in rules if _rule_matches(rule, context)]
    if not matched:
        return None
    matched.sort(key=lambda rule: len([part for part in (rule.conditions or "").split(";") if part.strip()]), reverse=True)
    return matched[0]


def _infer_quantity_basis(transaction: StandardizedTransaction, alias_map: dict[str, list[str]]) -> str | None:
    payload = transaction.raw_row.raw_payload if transaction.raw_row and isinstance(transaction.raw_row.raw_payload, dict) else {}
    if _pick_value(payload, alias_map.get("hours", DEFAULT_ALIASES["hours"])) is not None and transaction.hours is not None:
        return "hours"
    if _pick_value(payload, alias_map.get("minutes", DEFAULT_ALIASES["minutes"])) is not None and transaction.minutes is not None:
        return "minutes"
    if transaction.hours is not None:
        return "hours"
    if transaction.minutes is not None:
        return "minutes"
    return None


def _calculate_final_amount(transaction: StandardizedTransaction, quantity_basis: str | None) -> Decimal | None:
    if transaction.rate is None or quantity_basis is None:
        return transaction.amount

    if quantity_basis == "hours" and transaction.hours is not None:
        return (transaction.hours * transaction.rate).quantize(Decimal("0.01"))
    if quantity_basis == "minutes" and transaction.minutes is not None:
        return (transaction.minutes * transaction.rate).quantize(Decimal("0.01"))
    return transaction.amount


def route_uploaded_file_transactions(db: Session, uploaded_file: UploadedFile) -> dict[str, int]:
    alias_map = _merge_aliases(_pick_mapping_config(db, uploaded_file))
    rules = (
        db.query(RoutingRule)
        .filter(RoutingRule.client_id == uploaded_file.client_id, RoutingRule.is_active.is_(True))
        .order_by(RoutingRule.id.asc())
        .all()
    )
    transactions = (
        db.query(StandardizedTransaction)
        .options(joinedload(StandardizedTransaction.raw_row))
        .filter(StandardizedTransaction.uploaded_file_id == uploaded_file.id)
        .order_by(StandardizedTransaction.row_number.asc(), StandardizedTransaction.id.asc())
        .all()
    )

    routed = 0
    failed = 0

    for transaction in transactions:
        context = _build_context(transaction, uploaded_file, alias_map)
        rule = _choose_rule(rules, context)
        route_meta = _parse_destination(rule.destination if rule else None)
        quantity_basis = route_meta.get("quantity_basis") or _infer_quantity_basis(transaction, alias_map)
        output_type = route_meta.get("output_type") or _report_type_to_output_type(uploaded_file.report_type)

        transaction.legal_entity_id = rule.legal_entity_id if rule else None
        transaction.quantity_basis = quantity_basis
        transaction.output_type = output_type
        transaction.amount = _calculate_final_amount(transaction, quantity_basis)

        if transaction.legal_entity_id is None:
            transaction.processing_status = "routing_failed"
            failed += 1
        elif transaction.amount is None or quantity_basis is None:
            transaction.processing_status = "routing_failed"
            failed += 1
        elif transaction.status == "validation_failed":
            transaction.processing_status = "routed_with_errors"
            routed += 1
        else:
            transaction.processing_status = "routed"
            routed += 1

    return {"routed_rows": routed, "routing_failures": failed}
