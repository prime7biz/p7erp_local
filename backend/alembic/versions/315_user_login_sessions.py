"""Staff login session telemetry (User Activity Phase 2).

Additive table ``user_login_sessions`` + RLS ``p7_tenant_isolation``.
Unused for writes while env ``USER_SESSION_TRACKING_ENABLED`` is false (default).
JWT ``sid`` claims are issued regardless so enabling later stays compatible.

Rollback: set ``USER_SESSION_TRACKING_ENABLED=false``, export rows if needed,
``alembic downgrade 314``.

Revision ID: 315
Revises: 314
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "315"
down_revision: Union[str, None] = "314"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RLS_POLICY_NAME = "p7_tenant_isolation"
_RLS_BYPASS = "(SELECT current_setting('app.rls_bypass', true)) = 'on'"
_RLS_SAME_TENANT = "tenant_id = (SELECT NULLIF(current_setting('app.tenant_id', true), '')::integer)"
TABLE = "user_login_sessions"


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
        TABLE,
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("tenant_id", sa.Integer(), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(64), nullable=False),
        sa.Column("session_version", sa.Integer(), nullable=True),
        sa.Column("login_at", sa.DateTime(), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(), nullable=False),
        sa.Column("logout_at", sa.DateTime(), nullable=True),
        sa.Column("ended_reason", sa.String(32), nullable=True),
        sa.Column("ip_address", sa.String(45), nullable=True),
        sa.Column("user_agent", sa.Text(), nullable=True),
        sa.Column("device_label", sa.String(128), nullable=True),
        sa.UniqueConstraint("tenant_id", "session_id", name="uq_user_login_sessions_tenant_session"),
    )
    op.create_index("ix_user_login_sessions_tenant_id", TABLE, ["tenant_id"])
    op.create_index("ix_user_login_sessions_user_id", TABLE, ["user_id"])
    op.create_index(
        "ix_user_login_sessions_tenant_user_login",
        TABLE,
        ["tenant_id", "user_id", "login_at"],
    )
    op.create_index(
        "ix_user_login_sessions_open",
        TABLE,
        ["tenant_id", "user_id"],
        postgresql_where=sa.text("logout_at IS NULL"),
    )
    _enable_rls(TABLE)


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    _disable_rls(TABLE)
    op.drop_index("ix_user_login_sessions_open", table_name=TABLE)
    op.drop_index("ix_user_login_sessions_tenant_user_login", table_name=TABLE)
    op.drop_index("ix_user_login_sessions_user_id", table_name=TABLE)
    op.drop_index("ix_user_login_sessions_tenant_id", table_name=TABLE)
    op.drop_table(TABLE)
