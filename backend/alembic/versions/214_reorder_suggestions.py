"""Create reorder_suggestions table (Sprint I1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "214"
down_revision: Union[str, None] = "213"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "reorder_suggestions",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("current_stock", sa.Numeric(15, 4), nullable=False),
        sa.Column("reorder_level", sa.Numeric(15, 4), nullable=False),
        sa.Column("suggested_qty", sa.Numeric(15, 4), nullable=False),
        sa.Column("preferred_vendor_id", sa.Integer(), nullable=True),
        sa.Column("estimated_cost", sa.Numeric(15, 4), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="PENDING"),
        sa.Column("generated_po_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["preferred_vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["generated_po_id"], ["purchase_orders.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_reorder_suggestions_tenant_id", "reorder_suggestions", ["tenant_id"])
    op.create_index("ix_reorder_suggestions_item_id", "reorder_suggestions", ["item_id"])
    op.create_index("ix_reorder_suggestions_status", "reorder_suggestions", ["status"])
    op.create_index("ix_reorder_suggestions_warehouse_id", "reorder_suggestions", ["warehouse_id"])


def downgrade() -> None:
    op.drop_table("reorder_suggestions")
