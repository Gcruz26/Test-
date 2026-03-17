from datetime import date
from decimal import Decimal

from sqlalchemy import Date, ForeignKey, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class StandardizedTransaction(Base, TimestampMixin):
    __tablename__ = "standardized_transactions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    uploaded_file_id: Mapped[int] = mapped_column(ForeignKey("uploaded_files.id"), nullable=False, index=True)
    raw_row_id: Mapped[int | None] = mapped_column(ForeignKey("raw_rows.id"), nullable=True, index=True)
    row_number: Mapped[int | None] = mapped_column(nullable=True)
    interpreter_id: Mapped[int | None] = mapped_column(ForeignKey("interpreters.id"), nullable=True, index=True)
    legal_entity_id: Mapped[int | None] = mapped_column(ForeignKey("legal_entities.id"), nullable=True, index=True)

    service_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    interpreter_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_interpreter_id: Mapped[str | None] = mapped_column(String(120), nullable=True)
    minutes: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    hours: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    rate: Mapped[Decimal | None] = mapped_column(Numeric(12, 4), nullable=True)
    amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    location: Mapped[str | None] = mapped_column(String(255), nullable=True)
    currency: Mapped[str | None] = mapped_column(String(10), nullable=True)
    quantity_basis: Mapped[str | None] = mapped_column(String(20), nullable=True)
    output_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    processing_status: Mapped[str | None] = mapped_column(String(50), nullable=True)

    transaction_code: Mapped[str | None] = mapped_column(String(100), nullable=True)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="pending")

    uploaded_file = relationship("UploadedFile", back_populates="standardized_transactions")
    interpreter = relationship("Interpreter", back_populates="standardized_transactions")
    legal_entity = relationship("LegalEntity")
    raw_row = relationship("RawRow")
    validation_errors = relationship(
        "ValidationError",
        back_populates="standardized_transaction",
        cascade="all, delete-orphan",
    )
