from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.enums import InterpreterStatus, PaymentFrequency


class InterpreterBase(BaseModel):
    employee_id: str = Field(min_length=1, max_length=64)
    full_name: str = Field(min_length=1, max_length=255)
    email: EmailStr
    language: str = Field(min_length=1, max_length=120)
    location: str = Field(min_length=1, max_length=120)
    country: str = Field(min_length=1, max_length=120)
    client_id: int = Field(gt=0)
    payment_frequency: PaymentFrequency
    rate: Decimal = Field(ge=0)
    status: InterpreterStatus
    propio_interpreter_id: str = ""
    big_interpreter_id: str = ""
    equiti_voyce_id: str = ""
    equiti_martti_id: str = ""
    mercury_recipient_id: str = ""


class InterpreterCreate(InterpreterBase):
    pass


class InterpreterUpdate(InterpreterBase):
    pass


class InterpreterListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    employee_id: str
    full_name: str
    email: EmailStr
    language: str
    location: str
    country: str
    associated_client_id: int
    associated_client_name: str
    payment_frequency: PaymentFrequency
    rate: Decimal
    status: InterpreterStatus
    propio_interpreter_id: str = ""
    big_interpreter_id: str = ""
    equiti_voyce_id: str = ""
    equiti_martti_id: str = ""
    mercury_recipient_id: str = ""
    zoho_contact_id: str | None = None
    last_synced_at: datetime | None = None
    sync_status: str
    sync_error_message: str | None = None
    created_at: datetime


class InterpreterClientOption(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


class InterpreterMetaResponse(BaseModel):
    clients: list[InterpreterClientOption]
    payment_frequency_options: list[PaymentFrequency]
    status_options: list[InterpreterStatus]
