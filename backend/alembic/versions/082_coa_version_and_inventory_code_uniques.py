"""Chart of Accounts row version (optimistic lock) + tenant-scoped document code uniques.

Revision ID: 082
Revises: 081
Create Date: 2026-03-21

Before upgrade: resolve duplicate (tenant_id, <code>) rows in affected tables or this migration will fail.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "082"
down_revision: Union[str, None] = "081"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "chart_of_accounts",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.alter_column("chart_of_accounts", "version", server_default=None)

    op.create_unique_constraint(
        "uq_warehouses_tenant_warehouse_code",
        "warehouses",
        ["tenant_id", "warehouse_code"],
    )
    op.create_unique_constraint(
        "uq_stock_groups_tenant_group_code",
        "stock_groups",
        ["tenant_id", "group_code"],
    )
    op.create_unique_constraint(
        "uq_vendors_tenant_vendor_code",
        "vendors",
        ["tenant_id", "vendor_code"],
    )
    op.create_unique_constraint(
        "uq_purchase_orders_tenant_po_code",
        "purchase_orders",
        ["tenant_id", "po_code"],
    )
    op.create_unique_constraint(
        "uq_goods_receiving_tenant_grn_code",
        "goods_receiving",
        ["tenant_id", "grn_code"],
    )
    op.create_unique_constraint(
        "uq_delivery_challans_tenant_challan_code",
        "delivery_challans",
        ["tenant_id", "challan_code"],
    )
    op.create_unique_constraint(
        "uq_enhanced_gate_passes_tenant_gate_pass_code",
        "enhanced_gate_passes",
        ["tenant_id", "gate_pass_code"],
    )
    op.create_unique_constraint(
        "uq_process_orders_tenant_process_number",
        "process_orders",
        ["tenant_id", "process_number"],
    )
    op.create_unique_constraint(
        "uq_manufacturing_orders_tenant_mo_number",
        "manufacturing_orders",
        ["tenant_id", "mo_number"],
    )
    op.create_unique_constraint(
        "uq_warehouse_transfers_tenant_transfer_code",
        "warehouse_transfers",
        ["tenant_id", "transfer_code"],
    )
    op.create_unique_constraint(
        "uq_stock_adjustments_tenant_adjust_code",
        "stock_adjustments",
        ["tenant_id", "adjust_code"],
    )
    op.create_unique_constraint(
        "uq_mfg_work_orders_tenant_mo_number",
        "mfg_work_orders",
        ["tenant_id", "mo_number"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_mfg_work_orders_tenant_mo_number", "mfg_work_orders", type_="unique")
    op.drop_constraint("uq_stock_adjustments_tenant_adjust_code", "stock_adjustments", type_="unique")
    op.drop_constraint("uq_warehouse_transfers_tenant_transfer_code", "warehouse_transfers", type_="unique")
    op.drop_constraint("uq_manufacturing_orders_tenant_mo_number", "manufacturing_orders", type_="unique")
    op.drop_constraint("uq_process_orders_tenant_process_number", "process_orders", type_="unique")
    op.drop_constraint("uq_enhanced_gate_passes_tenant_gate_pass_code", "enhanced_gate_passes", type_="unique")
    op.drop_constraint("uq_delivery_challans_tenant_challan_code", "delivery_challans", type_="unique")
    op.drop_constraint("uq_goods_receiving_tenant_grn_code", "goods_receiving", type_="unique")
    op.drop_constraint("uq_purchase_orders_tenant_po_code", "purchase_orders", type_="unique")
    op.drop_constraint("uq_vendors_tenant_vendor_code", "vendors", type_="unique")
    op.drop_constraint("uq_stock_groups_tenant_group_code", "stock_groups", type_="unique")
    op.drop_constraint("uq_warehouses_tenant_warehouse_code", "warehouses", type_="unique")

    op.drop_column("chart_of_accounts", "version")
