from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.export import Export
from app.models.legal_entity import LegalEntity
from app.models.user import User
from app.schemas.export import ExportGenerationResponse, ExportItem
from app.services.export_generator import generate_exports

router = APIRouter(prefix="/exports", tags=["Exports"])


@router.post("/generate", response_model=ExportGenerationResponse)
def generate_export_files(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles({"Admin", "Finance"})),
):
    exports = generate_exports(db, current_user)
    items = [
        ExportItem(
            id=export.id,
            legal_entity_id=export.legal_entity_id,
            legal_entity_name=export.legal_entity.name,
            export_type=export.export_type,
            file_name=export.file_name,
            status=export.status,
            created_at=export.created_at,
        )
        for export in exports
    ]
    return ExportGenerationResponse(
        message=f"Generated {len(items)} export file(s)",
        exports_created=len(items),
        files=items,
    )


@router.get("", response_model=list[ExportItem])
def list_exports(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Viewer"})),
):
    rows = (
        db.query(Export, LegalEntity.name)
        .join(LegalEntity, LegalEntity.id == Export.legal_entity_id)
        .order_by(Export.created_at.desc())
        .all()
    )
    return [
        ExportItem(
            id=export.id,
            legal_entity_id=export.legal_entity_id,
            legal_entity_name=entity_name,
            export_type=export.export_type,
            file_name=export.file_name,
            status=export.status,
            created_at=export.created_at,
        )
        for export, entity_name in rows
    ]


@router.get("/{export_id}/download")
def download_export(
    export_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Finance", "Viewer"})),
):
    export = db.query(Export).filter(Export.id == export_id).first()
    if not export:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export not found")

    file_path = Path(export.storage_path)
    if not file_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Export file is missing")

    return FileResponse(path=file_path, filename=export.file_name, media_type="text/csv")
