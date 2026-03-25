"""Add indexes for common FK and filter columns (finance, inventory, HR, production).

Revision ID: 111
Revises: 110
Create Date: 2026-03-25
"""

from typing import Sequence, Union

from alembic import op


revision: str = "111"
down_revision: Union[str, None] = "110"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Finance
    op.execute("CREATE INDEX IF NOT EXISTS ix_bill_references_created_by ON bill_references (created_by)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_bill_allocations_voucher_line_id ON bill_allocations (voucher_line_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_bill_allocations_account_id ON bill_allocations (account_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_bill_allocations_created_by ON bill_allocations (created_by)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_bank_statement_lines_transaction_date ON bank_statement_lines (transaction_date)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_bank_reconciliations_statement_date ON bank_reconciliations (statement_date)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_payment_runs_run_date ON payment_runs (run_date)")
    # Inventory
    op.execute("CREATE INDEX IF NOT EXISTS ix_inventory_gl_postings_voucher_id ON inventory_gl_postings (voucher_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_physical_inventory_sessions_warehouse_id ON physical_inventory_sessions (warehouse_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_warehouse_transfers_from_warehouse_id ON warehouse_transfers (from_warehouse_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_warehouse_transfers_to_warehouse_id ON warehouse_transfers (to_warehouse_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_adjustments_warehouse_id ON stock_adjustments (warehouse_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_stock_adjustments_item_id ON stock_adjustments (item_id)")
    # HR
    op.execute("CREATE INDEX IF NOT EXISTS ix_hr_sections_head_employee_id ON hr_sections (head_employee_id)")
    # Production
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hourly_production_entries_line_id ON hourly_production_entries (line_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hourly_production_entries_order_id ON hourly_production_entries (order_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hourly_production_entries_style_id ON hourly_production_entries (style_id)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_hourly_production_entries_shift_id ON hourly_production_entries (shift_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_cutting_bundles_order_id ON cutting_bundles (order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_cutting_bundles_style_id ON cutting_bundles (style_id)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_cutting_bundles_issued_to_line_id ON cutting_bundles (issued_to_line_id)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS ix_wip_journals_order_id ON wip_journals (order_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wip_journals_voucher_id ON wip_journals (voucher_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_wip_journals_cost_center_id ON wip_journals (cost_center_id)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_line_crew_sheet_headers_status ON line_crew_sheet_headers (status)")


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_line_crew_sheet_headers_status")
    op.execute("DROP INDEX IF EXISTS ix_wip_journals_cost_center_id")
    op.execute("DROP INDEX IF EXISTS ix_wip_journals_voucher_id")
    op.execute("DROP INDEX IF EXISTS ix_wip_journals_order_id")
    op.execute("DROP INDEX IF EXISTS ix_cutting_bundles_issued_to_line_id")
    op.execute("DROP INDEX IF EXISTS ix_cutting_bundles_style_id")
    op.execute("DROP INDEX IF EXISTS ix_cutting_bundles_order_id")
    op.execute("DROP INDEX IF EXISTS ix_hourly_production_entries_shift_id")
    op.execute("DROP INDEX IF EXISTS ix_hourly_production_entries_style_id")
    op.execute("DROP INDEX IF EXISTS ix_hourly_production_entries_order_id")
    op.execute("DROP INDEX IF EXISTS ix_hourly_production_entries_line_id")
    op.execute("DROP INDEX IF EXISTS ix_hr_sections_head_employee_id")
    op.execute("DROP INDEX IF EXISTS ix_stock_adjustments_item_id")
    op.execute("DROP INDEX IF EXISTS ix_stock_adjustments_warehouse_id")
    op.execute("DROP INDEX IF EXISTS ix_warehouse_transfers_to_warehouse_id")
    op.execute("DROP INDEX IF EXISTS ix_warehouse_transfers_from_warehouse_id")
    op.execute("DROP INDEX IF EXISTS ix_physical_inventory_sessions_warehouse_id")
    op.execute("DROP INDEX IF EXISTS ix_inventory_gl_postings_voucher_id")
    op.execute("DROP INDEX IF EXISTS ix_payment_runs_run_date")
    op.execute("DROP INDEX IF EXISTS ix_bank_reconciliations_statement_date")
    op.execute("DROP INDEX IF EXISTS ix_bank_statement_lines_transaction_date")
    op.execute("DROP INDEX IF EXISTS ix_bill_allocations_created_by")
    op.execute("DROP INDEX IF EXISTS ix_bill_allocations_account_id")
    op.execute("DROP INDEX IF EXISTS ix_bill_allocations_voucher_line_id")
    op.execute("DROP INDEX IF EXISTS ix_bill_references_created_by")
