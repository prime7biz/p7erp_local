"""Prediction snapshots and predictive findings (Manufacturing Intelligence Phase 4, B1).

Additive only: two new, empty tables. Nothing reads or writes them while the strict tenant flag
``mfg_predictive_intelligence_v1`` is OFF (plan docs/manufacturing-intelligence/15-phase4-implementation-plan.md,
section 4 with the binding changes of section 17.9 / 17.17).

* ``mfg_prediction_snapshots``: one delivery forecast per order per day and model version (calibration input).
* ``mfg_predictive_findings``: bottlenecks / recommendations. No ``decision_id`` column (17.9: the decision row points
  at the finding through ``ai_agent_decisions.finding_id``, migration 301); ``alert_eligible`` marks the top findings
  that may be mirrored into alerts (17.17). No money columns.
* RLS policy ``p7_tenant_isolation`` on both tables in this same migration (pattern of 297).

Rollback: ``alembic downgrade 299`` drops both tables (export snapshots / findings first, the data is lost).

Revision ID: 300
Revises: 299
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "300"
down_revision: Union[str, None] = "299"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

SNAPSHOTS = "mfg_prediction_snapshots"
FINDINGS = "mfg_predictive_findings"


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
        SNAPSHOTS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("as_of_date", sa.Date(), nullable=False),
        sa.Column("target_date", sa.Date(), nullable=True),
        sa.Column("model_version", sa.String(length=24), nullable=False),
        sa.Column("band", sa.String(length=16), nullable=False),
        sa.Column("p50_date", sa.Date(), nullable=True),
        sa.Column("p80_date", sa.Date(), nullable=True),
        sa.Column("p90_date", sa.Date(), nullable=True),
        sa.Column("on_time_probability", sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column("efficiency_source", sa.String(length=16), nullable=True),
        sa.Column("lateness_source", sa.String(length=24), nullable=True),
        sa.Column("confidence", sa.String(length=8), nullable=True),
        sa.Column("reason_codes", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("inputs_hash", sa.String(length=64), nullable=True),
        sa.Column("actual_date", sa.Date(), nullable=True),
        sa.Column("on_time", sa.Boolean(), nullable=True),
        sa.Column("outcome_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "on_time_probability IS NULL OR (on_time_probability >= 0 AND on_time_probability <= 1)",
            name="ck_mfg_prediction_snapshots_probability",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_mfg_prediction_snapshots_order_day",
        SNAPSHOTS,
        ["tenant_id", "order_id", "as_of_date", "model_version"],
        unique=True,
    )
    op.create_index("ix_mfg_prediction_snapshots_tenant_day", SNAPSHOTS, ["tenant_id", "as_of_date"])
    op.execute(
        f"CREATE INDEX ix_mfg_prediction_snapshots_open_outcome ON {SNAPSHOTS} (tenant_id, order_id) "
        f"WHERE outcome_at IS NULL"
    )
    _enable_rls(SNAPSHOTS)

    op.create_table(
        FINDINGS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("finding_key", sa.String(length=160), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("severity", sa.String(length=16), nullable=False),
        sa.Column("priority", sa.Numeric(precision=14, scale=4), nullable=False, server_default="0"),
        sa.Column("department", sa.String(length=48), nullable=True),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("line_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="OPEN"),
        sa.Column("alert_eligible", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("first_detected_on", sa.Date(), nullable=False),
        sa.Column("last_detected_on", sa.Date(), nullable=False),
        sa.Column("cleared_on", sa.Date(), nullable=True),
        sa.Column("deadline_date", sa.Date(), nullable=True),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("decision_status", sa.String(length=12), nullable=True),
        sa.Column("outcome_status", sa.String(length=12), nullable=True),
        sa.Column("outcome_json", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("outcome_measured_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('DELIVERY_RISK', 'LATE_MATERIAL', 'CAPACITY_OVERLOAD', 'LINE_IDLE', 'OUTPUT_DROP', "
            "'QUALITY_SPIKE')",
            name="ck_mfg_predictive_findings_kind",
        ),
        sa.CheckConstraint(
            "severity IN ('critical', 'high', 'medium')", name="ck_mfg_predictive_findings_severity"
        ),
        sa.CheckConstraint("status IN ('OPEN', 'CLEARED')", name="ck_mfg_predictive_findings_status"),
        sa.CheckConstraint(
            "decision_status IS NULL OR decision_status IN ('ACCEPTED', 'REJECTED', 'IGNORED')",
            name="ck_mfg_predictive_findings_decision",
        ),
        sa.CheckConstraint(
            "outcome_status IS NULL OR outcome_status IN ('MET', 'NOT_MET', 'UNKNOWN')",
            name="ck_mfg_predictive_findings_outcome",
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["line_id"], ["sewing_lines.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.execute(
        f"CREATE UNIQUE INDEX uq_mfg_predictive_findings_open_key ON {FINDINGS} (tenant_id, finding_key) "
        f"WHERE status = 'OPEN'"
    )
    op.execute(
        f"CREATE INDEX ix_mfg_predictive_findings_status_priority ON {FINDINGS} (tenant_id, status, priority DESC)"
    )
    op.execute(
        f"CREATE INDEX ix_mfg_predictive_findings_deadline ON {FINDINGS} (tenant_id, deadline_date) "
        f"WHERE outcome_status IS NULL"
    )
    op.create_index("ix_mfg_predictive_findings_order", FINDINGS, ["tenant_id", "order_id"])
    op.create_index("ix_mfg_predictive_findings_line", FINDINGS, ["tenant_id", "line_id"])
    _enable_rls(FINDINGS)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls(FINDINGS)
    op.drop_index("ix_mfg_predictive_findings_line", table_name=FINDINGS)
    op.drop_index("ix_mfg_predictive_findings_order", table_name=FINDINGS)
    op.execute("DROP INDEX IF EXISTS ix_mfg_predictive_findings_deadline")
    op.execute("DROP INDEX IF EXISTS ix_mfg_predictive_findings_status_priority")
    op.execute("DROP INDEX IF EXISTS uq_mfg_predictive_findings_open_key")
    op.drop_table(FINDINGS)

    _disable_rls(SNAPSHOTS)
    op.execute("DROP INDEX IF EXISTS ix_mfg_prediction_snapshots_open_outcome")
    op.drop_index("ix_mfg_prediction_snapshots_tenant_day", table_name=SNAPSHOTS)
    op.drop_index("uq_mfg_prediction_snapshots_order_day", table_name=SNAPSHOTS)
    op.drop_table(SNAPSHOTS)
