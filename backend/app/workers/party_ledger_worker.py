"""Celery task: daily party ledger overdue + interest maintenance."""

from __future__ import annotations

import logging

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.database import AsyncSessionLocal
from app.models.tenant import Tenant
from app.modules.finance.party_ledger_hooks import daily_party_ledger_maintenance

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    async with AsyncSessionLocal() as db:
        tenants = (
            await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))
        ).scalars().all()
        for tenant in tenants:
            try:
                result = await daily_party_ledger_maintenance(
                    db,
                    tenant.id,
                    feature_flags=tenant.feature_flags,
                )
                await db.commit()
                results.append({"tenant_id": tenant.id, **result})
            except Exception:
                logger.exception("party_ledger daily failed tenant=%s", tenant.id)
                await db.rollback()
                results.append({"tenant_id": tenant.id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="party_ledger.daily_maintenance")
def party_ledger_daily_maintenance() -> dict:
    """Run daily overdue mark + interest for all active tenants."""
    return run_async(_run_all_tenants())
