"""Celery: daily stock batch expiry + low-stock / expiring alerts."""

from __future__ import annotations

import logging

from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_batch_tracking_enabled, is_stock_hierarchy_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.modules.inventory.stock_batch_service import (
    get_expiring_batches,
    get_low_stock_items,
    mark_expired_batches,
)
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            try:
                if not (is_batch_tracking_enabled(flags) or is_stock_hierarchy_enabled(flags)):
                    results.append({"tenant_id": tenant_id, "skipped": True})
                    continue
                expired = 0
                if is_batch_tracking_enabled(flags):
                    expired = await mark_expired_batches(db, tenant_id)
                    expiring = await get_expiring_batches(db, tenant_id, days=30)
                    for row in expiring:
                        logger.warning(
                            "EXPIRING_BATCH tenant=%s item=%s batch=%s days=%s qty=%s",
                            tenant_id,
                            row.get("stock_item_id"),
                            row.get("batch_number"),
                            row.get("days_to_expiry"),
                            row.get("current_qty"),
                        )
                else:
                    expiring = []
                low = []
                if is_stock_hierarchy_enabled(flags):
                    low = await get_low_stock_items(db, tenant_id)
                    for row in low:
                        logger.warning(
                            "LOW_STOCK tenant=%s item=%s stock=%s reorder=%s",
                            tenant_id,
                            row.get("item_code"),
                            row.get("current_stock"),
                            row.get("reorder_level"),
                        )
                await db.commit()
                results.append(
                    {
                        "tenant_id": tenant_id,
                        "expired": expired,
                        "expiring": len(expiring),
                        "low_stock": len(low),
                    }
                )
            except Exception:
                logger.exception("daily_stock_maintenance failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="inventory.daily_stock_maintenance")
def daily_stock_maintenance() -> dict:
    return run_async(_run_all_tenants())
