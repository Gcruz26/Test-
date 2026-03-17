from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


DEFAULT_FIELD_MAPPING = {
    "employee_id": "Emplyee_ID",
    "full_name": "Full_Name",
    "email": "Email",
    "language": "Language",
    "location": "Service Location",
    "country": "Mailing_Country",
    "associated_client": "Client",
    "propio_interpreter_id": "Propio_ID",
    "cloudbreak_id": "CloudBreak_ID",
    "big_interpreter_id": "BIG_ID",
    "payment_frequency": "Payment_Type",
    "rate": "Agreed_Rate",
    "status": "Stage",
}


class ZohoCRMSettingsBase(BaseModel):
    base_url: str = Field(min_length=1, max_length=255)
    client_id: str = Field(min_length=1, max_length=255)
    client_secret: str = Field(min_length=1, max_length=255)
    refresh_token: str = Field(min_length=1)
    module_name: str = Field(min_length=1, max_length=120)
    field_mapping: dict[str, str]

    @model_validator(mode="after")
    def validate_mapping(self) -> "ZohoCRMSettingsBase":
        missing = [key for key in DEFAULT_FIELD_MAPPING if not self.field_mapping.get(key)]
        if missing:
            raise ValueError(f"Field mapping is missing required keys: {', '.join(missing)}")
        return self


class ZohoCRMSettingsUpdate(ZohoCRMSettingsBase):
    pass


class ZohoCRMSettingsResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int | None = None
    base_url: str
    client_id: str
    client_secret: str
    refresh_token: str
    module_name: str
    field_mapping: dict[str, str]
    last_full_sync_at: datetime | None = None
    last_sync_status: str = "not_configured"
    last_sync_error_message: str | None = None


class IntegrationLogItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    integration_name: str
    level: str
    event_type: str
    message: str
    detail: dict | None = None
    created_at: datetime


class ZohoSyncRunResponse(BaseModel):
    synced: int
    created: int
    updated: int
    failed: int
    message: str


class ZohoSyncStatusResponse(BaseModel):
    configured: bool
    last_full_sync_at: datetime | None = None
    last_sync_status: str
    last_sync_error_message: str | None = None
    synced_records: int
    error_records: int
    recent_logs: list[IntegrationLogItem]
