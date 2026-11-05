"""Celery: weekly cycle-count schedule + monthly stock-aging alerts (Sprint I3)."""

from __future__ import annotations

import logging

from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_cycle_counting_enabled, is_stock_aging_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.models.tenant import Tenant
from app.modules.inventory import cycle_count_service, stock_aging_service
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)


async def _weekly_cycle_count() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            try:
                if not is_cycle_counting_enabled(flags):
                    results.append({"tenant_id": tenant_id, "skipped": True})
                    continue
                tenant = await db.get(Tenant, tenant_id)
                if tenant is None:
                    continue
                created = await cycle_count_service.generate_cycle_count_schedule(db, tenant)
                await db.commit()
                # Email placeholder — log for warehouse team
                if created:
                    logger.info(
                        "CYCLE_COUNT_EMAIL tenant=%s tasks=%s (notify warehouse team)",
                        tenant_id,
                        len(created),
                    )
                results.append({"tenant_id": tenant_id, "created": len(created)})
            except Exception:
                logger.exception("weekly_cycle_count_schedule failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


async def _monthly_aging_alert() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            try:
                if not is_stock_aging_enabled(flags):
                    results.append({"tenant_id": tenant_id, "skipped": True})
                    continue
                report = await stock_aging_service.get_stock_aging(db, tenant_id)
                slow = report.get("slow_moving_value_180_plus") or "0"
                if float(slow or 0) > 0:
                    logger.warning(
                        "STOCK_AGING_ALERT tenant=%s slow_moving_180_plus=%s over_365=%s (notify procurement)",
                        tenant_id,
                        slow,
                        report.get("over_365_value"),
                    )
                results.append(
                    {
                        "tenant_id": tenant_id,
                        "slow_moving_value": slow,
                        "over_365_value": report.get("over_365_value"),
                    }
                )
            except Exception:
                logger.exception("monthly_stock_aging_alert failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="inventory.weekly_cycle_count_schedule")
def weekly_cycle_count_schedule() -> dict:
    return run_async(_weekly_cycle_count())


@celery_app.task(name="inventory.monthly_stock_aging_alert")
def monthly_stock_aging_alert() -> dict:
    return run_async(_monthly_aging_alert())
