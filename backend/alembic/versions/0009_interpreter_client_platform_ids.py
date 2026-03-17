"""Add interpreter client platform id fields

Revision ID: 0009_client_platform_ids
Revises: 0008_zoho_crm_sync
Create Date: 2026-03-13
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0009_client_platform_ids"
down_revision: Union[str, None] = "0008_zoho_crm_sync"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.add_column(sa.Column("propio_interpreter_id", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("big_interpreter_id", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("equiti_voyce_id", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("equiti_martti_id", sa.String(length=120), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.drop_column("equiti_martti_id")
        batch_op.drop_column("equiti_voyce_id")
        batch_op.drop_column("big_interpreter_id")
        batch_op.drop_column("propio_interpreter_id")
