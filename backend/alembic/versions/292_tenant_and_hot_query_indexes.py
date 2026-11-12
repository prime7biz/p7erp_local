"""Missing tenant_id indexes and the alert-scan "last finished" index (routine check RC-16).

Each index matches evidence from `scripts/rls_status_report.py` / EXPLAIN:

- 13 tenant tables had no index starting with ``tenant_id``. Every tenant query and the RLS policy
  (``tenant_id = current_setting('app.tenant_id')``) filters on it, so without the index each lookup
  scans the whole table.
- ``alert_scan_log (tenant_id, status, finished_at)``: the scheduler's "last completed scan" lookup
  (``max(finished_at) WHERE tenant_id = ? AND status = ? AND finished_at IS NOT NULL``) read ~9,600
  heap rows per tenant through ``(tenant_id, started_at)``; this index answers it from the index.

Built with CREATE INDEX CONCURRENTLY (no table write lock), so it runs in an autocommit block, same
pattern as revision 248. Additive only; nothing is dropped.

Rollback: ``alembic downgrade 291`` drops only the indexes added here (production needs approval).

Revision ID: 292
Revises: 291
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "292"
down_revision: Union[str, None] = "291"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TENANT_ID_TABLES: tuple[str, ...] = (
    "alert_comment",
    "alert_escalation_log",
    "alert_history",
    "alert_saved_view",
    "lay_plans",
    "lemonsqueezy_webhook_events",
    "line_balance_workstations",
    "operation_bulletin_ops",
    "physical_inventory_lines",
    "process_order_cost_lines",
    "production_material_issue_lines",
    "supplier_quotation_lines",
    "vendor_bill_lines",
)

# (index name, "table (columns...)")
INDEXES: list[tuple[str, str]] = [(f"ix_{t}_tenant_id", f"{t} (tenant_id)") for t in TENANT_ID_TABLES] + [
    ("ix_alert_scan_log_tenant_status_finished", "alert_scan_log (tenant_id, status, finished_at)"),
]


def _table_exists(table: str) -> bool:
    return bool(op.get_bind().execute(sa.text("SELECT to_regclass(:t) IS NOT NULL"), {"t": table}).scalar())


def _create_index_concurrently(name: str, target: str) -> None:
    table = target.split(" ", 1)[0]
    if not _table_exists(table):
        return
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
