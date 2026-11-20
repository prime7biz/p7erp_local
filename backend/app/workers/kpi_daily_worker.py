"""Daily KPI aggregate job (Phase J). Per-tenant bind_session_tenant; fail closed."""

from __future__ import annotations

import logging
from datetime import date, timedelta

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.common.rls import bind_session_tenant
from app.common.tenant_feature_keys import is_kpi_engine_v1_enabled
from app.database import AsyncSessionLocal
from app.models import Tenant
from app.modules.kpi_engine.recalc_service import enqueue_recalc, run_job
from app.workers.async_runner import run_async

logger = logging.getLogger(__name__)


async def _run_for_all_tenants() -> dict:
    today = date.today()
    day = today - timedelta(days=1)
    processed = 0
    skipped = 0
    failed = 0
    async with AsyncSessionLocal() as db:
        tenants = list((await db.execute(select(Tenant).where(Tenant.deleted_at.is_(None)))).scalars().all())
    for tenant in tenants:
        if not is_kpi_engine_v1_enabled(tenant.feature_flags):
            skipped += 1
            continue
        try:
            async with AsyncSessionLocal() as db:
                await bind_session_tenant(db, tenant.id)
                job = await enqueue_recalc(
                    db,
                    tenant_id=tenant.id,
                    date_from=day,
                    date_to=day,
                    reason="daily_worker",
                )
                await run_job(db, job)
                await db.commit()
                processed += 1
        except Exception:
            failed += 1
            logger.exception("kpi_daily_worker_failed tenant_id=%s", tenant.id)
    return {"processed": processed, "skipped": skipped, "failed": failed, "day": day.isoformat()}


@celery_app.task(name="kpi.daily_aggregate")
def kpi_daily_aggregate() -> dict:
    return run_async(_run_for_all_tenants())
