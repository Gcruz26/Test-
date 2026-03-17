from __future__ import annotations

import logging
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from typing import Any

import requests
from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.client import Client
from app.models.enums import InterpreterStatus, PaymentFrequency
from app.models.integration_log import IntegrationLog
from app.models.interpreter import Interpreter
from app.models.zoho_crm_setting import ZohoCRMSetting
from app.schemas.zoho_integration import DEFAULT_FIELD_MAPPING

logger = logging.getLogger(__name__)
FULL_SYNC_PROGRESS_INTERVAL = 25


class ZohoCRMConfigurationError(Exception):
    pass


class ZohoCRMServiceError(Exception):
    pass


def get_or_create_settings(db: Session) -> ZohoCRMSetting:
    settings = db.query(ZohoCRMSetting).order_by(ZohoCRMSetting.id.asc()).first()
    if settings:
        return settings

    settings = ZohoCRMSetting(
        base_url="https://www.zohoapis.com/crm/v8",
        client_id="",
        client_secret="",
        refresh_token="",
        module_name="Contacts",
        field_mapping=DEFAULT_FIELD_MAPPING,
        last_sync_status="not_configured",
    )
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def log_sync_event(db: Session, level: str, event_type: str, message: str, detail: dict[str, Any] | None = None) -> None:
    logger.log(getattr(logging, level.upper(), logging.INFO), "%s: %s", event_type, message)
    db.add(
        IntegrationLog(
            integration_name="zoho_crm",
            level=level.upper(),
            event_type=event_type,
            message=message,
            detail=detail,
        )
    )
    db.commit()


def build_sync_status_summary(db: Session, settings: ZohoCRMSetting) -> dict[str, Any]:
    synced_records = db.query(func.count(Interpreter.id)).filter(Interpreter.sync_status == "synced").scalar() or 0
    error_records = db.query(func.count(Interpreter.id)).filter(Interpreter.sync_status == "error").scalar() or 0
    recent_logs = (
        db.query(IntegrationLog)
        .filter(IntegrationLog.integration_name == "zoho_crm")
        .order_by(IntegrationLog.created_at.desc())
        .limit(10)
        .all()
    )
    configured = all([settings.base_url, settings.client_id, settings.client_secret, settings.refresh_token, settings.module_name])

    return {
        "configured": configured,
        "last_full_sync_at": settings.last_full_sync_at,
        "last_sync_status": settings.last_sync_status,
        "last_sync_error_message": settings.last_sync_error_message,
        "synced_records": int(synced_records),
        "error_records": int(error_records),
        "recent_logs": recent_logs,
    }


