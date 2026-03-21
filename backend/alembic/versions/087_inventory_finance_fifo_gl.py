"""Inventory–finance: FIFO layers, stock group GL mapping, item stock_group, GL idempotency.

Revision ID: 087
Revises: 086
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "087"
down_revision: Union[str, None] = "086"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "items",
        sa.Column("stock_group_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_items_stock_group_id",
        "items",
        "stock_groups",
        ["stock_group_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_items_stock_group_id", "items", ["stock_group_id"])

    op.add_column("stock_groups", sa.Column("inventory_account_id", sa.Integer(), nullable=True))
    op.add_column("stock_groups", sa.Column("wip_account_id", sa.Integer(), nullable=True))
    op.add_column("stock_groups", sa.Column("cogs_account_id", sa.Integer(), nullable=True))
    op.add_column("stock_groups", sa.Column("adjustment_account_id", sa.Integer(), nullable=True))
    op.add_column("stock_groups", sa.Column("grni_account_id", sa.Integer(), nullable=True))
    for col in (
        "inventory_account_id",
        "wip_account_id",
        "cogs_account_id",
        "adjustment_account_id",
        "grni_account_id",
    ):
        op.create_foreign_key(
            f"fk_stock_groups_{col}",
            "stock_groups",
            "chart_of_accounts",
            [col],
            ["id"],
            ondelete="SET NULL",
        )
        op.create_index(f"ix_stock_groups_{col}", "stock_groups", [col])

    op.add_column("stock_movements", sa.Column("unit_cost", sa.String(length=32), nullable=True))
    op.add_column("stock_movements", sa.Column("movement_value", sa.String(length=32), nullable=True))

    op.create_table(
        "inventory_cost_layers",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("source_movement_id", sa.Integer(), nullable=False),
        sa.Column("qty_original", sa.String(length=32), nullable=False),
        sa.Column("qty_remaining", sa.String(length=32), nullable=False),
        sa.Column("unit_cost", sa.String(length=32), nullable=False),
        sa.Column("layer_date", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_movement_id"], ["stock_movements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_movement_id", name="uq_inventory_cost_layers_source_movement_id"),
    )
    op.create_index("ix_inventory_cost_layers_tenant_id", "inventory_cost_layers", ["tenant_id"])
    op.create_index(
        "ix_inventory_cost_layers_tenant_item_wh_id",
        "inventory_cost_layers",
        ["tenant_id", "item_id", "warehouse_id", "id"],
    )

    op.create_table(
        "inventory_gl_postings",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("source_system", sa.String(length=32), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("voucher_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "source_system",
            "source_id",
            "action",
            name="uq_inventory_gl_postings_tenant_source_action",
        ),
    )
    op.create_index("ix_inventory_gl_postings_tenant_id", "inventory_gl_postings", ["tenant_id"])


def downgrade() -> None:
    op.drop_index("ix_inventory_gl_postings_tenant_id", table_name="inventory_gl_postings")
    op.drop_table("inventory_gl_postings")
    op.drop_index("ix_inventory_cost_layers_tenant_item_wh_id", table_name="inventory_cost_layers")
    op.drop_index("ix_inventory_cost_layers_tenant_id", table_name="inventory_cost_layers")
    op.drop_table("inventory_cost_layers")

    op.drop_column("stock_movements", "movement_value")
    op.drop_column("stock_movements", "unit_cost")

    for col in (
        "grni_account_id",
        "adjustment_account_id",
        "cogs_account_id",
        "wip_account_id",
        "inventory_account_id",
    ):
        op.drop_index(f"ix_stock_groups_{col}", table_name="stock_groups")
        op.drop_constraint(f"fk_stock_groups_{col}", "stock_groups", type_="foreignkey")
        op.drop_column("stock_groups", col)

    op.drop_index("ix_items_stock_group_id", table_name="items")
    op.drop_constraint("fk_items_stock_group_id", "items", type_="foreignkey")
    op.drop_column("items", "stock_group_id")
