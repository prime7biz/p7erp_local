"""HR class requests (voucher-style Class 3/4 → 2 → 1), ESS flag, Phase 3/4 tables.

Additive only. Behaviour is inert while ``user_authority_classes_v1`` is OFF.

* ``hr_employees.ess_enabled`` (nullable) + ``contract_end_date`` (nullable)
* ``hr_class_requests`` / ``hr_class_request_actions`` + RLS
* ``hr_class_request_lines`` (bulk increment) + RLS
* ``hr_approval_delegations`` (delegation) + RLS

Rollback: flag off, export rows, ``alembic downgrade 316``.

Revision ID: 317
Revises: 316
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "317"
down_revision: Union[str, None] = "316"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

KINDS = (
    "NEW_EMPLOYEE",
    "LEAVE",
    "INCREMENT",
    "PROMOTION",
    "CORRECTION",
    "RESIGNATION",
    "DISCONTINUE",
    "WARNING",
    "BULK_INCREMENT",
    "CONFIRMATION",
)
STATUSES = (
    "DRAFT",
    "SUBMITTED",
    "RECOMMENDED",
    "RETURNED",
    "APPLYING",
    "APPROVED",
    "APPLIED",
    "REJECTED",
    "CANCELLED",
    "FAILED",
)
ACTIONS = (
    "SUBMIT",
    "RESUBMIT",
    "RECOMMEND",
    "RETURN",
    "APPROVE",
    "REJECT",
    "CANCEL",
    "APPLY",
    "FAIL",
    "RETRY",
)


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _enable_rls(table: str) -> None:
    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(
        f"CREATE POLICY {RLS_POLICY_NAME} ON {table} AS PERMISSIVE FOR ALL "
        f"USING ({expr}) WITH CHECK ({expr})"
    )
    op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")


def _disable_rls(table: str) -> None:
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
    op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")


def _user_fk(name: str) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.add_column("hr_employees", sa.Column("ess_enabled", sa.Boolean(), nullable=True))
    op.add_column("hr_employees", sa.Column("contract_end_date", sa.Date(), nullable=True))
    op.create_index("ix_hr_employees_ess_enabled", "hr_employees", ["ess_enabled"])
    op.create_index("ix_hr_employees_contract_end_date", "hr_employees", ["contract_end_date"])
    # Existing linked logins keep ESS access when the authority flag is turned on.
    op.execute("UPDATE hr_employees SET ess_enabled = true WHERE user_id IS NOT NULL")
    op.execute("UPDATE hr_employees SET ess_enabled = false WHERE ess_enabled IS NULL")

    op.create_table(
        "hr_class_requests",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_no", sa.String(32), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        sa.Column("schema_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source", sa.String(16), nullable=False, server_default="HR_ENTRY"),
        sa.Column("kind", sa.String(24), nullable=False),
        sa.Column("status", sa.String(16), nullable=False, server_default="DRAFT"),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="SET NULL"), nullable=True),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("before", postgresql.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False, server_default=""),
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("leave_request_id", sa.Integer(), nullable=True),
        sa.Column("separation_id", sa.Integer(), nullable=True),
        sa.Column("onboarding_request_id", sa.String(64), nullable=True),
        sa.Column("staff_invitation_id", sa.Integer(), nullable=True),
        sa.Column("discipline_case_id", sa.Integer(), nullable=True),
        sa.Column("settlement_status", sa.String(32), nullable=True),
        _user_fk("entered_by"),
        sa.Column("entered_at", sa.DateTime(), nullable=False),
        _user_fk("recommended_by"),
        sa.Column("recommended_at", sa.DateTime(), nullable=True),
        sa.Column("recommend_note", sa.Text(), nullable=True),
        sa.Column("recommend_is_auto", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        _user_fk("approved_by"),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("approve_note", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_hr_class_requests_request"),
        sa.CheckConstraint(f"kind IN ({_in(KINDS)})", name="ck_hr_class_requests_kind"),
        sa.CheckConstraint(f"status IN ({_in(STATUSES)})", name="ck_hr_class_requests_status"),
        sa.CheckConstraint("source IN ('HR_ENTRY', 'ESS')", name="ck_hr_class_requests_source"),
    )
    op.create_index("ix_hr_class_requests_tenant_id", "hr_class_requests", ["tenant_id"])
    op.create_index("ix_hr_class_requests_tenant_status_created", "hr_class_requests", ["tenant_id", "status", "created_at"])
    op.create_index(
        "ix_hr_class_requests_tenant_employee_status",
        "hr_class_requests",
        ["tenant_id", "employee_id", "status"],
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_hr_class_requests_one_open_single "
        "ON hr_class_requests (tenant_id, employee_id, kind) "
        "WHERE status IN ('DRAFT', 'SUBMITTED', 'RECOMMENDED', 'RETURNED', 'APPLYING') "
        "AND kind IN ('INCREMENT', 'PROMOTION', 'CORRECTION')"
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_hr_class_requests_one_open_separation "
        "ON hr_class_requests (tenant_id, employee_id) "
        "WHERE status IN ('DRAFT', 'SUBMITTED', 'RECOMMENDED', 'RETURNED', 'APPLYING') "
        "AND kind IN ('RESIGNATION', 'DISCONTINUE')"
    )
    _enable_rls("hr_class_requests")

    op.create_table(
        "hr_class_request_actions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "request_pk",
            sa.Integer(),
            sa.ForeignKey("hr_class_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action", sa.String(16), nullable=False),
        _user_fk("actor_user_id"),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("is_auto", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(f"action IN ({_in(ACTIONS)})", name="ck_hr_class_request_actions_action"),
    )
    op.create_index("ix_hr_class_request_actions_tenant_id", "hr_class_request_actions", ["tenant_id"])
    op.create_index(
        "ix_hr_class_request_actions_tenant_request",
        "hr_class_request_actions",
        ["tenant_id", "request_pk"],
    )
    _enable_rls("hr_class_request_actions")

    op.create_table(
        "hr_class_request_lines",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "request_pk",
            sa.Integer(),
            sa.ForeignKey("hr_class_requests.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("before", postgresql.JSONB(), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("line_status", sa.String(16), nullable=False, server_default="PENDING"),
        sa.Column("error_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "request_pk", "employee_id", name="uq_hr_class_request_lines_emp"),
        sa.CheckConstraint(
            "line_status IN ('PENDING', 'APPLIED', 'FAILED', 'SKIPPED')",
            name="ck_hr_class_request_lines_status",
        ),
    )
    op.create_index("ix_hr_class_request_lines_tenant_id", "hr_class_request_lines", ["tenant_id"])
    op.create_index(
        "ix_hr_class_request_lines_tenant_request",
        "hr_class_request_lines",
        ["tenant_id", "request_pk"],
    )
    op.create_index(
        "ix_hr_class_request_lines_tenant_employee",
        "hr_class_request_lines",
        ["tenant_id", "employee_id"],
    )
    _enable_rls("hr_class_request_lines")

    op.create_table(
        "hr_approval_delegations",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delegator_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("delegate_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("step", sa.String(16), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        _user_fk("created_by"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("step IN ('RECOMMEND', 'APPROVE')", name="ck_hr_approval_delegations_step"),
    )
    op.create_index("ix_hr_approval_delegations_tenant_id", "hr_approval_delegations", ["tenant_id"])
    op.create_index(
        "ix_hr_approval_delegations_tenant_active",
        "hr_approval_delegations",
        ["tenant_id", "step", "starts_at", "ends_at"],
    )
    _enable_rls("hr_approval_delegations")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in (
        "hr_approval_delegations",
        "hr_class_request_lines",
        "hr_class_request_actions",
        "hr_class_requests",
    ):
        _disable_rls(table)
        op.drop_table(table)
    op.drop_index("ix_hr_employees_contract_end_date", table_name="hr_employees")
    op.drop_index("ix_hr_employees_ess_enabled", table_name="hr_employees")
    op.drop_column("hr_employees", "contract_end_date")
    op.drop_column("hr_employees", "ess_enabled")
