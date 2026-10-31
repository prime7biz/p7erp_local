"""Create planned_orders table for inventory MRP (Sprint I1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "213"
down_revision: Union[str, None] = "212"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "planned_orders",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("planned_order_number", sa.String(length=32), nullable=False),
        sa.Column("source_type", sa.String(length=16), nullable=False),
        sa.Column("source_order_id", sa.Integer(), nullable=True),
        sa.Column("source_bom_id", sa.Integer(), nullable=True),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("required_qty", sa.Numeric(15, 4), nullable=False),
        sa.Column("planned_qty", sa.Numeric(15, 4), nullable=False),
        sa.Column("requirement_date", sa.Date(), nullable=False),
        sa.Column("release_date", sa.Date(), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PLANNED"),
        sa.Column("generated_po_id", sa.Integer(), nullable=True),
        sa.Column("generated_mo_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_bom_id"], ["boms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["generated_po_id"], ["purchase_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["generated_mo_id"], ["manufacturing_orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "planned_order_number", name="uq_planned_orders_tenant_number"),
    )
    op.create_index("ix_planned_orders_tenant_id", "planned_orders", ["tenant_id"])
    op.create_index("ix_planned_orders_planned_order_number", "planned_orders", ["planned_order_number"])
    op.create_index("ix_planned_orders_item_id", "planned_orders", ["item_id"])
    op.create_index("ix_planned_orders_status", "planned_orders", ["status"])
    op.create_index("ix_planned_orders_source_order_id", "planned_orders", ["source_order_id"])


def downgrade() -> None:
    op.drop_table("planned_orders")
