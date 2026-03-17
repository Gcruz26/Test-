from sqlalchemy import JSON, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class RawRow(Base, TimestampMixin):
    __tablename__ = "raw_rows"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    uploaded_file_id: Mapped[int] = mapped_column(ForeignKey("uploaded_files.id"), nullable=False, index=True)
    row_number: Mapped[int] = mapped_column(Integer, nullable=False)
    raw_payload: Mapped[dict] = mapped_column(JSON, nullable=False)
    parse_status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")

    uploaded_file = relationship("UploadedFile", back_populates="raw_rows")
