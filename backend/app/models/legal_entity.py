from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class LegalEntity(Base, TimestampMixin):
    __tablename__ = "legal_entities"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    country: Mapped[str | None] = mapped_column(String(120), nullable=True)

    interpreters = relationship("Interpreter", back_populates="legal_entity")
    routing_rules = relationship("RoutingRule", back_populates="legal_entity")
    exports = relationship("Export", back_populates="legal_entity")
