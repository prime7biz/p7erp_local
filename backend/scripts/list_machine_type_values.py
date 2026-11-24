"""Read-only: list distinct free-text machine_type values for taxonomy confirmation.

Usage (Docker)::

    docker compose exec backend python scripts/list_machine_type_values.py [--tenant-id N]

Does not write anything. Confirm the canonical list before seeding
``production_machine_type_codes``.
"""
from __future__ import annotations

import argparse
import asyncio
from collections import Counter

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import DepartmentMachine, IeOperationsLibrary
from app.models.production import OperationBulletinOp


async def main(tenant_id: int | None) -> None:
    counts: Counter[str] = Counter()
    async with AsyncSessionLocal() as db:
        for model, col in (
            (DepartmentMachine, DepartmentMachine.machine_type),
            (OperationBulletinOp, OperationBulletinOp.machine_type),
            (IeOperationsLibrary, IeOperationsLibrary.machine_type_required),
        ):
            q = select(col).where(col.is_not(None))
            if tenant_id is not None and hasattr(model, "tenant_id"):
                q = q.where(model.tenant_id == tenant_id)
            rows = (await db.execute(q)).scalars().all()
            for v in rows:
                s = str(v or "").strip()
                if s:
                    counts[s] += 1
    print("Distinct machine_type values (count):")
    for k, n in sorted(counts.items(), key=lambda x: (-x[1], x[0].lower())):
        print(f"  {n:5d}  {k}")
    print(f"Total distinct: {len(counts)}")


if __name__ == "__main__":
    p = argparse.ArgumentParser()
    p.add_argument("--tenant-id", type=int, default=None)
    args = p.parse_args()
    asyncio.run(main(args.tenant_id))
