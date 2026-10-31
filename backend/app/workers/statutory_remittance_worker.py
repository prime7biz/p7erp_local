"""Celery: monthly statutory remittance alerts (PF/ESI/PT)."""

from __future__ import annotations

import asyncio
import logging
from datetime import date

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.common.tenant_feature_keys import is_statutory_payroll_enabled
from app.database import AsyncSessionLocal
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    today = date.today()
    async with AsyncSessionLocal() as db:
        tenants = list((await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all())
        for tenant in tenants:
            try:
                if not is_statutory_payroll_enabled(tenant.feature_flags):
                    results.append({"tenant_id": tenant.id, "skipped": True})
                    continue
                # Soft alert: due by 15th of following month for prior month remittance
                due_soon = today.day >= 10 and today.day <= 15
                payload = {
                    "tenant_id": tenant.id,
                    "as_of": today.isoformat(),
                    "remittance_window": due_soon,
                    "alerts": [],
                    "challans": {
                        "pf_ecr": f"PF-ECR-{today.year}{today.month:02d}",
                        "esi_challan": f"ESI-{today.year}{today.month:02d}",
                        "pt_slip": f"PT-{today.year}{today.month:02d}",
                    },
                }
                if due_soon:
                    payload["alerts"].append(
                        {
                            "code": "STATUTORY_REMITTANCE_DUE",
                            "message": "PF/ESI/PT remittance due this month — confirm deposit",
                            "severity": "high",
                        }
                    )
                    logger.info(
                        "statutory_remittance_due tenant=%s month=%s",
                        tenant.id,
                        f"{today.year}-{today.month:02d}",
                    )
                results.append(payload)
            except Exception:
                logger.exception("monthly statutory remittance failed tenant=%s", tenant.id)
                await db.rollback()
                results.append({"tenant_id": tenant.id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="hr.monthly_statutory_remittance")
def monthly_statutory_remittance() -> dict:
    return asyncio.run(_run_all_tenants())
