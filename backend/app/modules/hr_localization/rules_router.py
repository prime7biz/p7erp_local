"""Bangladesh rule sets (Phase B), enforcement switches and read-only previews.

GET   /hr/localization/bd-rmg/rules                      list (any HR user)
POST  /hr/localization/bd-rmg/rules/seed-official        create the DRAFT official rule set (hr.payroll.manage)
GET   /hr/localization/bd-rmg/rules/{id}                 detail + wage rates
PATCH /hr/localization/bd-rmg/rules/{id}                 DRAFT only; worker-favourable changes only (hr.payroll.manage)
POST  /hr/localization/bd-rmg/rules/{id}/approve         manager/admin
POST  /hr/localization/bd-rmg/rules/{id}/retire          manager/admin
GET   /hr/localization/bd-rmg/enforcement                current strict flags
PUT   /hr/localization/bd-rmg/enforcement                manager/admin; needs an approved rule set for today
GET   /hr/localization/bd-rmg/rules/preview/*            read-only calculations (hr.payroll.manage)
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.business_date import today_local
from app.common.permissions import HR_SETUP_BYPASS_ROLES, PERMISSION_HR_PAYROLL_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, AttendanceHoliday
from app.models.hr_bd import HrBdRuleSet, HrBdWageScheduleRate
from app.modules.audit.service import log_action
from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_localization.employee_pay import employee_or_404, pay_snapshot
from app.modules.hr_localization.enforcement_flags import ENFORCEMENT_FLAGS, enforcement_state
from app.modules.hr_localization.rules_service import (
    approve,
    assert_no_overlap,
    effective_rates,
    effective_rules,
    lock_tenant,
    rate_out,
    rule_set_or_404,
    rule_set_out,
    seed_official_rule_set,
    validate_rules_update,
)

router = APIRouter(prefix="/hr/localization/bd-rmg", tags=["hr-localization"])

PREVIEW_EMPLOYEE_CAP = 2000


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def require_manager_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    if (role.name if role else "").strip().lower() not in HR_SETUP_BYPASS_ROLES:
        raise HTTPException(status_code=403, detail="Only manager/admin can approve or switch enforcement")


async def _payroll_manage(db: AsyncSession, user: User, tenant_id: int) -> None:
    await assert_hr_manager_or_permission(db, user, tenant_id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)


class RuleSetUpdate(BaseModel):
    effective_from: date | None = None
    effective_to: date | None = None
    rules: dict[str, Any] | None = Field(default=None, description="Rule keys to change (worker-favourable only)")


class EnforcementUpdate(BaseModel):
    flags: dict[str, bool]


@router.get("/rules")
async def list_rule_sets(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(
            select(HrBdRuleSet).where(HrBdRuleSet.tenant_id == tenant.id).order_by(HrBdRuleSet.effective_from.desc()).limit(100)
        )
    ).scalars().all()
    return [rule_set_out(r) for r in rows]


@router.post("/rules/seed-official", status_code=status.HTTP_201_CREATED)
async def seed_official(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await _payroll_manage(db, user, tenant_id)
    try:
        await lock_tenant(db, tenant_id)
        rs, created = await seed_official_rule_set(db, tenant_id, user_id=user_id)
        if created:
            await log_action(
                db, tenant_id=tenant_id, user_id=user_id, action="HR_BD_RULE_SET_SEEDED",
                resource=f"hr.bd.rule_set:{rs.id}", details=rs.catalog_version,
            )
        await db.commit()
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return {"created": created, "rule_set": rule_set_out(rs)}


@router.get("/rules/{rule_set_id}")
async def get_rule_set(
    rule_set_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rs = await rule_set_or_404(db, tenant.id, rule_set_id)
    rates = (
        await db.execute(
            select(HrBdWageScheduleRate)
            .where(HrBdWageScheduleRate.tenant_id == tenant.id, HrBdWageScheduleRate.rule_set_id == rs.id)
            .order_by(HrBdWageScheduleRate.rate_code)
        )
    ).scalars().all()
    return {**rule_set_out(rs), "rates": [rate_out(r) for r in rates]}


@router.patch("/rules/{rule_set_id}")
async def update_rule_set(
    rule_set_id: int,
    body: RuleSetUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _payroll_manage(db, user, tenant.id)
    rs = await rule_set_or_404(db, tenant.id, rule_set_id, lock=True)
    if rs.status != "DRAFT":
        raise HTTPException(status_code=409, detail="Only a DRAFT rule set can be changed; create a new version instead")
    changes: list[str] = []
    if body.effective_from is not None:
        if body.effective_from < date(2023, 12, 1):
            raise HTTPException(status_code=400, detail="effective_from cannot be before the Gazette effective date 2023-12-01")
        changes.append(f"effective_from {rs.effective_from} -> {body.effective_from}")
        rs.effective_from = body.effective_from
    if "effective_to" in body.model_fields_set:
        changes.append(f"effective_to {rs.effective_to} -> {body.effective_to}")
        rs.effective_to = body.effective_to
    if rs.effective_to and rs.effective_to < rs.effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on or after effective_from")
    if body.rules:
        merged = validate_rules_update(dict(rs.rules_json or {}), body.rules)
        changes.extend(f"{k}: {(rs.rules_json or {}).get(k)} -> {v}" for k, v in body.rules.items())
        rs.rules_json = merged
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_BD_RULE_SET_UPDATED",
        resource=f"hr.bd.rule_set:{rs.id}", details="; ".join(changes) or "no change",
    )
    await db.commit()
    await db.refresh(rs)
    return rule_set_out(rs)


@router.post("/rules/{rule_set_id}/approve")
async def approve_rule_set(
    rule_set_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await require_manager_admin(db, user, tenant_id)
    try:
        await lock_tenant(db, tenant_id)
        rs = await rule_set_or_404(db, tenant_id, rule_set_id, lock=True)
        if rs.status != "DRAFT":
            raise HTTPException(status_code=409, detail=f"Rule set is {rs.status}")
        await assert_no_overlap(db, rs)
        approve(rs, user_id)
        await log_action(
            db, tenant_id=tenant_id, user_id=user_id, action="HR_BD_RULE_SET_APPROVED",
            resource=f"hr.bd.rule_set:{rs.id}", details=f"{rs.code} {rs.catalog_version} from {rs.effective_from}",
        )
        await db.commit()
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise
    await db.refresh(rs)
    return rule_set_out(rs)


@router.post("/rules/{rule_set_id}/retire")
async def retire_rule_set(
    rule_set_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_manager_admin(db, user, tenant.id)
    rs = await rule_set_or_404(db, tenant.id, rule_set_id, lock=True)
    if rs.status == "RETIRED":
        return rule_set_out(rs)
    rs.status = "RETIRED"
    await log_action(
        db, tenant_id=tenant.id, user_id=user.id, action="HR_BD_RULE_SET_RETIRED", resource=f"hr.bd.rule_set:{rs.id}"
    )
    await db.commit()
    await db.refresh(rs)
    return rule_set_out(rs)


@router.get("/enforcement")
async def get_enforcement(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    eff = await effective_rules(db, tenant.id, today_local(tenant))
    return {
        "flags": enforcement_state(tenant.feature_flags),
        "approved_rule_set": rule_set_out(eff.rule_set) if eff.rule_set else None,
    }


@router.put("/enforcement")
async def update_enforcement(
    body: EnforcementUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await require_manager_admin(db, user, tenant_id)
    unknown = sorted(set(body.flags) - set(ENFORCEMENT_FLAGS))
    if unknown:
        raise HTTPException(status_code=400, detail=f"Unknown enforcement flag(s): {', '.join(unknown)}")
    locked = await lock_tenant(db, tenant_id)
    if any(body.flags.values()):
        eff = await effective_rules(db, tenant_id, today_local(locked))
        if eff.rule_set is None:
            raise HTTPException(status_code=409, detail="Approve a Bangladesh rule set covering today before switching enforcement on")
    flags = dict(locked.feature_flags) if isinstance(locked.feature_flags, dict) else {}
    changes = {k: (flags.get(k) is True, v) for k, v in body.flags.items() if (flags.get(k) is True) != v}
    for key, value in body.flags.items():
        flags[key] = bool(value)
    locked.feature_flags = flags
    if changes:
        await log_action(
            db, tenant_id=tenant_id, user_id=user_id, action="HR_BD_ENFORCEMENT_CHANGED",
            resource="hr.bd.enforcement", details="; ".join(f"{k}: {a} -> {b}" for k, (a, b) in changes.items()),
        )
    await db.commit()
    await db.refresh(locked)
    return {"flags": enforcement_state(locked.feature_flags)}


# --- Salary income tax (TDS) switch ----------------------------------------------------------------


class SalaryTdsSwitch(BaseModel):
    enabled: bool


async def _salary_tds_problems(db: AsyncSession, tenant: Tenant) -> list[str]:
    from app.common.tenant_feature_keys import is_payroll_gross_posting_enabled
    from app.models.hr_payroll import PayrollAccountingConfig
    from app.modules.hr_localization import bd_salary_tds_service as tds_service

    problems = tds_service.approval_problems()
    if not is_payroll_gross_posting_enabled(tenant.feature_flags):
        problems.append("Turn on gross payroll posting first, so the tax liability is recorded in the books")
    cfg = (
        await db.execute(select(PayrollAccountingConfig).where(PayrollAccountingConfig.tenant_id == tenant.id).limit(1))
    ).scalar_one_or_none()
    if cfg is None or not cfg.tax_payable_account_id:
        problems.append("Set the Tax payable account in Payroll accounting settings")
    return problems


def _salary_tds_state(tenant: Tenant, problems: list[str]) -> dict[str, Any]:
    from app.common.tenant_feature_keys import is_hr_bd_salary_tds_enabled
    from app.modules.hr_localization import bd_salary_tds as engine
    from app.modules.hr_localization import bd_salary_tds_service as tds_service

    approval = tds_service.load_approval()
    return {
        "enabled": is_hr_bd_salary_tds_enabled(tenant.feature_flags),
        "can_enable": not problems,
        "problems": problems,
        "schedule_version": engine.SCHEDULE_VERSION,
        "approval_status": str(approval.get("status") or "MISSING"),
        "approval_id": approval.get("approval_id"),
    }


@router.get("/salary-tds")
async def get_salary_tds_switch(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _payroll_manage(db, user, tenant.id)
    return _salary_tds_state(tenant, await _salary_tds_problems(db, tenant))


@router.put("/salary-tds")
async def update_salary_tds_switch(
    body: SalaryTdsSwitch,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Turn Bangladesh salary TDS on or off. Turning it on needs the signed tax approval record."""
    from app.common.tenant_feature_keys import HR_BD_SALARY_TDS_ENABLED, is_hr_bd_salary_tds_enabled
    from app.modules.hr_localization import bd_salary_tds as engine
    from app.modules.hr_localization import bd_salary_tds_service as tds_service

    _ensure_tenant(user, tenant)
    tenant_id, user_id = tenant.id, user.id
    await require_manager_admin(db, user, tenant_id)
    locked = await lock_tenant(db, tenant_id)
    problems: list[str] = []
    if body.enabled:
        problems = await _salary_tds_problems(db, locked)
        if problems:
            raise HTTPException(status_code=409, detail="Cannot switch salary TDS on: " + "; ".join(problems))
    was = is_hr_bd_salary_tds_enabled(locked.feature_flags)
    flags = dict(locked.feature_flags) if isinstance(locked.feature_flags, dict) else {}
    flags[HR_BD_SALARY_TDS_ENABLED] = bool(body.enabled)
    locked.feature_flags = flags
    if was != body.enabled:
        approval = tds_service.load_approval()
        await log_action(
            db, tenant_id=tenant_id, user_id=user_id, action="HR_BD_SALARY_TDS_SWITCHED",
            resource="hr.bd.salary_tds",
            details=(
                f"{was} -> {body.enabled}; schedule {engine.SCHEDULE_VERSION}; approval {approval.get('approval_id')}"
            ),
        )
    await db.commit()
    await db.refresh(locked)
    return _salary_tds_state(locked, problems)


