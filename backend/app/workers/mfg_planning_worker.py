"""Celery: daily Manufacturing Intelligence planning lifecycle (Phase 2, R4).

Per active tenant with `manufacturing_intelligence_v1` on:
- `mfg_integrated_planning_v1` on: ACTIVE tentative line bookings past `expires_at` become EXPIRED, and those whose
  inquiry / quotation now has an order become CONVERTED
- `mfg_material_allocation_v1` on: allocation lifecycle (expired tentative holds / pegs and holds / pegs of closed
  orders are released; peg conflicts are never auto-fixed)

Each tenant runs in its own transaction (bound with `bind_session_tenant`) and commits on success. A failing tenant
is logged and rolled back and the job continues with the next one (fail closed).
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.celery_app import celery_app
from app.common.rls import bind_session_tenant
from app.common.tenant_feature_keys import (
    is_manufacturing_intelligence_v1_enabled,
    is_mfg_integrated_planning_v1_enabled,
    is_mfg_material_allocation_v1_enabled,
)
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.workers.async_runner import run_async
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)


async def _run_tenant(db: AsyncSession, tenant_id: int, flags: Any, now: datetime) -> dict[str, Any]:
    """One tenant's lifecycle in the caller's transaction (the caller commits or rolls back)."""
    from app.modules.inventory.allocation_reconcile_service import apply_lifecycle
    from app.modules.production.tentative_booking_service import convert_ordered_bookings, expire_due_bookings

    await bind_session_tenant(db, tenant_id)
    out: dict[str, Any] = {"tenant_id": tenant_id}
    if is_mfg_integrated_planning_v1_enabled(flags):
        out["tentative_expired"] = await expire_due_bookings(db, tenant_id, now=now)
        out["tentative_converted"] = await convert_ordered_bookings(db, tenant_id)
    if is_mfg_material_allocation_v1_enabled(flags):
        out.update(await apply_lifecycle(db, tenant_id, now=now))
    return out


def _wants_job(flags: Any) -> bool:
    return is_manufacturing_intelligence_v1_enabled(flags) and (
        is_mfg_integrated_planning_v1_enabled(flags) or is_mfg_material_allocation_v1_enabled(flags)
    )


async def run_lifecycle_all_tenants(db: AsyncSession, *, now: datetime | None = None) -> dict[str, Any]:
    """Testable body: loops over active tenants on the given session."""
    now = now or datetime.utcnow()
    results: list[dict[str, Any]] = []
    for tenant_id, flags in await active_tenant_rows(db):
        if not _wants_job(flags):
            results.append({"tenant_id": tenant_id, "skipped": True})
            continue
        try:
            result = await _run_tenant(db, tenant_id, flags, now)
            await db.commit()
            logger.info("mfg_planning_lifecycle tenant=%s result=%s", tenant_id, result)
            results.append(result)
        except Exception:
            logger.exception("mfg_planning_lifecycle failed tenant=%s", tenant_id)
            await safe_async_session_rollback(db)
            results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


async def _run_all_tenants() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        return await run_lifecycle_all_tenants(db)


@celery_app.task(name="mfg.planning_lifecycle_daily")
def mfg_planning_lifecycle_daily() -> dict[str, Any]:
    return run_async(_run_all_tenants())
