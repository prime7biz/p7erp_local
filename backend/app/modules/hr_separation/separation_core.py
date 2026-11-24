"""No-commit separation create / approve / cancel helpers.

Shared by ``/hr/separations`` routes and HR class-request apply.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_lifecycle import HrClearanceItem, HrFinalSettlement, HrSeparation
from app.modules.audit.service import log_action
from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_separation.settlement_service import link_settlement_extras

SEPARATION_TYPES = tuple(t for t in calc.SEPARATION_TYPES if t != "DEEMED_RESIGNATION")


async def lock_row(db: AsyncSession, model, tenant_id: int, row_id: int, label: str):
    row = (
        await db.execute(
            select(model)
            .where(model.id == row_id, model.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


async def create_separation_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    employee_id: int,
    separation_type: str,
    request_date,
    last_working_date,
    effective_date,
    notice_days_served: int = 0,
    permanent: bool = True,
    monthly_rated: bool = True,
    misconduct_no_compensation: bool = False,
    death_at_work: bool = False,
    reason: str | None = None,
) -> HrSeparation:
    if separation_type not in SEPARATION_TYPES:
        raise HTTPException(
            status_code=400,
            detail=(
                "Deemed resignation is recorded only through an absence case (s.27(3A)); "
                f"otherwise use one of {', '.join(SEPARATION_TYPES)}"
            ),
        )
    if effective_date < last_working_date:
        raise HTTPException(status_code=400, detail="The effective date must be on or after the last working day")
    emp = (
        await db.execute(
            select(Employee)
            .where(Employee.id == employee_id, Employee.tenant_id == tenant.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    if emp.joining_date and last_working_date < emp.joining_date:
        raise HTTPException(status_code=400, detail="Last working day is before the joining date")
    open_sep = (
        await db.execute(
            select(HrSeparation.id).where(
                HrSeparation.tenant_id == tenant.id,
                HrSeparation.employee_id == emp.id,
                HrSeparation.status.in_(("DRAFT", "APPROVED")),
            )
        )
    ).first()
    if open_sep:
        raise HTTPException(status_code=409, detail=f"Employee already has an open separation #{open_sep[0]}")
    required = calc.notice_days(separation_type, permanent=permanent, monthly_rated=monthly_rated)
    sep = HrSeparation(
        tenant_id=tenant.id,
        employee_id=emp.id,
        separation_type=separation_type,
        request_date=request_date,
        last_working_date=last_working_date,
        effective_date=effective_date,
        notice_days_required=required,
        notice_days_served=notice_days_served,
        permanent=permanent,
        monthly_rated=monthly_rated,
        misconduct_no_compensation=misconduct_no_compensation,
        death_at_work=death_at_work,
        reason=(reason or "").strip() or None,
        status="DRAFT",
        created_by=actor.id,
    )
    db.add(sep)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=actor.id,
        action="HR_SEPARATION_CREATED",
        resource=f"hr.separation:{sep.id}",
        details=separation_type,
    )
    return sep


async def approve_separation_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    sep: HrSeparation,
) -> HrSeparation:
    if sep.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Separation is {sep.status}")
    emp = await lock_row(db, Employee, tenant.id, sep.employee_id, "Employee")
    sep.status = "APPROVED"
    sep.approved_by = actor.id
    sep.approved_at = datetime.utcnow()
    emp.exit_date = sep.effective_date
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=actor.id,
        action="HR_SEPARATION_APPROVED",
        resource=f"hr.separation:{sep.id}",
        details=f"exit {sep.effective_date}",
    )
    return sep


async def cancel_separation_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    sep: HrSeparation,
) -> HrSeparation:
    fs = (
        await db.execute(
            select(HrFinalSettlement).where(
                HrFinalSettlement.tenant_id == tenant.id,
                HrFinalSettlement.separation_id == sep.id,
            )
        )
    ).scalar_one_or_none()
    if sep.status in ("SETTLED", "CANCELLED") or (fs is not None and fs.status != "DRAFT"):
        raise HTTPException(
            status_code=409,
            detail="A separation with an approved or posted settlement cannot be cancelled",
        )
    if fs is not None:
        await link_settlement_extras(db, tenant.id, fs.id, {})
        await db.delete(fs)
    if sep.status == "APPROVED":
        emp = await lock_row(db, Employee, tenant.id, sep.employee_id, "Employee")
        if emp.exit_date == sep.effective_date:
            emp.exit_date = None
    sep.status = "CANCELLED"
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=actor.id,
        action="HR_SEPARATION_CANCELLED",
        resource=f"hr.separation:{sep.id}",
    )
    return sep


async def seed_standard_clearance(
    db: AsyncSession,
    *,
    tenant_id: int,
    separation_id: int,
) -> list[HrClearanceItem]:
    """Seed a standard asset checklist if the separation has none yet."""
    existing = (
        await db.execute(
            select(HrClearanceItem.id).where(
                HrClearanceItem.tenant_id == tenant_id,
                HrClearanceItem.separation_id == separation_id,
            ).limit(1)
        )
    ).first()
    if existing:
        return []
    items = [
        ("IT", "Laptop / desktop returned"),
        ("IT", "Access cards / email disabled"),
        ("Admin", "ID card returned"),
        ("Admin", "Locker / cupboard keys"),
        ("Accounts", "Advance / loan clearance"),
        ("Store", "Uniform / PPE returned"),
        ("HR", "Exit interview completed"),
    ]
    rows: list[HrClearanceItem] = []
    for dept, item in items:
        row = HrClearanceItem(
            tenant_id=tenant_id,
            separation_id=separation_id,
            department=dept,
            item=item,
            status="PENDING",
            amount_recoverable=Decimal("0"),
        )
        db.add(row)
        rows.append(row)
    await db.flush()
    return rows
