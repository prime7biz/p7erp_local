"""Indexes for foreign-key columns on hot parent tables (plus one tenant lookup).

Why: PostgreSQL does not index a foreign-key column automatically. Without an index,
(a) "show the orders of this customer" style queries scan the whole child table, and
(b) every DELETE of a parent row (e.g. a draft voucher, or the old lines replaced when a
voucher is edited) must scan each child table to apply ON DELETE CASCADE / SET NULL / RESTRICT.

Scope: child columns pointing at customers, inquiries/quotations, purchase_orders,
goods_receiving(+items), vouchers, voucher_lines and orders. Where the SQLAlchemy model
already declares `index=True`, the default name `ix_<table>_<column>` is reused so the
database finally matches the model.

Built with CREATE INDEX CONCURRENTLY inside an autocommit block (no write lock).

Rollback: `alembic downgrade 248` (drops only the indexes added here).

Revision ID: 249
Revises: 248
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "249"
down_revision: Union[str, None] = "248"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (table, column) -> index name ix_<table>_<column>
FK_COLUMNS: list[tuple[str, str]] = [
    # -> customers
    ("orders", "customer_id"),
    ("quotations", "customer_id"),
    ("inquiries", "customer_id"),
    ("garment_styles", "buyer_customer_id"),
    ("knitting_work_orders", "customer_id"),
    # -> inquiries
    ("quotations", "inquiry_id"),
    ("merch_sample_requests", "inquiry_id"),
    # -> purchase_orders
    ("goods_receiving", "purchase_order_id"),
    ("vendor_bills", "purchase_order_id"),
    ("planned_orders", "generated_po_id"),
    ("purchase_requisitions", "purchase_order_id"),
    ("reorder_suggestions", "generated_po_id"),
    # -> goods_receiving / goods_receiving_items
    ("vendor_bills", "goods_receiving_id"),
    ("goods_receiving_acknowledgements", "goods_receiving_id"),
    ("grn_quality_inspections", "grn_item_id"),
    ("stock_batches", "goods_receiving_item_id"),
    ("stock_serials", "grn_item_id"),
    ("vendor_bill_lines", "goods_receiving_item_id"),
    # -> vouchers
    ("vendor_bills", "voucher_id"),
    ("hr_payroll_postings", "voucher_id"),
    ("btb_maturity_tranches", "payment_voucher_id"),
    ("commission_statements", "voucher_id"),
    ("hr_employee_advances", "disbursement_voucher_id"),
    ("inter_department_transfers", "source_voucher_id"),
    ("inter_department_transfers", "target_voucher_id"),
    ("tds_deductions", "tds_liability_voucher_id"),
    # -> voucher_lines (voucher edit deletes and re-inserts every line)
    ("party_ledger_bills", "voucher_line_id"),
    ("party_ledger_bill_allocations", "voucher_line_id"),
    ("voucher_tax_lines", "voucher_line_id"),
    # -> orders
    ("cm_cost_actuals", "order_id"),
    ("commercial_invoice_receipt_allocations", "order_id"),
    ("department_production_plans", "order_id"),
    ("dye_batches", "order_id"),
    ("knitting_plans", "order_id"),
    ("knitting_work_orders", "linked_order_id"),
    ("marker_plans", "order_id"),
    ("process_orders", "linked_order_id"),
    ("production_material_issues", "order_id"),
    ("stock_reservations", "order_id"),
    ("vendor_bills", "source_order_id"),
]

# (index name, "table (columns...)")
INDEXES: list[tuple[str, str]] = [(f"ix_{table}_{column}", f"{table} ({column})") for table, column in FK_COLUMNS] + [
    # merch alerts filter related entities by (tenant_id, entity_id) with or without entity_type.
    ("ix_alert_related_entity_tenant_entity", "alert_related_entity (tenant_id, entity_id, entity_type)"),
]


def _create_index_concurrently(name: str, target: str) -> None:
    # A failed CONCURRENTLY build leaves an INVALID index behind; IF NOT EXISTS would then skip it.
    is_invalid = op.get_bind().execute(
        sa.text("SELECT NOT indisvalid FROM pg_index WHERE indexrelid = to_regclass(:name)"),
        {"name": name},
    ).scalar()
    if is_invalid:
        op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
    op.execute(f"CREATE INDEX CONCURRENTLY IF NOT EXISTS {name} ON {target}")


def upgrade() -> None:
    with op.get_context().autocommit_block():
        for name, target in INDEXES:
            _create_index_concurrently(name, target)


def downgrade() -> None:
    with op.get_context().autocommit_block():
        for name, _target in reversed(INDEXES):
            op.execute(f"DROP INDEX CONCURRENTLY IF EXISTS {name}")
