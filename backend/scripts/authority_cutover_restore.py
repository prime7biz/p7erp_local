"""Restore authority cutover for one tenant (class / modules / Super Admin only).

Does not change Role rows or enable/disable the feature flag.

Usage (Docker):
  docker compose exec backend python scripts/authority_cutover_restore.py --tenant-id 1
"""

from __future__ import annotations

import argparse
import asyncio
import sys

from sqlalchemy import select

from app.common.authority.cutover import restore_cutover
from app.database import AsyncSessionLocal
from app.models import Tenant, User


async def _main(tenant_id: int) -> int:
    async with AsyncSessionLocal() as db:
        tenant = await db.get(Tenant, tenant_id)
        if tenant is None:
            print(f"Tenant {tenant_id} not found", file=sys.stderr)
            return 1
        from sqlalchemy.orm import selectinload

        actors = (
            await db.execute(
                select(User)
                .where(User.tenant_id == tenant_id, User.is_active.is_(True))
                .options(selectinload(User.role))
                .order_by(User.id.asc())
            )
        ).scalars().all()
        actor = next((u for u in actors if bool(getattr(u, "is_tenant_super_admin", False))), None)
        if actor is None:
            admin_names = {"admin", "owner", "super_admin", "superadmin"}
            actor = next(
                (
                    u
                    for u in actors
                    if ((getattr(u.role, "name", None) or "").strip().lower() in admin_names)
                ),
                None,
            )
        if actor is None:
            print("No Super Admin / admin-role user in tenant to authorize restore", file=sys.stderr)
            return 1
        result = await restore_cutover(db, tenant_id=tenant_id, actor=actor)
        await db.commit()
        print(result)
        return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Restore authority cutover metadata for a tenant")
    parser.add_argument("--tenant-id", type=int, required=True)
    args = parser.parse_args()
    raise SystemExit(asyncio.run(_main(args.tenant_id)))
