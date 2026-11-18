"""Celery task: daily COA ledger interest accrual (draft journals only)."""

from __future__ import annotations

import logging

from app.common.celery_app import celery_app
from app.common.rls import bind_session_tenant
from app.common.tenant_feature_keys import is_coa_ledger_interest_v1_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.modules.finance.coa_interest.service import run_coa_interest
from app.workers.async_runner import run_async
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            if not is_coa_ledger_interest_v1_enabled(flags):
                continue
            try:
                await bind_session_tenant(db, tenant_id)
                result = await run_coa_interest(db, tenant_id=tenant_id, user_id=None)
                await db.commit()
                results.append({"tenant_id": tenant_id, **{k: result[k] for k in ("created", "skipped", "as_of")}})
            except Exception:
                logger.exception("coa_interest daily failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="finance.coa_interest_accrual")
def coa_interest_accrual_daily() -> dict:
    """Create DRAFT interest journals for completed periods on interest-enabled ledgers."""
    return run_async(_run_all_tenants())
