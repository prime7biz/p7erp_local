#!/usr/bin/env python3
"""Read-only RBAC readiness report (aggregate counts only; no names, emails or business data).

Answers, before any production permission change:
  1. How many tenants run RBAC in off / shadow / enforce mode.
  2. For the fail-closed HR keys (hr.payroll.manage, hr.attendance.manage, hr.leave.types.manage):
     how many roles already pass (manager-type role name, wildcard or explicit grant) and how many
     non-manager roles would lose access once the new checks are deployed.
  3. Which API route prefixes are mounted without any module-level permission dependency.

Usage::

    docker compose exec backend python scripts/rbac_access_report.py
    docker compose exec backend python scripts/rbac_access_report.py --json
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

from sqlalchemy import select, text

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.permissions import (  # noqa: E402
    HR_SETUP_BYPASS_ROLES,
    PERMISSION_HR_ATTENDANCE_MANAGE,
    PERMISSION_HR_LEAVE_TYPES_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    internal_permission_granted,
)
from app.common.tenant_feature_keys import get_tenant_rbac_mode  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models import Role, Tenant  # noqa: E402

FAIL_CLOSED_KEYS = (PERMISSION_HR_PAYROLL_MANAGE, PERMISSION_HR_ATTENDANCE_MANAGE, PERMISSION_HR_LEAVE_TYPES_MANAGE)


def route_permission_keys(route) -> set[str]:
    """Module permission keys on a route (same rule as tests/test_route_permission_inventory.py)."""
    found: set[str] = set()
    for dep in _walk(route.dependant):
        keys = getattr(dep.call, "permission_keys", None)
        if keys:
            found.update(keys)
    return found


def ungated_route_prefixes(routes) -> list[str]:
    """Route prefixes whose endpoints carry no module permission dependency."""
    ungated: Counter[str] = Counter()
    for route in routes:
        path = getattr(route, "path", "")
        if not path.startswith("/api/v1/") or not hasattr(route, "dependant"):
            continue
        if not route_permission_keys(route):
            ungated["/".join(path.split("/")[:4])] += 1
    return [f"{p} ({n} routes)" for p, n in sorted(ungated.items())]


def _ungated_route_prefixes() -> list[str]:
    from app.main import app

    return ungated_route_prefixes(app.routes)


def _walk(dep):
    for d in dep.dependencies:
        yield d
        yield from _walk(d)


async def _report() -> dict:
    async with AsyncSessionLocal() as db:
        await db.execute(text("SET TRANSACTION READ ONLY"))
        tenants = (await db.execute(select(Tenant.id, Tenant.feature_flags))).all()
        modes = Counter(get_tenant_rbac_mode(flags) for _tid, flags in tenants)
        roles = (await db.execute(select(Role))).scalars().all()
        per_key: dict[str, Counter] = defaultdict(Counter)
        for role in roles:
            bypass = (role.name or "").strip().lower() in HR_SETUP_BYPASS_ROLES
            for key in FAIL_CLOSED_KEYS:
                if bypass:
                    per_key[key]["allowed_by_role_name"] += 1
                elif internal_permission_granted(role=role, permission_key=key):
                    per_key[key]["allowed_by_grant"] += 1
                else:
                    per_key[key]["would_be_denied"] += 1
        await db.rollback()
    return {
        "tenants_total": len(tenants),
        "rbac_mode_counts": dict(modes),
        "roles_total": len(roles),
        "fail_closed_hr_keys": {k: dict(v) for k, v in per_key.items()},
        "ungated_route_prefixes": _ungated_route_prefixes(),
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--json", action="store_true")
    args = p.parse_args()
    report = asyncio.run(_report())
    if args.json:
        print(json.dumps(report, indent=2))
        return
    print(f"tenants_total={report['tenants_total']} rbac_modes={report['rbac_mode_counts']}")
    print(f"roles_total={report['roles_total']}")
    for key, counts in report["fail_closed_hr_keys"].items():
        print(f"  {key}: {counts}")
    print("ungated route prefixes:")
    for line in report["ungated_route_prefixes"]:
        print(f"  {line}")


if __name__ == "__main__":
    main()
