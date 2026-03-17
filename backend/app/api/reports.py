from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_roles
from app.db.session import get_db
from app.models.client import Client
from app.models.raw_row import RawRow
from app.models.uploaded_file import UploadedFile
from app.models.user import User
from app.schemas.report import ReportDetail, ReportListItem, ReportUploadResponse
from app.services.report_parser import parse_report
from app.services.report_transformer import transform_uploaded_report
from app.services.storage_factory import get_storage_provider

router = APIRouter(prefix="/reports", tags=["Reports"])


def _detect_file_format(file_name: str) -> str:
    ext = Path(file_name).suffix.lower().replace(".", "")
    if ext in {"csv", "xlsx", "xls", "xlsm"}:
        return ext
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only CSV and Excel files are supported")


def _build_report_response(db: Session, report: UploadedFile, client_name: str | None = None) -> ReportDetail:
    count = db.query(func.count(RawRow.id)).filter(RawRow.uploaded_file_id == report.id).scalar() or 0
    if client_name is None:
        client_name = db.query(Client.name).filter(Client.id == report.client_id).scalar() or "Unknown"

    return ReportDetail(
        id=report.id,
        client_id=report.client_id,
        client_name=client_name,
        source_platform=report.source_platform,
        report_type=report.report_type,
        period=report.period,
        file_name=report.file_name,
        file_format=report.file_format,
        status=report.status,
        raw_rows_count=int(count),
        created_at=report.created_at,
    )


@router.post("/upload", response_model=ReportUploadResponse)
def upload_report(
    client_name: str = Form(...),
    source_platform: str = Form(...),
    report_type: str = Form(...),
    period: str = Form(...),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles({"Admin", "Finance", "Operations"})),
):
    if not file.filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing file name")

    client_name = client_name.strip()
    source_platform = source_platform.strip()
    report_type = report_type.strip()
    period = period.strip()

    if not all([client_name, source_platform, report_type, period]):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="All metadata fields are required")

    file_format = _detect_file_format(file.filename)

    client = db.query(Client).filter(func.lower(Client.name) == client_name.lower()).first()
    if not client:
        client = Client(name=client_name)
        db.add(client)
        db.flush()

    safe_name = Path(file.filename).name
    unique_name = f"{uuid.uuid4().hex}_{safe_name}"
    content = file.file.read()

    provider = get_storage_provider()
    stored_path = provider.save_file(unique_name, content)

    uploaded = UploadedFile(
        client_id=client.id,
        uploaded_by_user_id=current_user.id,
        file_name=safe_name,
        file_format=file_format,
        source_platform=source_platform,
        report_type=report_type,
        period=period,
        storage_path=stored_path,
        status="uploaded",
    )
    db.add(uploaded)
    db.flush()

    try:
        parsed_rows = parse_report(content=content, file_format=file_format)
        raw_rows = [
            RawRow(
                uploaded_file_id=uploaded.id,
                row_number=index,
                raw_payload=row,
                parse_status="parsed",
            )
            for index, row in enumerate(parsed_rows, start=1)
        ]
        db.add_all(raw_rows)
        uploaded.status = "parsed"
        db.commit()
        db.refresh(uploaded)
    except ValueError as exc:
        uploaded.status = "parse_failed"
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    except Exception:
        uploaded.status = "parse_failed"
        db.commit()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to parse uploaded file")

    response = _build_report_response(db, uploaded, client_name=client.name)
    return ReportUploadResponse(**response.model_dump(), message="Report uploaded and parsed")


@router.post("/{report_id}/transform")
def transform_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Operations"})),
):
    report = db.query(UploadedFile).filter(UploadedFile.id == report_id).first()
    if not report:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    if report.status not in {"parsed", "transformed"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Report must be parsed before transform")

    result = transform_uploaded_report(db, report)
    return {"message": "Transformation completed", **result}


@router.get("", response_model=list[ReportListItem])
def list_reports(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Operations", "Viewer"})),
):
    rows = (
        db.query(UploadedFile, Client.name, func.count(RawRow.id).label("raw_count"))
        .join(Client, Client.id == UploadedFile.client_id)
        .outerjoin(RawRow, RawRow.uploaded_file_id == UploadedFile.id)
        .group_by(UploadedFile.id, Client.name)
        .order_by(UploadedFile.created_at.desc())
        .all()
    )

    return [
        ReportListItem(
            id=uploaded.id,
            client_id=uploaded.client_id,
            client_name=client_name,
            source_platform=uploaded.source_platform,
            report_type=uploaded.report_type,
            period=uploaded.period,
            file_name=uploaded.file_name,
            file_format=uploaded.file_format,
            status=uploaded.status,
            raw_rows_count=int(raw_count),
            created_at=uploaded.created_at,
        )
        for uploaded, client_name, raw_count in rows
    ]


@router.get("/{report_id}", response_model=ReportDetail)
def get_report(
    report_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    row = (
        db.query(UploadedFile, Client.name, func.count(RawRow.id).label("raw_count"))
        .join(Client, Client.id == UploadedFile.client_id)
        .outerjoin(RawRow, RawRow.uploaded_file_id == UploadedFile.id)
        .filter(UploadedFile.id == report_id)
        .group_by(UploadedFile.id, Client.name)
        .first()
    )
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    uploaded, client_name, raw_count = row
    return ReportDetail(
        id=uploaded.id,
        client_id=uploaded.client_id,
        client_name=client_name,
        source_platform=uploaded.source_platform,
        report_type=uploaded.report_type,
        period=uploaded.period,
        file_name=uploaded.file_name,
        file_format=uploaded.file_format,
        status=uploaded.status,
        raw_rows_count=int(raw_count),
        created_at=uploaded.created_at,
    )
