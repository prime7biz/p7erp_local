"""Celery: medical certificate expiry alerts (Sprint H1)."""

from __future__ import annotations

import logging
from datetime import date

from sqlalchemy import select

from app.common.celery_app import celery_app
from app.workers.async_runner import run_async
from app.common.tenant_feature_keys import is_medical_certificate_tracking_enabled
from app.database import AsyncSessionLocal
from app.models.hr_compliance_framework import EmployeeMedicalRecord
from app.models.tenant import Tenant

logger = logging.getLogger(__name__)

ALERT_WINDOWS = (30, 15, 7)


async def _run_all_tenants() -> dict:
    results: list[dict] = []
    today = date.today()
    async with AsyncSessionLocal() as db:
        tenants = list((await db.execute(select(Tenant).where(Tenant.is_active.is_(True)))).scalars().all())
        for tenant in tenants:
            try:
                if not is_medical_certificate_tracking_enabled(tenant.feature_flags):
                    results.append({"tenant_id": tenant.id, "skipped": True})
                    continue
                alerts: list[dict] = []
                rows = list(
                    (
                        await db.execute(
                            select(EmployeeMedicalRecord).where(
                                EmployeeMedicalRecord.tenant_id == tenant.id,
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
                        tenant.id,
                        len(alerts),
                    )
                results.append({"tenant_id": tenant.id, "alerts": alerts})
            except Exception:
                logger.exception("medical certificate expiry failed tenant=%s", tenant.id)
                await db.rollback()
                results.append({"tenant_id": tenant.id, "error": True})
    return {"tenants": len(results), "results": results}


@celery_app.task(name="hr.medical_certificate_expiry")
def medical_certificate_expiry() -> dict:
    return run_async(_run_all_tenants())
