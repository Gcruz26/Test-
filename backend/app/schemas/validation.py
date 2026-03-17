from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel


class ValidationQueueItem(BaseModel):
    validation_error_id: int
    standardized_transaction_id: int
    uploaded_file_id: int
    row_number: int | None
    error_type: str
    description: str
    field_name: str
    report_name: str
    client_name: str
    interpreter_name: str | None
    external_interpreter_id: str | None
    service_date: date | None
    minutes: Decimal | None
    hours: Decimal | None
    rate: Decimal | None
    amount: Decimal | None
    location: str | None
    currency: str | None
    created_at: datetime


class StandardizedTransactionUpdate(BaseModel):
    service_date: date | None = None
    interpreter_name: str | None = None
    external_interpreter_id: str | None = None
    minutes: Decimal | None = None
    hours: Decimal | None = None
    rate: Decimal | None = None
    amount: Decimal | None = None
    location: str | None = None
    currency: str | None = None


class ReprocessResponse(BaseModel):
    standardized_transaction_id: int
    validation_error_count: int
    status: str
