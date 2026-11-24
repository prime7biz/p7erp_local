"""Celery jobs: exit access shut-off + HR reminders (DRAFT suggestions only)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authority.policy import (
    assert_super_admin_protected,
    bump_auth_session_version,
    is_authority_classes_enabled_for_tenant,
)
from app.common.business_date import today_local
from app.common.celery_app import celery_app
from app.common.rls import bind_session_bypass, bind_session_tenant
from app.common.tenant_feature_keys import is_hr_reminders_v1_enabled
from app.database import AsyncSessionLocal, safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_class_request import HrClassRequest
from app.modules.auth.session_service import close_open_sessions
from app.workers.async_runner import run_async

logger = logging.getLogger(__name__)


async def _active_tenants(db: AsyncSession) -> list[Tenant]:
    return list(
        (
            await db.execute(
                select(Tenant).where(Tenant.is_active.is_(True), Tenant.deleted_at.is_(None)).order_by(Tenant.id)
            )
        ).scalars().all()
    )


async def exit_access_shutoff_all_tenants(db: AsyncSession) -> dict[str, Any]:
    """When inactive or exit_date < today: ess_enabled=false, deactivate linked non-Super user."""
    shut = 0
    alerts = 0
    errors = 0
    await bind_session_bypass(db)
    for tenant in await _active_tenants(db):
        if not is_authority_classes_enabled_for_tenant(tenant.feature_flags):
            continue
        try:
            await bind_session_tenant(db, tenant.id)
            await db.execute(text("SET LOCAL statement_timeout = '30000'"))
            today = today_local(tenant)
            rows = (
                await db.execute(
                    select(Employee).where(
                        Employee.tenant_id == tenant.id,
                        Employee.user_id.is_not(None),
                        (
                            (Employee.is_active.is_(False))
                            | ((Employee.exit_date.is_not(None)) & (Employee.exit_date < today))
                        ),
                    ).limit(500)
                )
            ).scalars().all()
            for emp in rows:
                if getattr(emp, "ess_enabled", None) is not False:
                    emp.ess_enabled = False
                linked = await db.get(User, emp.user_id) if emp.user_id else None
                if linked is None or linked.tenant_id != tenant.id:
                    continue
                if bool(getattr(linked, "is_tenant_super_admin", False)):
                    alerts += 1
                    logger.warning(
                        "hr.exit_access_shutoff skipped Super Admin user_id=%s employee_id=%s tenant=%s",
                        linked.id,
                        emp.id,
                        tenant.id,
                    )
                    continue
                assert_super_admin_protected(linked, action="deactivate via exit shut-off")
                if linked.is_active:
                    linked.is_active = False
                    bump_auth_session_version(linked)
                    await close_open_sessions(
                        db, tenant_id=tenant.id, user_id=linked.id, reason="exit_access_shutoff"
                    )
                    shut += 1
            await db.commit()
        except Exception:
            errors += 1
            logger.exception("hr.exit_access_shutoff failed tenant=%s", tenant.id)
            await safe_async_session_rollback(db)
    return {"shut": shut, "super_admin_alerts": alerts, "errors": errors}


async def reminders_daily_all_tenants(db: AsyncSession) -> dict[str, Any]:
    """Probation / contract_end / doc expiry → DRAFT CONFIRMATION suggestions only. Never auto-submits."""
    created = 0
    errors = 0
    await bind_session_bypass(db)
    for tenant in await _active_tenants(db):
        if not is_authority_classes_enabled_for_tenant(tenant.feature_flags):
            continue
        if not is_hr_reminders_v1_enabled(tenant.feature_flags):
            continue
        try:
            await bind_session_tenant(db, tenant.id)
            await db.execute(text("SET LOCAL statement_timeout = '30000'"))
            today = today_local(tenant)
            horizon = today + timedelta(days=30)
            # Contract end within 30 days; probation approximated from joining_date + probation_months
            candidates = (
                await db.execute(
                    select(Employee).where(
                        Employee.tenant_id == tenant.id,
                        Employee.is_active.is_(True),
                        Employee.contract_end_date.is_not(None),
                        Employee.contract_end_date >= today,
                        Employee.contract_end_date <= horizon,
                    ).limit(200)
                )
            ).scalars().all()
            for emp in candidates:
                open_exists = (
                    await db.execute(
                        select(HrClassRequest.id).where(
                            HrClassRequest.tenant_id == tenant.id,
                            HrClassRequest.employee_id == emp.id,
                            HrClassRequest.kind == "CONFIRMATION",
                            HrClassRequest.status.in_(("DRAFT", "SUBMITTED", "RECOMMENDED", "RETURNED", "APPLYING")),
                        ).limit(1)
                    )
                ).first()
                if open_exists:
                    continue
                now = datetime.utcnow()
                req = HrClassRequest(
                    tenant_id=tenant.id,
                    request_no=f"REM-{emp.id}-{today.isoformat()}",
                    request_id=f"remind-{emp.id}-{today.toordinal()}",
                    schema_version=1,
                    source="HR_ENTRY",
                    kind="CONFIRMATION",
                    status="DRAFT",
                    employee_id=emp.id,
                    payload={
                        "suggestion": True,
                        "contract_end_date": emp.contract_end_date.isoformat() if emp.contract_end_date else None,
                        "probation_months": emp.probation_months,
                    },
                    before={},
                    reason="System reminder: confirmation due (draft only — not submitted)",
                    revision=1,
                    entered_by=None,
                    entered_at=now,
                    created_at=now,
                    updated_at=now,
                )
                db.add(req)
                created += 1
            await db.commit()
        except Exception:
            errors += 1
            logger.exception("hr.reminders_daily failed tenant=%s", tenant.id)
            await safe_async_session_rollback(db)
    return {"drafts_created": created, "errors": errors}


@celery_app.task(name="hr.exit_access_shutoff")
def exit_access_shutoff_task() -> dict[str, Any]:
    async def _run():
        async with AsyncSessionLocal() as db:
            return await exit_access_shutoff_all_tenants(db)

    return run_async(_run())


@celery_app.task(name="hr.reminders_daily")
def reminders_daily_task() -> dict[str, Any]:
    async def _run():
        async with AsyncSessionLocal() as db:
            return await reminders_daily_all_tenants(db)

    return run_async(_run())
