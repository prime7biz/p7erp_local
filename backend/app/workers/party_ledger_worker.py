"""Celery task: daily party ledger overdue + interest maintenance."""

from __future__ import annotations

import logging

from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.modules.finance.party_ledger_hooks import daily_party_ledger_maintenance
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            try:
                result = await daily_party_ledger_maintenance(
                    db,
                    tenant_id,
                    feature_flags=flags,
                )
                await db.commit()
                results.append({"tenant_id": tenant_id, **result})
            except Exception:
                logger.exception("party_ledger daily failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="party_ledger.daily_maintenance")
def party_ledger_daily_maintenance() -> dict:
    """Run daily overdue mark + interest for all active tenants."""
    return run_async(_run_all_tenants())
