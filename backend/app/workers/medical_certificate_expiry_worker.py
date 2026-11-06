"""Celery: medical certificate expiry alerts (Sprint H1)."""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import select

from app.common.business_date import today_local
from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_medical_certificate_tracking_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.models.hr_compliance_framework import EmployeeMedicalRecord
from app.workers.tenant_rows import active_tenant_rows

logger = logging.getLogger(__name__)

ALERT_WINDOWS = (30, 15, 7)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    today = today_local()
    async with AsyncSessionLocal() as db:
        tenant_rows = await active_tenant_rows(db)
        for tenant_id, flags in tenant_rows:
            try:
                if not is_medical_certificate_tracking_enabled(flags):
                    results.append({"tenant_id": tenant_id, "skipped": True})
                    continue
                alerts: list[dict] = []
                rows = list(
                    (
                        await db.execute(
                            select(EmployeeMedicalRecord).where(
                                EmployeeMedicalRecord.tenant_id == tenant_id,
                                EmployeeMedicalRecord.expiry_date.is_not(None),
                            )
                        )
                    )
                    .scalars()
                    .all()
                )
                for row in rows:
                    if row.expiry_date is None:
                        continue
                    days_left = (row.expiry_date - today).days
                    if days_left < 0:
                        alerts.append(
                            {
                                "employee_id": row.employee_id,
                                "record_id": row.id,
                                "code": "MEDICAL_EXPIRED",
                                "days_left": days_left,
                                "severity": "high",
                            }
                        )
                        continue
                    if days_left in ALERT_WINDOWS or (days_left <= 30 and not row.reminder_sent):
                        alerts.append(
                            {
                                "employee_id": row.employee_id,
                                "record_id": row.id,
                                "code": "MEDICAL_EXPIRING",
                                "days_left": days_left,
                                "severity": "medium" if days_left > 7 else "high",
                            }
                        )
                        if days_left <= 30:
                            row.reminder_sent = True
                if alerts:
                    await db.commit()
                    logger.info(
                        "medical_certificate_expiry tenant=%s alerts=%s",
                        tenant_id,
                        len(alerts),
                    )
                results.append({"tenant_id": tenant_id, "alerts": alerts})
            except Exception:
                logger.exception("medical certificate expiry failed tenant=%s", tenant_id)
                await safe_async_session_rollback(db)
                results.append({"tenant_id": tenant_id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="hr.medical_certificate_expiry")
def medical_certificate_expiry() -> dict:
    return run_async(_run_all_tenants())
