"""Initial schema for Alfa Processing Platform

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-03-09
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


user_role_enum = sa.Enum("Admin", "Finance", "Operations", "Viewer", name="user_role")
user_role_enum_column = postgresql.ENUM(
    "Admin",
    "Finance",
    "Operations",
    "Viewer",
    name="user_role",
    create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    user_role_enum.create(bind, checkfirst=True)

    op.create_table(
        "legal_entities",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False, unique=True),
        sa.Column("country", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_legal_entities_id", "legal_entities", ["id"])

    op.create_table(
        "clients",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False, unique=True),
        sa.Column("code", sa.String(length=64), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_clients_id", "clients", ["id"])

    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("role", user_role_enum_column, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_users_id", "users", ["id"])
    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.create_table(
        "interpreters",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("legal_entity_id", sa.Integer(), sa.ForeignKey("legal_entities.id"), nullable=False),
        sa.Column("first_name", sa.String(length=120), nullable=False),
        sa.Column("last_name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_interpreters_id", "interpreters", ["id"])
    op.create_index("ix_interpreters_legal_entity_id", "interpreters", ["legal_entity_id"])

    op.create_table(
        "interpreter_client_ids",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("interpreter_id", sa.Integer(), sa.ForeignKey("interpreters.id"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("external_id", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("interpreter_id", "client_id", name="uq_interpreter_client_pair"),
    )
    op.create_index("ix_interpreter_client_ids_id", "interpreter_client_ids", ["id"])
    op.create_index("ix_interpreter_client_ids_interpreter_id", "interpreter_client_ids", ["interpreter_id"])
    op.create_index("ix_interpreter_client_ids_client_id", "interpreter_client_ids", ["client_id"])

    op.create_table(
        "routing_rules",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("legal_entity_id", sa.Integer(), sa.ForeignKey("legal_entities.id"), nullable=False),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("rule_name", sa.String(length=120), nullable=False),
        sa.Column("conditions", sa.String(length=1000), nullable=True),
        sa.Column("destination", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_routing_rules_id", "routing_rules", ["id"])
    op.create_index("ix_routing_rules_legal_entity_id", "routing_rules", ["legal_entity_id"])
    op.create_index("ix_routing_rules_client_id", "routing_rules", ["client_id"])

    op.create_table(
        "uploaded_files",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("client_id", sa.Integer(), sa.ForeignKey("clients.id"), nullable=False),
        sa.Column("uploaded_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'uploaded'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_uploaded_files_id", "uploaded_files", ["id"])
    op.create_index("ix_uploaded_files_client_id", "uploaded_files", ["client_id"])
    op.create_index("ix_uploaded_files_uploaded_by_user_id", "uploaded_files", ["uploaded_by_user_id"])

    op.create_table(
        "raw_rows",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("uploaded_file_id", sa.Integer(), sa.ForeignKey("uploaded_files.id"), nullable=False),
        sa.Column("row_number", sa.Integer(), nullable=False),
        sa.Column("raw_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("parse_status", sa.Text(), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_raw_rows_id", "raw_rows", ["id"])
    op.create_index("ix_raw_rows_uploaded_file_id", "raw_rows", ["uploaded_file_id"])

    op.create_table(
        "standardized_transactions",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("uploaded_file_id", sa.Integer(), sa.ForeignKey("uploaded_files.id"), nullable=False),
        sa.Column("interpreter_id", sa.Integer(), sa.ForeignKey("interpreters.id"), nullable=True),
        sa.Column("transaction_code", sa.String(length=100), nullable=True),
        sa.Column("amount", sa.Numeric(12, 2), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_standardized_transactions_id", "standardized_transactions", ["id"])
    op.create_index("ix_standardized_transactions_uploaded_file_id", "standardized_transactions", ["uploaded_file_id"])
    op.create_index("ix_standardized_transactions_interpreter_id", "standardized_transactions", ["interpreter_id"])

    op.create_table(
        "validation_errors",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "standardized_transaction_id",
            sa.Integer(),
            sa.ForeignKey("standardized_transactions.id"),
            nullable=False,
        ),
        sa.Column("field_name", sa.String(length=120), nullable=False),
        sa.Column("error_code", sa.String(length=80), nullable=True),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("is_resolved", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_validation_errors_id", "validation_errors", ["id"])
    op.create_index(
        "ix_validation_errors_standardized_transaction_id",
        "validation_errors",
        ["standardized_transaction_id"],
    )

    op.create_table(
        "exports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("legal_entity_id", sa.Integer(), sa.ForeignKey("legal_entities.id"), nullable=False),
        sa.Column("exported_by_user_id", sa.Integer(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("storage_path", sa.String(length=500), nullable=False),
        sa.Column("status", sa.String(length=50), nullable=False, server_default=sa.text("'generated'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_exports_id", "exports", ["id"])
    op.create_index("ix_exports_legal_entity_id", "exports", ["legal_entity_id"])
    op.create_index("ix_exports_exported_by_user_id", "exports", ["exported_by_user_id"])

    op.create_table(
        "revoked_tokens",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("token", sa.String(length=1024), nullable=False, unique=True),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_revoked_tokens_id", "revoked_tokens", ["id"])
    op.create_index("ix_revoked_tokens_token", "revoked_tokens", ["token"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_revoked_tokens_token", table_name="revoked_tokens")
    op.drop_index("ix_revoked_tokens_id", table_name="revoked_tokens")
    op.drop_table("revoked_tokens")

    op.drop_index("ix_exports_exported_by_user_id", table_name="exports")
    op.drop_index("ix_exports_legal_entity_id", table_name="exports")
    op.drop_index("ix_exports_id", table_name="exports")
    op.drop_table("exports")

    op.drop_index("ix_validation_errors_standardized_transaction_id", table_name="validation_errors")
    op.drop_index("ix_validation_errors_id", table_name="validation_errors")
    op.drop_table("validation_errors")

    op.drop_index("ix_standardized_transactions_interpreter_id", table_name="standardized_transactions")
    op.drop_index("ix_standardized_transactions_uploaded_file_id", table_name="standardized_transactions")
    op.drop_index("ix_standardized_transactions_id", table_name="standardized_transactions")
    op.drop_table("standardized_transactions")

    op.drop_index("ix_raw_rows_uploaded_file_id", table_name="raw_rows")
    op.drop_index("ix_raw_rows_id", table_name="raw_rows")
    op.drop_table("raw_rows")

    op.drop_index("ix_uploaded_files_uploaded_by_user_id", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_client_id", table_name="uploaded_files")
    op.drop_index("ix_uploaded_files_id", table_name="uploaded_files")
    op.drop_table("uploaded_files")

    op.drop_index("ix_routing_rules_client_id", table_name="routing_rules")
    op.drop_index("ix_routing_rules_legal_entity_id", table_name="routing_rules")
    op.drop_index("ix_routing_rules_id", table_name="routing_rules")
    op.drop_table("routing_rules")

    op.drop_index("ix_interpreter_client_ids_client_id", table_name="interpreter_client_ids")
    op.drop_index("ix_interpreter_client_ids_interpreter_id", table_name="interpreter_client_ids")
    op.drop_index("ix_interpreter_client_ids_id", table_name="interpreter_client_ids")
    op.drop_table("interpreter_client_ids")

    op.drop_index("ix_interpreters_legal_entity_id", table_name="interpreters")
    op.drop_index("ix_interpreters_id", table_name="interpreters")
    op.drop_table("interpreters")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_index("ix_users_id", table_name="users")
    op.drop_table("users")

    op.drop_index("ix_clients_id", table_name="clients")
    op.drop_table("clients")

    op.drop_index("ix_legal_entities_id", table_name="legal_entities")
    op.drop_table("legal_entities")

    bind = op.get_bind()
    user_role_enum.drop(bind, checkfirst=True)
