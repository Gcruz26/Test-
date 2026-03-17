"""Add transformation config and standardized transaction fields

Revision ID: 0003_transform_engine_schema
Revises: 0002_uploaded_file_metadata
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "0003_transform_engine_schema"
down_revision: Union[str, None] = "0002_uploaded_file_metadata"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "client_mapping_configs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("source_platform", sa.String(length=120), nullable=True),
        sa.Column("report_type", sa.String(length=120), nullable=True),
        sa.Column("field_aliases", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_client_mapping_configs_id", "client_mapping_configs", ["id"])
    op.create_index("ix_client_mapping_configs_client_id", "client_mapping_configs", ["client_id"])
    op.create_index("ix_client_mapping_configs_source_platform", "client_mapping_configs", ["source_platform"])
    op.create_index("ix_client_mapping_configs_report_type", "client_mapping_configs", ["report_type"])

    op.add_column("standardized_transactions", sa.Column("service_date", sa.Date(), nullable=True))
    op.add_column("standardized_transactions", sa.Column("interpreter_name", sa.String(length=255), nullable=True))
    op.add_column(
        "standardized_transactions",
        sa.Column("external_interpreter_id", sa.String(length=120), nullable=True),
    )
    op.add_column("standardized_transactions", sa.Column("minutes", sa.Numeric(10, 2), nullable=True))
    op.add_column("standardized_transactions", sa.Column("hours", sa.Numeric(10, 2), nullable=True))
    op.add_column("standardized_transactions", sa.Column("rate", sa.Numeric(12, 4), nullable=True))
    op.add_column("standardized_transactions", sa.Column("location", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("standardized_transactions", "location")
    op.drop_column("standardized_transactions", "rate")
    op.drop_column("standardized_transactions", "hours")
    op.drop_column("standardized_transactions", "minutes")
    op.drop_column("standardized_transactions", "external_interpreter_id")
    op.drop_column("standardized_transactions", "interpreter_name")
    op.drop_column("standardized_transactions", "service_date")

    op.drop_index("ix_client_mapping_configs_report_type", table_name="client_mapping_configs")
    op.drop_index("ix_client_mapping_configs_source_platform", table_name="client_mapping_configs")
    op.drop_index("ix_client_mapping_configs_client_id", table_name="client_mapping_configs")
    op.drop_index("ix_client_mapping_configs_id", table_name="client_mapping_configs")
    op.drop_table("client_mapping_configs")
