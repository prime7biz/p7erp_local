"""Read-only KPI reconcile helper (Phase I).

Usage:
  docker compose exec backend python scripts/kpi_reconcile_report.py --tenant-id <id>
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import date

from sqlalchemy import select

from app.common.rls import bind_session_tenant
from app.database import AsyncSessionLocal
from app.models.kpi_engine import KpiDefinition
from app.modules.kpi_engine.compute.service import compute_kpi
from app.modules.kpi_engine.seed import seed_kpi_definitions


async def main(tenant_id: int) -> None:
    async with AsyncSessionLocal() as db:
        await bind_session_tenant(db, tenant_id)
        await seed_kpi_definitions(db, tenant_id)
        await db.commit()
        defs = list(
            (
                await db.execute(
                    select(KpiDefinition).where(
                        KpiDefinition.tenant_id == tenant_id,
                        KpiDefinition.active.is_(True),
                    )
                )
            ).scalars().all()
        )
        print(f"tenant={tenant_id} definitions={len(defs)} as_of={date.today()}")
        for d in defs:
            v = await compute_kpi(db, tenant_id, d, as_of=date.today())
            print(
                f"{d.code:10} status={v.status:10} value={v.value} "
                f"missing={','.join(v.missing_inputs) or '-'}"
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--tenant-id", type=int, required=True)
    args = parser.parse_args()
    asyncio.run(main(args.tenant_id))
