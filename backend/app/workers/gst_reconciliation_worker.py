"""Monthly GST reconciliation Celery task (Sprint 3)."""

from __future__ import annotations

import logging
from calendar import monthrange
from datetime import date

from app.common.business_date import today_local
from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_gst_system_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.modules.finance.gst_return_service import monthly_gst_reconciliation
from app.workers.tenant_rows import active_tenant_rows
from app.common.rls import bind_session_tenant

logger = logging.getLogger(__name__)


def _previous_month_bounds(today: date | None = None) -> tuple[date, date]:
    today = today or today_local()
    if today.month == 1:
        y, m = today.year - 1, 12
    else:
        y, m = today.year, today.month - 1
    last = monthrange(y, m)[1]
    return date(y, m, 1), date(y, m, last)


async def _run() -> dict:
    period_from, period_to = _previous_month_bounds()
    processed = 0
    flagged = 0
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            if not is_gst_system_enabled(flags):
                continue
            try:
                await bind_session_tenant(db, tenant_id)
                result = await monthly_gst_reconciliation(db, tenant_id, period_from, period_to)
                await db.commit()
                processed += 1
                flagged += int(result.get("mismatch_count") or 0)
                if result.get("flags"):
                    logger.info(
                        "gst_reconciliation tenant=%s flags=%s",
                        tenant_id,
                        result["flags"],
                    )
            except Exception:
                logger.exception("monthly_gst_reconciliation failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "tenants_processed": processed,
        "flags_total": flagged,
    }


@celery_app.task(name="finance.monthly_gst_reconciliation")
def monthly_gst_reconciliation_task() -> dict:
    return run_async(_run())
