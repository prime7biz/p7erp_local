"""Create stock_serials + items.serial_tracking_enabled (Sprint I4)."""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "221"
down_revision: Union[str, None] = "220"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("serial_tracking_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.create_table(
        "stock_serials",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("serial_number", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="IN_STOCK"),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("grn_item_id", sa.Integer(), nullable=True),
        sa.Column("dc_item_id", sa.Integer(), nullable=True),
        sa.Column("warranty_start", sa.Date(), nullable=True),
        sa.Column("warranty_end", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["grn_item_id"], ["goods_receiving_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["dc_item_id"], ["delivery_challan_items.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "serial_number", name="uq_stock_serials_tenant_serial"),
    )
    op.create_index("ix_stock_serials_tenant_id", "stock_serials", ["tenant_id"])
    op.create_index("ix_stock_serials_item_id", "stock_serials", ["item_id"])
    op.create_index("ix_stock_serials_status", "stock_serials", ["status"])
    op.create_index("ix_stock_serials_warehouse_id", "stock_serials", ["warehouse_id"])


def downgrade() -> None:
    op.drop_index("ix_stock_serials_warehouse_id", table_name="stock_serials")
    op.drop_index("ix_stock_serials_status", table_name="stock_serials")
    op.drop_index("ix_stock_serials_item_id", table_name="stock_serials")
    op.drop_index("ix_stock_serials_tenant_id", table_name="stock_serials")
    op.drop_table("stock_serials")
    op.drop_column("items", "serial_tracking_enabled")
