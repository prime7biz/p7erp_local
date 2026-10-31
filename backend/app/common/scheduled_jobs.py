"""Single-run bodies for recurring background jobs.

Used by both the in-process loops in ``app.main`` (default) and the Celery beat tasks
in ``app.workers.scheduled_jobs_worker`` (when ``INPROCESS_SCHEDULERS_ENABLED=false``).
Each run takes a cross-process advisory lock so only one worker executes it.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone

from app.common.background_lock import (
    LOCK_MERCH_ALERT_SCAN,
    LOCK_PLATFORM_MAINTENANCE,
    LOCK_SYSTEM_COA_SEED,
    LOCK_TRADE_ALERT_SCAN,
    LOCK_WEEKLY_AI_REPORTS,
    background_job_lock,
)

logger = logging.getLogger(__name__)


async def run_merch_alert_scan_once() -> bool:
    from app.database import AsyncSessionLocal, safe_async_session_rollback
    from app.modules.merch.alert_engine import get_tenant_ids, run_scan

    async with background_job_lock(LOCK_MERCH_ALERT_SCAN) as got:
        if not got:
            return False
        async with AsyncSessionLocal() as db:
            for tid in await get_tenant_ids(db):
                try:
                    await run_scan(db, tid, trigger="scheduled")
                    await db.commit()
                except Exception:
                    logger.exception("merch alert scan failed tenant=%s", tid)
                    await safe_async_session_rollback(db)
    return True


async def run_trade_alert_scan_once() -> bool:
    from app.database import AsyncSessionLocal, safe_async_session_rollback
    from app.modules.merch.alert_engine import get_tenant_ids, run_scan_trade_rules_only

    async with background_job_lock(LOCK_TRADE_ALERT_SCAN) as got:
        if not got:
            return False
        async with AsyncSessionLocal() as db:
            for tid in await get_tenant_ids(db):
                try:
                    await run_scan_trade_rules_only(db, tid, trigger="scheduled_daily")
                    await db.commit()
                except Exception:
                    logger.exception("trade alert scan failed tenant=%s", tid)
                    await safe_async_session_rollback(db)
    return True


async def run_weekly_ai_reports_once(*, only_on_sunday: bool = True) -> bool:
    from app.database import AsyncSessionLocal, safe_async_session_rollback
    from app.modules.ai_tool.weekly_report_service import generate_and_store_weekly_report
    from app.modules.merch.alert_engine import get_tenant_ids

    if only_on_sunday and datetime.now(timezone.utc).weekday() != 6:
        return False
    async with background_job_lock(LOCK_WEEKLY_AI_REPORTS) as got:
        if not got:
            return False
        async with AsyncSessionLocal() as db:
            for tid in await get_tenant_ids(db):
                try:
                    await generate_and_store_weekly_report(db, tid)
                    await db.commit()
                except Exception:
                    logger.exception("weekly AI report failed tenant=%s", tid)
                    await safe_async_session_rollback(db)
    return True


async def run_platform_maintenance_once() -> bool:
    from app.database import AsyncSessionLocal, safe_async_session_rollback
    from app.modules.admin.tasks import run_platform_daily_maintenance

    async with background_job_lock(LOCK_PLATFORM_MAINTENANCE) as got:
        if not got:
            return False
        async with AsyncSessionLocal() as db:
            try:
                await run_platform_daily_maintenance(db)
                await db.commit()
            except Exception:
                logger.exception("platform daily maintenance failed")
                await safe_async_session_rollback(db)
    return True


async def seed_system_coa_once() -> bool:
    """Startup self-heal; locked so N uvicorn workers do not seed concurrently."""
    from app.database import AsyncSessionLocal
    from app.modules.finance.system_coa_seeding_service import seed_all_tenants_system_coa

    async with background_job_lock(LOCK_SYSTEM_COA_SEED) as got:
        if not got:
            return False
        async with AsyncSessionLocal() as db:
            await seed_all_tenants_system_coa(db)
            await db.commit()
    return True
