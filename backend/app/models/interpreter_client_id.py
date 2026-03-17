from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base
from app.models.base import TimestampMixin


class InterpreterClientID(Base, TimestampMixin):
    __tablename__ = "interpreter_client_ids"
    __table_args__ = (UniqueConstraint("interpreter_id", "client_id", name="uq_interpreter_client_pair"),)

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    interpreter_id: Mapped[int] = mapped_column(ForeignKey("interpreters.id"), nullable=False, index=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"), nullable=False, index=True)
    external_id: Mapped[str] = mapped_column(String(120), nullable=False)

    interpreter = relationship("Interpreter", back_populates="client_ids")
    client = relationship("Client", back_populates="interpreter_client_ids")
