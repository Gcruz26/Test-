from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin
from app.models.enums import InterpreterStatus, PaymentFrequency

enum_values = lambda enum_class: [item.value for item in enum_class]


class Interpreter(Base, TimestampMixin):
    __tablename__ = "interpreters"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    legal_entity_id: Mapped[int | None] = mapped_column(ForeignKey("legal_entities.id"), nullable=True, index=True)
    client_id: Mapped[int | None] = mapped_column(ForeignKey("clients.id"), nullable=True, index=True)
    employee_id: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    full_name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    first_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    last_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    language: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    location: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    country: Mapped[str] = mapped_column(String(120), nullable=False, index=True)
    payment_frequency: Mapped[PaymentFrequency] = mapped_column(
        Enum(PaymentFrequency, native_enum=False, values_callable=enum_values),
        nullable=False,
    )
    rate: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    status: Mapped[InterpreterStatus] = mapped_column(
        Enum(InterpreterStatus, native_enum=False, values_callable=enum_values),
        nullable=False,
    )
    propio_interpreter_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    big_interpreter_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    equiti_voyce_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    equiti_martti_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    mercury_recipient_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    zoho_contact_id: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True, index=True)
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    sync_status: Mapped[str] = mapped_column(String(40), nullable=False, default="manual", index=True)
    sync_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    legal_entity = relationship("LegalEntity", back_populates="interpreters")
    client = relationship("Client")
    client_ids = relationship("InterpreterClientID", back_populates="interpreter")
    standardized_transactions = relationship("StandardizedTransaction", back_populates="interpreter")
