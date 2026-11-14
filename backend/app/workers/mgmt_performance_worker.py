"""Celery: daily budget scan `mgmt.budget_exception_scan` (Finance > Management Performance). 20:00 UTC = 02:00 Dhaka.

Per active tenant with `mgmt_performance_v1` strictly true: bind_session_tenant, statement timeout, scan the current
month (creates / escalates budget exceptions, notifies owners and managers). Each tenant commits on its own; a
failure is logged, rolled back and the job moves on (fail closed). Tenants with the flag off are skipped.
"""

from __future__ import annotations

import logging
from datetime import date
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.celery_app import celery_app
from app.common.rls import bind_session_tenant
from app.common.tenant_feature_keys import is_mgmt_performance_v1_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.workers.async_runner import run_async
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)

STATEMENT_TIMEOUT = "120s"


async def run_scan_all_tenants(db: AsyncSession, *, today: date | None = None) -> dict[str, Any]:
    from app.models import Tenant
    from app.modules.finance.mgmt_performance.exception_service import scan_tenant

    results: list[dict[str, Any]] = []
    for tenant_id, flags in await active_tenant_rows(db):
        if not is_mgmt_performance_v1_enabled(flags):
            continue
        try:
            await bind_session_tenant(db, tenant_id)
            await db.execute(text(f"SET LOCAL statement_timeout = '{STATEMENT_TIMEOUT}'"))
            tenant = await db.get(Tenant, tenant_id)
            counts = await scan_tenant(db, tenant, today=today)
            await db.commit()
            logger.info("mgmt_budget_exception_scan tenant=%s result=%s", tenant_id, counts)
            results.append({"tenant_id": tenant_id, **counts})
        except Exception:
            logger.exception("mgmt_budget_exception_scan failed tenant=%s", tenant_id)
            await safe_async_session_rollback(db)
            results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


async def _run_all_tenants() -> dict[str, Any]:
    async with AsyncSessionLocal() as db:
        return await run_scan_all_tenants(db)


@celery_app.task(name="mgmt.budget_exception_scan")
def mgmt_budget_exception_scan() -> dict[str, Any]:
    return run_async(_run_all_tenants())
