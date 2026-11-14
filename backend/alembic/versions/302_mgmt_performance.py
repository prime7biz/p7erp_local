"""Finance > Management Performance tables (docs/management-performance/02-plan-audit-resolutions.md).

Additive only: six new, empty tables and one nullable column. Nothing reads or writes them while the strict tenant
flag ``mgmt_performance_v1`` is OFF.

* ``mgmt_expense_category_map``: ledger account or account group -> management category.
* ``mgmt_category_thresholds``: early-warning % of budget per operating category.
* ``mgmt_monthly_targets``: monthly net-profit target + contingency %.
* ``budget_exceptions`` + ``budget_exception_actions``: budget problems and their owner / finance / manager workflow.
* ``budget_line_revisions``: audited changes to FINAL budgets (four-eyes).
* ``cost_centers.owner_user_id`` (nullable FK users, ON DELETE SET NULL): department owner.
* RLS policy ``p7_tenant_isolation`` on every new table (pattern of 300).

Rollback: ``alembic downgrade 301`` drops the tables and the column (export revisions / exceptions first; approved
revisions already changed ``budget_lines.amount`` and that change stays).

Revision ID: 302
Revises: 301
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "302"
down_revision: Union[str, None] = "301"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

CAT_MAP = "mgmt_expense_category_map"
THRESHOLDS = "mgmt_category_thresholds"
TARGETS = "mgmt_monthly_targets"
EXCEPTIONS = "budget_exceptions"
ACTIONS = "budget_exception_actions"
REVISIONS = "budget_line_revisions"
NEW_TABLES = (CAT_MAP, THRESHOLDS, TARGETS, EXCEPTIONS, ACTIONS, REVISIONS)

OPERATING = ("PAYROLL", "FINANCE_COST", "UTILITIES", "TRANSPORT", "ADMIN", "FACTORY_OVERHEAD", "SALES_MARKETING", "TAX")
ALL_CATEGORIES = OPERATING + ("DIRECT_MATERIAL", "DIRECT_PROCESS", "DIRECT_LANDED", "DIRECT_SELLING", "EXCLUDED")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


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


def _tenant_col() -> sa.Column:
    return sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)


def _user_fk(name: str) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def _stamps() -> list[sa.Column]:
    return [sa.Column("created_at", sa.DateTime(), nullable=False), sa.Column("updated_at", sa.DateTime(), nullable=False)]


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.add_column("cost_centers", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_cost_centers_owner_user_id", "cost_centers", "users", ["owner_user_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_cost_centers_owner_user_id", "cost_centers", ["owner_user_id"])

    op.create_table(
        CAT_MAP,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id", ondelete="CASCADE"), nullable=True),
        sa.Column("account_group_id", sa.Integer(), sa.ForeignKey("account_groups.id", ondelete="CASCADE"), nullable=True),
        sa.Column("category", sa.String(32), nullable=False),
        _user_fk("updated_by"),
        *_stamps(),
        sa.CheckConstraint("num_nonnulls(account_id, account_group_id) = 1", name="ck_mgmt_cat_map_one_target"),
        sa.CheckConstraint(f"category IN ({_in(ALL_CATEGORIES)})", name="ck_mgmt_cat_map_category"),
    )
    op.create_index(f"ix_{CAT_MAP}_tenant_id", CAT_MAP, ["tenant_id"])
    op.execute(
        f"CREATE UNIQUE INDEX uq_mgmt_cat_map_tenant_account ON {CAT_MAP} (tenant_id, account_id) "
        "WHERE account_id IS NOT NULL"
    )
    op.execute(
        f"CREATE UNIQUE INDEX uq_mgmt_cat_map_tenant_group ON {CAT_MAP} (tenant_id, account_group_id) "
        "WHERE account_group_id IS NOT NULL"
    )

    op.create_table(
        THRESHOLDS,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("warning_pct", sa.Numeric(7, 4), nullable=False),
        _user_fk("updated_by"),
        *_stamps(),
        sa.UniqueConstraint("tenant_id", "category", name="uq_mgmt_thresholds_tenant_category"),
        sa.CheckConstraint("warning_pct >= 0 AND warning_pct <= 100", name="ck_mgmt_thresholds_pct"),
        sa.CheckConstraint(f"category IN ({_in(OPERATING)})", name="ck_mgmt_thresholds_category"),
    )
    op.create_index(f"ix_{THRESHOLDS}_tenant_id", THRESHOLDS, ["tenant_id"])

    op.create_table(
        TARGETS,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("period_month", sa.String(7), nullable=False),
        sa.Column("target_profit_amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("contingency_pct", sa.Numeric(7, 4), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        _user_fk("updated_by"),
        *_stamps(),
        sa.UniqueConstraint("tenant_id", "period_month", name="uq_mgmt_targets_tenant_month"),
        sa.CheckConstraint("contingency_pct >= 0 AND contingency_pct <= 100", name="ck_mgmt_targets_contingency"),
        sa.CheckConstraint("target_profit_amount >= 0", name="ck_mgmt_targets_profit"),
    )
    op.create_index(f"ix_{TARGETS}_tenant_id", TARGETS, ["tenant_id"])

    op.create_table(
        EXCEPTIONS,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("period_month", sa.String(7), nullable=False),
        sa.Column("cost_center_id", sa.Integer(), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("category", sa.String(32), nullable=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("family", sa.String(16), nullable=False),
        sa.Column("severity", sa.String(16), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("dedupe_key", sa.String(160), nullable=False),
        sa.Column("budget_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("actual_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("forecast_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("corrective_action", sa.Text(), nullable=True),
        sa.Column("revised_forecast", sa.Numeric(18, 4), nullable=True),
        _user_fk("responded_by"),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        _user_fk("reviewed_by"),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        _user_fk("decided_by"),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("detected_at", sa.DateTime(), nullable=False),
        sa.Column("last_scanned_at", sa.DateTime(), nullable=False),
        sa.Column("escalated_at", sa.DateTime(), nullable=True),
        *_stamps(),
        sa.UniqueConstraint("tenant_id", "dedupe_key", name="uq_budget_exceptions_tenant_key"),
        sa.CheckConstraint("family IN ('BUDGET', 'UNBUDGETED', 'UNMAPPED')", name="ck_budget_exceptions_family"),
        sa.CheckConstraint("severity IN ('WARNING', 'AT_RISK', 'FAILED')", name="ck_budget_exceptions_severity"),
        sa.CheckConstraint(
            "status IN ('OPEN', 'RESPONDED', 'REVIEWED', 'APPROVED', 'REJECTED')", name="ck_budget_exceptions_status"
        ),
    )
    op.create_index(f"ix_{EXCEPTIONS}_tenant_id", EXCEPTIONS, ["tenant_id"])
    op.create_index(f"ix_{EXCEPTIONS}_cost_center_id", EXCEPTIONS, ["cost_center_id"])
    op.create_index("ix_budget_exceptions_tenant_month_status", EXCEPTIONS, ["tenant_id", "period_month", "status"])

    op.create_table(
        ACTIONS,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("exception_id", sa.Integer(), sa.ForeignKey(f"{EXCEPTIONS}.id", ondelete="CASCADE"), nullable=False),
        sa.Column("action", sa.String(16), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        _user_fk("actor_user_id"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_budget_exception_actions_request"),
        sa.CheckConstraint("action IN ('RESPOND', 'REVIEW', 'APPROVE', 'REJECT')", name="ck_budget_exception_actions_action"),
    )
    op.create_index(f"ix_{ACTIONS}_tenant_id", ACTIONS, ["tenant_id"])
    op.create_index(f"ix_{ACTIONS}_exception_id", ACTIONS, ["exception_id"])

    op.create_table(
        REVISIONS,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        _tenant_col(),
        sa.Column("budget_id", sa.Integer(), sa.ForeignKey("budgets.id", ondelete="SET NULL"), nullable=True),
        sa.Column("budget_line_id", sa.Integer(), sa.ForeignKey("budget_lines.id", ondelete="SET NULL"), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("revision_no", sa.Integer(), nullable=True),
        sa.Column("cost_center_id", sa.Integer(), sa.ForeignKey("cost_centers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("account_id", sa.Integer(), sa.ForeignKey("chart_of_accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("period_month", sa.String(7), nullable=False),
        sa.Column("old_amount", sa.Numeric(18, 4), nullable=True),
        sa.Column("new_amount", sa.Numeric(18, 4), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("exception_id", sa.Integer(), sa.ForeignKey(f"{EXCEPTIONS}.id", ondelete="SET NULL"), nullable=True),
        sa.Column("request_id", sa.String(64), nullable=False),
        _user_fk("requested_by"),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        _user_fk("decided_by"),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_budget_line_revisions_request"),
        sa.CheckConstraint("kind IN ('CHANGE', 'ADD_LINE')", name="ck_budget_line_revisions_kind"),
        sa.CheckConstraint("status IN ('PENDING', 'APPROVED', 'REJECTED')", name="ck_budget_line_revisions_status"),
        sa.CheckConstraint("new_amount >= 0", name="ck_budget_line_revisions_amount"),
    )
    op.create_index(f"ix_{REVISIONS}_tenant_id", REVISIONS, ["tenant_id"])
    op.create_index(f"ix_{REVISIONS}_budget_id", REVISIONS, ["budget_id"])
    op.create_index(f"ix_{REVISIONS}_budget_line_id", REVISIONS, ["budget_line_id"])
    op.create_index("ix_budget_line_revisions_tenant_status", REVISIONS, ["tenant_id", "status"])
    op.execute(
        f"CREATE UNIQUE INDEX uq_budget_line_revisions_line_no ON {REVISIONS} (budget_line_id, revision_no) "
        "WHERE budget_line_id IS NOT NULL AND revision_no IS NOT NULL"
    )

    for table in NEW_TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in reversed(NEW_TABLES):
        _disable_rls(table)
    op.drop_table(REVISIONS)
    op.drop_table(ACTIONS)
    op.drop_table(EXCEPTIONS)
    op.drop_table(TARGETS)
    op.drop_table(THRESHOLDS)
    op.drop_table(CAT_MAP)
    op.drop_index("ix_cost_centers_owner_user_id", table_name="cost_centers")
    op.drop_constraint("fk_cost_centers_owner_user_id", "cost_centers", type_="foreignkey")
    op.drop_column("cost_centers", "owner_user_id")