class ZohoCRMClient:
    def __init__(self, settings: ZohoCRMSetting):
        self.settings = settings
        self.base_url = settings.base_url.rstrip("/")
        self.module_name = settings.module_name.strip()
        self.field_mapping = {**DEFAULT_FIELD_MAPPING, **(settings.field_mapping or {})}
        self.fields_param = self._build_fields_param()
        self.access_token = self._refresh_access_token()

    def _build_fields_param(self) -> str:
        fields = ["id"]
        for value in self.field_mapping.values():
            field_name = str(value or "").strip()
            if field_name and field_name not in fields:
                fields.append(field_name)
        return ",".join(fields)

    def _refresh_access_token(self) -> str:
        missing = [
            key
            for key, value in {
                "base_url": self.settings.base_url,
                "client_id": self.settings.client_id,
                "client_secret": self.settings.client_secret,
                "refresh_token": self.settings.refresh_token,
                "module_name": self.settings.module_name,
            }.items()
            if not value
        ]
        if missing:
            raise ZohoCRMConfigurationError(f"Missing Zoho CRM settings: {', '.join(missing)}")

        token_url = _infer_token_url(self.base_url)
        response = requests.post(
            token_url,
            data={
                "refresh_token": self.settings.refresh_token,
                "client_id": self.settings.client_id,
                "client_secret": self.settings.client_secret,
                "grant_type": "refresh_token",
            },
            timeout=30,
        )
        if response.status_code >= 400:
            raise ZohoCRMServiceError(f"Failed to refresh Zoho CRM access token: {response.text}")

        payload = response.json()
        token = payload.get("access_token")
        if not token:
            raise ZohoCRMServiceError("Zoho CRM token response did not include access_token")
        return str(token)

    def fetch_contacts(self) -> list[dict[str, Any]]:
        records: list[dict[str, Any]] = []
        page = 1
        page_token: str | None = None

        while True:
            params: dict[str, Any] = {"per_page": 200, "fields": self.fields_param}
            if page_token:
                params["page_token"] = page_token
            else:
                params["page"] = page

            payload = self._get(f"{self.base_url}/{self.module_name}", params=params)
            batch = payload.get("data", [])
            records.extend(batch)
            info = payload.get("info", {})
            page_token = str(info.get("next_page_token") or "").strip() or None
            if not info.get("more_records"):
                break
            if not page_token:
                page += 1

        return records

    def fetch_contact(self, zoho_contact_id: str) -> dict[str, Any]:
        payload = self._get(
            f"{self.base_url}/{self.module_name}/{zoho_contact_id}",
            params={"fields": self.fields_param},
        )
        records = payload.get("data", [])
        if not records:
            raise ZohoCRMServiceError(f"Zoho CRM contact {zoho_contact_id} was not found")
        return records[0]

    def _get(self, url: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
        response = requests.get(
            url,
            params=params,
            headers={"Authorization": f"Zoho-oauthtoken {self.access_token}"},
            timeout=30,
        )
        if response.status_code >= 400:
            raise ZohoCRMServiceError(f"Zoho CRM request failed: {response.text}")
        return response.json()


class ZohoInterpreterSyncService:
    def __init__(self, db: Session, settings: ZohoCRMSetting):
        self.db = db
        self.settings = settings
        self.client = ZohoCRMClient(settings)

    def full_sync(self) -> dict[str, int]:
        self.settings.last_sync_status = "running"
        self.settings.last_sync_error_message = None
        self.db.commit()

        log_sync_event(self.db, "info", "full_sync_started", "Zoho CRM full sync started")
        records = self.client.fetch_contacts()
        summary = {"synced": 0, "created": 0, "updated": 0, "failed": 0}
        total_records = len(records)

        log_sync_event(
            self.db,
            "info",
            "full_sync_contacts_fetched",
            "Zoho CRM contacts fetched for full sync",
            {"total_records": total_records},
        )

        for index, record in enumerate(records, start=1):
            result = self._sync_record(record)
            summary["synced"] += 1 if result != "failed" else 0
            summary["created"] += 1 if result == "created" else 0
            summary["updated"] += 1 if result == "updated" else 0
            summary["failed"] += 1 if result == "failed" else 0

            if index % FULL_SYNC_PROGRESS_INTERVAL == 0 or index == total_records:
                log_sync_event(
                    self.db,
                    "info",
                    "full_sync_progress",
                    f"Zoho CRM full sync progress: {index}/{total_records}",
                    {
                        "processed": index,
                        "total_records": total_records,
                        **summary,
                    },
                )

        self.settings.last_full_sync_at = datetime.now(timezone.utc)
        self.settings.last_sync_status = "success" if summary["failed"] == 0 else "partial_failure"
        self.settings.last_sync_error_message = None if summary["failed"] == 0 else f"{summary['failed']} record(s) failed"
        self.db.commit()
        log_sync_event(
            self.db,
            "info",
            "full_sync",
            "Zoho CRM full sync completed",
            {
                "total_records": total_records,
                **summary,
            },
        )
        return summary

    def sync_contact_by_id(self, zoho_contact_id: str) -> str:
        record = self.client.fetch_contact(zoho_contact_id)
        result = self._sync_record(record)
        log_sync_event(self.db, "info", "webhook_sync", "Zoho CRM single-record sync completed", {"zoho_contact_id": zoho_contact_id, "result": result})
        return result

    def sync_webhook_payload(self, payload: dict[str, Any]) -> str:
        zoho_contact_id = _extract_contact_id(payload)
        if zoho_contact_id:
            return self.sync_contact_by_id(zoho_contact_id)

        record = _extract_embedded_record(payload)
        if not record:
            raise ZohoCRMServiceError("Webhook payload did not include a Zoho contact id or record data")
        result = self._sync_record(record)
        log_sync_event(self.db, "info", "webhook_sync", "Zoho CRM embedded-record webhook processed", {"result": result})
        return result

    def _sync_record(self, record: dict[str, Any]) -> str:
        try:
            normalized = self._map_record(record)
            interpreter = (
                self.db.query(Interpreter)
                .filter(
                    (Interpreter.zoho_contact_id == normalized["zoho_contact_id"])
                    | (Interpreter.employee_id == normalized["employee_id"])
                    | (Interpreter.email == normalized["email"])
                    | (Interpreter.propio_interpreter_id == normalized["propio_interpreter_id"])
                    | (Interpreter.big_interpreter_id == normalized["big_interpreter_id"])
                    | (Interpreter.big_interpreter_id == normalized["cloudbreak_id"])
                )
                .first()
            )
            created = interpreter is None
            if interpreter is None:
                interpreter = Interpreter(sync_status="pending")
                self.db.add(interpreter)

            client = self._get_or_create_client(normalized["associated_client"])

            interpreter.employee_id = normalized["employee_id"]
            interpreter.full_name = normalized["full_name"]
            interpreter.email = normalized["email"]
            interpreter.language = normalized["language"]
            interpreter.location = normalized["location"]
            interpreter.country = normalized["country"]
            interpreter.client_id = client.id
            interpreter.payment_frequency = normalized["payment_frequency"]
            interpreter.rate = normalized["rate"]
            interpreter.status = normalized["status"]
            interpreter.propio_interpreter_id = normalized["propio_interpreter_id"] or interpreter.propio_interpreter_id
            interpreter.big_interpreter_id = normalized["big_interpreter_id"] or normalized["cloudbreak_id"] or interpreter.big_interpreter_id
            interpreter.zoho_contact_id = normalized["zoho_contact_id"]
            interpreter.last_synced_at = datetime.now(timezone.utc)
            interpreter.sync_status = "synced"
            interpreter.sync_error_message = None

            self.db.commit()
            self.db.refresh(interpreter)
            return "created" if created else "updated"
        except Exception as exc:
            self.db.rollback()
            self._record_sync_error(record, str(exc))
            return "failed"

    def _record_sync_error(self, record: dict[str, Any], message: str) -> None:
        zoho_contact_id = str(record.get("id") or "")
        interpreter = None
        if zoho_contact_id:
            interpreter = self.db.query(Interpreter).filter(Interpreter.zoho_contact_id == zoho_contact_id).first()
        if interpreter:
            interpreter.sync_status = "error"
            interpreter.sync_error_message = message
            interpreter.last_synced_at = datetime.now(timezone.utc)
            self.db.commit()
        self.settings.last_sync_status = "error"
        self.settings.last_sync_error_message = message
        self.db.commit()
        log_sync_event(
            self.db,
            "error",
            "sync_failure",
            "Zoho CRM interpreter sync failed",
            {"zoho_contact_id": zoho_contact_id, "message": message},
        )

    def _map_record(self, record: dict[str, Any]) -> dict[str, Any]:
        field_mapping = {**DEFAULT_FIELD_MAPPING, **(self.settings.field_mapping or {})}

        zoho_contact_id = str(record.get("id") or "").strip()
        if not zoho_contact_id:
            raise ZohoCRMServiceError("Zoho CRM record is missing id")

        mapped = {
            "zoho_contact_id": zoho_contact_id,
            "employee_id": _required_string(_value_from_record(record, field_mapping["employee_id"]), "Employee ID"),
            "full_name": _required_string(_value_from_record(record, field_mapping["full_name"]), "Full Name"),
            "email": _required_string(_value_from_record(record, field_mapping["email"]), "Email"),
            "language": _optional_string(_value_from_record(record, field_mapping["language"])),
            "location": _optional_string(_value_from_record(record, field_mapping["location"])),
            "country": _optional_string(_value_from_record(record, field_mapping["country"])),
            "associated_client": _required_string(_value_from_record(record, field_mapping["associated_client"]), "Associated Client"),
            "propio_interpreter_id": _optional_string(_value_from_record(record, field_mapping["propio_interpreter_id"])),
            "cloudbreak_id": _optional_string(_value_from_record(record, field_mapping["cloudbreak_id"])),
            "big_interpreter_id": _optional_string(_value_from_record(record, field_mapping["big_interpreter_id"])),
            "payment_frequency": _parse_payment_frequency(_value_from_record(record, field_mapping["payment_frequency"])),
            "rate": _parse_rate(_value_from_record(record, field_mapping["rate"])),
            "status": _parse_status(_value_from_record(record, field_mapping["status"])),
        }
        return mapped

    def _get_or_create_client(self, client_name: str) -> Client:
        client = self.db.query(Client).filter(func.lower(Client.name) == client_name.lower()).first()
        if client:
            return client

        client = Client(name=client_name)
        self.db.add(client)
        self.db.flush()
        return client


def ensure_admin_settings(settings: ZohoCRMSetting) -> None:
    missing = [
        key
        for key in ["base_url", "client_id", "client_secret", "refresh_token", "module_name"]
        if not getattr(settings, key)
    ]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Zoho CRM settings are incomplete: {', '.join(missing)}",
        )


