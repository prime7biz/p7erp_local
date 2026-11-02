"""BD bond / UD registers + colour × size grid on purchase-order lines.

Additive only: two new UD tables, one nullable FK column on bonded_warehouse_entries,
and the purchase_order_color_size_lines table.

Revision ID: 242
Revises: 241
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "242"
down_revision: Union[str, None] = "241"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "bd_utilization_declarations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("ud_no", sa.String(64), nullable=False),
        sa.Column("amendment_no", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ud_date", sa.Date(), nullable=True),
        sa.Column("issuer", sa.String(16), nullable=False, server_default="BGMEA"),
        sa.Column("trade_case_id", sa.Integer(), sa.ForeignKey("trade_cases.id", ondelete="SET NULL"), nullable=True),
        sa.Column("export_lc_no", sa.String(64), nullable=True),
        sa.Column("buyer_name", sa.String(255), nullable=True),
        sa.Column("export_value_usd", sa.Numeric(18, 4), nullable=True),
        sa.Column("garment_qty", sa.Numeric(18, 4), nullable=True),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "ud_no", "amendment_no", name="uq_bd_ud_tenant_no_amendment"),
    )
    op.create_index("ix_bd_utilization_declarations_tenant_id", "bd_utilization_declarations", ["tenant_id"])
    op.create_index("ix_bd_utilization_declarations_ud_no", "bd_utilization_declarations", ["ud_no"])

    op.create_table(
        "bd_ud_entitlements",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "ud_id", sa.Integer(), sa.ForeignKey("bd_utilization_declarations.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("item_description", sa.String(255), nullable=False),
        sa.Column("hs_code", sa.String(16), nullable=True),
        sa.Column("uom", sa.String(16), nullable=True),
        sa.Column("entitled_qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("entitled_value_usd", sa.Numeric(18, 4), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_bd_ud_entitlements_tenant_id", "bd_ud_entitlements", ["tenant_id"])
    op.create_index("ix_bd_ud_entitlements_ud_id", "bd_ud_entitlements", ["ud_id"])

    op.add_column(
        "bonded_warehouse_entries",
        sa.Column(
            "ud_entitlement_id",
            sa.Integer(),
            sa.ForeignKey("bd_ud_entitlements.id", ondelete="SET NULL", name="fk_bonded_entries_ud_entitlement"),
            nullable=True,
        ),
    )
    op.create_index("ix_bonded_warehouse_entries_ud_entitlement_id", "bonded_warehouse_entries", ["ud_entitlement_id"])

    op.create_table(
        "purchase_order_color_size_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "purchase_order_id", sa.Integer(), sa.ForeignKey("purchase_orders.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column(
            "po_item_id", sa.Integer(), sa.ForeignKey("purchase_order_items.id", ondelete="CASCADE"), nullable=False
        ),
        sa.Column("color_name", sa.String(100), nullable=False),
        sa.Column("color_code", sa.String(32), nullable=True),
        sa.Column("size", sa.String(16), nullable=False),
        sa.Column("quantity", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("color_sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("size_sort", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("po_item_id", "color_name", "size", name="uq_po_item_color_size_cell"),
    )
    op.create_index("ix_purchase_order_color_size_lines_tenant_id", "purchase_order_color_size_lines", ["tenant_id"])
    op.create_index(
        "ix_purchase_order_color_size_lines_purchase_order_id", "purchase_order_color_size_lines", ["purchase_order_id"]
    )
    op.create_index("ix_purchase_order_color_size_lines_po_item_id", "purchase_order_color_size_lines", ["po_item_id"])


def downgrade() -> None:
    op.drop_index("ix_purchase_order_color_size_lines_po_item_id", table_name="purchase_order_color_size_lines")
    op.drop_index("ix_purchase_order_color_size_lines_purchase_order_id", table_name="purchase_order_color_size_lines")
    op.drop_index("ix_purchase_order_color_size_lines_tenant_id", table_name="purchase_order_color_size_lines")
    op.drop_table("purchase_order_color_size_lines")
    op.drop_index("ix_bonded_warehouse_entries_ud_entitlement_id", table_name="bonded_warehouse_entries")
    op.drop_constraint("fk_bonded_entries_ud_entitlement", "bonded_warehouse_entries", type_="foreignkey")
    op.drop_column("bonded_warehouse_entries", "ud_entitlement_id")
    op.drop_index("ix_bd_ud_entitlements_ud_id", table_name="bd_ud_entitlements")
    op.drop_index("ix_bd_ud_entitlements_tenant_id", table_name="bd_ud_entitlements")
    op.drop_table("bd_ud_entitlements")
    op.drop_index("ix_bd_utilization_declarations_ud_no", table_name="bd_utilization_declarations")
    op.drop_index("ix_bd_utilization_declarations_tenant_id", table_name="bd_utilization_declarations")
    op.drop_table("bd_utilization_declarations")
