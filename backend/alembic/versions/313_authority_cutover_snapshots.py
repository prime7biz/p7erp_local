"""Immutable cutover snapshots for user_authority_classes_v1 (Phase 7).

Stores original role / class / module state so dry-run → apply → restore can
preserve exact legacy access when the flag is turned off.

Revision ID: 313
Revises: 312
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "313"
down_revision: Union[str, None] = "312"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "authority_cutover_snapshots"
RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"
STATUSES = ("PROPOSED", "APPLIED", "SKIPPED", "UNRESOLVED")


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
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_role_id", sa.Integer(), sa.ForeignKey("roles.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("original_role_name", sa.String(64), nullable=True),
        sa.Column("original_authority_class", sa.String(16), nullable=True),
        sa.Column("original_is_tenant_super_admin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "original_module_grants",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("proposed_authority_class", sa.String(16), nullable=True),
        sa.Column("proposed_is_tenant_super_admin", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column(
            "proposed_module_grants",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("status", sa.String(16), nullable=False, server_default="PROPOSED"),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=True),
        sa.Column("restored_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("tenant_id", "user_id", name="uq_authority_cutover_snapshots_tenant_user"),
        sa.CheckConstraint(
            "status IN (" + ", ".join(f"'{s}'" for s in STATUSES) + ")",
            name="ck_authority_cutover_snapshots_status",
        ),
    )
    op.create_index(
        "ix_authority_cutover_snapshots_tenant_status",
        TABLE,
        ["tenant_id", "status"],
    )
    _rls(TABLE)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    op.execute(f"DROP POLICY IF EXISTS {RLS_POLICY_NAME} ON {TABLE}")
    op.drop_index("ix_authority_cutover_snapshots_tenant_status", table_name=TABLE)
    op.drop_table(TABLE)
