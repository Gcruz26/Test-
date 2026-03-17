from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.client import Client
from app.models.interpreter_client_id import InterpreterClientID
from app.models.standardized_transaction import StandardizedTransaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.models.validation_error import ValidationError
from app.schemas.validation import ReprocessResponse, StandardizedTransactionUpdate, ValidationQueueItem
from app.services.validation_engine import validate_transaction

router = APIRouter(prefix="/validation-queue", tags=["Validation Queue"])


def _resolve_interpreter_id(
    db: Session,
    transaction: StandardizedTransaction,
    external_interpreter_id: str | None,
) -> int | None:
    if not external_interpreter_id:
        return None
    row = (
        db.query(InterpreterClientID)
        .join(UploadedFile, UploadedFile.client_id == InterpreterClientID.client_id)
        .filter(UploadedFile.id == transaction.uploaded_file_id)
        .filter(func.lower(InterpreterClientID.external_id) == external_interpreter_id.lower())
        .first()
    )
    return row.interpreter_id if row else None


@router.get("", response_model=list[ValidationQueueItem])
def list_validation_queue(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Operations"})),
):
    rows = (
        db.query(ValidationError, StandardizedTransaction, UploadedFile, Client.name)
        .join(StandardizedTransaction, StandardizedTransaction.id == ValidationError.standardized_transaction_id)
        .join(UploadedFile, UploadedFile.id == StandardizedTransaction.uploaded_file_id)
        .join(Client, Client.id == UploadedFile.client_id)
        .filter(ValidationError.is_resolved.is_(False))
        .order_by(StandardizedTransaction.row_number.asc(), ValidationError.created_at.asc())
        .all()
    )

    return [
        ValidationQueueItem(
            validation_error_id=error.id,
            standardized_transaction_id=tx.id,
            uploaded_file_id=uploaded.id,
            row_number=tx.row_number,
            error_type=error.error_code or "validation_error",
            description=error.message,
            field_name=error.field_name,
            report_name=uploaded.file_name,
            client_name=client_name,
            interpreter_name=tx.interpreter_name,
            external_interpreter_id=tx.external_interpreter_id,
            service_date=tx.service_date,
            minutes=tx.minutes,
            hours=tx.hours,
            rate=tx.rate,
            amount=tx.amount,
            location=tx.location,
            currency=tx.currency,
            created_at=error.created_at,
        )
        for error, tx, uploaded, client_name in rows
    ]


@router.patch("/{transaction_id}", status_code=status.HTTP_204_NO_CONTENT)
def update_transaction_for_validation(
    transaction_id: int,
    payload: StandardizedTransactionUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Operations"})),
):
    transaction = db.query(StandardizedTransaction).filter(StandardizedTransaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    update_data = payload.model_dump()
    for field, value in update_data.items():
        setattr(transaction, field, value)

    if payload.external_interpreter_id is not None:
        cleaned_external_id = payload.external_interpreter_id.strip() or None
        transaction.external_interpreter_id = cleaned_external_id
        transaction.interpreter_id = _resolve_interpreter_id(db, transaction, cleaned_external_id)

    if payload.currency is not None:
        transaction.currency = payload.currency.strip().upper() or None

    if payload.location is not None:
        transaction.location = payload.location.strip() or None

    if payload.interpreter_name is not None:
        transaction.interpreter_name = payload.interpreter_name.strip() or None

    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{transaction_id}/reprocess", response_model=ReprocessResponse)
def reprocess_transaction(
    transaction_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Operations"})),
):
    transaction = db.query(StandardizedTransaction).filter(StandardizedTransaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transaction not found")

    validate_transaction(db, transaction)
    db.commit()
    db.refresh(transaction)

    error_count = (
        db.query(ValidationError)
        .filter(
            ValidationError.standardized_transaction_id == transaction.id,
            ValidationError.is_resolved.is_(False),
        )
        .count()
    )

    uploaded_file = db.query(UploadedFile).filter(UploadedFile.id == transaction.uploaded_file_id).first()
    if uploaded_file:
        file_error_count = (
            db.query(ValidationError)
            .join(StandardizedTransaction, StandardizedTransaction.id == ValidationError.standardized_transaction_id)
            .filter(
                StandardizedTransaction.uploaded_file_id == transaction.uploaded_file_id,
                ValidationError.is_resolved.is_(False),
            )
            .count()
        )
        uploaded_file.status = "validation_pending" if file_error_count else "transformed"
        db.commit()

    return ReprocessResponse(
        standardized_transaction_id=transaction.id,
        validation_error_count=error_count,
        status=transaction.status,
    )