# --- Read-only previews --------------------------------------------------------------------------


async def _rules_and_rates(db: AsyncSession, tenant_id: int, as_of: date):
    eff = await effective_rules(db, tenant_id, as_of)
    rates = await effective_rates(db, tenant_id, eff.rule_set.id if eff.rule_set else None, as_of)
    return eff, {r.rate_code: r for r in rates}


def _meta(eff) -> dict[str, Any]:
    return {"source": eff.source, "warnings": list(eff.warnings)}


@router.get("/rules/preview/minimum-wage")
async def preview_minimum_wage(
    as_of: date | None = Query(default=None),
    limit: int = Query(default=500, ge=1, le=PREVIEW_EMPLOYEE_CAP),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _payroll_manage(db, user, tenant.id)
    day = as_of or today_local(tenant)
    eff, rates = await _rules_and_rates(db, tenant.id, day)
    employees = (
        await db.execute(
            select(Employee).where(Employee.tenant_id == tenant.id, Employee.is_active.is_(True)).order_by(Employee.employee_code).limit(limit)
        )
    ).scalars().all()
    rows, gaps = [], 0
    for emp in employees:
        snap = await pay_snapshot(db, tenant.id, emp, day, rates)
        row: dict[str, Any] = {
            "employee_id": emp.id,
            "employee_code": emp.employee_code,
            "name": " ".join(p for p in (emp.first_name, emp.last_name) if p),
            "basic": str(snap.basic),
            "gross": str(snap.gross),
            "structure_code": snap.structure_code,
            "rate_code": snap.wage_rate.rate_code if snap.wage_rate else None,
            "rate_source": snap.wage_rate_source,
            "status": "ok",
            "shortfall_basic": "0.00",
            "shortfall_gross": "0.00",
        }
        if snap.assignment_id is None:
            row["status"] = "no_salary_assignment"
        elif snap.wage_rate is None:
            row["status"] = "no_grade"
        else:
            sb = max(Decimal("0"), snap.wage_rate.basic - snap.basic)
            sg = max(Decimal("0"), snap.wage_rate.gross - snap.gross)
            row["shortfall_basic"], row["shortfall_gross"] = str(calc.money(sb)), str(calc.money(sg))
            if sb > 0 or sg > 0:
                row["status"] = "below_minimum"
        if row["status"] != "ok":
            gaps += 1
        rows.append(row)
    return {**_meta(eff), "as_of": day.isoformat(), "employees": rows, "gap_count": gaps}


@router.get("/rules/preview/overtime")
async def preview_overtime(
    monthly_basic: Decimal = Query(..., ge=0),
    ot_hours: Decimal = Query(..., ge=0, le=400),
    piece_rate: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    eff = await effective_rules(db, tenant.id, today_local(tenant))
    return {**_meta(eff), **calc.overtime(monthly_basic, ot_hours, eff.rules, piece_rate=piece_rate).as_dict()}


@router.get("/rules/preview/maternity")
async def preview_maternity(
    employee_id: int,
    expected_delivery_date: date,
    surviving_children: int = Query(..., ge=0, le=20),
    actual_delivery_date: date | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _payroll_manage(db, user, tenant.id)
    emp = await employee_or_404(db, tenant.id, employee_id)
    if emp.joining_date is None:
        raise HTTPException(status_code=400, detail="Employee has no joining date")
    eff, rates = await _rules_and_rates(db, tenant.id, expected_delivery_date)
    snap = await pay_snapshot(db, tenant.id, emp, min(expected_delivery_date, today_local(tenant)), rates)
    res = calc.maternity(
        service_start=emp.joining_date,
        expected_delivery=expected_delivery_date,
        actual_delivery=actual_delivery_date,
        surviving_children=surviving_children,
        monthly_gross=snap.gross,
        rules=eff.rules,
    )
    return {**_meta(eff), "monthly_gross": str(snap.gross), **res.as_dict()}


@router.get("/rules/preview/earned-leave")
async def preview_earned_leave(
    employee_id: int,
    period_start: date,
    period_end: date,
    opening_balance: Decimal = Query(default=Decimal("0"), ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if period_end < period_start:
        raise HTTPException(status_code=400, detail="period_end must be on or after period_start")
    emp = await employee_or_404(db, tenant.id, employee_id)
    eff = await effective_rules(db, tenant.id, period_end)
    worked = await count_worked_days(db, tenant.id, emp.id, period_start, period_end)
    continuous = await continuous_year_completed(db, tenant.id, emp, period_end, eff.rules)
    res = calc.earned_leave_accrual(
        worked_days=worked, opening_balance=opening_balance, continuous_year_completed=continuous, rules=eff.rules
    )
    return {**_meta(eff), **res.as_dict()}


@router.get("/rules/preview/festival")
async def preview_festival(
    year: int = Query(..., ge=2023, le=2100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    eff = await effective_rules(db, tenant.id, date(year, 12, 31))
    required = int(calc.rule(eff.rules, "festival_holiday_days"))
    holidays = (
        await db.execute(
            select(AttendanceHoliday).where(
                AttendanceHoliday.tenant_id == tenant.id,
                AttendanceHoliday.holiday_date >= date(year, 1, 1),
                AttendanceHoliday.holiday_date <= date(year, 12, 31),
                AttendanceHoliday.is_optional.is_(False),
            ).order_by(AttendanceHoliday.holiday_date)
        )
    ).scalars().all()
    worked = (
        await db.execute(
            select(AttendanceHoliday.holiday_date, func.count(AttendanceEntry.id))
            .join(
                AttendanceEntry,
                (AttendanceEntry.tenant_id == AttendanceHoliday.tenant_id)
                & (AttendanceEntry.attendance_date == AttendanceHoliday.holiday_date),
            )
            .where(
                AttendanceHoliday.tenant_id == tenant.id,
                AttendanceHoliday.holiday_date >= date(year, 1, 1),
                AttendanceHoliday.holiday_date <= date(year, 12, 31),
                AttendanceEntry.in_time.is_not(None),
            )
            .group_by(AttendanceHoliday.holiday_date)
        )
    ).all()
    warnings = list(eff.warnings)
    if len(holidays) < required:
        warnings.append(f"Only {len(holidays)} paid holidays are set for {year}; s.118 requires {required} festival holidays")
    return {
        "source": eff.source,
        "warnings": warnings,
        "required_days": required,
        "configured_days": len(holidays),
        "holidays": [{"date": h.holiday_date.isoformat(), "name": h.name} for h in holidays],
        "worked_on_holiday": [{"date": d.isoformat(), "employees": n} for d, n in worked],
    }


@router.get("/rules/preview/service-benefit")
async def preview_service_benefit(
    employee_id: int,
    separation_type: str,
    separation_date: date,
    permanent: bool = True,
    death_at_work: bool = False,
    misconduct_no_compensation: bool = False,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _payroll_manage(db, user, tenant.id)
    if separation_type not in calc.SEPARATION_TYPES:
        raise HTTPException(status_code=400, detail=f"separation_type must be one of {', '.join(calc.SEPARATION_TYPES)}")
    emp = await employee_or_404(db, tenant.id, employee_id)
    if emp.joining_date is None:
        raise HTTPException(status_code=400, detail="Employee has no joining date")
    if separation_date < emp.joining_date:
        raise HTTPException(status_code=400, detail="separation_date is before the joining date")
    eff, rates = await _rules_and_rates(db, tenant.id, separation_date)
    snap = await pay_snapshot(db, tenant.id, emp, separation_date, rates)
    res = calc.service_benefit(
        separation_type=separation_type,
        service_start=emp.joining_date,
        separation_date=separation_date,
        monthly_basic=snap.basic,
        permanent=permanent,
        death_at_work=death_at_work,
        misconduct_no_compensation=misconduct_no_compensation,
        rules=eff.rules,
    )
    return {**_meta(eff), "monthly_basic": str(snap.basic), **res.as_dict()}


# --- Shared attendance helpers -------------------------------------------------------------------

WORKED_STATUSES = ("PRESENT", "LATE", "HALF_DAY")


async def count_worked_days(db: AsyncSession, tenant_id: int, employee_id: int, start: date, end: date) -> int:
    return int(
        (
            await db.execute(
                select(func.count(AttendanceEntry.id)).where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.employee_id == employee_id,
                    AttendanceEntry.attendance_date >= start,
                    AttendanceEntry.attendance_date <= end,
                    AttendanceEntry.in_time.is_not(None),
                    AttendanceEntry.out_time.is_not(None),
                )
            )
        ).scalar_one()
    )


async def continuous_year_completed(db: AsyncSession, tenant_id: int, emp: Employee, as_of: date, rules: dict) -> bool:
    """s.14(1): one year = at least 240 days actually worked in the previous 12 calendar months."""
    if emp.joining_date is None or calc.add_months(emp.joining_date, 12) > as_of:
        return False
    worked = await count_worked_days(db, tenant_id, emp.id, calc.add_months(as_of, -12), as_of)
    return worked >= int(calc.rule(rules, "continuous_year_min_worked_days"))
