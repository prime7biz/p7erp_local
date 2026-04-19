"""stock_reservations table + ATP-related indexes.

Revision ID: 162
Revises: 161
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "162"
down_revision: Union[str, None] = "161"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "stock_reservations",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("bom_id", sa.Integer(), nullable=True),
        sa.Column("reserved_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="HARD"),
        sa.Column("reserved_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("released_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["bom_id"], ["boms.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_stock_reservations_tenant_id", "stock_reservations", ["tenant_id"], unique=False)
    op.create_index("ix_stock_reservations_item_id", "stock_reservations", ["item_id"], unique=False)
    op.create_index("ix_stock_reservations_status", "stock_reservations", ["status"], unique=False)
    op.create_index(
        "ix_stock_reservations_tenant_item_status",
        "stock_reservations",
        ["tenant_id", "item_id", "status"],
        unique=False,
    )
    op.create_index(
        "ix_stock_reservations_tenant_order",
        "stock_reservations",
        ["tenant_id", "order_id"],
        unique=False,
    )
    op.create_index(
        "ix_stock_movements_tenant_item_warehouse",
        "stock_movements",
        ["tenant_id", "item_id", "warehouse_id", "movement_type"],
        unique=False,
    )
    op.create_index(
        "ix_purchase_order_items_tenant_item",
        "purchase_order_items",
        ["tenant_id", "item_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_purchase_order_items_tenant_item", table_name="purchase_order_items")
    op.drop_index("ix_stock_movements_tenant_item_warehouse", table_name="stock_movements")
    op.drop_index("ix_stock_reservations_tenant_order", table_name="stock_reservations")
    op.drop_index("ix_stock_reservations_tenant_item_status", table_name="stock_reservations")
    op.drop_index("ix_stock_reservations_status", table_name="stock_reservations")
    op.drop_index("ix_stock_reservations_item_id", table_name="stock_reservations")
    op.drop_index("ix_stock_reservations_tenant_id", table_name="stock_reservations")
    op.drop_table("stock_reservations")
