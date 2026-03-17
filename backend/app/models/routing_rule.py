from sqlalchemy import Boolean, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class RoutingRule(Base, TimestampMixin):
    __tablename__ = "routing_rules"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    legal_entity_id: Mapped[int] = mapped_column(ForeignKey("legal_entities.id"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False, index=True)
    rule_name: Mapped[str] = mapped_column(String(120), nullable=False)
    conditions: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    destination: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    legal_entity = relationship("LegalEntity", back_populates="routing_rules")
    client = relationship("Client", back_populates="routing_rules")
