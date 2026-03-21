"""
Rebuild FIFO cost layers for every tenant (same logic as POST /api/v1/inventory/fifo-rebuild).

Run from repo root (Docker):
  docker compose exec -T backend python scripts/run_fifo_rebuild_all_tenants.py

Or from backend dir with DATABASE_URL set:
  python scripts/run_fifo_rebuild_all_tenants.py
"""
from __future__ import annotations

import asyncio
import sys
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import Tenant
from app.services.fifo_inventory import rebuild_fifo_layers_for_tenant


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant_ids = list((await db.execute(select(Tenant.id))).scalars().all())
        if not tenant_ids:
            print("No tenants found.")
            return
        for tid in tenant_ids:
            stats = await rebuild_fifo_layers_for_tenant(db, tid)
            await db.commit()
            print(f"tenant_id={tid} ok {stats}")


if __name__ == "__main__":
    asyncio.run(main())
