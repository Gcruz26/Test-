from decimal import Decimal

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.client import Client
from app.models.interpreter import Interpreter
from app.models.legal_entity import LegalEntity
from app.models.standardized_transaction import StandardizedTransaction
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.models.validation_error import ValidationError
from app.schemas.dashboard import DashboardResponse, LegalEntityVolumeItem, RecentUploadItem, TopInterpreterItem

router = APIRouter(prefix="/operations", tags=["Operations"])


@router.get("/dashboard", response_model=DashboardResponse)
def dashboard(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Operations", "Viewer"})),
):
    total_reports_processed = db.query(func.count(UploadedFile.id)).scalar() or 0
    validation_errors_pending = db.query(func.count(ValidationError.id)).filter(ValidationError.is_resolved.is_(False)).scalar() or 0

    bills_ready = (
        db.query(func.count(StandardizedTransaction.id))
        .filter(StandardizedTransaction.output_type == "Bill", StandardizedTransaction.processing_status == "routed")
        .scalar()
        or 0
    )
    invoices_ready = (
        db.query(func.count(StandardizedTransaction.id))
        .filter(StandardizedTransaction.output_type == "Invoice", StandardizedTransaction.processing_status == "routed")
        .scalar()
        or 0
    )

    entity_rows = (
        db.query(
            LegalEntity.name,
            func.count(StandardizedTransaction.id),
            func.coalesce(func.sum(StandardizedTransaction.amount), 0),
        )
        .join(StandardizedTransaction, StandardizedTransaction.legal_entity_id == LegalEntity.id)
        .group_by(LegalEntity.name)
        .order_by(func.coalesce(func.sum(StandardizedTransaction.amount), 0).desc(), LegalEntity.name.asc())
        .all()
    )

    interpreter_rows = (
        db.query(
            Interpreter.full_name,
            func.count(StandardizedTransaction.id),
            func.coalesce(func.sum(StandardizedTransaction.amount), 0),
        )
        .join(StandardizedTransaction, StandardizedTransaction.interpreter_id == Interpreter.id)
        .group_by(Interpreter.full_name)
        .order_by(func.coalesce(func.sum(StandardizedTransaction.amount), 0).desc())
        .limit(5)
        .all()
    )

    recent_upload_rows = (
        db.query(UploadedFile, Client.name)
        .join(Client, Client.id == UploadedFile.client_id)
        .order_by(UploadedFile.created_at.desc())
        .limit(8)
        .all()
    )

    return DashboardResponse(
        total_reports_processed=int(total_reports_processed),
        validation_errors_pending=int(validation_errors_pending),
        bills_ready=int(bills_ready),
        invoices_ready=int(invoices_ready),
        volume_per_legal_entity=[
            LegalEntityVolumeItem(
                legal_entity_name=name,
                transaction_count=int(transaction_count),
                total_amount=Decimal(str(total_amount)),
            )
            for name, transaction_count, total_amount in entity_rows
        ],
        top_interpreters_by_production=[
            TopInterpreterItem(
                interpreter_name=name,
                transaction_count=int(transaction_count),
                total_amount=Decimal(str(total_amount)),
            )
            for name, transaction_count, total_amount in interpreter_rows
        ],
        recent_uploads=[
            RecentUploadItem(
                id=upload.id,
                client_name=client_name,
                file_name=upload.file_name,
                source_platform=upload.source_platform,
                report_type=upload.report_type,
                status=upload.status,
                created_at=upload.created_at,
            )
            for upload, client_name in recent_upload_rows
        ],
    )


@router.get("/interpreter-management")
def interpreter_management(_: User = Depends(require_roles({"Admin", "Operations"}))):
    return {"page": "Interpreter Management", "status": "ready"}


@router.get("/validation-queue")
def validation_queue(_: User = Depends(require_roles({"Admin", "Operations", "Finance"}))):
    return {"page": "Validation Queue", "status": "ready"}


@router.get("/export-center")
def export_center(_: User = Depends(require_roles({"Admin", "Finance", "Viewer"}))):
    return {"page": "Export Center", "status": "ready"}
