"""Add row linkage for standardized transactions

Revision ID: 0004_validation_queue_engine
Revises: 0003_transform_engine_schema
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_validation_queue_engine"
down_revision: Union[str, None] = "0003_transform_engine_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("standardized_transactions", sa.Column("raw_row_id", sa.Integer(), nullable=True))
    op.add_column("standardized_transactions", sa.Column("row_number", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_standardized_transactions_raw_row_id",
        "standardized_transactions",
        "raw_rows",
        ["raw_row_id"],
        ["id"],
    )
    op.create_index("ix_standardized_transactions_raw_row_id", "standardized_transactions", ["raw_row_id"])
    op.execute(
        """
        UPDATE standardized_transactions AS st
        SET raw_row_id = rr.id,
            row_number = rr.row_number
        FROM raw_rows AS rr
        WHERE rr.uploaded_file_id = st.uploaded_file_id
          AND rr.row_number = (
              SELECT COUNT(*)
              FROM standardized_transactions AS st2
              WHERE st2.uploaded_file_id = st.uploaded_file_id
                AND st2.id <= st.id
          )
        """
    )


def downgrade() -> None:
    op.drop_index("ix_standardized_transactions_raw_row_id", table_name="standardized_transactions")
    op.drop_constraint("fk_standardized_transactions_raw_row_id", "standardized_transactions", type_="foreignkey")
    op.drop_column("standardized_transactions", "row_number")
    op.drop_column("standardized_transactions", "raw_row_id")
