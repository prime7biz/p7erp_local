"""Add inventory masters and core transactions

Revision ID: 009
Revises: 008
Create Date: 2026-03-10
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "009"
down_revision: Union[str, None] = "008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "item_subcategories",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("subcategory_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["item_categories.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_item_subcategories_tenant_id", "item_subcategories", ["tenant_id"])
    op.create_index("ix_item_subcategories_category_id", "item_subcategories", ["category_id"])
    op.create_index("ix_item_subcategories_subcategory_code", "item_subcategories", ["subcategory_code"])

    op.add_column("items", sa.Column("subcategory_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_items_subcategory_id",
        "items",
        "item_subcategories",
        ["subcategory_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_items_subcategory_id", "items", ["subcategory_id"])

    op.create_table(
        "warehouses",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_warehouses_tenant_id", "warehouses", ["tenant_id"])
    op.create_index("ix_warehouses_code", "warehouses", ["warehouse_code"])

    op.create_table(
        "stock_groups",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("group_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("parent_id", sa.Integer(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["parent_id"], ["stock_groups.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_stock_groups_tenant_id", "stock_groups", ["tenant_id"])
    op.create_index("ix_stock_groups_group_code", "stock_groups", ["group_code"])
    op.create_index("ix_stock_groups_parent_id", "stock_groups", ["parent_id"])

    op.create_table(
        "purchase_orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("po_code", sa.String(length=32), nullable=False),
        sa.Column("supplier_name", sa.String(length=128), nullable=False),
        sa.Column("order_date", sa.Date(), nullable=True),
        sa.Column("expected_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_purchase_orders_tenant_id", "purchase_orders", ["tenant_id"])
    op.create_index("ix_purchase_orders_po_code", "purchase_orders", ["po_code"])
    op.create_index("ix_purchase_orders_status", "purchase_orders", ["status"])

    op.create_table(
        "purchase_order_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("purchase_order_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("unit_price", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["purchase_order_id"], ["purchase_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_purchase_order_items_tenant_id", "purchase_order_items", ["tenant_id"])
    op.create_index("ix_purchase_order_items_po_id", "purchase_order_items", ["purchase_order_id"])
    op.create_index("ix_purchase_order_items_item_id", "purchase_order_items", ["item_id"])

    op.create_table(
        "goods_receiving",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("grn_code", sa.String(length=32), nullable=False),
        sa.Column("purchase_order_id", sa.Integer(), nullable=True),
        sa.Column("received_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["purchase_order_id"], ["purchase_orders.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_goods_receiving_tenant_id", "goods_receiving", ["tenant_id"])
    op.create_index("ix_goods_receiving_grn_code", "goods_receiving", ["grn_code"])
    op.create_index("ix_goods_receiving_status", "goods_receiving", ["status"])

    op.create_table(
        "goods_receiving_items",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("goods_receiving_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["goods_receiving_id"], ["goods_receiving.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_goods_receiving_items_tenant_id", "goods_receiving_items", ["tenant_id"])
    op.create_index("ix_goods_receiving_items_grn_id", "goods_receiving_items", ["goods_receiving_id"])
    op.create_index("ix_goods_receiving_items_item_id", "goods_receiving_items", ["item_id"])

    op.create_table(
        "stock_movements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=True),
        sa.Column("movement_type", sa.String(length=16), nullable=False),
        sa.Column("quantity", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("reference_type", sa.String(length=32), nullable=True),
        sa.Column("reference_id", sa.Integer(), nullable=True),
        sa.Column("movement_date", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_stock_movements_tenant_id", "stock_movements", ["tenant_id"])
    op.create_index("ix_stock_movements_item_id", "stock_movements", ["item_id"])
    op.create_index("ix_stock_movements_warehouse_id", "stock_movements", ["warehouse_id"])
    op.create_index("ix_stock_movements_type", "stock_movements", ["movement_type"])


def downgrade() -> None:
    op.drop_index("ix_stock_movements_type", table_name="stock_movements")
    op.drop_index("ix_stock_movements_warehouse_id", table_name="stock_movements")
    op.drop_index("ix_stock_movements_item_id", table_name="stock_movements")
    op.drop_index("ix_stock_movements_tenant_id", table_name="stock_movements")
    op.drop_table("stock_movements")

    op.drop_index("ix_goods_receiving_items_item_id", table_name="goods_receiving_items")
    op.drop_index("ix_goods_receiving_items_grn_id", table_name="goods_receiving_items")
    op.drop_index("ix_goods_receiving_items_tenant_id", table_name="goods_receiving_items")
    op.drop_table("goods_receiving_items")

    op.drop_index("ix_goods_receiving_status", table_name="goods_receiving")
    op.drop_index("ix_goods_receiving_grn_code", table_name="goods_receiving")
    op.drop_index("ix_goods_receiving_tenant_id", table_name="goods_receiving")
    op.drop_table("goods_receiving")

    op.drop_index("ix_purchase_order_items_item_id", table_name="purchase_order_items")
    op.drop_index("ix_purchase_order_items_po_id", table_name="purchase_order_items")
    op.drop_index("ix_purchase_order_items_tenant_id", table_name="purchase_order_items")
    op.drop_table("purchase_order_items")

    op.drop_index("ix_purchase_orders_status", table_name="purchase_orders")
    op.drop_index("ix_purchase_orders_po_code", table_name="purchase_orders")
    op.drop_index("ix_purchase_orders_tenant_id", table_name="purchase_orders")
    op.drop_table("purchase_orders")

    op.drop_index("ix_stock_groups_parent_id", table_name="stock_groups")
    op.drop_index("ix_stock_groups_group_code", table_name="stock_groups")
    op.drop_index("ix_stock_groups_tenant_id", table_name="stock_groups")
    op.drop_table("stock_groups")

    op.drop_index("ix_warehouses_code", table_name="warehouses")
    op.drop_index("ix_warehouses_tenant_id", table_name="warehouses")
    op.drop_table("warehouses")

    op.drop_index("ix_items_subcategory_id", table_name="items")
    op.drop_constraint("fk_items_subcategory_id", "items", type_="foreignkey")
    op.drop_column("items", "subcategory_id")

    op.drop_index("ix_item_subcategories_subcategory_code", table_name="item_subcategories")
    op.drop_index("ix_item_subcategories_category_id", table_name="item_subcategories")
    op.drop_index("ix_item_subcategories_tenant_id", table_name="item_subcategories")
    op.drop_table("item_subcategories")
