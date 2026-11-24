"""Phase 3B: finishing_stage_entries (+ RLS). Flag ``finishing_stage_wip_v1``.

Rollback: ``alembic downgrade 331``.

Revision ID: 332
Revises: 331
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "332"
down_revision: Union[str, None] = "331"
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
        "finishing_stage_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("sewing_line_id", sa.Integer(), sa.ForeignKey("sewing_lines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("shift_id", sa.Integer(), sa.ForeignKey("production_shifts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("production_date", sa.Date(), nullable=False),
        sa.Column("hour_slot", sa.Integer(), nullable=True),
        sa.Column("stage", sa.String(32), nullable=False),
        sa.Column("color_name", sa.String(64), nullable=True),
        sa.Column("size_name", sa.String(32), nullable=True),
        sa.Column("good_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("reject_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("rework_qty", sa.Numeric(18, 3), nullable=False, server_default="0"),
        sa.Column("carton_count", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("entered_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index(
        "ix_finishing_stage_tenant_order_date",
        "finishing_stage_entries",
        ["tenant_id", "order_id", "production_date"],
    )
    _enable_rls("finishing_stage_entries")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls("finishing_stage_entries")
    op.drop_table("finishing_stage_entries")
