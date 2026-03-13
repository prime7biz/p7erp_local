"""Add costing engine tables and extend quotations (PrimeX parity)

Revision ID: 006
Revises: 005
Create Date: 2025-03-09

- item_categories, item_units, items, currencies
- quotation columns: department, projected_quantity, material_cost, etc.
- quotation_materials, quotation_manufacturing, quotation_other_costs,
  quotation_size_ratios, quotation_cost_summary
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "006"
down_revision: Union[str, None] = "005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ----- Item categories (tenant-scoped) -----
    op.create_table(
        "item_categories",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("category_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=128), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_item_categories_tenant_id", "item_categories", ["tenant_id"], unique=False)
    op.create_index("ix_item_categories_category_code", "item_categories", ["category_code"], unique=False)

    # ----- Item units (tenant-scoped) -----
    op.create_table(
        "item_units",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("unit_code", sa.String(length=16), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_item_units_tenant_id", "item_units", ["tenant_id"], unique=False)
    op.create_index("ix_item_units_unit_code", "item_units", ["unit_code"], unique=False)

    # ----- Items (tenant-scoped, for material costing) -----
    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("item_code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category_id", sa.Integer(), nullable=False),
        sa.Column("unit_id", sa.Integer(), nullable=False),
        sa.Column("default_cost", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["item_categories.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["unit_id"], ["item_units.id"], ondelete="RESTRICT"),
    )
    op.create_index("ix_items_tenant_id", "items", ["tenant_id"], unique=False)
    op.create_index("ix_items_item_code", "items", ["item_code"], unique=False)

    # ----- Currencies (global) -----
    op.create_table(
        "currencies",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("code", sa.String(length=10), nullable=False),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_currencies_code", "currencies", ["code"], unique=True)

    # ----- Extend quotations -----
    op.add_column("quotations", sa.Column("style_id", sa.Integer(), nullable=True))
    op.add_column("quotations", sa.Column("department", sa.String(length=100), nullable=True))
    op.add_column("quotations", sa.Column("projected_quantity", sa.Integer(), nullable=True))
    op.add_column("quotations", sa.Column("projected_delivery_date", sa.Date(), nullable=True))
    op.add_column("quotations", sa.Column("quotation_date", sa.Date(), nullable=True))
    op.add_column("quotations", sa.Column("target_price", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("target_price_currency", sa.String(length=10), nullable=True))
    op.add_column("quotations", sa.Column("exchange_rate", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("material_cost", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("manufacturing_cost", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("other_cost", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("total_cost", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("cost_per_piece", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("profit_percentage", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("quoted_price", sa.String(length=32), nullable=True))
    op.add_column("quotations", sa.Column("size_ratio_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("quotations", sa.Column("pack_ratio", sa.String(length=50), nullable=True))
    op.add_column("quotations", sa.Column("pcs_per_carton", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_quotations_style_id",
        "quotations", "garment_styles",
        ["style_id"], ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_quotations_style_id", "quotations", ["style_id"], unique=False)

    # ----- Quotation materials -----
    op.create_table(
        "quotation_materials",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("serial_no", sa.Integer(), nullable=False),
        sa.Column("category_id", sa.Integer(), nullable=True),
        sa.Column("item_id", sa.Integer(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(length=20), nullable=True),
        sa.Column("consumption_per_dozen", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("unit_price", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("amount_per_dozen", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("exchange_rate", sa.String(length=32), nullable=False, server_default="1"),
        sa.Column("base_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("local_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["category_id"], ["item_categories.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="SET NULL"),
    )
    op.create_index("ix_quotation_materials_tenant_id", "quotation_materials", ["tenant_id"], unique=False)
    op.create_index("ix_quotation_materials_quotation_id", "quotation_materials", ["quotation_id"], unique=False)

    # ----- Quotation manufacturing -----
    op.create_table(
        "quotation_manufacturing",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("serial_no", sa.Integer(), nullable=False),
        sa.Column("style_part", sa.String(length=64), nullable=False),
        sa.Column("machines_required", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("production_per_hour", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("production_per_day", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("cost_per_machine", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("total_line_cost", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("cost_per_dozen", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("cm_per_piece", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("total_order_cost", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("exchange_rate", sa.String(length=32), nullable=False, server_default="1"),
        sa.Column("base_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("local_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_quotation_manufacturing_tenant_id", "quotation_manufacturing", ["tenant_id"], unique=False)
    op.create_index("ix_quotation_manufacturing_quotation_id", "quotation_manufacturing", ["quotation_id"], unique=False)

    # ----- Quotation other costs -----
    op.create_table(
        "quotation_other_costs",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("serial_no", sa.Integer(), nullable=False),
        sa.Column("cost_head", sa.String(length=100), nullable=False),
        sa.Column("percentage", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("total_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("cost_type", sa.String(length=20), nullable=False, server_default="fixed"),
        sa.Column("value", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("based_on", sa.String(length=30), nullable=False, server_default="subtotal"),
        sa.Column("calculated_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="USD"),
        sa.Column("exchange_rate", sa.String(length=32), nullable=False, server_default="1"),
        sa.Column("base_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("local_amount", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_quotation_other_costs_tenant_id", "quotation_other_costs", ["tenant_id"], unique=False)
    op.create_index("ix_quotation_other_costs_quotation_id", "quotation_other_costs", ["quotation_id"], unique=False)

    # ----- Quotation size ratios -----
    op.create_table(
        "quotation_size_ratios",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("serial_no", sa.Integer(), nullable=False),
        sa.Column("size", sa.String(length=10), nullable=False),
        sa.Column("ratio_percentage", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("fabric_factor", sa.String(length=32), nullable=False, server_default="1.0"),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_quotation_size_ratios_tenant_id", "quotation_size_ratios", ["tenant_id"], unique=False)
    op.create_index("ix_quotation_size_ratios_quotation_id", "quotation_size_ratios", ["quotation_id"], unique=False)

    # ----- Quotation cost summary -----
    op.create_table(
        "quotation_cost_summary",
        sa.Column("id", sa.Integer(), autoincrement=True, primary_key=True),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("quotation_id", sa.Integer(), nullable=False),
        sa.Column("category_name", sa.String(length=100), nullable=False),
        sa.Column("total_cost", sa.String(length=32), nullable=False),
        sa.Column("percentage_of_total", sa.String(length=32), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="CASCADE"),
    )
    op.create_index("ix_quotation_cost_summary_tenant_id", "quotation_cost_summary", ["tenant_id"], unique=False)
    op.create_index("ix_quotation_cost_summary_quotation_id", "quotation_cost_summary", ["quotation_id"], unique=False)


def downgrade() -> None:
    op.drop_table("quotation_cost_summary")
    op.drop_table("quotation_size_ratios")
    op.drop_table("quotation_other_costs")
    op.drop_table("quotation_manufacturing")
    op.drop_table("quotation_materials")

    op.drop_index("ix_quotations_style_id", table_name="quotations")
    op.drop_constraint("fk_quotations_style_id", "quotations", type_="foreignkey")
    op.drop_column("quotations", "pcs_per_carton")
    op.drop_column("quotations", "pack_ratio")
    op.drop_column("quotations", "size_ratio_enabled")
    op.drop_column("quotations", "quoted_price")
    op.drop_column("quotations", "profit_percentage")
    op.drop_column("quotations", "cost_per_piece")
    op.drop_column("quotations", "total_cost")
    op.drop_column("quotations", "other_cost")
    op.drop_column("quotations", "manufacturing_cost")
    op.drop_column("quotations", "material_cost")
    op.drop_column("quotations", "exchange_rate")
    op.drop_column("quotations", "target_price_currency")
    op.drop_column("quotations", "target_price")
    op.drop_column("quotations", "quotation_date")
    op.drop_column("quotations", "projected_delivery_date")
    op.drop_column("quotations", "projected_quantity")
    op.drop_column("quotations", "department")
    op.drop_column("quotations", "style_id")

    op.drop_table("currencies")
    op.drop_table("items")
    op.drop_table("item_units")
    op.drop_table("item_categories")
