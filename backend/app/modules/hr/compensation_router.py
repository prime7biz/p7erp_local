"""Employee salary set-up for the employee workspace Salary tab. All routes need hr.payroll.manage.

GET  /hr/compensation/options                   salary structures + Bangladesh wage grades in force
POST /hr/compensation/preview                   prospective basic / gross against the grade (no write)
GET  /hr/employees/{id}/compensation            current pay snapshot + assignment history
PUT  /hr/employees/{id}/compensation            open a new effective-dated salary (and grade) window
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.orm_numeric import decimal_to_money_response
from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_bd import HrBdEmployeeWageAssignment, HrBdWageScheduleRate
from app.models.hr_payroll import PayrollEmployeeStructureAssignment, PayrollStructure
from app.modules.audit.service import log_action
from app.modules.hr.employee_service import get_employee_or_404
from app.modules.hr.schemas import EmployeeCompensationReplace, EmployeePaySnapshot
from app.modules.hr_localization.employee_pay import pay_snapshot
from app.modules.hr_localization.rules_service import effective_rates, effective_rules
from app.modules.hr_payroll import compensation_service as comp

router = APIRouter(prefix="/hr", tags=["hr-compensation"])

HISTORY_CAP = 50


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_payroll(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)


def _money(value: Decimal | None) -> str | None:
    return decimal_to_money_response(value) if value is not None else None


async def employee_pay_snapshot(
    db: AsyncSession, tenant: Tenant, employee: Employee, as_of: date | None = None
) -> EmployeePaySnapshot:
    """Read-only pay view. Callers must already have checked hr.payroll.manage."""
    as_of = as_of or today_local(tenant)
    eff = await effective_rules(db, tenant.id, as_of)
    rates = {r.rate_code: r for r in await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, as_of)}
    snap = await pay_snapshot(db, tenant.id, employee, as_of, rates)
    structure_row = await db.get(PayrollEmployeeStructureAssignment, snap.assignment_id) if snap.assignment_id else None
    wage_row, _ = await comp.wage_rate_in_force(db, tenant.id, employee.id, as_of)
    rate = snap.wage_rate
    return EmployeePaySnapshot(
        as_of=as_of,
        basic=_money(snap.basic) or "0.0000",
        gross=_money(snap.gross) or "0.0000",
        structure_id=structure_row.structure_id if structure_row else None,
        structure_code=snap.structure_code,
        structure_assignment_id=snap.assignment_id,
        structure_effective_from=structure_row.effective_from if structure_row else None,
        structure_effective_to=structure_row.effective_to if structure_row else None,
        wage_rate_id=rate.id if rate else None,
        wage_rate_code=rate.rate_code if rate else None,
        wage_grade_basic=_money(rate.basic) if rate else None,
        wage_grade_gross=_money(rate.gross) if rate else None,
        wage_assignment_id=wage_row.id if wage_row and snap.wage_rate_source == "wage_assignment" else None,
        wage_effective_from=wage_row.effective_from if wage_row and snap.wage_rate_source == "wage_assignment" else None,
    )


class CompensationPreviewBody(BaseModel):
    structure_id: int
    bd_wage_rate_id: int | None = None
    base_salary: str | None = Field(None, max_length=32)
    effective_from: date | None = None


@router.get("/compensation/options")
async def compensation_options(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    as_of = today_local(tenant)
    structures = (
        await db.execute(
            select(PayrollStructure)
            .where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.is_active.is_(True))
            .order_by(PayrollStructure.name)
            .limit(500)
        )
    ).scalars().all()
    eff = await effective_rules(db, tenant.id, as_of)
    rates = await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, as_of)
    return {
        "as_of": as_of.isoformat(),
        "structures": [{"id": s.id, "code": s.code, "name": s.name} for s in structures],
        "wage_grades": [
            {
                "id": r.id,
                "rate_code": r.rate_code,
                "grade_code": r.grade_code,
                "schedule_class": r.schedule_class,
                "employment_stage": r.employment_stage,
                "basic": _money(r.basic),
                "gross": _money(r.gross),
            }
            for r in rates
        ],
    }


@router.post("/compensation/preview")
async def compensation_preview(
    body: CompensationPreviewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    as_of = body.effective_from or today_local(tenant)
    rate = await comp.approved_wage_rate(db, tenant.id, body.bd_wage_rate_id, as_of) if body.bd_wage_rate_id else None
    out = {
        "minimum_basic": _money(rate.basic) if rate else None,
        "minimum_gross": _money(rate.gross) if rate else None,
        "basic": None,
        "gross": None,
        "meets_minimum": True,
        "message": None,
    }
    amount = comp.parse_money(body.base_salary)
    try:
        basic, gross = await comp.preview_compensation(
            db, tenant_id=tenant.id, structure_id=body.structure_id, rate=rate, base_salary=amount
        )
        out.update(basic=_money(basic), gross=_money(gross))
    except HTTPException as exc:
        if exc.status_code != 400:
            raise
        out.update(meets_minimum=False, message=exc.detail)
        if amount is not None:
            structure_gross_value = await comp.structure_gross(db, tenant.id, body.structure_id, amount)
            out.update(basic=_money(amount), gross=_money(structure_gross_value))
    return out


async def _compensation_view(db: AsyncSession, tenant: Tenant, employee: Employee) -> dict:
    structures = (
        await db.execute(
            select(PayrollEmployeeStructureAssignment, PayrollStructure.code)
            .join(PayrollStructure, PayrollStructure.id == PayrollEmployeeStructureAssignment.structure_id)
            .where(
                PayrollEmployeeStructureAssignment.tenant_id == tenant.id,
                PayrollEmployeeStructureAssignment.employee_id == employee.id,
            )
            .order_by(PayrollEmployeeStructureAssignment.effective_from.desc())
            .limit(HISTORY_CAP)
        )
    ).all()
    wages = (
        await db.execute(
            select(HrBdEmployeeWageAssignment, HrBdWageScheduleRate.rate_code)
            .join(HrBdWageScheduleRate, HrBdWageScheduleRate.id == HrBdEmployeeWageAssignment.wage_rate_id)
            .where(
                HrBdEmployeeWageAssignment.tenant_id == tenant.id,
                HrBdEmployeeWageAssignment.employee_id == employee.id,
            )
            .order_by(HrBdEmployeeWageAssignment.effective_from.desc())
            .limit(HISTORY_CAP)
        )
    ).all()
    snapshot = await employee_pay_snapshot(db, tenant, employee)
    return {
        "employee_id": employee.id,
        "snapshot": snapshot.model_dump(mode="json"),
        "structure_assignments": [
            {
                "id": a.id,
                "structure_id": a.structure_id,
                "structure_code": code,
                "base_salary": _money(a.base_salary),
                "effective_from": a.effective_from.isoformat(),
                "effective_to": a.effective_to.isoformat() if a.effective_to else None,
            }
            for a, code in structures
        ],
        "wage_assignments": [
            {
                "id": w.id,
                "wage_rate_id": w.wage_rate_id,
                "rate_code": code,
                "effective_from": w.effective_from.isoformat(),
                "effective_to": w.effective_to.isoformat() if w.effective_to else None,
            }
            for w, code in wages
        ],
    }


@router.get("/employees/{employee_id}/compensation")
async def get_employee_compensation(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    employee = await get_employee_or_404(db, tenant.id, employee_id)
    return await _compensation_view(db, tenant, employee)


@router.put("/employees/{employee_id}/compensation")
async def replace_employee_compensation(
    employee_id: int,
    body: EmployeeCompensationReplace,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    tenant_id, user_id = tenant.id, user.id
    try:
        result = await comp.replace_employee_compensation(
            db,
            tenant=tenant,
            employee_id=employee_id,
            structure_id=body.structure_id,
            bd_wage_rate_id=body.bd_wage_rate_id,
            base_salary=body.base_salary,
            effective_from=body.effective_from,
            actor_id=user_id,
        )
        await log_action(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="HR_EMPLOYEE_COMPENSATION_REPLACED",
            resource=f"hr.employee:{employee_id}",
            details=comp.audit_details(result, body.effective_from),
        )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=409, detail="Salary assignment changed at the same time; reload and try again")
    employee = await get_employee_or_404(db, tenant_id, employee_id)
    return await _compensation_view(db, tenant, employee)
