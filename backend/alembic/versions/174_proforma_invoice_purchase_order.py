"""Proforma invoice: optional purchase_order_id for IMPORT vendor PI linkage.

Revision ID: 174
Revises: 173
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "174"
down_revision: Union[str, None] = "173"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "proforma_invoices",
        sa.Column(
            "purchase_order_id",
            sa.Integer(),
            sa.ForeignKey("purchase_orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index(
        "ix_proforma_invoices_purchase_order_id",
        "proforma_invoices",
        ["purchase_order_id"],
        unique=False,
    )
    op.create_index(
        "uq_proforma_invoices_purchase_order_id_not_null",
        "proforma_invoices",
        ["purchase_order_id"],
        unique=True,
        postgresql_where=sa.text("purchase_order_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_proforma_invoices_purchase_order_id_not_null",
        table_name="proforma_invoices",
    )
    op.drop_index("ix_proforma_invoices_purchase_order_id", table_name="proforma_invoices")
    op.drop_column("proforma_invoices", "purchase_order_id")
