"""Add Zoho CRM sync support

Revision ID: 0008_zoho_crm_sync
Revises: 0007_interpreter_profiles
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0008_zoho_crm_sync"
down_revision: Union[str, None] = "0007_interpreter_profiles"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.add_column(sa.Column("zoho_contact_id", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("sync_status", sa.String(length=40), nullable=True))
        batch_op.add_column(sa.Column("sync_error_message", sa.Text(), nullable=True))
        batch_op.create_index("ix_interpreters_zoho_contact_id", ["zoho_contact_id"], unique=True)
        batch_op.create_index("ix_interpreters_sync_status", ["sync_status"], unique=False)

    op.execute(sa.text("UPDATE interpreters SET sync_status = 'manual' WHERE sync_status IS NULL"))

    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.alter_column("sync_status", existing_type=sa.String(length=40), nullable=False)

    op.create_table(
        "zoho_crm_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("base_url", sa.String(length=255), nullable=False),
        sa.Column("client_id", sa.String(length=255), nullable=False),
        sa.Column("client_secret", sa.String(length=255), nullable=False),
        sa.Column("refresh_token", sa.Text(), nullable=False),
        sa.Column("module_name", sa.String(length=120), nullable=False, server_default="Contacts"),
        sa.Column("field_mapping", sa.JSON(), nullable=False),
        sa.Column("last_full_sync_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_sync_status", sa.String(length=40), nullable=False, server_default="not_configured"),
        sa.Column("last_sync_error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_zoho_crm_settings_id", "zoho_crm_settings", ["id"])

    op.create_table(
        "integration_logs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("integration_name", sa.String(length=80), nullable=False),
        sa.Column("level", sa.String(length=20), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("detail", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_integration_logs_id", "integration_logs", ["id"])
    op.create_index("ix_integration_logs_integration_name", "integration_logs", ["integration_name"])
    op.create_index("ix_integration_logs_level", "integration_logs", ["level"])
    op.create_index("ix_integration_logs_event_type", "integration_logs", ["event_type"])


def downgrade() -> None:
    op.drop_index("ix_integration_logs_event_type", table_name="integration_logs")
    op.drop_index("ix_integration_logs_level", table_name="integration_logs")
    op.drop_index("ix_integration_logs_integration_name", table_name="integration_logs")
    op.drop_index("ix_integration_logs_id", table_name="integration_logs")
    op.drop_table("integration_logs")

    op.drop_index("ix_zoho_crm_settings_id", table_name="zoho_crm_settings")
    op.drop_table("zoho_crm_settings")

    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.drop_index("ix_interpreters_sync_status")
        batch_op.drop_index("ix_interpreters_zoho_contact_id")
        batch_op.drop_column("sync_error_message")
        batch_op.drop_column("sync_status")
        batch_op.drop_column("last_synced_at")
        batch_op.drop_column("zoho_contact_id")
