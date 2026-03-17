"""Add mercury recipient id to interpreters

Revision ID: 0010_mercury_recipient_id
Revises: 0009_client_platform_ids
Create Date: 2026-03-16
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0010_mercury_recipient_id"
down_revision: Union[str, None] = "0009_client_platform_ids"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.add_column(sa.Column("mercury_recipient_id", sa.String(length=255), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.drop_column("mercury_recipient_id")
