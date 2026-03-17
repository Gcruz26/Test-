"""Add quantity basis and export metadata

Revision ID: 0006_exports_and_quantity_basis
Revises: 0005_routing_engine_fields
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0006_exports_and_quantity_basis"
down_revision: Union[str, None] = "0005_routing_engine_fields"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("standardized_transactions", sa.Column("quantity_basis", sa.String(length=20), nullable=True))
    op.add_column("exports", sa.Column("export_type", sa.String(length=20), nullable=False, server_default="Invoice"))


def downgrade() -> None:
    op.drop_column("exports", "export_type")
    op.drop_column("standardized_transactions", "quantity_basis")
