"""Nullable customer_id FKs on commercial / logistics / AR tables.

Plan called this revision 329 after 328; local chain already has 328–333
(production + customer profile), so this ships as 334 after 333.

Rollback: ``alembic downgrade 333``.

Revision ID: 334
Revises: 333
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "334"
down_revision: Union[str, None] = "333"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

_TABLES: tuple[str, ...] = (
    "master_contracts",
    "proforma_invoices",
    "export_cases",
    "delivery_challans",
    "outstanding_bills",
)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in _TABLES:
        op.add_column(table, sa.Column("customer_id", sa.Integer(), nullable=True))
        op.create_foreign_key(
            f"fk_{table}_customer_id",
            table,
            "customers",
            ["customer_id"],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(
            f"ix_{table}_tenant_id_customer_id",
            table,
            ["tenant_id", "customer_id"],
        )


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(_TABLES):
        op.drop_index(f"ix_{table}_tenant_id_customer_id", table_name=table)
        op.drop_constraint(f"fk_{table}_customer_id", table, type_="foreignkey")
        op.drop_column(table, "customer_id")
