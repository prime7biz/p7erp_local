#!/usr/bin/env python3
"""Read-only Row-Level Security (RLS) status report (SEC-04). Changes nothing.

Answers:
  1. Is RLS session context on (RLS_SESSION_TENANT_ENABLED) and which DB role does the app use?
  2. Is that role subject to the policies (not superuser, not owner, no BYPASSRLS)?
  3. Does every table with a tenant_id column have policy p7_tenant_isolation (and RLS enabled)?
  4. Which tenant tables have no index starting with tenant_id (slower policy checks on big scans)?

Usage::

    docker compose exec backend python scripts/rls_status_report.py
    docker compose exec backend python scripts/rls_status_report.py --json

Runbook: docs/erp-modernization/RLS_RUNBOOK.md
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import text

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.rls import bind_session_bypass, rls_session_enabled  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402

POLICY = "p7_tenant_isolation"

_TABLES_SQL = text(
    """
    SELECT c.table_name,
           cl.relrowsecurity AS rls_enabled,
           cl.relforcerowsecurity AS rls_forced,
           pg_get_userbyid(cl.relowner) AS owner,
           EXISTS (SELECT 1 FROM pg_policies p
                   WHERE p.schemaname = c.table_schema AND p.tablename = c.table_name
                     AND p.policyname = :policy) AS has_policy,
           EXISTS (SELECT 1 FROM pg_index i
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
                   WHERE i.indrelid = cl.oid AND a.attname = 'tenant_id') AS has_tenant_index,
           COALESCE(s.n_live_tup, 0) AS approx_rows
    FROM information_schema.columns c
    JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    JOIN pg_namespace n ON n.nspname = c.table_schema
    JOIN pg_class cl ON cl.relnamespace = n.oid AND cl.relname = c.table_name
    LEFT JOIN pg_stat_user_tables s ON s.relid = cl.oid
    WHERE c.table_schema = current_schema() AND t.table_type = 'BASE TABLE' AND c.column_name = 'tenant_id'
    ORDER BY c.table_name
    """
)


async def build_report() -> dict:
    async with AsyncSessionLocal() as db:
        await bind_session_bypass(db)
        role = (
            await db.execute(
                text(
                    "SELECT current_user AS name, r.rolsuper AS superuser, r.rolbypassrls AS bypassrls "
                    "FROM pg_roles r WHERE r.rolname = current_user"
                )
            )
        ).one()
        tables = (await db.execute(_TABLES_SQL, {"policy": POLICY})).mappings().all()
    owned = sorted(t["table_name"] for t in tables if t["owner"] == role.name)
    enforced = bool(rls_session_enabled() and not role.superuser and not role.bypassrls and not owned)
    return {
        "rls_session_tenant_enabled": rls_session_enabled(),
        "app_db_role": role.name,
        "app_role_is_superuser": bool(role.superuser),
        "app_role_has_bypassrls": bool(role.bypassrls),
        "tenant_tables_owned_by_app_role": len(owned),
        "policies_enforced_for_app": enforced,
        "tenant_tables": len(tables),
        "tables_missing_policy": sorted(t["table_name"] for t in tables if not (t["has_policy"] and t["rls_enabled"])),
        "tables_forced": sorted(t["table_name"] for t in tables if t["rls_forced"]),
        "tables_without_tenant_index": [
            {"table": t["table_name"], "approx_rows": int(t["approx_rows"])}
            for t in tables
            if not t["has_tenant_index"]
        ],
    }


def _print_text(rep: dict) -> None:
    print("RLS status report")
    print(f"  RLS_SESSION_TENANT_ENABLED : {rep['rls_session_tenant_enabled']}")
    print(f"  App DB role                : {rep['app_db_role']}")
    print(f"    superuser / BYPASSRLS    : {rep['app_role_is_superuser']} / {rep['app_role_has_bypassrls']}")
    print(f"    owns tenant tables       : {rep['tenant_tables_owned_by_app_role']}")
    print(f"  Policies ENFORCED for app  : {rep['policies_enforced_for_app']}")
    print(f"  Tenant tables              : {rep['tenant_tables']}")
    print(f"  Missing policy             : {len(rep['tables_missing_policy'])} {rep['tables_missing_policy'] or ''}")
    print(f"  FORCED (should be none)    : {rep['tables_forced'] or 'none'}")
    print(f"  No tenant_id index         : {len(rep['tables_without_tenant_index'])}")
    for row in rep["tables_without_tenant_index"]:
        print(f"    - {row['table']} (~{row['approx_rows']} rows)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--json", action="store_true", help="print JSON instead of text")
    args = parser.parse_args()
    rep = asyncio.run(build_report())
    if args.json:
        print(json.dumps(rep, indent=2))
    else:
        _print_text(rep)


if __name__ == "__main__":
    main()
