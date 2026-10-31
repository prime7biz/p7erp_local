"""Add item planning fields for MRP / auto-reorder (Sprint I1)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "212"
down_revision: Union[str, None] = "211"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("auto_reorder_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column("items", sa.Column("reorder_qty", sa.Numeric(18, 4), nullable=True))
    op.add_column("items", sa.Column("safety_stock", sa.Numeric(18, 4), nullable=True))
    op.add_column("items", sa.Column("lead_time_days", sa.Integer(), nullable=True))
    op.add_column("items", sa.Column("lot_size_method", sa.String(length=16), nullable=True))
    op.add_column("items", sa.Column("fixed_lot_size", sa.Numeric(18, 4), nullable=True))
    op.add_column("items", sa.Column("preferred_vendor_id", sa.Integer(), nullable=True))
    op.add_column("items", sa.Column("planning_time_fence_days", sa.Integer(), nullable=True))
    op.add_column("items", sa.Column("abc_class", sa.String(length=1), nullable=True))
    op.create_foreign_key(
        "fk_items_preferred_vendor_id",
        "items",
        "vendors",
        ["preferred_vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_items_preferred_vendor_id", "items", ["preferred_vendor_id"])
    op.create_index("ix_items_auto_reorder_enabled", "items", ["auto_reorder_enabled"])


def downgrade() -> None:
    op.drop_index("ix_items_auto_reorder_enabled", table_name="items")
    op.drop_index("ix_items_preferred_vendor_id", table_name="items")
    op.drop_constraint("fk_items_preferred_vendor_id", "items", type_="foreignkey")
    op.drop_column("items", "abc_class")
    op.drop_column("items", "planning_time_fence_days")
    op.drop_column("items", "preferred_vendor_id")
    op.drop_column("items", "fixed_lot_size")
    op.drop_column("items", "lot_size_method")
    op.drop_column("items", "lead_time_days")
    op.drop_column("items", "safety_stock")
    op.drop_column("items", "reorder_qty")
    op.drop_column("items", "auto_reorder_enabled")