def _infer_token_url(base_url: str) -> str:
    if ".zohoapis.eu" in base_url:
        return "https://accounts.zoho.eu/oauth/v2/token"
    if ".zohoapis.in" in base_url:
        return "https://accounts.zoho.in/oauth/v2/token"
    if ".zohoapis.com.au" in base_url:
        return "https://accounts.zoho.com.au/oauth/v2/token"
    if ".zohoapis.jp" in base_url:
        return "https://accounts.zoho.jp/oauth/v2/token"
    if ".zohoapis.sa" in base_url:
        return "https://accounts.zoho.sa/oauth/v2/token"
    if ".zohoapis.ca" in base_url:
        return "https://accounts.zohocloud.ca/oauth/v2/token"
    return "https://accounts.zoho.com/oauth/v2/token"


def _value_from_record(record: dict[str, Any], field_name: str) -> Any:
    value = record.get(field_name)
    if isinstance(value, dict):
        return value.get("name") or value.get("value") or value.get("id")
    if isinstance(value, list):
        flattened = []
        for item in value:
            if isinstance(item, dict):
                candidate = item.get("name") or item.get("value") or item.get("id")
                if candidate:
                    flattened.append(str(candidate))
            elif item not in (None, ""):
                flattened.append(str(item))
        return flattened[0] if flattened else None
    return value


