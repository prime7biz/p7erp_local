"""HR Manpower Control Phase 2: over-quota exceptions and consumptions.

Additive only. Nothing enforces while ``manpower_quota_enforcement_v1`` is OFF.

* ``hr_manpower_quota_exceptions``: PENDING → APPROVED / REJECTED / CANCELLED
* ``hr_manpower_quota_exception_consumptions``: links employee_id to a used slot
* RLS ``p7_tenant_isolation`` on both

Rollback: turn enforcement off, export rows, ``alembic downgrade 304``.

Revision ID: 305
Revises: 304
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "305"
down_revision: Union[str, None] = "304"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLES = (
    "hr_manpower_quota_exceptions",
    "hr_manpower_quota_exception_consumptions",
)


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


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")

    op.create_table(
        "hr_manpower_quota_exceptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "department_id",
            sa.Integer(),
            sa.ForeignKey("hr_departments.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "designation_id",
            sa.Integer(),
            sa.ForeignKey("hr_designations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("extra_slots", sa.Integer(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        sa.Column("requested_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("decided_at", sa.DateTime(), nullable=True),
        sa.Column("decision_note", sa.Text(), nullable=True),
        sa.Column("expires_on", sa.Date(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_hr_manpower_quota_exc_request"),
        sa.CheckConstraint("extra_slots > 0", name="ck_hr_manpower_quota_exc_slots_pos"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')",
            name="ck_hr_manpower_quota_exc_status",
        ),
    )
    op.create_index("ix_hr_manpower_quota_exceptions_tenant_id", "hr_manpower_quota_exceptions", ["tenant_id"])
    op.create_index(
        "ix_hr_manpower_quota_exc_tenant_status",
        "hr_manpower_quota_exceptions",
        ["tenant_id", "status"],
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_hr_manpower_quota_exc_one_pending "
        "ON hr_manpower_quota_exceptions (tenant_id, department_id, designation_id) "
        "WHERE status = 'PENDING'"
    )

    op.create_table(
        "hr_manpower_quota_exception_consumptions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "exception_id",
            sa.Integer(),
            sa.ForeignKey("hr_manpower_quota_exceptions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "employee_id",
            sa.Integer(),
            sa.ForeignKey("hr_employees.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("consumed_at", sa.DateTime(), nullable=False),
        sa.Column(
            "consumed_by_user_id",
            sa.Integer(),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.UniqueConstraint("tenant_id", "employee_id", name="uq_hr_manpower_quota_cons_emp"),
        sa.UniqueConstraint("exception_id", "employee_id", name="uq_hr_manpower_quota_cons_exc_emp"),
    )
    op.create_index(
        "ix_hr_manpower_quota_exception_consumptions_tenant_id",
        "hr_manpower_quota_exception_consumptions",
        ["tenant_id"],
    )
    op.create_index(
        "ix_hr_manpower_quota_cons_exception",
        "hr_manpower_quota_exception_consumptions",
        ["exception_id"],
    )

    for table in TABLES:
        _enable_rls(table)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in TABLES:
        _disable_rls(table)
    op.drop_table("hr_manpower_quota_exception_consumptions")
    op.drop_table("hr_manpower_quota_exceptions")
