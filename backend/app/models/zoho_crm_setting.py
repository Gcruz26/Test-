from datetime import datetime

from sqlalchemy import JSON, DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base
from app.models.base import TimestampMixin


class ZohoCRMSetting(Base, TimestampMixin):
    __tablename__ = "zoho_crm_settings"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    base_url: Mapped[str] = mapped_column(String(255), nullable=False)
    client_id: Mapped[str] = mapped_column(String(255), nullable=False)
    client_secret: Mapped[str] = mapped_column(String(255), nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    module_name: Mapped[str] = mapped_column(String(120), nullable=False, default="Contacts")
    field_mapping: Mapped[dict] = mapped_column(JSON, nullable=False)
    last_full_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_sync_status: Mapped[str] = mapped_column(String(40), nullable=False, default="not_configured")
    last_sync_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
