#!/usr/bin/env python3
"""Read-only: do any active accounts still use a password published in this repository?

Checks active staff users and active external portal principals against
`app.common.demo_credentials.KNOWN_DEMO_PASSWORDS`. Prints counts per tenant id only — never names,
emails, hashes or passwords. Runs inside a READ ONLY transaction.

Usage::

    docker compose exec backend python scripts/check_demo_passwords.py

If anything is found: reset those accounts' passwords in Settings -> User Management (or the portal admin
page), then use "Sign out devices". Exit code 1 means at least one match.
"""

from __future__ import annotations

import asyncio
import sys
from collections import Counter
from pathlib import Path

from sqlalchemy import select, text

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.auth import verify_password  # noqa: E402
from app.common.demo_credentials import KNOWN_DEMO_PASSWORDS  # noqa: E402
from app.common.rls import bind_session_bypass  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models import ExternalPrincipal, User  # noqa: E402


async def _uses_demo_password(password_hash: str | None) -> bool:
    if not password_hash:
        return False
    for candidate in KNOWN_DEMO_PASSWORDS:
        try:
            if await verify_password(candidate, password_hash):
                return True
        except Exception:
            return False
    return False


async def scan() -> dict[str, Counter]:
    found: dict[str, Counter] = {"staff_users": Counter(), "portal_principals": Counter()}
    async with AsyncSessionLocal() as db:
        await bind_session_bypass(db)  # platform-wide check: must see every tenant when RLS is on
        await db.execute(text("SET TRANSACTION READ ONLY"))
        users = (await db.execute(select(User.tenant_id, User.password_hash).where(User.is_active.is_(True)))).all()
        for tenant_id, pw_hash in users:
            if await _uses_demo_password(pw_hash):
                found["staff_users"][tenant_id] += 1
        principals = (
            await db.execute(
                select(ExternalPrincipal.tenant_id, ExternalPrincipal.password_hash).where(
                    ExternalPrincipal.is_active.is_(True)
                )
            )
        ).all()
        for tenant_id, pw_hash in principals:
            if await _uses_demo_password(pw_hash):
                found["portal_principals"][tenant_id] += 1
        await db.rollback()
    return found


def main() -> int:
    found = asyncio.run(scan())
    total = 0
    for kind, per_tenant in found.items():
        n = sum(per_tenant.values())
        total += n
        detail = ", ".join(f"tenant {tid}: {cnt}" for tid, cnt in sorted(per_tenant.items())) or "none"
        print(f"{kind}: {n} account(s) using a published demo password ({detail})")
    return 1 if total else 0


if __name__ == "__main__":
    raise SystemExit(main())
