from sqlalchemy import JSON, Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class ClientMappingConfig(Base, TimestampMixin):
    __tablename__ = "client_mapping_configs"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False, index=True)
    source_platform: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    report_type: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    field_aliases: Mapped[dict] = mapped_column(JSON, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    client = relationship("Client", back_populates="mapping_configs")
