"""Add routing fields to standardized transactions

Revision ID: 0005_routing_engine_fields
Revises: 0004_validation_queue_engine
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_routing_engine_fields"
down_revision: Union[str, None] = "0004_validation_queue_engine"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("standardized_transactions", sa.Column("legal_entity_id", sa.Integer(), nullable=True))
    op.add_column("standardized_transactions", sa.Column("output_type", sa.String(length=20), nullable=True))
    op.add_column("standardized_transactions", sa.Column("processing_status", sa.String(length=50), nullable=True))
    op.create_foreign_key(
        "fk_standardized_transactions_legal_entity_id",
        "standardized_transactions",
        "legal_entities",
        ["legal_entity_id"],
        ["id"],
    )
    op.create_index("ix_standardized_transactions_legal_entity_id", "standardized_transactions", ["legal_entity_id"])


def downgrade() -> None:
    op.drop_index("ix_standardized_transactions_legal_entity_id", table_name="standardized_transactions")
    op.drop_constraint(
        "fk_standardized_transactions_legal_entity_id",
        "standardized_transactions",
        type_="foreignkey",
    )
    op.drop_column("standardized_transactions", "processing_status")
    op.drop_column("standardized_transactions", "output_type")
    op.drop_column("standardized_transactions", "legal_entity_id")
