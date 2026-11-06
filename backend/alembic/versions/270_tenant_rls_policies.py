"""Row-Level Security (RLS) policies on every table with a tenant_id column (SEC-04).

What it does: for each base table in the current schema that has a ``tenant_id`` column,
``ENABLE ROW LEVEL SECURITY`` and create policy ``p7_tenant_isolation``. A row is visible /
writable when:

* ``app.rls_bypass`` = 'on' (login, platform admin, cross-tenant jobs), or
* ``tenant_id`` = ``app.tenant_id`` (the tenant of the current request / job), or
* the column is nullable and ``tenant_id IS NULL`` (shared rows: system roles, global
  knowledge documents, compliance frameworks, platform job rows).

Both settings are read with ``current_setting(name, true)`` so a session that never set them
gets NULL / '' and therefore sees **no** tenant rows (fail closed) — unless it bypasses.

Why this changes nothing today: RLS is ENABLED but not FORCED, and Postgres skips policies for
the table owner and for superusers. The app currently connects as the owner. Policies start to
apply only after the app connects as the non-owner role ``p7erp_app``
(``backend/scripts/create_rls_app_role.sql``) with ``RLS_SESSION_TENANT_ENABLED=true``.
Runbook: ``docs/erp-modernization/RLS_RUNBOOK.md``.

Locks: ENABLE RLS / CREATE POLICY take a short ACCESS EXCLUSIVE lock per table (no rewrite,
no data scan). lock_timeout makes the migration fail fast (and roll back) instead of queueing
behind long-running queries; re-run it at a quieter moment.

Tables created later are NOT covered automatically: their migration must add the same policy
(``tests/test_rls_policies.py`` fails while a tenant_id table has no policy).

Rollback: ``alembic downgrade 265`` drops the policies and disables RLS on those tables.

Revision ID: 270
Revises: 265
"""

from __future__ import annotations

import logging
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "270"
down_revision: Union[str, None] = "265"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

POLICY_NAME = "p7_tenant_isolation"
log = logging.getLogger("alembic.runtime.migration")

_BYPASS = "current_setting('app.rls_bypass', true) = 'on'"
_SAME_TENANT = "tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::integer"


def _policy_expression(nullable: bool) -> str:
    parts = [_BYPASS, _SAME_TENANT]
    if nullable:
        parts.append("tenant_id IS NULL")
    return " OR ".join(f"({p})" for p in parts)


def _tenant_tables() -> list[tuple[str, bool]]:
    rows = op.get_bind().execute(
        sa.text(
            """
            SELECT c.table_name, c.is_nullable = 'YES'
            FROM information_schema.columns c
            JOIN information_schema.tables t
              ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = current_schema()
              AND t.table_type = 'BASE TABLE'
              AND c.column_name = 'tenant_id'
            ORDER BY c.table_name
            """
        )
    ).all()
    return [(str(name), bool(nullable)) for name, nullable in rows]


def _quote(name: str) -> str:
    return '"' + name.replace('"', '""') + '"'


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    tables = _tenant_tables()
    for table, nullable in tables:
        qt = _quote(table)
        expr = _policy_expression(nullable)
        op.execute(f"DROP POLICY IF EXISTS {POLICY_NAME} ON {qt}")
        op.execute(f"CREATE POLICY {POLICY_NAME} ON {qt} AS PERMISSIVE FOR ALL USING ({expr}) WITH CHECK ({expr})")
        op.execute(f"ALTER TABLE {qt} ENABLE ROW LEVEL SECURITY")
    log.info("RLS policy %s on %s tenant tables (enabled, not forced)", POLICY_NAME, len(tables))


def downgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '10s'")
    rows = op.get_bind().execute(
        sa.text(
            "SELECT tablename FROM pg_policies WHERE schemaname = current_schema() AND policyname = :p ORDER BY 1"
        ),
        {"p": POLICY_NAME},
    ).all()
    for (table,) in rows:
        qt = _quote(str(table))
        op.execute(f"DROP POLICY IF EXISTS {POLICY_NAME} ON {qt}")
        op.execute(f"ALTER TABLE {qt} DISABLE ROW LEVEL SECURITY")
    log.info("RLS policy %s removed from %s tables", POLICY_NAME, len(rows))
