from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class Export(Base, TimestampMixin):
    __tablename__ = "exports"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    legal_entity_id: Mapped[int] = mapped_column(ForeignKey("legal_entities.id"), nullable=False, index=True)
    exported_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    export_type: Mapped[str] = mapped_column(String(20), nullable=False, default="Invoice")
    storage_path: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="generated")

    legal_entity = relationship("LegalEntity", back_populates="exports")
