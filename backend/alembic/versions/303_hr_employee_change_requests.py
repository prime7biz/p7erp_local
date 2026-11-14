"""HR employee change requests: Tier 1 / Tier 2 approval before an amendment to an existing employee applies.

Additive only: one new, empty table. Nothing reads or writes it while the strict tenant flag
``hr_employee_change_approval`` is OFF.

* ``hr_employee_change_requests``: the requested change (same body as the direct endpoint), the values it
  replaces, and who asked / approved at each tier.
* RLS policy ``p7_tenant_isolation`` (pattern of 300 / 302).

Rollback: switch the flag off, then ``alembic downgrade 302`` (export the requests first; applied requests
already changed the employee and that change stays).

Revision ID: 303
Revises: 302
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "303"
down_revision: Union[str, None] = "302"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

TABLE = "hr_employee_change_requests"
KINDS = ("INFO", "COMPENSATION", "PAY_BENEFITS", "TAX_PROFILE")
STATUSES = ("PENDING_TIER1", "PENDING_TIER2", "APPLIED", "REJECTED", "CANCELLED", "FAILED")


def _in(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def _user_fk(name: str) -> sa.Column:
    return sa.Column(name, sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True)


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.create_table(
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("employee_id", sa.Integer(), sa.ForeignKey("hr_employees.id", ondelete="CASCADE"), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("before", postgresql.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        _user_fk("requested_by"),
        sa.Column("requested_at", sa.DateTime(), nullable=False),
        _user_fk("tier1_by"),
        sa.Column("tier1_at", sa.DateTime(), nullable=True),
        sa.Column("tier1_note", sa.Text(), nullable=True),
        _user_fk("tier2_by"),
        sa.Column("tier2_at", sa.DateTime(), nullable=True),
        sa.Column("tier2_note", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "request_id", name="uq_hr_employee_change_requests_request"),
        sa.CheckConstraint(f"kind IN ({_in(KINDS)})", name="ck_hr_employee_change_requests_kind"),
        sa.CheckConstraint(f"status IN ({_in(STATUSES)})", name="ck_hr_employee_change_requests_status"),
    )
    op.create_index(f"ix_{TABLE}_tenant_id", TABLE, ["tenant_id"])
    op.create_index(f"ix_{TABLE}_tenant_status", TABLE, ["tenant_id", "status"])
    op.create_index(f"ix_{TABLE}_tenant_employee", TABLE, ["tenant_id", "employee_id"])
    # At most one open request per employee and kind, so two edits can never race each other.
    op.execute(
        f"CREATE UNIQUE INDEX uq_{TABLE}_one_open ON {TABLE} (tenant_id, employee_id, kind) "
        "WHERE status IN ('PENDING_TIER1', 'PENDING_TIER2')"
    )

    expr = " OR ".join(f"({p})" for p in (_RLS_BYPASS, _RLS_SAME_TENANT))
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {TABLE}")
    op.execute(f"CREATE POLICY {RLS_POLICY_NAME} ON {TABLE} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})")
    op.execute(f"ALTER TABLE {TABLE} ENABLE ROW LEVEL SECURITY")


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {TABLE}")
    op.execute(f"ALTER TABLE {TABLE} DISABLE ROW LEVEL SECURITY")
    op.drop_table(TABLE)
