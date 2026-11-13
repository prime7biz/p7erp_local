"""Plan revisions, tentative bookings and booking lock versions (Manufacturing Intelligence Phase 2, R3).

Additive only. Nothing reads the new objects while the strict tenant flag ``mfg_integrated_planning_v1`` is OFF.

* ``sewing_line_style_configs``: ``lock_version`` (server default 0), ``schedule_version``, ``source_smv_type``.
  A BEFORE UPDATE trigger bumps ``lock_version`` whenever a planning field changes (line, dates, quantity,
  reservation status, shift, operators, efficiency). Legacy writers (plan-board move / assign, reservation
  confirm / release) therefore make a revision proposed earlier stale, with no change to their code.
  Other updates (completed_qty, notes ...) do not bump it.
* ``tenant_production_settings.mfg_planning_config`` JSON (nullable): stage probabilities, tentative expiry
  days, receipt buffer days.
* ``mfg_tentative_line_bookings``: inquiry / quotation demand on a sewing line. Separate from
  ``sewing_line_style_configs`` so no legacy reader ever sees it (plan section 15 #1).
* ``mfg_plan_revisions`` / ``mfg_plan_revision_items``: proposed, approved and applied changes to order-linked
  line bookings.
* RLS policy ``p7_tenant_isolation`` on the three new tables in this same migration (pattern of 291 / 296).

Rollback: ``alembic downgrade 296`` drops the trigger, function, tables and columns. Export open revisions and
ACTIVE tentative bookings first, the data is lost.

Revision ID: 297
Revises: 296
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "297"
down_revision: Union[str, None] = "296"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

CONFIGS = "sewing_line_style_configs"
TENTATIVE = "mfg_tentative_line_bookings"
REVISIONS = "mfg_plan_revisions"
ITEMS = "mfg_plan_revision_items"
TRIGGER = "trg_slsc_bump_lock_version"
FUNCTION = "slsc_bump_lock_version"


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

    # --- booking columns -------------------------------------------------
    op.add_column(CONFIGS, sa.Column("lock_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(CONFIGS, sa.Column("schedule_version", sa.Integer(), nullable=False, server_default="0"))
    op.add_column(CONFIGS, sa.Column("source_smv_type", sa.String(length=24), nullable=True))

    op.execute(
        f"""
        CREATE OR REPLACE FUNCTION {FUNCTION}() RETURNS trigger AS $$
        BEGIN
            IF (NEW.line_id IS DISTINCT FROM OLD.line_id
                OR NEW.start_date IS DISTINCT FROM OLD.start_date
                OR NEW.planned_end_date IS DISTINCT FROM OLD.planned_end_date
                OR NEW.planned_qty IS DISTINCT FROM OLD.planned_qty
                OR NEW.reservation_status IS DISTINCT FROM OLD.reservation_status
                OR NEW.shift_id IS DISTINCT FROM OLD.shift_id
                OR NEW.operator_count IS DISTINCT FROM OLD.operator_count
                OR NEW.target_efficiency_pct IS DISTINCT FROM OLD.target_efficiency_pct) THEN
                NEW.lock_version := COALESCE(OLD.lock_version, 0) + 1;
            END IF;
            RETURN NEW;
        END;
        $$ LANGUAGE plpgsql
        """
    )
    op.execute(f"DROP TRIGGER IF EXISTS {TRIGGER} ON {CONFIGS}")
    op.execute(
        f"CREATE TRIGGER {TRIGGER} BEFORE UPDATE ON {CONFIGS} FOR EACH ROW EXECUTE FUNCTION {FUNCTION}()"
    )

    # --- settings --------------------------------------------------------
    op.add_column("tenant_production_settings", sa.Column("mfg_planning_config", sa.JSON(), nullable=True))

    # --- tentative bookings ----------------------------------------------
    op.create_table(
        TENTATIVE,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("line_id", sa.Integer(), nullable=False),
        sa.Column("inquiry_id", sa.Integer(), nullable=True),
        sa.Column("quotation_id", sa.Integer(), nullable=True),
        sa.Column("style_id", sa.Integer(), nullable=True),
        sa.Column("ob_id", sa.Integer(), nullable=True),
        sa.Column("shift_id", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("planned_end_date", sa.Date(), nullable=True),
        sa.Column("planned_qty", sa.Numeric(precision=18, scale=3), nullable=False),
        sa.Column("smv_per_piece", sa.Numeric(precision=10, scale=4), nullable=True),
        sa.Column("source_smv_type", sa.String(length=24), nullable=True),
        sa.Column("confidence_pct", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="ACTIVE"),
        sa.Column("converted_order_id", sa.Integer(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("lock_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by_user_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(inquiry_id IS NOT NULL AND quotation_id IS NULL) OR (inquiry_id IS NULL AND quotation_id IS NOT NULL)",
            name="ck_mfg_tentative_demand_xor",
        ),
        sa.CheckConstraint(
            "status IN ('ACTIVE','EXPIRED','CANCELLED','CONVERTED')", name="ck_mfg_tentative_status"
        ),
        sa.CheckConstraint("confidence_pct >= 0 AND confidence_pct <= 100", name="ck_mfg_tentative_confidence"),
        sa.CheckConstraint("planned_qty > 0", name="ck_mfg_tentative_qty_positive"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["line_id"], ["sewing_lines.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["inquiry_id"], ["inquiries.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["quotation_id"], ["quotations.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["style_id"], ["garment_styles.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["ob_id"], ["operation_bulletins.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["shift_id"], ["production_shifts.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["converted_order_id"], ["orders.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_mfg_tentative_line_bookings_tenant_id"), TENTATIVE, ["tenant_id"], unique=False)
    op.execute(
        f"CREATE INDEX ix_mfg_tentative_active_line_dates ON {TENTATIVE} "
        f"(tenant_id, line_id, start_date) WHERE status = 'ACTIVE'"
    )
    _enable_rls(TENTATIVE)

    # --- plan revisions --------------------------------------------------
    op.create_table(
        REVISIONS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False, server_default="PROPOSED"),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("request_id", sa.String(length=64), nullable=True),
        sa.Column("payload_hash", sa.String(length=64), nullable=True),
        sa.Column("proposed_by_user_id", sa.Integer(), nullable=True),
        sa.Column("proposed_at", sa.DateTime(), nullable=False),
        sa.Column("decided_by_user_id", sa.Integer(), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("impact_json", sa.JSON(), nullable=True),
        sa.Column("lock_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('PROPOSED','APPLIED','REJECTED','CANCELLED')", name="ck_mfg_plan_revisions_status"
        ),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["proposed_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["decided_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "revision_no", name="uq_mfg_plan_revisions_tenant_no"),
    )
    op.create_index(op.f("ix_mfg_plan_revisions_tenant_id"), REVISIONS, ["tenant_id"], unique=False)
    op.execute(
        f"CREATE UNIQUE INDEX uq_mfg_plan_revisions_request ON {REVISIONS} (tenant_id, request_id) "
        f"WHERE request_id IS NOT NULL"
    )
    _enable_rls(REVISIONS)

    op.create_table(
        ITEMS,
        sa.Column("id", sa.Integer(), autoincrement=True, nullable=False),
        sa.Column("tenant_id", sa.Integer(), nullable=False),
        sa.Column("revision_id", sa.Integer(), nullable=False),
        sa.Column("action", sa.String(length=8), nullable=False),
        sa.Column("config_id", sa.Integer(), nullable=True),
        sa.Column("before_json", sa.JSON(), nullable=True),
        sa.Column("after_json", sa.JSON(), nullable=True),
        sa.Column("before_lock_version", sa.Integer(), nullable=True),
        sa.Column("applied_config_id", sa.Integer(), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.CheckConstraint("action IN ('CREATE','UPDATE','CANCEL')", name="ck_mfg_plan_revision_items_action"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["revision_id"], [f"{REVISIONS}.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["config_id"], [f"{CONFIGS}.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["applied_config_id"], [f"{CONFIGS}.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_mfg_plan_revision_items_tenant_id"), ITEMS, ["tenant_id"], unique=False)
    op.create_index(op.f("ix_mfg_plan_revision_items_revision_id"), ITEMS, ["revision_id"], unique=False)
    op.create_index(op.f("ix_mfg_plan_revision_items_config_id"), ITEMS, ["config_id"], unique=False)
    _enable_rls(ITEMS)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls(ITEMS)
    op.drop_index(op.f("ix_mfg_plan_revision_items_config_id"), table_name=ITEMS)
    op.drop_index(op.f("ix_mfg_plan_revision_items_revision_id"), table_name=ITEMS)
    op.drop_index(op.f("ix_mfg_plan_revision_items_tenant_id"), table_name=ITEMS)
    op.drop_table(ITEMS)

    _disable_rls(REVISIONS)
    op.execute("DROP INDEX IF EXISTS uq_mfg_plan_revisions_request")
    op.drop_index(op.f("ix_mfg_plan_revisions_tenant_id"), table_name=REVISIONS)
    op.drop_table(REVISIONS)

    _disable_rls(TENTATIVE)
    op.execute("DROP INDEX IF EXISTS ix_mfg_tentative_active_line_dates")
    op.drop_index(op.f("ix_mfg_tentative_line_bookings_tenant_id"), table_name=TENTATIVE)
    op.drop_table(TENTATIVE)

    op.drop_column("tenant_production_settings", "mfg_planning_config")

    op.execute(f"DROP TRIGGER IF EXISTS {TRIGGER} ON {CONFIGS}")
    op.execute(f"DROP FUNCTION IF EXISTS {FUNCTION}()")
    op.drop_column(CONFIGS, "source_smv_type")
    op.drop_column(CONFIGS, "schedule_version")
    op.drop_column(CONFIGS, "lock_version")
