from datetime import datetime

from pydantic import BaseModel


class ReportBase(BaseModel):
    id: int
    client_id: int
    client_name: str
    source_platform: str
    report_type: str
    period: str
    file_name: str
    file_format: str
    status: str
    created_at: datetime


class ReportListItem(ReportBase):
    raw_rows_count: int


class ReportDetail(ReportBase):
    raw_rows_count: int


class ReportUploadResponse(ReportDetail):
    message: str
