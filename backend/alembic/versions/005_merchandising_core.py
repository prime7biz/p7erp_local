"""Add core merchandising tables

Revision ID: 005
Revises: 004
Create Date: 2025-03-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "005"
down_revision: Union[str, None] = "004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "inquiries",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("inquiry_code", sa.String(length=32), nullable=False),
        sa.Column("style_ref", sa.String(length=128), nullable=True),
        sa.Column("season", sa.String(length=64), nullable=True),
        sa.Column("department", sa.String(length=64), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("target_price", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_inquiries_tenant_id", "inquiries", ["tenant_id"], unique=False)
    op.create_index("ix_inquiries_inquiry_code", "inquiries", ["inquiry_code"], unique=False)
    op.create_index("ix_inquiries_status", "inquiries", ["status"], unique=False)

    op.create_table(
        "quotations",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("inquiry_id", sa.Integer(), nullable=True),
        sa.Column("quotation_code", sa.String(length=32), nullable=False),
        sa.Column("style_ref", sa.String(length=128), nullable=True),
        sa.Column("currency", sa.String(length=8), nullable=True),
        sa.Column("total_amount", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("version_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("valid_until", sa.Date(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_quotations_tenant_id", "quotations", ["tenant_id"], unique=False)
    op.create_index("ix_quotations_quotation_code", "quotations", ["quotation_code"], unique=False)
    op.create_index("ix_quotations_status", "quotations", ["status"], unique=False)

    op.create_table(
        "orders",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("customer_id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=True),
        sa.Column("order_code", sa.String(length=32), nullable=False),
        sa.Column("style_ref", sa.String(length=128), nullable=True),
        sa.Column("order_date", sa.Date(), nullable=True),
        sa.Column("delivery_date", sa.Date(), nullable=True),
        sa.Column("quantity", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["customer_id"], ["customers.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_orders_tenant_id", "orders", ["tenant_id"], unique=False)
    op.create_index("ix_orders_order_code", "orders", ["order_code"], unique=False)
    op.create_index("ix_orders_status", "orders", ["status"], unique=False)

    op.create_table(
        "garment_styles",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("style_code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("buyer_customer_id", sa.Integer(), nullable=True),
        sa.Column("season", sa.String(length=64), nullable=True),
        sa.Column("department", sa.String(length=64), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="ACTIVE"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["buyer_customer_id"], ["customers.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_garment_styles_tenant_id", "garment_styles", ["tenant_id"], unique=False)
    op.create_index("ix_garment_styles_style_code", "garment_styles", ["style_code"], unique=False)
    op.create_index("ix_garment_styles_status", "garment_styles", ["status"], unique=False)

    op.create_table(
        "boms",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("style_id", sa.Integer(), nullable=False),
        sa.Column("version_no", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_boms_tenant_id", "boms", ["tenant_id"], unique=False)
    op.create_index("ix_boms_style_id", "boms", ["style_id"], unique=False)

    op.create_table(
        "bom_items",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("bom_id", sa.Integer(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("item_code", sa.String(length=64), nullable=True),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("uom", sa.String(length=32), nullable=True),
        sa.Column("base_consumption", sa.String(length=32), nullable=False),
        sa.Column("wastage_pct", sa.String(length=16), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bom_id"], ["boms.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_bom_items_tenant_id", "bom_items", ["tenant_id"], unique=False)
    op.create_index("ix_bom_items_bom_id", "bom_items", ["bom_id"], unique=False)

    op.create_table(
        "consumption_plans",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="PLANNED"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_consumption_plans_tenant_id", "consumption_plans", ["tenant_id"], unique=False)
    op.create_index("ix_consumption_plans_order_id", "consumption_plans", ["order_id"], unique=False)

    op.create_table(
        "consumption_plan_items",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("item_code", sa.String(length=64), nullable=True),
        sa.Column("required_qty", sa.String(length=32), nullable=False),
        sa.Column("uom", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["plan_id"], ["consumption_plans.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_consumption_plan_items_tenant_id", "consumption_plan_items", ["tenant_id"], unique=False)
    op.create_index("ix_consumption_plan_items_plan_id", "consumption_plan_items", ["plan_id"], unique=False)

    op.create_table(
        "order_followups",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="OPEN"),
        sa.Column("severity", sa.String(length=16), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_order_followups_tenant_id", "order_followups", ["tenant_id"], unique=False)
    op.create_index("ix_order_followups_order_id", "order_followups", ["order_id"], unique=False)
    op.create_index("ix_order_followups_status", "order_followups", ["status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_order_followups_status", table_name="order_followups")
    op.drop_index("ix_order_followups_order_id", table_name="order_followups")
    op.drop_index("ix_order_followups_tenant_id", table_name="order_followups")
    op.drop_table("order_followups")

    op.drop_index("ix_consumption_plan_items_plan_id", table_name="consumption_plan_items")
    op.drop_index("ix_consumption_plan_items_tenant_id", table_name="consumption_plan_items")
    op.drop_table("consumption_plan_items")

    op.drop_index("ix_consumption_plans_order_id", table_name="consumption_plans")
    op.drop_index("ix_consumption_plans_tenant_id", table_name="consumption_plans")
    op.drop_table("consumption_plans")

    op.drop_index("ix_bom_items_bom_id", table_name="bom_items")
    op.drop_index("ix_bom_items_tenant_id", table_name="bom_items")
    op.drop_table("bom_items")

    op.drop_index("ix_boms_style_id", table_name="boms")
    op.drop_index("ix_boms_tenant_id", table_name="boms")
    op.drop_table("boms")

    op.drop_index("ix_garment_styles_status", table_name="garment_styles")
    op.drop_index("ix_garment_styles_style_code", table_name="garment_styles")
    op.drop_index("ix_garment_styles_tenant_id", table_name="garment_styles")
    op.drop_table("garment_styles")

    op.drop_index("ix_orders_status", table_name="orders")
    op.drop_index("ix_orders_order_code", table_name="orders")
    op.drop_index("ix_orders_tenant_id", table_name="orders")
    op.drop_table("orders")

    op.drop_index("ix_quotations_status", table_name="quotations")
    op.drop_index("ix_quotations_quotation_code", table_name="quotations")
    op.drop_index("ix_quotations_tenant_id", table_name="quotations")
    op.drop_table("quotations")

    op.drop_index("ix_inquiries_status", table_name="inquiries")
    op.drop_index("ix_inquiries_inquiry_code", table_name="inquiries")
    op.drop_index("ix_inquiries_tenant_id", table_name="inquiries")
    op.drop_table("inquiries")

