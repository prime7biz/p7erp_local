"""Phase C Bangladesh workflows. Mutations need their strict flag ON (409 otherwise).

Wage assignments   GET/POST /wage-assignments, POST /wage-assignments/{id}/end         hr.payroll.manage
Maternity          GET/POST /maternity-cases, PATCH /maternity-cases/{id},
                   POST /maternity-cases/{id}/approve|mark-paid|cancel                  manage: hr.leave.types.manage;
                                                                                         approve / pay: manager/admin
Earned leave       POST /leave-accrual/preview, POST /leave-accrual/apply               hr.leave.types.manage
Festival work      GET /festival-work, POST /festival-work/generate,
                   POST /festival-work/{id}/approve|cancel                              hr.attendance.manage; approve: manager/admin
Service benefits   GET/POST /service-benefits, POST /service-benefits/{id}/approve      hr.payroll.manage; approve: manager/admin
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import (
    PERMISSION_HR_ATTENDANCE_MANAGE,
    PERMISSION_HR_LEAVE_TYPES_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    assert_hr_manager_or_permission,
)
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, AttendanceHoliday
from app.models.hr_bd import (
    HrBdEmployeeWageAssignment,
    HrBdFestivalWorkEntry,
    HrBdLeaveAccrualEntry,
    HrBdMaternityCase,
    HrBdServiceBenefitCase,
    HrBdWageScheduleRate,
)
from app.models.hr_leave import LeaveBalance, LeaveType
from app.modules.audit.service import log_action
from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_localization.employee_pay import employee_or_404, pay_snapshot
from app.modules.hr_localization.enforcement_flags import (
    HR_BD_FESTIVAL_COMPENSATION_ENABLED,
    HR_BD_LEAVE_ACCRUAL_ENFORCEMENT_ENABLED,
    HR_BD_MATERNITY_ENFORCEMENT_ENABLED,
    HR_BD_SERVICE_BENEFITS_ENABLED,
)
from app.modules.hr_localization.enforcement_service import require_flag
from app.modules.hr_localization.rules_router import (
    continuous_year_completed,
    count_worked_days,
    require_manager_admin,
)
from app.modules.hr_localization.rules_service import effective_rates, effective_rules, lock_tenant
from app.modules.hr_payroll import compensation_service as comp

router = APIRouter(prefix="/hr/localization/bd-rmg", tags=["hr-localization"])

LIST_CAP = 500
FEMALE = {"female", "f", "woman"}


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _perm(db: AsyncSession, user: User, tenant_id: int, key: str) -> None:
    await assert_hr_manager_or_permission(db, user, tenant_id, permission_key=key)


def _iso(v: Any) -> Any:
    if isinstance(v, (date, datetime)):
        return v.isoformat()
    if isinstance(v, Decimal):
        return str(v)
    return v


def _row(obj, fields: tuple[str, ...]) -> dict[str, Any]:
    return {f: _iso(getattr(obj, f)) for f in fields}


async def _lock_employee(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    emp = (
        await db.execute(
            select(Employee)
            .where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


async def _locked(db: AsyncSession, model, tenant_id: int, row_id: int, label: str):
    row = (
        await db.execute(
            select(model).where(model.id == row_id, model.tenant_id == tenant_id).with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail=f"{label} not found")
    return row


async def _audit(db, tenant_id, user_id, action, resource, details=None):
    await log_action(db, tenant_id=tenant_id, user_id=user_id, action=action, resource=resource, details=details)


async def _commit_or_conflict(db: AsyncSession, message: str) -> None:
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=409, detail=message)


# --- Wage grade assignments -----------------------------------------------------------------------

WA_FIELDS = ("id", "employee_id", "wage_rate_id", "effective_from", "effective_to", "created_by", "ended_by", "ended_at")


class WageAssignmentCreate(BaseModel):
    employee_id: int
    wage_rate_id: int
    effective_from: date


class WageAssignmentEnd(BaseModel):
    effective_to: date


@router.get("/wage-assignments")
async def list_wage_assignments(
    employee_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_PAYROLL_MANAGE)
    stmt = select(HrBdEmployeeWageAssignment, HrBdWageScheduleRate.rate_code).join(
        HrBdWageScheduleRate, HrBdWageScheduleRate.id == HrBdEmployeeWageAssignment.wage_rate_id
    ).where(HrBdEmployeeWageAssignment.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(HrBdEmployeeWageAssignment.employee_id == employee_id)
    rows = (await db.execute(stmt.order_by(HrBdEmployeeWageAssignment.effective_from.desc()).limit(LIST_CAP))).all()
    return [{**_row(a, WA_FIELDS), "rate_code": code} for a, code in rows]


@router.post("/wage-assignments", status_code=status.HTTP_201_CREATED)
async def create_wage_assignment(
    body: WageAssignmentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await _perm(db, user, tenant_id, PERMISSION_HR_PAYROLL_MANAGE)
    await comp.lock_employee(db, tenant_id, body.employee_id)
    rate = await comp.approved_wage_rate(db, tenant_id, body.wage_rate_id, body.effective_from)
    row = await comp.insert_wage_assignment(
        db, tenant_id=tenant_id, employee_id=body.employee_id, rate=rate,
        effective_from=body.effective_from, created_by=user_id,
    )
    await _audit(db, tenant_id, user_id, "HR_BD_WAGE_GRADE_ASSIGNED", f"hr.employee:{body.employee_id}", f"{rate.rate_code} from {body.effective_from}")
    await _commit_or_conflict(db, "Employee already has a wage grade starting on that date")
    await db.refresh(row)
    return {**_row(row, WA_FIELDS), "rate_code": rate.rate_code}


@router.post("/wage-assignments/{assignment_id}/end")
async def end_wage_assignment(
    assignment_id: int,
    body: WageAssignmentEnd,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_PAYROLL_MANAGE)
    row = await comp.close_wage_assignment(
        db, tenant_id=tenant.id, assignment_id=assignment_id, effective_to=body.effective_to, ended_by=user.id
    )
    await _audit(db, tenant.id, user.id, "HR_BD_WAGE_GRADE_ENDED", f"hr.employee:{row.employee_id}", str(body.effective_to))
    await db.commit()
    await db.refresh(row)
    return _row(row, WA_FIELDS)


# --- Maternity ------------------------------------------------------------------------------------

MAT_FIELDS = (
    "id", "employee_id", "rule_set_id", "expected_delivery_date", "actual_delivery_date", "leave_start", "leave_end",
    "service_start", "surviving_children", "eligible", "eligibility_reason", "monthly_gross", "daily_rate",
    "benefit_amount", "calculation_trace", "status", "approved_by", "approved_at", "paid_at", "payment_reference",
    "created_at",
)


class MaternityCreate(BaseModel):
    employee_id: int
    expected_delivery_date: date
    surviving_children: int = Field(..., ge=0, le=20)
    actual_delivery_date: date | None = None


class MaternityUpdate(BaseModel):
    actual_delivery_date: date | None = None
    surviving_children: int | None = Field(default=None, ge=0, le=20)


class MarkPaid(BaseModel):
    payment_reference: str = Field(..., min_length=1, max_length=64)


async def _compute_maternity(db: AsyncSession, tenant: Tenant, emp: Employee, case: HrBdMaternityCase) -> None:
    eff = await effective_rules(db, tenant.id, case.expected_delivery_date)
    rates = {r.rate_code: r for r in await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, case.expected_delivery_date)}
    snap = await pay_snapshot(db, tenant.id, emp, min(case.expected_delivery_date, today_local(tenant)), rates)
    res = calc.maternity(
        service_start=emp.joining_date,
        expected_delivery=case.expected_delivery_date,
        actual_delivery=case.actual_delivery_date,
        surviving_children=case.surviving_children,
        monthly_gross=snap.gross,
        rules=eff.rules,
    )
    case.rule_set_id = eff.rule_set.id if eff.rule_set else None
    case.leave_start, case.leave_end = res.trace["leave_start"], res.trace["leave_end"]
    case.service_start = emp.joining_date
    case.eligible = res.eligible
    case.eligibility_reason = "; ".join(res.warnings) or None
    case.monthly_gross, case.daily_rate, case.benefit_amount = snap.gross, res.trace["daily_rate"], res.amount
    case.calculation_trace = {**res.as_dict(), "source": eff.source}
    case.status = "ELIGIBLE" if res.eligible else "INELIGIBLE"


@router.get("/maternity-cases")
async def list_maternity_cases(
    employee_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_LEAVE_TYPES_MANAGE)
    stmt = select(HrBdMaternityCase).where(HrBdMaternityCase.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(HrBdMaternityCase.employee_id == employee_id)
    rows = (await db.execute(stmt.order_by(HrBdMaternityCase.id.desc()).limit(LIST_CAP))).scalars().all()
    return [_row(r, MAT_FIELDS) for r in rows]


@router.post("/maternity-cases", status_code=status.HTTP_201_CREATED)
async def create_maternity_case(
    body: MaternityCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await _perm(db, user, tenant_id, PERMISSION_HR_LEAVE_TYPES_MANAGE)
    require_flag(tenant, HR_BD_MATERNITY_ENFORCEMENT_ENABLED, "Maternity enforcement")
    emp = await _lock_employee(db, tenant_id, body.employee_id)
    if emp.joining_date is None:
        raise HTTPException(status_code=400, detail="Employee has no joining date")
    if emp.gender and emp.gender.strip().lower() not in FEMALE:
        raise HTTPException(status_code=400, detail="Maternity benefit applies to women workers (s.46)")
    if body.actual_delivery_date and body.actual_delivery_date < emp.joining_date:
        raise HTTPException(status_code=400, detail="Delivery date is before the joining date")
    open_case = (
        await db.execute(
            select(HrBdMaternityCase.id).where(
                HrBdMaternityCase.tenant_id == tenant_id,
                HrBdMaternityCase.employee_id == emp.id,
                HrBdMaternityCase.status.in_(("DRAFT", "ELIGIBLE", "INELIGIBLE", "APPROVED")),
            )
        )
    ).first()
    if open_case:
        raise HTTPException(status_code=409, detail=f"Employee already has an open maternity case #{open_case[0]}")
    case = HrBdMaternityCase(
        tenant_id=tenant_id, employee_id=emp.id, expected_delivery_date=body.expected_delivery_date,
        actual_delivery_date=body.actual_delivery_date, surviving_children=body.surviving_children,
        created_by=user_id, status="DRAFT",
    )
    await _compute_maternity(db, tenant, emp, case)
    db.add(case)
    await db.flush()
    await _audit(db, tenant_id, user_id, "HR_BD_MATERNITY_CASE_CREATED", f"hr.bd.maternity:{case.id}", case.status)
    await _commit_or_conflict(db, "Employee already has an open maternity case")
    await db.refresh(case)
    return _row(case, MAT_FIELDS)


@router.patch("/maternity-cases/{case_id}")
async def update_maternity_case(
    case_id: int,
    body: MaternityUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_LEAVE_TYPES_MANAGE)
    require_flag(tenant, HR_BD_MATERNITY_ENFORCEMENT_ENABLED, "Maternity enforcement")
    case = await _locked(db, HrBdMaternityCase, tenant.id, case_id, "Maternity case")
    if case.status not in ("DRAFT", "ELIGIBLE", "INELIGIBLE", "APPROVED"):
        raise HTTPException(status_code=409, detail=f"Case is {case.status}")
    if "actual_delivery_date" in body.model_fields_set:
        case.actual_delivery_date = body.actual_delivery_date
    if body.surviving_children is not None:
        case.surviving_children = body.surviving_children
    was_approved = case.status == "APPROVED"
    emp = await employee_or_404(db, tenant.id, case.employee_id)
    await _compute_maternity(db, tenant, emp, case)
    if was_approved and case.eligible:
        case.status = "APPROVED"
    elif was_approved:
        case.approved_by = case.approved_at = None
    await _audit(db, tenant.id, user.id, "HR_BD_MATERNITY_CASE_UPDATED", f"hr.bd.maternity:{case.id}", case.status)
    await db.commit()
    await db.refresh(case)
    return _row(case, MAT_FIELDS)


@router.post("/maternity-cases/{case_id}/approve")
async def approve_maternity_case(
    case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    require_flag(tenant, HR_BD_MATERNITY_ENFORCEMENT_ENABLED, "Maternity enforcement")
    case = await _locked(db, HrBdMaternityCase, tenant.id, case_id, "Maternity case")
    if case.status != "ELIGIBLE":
        raise HTTPException(status_code=409, detail=f"Only an ELIGIBLE case can be approved (case is {case.status})")
    case.status, case.approved_by, case.approved_at = "APPROVED", user.id, datetime.utcnow()
    await _audit(db, tenant.id, user.id, "HR_BD_MATERNITY_CASE_APPROVED", f"hr.bd.maternity:{case.id}", str(case.benefit_amount))
    await db.commit()
    await db.refresh(case)
    return _row(case, MAT_FIELDS)


@router.post("/maternity-cases/{case_id}/mark-paid")
async def mark_maternity_paid(
    case_id: int,
    body: MarkPaid,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    case = await _locked(db, HrBdMaternityCase, tenant.id, case_id, "Maternity case")
    if case.status != "APPROVED":
        raise HTTPException(status_code=409, detail=f"Only an APPROVED case can be marked paid (case is {case.status})")
    case.status, case.paid_by, case.paid_at = "PAID", user.id, datetime.utcnow()
    case.payment_reference = body.payment_reference.strip()
    await _audit(db, tenant.id, user.id, "HR_BD_MATERNITY_CASE_PAID", f"hr.bd.maternity:{case.id}", case.payment_reference)
    await db.commit()
    await db.refresh(case)
    return _row(case, MAT_FIELDS)


@router.post("/maternity-cases/{case_id}/cancel")
async def cancel_maternity_case(
    case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_LEAVE_TYPES_MANAGE)
    case = await _locked(db, HrBdMaternityCase, tenant.id, case_id, "Maternity case")
    if case.status == "PAID":
        raise HTTPException(status_code=409, detail="A paid case cannot be cancelled")
    case.status = "CANCELLED"
    await _audit(db, tenant.id, user.id, "HR_BD_MATERNITY_CASE_CANCELLED", f"hr.bd.maternity:{case.id}")
    await db.commit()
    await db.refresh(case)
    return _row(case, MAT_FIELDS)


# --- Earned-leave accrual -------------------------------------------------------------------------


class AccrualBody(BaseModel):
    period_start: date
    period_end: date


async def _accrual_rows(db: AsyncSession, tenant: Tenant, body: AccrualBody, lt: LeaveType | None):
    if body.period_end < body.period_start or (body.period_end - body.period_start).days > 366:
        raise HTTPException(status_code=400, detail="Period must be valid and at most one year")
    eff = await effective_rules(db, tenant.id, body.period_end)
    employees = (
        await db.execute(
            select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True)).order_by(Employee.id).limit(2000)
        )
    ).scalars().all()
    out = []
    for emp in employees:
        balance = None
        if lt is not None:
            balance = (
                await db.execute(
                    select(LeaveBalance).where(
                        LeaveBalance.tenant_id == tenant.id, LeaveBalance.employee_id == emp.id,
                        LeaveBalance.leave_type_id == lt.id, LeaveBalance.balance_year == body.period_end.year,
                    )
                )
            ).scalar_one_or_none()
        opening = Decimal(str(balance.closing_balance_days)) if balance else Decimal("0")
        worked = await count_worked_days(db, tenant.id, emp.id, body.period_start, body.period_end)
        continuous = await continuous_year_completed(db, tenant.id, emp, body.period_end, eff.rules)
        res = calc.earned_leave_accrual(worked_days=worked, opening_balance=opening, continuous_year_completed=continuous, rules=eff.rules)
        out.append((emp, balance, worked, Decimal(res.trace["accrued_days"]), res, eff))
    return out


@router.post("/leave-accrual/preview")
async def preview_leave_accrual(
    body: AccrualBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_LEAVE_TYPES_MANAGE)
    lt = (await db.execute(select(LeaveType).where(LeaveType.tenant_id == tenant.id, LeaveType.code == "BD-EL"))).scalar_one_or_none()
    rows = await _accrual_rows(db, tenant, body, lt)
    return {
        "leave_type_found": lt is not None,
        "employees": [
            {"employee_id": e.id, "employee_code": e.employee_code, "worked_days": w, "accrued_days": str(a), "warnings": r.warnings}
            for e, _b, w, a, r, _eff in rows
        ],
    }


@router.post("/leave-accrual/apply")
async def apply_leave_accrual(
    body: AccrualBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await _perm(db, user, tenant_id, PERMISSION_HR_LEAVE_TYPES_MANAGE)
    require_flag(tenant, HR_BD_LEAVE_ACCRUAL_ENFORCEMENT_ENABLED, "Earned-leave accrual")
    await lock_tenant(db, tenant_id)
    lt = (await db.execute(select(LeaveType).where(LeaveType.tenant_id == tenant_id, LeaveType.code == "BD-EL"))).scalar_one_or_none()
    if lt is None:
        raise HTTPException(status_code=409, detail="Leave type BD-EL is missing; apply the Bangladesh setup first")
    done = set(
        (
            await db.execute(
                select(HrBdLeaveAccrualEntry.employee_id).where(
                    HrBdLeaveAccrualEntry.tenant_id == tenant_id, HrBdLeaveAccrualEntry.leave_type_id == lt.id,
                    HrBdLeaveAccrualEntry.source_period_start <= body.period_end,
                    HrBdLeaveAccrualEntry.source_period_end >= body.period_start,
                )
            )
        ).scalars()
    )
    applied, skipped = 0, 0
    for emp, balance, worked, accrued, res, eff in await _accrual_rows(db, tenant, body, lt):
        if emp.id in done:
            skipped += 1
            continue
        if balance is None:
            balance = LeaveBalance(
                tenant_id=tenant_id, employee_id=emp.id, leave_type_id=lt.id, balance_year=body.period_end.year,
                allocated_days=Decimal("0"), used_days=Decimal("0"), pending_days=Decimal("0"), closing_balance_days=Decimal("0"),
            )
            db.add(balance)
            await db.flush()
        balance.allocated_days = Decimal(str(balance.allocated_days)) + accrued
        balance.closing_balance_days = Decimal(str(balance.closing_balance_days)) + accrued
        db.add(
            HrBdLeaveAccrualEntry(
                tenant_id=tenant_id, employee_id=emp.id, leave_type_id=lt.id, balance_id=balance.id,
                rule_set_id=eff.rule_set.id if eff.rule_set else None, source_period_start=body.period_start,
                source_period_end=body.period_end, worked_days=worked, accrued_days=accrued,
                trace_json={**res.as_dict(), "source": eff.source}, created_by=user_id,
            )
        )
        applied += 1
    await _audit(db, tenant_id, user_id, "HR_BD_LEAVE_ACCRUAL_APPLIED", "hr.bd.leave_accrual",
                 f"{body.period_start}..{body.period_end}: applied {applied}, skipped {skipped}")
    await _commit_or_conflict(db, "Accrual for this period was already applied")
    return {"applied": applied, "skipped": skipped}


# --- Festival-holiday work ------------------------------------------------------------------------

FW_FIELDS = (
    "id", "employee_id", "holiday_id", "attendance_entry_id", "work_date", "alternative_holiday_date",
    "alternative_holiday_status", "compensation_days", "compensation_amount", "status", "payroll_run_line_id",
    "final_settlement_id", "approved_by", "approved_at", "trace_json",
)


class FestivalGenerate(BaseModel):
    from_date: date
    to_date: date


class FestivalApprove(BaseModel):
    alternative_holiday_date: date


@router.get("/festival-work")
async def list_festival_work(
    status_filter: str | None = Query(default=None, alias="status"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_ATTENDANCE_MANAGE)
    stmt = select(HrBdFestivalWorkEntry).where(HrBdFestivalWorkEntry.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(HrBdFestivalWorkEntry.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.order_by(HrBdFestivalWorkEntry.work_date.desc()).limit(LIST_CAP))).scalars().all()
    return [_row(r, FW_FIELDS) for r in rows]


@router.post("/festival-work/generate")
async def generate_festival_work(
    body: FestivalGenerate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await _perm(db, user, tenant_id, PERMISSION_HR_ATTENDANCE_MANAGE)
    require_flag(tenant, HR_BD_FESTIVAL_COMPENSATION_ENABLED, "Festival-work compensation")
    if body.to_date < body.from_date or (body.to_date - body.from_date).days > 366:
        raise HTTPException(status_code=400, detail="Period must be valid and at most one year")
    await lock_tenant(db, tenant_id)
    rows = (
        await db.execute(
            select(AttendanceEntry, AttendanceHoliday)
            .join(
                AttendanceHoliday,
                (AttendanceHoliday.tenant_id == AttendanceEntry.tenant_id)
                & (AttendanceHoliday.holiday_date == AttendanceEntry.attendance_date),
            )
            .where(
                AttendanceEntry.tenant_id == tenant_id,
                AttendanceEntry.attendance_date >= body.from_date,
                AttendanceEntry.attendance_date <= body.to_date,
                AttendanceEntry.in_time.is_not(None),
                AttendanceHoliday.is_optional.is_(False),
            )
            .limit(5000)
        )
    ).all()
    existing = set(
        (
            await db.execute(
                select(HrBdFestivalWorkEntry.attendance_entry_id).where(HrBdFestivalWorkEntry.tenant_id == tenant_id)
            )
        ).scalars()
    )
    created = 0
    for entry, holiday in rows:
        if entry.id in existing:
            continue
        emp = await employee_or_404(db, tenant_id, entry.employee_id)
        eff = await effective_rules(db, tenant_id, entry.attendance_date)
        rates = {r.rate_code: r for r in await effective_rates(db, tenant_id, eff.rule_set.id if eff.rule_set else None, entry.attendance_date)}
        snap = await pay_snapshot(db, tenant_id, emp, entry.attendance_date, rates)
        res = calc.festival_work_compensation(snap.gross, eff.rules)
        db.add(
            HrBdFestivalWorkEntry(
                tenant_id=tenant_id, employee_id=emp.id, holiday_id=holiday.id, attendance_entry_id=entry.id,
                rule_set_id=eff.rule_set.id if eff.rule_set else None, work_date=entry.attendance_date,
                compensation_days=Decimal(res.trace["compensatory_wage_days"]), compensation_amount=res.amount,
                status="PENDING", trace_json={**res.as_dict(), "holiday": holiday.name, "source": eff.source},
                created_by=user_id,
            )
        )
        created += 1
    await _audit(db, tenant_id, user_id, "HR_BD_FESTIVAL_WORK_GENERATED", "hr.bd.festival_work",
                 f"{body.from_date}..{body.to_date}: {created}")
    await _commit_or_conflict(db, "Festival-work entries were generated at the same time; retry")
    return {"created": created}


@router.post("/festival-work/{entry_id}/approve")
async def approve_festival_work(
    entry_id: int,
    body: FestivalApprove,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    require_flag(tenant, HR_BD_FESTIVAL_COMPENSATION_ENABLED, "Festival-work compensation")
    row = await _locked(db, HrBdFestivalWorkEntry, tenant.id, entry_id, "Festival-work entry")
    if row.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Entry is {row.status}")
    if body.alternative_holiday_date <= row.work_date:
        raise HTTPException(status_code=400, detail="The alternative holiday must be after the festival day worked")
    row.status, row.approved_by, row.approved_at = "APPROVED", user.id, datetime.utcnow()
    row.alternative_holiday_date, row.alternative_holiday_status = body.alternative_holiday_date, "SCHEDULED"
    await _audit(db, tenant.id, user.id, "HR_BD_FESTIVAL_WORK_APPROVED", f"hr.bd.festival_work:{row.id}", str(row.compensation_amount))
    await db.commit()
    await db.refresh(row)
    return _row(row, FW_FIELDS)


@router.post("/festival-work/{entry_id}/cancel")
async def cancel_festival_work(
    entry_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_ATTENDANCE_MANAGE)
    row = await _locked(db, HrBdFestivalWorkEntry, tenant.id, entry_id, "Festival-work entry")
    if row.payroll_run_line_id is not None or row.final_settlement_id is not None:
        raise HTTPException(status_code=409, detail="Entry is already included in payroll or a final settlement")
    row.status = "CANCELLED"
    await _audit(db, tenant.id, user.id, "HR_BD_FESTIVAL_WORK_CANCELLED", f"hr.bd.festival_work:{row.id}")
    await db.commit()
    await db.refresh(row)
    return _row(row, FW_FIELDS)


# --- Service benefits -----------------------------------------------------------------------------

SB_FIELDS = (
    "id", "employee_id", "rule_set_id", "benefit_type", "service_start_date", "service_end_date", "service_days",
    "wage_basis", "amount", "calculation_trace", "status", "approved_by", "approved_at", "paid_at", "created_at",
)


class ServiceBenefitCreate(BaseModel):
    employee_id: int
    benefit_type: str
    service_end_date: date
    permanent: bool = True
    death_at_work: bool = False
    misconduct_no_compensation: bool = False


async def compute_service_benefit(
    db: AsyncSession, tenant: Tenant, emp: Employee, *, benefit_type: str, end: date, permanent: bool,
    death_at_work: bool, misconduct_no_compensation: bool,
) -> tuple[calc.Result, Any, Decimal]:
    if benefit_type not in calc.SEPARATION_TYPES:
        raise HTTPException(status_code=400, detail=f"benefit_type must be one of {', '.join(calc.SEPARATION_TYPES)}")
    if emp.joining_date is None or end < emp.joining_date:
        raise HTTPException(status_code=400, detail="Employee needs a joining date on or before the service end date")
    eff = await effective_rules(db, tenant.id, end)
    rates = {r.rate_code: r for r in await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, end)}
    snap = await pay_snapshot(db, tenant.id, emp, end, rates)
    res = calc.service_benefit(
        separation_type=benefit_type, service_start=emp.joining_date, separation_date=end, monthly_basic=snap.basic,
        permanent=permanent, death_at_work=death_at_work, misconduct_no_compensation=misconduct_no_compensation,
        rules=eff.rules,
    )
    return res, eff, snap.basic


@router.get("/service-benefits")
async def list_service_benefits(
    employee_id: int | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _perm(db, user, tenant.id, PERMISSION_HR_PAYROLL_MANAGE)
    stmt = select(HrBdServiceBenefitCase).where(HrBdServiceBenefitCase.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(HrBdServiceBenefitCase.employee_id == employee_id)
    rows = (await db.execute(stmt.order_by(HrBdServiceBenefitCase.id.desc()).limit(LIST_CAP))).scalars().all()
    return [_row(r, SB_FIELDS) for r in rows]


@router.post("/service-benefits", status_code=status.HTTP_201_CREATED)
async def create_service_benefit(
    body: ServiceBenefitCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await _perm(db, user, tenant_id, PERMISSION_HR_PAYROLL_MANAGE)
    require_flag(tenant, HR_BD_SERVICE_BENEFITS_ENABLED, "Service benefits")
    emp = await _lock_employee(db, tenant_id, body.employee_id)
    dup = (
        await db.execute(
            select(HrBdServiceBenefitCase.id).where(
                HrBdServiceBenefitCase.tenant_id == tenant_id,
                HrBdServiceBenefitCase.employee_id == emp.id,
                HrBdServiceBenefitCase.benefit_type == body.benefit_type,
                HrBdServiceBenefitCase.service_end_date == body.service_end_date,
            )
        )
    ).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"Service-benefit case #{dup[0]} already exists for this date")
    res, eff, basic = await compute_service_benefit(
        db, tenant, emp, benefit_type=body.benefit_type, end=body.service_end_date, permanent=body.permanent,
        death_at_work=body.death_at_work, misconduct_no_compensation=body.misconduct_no_compensation,
    )
    row = HrBdServiceBenefitCase(
        tenant_id=tenant_id, employee_id=emp.id, rule_set_id=eff.rule_set.id if eff.rule_set else None,
        benefit_type=body.benefit_type, service_start_date=emp.joining_date, service_end_date=body.service_end_date,
        service_days=(body.service_end_date - emp.joining_date).days + 1, wage_basis=basic, amount=res.amount,
        calculation_trace={**res.as_dict(), "source": eff.source}, status="DRAFT", created_by=user_id,
    )
    db.add(row)
    await db.flush()
    await _audit(db, tenant_id, user_id, "HR_BD_SERVICE_BENEFIT_CREATED", f"hr.bd.service_benefit:{row.id}", str(row.amount))
    await _commit_or_conflict(db, "A service-benefit case for this employee, type and date already exists")
    await db.refresh(row)
    return _row(row, SB_FIELDS)


@router.post("/service-benefits/{case_id}/approve")
async def approve_service_benefit(
    case_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    require_flag(tenant, HR_BD_SERVICE_BENEFITS_ENABLED, "Service benefits")
    row = await _locked(db, HrBdServiceBenefitCase, tenant.id, case_id, "Service-benefit case")
    if row.status != "DRAFT":
        raise HTTPException(status_code=409, detail=f"Case is {row.status}")
    row.status, row.approved_by, row.approved_at = "APPROVED", user.id, datetime.utcnow()
    await _audit(db, tenant.id, user.id, "HR_BD_SERVICE_BENEFIT_APPROVED", f"hr.bd.service_benefit:{row.id}", str(row.amount))
    await db.commit()
    await db.refresh(row)
    return _row(row, SB_FIELDS)
