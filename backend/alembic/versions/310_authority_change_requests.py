"""Authority change requests + append-only actions (user_authority_classes_v1 Phase 4).

Additive empty tables + RLS. Unused while the flag is OFF.

Revision ID: 310
Revises: 309
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "310"
down_revision: Union[str, None] = "309"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"

REQ = "authority_change_requests"
ACT = "authority_change_actions"

STATUSES = (
    "SUBMITTED",
    "VERIFIED",
    "RECOMMENDED",
    "APPROVED",
    "APPLYING",
    "APPLIED",
    "REJECTED",
    "RETURNED",
    "CONFLICT",
    "ROUTING_EXCEPTION",
)
STEPS = ("VERIFY", "RECOMMEND", "APPROVE", "APPLY")
RESOURCE_TYPES = ("account_group", "chart_of_account")
ACTION_KINDS = (
    "SUBMIT",
    "VERIFY",
    "RECOMMEND",
    "APPROVE",
    "REJECT",
    "RETURN",
    "TAKEOVER",
    "APPLY",
    "FAIL",
)


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


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.create_table(
        REQ,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_id", sa.String(64), nullable=False),
        sa.Column("module_code", sa.String(32), nullable=False),
        sa.Column("resource_type", sa.String(64), nullable=False),
        sa.Column("resource_id", sa.Integer(), nullable=True),
        sa.Column("action", sa.String(16), nullable=False),  # CREATE | UPDATE | DEACTIVATE
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("current_step", sa.String(16), nullable=False),
        sa.Column("base_version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("before_snapshot", postgresql.JSONB(), nullable=True),
        sa.Column("proposed_snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("verified_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recommended_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("takeover_by", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "request_id", name=f"uq_{REQ}_request"),
        sa.CheckConstraint(f"status IN ({_in(STATUSES)})", name=f"ck_{REQ}_status"),
        sa.CheckConstraint(f"current_step IN ({_in(STEPS)})", name=f"ck_{REQ}_step"),
        sa.CheckConstraint(f"resource_type IN ({_in(RESOURCE_TYPES)})", name=f"ck_{REQ}_resource"),
        sa.CheckConstraint("action IN ('CREATE', 'UPDATE', 'DEACTIVATE')", name=f"ck_{REQ}_action"),
    )
    op.create_index(f"ix_{REQ}_tenant_id", REQ, ["tenant_id"])
    op.create_index(f"ix_{REQ}_tenant_status_step", REQ, ["tenant_id", "status", "current_step"])
    op.create_index(f"ix_{REQ}_tenant_module", REQ, ["tenant_id", "module_code"])
    op.create_index(f"ix_{REQ}_tenant_created_by", REQ, ["tenant_id", "created_by"])
    _rls(REQ)

    op.create_table(
        ACT,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "change_request_id",
            sa.Integer(),
            sa.ForeignKey(f"{REQ}.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("action_kind", sa.String(16), nullable=False),
        sa.Column("actor_user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("from_status", sa.String(24), nullable=True),
        sa.Column("to_status", sa.String(24), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(f"action_kind IN ({_in(ACTION_KINDS)})", name=f"ck_{ACT}_kind"),
    )
    op.create_index(f"ix_{ACT}_tenant_id", ACT, ["tenant_id"])
    op.create_index(f"ix_{ACT}_request", ACT, ["change_request_id", "created_at"])
    _rls(ACT)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    for table in (ACT, REQ):
        op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {table}")
        op.execute(f"ALTER TABLE {table} DISABLE ROW LEVEL SECURITY")
    op.drop_table(ACT)
    op.drop_table(REQ)
