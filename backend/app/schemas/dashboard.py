from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class LegalEntityVolumeItem(BaseModel):
    legal_entity_name: str
    transaction_count: int
    total_amount: Decimal


class TopInterpreterItem(BaseModel):
    interpreter_name: str
    transaction_count: int
    total_amount: Decimal


class RecentUploadItem(BaseModel):
    id: int
    client_name: str
    file_name: str
    source_platform: str
    report_type: str
    status: str
    created_at: datetime


class DashboardResponse(BaseModel):
    total_reports_processed: int
    validation_errors_pending: int
    bills_ready: int
    invoices_ready: int
    volume_per_legal_entity: list[LegalEntityVolumeItem]
    top_interpreters_by_production: list[TopInterpreterItem]
    recent_uploads: list[RecentUploadItem]
