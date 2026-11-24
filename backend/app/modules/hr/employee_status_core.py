"""No-commit employee activate / deactivate helpers (manpower quota on activate)."""

from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant, User
from app.models.hr import Employee
from app.modules.hr import employee_service


async def activate_employee_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    employee_id: int,
) -> Employee:
    row = await employee_service.get_employee_or_404(db, tenant.id, employee_id)
    if row.is_active:
        return row
    from app.modules.hr_manpower.quota_guard import consume_exception_slot, guard_and_prepare

    exception_id = await guard_and_prepare(
        db,
        tenant,
        department_id=row.department_id,
        designation_id=row.designation_id,
        exclude_employee_id=row.id,
    )
    row.is_active = True
    if exception_id is not None:
        await consume_exception_slot(
            db,
            tenant_id=tenant.id,
            exception_id=exception_id,
            employee_id=row.id,
            user_id=actor.id,
        )
    return row


async def deactivate_employee_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    employee_id: int,
) -> Employee:
    row = await employee_service.get_employee_or_404(db, tenant.id, employee_id)
    row.is_active = False
    return row


async def set_employee_active_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    employee_id: int,
    is_active: bool,
) -> Employee:
    if is_active:
        return await activate_employee_core(db, tenant=tenant, actor=actor, employee_id=employee_id)
    return await deactivate_employee_core(db, tenant=tenant, employee_id=employee_id)
