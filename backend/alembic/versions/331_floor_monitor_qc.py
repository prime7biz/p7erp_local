"""Phase 3A: production_downtime_logs + QC check columns for DHU/RFT (+ RLS).

Behind flag ``floor_live_monitor_v1``.

Rollback: ``alembic downgrade 330``.

Revision ID: 331
Revises: 330
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "331"
down_revision: Union[str, None] = "330"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.create_table(
        "production_downtime_logs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sewing_line_id", sa.Integer(), sa.ForeignKey("sewing_lines.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("production_shifts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("production_date", sa.Date(), nullable=False),
        sa.Column("hour_slot", sa.Integer(), nullable=True),
        sa.Column("reason_code", sa.String(64), nullable=False),
        sa.Column("minutes_lost", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("entered_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_prod_downtime_tenant_date", "production_downtime_logs", ["tenant_id", "production_date"])
    _enable_rls("production_downtime_logs")

    for col, typ in (
        ("style_id", sa.Integer()),
        ("line_style_config_id", sa.Integer()),
        ("rework_qty", sa.Integer()),
        ("reject_qty", sa.Integer()),
        ("total_defects", sa.Integer()),
        ("rft_pct", sa.Numeric(8, 2)),
        ("operation_id", sa.Integer()),
    ):
        op.add_column("production_qc_checks", sa.Column(col, typ, nullable=True))


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for col in ("operation_id", "rft_pct", "total_defects", "reject_qty", "rework_qty", "line_style_config_id", "style_id"):
        op.drop_column("production_qc_checks", col)
    _disable_rls("production_downtime_logs")
    op.drop_table("production_downtime_logs")