def _required_string(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ZohoCRMServiceError(f"{label} is missing in Zoho CRM record")
    return text


def _optional_string(value: Any) -> str:
    return str(value or "").strip()


def _parse_payment_frequency(value: Any) -> PaymentFrequency:
    normalized = str(value or "").strip().lower()
    if "weekly" in normalized and "bi" not in normalized:
        return PaymentFrequency.WEEKLY
    if "biweekly" in normalized or "bi-weekly" in normalized:
        return PaymentFrequency.BIWEEKLY
    if "monthly" in normalized:
        return PaymentFrequency.MONTHLY
    raise ZohoCRMServiceError(f"Unsupported payment frequency: {value}")


def _parse_status(value: Any) -> InterpreterStatus:
    normalized = str(value or "").strip().lower()
    if normalized == "active":
        return InterpreterStatus.ACTIVE
    if normalized in {"hired", "fully onboarded", "interpreter ready for production"}:
        return InterpreterStatus.FULLY_ONBOARDED
    if normalized in {"inactive", "deactivated", "deactived", "inactive / not moving forward", "failed onboarding"}:
        return InterpreterStatus.DEACTIVED
    if normalized == "terminated":
        return InterpreterStatus.TERMINATED
    if normalized == "resigned":
        return InterpreterStatus.RESIGNED
    if normalized in {
        "on hold",
        "on_hold",
        "onboarding",
        "recruiting",
        "admin onboarding",
        "training",
        "candidate language assessment",
        "candidate id/background verification",
        "candidate interview",
        "contract & payment setup (interpreter)",
        "interpreter system specs review",
        "requested",
        "id verification",
        "training required (client/tier)",
    }:
        return InterpreterStatus.ON_HOLD
    raise ZohoCRMServiceError(f"Unsupported interpreter status: {value}")


def _parse_rate(value: Any) -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ZohoCRMServiceError(f"Invalid rate value: {value}")


def _extract_contact_id(payload: dict[str, Any]) -> str | None:
    candidates = [
        payload.get("zoho_contact_id"),
        payload.get("contact_id"),
        payload.get("id"),
        (payload.get("data") or [{}])[0].get("id") if isinstance(payload.get("data"), list) and payload.get("data") else None,
        (payload.get("records") or [{}])[0].get("id") if isinstance(payload.get("records"), list) and payload.get("records") else None,
    ]
    for candidate in candidates:
        if candidate:
            return str(candidate)
    return None


def _extract_embedded_record(payload: dict[str, Any]) -> dict[str, Any] | None:
    if isinstance(payload.get("record"), dict):
        return payload["record"]
    if isinstance(payload.get("data"), list) and payload["data"]:
        first = payload["data"][0]
        if isinstance(first, dict):
            return first
    if isinstance(payload.get("data"), dict):
        return payload["data"]
    return None
