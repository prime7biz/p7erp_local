"""Phase C enforcement helpers. Each check is a no-op while its strict tenant flag is OFF."""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.models.hr import Employee
from app.models.hr_bd import HrBdEmployeeWageAssignment, HrBdWageScheduleRate
from app.modules.hr_localization.employee_pay import pay_snapshot
from app.modules.hr_localization.enforcement_flags import (
    HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED,
    is_enforced,
)
from app.modules.hr_localization.rules_service import effective_rates, effective_rules


def require_flag(tenant: Tenant, flag: str, label: str) -> None:
    if not is_enforced(tenant.feature_flags, flag):
        raise HTTPException(
            status_code=409,
            detail=f"{label} is not switched on. Approve a rule set and enable it in HR > Bangladesh Rules first.",
        )


async def assert_minimum_wage_for_payroll(
    db: AsyncSession, *, tenant: Tenant, as_of: date, employee_ids: list[int]
) -> None:
    """Block a payroll apply when any graded employee's basic or gross is below the Gazette minimum."""
    if not employee_ids or not is_enforced(tenant.feature_flags, HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED):
        return
    eff = await effective_rules(db, tenant.id, as_of)
    rates = {r.rate_code: r for r in await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, as_of)}
    employees = (
        await db.execute(select(Employee).where(Employee.tenant_id == tenant.id, Employee.id.in_(employee_ids)))
    ).scalars().all()
    below: list[str] = []
    for emp in employees:
        snap = await pay_snapshot(db, tenant.id, emp, as_of, rates)
        if snap.wage_rate is None:
            continue
        if snap.basic < snap.wage_rate.basic or snap.gross < snap.wage_rate.gross:
            below.append(f"{emp.employee_code} (basic {snap.basic} < {snap.wage_rate.basic} or gross {snap.gross} < {snap.wage_rate.gross})")
    if below:
        raise HTTPException(
            status_code=409,
            detail="Below the Bangladesh minimum wage for their grade: " + "; ".join(below[:20]),
        )


async def assert_base_salary_meets_grade(
    db: AsyncSession, *, tenant: Tenant, employee_id: int, base_salary: Decimal | None, as_of: date
) -> None:
    """Payroll assignment hook: refuse a basic below the employee's assigned grade when enforcement is ON."""
    if base_salary is None or not is_enforced(tenant.feature_flags, HR_BD_MINIMUM_WAGE_ENFORCEMENT_ENABLED):
        return
    wa = (
        await db.execute(
            select(HrBdEmployeeWageAssignment).where(
                HrBdEmployeeWageAssignment.tenant_id == tenant.id,
                HrBdEmployeeWageAssignment.employee_id == employee_id,
                HrBdEmployeeWageAssignment.effective_from <= as_of,
                or_(HrBdEmployeeWageAssignment.effective_to.is_(None), HrBdEmployeeWageAssignment.effective_to >= as_of),
            )
        )
    ).scalar_one_or_none()
    if wa is None:
        return
    rate = await db.get(HrBdWageScheduleRate, wa.wage_rate_id)
    if rate is not None and rate.tenant_id == tenant.id and Decimal(base_salary) < rate.basic:
        raise HTTPException(
            status_code=400,
            detail=f"Basic {base_salary} is below the {rate.rate_code} minimum basic {rate.basic} (Bangladesh minimum wage)",
        )
