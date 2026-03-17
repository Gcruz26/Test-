from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class Client(Base, TimestampMixin):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    code: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)

    interpreter_client_ids = relationship("InterpreterClientID", back_populates="client")
    mapping_configs = relationship("ClientMappingConfig", back_populates="client")
    routing_rules = relationship("RoutingRule", back_populates="client")
    uploaded_files = relationship("UploadedFile", back_populates="client")
