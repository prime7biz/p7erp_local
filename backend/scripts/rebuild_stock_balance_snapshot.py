#!/usr/bin/env python3
"""Rebuild ``inventory_stock_balance_snapshots`` for a tenant (Docker-first).

Reads live ``stock_movements``, replaces snapshot rows. Does **not** enable
``stock_snapshot_reads`` — set that flag on the tenant after verifying diffs are empty.

Usage::

    docker compose exec backend python scripts/rebuild_stock_balance_snapshot.py --tenant-id 1

Optional shadow check (logs count of mismatches vs live aggregate)::

    docker compose exec backend python scripts/rebuild_stock_balance_snapshot.py --tenant-id 1 --diff-check
"""

from __future__ import annotations

import argparse
import asyncio
import logging

from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.modules.inventory import stock_snapshot_service

logger = logging.getLogger(__name__)


async def _run(tenant_id: int, *, diff_check: bool) -> None:
    async with AsyncSessionLocal() as db:
        try:
            n = await stock_snapshot_service.rebuild_stock_balance_snapshot(db, tenant_id)
            await db.commit()
            print(f"rebuild_ok rows_written={n} tenant_id={tenant_id}")
            if diff_check:
                async with AsyncSessionLocal() as db2:
                    diffs = await stock_snapshot_service.compare_snapshot_to_movements(db2, tenant_id)
                    print(f"diff_rows={len(diffs)}")
                    if diffs[:5]:
                        print("sample_diffs", diffs[:5])
        except Exception:
            await safe_async_session_rollback(db)
            raise


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    p = argparse.ArgumentParser()
    p.add_argument("--tenant-id", type=int, required=True)
    p.add_argument("--diff-check", action="store_true")
    args = p.parse_args()
    asyncio.run(_run(args.tenant_id, diff_check=args.diff_check))


if __name__ == "__main__":
    main()
