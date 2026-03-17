from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class ValidationError(Base, TimestampMixin):
    __tablename__ = "validation_errors"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    standardized_transaction_id: Mapped[int] = mapped_column(
        ForeignKey("standardized_transactions.id"),
        nullable=False,
        index=True,
    )
    field_name: Mapped[str] = mapped_column(String(120), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(80), nullable=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    standardized_transaction = relationship("StandardizedTransaction", back_populates="validation_errors")
