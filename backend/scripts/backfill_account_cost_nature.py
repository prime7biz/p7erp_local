"""
Backfill chart_of_accounts.cost_nature from account name heuristics (tenant-scoped).

Run: docker compose exec backend python scripts/backfill_account_cost_nature.py [--tenant-id N] [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from sqlalchemy import select, update  # noqa: E402

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.finance import ChartOfAccount  # noqa: E402


def _infer(name: str) -> str | None:
    n = (name or "").lower()
    if any(x in n for x in ("fabric", "yarn", "trim", "button", "zipper", "material", "raw", "store", "inventory")):
        return "MATERIAL"
    if any(x in n for x in ("wage", "salary", "factory", "cm ", " manufacturing", "overhead", "production cost", "sewing")):
        return "CM"
    if any(x in n for x in ("bank", "interest", "finance charge")):
        return "NON_OPERATING"
    if any(x in n for x in ("sales", "revenue", "export", "customer")):
        return "OTHER"
    return None


async def run(*, tenant_id: int | None, dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        stmt = select(ChartOfAccount).where(ChartOfAccount.cost_nature.is_(None))
        if tenant_id is not None:
            stmt = stmt.where(ChartOfAccount.tenant_id == tenant_id)
        r = await db.execute(stmt)
        rows = list(r.scalars().all())
        updated = 0
        for acc in rows:
            inferred = _infer(acc.name)
            if not inferred:
                continue
            if dry_run:
                print(f"[dry-run] tenant={acc.tenant_id} id={acc.id} {acc.name!r} -> {inferred}")
            else:
                await db.execute(
                    update(ChartOfAccount)
                    .where(ChartOfAccount.id == acc.id)
                    .values(cost_nature=inferred)
                )
            updated += 1
        if not dry_run:
            await db.commit()
        print(f"Processed {len(rows)} accounts with null cost_nature; set {updated}.")


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--tenant-id", type=int, default=None)
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()
    asyncio.run(run(tenant_id=args.tenant_id, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
