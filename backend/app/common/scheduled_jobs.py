"""Single-run bodies for recurring background jobs.

Used by both the in-process loops in ``app.main`` (default) and the Celery beat tasks
in ``app.workers.scheduled_jobs_worker`` (when ``INPROCESS_SCHEDULERS_ENABLED=false``).
Each run takes a cross-process advisory lock so only one worker executes it.

Per-tenant jobs open a fresh session per tenant: a slow tenant then holds one pooled
connection only for its own work, and a failure cannot leak state into the next tenant.
"""

from __future__ import annotations

import logging
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.background_lock import (
    LOCK_MERCH_ALERT_SCAN,
    LOCK_PLATFORM_MAINTENANCE,
    LOCK_SYSTEM_COA_SEED,
    LOCK_TRADE_ALERT_SCAN,
    LOCK_WEEKLY_AI_REPORTS,
    background_job_lock,
)

logger = logging.getLogger(__name__)


async def _list_tenant_ids() -> list[int]:
    from app.database import AsyncSessionLocal
    from app.modules.merch.alert_engine import get_tenant_ids

    async with AsyncSessionLocal() as db:
        return await get_tenant_ids(db)


async def _run_per_tenant(job_name: str, work: Callable[[AsyncSession, int], Awaitable[object]]) -> None:
    from app.common.rls import bind_session_tenant
    from app.database import AsyncSessionLocal, safe_async_session_rollback

    for tid in await _list_tenant_ids():
        async with AsyncSessionLocal() as db:
            try:
                await bind_session_tenant(db, tid)
                await work(db, tid)
                await db.commit()
            except Exception:
                logger.exception("%s failed tenant=%s", job_name, tid)
                await safe_async_session_rollback(db)


async def run_merch_alert_scan_once() -> bool:
    from app.modules.merch.alert_engine import run_scan

    async with background_job_lock(LOCK_MERCH_ALERT_SCAN) as got:
        if not got:
            return False
        await _run_per_tenant("merch alert scan", lambda db, tid: run_scan(db, tid, trigger="scheduled"))
    return True


async def run_trade_alert_scan_once() -> bool:
    from app.modules.merch.alert_engine import run_scan_trade_rules_only

    async with background_job_lock(LOCK_TRADE_ALERT_SCAN) as got:
        if not got:
            return False
        await _run_per_tenant(
            "trade alert scan",
            lambda db, tid: run_scan_trade_rules_only(db, tid, trigger="scheduled_daily"),
        )
    return True


async def run_weekly_ai_reports_once(*, only_on_sunday: bool = True) -> bool:
    from app.modules.ai_tool.weekly_report_service import generate_and_store_weekly_report

    if only_on_sunday and datetime.now(timezone.utc).weekday() != 6:
        return False
    async with background_job_lock(LOCK_WEEKLY_AI_REPORTS) as got:
        if not got:
            return False
        await _run_per_tenant("weekly AI report", generate_and_store_weekly_report)
    return True


async def run_platform_maintenance_once() -> bool:
    from app.database import AsyncSessionLocal, safe_async_session_rollback
    from app.modules.admin.tasks import run_platform_daily_maintenance
    from app.modules.merch.alert_scan_retention import purge_old_alert_scan_logs

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
        # Own session + commit per batch, so a failure here never undoes the work above.
        async with AsyncSessionLocal() as db:
            try:
                await purge_old_alert_scan_logs(db)
            except Exception:
                logger.exception("alert_scan_log retention purge failed")
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
