from __future__ import annotations

import csv
from datetime import date, timedelta
from io import StringIO
from pathlib import Path

from sqlalchemy.orm import Session, joinedload

from app.core.config import settings
from app.models.client import Client
from app.models.export import Export
from app.models.legal_entity import LegalEntity
from app.models.standardized_transaction import StandardizedTransaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User


EXPORT_HEADERS = [
    "Vendor/Customer Name",
    "Bill/Invoice Number",
    "Date",
    "Due Date",
    "Item",
    "Quantity",
    "Rate",
    "Amount",
    "Description",
]


def _entity_suffix(entity: LegalEntity) -> str:
    name = entity.name.lower()
    country = (entity.country or "").lower()
    if "llc" in name:
        return "LLC"
    if "cabo verde" in name or "cape verde" in country:
        return "CV"
    if "senegal" in name or "senegal" in country:
        return "Senegal"
    return "".join(ch for ch in entity.name if ch.isalnum()) or f"Entity{entity.id}"


def _file_name(export_type: str, entity: LegalEntity) -> str:
    prefix = "Bills" if export_type.lower() == "bill" else "Invoices"
    return f"{prefix}_{_entity_suffix(entity)}.csv"


def _vendor_or_customer_name(transaction: StandardizedTransaction, client_name: str) -> str:
    if (transaction.output_type or "").lower() == "bill":
        return transaction.interpreter_name or transaction.external_interpreter_id or "Unknown Vendor"
    return client_name


def _document_number(transaction: StandardizedTransaction) -> str:
    prefix = "BILL" if (transaction.output_type or "").lower() == "bill" else "INV"
    return f"{prefix}-{transaction.id}"


def _row_payload(transaction: StandardizedTransaction, client_name: str) -> dict[str, str]:
    service_date = transaction.service_date or date.today()
    due_date = service_date + timedelta(days=30)
    quantity = transaction.hours if transaction.quantity_basis == "hours" else transaction.minutes
    output_label = "Bill" if (transaction.output_type or "").lower() == "bill" else "Invoice"
    location = transaction.location or "Unknown location"

    return {
        "Vendor/Customer Name": _vendor_or_customer_name(transaction, client_name),
        "Bill/Invoice Number": _document_number(transaction),
        "Date": service_date.isoformat(),
        "Due Date": due_date.isoformat(),
        "Item": "Interpretation Services",
        "Quantity": str(quantity or ""),
        "Rate": str(transaction.rate or ""),
        "Amount": str(transaction.amount or ""),
        "Description": f"{output_label} for {location}",
    }


def _csv_bytes(rows: list[dict[str, str]]) -> bytes:
    buffer = StringIO()
    writer = csv.DictWriter(buffer, fieldnames=EXPORT_HEADERS)
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue().encode("utf-8")


def generate_exports(db: Session, current_user: User) -> list[Export]:
    export_dir = Path(settings.local_export_dir).resolve()
    export_dir.mkdir(parents=True, exist_ok=True)

    transactions = (
        db.query(StandardizedTransaction, LegalEntity, Client.name)
        .join(LegalEntity, LegalEntity.id == StandardizedTransaction.legal_entity_id)
        .join(UploadedFile, UploadedFile.id == StandardizedTransaction.uploaded_file_id)
        .join(Client, Client.id == UploadedFile.client_id)
        .options(joinedload(StandardizedTransaction.uploaded_file))
        .filter(StandardizedTransaction.processing_status == "routed")
        .filter(StandardizedTransaction.legal_entity_id.isnot(None))
        .filter(StandardizedTransaction.output_type.isnot(None))
        .order_by(StandardizedTransaction.legal_entity_id.asc(), StandardizedTransaction.output_type.asc(), StandardizedTransaction.id.asc())
        .all()
    )

    grouped: dict[tuple[int, str], list[tuple[StandardizedTransaction, LegalEntity, str]]] = {}
    for transaction, entity, client_name in transactions:
        key = (entity.id, transaction.output_type or "Invoice")
        grouped.setdefault(key, []).append((transaction, entity, client_name))

    created_exports: list[Export] = []

    for (_, export_type), group_rows in grouped.items():
        entity = group_rows[0][1]
        file_name = _file_name(export_type, entity)
        rows = [_row_payload(transaction, client_name) for transaction, _, client_name in group_rows]
        target = export_dir / file_name
        target.write_bytes(_csv_bytes(rows))

        export = Export(
            legal_entity_id=entity.id,
            exported_by_user_id=current_user.id,
            file_name=file_name,
            export_type=export_type,
            storage_path=str(target),
            status="generated",
        )
        db.add(export)
        created_exports.append(export)

    db.commit()
    for export in created_exports:
        db.refresh(export)
    return created_exports
