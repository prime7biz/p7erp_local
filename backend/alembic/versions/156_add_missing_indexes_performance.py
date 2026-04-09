"""Add missing indexes for material-control FK columns (ORM index=True parity).

Revision ID: 156
Revises: 155
"""

from typing import Sequence, Union

from alembic import op


revision: str = "156"
down_revision: Union[str, None] = "155"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # stock_movements (13)
    op.create_index("ix_sm_order_id", "stock_movements", ["order_id"])
    op.create_index("ix_sm_bom_id", "stock_movements", ["bom_id"])
    op.create_index("ix_sm_bom_line_id", "stock_movements", ["bom_line_id"])
    op.create_index("ix_sm_purchase_order_id", "stock_movements", ["purchase_order_id"])
    op.create_index("ix_sm_purchase_order_line_id", "stock_movements", ["purchase_order_line_id"])
    op.create_index("ix_sm_goods_receiving_id", "stock_movements", ["goods_receiving_id"])
    op.create_index("ix_sm_goods_receiving_item_id", "stock_movements", ["goods_receiving_item_id"])
    op.create_index("ix_sm_process_order_id", "stock_movements", ["process_order_id"])
    op.create_index("ix_sm_vendor_id", "stock_movements", ["vendor_id"])
    op.create_index("ix_sm_master_contract_id", "stock_movements", ["master_contract_id"])
    op.create_index("ix_sm_btb_lc_id", "stock_movements", ["btb_lc_id"])
    op.create_index("ix_sm_export_case_id", "stock_movements", ["export_case_id"])
    op.create_index(
        "ix_sm_production_material_issue_id",
        "stock_movements",
        ["production_material_issue_id"],
    )

    # goods_receiving (9)
    op.create_index("ix_grn_vendor_id", "goods_receiving", ["vendor_id"])
    op.create_index("ix_grn_default_warehouse_id", "goods_receiving", ["default_warehouse_id"])
    op.create_index("ix_grn_approved_by_user_id", "goods_receiving", ["approved_by_user_id"])
    op.create_index("ix_grn_acknowledged_by_user_id", "goods_receiving", ["acknowledged_by_user_id"])
    op.create_index("ix_grn_source_order_id", "goods_receiving", ["source_order_id"])
    op.create_index("ix_grn_source_bom_id", "goods_receiving", ["source_bom_id"])
    op.create_index("ix_grn_btb_lc_id", "goods_receiving", ["btb_lc_id"])
    op.create_index("ix_grn_master_contract_id", "goods_receiving", ["master_contract_id"])
    op.create_index("ix_grn_export_case_id", "goods_receiving", ["export_case_id"])

    # goods_receiving_items (8)
    op.create_index("ix_gri_purchase_order_line_id", "goods_receiving_items", ["purchase_order_line_id"])
    op.create_index("ix_gri_source_order_id", "goods_receiving_items", ["source_order_id"])
    op.create_index("ix_gri_source_bom_id", "goods_receiving_items", ["source_bom_id"])
    op.create_index("ix_gri_source_bom_line_id", "goods_receiving_items", ["source_bom_line_id"])
    op.create_index("ix_gri_master_contract_id", "goods_receiving_items", ["master_contract_id"])
    op.create_index("ix_gri_export_case_id", "goods_receiving_items", ["export_case_id"])
    op.create_index("ix_gri_btb_lc_id", "goods_receiving_items", ["btb_lc_id"])
    op.create_index("ix_gri_vendor_id", "goods_receiving_items", ["vendor_id"])

    # process_orders (7)
    op.create_index("ix_po_prior_process_order_id", "process_orders", ["prior_process_order_id"])
    op.create_index("ix_po_vendor_id", "process_orders", ["vendor_id"])
    op.create_index("ix_po_output_warehouse_id", "process_orders", ["output_warehouse_id"])
    op.create_index("ix_po_source_bom_id", "process_orders", ["source_bom_id"])
    op.create_index("ix_po_source_order_id", "process_orders", ["source_order_id"])
    op.create_index("ix_po_btb_lc_id", "process_orders", ["btb_lc_id"])
    op.create_index("ix_po_master_contract_id", "process_orders", ["master_contract_id"])

    # purchase_order_items (2)
    op.create_index("ix_poi_source_bom_id", "purchase_order_items", ["source_bom_id"])
    op.create_index("ix_poi_source_order_id", "purchase_order_items", ["source_order_id"])


def downgrade() -> None:
    op.drop_index("ix_poi_source_order_id", table_name="purchase_order_items")
    op.drop_index("ix_poi_source_bom_id", table_name="purchase_order_items")

    op.drop_index("ix_po_master_contract_id", table_name="process_orders")
    op.drop_index("ix_po_btb_lc_id", table_name="process_orders")
    op.drop_index("ix_po_source_order_id", table_name="process_orders")
    op.drop_index("ix_po_source_bom_id", table_name="process_orders")
    op.drop_index("ix_po_output_warehouse_id", table_name="process_orders")
    op.drop_index("ix_po_vendor_id", table_name="process_orders")
    op.drop_index("ix_po_prior_process_order_id", table_name="process_orders")

    op.drop_index("ix_gri_vendor_id", table_name="goods_receiving_items")
    op.drop_index("ix_gri_btb_lc_id", table_name="goods_receiving_items")
    op.drop_index("ix_gri_export_case_id", table_name="goods_receiving_items")
    op.drop_index("ix_gri_master_contract_id", table_name="goods_receiving_items")
    op.drop_index("ix_gri_source_bom_line_id", table_name="goods_receiving_items")
    op.drop_index("ix_gri_source_bom_id", table_name="goods_receiving_items")
    op.drop_index("ix_gri_source_order_id", table_name="goods_receiving_items")
    op.drop_index("ix_gri_purchase_order_line_id", table_name="goods_receiving_items")

    op.drop_index("ix_grn_export_case_id", table_name="goods_receiving")
    op.drop_index("ix_grn_master_contract_id", table_name="goods_receiving")
    op.drop_index("ix_grn_btb_lc_id", table_name="goods_receiving")
    op.drop_index("ix_grn_source_bom_id", table_name="goods_receiving")
    op.drop_index("ix_grn_source_order_id", table_name="goods_receiving")
    op.drop_index("ix_grn_acknowledged_by_user_id", table_name="goods_receiving")
    op.drop_index("ix_grn_approved_by_user_id", table_name="goods_receiving")
    op.drop_index("ix_grn_default_warehouse_id", table_name="goods_receiving")
    op.drop_index("ix_grn_vendor_id", table_name="goods_receiving")

    op.drop_index("ix_sm_production_material_issue_id", table_name="stock_movements")
    op.drop_index("ix_sm_export_case_id", table_name="stock_movements")
    op.drop_index("ix_sm_btb_lc_id", table_name="stock_movements")
    op.drop_index("ix_sm_master_contract_id", table_name="stock_movements")
    op.drop_index("ix_sm_vendor_id", table_name="stock_movements")
    op.drop_index("ix_sm_process_order_id", table_name="stock_movements")
    op.drop_index("ix_sm_goods_receiving_item_id", table_name="stock_movements")
    op.drop_index("ix_sm_goods_receiving_id", table_name="stock_movements")
    op.drop_index("ix_sm_purchase_order_line_id", table_name="stock_movements")
    op.drop_index("ix_sm_purchase_order_id", table_name="stock_movements")
    op.drop_index("ix_sm_bom_line_id", table_name="stock_movements")
    op.drop_index("ix_sm_bom_id", table_name="stock_movements")
    op.drop_index("ix_sm_order_id", table_name="stock_movements")
