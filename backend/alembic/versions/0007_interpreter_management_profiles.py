"""Expand interpreter profiles for management module

Revision ID: 0007_interpreter_profiles
Revises: 0006_exports_and_quantity_basis
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0007_interpreter_profiles"
down_revision: Union[str, None] = "0006_exports_and_quantity_basis"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


payment_frequency_enum = sa.Enum("Weekly", "Biweekly", "Monthly", name="paymentfrequency", native_enum=False)
interpreter_status_enum = sa.Enum("Active", "Inactive", "On Hold", name="interpreterstatus", native_enum=False)


def upgrade() -> None:
    bind = op.get_bind()
    payment_frequency_enum.create(bind, checkfirst=True)
    interpreter_status_enum.create(bind, checkfirst=True)

    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.add_column(sa.Column("client_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("employee_id", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("full_name", sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column("language", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("location", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("country", sa.String(length=120), nullable=True))
        batch_op.add_column(sa.Column("payment_frequency", payment_frequency_enum, nullable=True))
        batch_op.add_column(sa.Column("rate", sa.Numeric(12, 2), nullable=True))
        batch_op.add_column(sa.Column("status", interpreter_status_enum, nullable=True))
        batch_op.create_foreign_key("fk_interpreters_client_id_clients", "clients", ["client_id"], ["id"])
        batch_op.alter_column("legal_entity_id", existing_type=sa.Integer(), nullable=True)
        batch_op.alter_column("first_name", existing_type=sa.String(length=120), nullable=True)
        batch_op.alter_column("last_name", existing_type=sa.String(length=120), nullable=True)
        batch_op.create_index("ix_interpreters_client_id", ["client_id"], unique=False)
        batch_op.create_index("ix_interpreters_employee_id", ["employee_id"], unique=True)
        batch_op.create_index("ix_interpreters_full_name", ["full_name"], unique=False)
        batch_op.create_index("ix_interpreters_language", ["language"], unique=False)
        batch_op.create_index("ix_interpreters_location", ["location"], unique=False)
        batch_op.create_index("ix_interpreters_country", ["country"], unique=False)

    interpreter_rows = bind.execute(
        sa.text(
            """
            SELECT i.id, i.first_name, i.last_name, i.email, le.country
            FROM interpreters i
            LEFT JOIN legal_entities le ON le.id = i.legal_entity_id
            """
        )
    ).fetchall()

    client_rows = bind.execute(
        sa.text(
            """
            SELECT interpreter_id, MIN(client_id) AS client_id
            FROM interpreter_client_ids
            GROUP BY interpreter_id
            """
        )
    ).fetchall()
    client_map = {row.interpreter_id: row.client_id for row in client_rows}

    for row in interpreter_rows:
        first_name = (row.first_name or "").strip()
        last_name = (row.last_name or "").strip()
        full_name = " ".join(part for part in [first_name, last_name] if part).strip() or f"Interpreter {row.id}"
        email = (row.email or f"interpreter{row.id}@example.com").strip().lower()
        country = (row.country or "Unassigned").strip()
        bind.execute(
            sa.text(
                """
                UPDATE interpreters
                SET client_id = :client_id,
                    employee_id = :employee_id,
                    full_name = :full_name,
                    email = :email,
                    language = :language,
                    location = :location,
                    country = :country,
                    payment_frequency = :payment_frequency,
                    rate = :rate,
                    status = :status
                WHERE id = :id
                """
            ),
            {
                "id": row.id,
                "client_id": client_map.get(row.id),
                "employee_id": f"EMP-{row.id:04d}",
                "full_name": full_name,
                "email": email,
                "language": "English",
                "location": "Remote",
                "country": country,
                "payment_frequency": "Monthly",
                "rate": 0,
                "status": "Active",
            },
        )

    fallback_client_id = bind.execute(sa.text("SELECT MIN(id) AS id FROM clients")).scalar()
    if fallback_client_id is not None:
        bind.execute(
            sa.text(
                """
                UPDATE interpreters
                SET client_id = :client_id
                WHERE client_id IS NULL
                """
            ),
            {"client_id": fallback_client_id},
        )

    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.alter_column("employee_id", existing_type=sa.String(length=64), nullable=False)
        batch_op.alter_column("full_name", existing_type=sa.String(length=255), nullable=False)
        batch_op.alter_column("email", existing_type=sa.String(length=255), nullable=False)
        batch_op.alter_column("language", existing_type=sa.String(length=120), nullable=False)
        batch_op.alter_column("location", existing_type=sa.String(length=120), nullable=False)
        batch_op.alter_column("country", existing_type=sa.String(length=120), nullable=False)
        batch_op.alter_column("client_id", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("payment_frequency", existing_type=payment_frequency_enum, nullable=False)
        batch_op.alter_column("rate", existing_type=sa.Numeric(12, 2), nullable=False)
        batch_op.alter_column("status", existing_type=interpreter_status_enum, nullable=False)


def downgrade() -> None:
    with op.batch_alter_table("interpreters") as batch_op:
        batch_op.drop_index("ix_interpreters_country")
        batch_op.drop_index("ix_interpreters_location")
        batch_op.drop_index("ix_interpreters_language")
        batch_op.drop_index("ix_interpreters_full_name")
        batch_op.drop_index("ix_interpreters_employee_id")
        batch_op.drop_index("ix_interpreters_client_id")
        batch_op.alter_column("last_name", existing_type=sa.String(length=120), nullable=False)
        batch_op.alter_column("first_name", existing_type=sa.String(length=120), nullable=False)
        batch_op.alter_column("legal_entity_id", existing_type=sa.Integer(), nullable=False)
        batch_op.alter_column("email", existing_type=sa.String(length=255), nullable=True)
        batch_op.drop_constraint("fk_interpreters_client_id_clients", type_="foreignkey")
        batch_op.drop_column("status")
        batch_op.drop_column("rate")
        batch_op.drop_column("payment_frequency")
        batch_op.drop_column("country")
        batch_op.drop_column("location")
        batch_op.drop_column("language")
        batch_op.drop_column("full_name")
        batch_op.drop_column("employee_id")
        batch_op.drop_column("client_id")

    bind = op.get_bind()
    interpreter_status_enum.drop(bind, checkfirst=True)
    payment_frequency_enum.drop(bind, checkfirst=True)
