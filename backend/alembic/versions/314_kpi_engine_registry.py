"""KPI engine registry + commitment revisions + predictions (docs/kpi-platform/).

Additive empty tables + RLS. Unused while tenant flag ``kpi_engine_v1`` is OFF.
``kpi_predictive_v1`` gates prediction rows separately (also default OFF).

Revision ID: 314
Revises: 313
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "314"
down_revision: Union[str, None] = "313"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = (
    "kpi_definitions",
    "kpi_definition_versions",
    "kpi_source_mappings",
    "kpi_targets",
    "kpi_thresholds",
    "kpi_results",
    "kpi_alerts",
    "kpi_recalculation_jobs",
    "kpi_data_quality_results",
    "order_commitment_revisions",
    "kpi_predictions",
)

TARGET_TYPES = (
    "LEGAL_LIMIT",
    "BUYER_SLA",
    "BUDGET",
    "STYLE_PLAN",
    "FACTORY_TARGET",
    "HISTORICAL_BASELINE",
    "EXTERNAL_PUBLISHED",
    "ILLUSTRATIVE",
)
SENSITIVITIES = ("OPERATIONAL", "MANAGEMENT", "CONFIDENTIAL", "HIGHLY_CONFIDENTIAL")
METRIC_TYPES = ("KPI", "DIAGNOSTIC")
TIERS = ("CORE", "ADVANCED", "PREDICTIVE")
RESULT_STATUSES = ("GREEN", "AMBER", "RED", "NO_DATA", "NO_TARGET")
JOB_STATUSES = ("PENDING", "RUNNING", "DONE", "FAILED")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL "
        f"USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _drop_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.create_table(
        "kpi_definitions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(32), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("purpose", sa.Text(), nullable=True),
        sa.Column("module", sa.String(32), nullable=False),
        sa.Column("metric_type", sa.String(16), nullable=False, server_default="KPI"),
        sa.Column("tier", sa.String(16), nullable=False, server_default="CORE"),
        sa.Column("numerator_definition", sa.Text(), nullable=True),
        sa.Column("denominator_definition", sa.Text(), nullable=True),
        sa.Column("formula_expression", sa.Text(), nullable=True),
        sa.Column("unit", sa.String(32), nullable=False, server_default="%"),
        sa.Column("direction", sa.String(8), nullable=False, server_default="UP"),
        sa.Column("leading_lagging", sa.String(8), nullable=True),
        sa.Column("default_grain", sa.String(64), nullable=True),
        sa.Column("refresh_frequency", sa.String(8), nullable=True),
        sa.Column("owner_role", sa.String(64), nullable=True),
        sa.Column("applicability", postgresql.JSONB(), nullable=False, server_default=sa.text("'[\"F\",\"A\",\"B\"]'::jsonb")),
        sa.Column("sensitivity", sa.String(32), nullable=False, server_default="OPERATIONAL"),
        sa.Column("adapter_key", sa.String(64), nullable=True),
        sa.Column("dashboard_codes", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("definition_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("blocked_reason", sa.String(128), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "code", name="uq_kpi_definitions_tenant_code"),
        sa.CheckConstraint(f"metric_type IN ({_in(METRIC_TYPES)})", name="ck_kpi_definitions_metric_type"),
        sa.CheckConstraint(f"tier IN ({_in(TIERS)})", name="ck_kpi_definitions_tier"),
        sa.CheckConstraint(f"sensitivity IN ({_in(SENSITIVITIES)})", name="ck_kpi_definitions_sensitivity"),
        sa.CheckConstraint("direction IN ('UP', 'DOWN', 'RANGE')", name="ck_kpi_definitions_direction"),
    )
    op.create_index("ix_kpi_definitions_tenant_id", "kpi_definitions", ["tenant_id"])
    op.create_index("ix_kpi_definitions_tenant_module", "kpi_definitions", ["tenant_id", "module"])
    _rls("kpi_definitions")

    op.create_table(
        "kpi_definition_versions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("definition_version", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.UniqueConstraint("kpi_definition_id", "definition_version", name="uq_kpi_def_versions_def_ver"),
    )
    op.create_index("ix_kpi_definition_versions_tenant_id", "kpi_definition_versions", ["tenant_id"])
    _rls("kpi_definition_versions")

    op.create_table(
        "kpi_source_mappings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_fact_key", sa.String(64), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
    )
    op.create_index("ix_kpi_source_mappings_tenant_id", "kpi_source_mappings", ["tenant_id"])
    _rls("kpi_source_mappings")

    op.create_table(
        "kpi_targets",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("buyer_id", sa.Integer(), nullable=True),
        sa.Column("department_id", sa.Integer(), nullable=True),
        sa.Column("product_group", sa.String(64), nullable=True),
        sa.Column("factory_unit", sa.String(64), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("target_value", sa.Numeric(18, 6), nullable=False),
        sa.Column("amber_lower", sa.Numeric(18, 6), nullable=True),
        sa.Column("amber_upper", sa.Numeric(18, 6), nullable=True),
        sa.Column("red_lower", sa.Numeric(18, 6), nullable=True),
        sa.Column("red_upper", sa.Numeric(18, 6), nullable=True),
        sa.Column("target_type", sa.String(32), nullable=False),
        sa.Column("source_reference", postgresql.JSONB(), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(f"target_type IN ({_in(TARGET_TYPES)})", name="ck_kpi_targets_type"),
    )
    op.create_index("ix_kpi_targets_tenant_id", "kpi_targets", ["tenant_id"])
    op.create_index("ix_kpi_targets_kpi_dates", "kpi_targets", ["kpi_definition_id", "effective_from", "effective_to"])
    _rls("kpi_targets")

    op.create_table(
        "kpi_thresholds",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("amber_lower", sa.Numeric(18, 6), nullable=True),
        sa.Column("amber_upper", sa.Numeric(18, 6), nullable=True),
        sa.Column("red_lower", sa.Numeric(18, 6), nullable=True),
        sa.Column("red_upper", sa.Numeric(18, 6), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_kpi_thresholds_tenant_id", "kpi_thresholds", ["tenant_id"])
    _rls("kpi_thresholds")

    op.create_table(
        "kpi_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("result_date", sa.Date(), nullable=False),
        sa.Column("dim_key", sa.String(128), nullable=False, server_default=""),
        sa.Column("numerator_value", sa.Numeric(24, 6), nullable=True),
        sa.Column("denominator_value", sa.Numeric(24, 6), nullable=True),
        sa.Column("metric_value", sa.Numeric(24, 6), nullable=True),
        sa.Column("target_value", sa.Numeric(18, 6), nullable=True),
        sa.Column("status", sa.String(16), nullable=False, server_default="NO_DATA"),
        sa.Column("missing_inputs", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("source_event_time", sa.DateTime(), nullable=True),
        sa.Column("computed_at", sa.DateTime(), nullable=False),
        sa.Column("computation_version", sa.String(32), nullable=False, server_default="1"),
        sa.UniqueConstraint(
            "tenant_id",
            "kpi_definition_id",
            "result_date",
            "dim_key",
            "computation_version",
            name="uq_kpi_results_partition",
        ),
        sa.CheckConstraint(f"status IN ({_in(RESULT_STATUSES)})", name="ck_kpi_results_status"),
    )
    op.create_index("ix_kpi_results_tenant_id", "kpi_results", ["tenant_id"])
    op.create_index("ix_kpi_results_tenant_date", "kpi_results", ["tenant_id", "result_date"])
    _rls("kpi_results")

    op.create_table(
        "kpi_alerts",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("result_id", sa.Integer(), sa.ForeignKey("kpi_results.id", ondelete="SET NULL"), nullable=True),
        sa.Column("severity", sa.String(16), nullable=False, server_default="AMBER"),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("acked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_kpi_alerts_tenant_id", "kpi_alerts", ["tenant_id"])
    _rls("kpi_alerts")

    op.create_table(
        "kpi_recalculation_jobs",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("date_from", sa.Date(), nullable=False),
        sa.Column("date_to", sa.Date(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="PENDING"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(f"status IN ({_in(JOB_STATUSES)})", name="ck_kpi_recalc_status"),
    )
    op.create_index("ix_kpi_recalculation_jobs_tenant_id", "kpi_recalculation_jobs", ["tenant_id"])
    _rls("kpi_recalculation_jobs")

    op.create_table(
        "kpi_data_quality_results",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kpi_definition_id", sa.Integer(), sa.ForeignKey("kpi_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("check_code", sa.String(64), nullable=False),
        sa.Column("passed", sa.Boolean(), nullable=False),
        sa.Column("detail", postgresql.JSONB(), nullable=True),
        sa.Column("checked_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_kpi_data_quality_results_tenant_id", "kpi_data_quality_results", ["tenant_id"])
    _rls("kpi_data_quality_results")

    op.create_table(
        "order_commitment_revisions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("order_id", sa.Integer(), sa.ForeignKey("orders.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("committed_date", sa.Date(), nullable=True),
        sa.Column("committed_qty", sa.Numeric(18, 4), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("source", sa.String(16), nullable=False, server_default="INTERNAL"),
        sa.Column("changed_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("changed_at", sa.DateTime(), nullable=False),
        sa.Column("backfilled", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.UniqueConstraint("tenant_id", "order_id", "revision_no", name="uq_order_commitment_rev"),
        sa.CheckConstraint("source IN ('BUYER', 'INTERNAL', 'BACKFILL')", name="ck_order_commitment_source"),
    )
    op.create_index("ix_order_commitment_revisions_tenant_id", "order_commitment_revisions", ["tenant_id"])
    op.create_index("ix_order_commitment_revisions_order", "order_commitment_revisions", ["tenant_id", "order_id"])
    _rls("order_commitment_revisions")

    op.create_table(
        "kpi_predictions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("prediction_code", sa.String(64), nullable=False),
        sa.Column("subject_type", sa.String(32), nullable=False),
        sa.Column("subject_id", sa.Integer(), nullable=False),
        sa.Column("model_version", sa.String(32), nullable=False),
        sa.Column("score", sa.Numeric(18, 6), nullable=True),
        sa.Column("confidence", sa.Numeric(8, 4), nullable=True),
        sa.Column("features", postgresql.JSONB(), nullable=False, server_default=sa.text("'{}'::jsonb")),
        sa.Column("top_factors", postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
        sa.Column("predicted_at", sa.DateTime(), nullable=False),
        sa.Column("actual_outcome", postgresql.JSONB(), nullable=True),
        sa.Column("outcome_recorded_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_kpi_predictions_tenant_id", "kpi_predictions", ["tenant_id"])
    op.create_index(
        "ix_kpi_predictions_subject",
        "kpi_predictions",
        ["tenant_id", "prediction_code", "subject_type", "subject_id"],
    )
    _rls("kpi_predictions")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(TABLES):
        _drop_rls(table)
        op.drop_table(table)
