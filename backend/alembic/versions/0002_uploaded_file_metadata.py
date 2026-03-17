"""Add report metadata columns to uploaded_files

Revision ID: 0002_uploaded_file_metadata
Revises: 0001_initial_schema
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "0002_uploaded_file_metadata"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "uploaded_files",
        sa.Column("file_format", sa.String(length=20), nullable=False, server_default=sa.text("'csv'")),
    )
    op.add_column(
        "uploaded_files",
        sa.Column("source_platform", sa.String(length=120), nullable=False, server_default=sa.text("'unknown'")),
    )
    op.add_column(
        "uploaded_files",
        sa.Column("report_type", sa.String(length=120), nullable=False, server_default=sa.text("'unknown'")),
    )
    op.add_column(
        "uploaded_files",
        sa.Column("period", sa.String(length=120), nullable=False, server_default=sa.text("'unknown'")),
    )


def downgrade() -> None:
    op.drop_column("uploaded_files", "period")
    op.drop_column("uploaded_files", "report_type")
    op.drop_column("uploaded_files", "source_platform")
    op.drop_column("uploaded_files", "file_format")
