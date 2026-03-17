from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_roles
from app.db.session import get_db
from app.models.user import User
from app.schemas.zoho_integration import (
    DEFAULT_FIELD_MAPPING,
    ZohoCRMSettingsResponse,
    ZohoCRMSettingsUpdate,
    ZohoSyncRunResponse,
    ZohoSyncStatusResponse,
)
from app.services.zoho_crm import (
    ZohoCRMConfigurationError,
    ZohoCRMServiceError,
    ZohoInterpreterSyncService,
    build_sync_status_summary,
    ensure_admin_settings,
    get_or_create_settings,
    log_sync_event,
)

router = APIRouter(prefix="/integrations/zoho/crm", tags=["Zoho CRM"])


@router.get("/settings", response_model=ZohoCRMSettingsResponse)
def get_settings(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin"})),
):
    settings = get_or_create_settings(db)
    if not settings.field_mapping:
        settings.field_mapping = DEFAULT_FIELD_MAPPING
        db.commit()
        db.refresh(settings)
    return settings


@router.put("/settings", response_model=ZohoCRMSettingsResponse)
def update_settings(
    payload: ZohoCRMSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin"})),
):
    settings = get_or_create_settings(db)
    settings.base_url = payload.base_url.strip()
    settings.client_id = payload.client_id.strip()
    settings.client_secret = payload.client_secret.strip()
    settings.refresh_token = payload.refresh_token.strip()
    settings.module_name = payload.module_name.strip()
    settings.field_mapping = payload.field_mapping or DEFAULT_FIELD_MAPPING
    db.commit()
    db.refresh(settings)
    log_sync_event(db, "info", "settings_updated", "Zoho CRM settings were updated by an admin")
    return settings


@router.post("/full-sync", response_model=ZohoSyncRunResponse)
def full_sync(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin"})),
):
    settings = get_or_create_settings(db)
    ensure_admin_settings(settings)

    try:
        summary = ZohoInterpreterSyncService(db, settings).full_sync()
        return ZohoSyncRunResponse(message="Zoho CRM full sync completed", **summary)
    except (ZohoCRMConfigurationError, ZohoCRMServiceError) as exc:
        settings.last_sync_status = "error"
        settings.last_sync_error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/webhook", response_model=ZohoSyncRunResponse)
def webhook_sync(
    payload: dict[str, Any] = Body(default_factory=dict),
    db: Session = Depends(get_db),
):
    settings = get_or_create_settings(db)
    ensure_admin_settings(settings)

    try:
        result = ZohoInterpreterSyncService(db, settings).sync_webhook_payload(payload)
        created = 1 if result == "created" else 0
        updated = 1 if result == "updated" else 0
        failed = 1 if result == "failed" else 0
        return ZohoSyncRunResponse(
            synced=0 if failed else 1,
            created=created,
            updated=updated,
            failed=failed,
            message="Zoho CRM webhook processed",
        )
    except (ZohoCRMConfigurationError, ZohoCRMServiceError) as exc:
        settings.last_sync_status = "error"
        settings.last_sync_error_message = str(exc)
        db.commit()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.get("/sync-status", response_model=ZohoSyncStatusResponse)
def sync_status(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles({"Admin", "Operations"})),
):
    settings = get_or_create_settings(db)
    return ZohoSyncStatusResponse(**build_sync_status_summary(db, settings))
