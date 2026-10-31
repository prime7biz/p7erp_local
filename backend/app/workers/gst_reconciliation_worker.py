"""Monthly GST reconciliation Celery task (Sprint 3)."""

from __future__ import annotations

import asyncio
import logging
from calendar import monthrange
from datetime import date

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.common.tenant_feature_keys import is_gst_system_enabled
from app.database import AsyncSessionLocal
from app.models import Tenant
from app.modules.finance.gst_return_service import monthly_gst_reconciliation

logger = logging.getLogger(__name__)


def _previous_month_bounds(today: date | None = None) -> tuple[date, date]:
    today = today or date.today()
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
        tenants = list((await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all())
        for tenant in tenants:
            if not is_gst_system_enabled(tenant.feature_flags):
                continue
            try:
                result = await monthly_gst_reconciliation(db, tenant.id, period_from, period_to)
                processed += 1
                flagged += int(result.get("mismatch_count") or 0)
                if result.get("flags"):
                    logger.info(
                        "gst_reconciliation tenant=%s flags=%s",
                        tenant.id,
                        result["flags"],
                    )
            except Exception:
                logger.exception("monthly_gst_reconciliation failed tenant=%s", tenant.id)
        await db.commit()
    return {
        "period_from": period_from.isoformat(),
        "period_to": period_to.isoformat(),
        "tenants_processed": processed,
        "flags_total": flagged,
    }


@celery_app.task(name="finance.monthly_gst_reconciliation")
def monthly_gst_reconciliation_task() -> dict:
    return asyncio.run(_run())
