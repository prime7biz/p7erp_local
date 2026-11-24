"""Phase 2: cutting/CAD process-loss columns + cutting_process_loss_entries (+ RLS).

Additive only. Behind flag ``cutting_loss_control_v1``.

Rollback: ``alembic downgrade 329``.

Revision ID: 330
Revises: 329
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "330"
down_revision: Union[str, None] = "329"
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

    for col, typ in (
        ("color_name", sa.String(64)),
        ("fabric_item_id", sa.Integer()),
        ("fabric_gsm", sa.Numeric(12, 4)),
        ("cad_file_version", sa.String(64)),
        ("planned_consumption_per_dz", sa.Numeric(18, 6)),
        ("actual_consumption_per_dz", sa.Numeric(18, 6)),
        ("bom_consumption_per_dz", sa.Numeric(18, 6)),
        ("shrinkage_pct", sa.Numeric(8, 2)),
        ("end_bit_qty", sa.Numeric(18, 4)),
        ("splice_loss_qty", sa.Numeric(18, 4)),
        ("defect_loss_qty", sa.Numeric(18, 4)),
        ("remnant_qty", sa.Numeric(18, 4)),
        ("actual_cut_pcs", sa.Integer()),
        ("rejected_panel_pcs", sa.Integer()),
        ("pmi_id", sa.Integer()),
    ):
        op.add_column("marker_plans", sa.Column(col, typ, nullable=True))

    for col, typ in (
        ("color_name", sa.String(64)),
        ("fabric_gsm", sa.Numeric(12, 4)),
        ("shrinkage_pct", sa.Numeric(8, 2)),
        ("end_bit_qty", sa.Numeric(18, 4)),
        ("splice_loss_qty", sa.Numeric(18, 4)),
        ("defect_loss_qty", sa.Numeric(18, 4)),
        ("remnant_qty", sa.Numeric(18, 4)),
        ("actual_cut_pcs", sa.Integer()),
        ("rejected_panel_pcs", sa.Integer()),
        ("pmi_id", sa.Integer()),
        ("actual_consumption_per_dz", sa.Numeric(18, 6)),
    ):
        op.add_column("lay_plans", sa.Column(col, typ, nullable=True))

    op.create_table(
        "cutting_process_loss_entries",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("style_id", sa.Integer(), sa.ForeignKey("garment_styles.id", ondelete="SET NULL"), nullable=True),
        sa.Column("marker_plan_id", sa.Integer(), sa.ForeignKey("marker_plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lay_plan_id", sa.Integer(), sa.ForeignKey("lay_plans.id", ondelete="SET NULL"), nullable=True),
        sa.Column("loss_bucket", sa.String(32), nullable=False),
        sa.Column("qty", sa.Numeric(18, 4), nullable=False, server_default="0"),
        sa.Column("uom", sa.String(32), nullable=True),
        sa.Column("reason_code", sa.String(64), nullable=True),
        sa.Column("roll_or_batch_ref", sa.String(128), nullable=True),
        sa.Column("approval_status", sa.String(24), nullable=False, server_default="DRAFT"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("entered_by_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
    )
    op.create_index("ix_cutting_loss_tenant", "cutting_process_loss_entries", ["tenant_id"])
    op.create_index("ix_cutting_loss_tenant_order", "cutting_process_loss_entries", ["tenant_id", "order_id"])
    _enable_rls("cutting_process_loss_entries")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls("cutting_process_loss_entries")
    op.drop_table("cutting_process_loss_entries")
    for col in (
        "actual_consumption_per_dz",
        "pmi_id",
        "rejected_panel_pcs",
        "actual_cut_pcs",
        "remnant_qty",
        "defect_loss_qty",
        "splice_loss_qty",
        "end_bit_qty",
        "shrinkage_pct",
        "fabric_gsm",
        "color_name",
    ):
        op.drop_column("lay_plans", col)
    for col in (
        "pmi_id",
        "rejected_panel_pcs",
        "actual_cut_pcs",
        "remnant_qty",
        "defect_loss_qty",
        "splice_loss_qty",
        "end_bit_qty",
        "shrinkage_pct",
        "bom_consumption_per_dz",
        "actual_consumption_per_dz",
        "planned_consumption_per_dz",
        "cad_file_version",
        "fabric_gsm",
        "fabric_item_id",
        "color_name",
    ):
        op.drop_column("marker_plans", col)
