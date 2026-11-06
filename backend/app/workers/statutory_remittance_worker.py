"""Celery: monthly statutory remittance alerts (PF/ESI/PT)."""

from __future__ import annotations

import logging
from datetime import date

from app.common.business_date import today_local
from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_statutory_payroll_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.workers.tenant_rows import active_tenant_rows
from app.common.rls import bind_session_tenant

logger = logging.getLogger(__name__)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    today = today_local()
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            try:
                await bind_session_tenant(db, tenant_id)
                if not is_statutory_payroll_enabled(flags):
                    results.append({"tenant_id": tenant_id, "skipped": True})
                    continue
                # Soft alert: due by 15th of following month for prior month remittance
                due_soon = today.day >= 10 and today.day <= 15
                payload = {
                    "tenant_id": tenant_id,
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
                        tenant_id,
                        f"{today.year}-{today.month:02d}",
                    )
                results.append(payload)
            except Exception:
                logger.exception("monthly statutory remittance failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="hr.monthly_statutory_remittance")
def monthly_statutory_remittance() -> dict:
    return run_async(_run_all_tenants())
