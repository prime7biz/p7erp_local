"""Order-driven BOM: order linkage, line snapshots, PO line linkage.

Revision ID: 154
Revises: 153
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "154"
down_revision: Union[str, None] = "153"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("boms", sa.Column("order_id", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("quotation_id", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.add_column("boms", sa.Column("is_legacy", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("boms", sa.Column("revision_of_bom_id", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("order_code_snapshot", sa.String(length=64), nullable=True))
    op.add_column("boms", sa.Column("quotation_code_snapshot", sa.String(length=64), nullable=True))
    op.add_column("boms", sa.Column("order_qty_snapshot", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("order_qty_at_approval", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("currency_snapshot", sa.String(length=16), nullable=True))
    op.add_column("boms", sa.Column("submitted_at", sa.DateTime(), nullable=True))
    op.add_column("boms", sa.Column("submitted_by", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("approved_at", sa.DateTime(), nullable=True))
    op.add_column("boms", sa.Column("approved_by", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("rejected_at", sa.DateTime(), nullable=True))
    op.add_column("boms", sa.Column("rejected_by", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("rejection_comment", sa.Text(), nullable=True))
    op.add_column("boms", sa.Column("frozen_at", sa.DateTime(), nullable=True))
    op.add_column("boms", sa.Column("frozen_by", sa.Integer(), nullable=True))

    op.create_foreign_key(
        "fk_boms_order_id_orders",
        "boms",
        "orders",
        ["order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_boms_quotation_id_quotations",
        "boms",
        "quotations",
        ["quotation_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_boms_revision_of_bom_id",
        "boms",
        "boms",
        ["revision_of_bom_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_boms_submitted_by_users",
        "boms",
        "users",
        ["submitted_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_boms_approved_by_users",
        "boms",
        "users",
        ["approved_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_boms_rejected_by_users",
        "boms",
        "users",
        ["rejected_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_boms_frozen_by_users",
        "boms",
        "users",
        ["frozen_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_boms_order_id", "boms", ["order_id"])
    op.create_index("ix_boms_quotation_id", "boms", ["quotation_id"])

    op.execute(
        """
        UPDATE boms SET is_legacy = true, is_active = true
        WHERE order_id IS NULL
        """
    )

    op.execute(
        """
        CREATE UNIQUE INDEX uq_boms_tenant_order_active
        ON boms (tenant_id, order_id)
        WHERE is_active = true AND order_id IS NOT NULL
        """
    )

    # bom_items new columns
    op.add_column("bom_items", sa.Column("quotation_line_id", sa.Integer(), nullable=True))
    op.add_column("bom_items", sa.Column("item_code_snapshot", sa.String(length=64), nullable=True))
    op.add_column("bom_items", sa.Column("description_snapshot", sa.String(length=255), nullable=True))
    op.add_column("bom_items", sa.Column("material_type", sa.String(length=32), nullable=True))
    op.add_column("bom_items", sa.Column("quoted_consumption_per_unit", sa.Numeric(18, 6), nullable=True))
    op.add_column("bom_items", sa.Column("quoted_unit_price", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("quoted_currency", sa.String(length=10), nullable=True))
    op.add_column("bom_items", sa.Column("quoted_total_cost", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("bom_net_consumption_per_unit", sa.Numeric(18, 6), nullable=True))
    op.add_column("bom_items", sa.Column("process_loss_pct", sa.Numeric(10, 4), nullable=True))
    op.add_column("bom_items", sa.Column("bom_gross_consumption_per_unit", sa.Numeric(18, 6), nullable=True))
    op.add_column("bom_items", sa.Column("order_qty_snapshot", sa.Integer(), nullable=True))
    op.add_column("bom_items", sa.Column("required_net_qty", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("wastage_qty", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("process_loss_qty", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("required_gross_qty", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("vendor_suggested_price", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("bom_expected_unit_price", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("bom_expected_total_cost", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("consumption_variance_pct", sa.Numeric(10, 4), nullable=True))
    op.add_column("bom_items", sa.Column("price_variance_pct", sa.Numeric(10, 4), nullable=True))
    op.add_column("bom_items", sa.Column("total_cost_variance", sa.Numeric(18, 4), nullable=True))
    op.add_column("bom_items", sa.Column("preferred_vendor_id", sa.Integer(), nullable=True))
    op.add_column("bom_items", sa.Column("remarks", sa.Text(), nullable=True))
    op.add_column("bom_items", sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"))

    op.create_foreign_key(
        "fk_bom_items_quotation_line_id",
        "bom_items",
        "quotation_materials",
        ["quotation_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_bom_items_preferred_vendor_id",
        "bom_items",
        "vendors",
        ["preferred_vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_bom_items_quotation_line_id", "bom_items", ["quotation_line_id"])

    op.add_column("purchase_orders", sa.Column("source_order_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_purchase_orders_source_order_id",
        "purchase_orders",
        "orders",
        ["source_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_purchase_orders_source_order_id", "purchase_orders", ["source_order_id"])

    op.add_column("purchase_order_items", sa.Column("source_bom_id", sa.Integer(), nullable=True))
    op.add_column("purchase_order_items", sa.Column("source_bom_line_id", sa.Integer(), nullable=True))
    op.add_column("purchase_order_items", sa.Column("source_order_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_poi_source_bom_id",
        "purchase_order_items",
        "boms",
        ["source_bom_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_poi_source_bom_line_id",
        "purchase_order_items",
        "bom_items",
        ["source_bom_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_poi_source_order_id",
        "purchase_order_items",
        "orders",
        ["source_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_poi_source_bom_line_id", "purchase_order_items", ["source_bom_line_id"])


def downgrade() -> None:
    op.drop_index("ix_poi_source_bom_line_id", table_name="purchase_order_items")
    op.drop_constraint("fk_poi_source_order_id", "purchase_order_items", type_="foreignkey")
    op.drop_constraint("fk_poi_source_bom_line_id", "purchase_order_items", type_="foreignkey")
    op.drop_constraint("fk_poi_source_bom_id", "purchase_order_items", type_="foreignkey")
    op.drop_column("purchase_order_items", "source_order_id")
    op.drop_column("purchase_order_items", "source_bom_line_id")
    op.drop_column("purchase_order_items", "source_bom_id")

    op.drop_index("ix_purchase_orders_source_order_id", table_name="purchase_orders")
    op.drop_constraint("fk_purchase_orders_source_order_id", "purchase_orders", type_="foreignkey")
    op.drop_column("purchase_orders", "source_order_id")

    op.drop_index("ix_bom_items_quotation_line_id", table_name="bom_items")
    op.drop_constraint("fk_bom_items_preferred_vendor_id", "bom_items", type_="foreignkey")
    op.drop_constraint("fk_bom_items_quotation_line_id", "bom_items", type_="foreignkey")
    op.drop_column("bom_items", "sort_order")
    op.drop_column("bom_items", "remarks")
    op.drop_column("bom_items", "preferred_vendor_id")
    op.drop_column("bom_items", "total_cost_variance")
    op.drop_column("bom_items", "price_variance_pct")
    op.drop_column("bom_items", "consumption_variance_pct")
    op.drop_column("bom_items", "bom_expected_total_cost")
    op.drop_column("bom_items", "bom_expected_unit_price")
    op.drop_column("bom_items", "vendor_suggested_price")
    op.drop_column("bom_items", "required_gross_qty")
    op.drop_column("bom_items", "process_loss_qty")
    op.drop_column("bom_items", "wastage_qty")
    op.drop_column("bom_items", "required_net_qty")
    op.drop_column("bom_items", "order_qty_snapshot")
    op.drop_column("bom_items", "bom_gross_consumption_per_unit")
    op.drop_column("bom_items", "process_loss_pct")
    op.drop_column("bom_items", "bom_net_consumption_per_unit")
    op.drop_column("bom_items", "quoted_total_cost")
    op.drop_column("bom_items", "quoted_currency")
    op.drop_column("bom_items", "quoted_unit_price")
    op.drop_column("bom_items", "quoted_consumption_per_unit")
    op.drop_column("bom_items", "material_type")
    op.drop_column("bom_items", "description_snapshot")
    op.drop_column("bom_items", "item_code_snapshot")
    op.drop_column("bom_items", "quotation_line_id")

    op.execute("DROP INDEX IF EXISTS uq_boms_tenant_order_active")

    op.drop_index("ix_boms_quotation_id", table_name="boms")
    op.drop_index("ix_boms_order_id", table_name="boms")
    op.drop_constraint("fk_boms_frozen_by_users", "boms", type_="foreignkey")
    op.drop_constraint("fk_boms_rejected_by_users", "boms", type_="foreignkey")
    op.drop_constraint("fk_boms_approved_by_users", "boms", type_="foreignkey")
    op.drop_constraint("fk_boms_submitted_by_users", "boms", type_="foreignkey")
    op.drop_constraint("fk_boms_revision_of_bom_id", "boms", type_="foreignkey")
    op.drop_constraint("fk_boms_quotation_id_quotations", "boms", type_="foreignkey")
    op.drop_constraint("fk_boms_order_id_orders", "boms", type_="foreignkey")
    op.drop_column("boms", "frozen_by")
    op.drop_column("boms", "frozen_at")
    op.drop_column("boms", "rejection_comment")
    op.drop_column("boms", "rejected_by")
    op.drop_column("boms", "rejected_at")
    op.drop_column("boms", "approved_by")
    op.drop_column("boms", "approved_at")
    op.drop_column("boms", "submitted_by")
    op.drop_column("boms", "submitted_at")
    op.drop_column("boms", "currency_snapshot")
    op.drop_column("boms", "order_qty_at_approval")
    op.drop_column("boms", "order_qty_snapshot")
    op.drop_column("boms", "quotation_code_snapshot")
    op.drop_column("boms", "order_code_snapshot")
    op.drop_column("boms", "revision_of_bom_id")
    op.drop_column("boms", "is_legacy")
    op.drop_column("boms", "is_active")
    op.drop_column("boms", "quotation_id")
    op.drop_column("boms", "order_id")
