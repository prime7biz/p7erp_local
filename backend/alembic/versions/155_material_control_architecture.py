"""Material control: BOM header fields, GRN acceptance/traceability, stock ledger refs,
vendor bills, process order extensions, production material issues, acknowledgements.

Revision ID: 155
Revises: 154
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "155"
down_revision: Union[str, None] = "154"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- BOM header (order-driven) ---
    op.add_column("boms", sa.Column("bom_code", sa.String(length=32), nullable=True))
    op.add_column("boms", sa.Column("customer_id", sa.Integer(), nullable=True))
    op.add_column("boms", sa.Column("delivery_date_snapshot", sa.Date(), nullable=True))
    op.create_foreign_key(
        "fk_boms_customer_id_customers",
        "boms",
        "customers",
        ["customer_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_boms_customer_id", "boms", ["customer_id"])

    op.execute(
        """
        UPDATE boms b
        SET bom_code = 'BOM-' || LPAD(b.id::text, 6, '0')
        WHERE bom_code IS NULL
        """
    )
    op.execute(
        """
        UPDATE boms b
        SET customer_id = o.customer_id
        FROM orders o
        WHERE b.order_id = o.id AND b.customer_id IS NULL
        """
    )
    op.execute(
        """
        UPDATE boms b
        SET delivery_date_snapshot = o.delivery_date
        FROM orders o
        WHERE b.order_id = o.id AND b.delivery_date_snapshot IS NULL
        """
    )

    # --- PO line: quotation material link ---
    op.add_column(
        "purchase_order_items",
        sa.Column("source_quotation_line_id", sa.Integer(), nullable=True),
    )
    op.create_foreign_key(
        "fk_poi_source_quotation_line_id",
        "purchase_order_items",
        "quotation_materials",
        ["source_quotation_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_poi_source_quotation_line_id",
        "purchase_order_items",
        ["source_quotation_line_id"],
    )

    # --- Goods receiving header ---
    op.add_column("goods_receiving", sa.Column("vendor_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("default_warehouse_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("source_type", sa.String(length=16), nullable=True))
    op.add_column("goods_receiving", sa.Column("approval_status", sa.String(length=24), nullable=True))
    op.add_column(
        "goods_receiving", sa.Column("supplier_delivery_challan_no", sa.String(length=128), nullable=True)
    )
    op.add_column("goods_receiving", sa.Column("supplier_invoice_no", sa.String(length=128), nullable=True))
    op.add_column("goods_receiving", sa.Column("vehicle_info", sa.String(length=255), nullable=True))
    op.add_column("goods_receiving", sa.Column("non_po_reason", sa.Text(), nullable=True))
    op.add_column("goods_receiving", sa.Column("approved_by_user_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("approved_at", sa.DateTime(), nullable=True))
    op.add_column("goods_receiving", sa.Column("acknowledgement_issued", sa.Boolean(), nullable=True))
    op.add_column("goods_receiving", sa.Column("acknowledgement_at", sa.DateTime(), nullable=True))
    op.add_column("goods_receiving", sa.Column("acknowledged_by_user_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("source_order_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("source_bom_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("btb_lc_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("master_contract_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving", sa.Column("export_case_id", sa.Integer(), nullable=True))

    op.create_foreign_key(
        "fk_grn_vendor_id",
        "goods_receiving",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_default_wh",
        "goods_receiving",
        "warehouses",
        ["default_warehouse_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_approved_by",
        "goods_receiving",
        "users",
        ["approved_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_ack_by",
        "goods_receiving",
        "users",
        ["acknowledged_by_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_source_order",
        "goods_receiving",
        "orders",
        ["source_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_source_bom",
        "goods_receiving",
        "boms",
        ["source_bom_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_btb_lc",
        "goods_receiving",
        "btb_lcs",
        ["btb_lc_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_master_contract",
        "goods_receiving",
        "master_contracts",
        ["master_contract_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_grn_export_case",
        "goods_receiving",
        "export_cases",
        ["export_case_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute("UPDATE goods_receiving SET source_type = 'PO' WHERE purchase_order_id IS NOT NULL")
    op.execute("UPDATE goods_receiving SET source_type = 'NON_PO' WHERE purchase_order_id IS NULL")
    op.execute("UPDATE goods_receiving SET approval_status = 'APPROVED' WHERE status = 'RECEIVED'")
    op.execute("UPDATE goods_receiving SET approval_status = 'PENDING' WHERE approval_status IS NULL")
    op.execute("UPDATE goods_receiving SET acknowledgement_issued = false WHERE acknowledgement_issued IS NULL")

    # --- Goods receiving lines ---
    op.add_column(
        "goods_receiving_items",
        sa.Column("purchase_order_line_id", sa.Integer(), nullable=True),
    )
    op.add_column("goods_receiving_items", sa.Column("ordered_qty", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("previously_received_qty", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("received_qty", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("accepted_qty", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("rejected_qty", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("pending_qty", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("unit_price", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("accepted_value", sa.String(length=32), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("rejection_reason", sa.Text(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("source_order_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("source_bom_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("source_bom_line_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("master_contract_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("export_case_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("btb_lc_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("vendor_id", sa.Integer(), nullable=True))
    op.add_column("goods_receiving_items", sa.Column("line_remarks", sa.Text(), nullable=True))

    op.create_foreign_key(
        "fk_gri_po_line",
        "goods_receiving_items",
        "purchase_order_items",
        ["purchase_order_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_gri_src_order",
        "goods_receiving_items",
        "orders",
        ["source_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_gri_src_bom",
        "goods_receiving_items",
        "boms",
        ["source_bom_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_gri_src_bom_line",
        "goods_receiving_items",
        "bom_items",
        ["source_bom_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_gri_mc",
        "goods_receiving_items",
        "master_contracts",
        ["master_contract_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_gri_ec",
        "goods_receiving_items",
        "export_cases",
        ["export_case_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_gri_btb",
        "goods_receiving_items",
        "btb_lcs",
        ["btb_lc_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_gri_vendor",
        "goods_receiving_items",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute(
        """
        UPDATE goods_receiving_items
        SET received_qty = quantity,
            accepted_qty = quantity
        WHERE received_qty IS NULL
        """
    )

    # --- Acknowledgements (optional formal doc) ---
    op.create_table(
        "goods_receiving_acknowledgements",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("goods_receiving_id", sa.Integer(), nullable=False),
        sa.Column("gra_code", sa.String(length=32), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="ISSUED"),
        sa.Column("issued_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["goods_receiving_id"], ["goods_receiving.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["issued_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "gra_code", name="uq_gra_tenant_code"),
    )
    op.create_index("ix_gra_tenant_grn", "goods_receiving_acknowledgements", ["tenant_id", "goods_receiving_id"])

    # --- Vendor bills (Finance AP) ---
    op.create_table(
        "vendor_bills",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("bill_code", sa.String(length=32), nullable=False),
        sa.Column("vendor_id", sa.Integer(), nullable=False),
        sa.Column("vendor_invoice_ref", sa.String(length=128), nullable=True),
        sa.Column("vendor_invoice_date", sa.Date(), nullable=True),
        sa.Column("bill_date", sa.Date(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("exchange_rate_to_base", sa.Numeric(18, 6), nullable=True),
        sa.Column("subtotal_amount", sa.String(length=32), nullable=True),
        sa.Column("tax_amount", sa.String(length=32), nullable=True),
        sa.Column("total_amount", sa.String(length=32), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="DRAFT"),
        sa.Column("goods_receiving_id", sa.Integer(), nullable=True),
        sa.Column("purchase_order_id", sa.Integer(), nullable=True),
        sa.Column("source_order_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("is_non_po_receipt", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("voucher_id", sa.Integer(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("posted_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["goods_receiving_id"], ["goods_receiving.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["purchase_order_id"], ["purchase_orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["source_order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["voucher_id"], ["vouchers.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "bill_code", name="uq_vendor_bills_tenant_bill_code"),
    )
    op.create_index("ix_vendor_bills_tenant_vendor", "vendor_bills", ["tenant_id", "vendor_id"])

    op.create_table(
        "vendor_bill_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("vendor_bill_id", sa.Integer(), nullable=False),
        sa.Column("goods_receiving_item_id", sa.Integer(), nullable=True),
        sa.Column("purchase_order_line_id", sa.Integer(), nullable=True),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("quantity", sa.String(length=32), nullable=False),
        sa.Column("unit_price", sa.String(length=32), nullable=False),
        sa.Column("line_total", sa.String(length=32), nullable=True),
        sa.Column("tax_rate", sa.String(length=16), nullable=True),
        sa.Column("tax_amount", sa.String(length=32), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_bill_id"], ["vendor_bills.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["goods_receiving_item_id"], ["goods_receiving_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["purchase_order_line_id"], ["purchase_order_items.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_vbl_bill", "vendor_bill_lines", ["vendor_bill_id"])

    # --- Stock movement traceability ---
    op.add_column("stock_movements", sa.Column("movement_kind", sa.String(length=48), nullable=True))
    op.add_column("stock_movements", sa.Column("source_line_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("order_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("bom_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("bom_line_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("purchase_order_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("purchase_order_line_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("goods_receiving_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("goods_receiving_item_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("process_order_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("vendor_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("master_contract_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("btb_lc_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("export_case_id", sa.Integer(), nullable=True))
    op.add_column("stock_movements", sa.Column("production_material_issue_id", sa.Integer(), nullable=True))

    op.create_foreign_key(
        "fk_sm_order",
        "stock_movements",
        "orders",
        ["order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_bom",
        "stock_movements",
        "boms",
        ["bom_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_bom_line",
        "stock_movements",
        "bom_items",
        ["bom_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_po",
        "stock_movements",
        "purchase_orders",
        ["purchase_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_poi",
        "stock_movements",
        "purchase_order_items",
        ["purchase_order_line_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_grn",
        "stock_movements",
        "goods_receiving",
        ["goods_receiving_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_gri",
        "stock_movements",
        "goods_receiving_items",
        ["goods_receiving_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_process",
        "stock_movements",
        "process_orders",
        ["process_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_vendor",
        "stock_movements",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_mc",
        "stock_movements",
        "master_contracts",
        ["master_contract_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_btb",
        "stock_movements",
        "btb_lcs",
        ["btb_lc_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_sm_ec",
        "stock_movements",
        "export_cases",
        ["export_case_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # production_material_issue FK added after table creation
    op.create_index("ix_sm_tenant_kind", "stock_movements", ["tenant_id", "movement_kind"])

    # --- Process order extensions ---
    op.add_column("process_orders", sa.Column("process_stage", sa.String(length=64), nullable=True))
    op.add_column("process_orders", sa.Column("prior_process_order_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("vendor_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("output_warehouse_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("source_bom_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("source_order_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("btb_lc_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("master_contract_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("export_case_id", sa.Integer(), nullable=True))
    op.add_column("process_orders", sa.Column("planned_loss_pct", sa.String(length=32), nullable=True))
    op.add_column("process_orders", sa.Column("actual_loss_qty", sa.String(length=32), nullable=True))
    op.add_column("process_orders", sa.Column("output_grade", sa.String(length=64), nullable=True))
    op.add_column("process_orders", sa.Column("output_lot_number", sa.String(length=64), nullable=True))
    op.add_column("process_orders", sa.Column("output_same_as_input", sa.Boolean(), nullable=True))
    op.add_column("process_orders", sa.Column("approval_status", sa.String(length=24), nullable=True))

    op.create_foreign_key(
        "fk_po_prior",
        "process_orders",
        "process_orders",
        ["prior_process_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_po_vendor",
        "process_orders",
        "vendors",
        ["vendor_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_po_out_wh",
        "process_orders",
        "warehouses",
        ["output_warehouse_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_po_src_bom",
        "process_orders",
        "boms",
        ["source_bom_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_po_src_order",
        "process_orders",
        "orders",
        ["source_order_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_po_btb",
        "process_orders",
        "btb_lcs",
        ["btb_lc_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_po_mc",
        "process_orders",
        "master_contracts",
        ["master_contract_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_po_ec",
        "process_orders",
        "export_cases",
        ["export_case_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.execute("UPDATE process_orders SET output_same_as_input = false WHERE output_same_as_input IS NULL")

    op.create_table(
        "process_order_cost_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("process_order_id", sa.Integer(), nullable=False),
        sa.Column("cost_type", sa.String(length=64), nullable=False),
        sa.Column("description", sa.String(length=255), nullable=True),
        sa.Column("vendor_id", sa.Integer(), nullable=True),
        sa.Column("amount", sa.String(length=32), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["process_order_id"], ["process_orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["vendor_id"], ["vendors.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pocl_po", "process_order_cost_lines", ["process_order_id"])

    # --- Production material issue ---
    op.create_table(
        "production_material_issues",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("issue_code", sa.String(length=32), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("bom_id", sa.Integer(), nullable=False),
        sa.Column("production_stage", sa.String(length=64), nullable=False),
        sa.Column("covered_order_qty", sa.Integer(), nullable=False),
        sa.Column("warehouse_id", sa.Integer(), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=24), nullable=False, server_default="DRAFT"),
        sa.Column("approval_status", sa.String(length=24), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_by_user_id", sa.Integer(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bom_id"], ["boms.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["warehouse_id"], ["warehouses.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["approved_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "issue_code", name="uq_pmi_tenant_issue_code"),
    )
    op.create_index("ix_pmi_tenant_order", "production_material_issues", ["tenant_id", "order_id"])

    op.create_table(
        "production_material_issue_lines",
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("issue_id", sa.Integer(), nullable=False),
        sa.Column("bom_line_id", sa.Integer(), nullable=False),
        sa.Column("item_id", sa.Integer(), nullable=False),
        sa.Column("standard_qty_for_covered", sa.String(length=32), nullable=True),
        sa.Column("planned_wastage_qty", sa.String(length=32), nullable=True),
        sa.Column("planned_process_loss_qty", sa.String(length=32), nullable=True),
        sa.Column("actual_issue_qty", sa.String(length=32), nullable=False),
        sa.Column("variance_qty", sa.String(length=32), nullable=True),
        sa.Column("variance_pct", sa.String(length=32), nullable=True),
        sa.Column("variance_reason", sa.Text(), nullable=True),
        sa.Column("variance_type", sa.String(length=48), nullable=True),
        sa.Column("approval_required", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("stock_movement_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["issue_id"], ["production_material_issues.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["bom_line_id"], ["bom_items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["item_id"], ["items.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["stock_movement_id"], ["stock_movements.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pmil_issue", "production_material_issue_lines", ["issue_id"])

    op.create_foreign_key(
        "fk_sm_pmi",
        "stock_movements",
        "production_material_issues",
        ["production_material_issue_id"],
        ["id"],
        ondelete="SET NULL",
    )


def downgrade() -> None:
    op.drop_constraint("fk_sm_pmi", "stock_movements", type_="foreignkey")
    op.drop_table("production_material_issue_lines")
    op.drop_table("production_material_issues")

    op.drop_table("process_order_cost_lines")

    op.drop_constraint("fk_po_ec", "process_orders", type_="foreignkey")
    op.drop_constraint("fk_po_mc", "process_orders", type_="foreignkey")
    op.drop_constraint("fk_po_btb", "process_orders", type_="foreignkey")
    op.drop_constraint("fk_po_src_order", "process_orders", type_="foreignkey")
    op.drop_constraint("fk_po_src_bom", "process_orders", type_="foreignkey")
    op.drop_constraint("fk_po_out_wh", "process_orders", type_="foreignkey")
    op.drop_constraint("fk_po_vendor", "process_orders", type_="foreignkey")
    op.drop_constraint("fk_po_prior", "process_orders", type_="foreignkey")
    for col in (
        "approval_status",
        "output_same_as_input",
        "output_lot_number",
        "output_grade",
        "actual_loss_qty",
        "planned_loss_pct",
        "export_case_id",
        "master_contract_id",
        "btb_lc_id",
        "source_order_id",
        "source_bom_id",
        "output_warehouse_id",
        "vendor_id",
        "prior_process_order_id",
        "process_stage",
    ):
        op.drop_column("process_orders", col)

    op.drop_index("ix_sm_tenant_kind", table_name="stock_movements")
    for fk in (
        "fk_sm_ec",
        "fk_sm_btb",
        "fk_sm_mc",
        "fk_sm_vendor",
        "fk_sm_process",
        "fk_sm_gri",
        "fk_sm_grn",
        "fk_sm_poi",
        "fk_sm_po",
        "fk_sm_bom_line",
        "fk_sm_bom",
        "fk_sm_order",
    ):
        op.drop_constraint(fk, "stock_movements", type_="foreignkey")
    for col in (
        "production_material_issue_id",
        "export_case_id",
        "btb_lc_id",
        "master_contract_id",
        "vendor_id",
        "process_order_id",
        "goods_receiving_item_id",
        "goods_receiving_id",
        "purchase_order_line_id",
        "purchase_order_id",
        "bom_line_id",
        "bom_id",
        "order_id",
        "source_line_id",
        "movement_kind",
    ):
        op.drop_column("stock_movements", col)

    op.drop_table("vendor_bill_lines")
    op.drop_table("vendor_bills")

    op.drop_table("goods_receiving_acknowledgements")

    for fk in (
        "fk_gri_vendor",
        "fk_gri_btb",
        "fk_gri_ec",
        "fk_gri_mc",
        "fk_gri_src_bom_line",
        "fk_gri_src_bom",
        "fk_gri_src_order",
        "fk_gri_po_line",
    ):
        op.drop_constraint(fk, "goods_receiving_items", type_="foreignkey")
    for col in (
        "line_remarks",
        "vendor_id",
        "btb_lc_id",
        "export_case_id",
        "master_contract_id",
        "source_bom_line_id",
        "source_bom_id",
        "source_order_id",
        "rejection_reason",
        "accepted_value",
        "unit_price",
        "pending_qty",
        "rejected_qty",
        "accepted_qty",
        "received_qty",
        "previously_received_qty",
        "ordered_qty",
        "purchase_order_line_id",
    ):
        op.drop_column("goods_receiving_items", col)

    for fk in (
        "fk_grn_export_case",
        "fk_grn_master_contract",
        "fk_grn_btb_lc",
        "fk_grn_source_bom",
        "fk_grn_source_order",
        "fk_grn_ack_by",
        "fk_grn_approved_by",
        "fk_grn_default_wh",
        "fk_grn_vendor",
    ):
        op.drop_constraint(fk, "goods_receiving", type_="foreignkey")
    for col in (
        "export_case_id",
        "master_contract_id",
        "btb_lc_id",
        "source_bom_id",
        "source_order_id",
        "acknowledged_by_user_id",
        "acknowledgement_at",
        "acknowledgement_issued",
        "approved_at",
        "approved_by_user_id",
        "non_po_reason",
        "vehicle_info",
        "supplier_invoice_no",
        "supplier_delivery_challan_no",
        "approval_status",
        "source_type",
        "default_warehouse_id",
        "vendor_id",
    ):
        op.drop_column("goods_receiving", col)

    op.drop_index("ix_poi_source_quotation_line_id", table_name="purchase_order_items")
    op.drop_constraint("fk_poi_source_quotation_line_id", "purchase_order_items", type_="foreignkey")
    op.drop_column("purchase_order_items", "source_quotation_line_id")

    op.drop_index("ix_boms_customer_id", table_name="boms")
    op.drop_constraint("fk_boms_customer_id_customers", "boms", type_="foreignkey")
    op.drop_column("boms", "delivery_date_snapshot")
    op.drop_column("boms", "customer_id")
    op.drop_column("boms", "bom_code")
