"""Composite indexes for the hottest report and list queries.

Each index matches a real query (filters, then sort order):

- vouchers (tenant_id, voucher_date DESC, id DESC): voucher list / day book by date range.
- vouchers (tenant_id, status, voucher_date, id): POSTED-only reports (trial balance, ledger,
  cash flow) and status-filtered voucher lists.
- voucher_lines (tenant_id, account_id, voucher_id) INCLUDE (entry_type, amount, base_amount,
  exchange_rate): trial balance / ledger sums can read the index without visiting the table.
- audit_logs (tenant_id, created_at DESC): audit log screens, newest first.
- audit_logs (tenant_id, resource, created_at): voucher / document edit history.
- hr_attendance_entries (tenant_id, attendance_date, id): attendance lists and daily counts.

Built with CREATE INDEX CONCURRENTLY: no table write lock, but it cannot run inside a
transaction, so it uses an autocommit block (same pattern as revision 184).

Rollback: `alembic downgrade 247` (drops only the indexes added here).

Revision ID: 248
Revises: 247
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "248"
down_revision: Union[str, None] = "247"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# (index name, "table (columns...)")
INDEXES: list[tuple[str, str]] = [
    ("ix_vouchers_tenant_date_id", "vouchers (tenant_id, voucher_date DESC, id DESC)"),
    ("ix_vouchers_tenant_status_date_id", "vouchers (tenant_id, status, voucher_date, id)"),
    (
        "ix_voucher_lines_tenant_account_cover",
        "voucher_lines (tenant_id, account_id, voucher_id) INCLUDE (entry_type, amount, base_amount, exchange_rate)",
    ),
    ("ix_audit_logs_tenant_created_at", "audit_logs (tenant_id, created_at DESC)"),
    ("ix_audit_logs_tenant_resource_created_at", "audit_logs (tenant_id, resource, created_at)"),
    ("ix_hr_attendance_entries_tenant_date", "hr_attendance_entries (tenant_id, attendance_date, id)"),
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
