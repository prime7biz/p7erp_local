"""Final settlement calculation (s.11, 19, 20, 23, 26, 27, 28, 30 of the Labour Act) and accounting.

Ownership: unpaid approved extras (festival work, allowances, production bonus, festival bonus) are
locked and linked to the settlement; rows already owned by a live payroll line are excluded. The
salary-to-date window may not overlap a live payroll run line for the employee.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.models.hr import Employee
from app.models.hr_attendance import OvertimeEntry
from app.models.hr_leave import LeaveBalance, LeaveType
from app.models.hr_lifecycle import HrClearanceItem, HrFinalSettlement, HrSeparation
from app.models.hr_payroll import BonusDeclaration, EmployeeAdvance, PayrollPeriod, PayrollRun, PayrollRunLine
from app.modules.hr_allowances.pay_benefits import is_employee_overtime_enabled
from app.modules.hr_localization import bd_calculations as calc
from app.modules.hr_localization.employee_pay import pay_snapshot
from app.modules.hr_localization.payroll_extras import DEAD_RUN_STATUSES, SOURCES
from app.modules.hr_localization.rules_service import effective_rates, effective_rules

ZERO = Decimal("0")


def _money(v: Any) -> Decimal:
    return calc.money(Decimal(str(v or 0)))


def _bonus_cutoff(criteria: Any) -> date:
    """Service cut-off of a festival bonus allocation; unknown or unreadable means not payable on exit."""
    try:
        return date.fromisoformat(str((criteria or {}).get("cutoff_date")))
    except (TypeError, ValueError, AttributeError):
        return date.max


@dataclass
class Computation:
    values: dict[str, Any]
    trace: dict[str, Any]
    extra_ids: dict[str, list[int]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


async def _last_paid_period_end(db: AsyncSession, tenant_id: int, employee_id: int) -> date | None:
    return (
        await db.execute(
            select(PayrollPeriod.end_date)
            .join(PayrollRun, PayrollRun.period_id == PayrollPeriod.id)
            .join(PayrollRunLine, PayrollRunLine.run_id == PayrollRun.id)
            .where(
                PayrollRunLine.tenant_id == tenant_id,
                PayrollRunLine.employee_id == employee_id,
                PayrollRun.status.not_in(DEAD_RUN_STATUSES),
            )
            .order_by(PayrollPeriod.end_date.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


def _working_days_after(start: date, n: int) -> date:
    day, left = start, n
    while left > 0:
        day += timedelta(days=1)
        if day.weekday() != 4:  # Friday weekly holiday
            left -= 1
    return day


async def compute_settlement(
    db: AsyncSession, tenant: Tenant, sep: HrSeparation, emp: Employee, *, settlement_id: int | None = None
) -> Computation:
    if emp.joining_date is None:
        raise HTTPException(status_code=400, detail="Employee needs a joining date")
    lwd = sep.last_working_date
    eff = await effective_rules(db, tenant.id, sep.effective_date)
    rates = {r.rate_code: r for r in await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, lwd)}
    snap = await pay_snapshot(db, tenant.id, emp, max(lwd, emp.joining_date), rates)
    warnings: list[str] = list(eff.warnings)
    if snap.assignment_id is None:
        warnings.append("No salary assignment on the last working day; salary and benefits are 0")

    # Salary to date: from the day after the last paid payroll period (inside the LWD month).
    last_paid = await _last_paid_period_end(db, tenant.id, emp.id)
    month_start = lwd.replace(day=1)
    start = max(month_start, (last_paid + timedelta(days=1)) if last_paid else month_start, emp.joining_date)
    if last_paid and last_paid + timedelta(days=1) < month_start:
        warnings.append(f"Salary after {last_paid} and before {month_start} is not in any payroll run; run payroll for those months first")
    if last_paid and last_paid >= lwd:
        warnings.append(f"Salary up to {last_paid} is already in a payroll run, so this settlement pays no salary (paid once, through payroll)")
    salary_days = Decimal(max(0, (lwd - start).days + 1)) if lwd >= start else ZERO
    days_in_month = Decimal(calendar.monthrange(lwd.year, lwd.month)[1])
    salary = _money(snap.gross * salary_days / days_in_month) if salary_days else ZERO
    if salary_days:
        overlap = (
            await db.execute(
                select(PayrollRunLine.id)
                .join(PayrollRun, PayrollRun.id == PayrollRunLine.run_id)
                .join(PayrollPeriod, PayrollPeriod.id == PayrollRun.period_id)
                .where(
                    PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.employee_id == emp.id,
                    PayrollRun.status.not_in(DEAD_RUN_STATUSES),
                    PayrollPeriod.start_date <= lwd, PayrollPeriod.end_date >= start,
                )
                .limit(1)
            )
        ).first()
        if overlap:
            raise HTTPException(status_code=409, detail="Salary for these days is already in a payroll run; reject that run line or settle after it")

    # Approved overtime in the unpaid window (2x basic, s.108).
    ot_hours = sum(
        (
            Decimal(str(h or 0))
            for h in (
                await db.execute(
                    select(OvertimeEntry.ot_hours).where(
                        OvertimeEntry.tenant_id == tenant.id, OvertimeEntry.employee_id == emp.id,
                        OvertimeEntry.status.in_(("APPROVED", "POSTED")),
                        OvertimeEntry.work_date >= start, OvertimeEntry.work_date <= lwd,
                    )
                )
            ).scalars()
        ),
        ZERO,
    ) if salary_days else ZERO
    if ot_hours and not await is_employee_overtime_enabled(db, tenant.id, emp.id):
        warnings.append(f"Overtime is switched off for this employee: {ot_hours} approved overtime hour(s) are not paid")
        ot_hours = ZERO
    overtime = calc.overtime(snap.basic, ot_hours, eff.rules).amount if ot_hours else ZERO

    # Unpaid approved extras, excluding anything a live payroll line owns.
    extra_ids: dict[str, list[int]] = {}
    allowances = ZERO
    dead_lines = (
        select(PayrollRunLine.id).join(PayrollRun, PayrollRun.id == PayrollRunLine.run_id).where(PayrollRun.status.in_(DEAD_RUN_STATUSES))
    )
    # Only what was earned while employed: work up to the last working day, production periods that
    # ended by then, festival bonus whose service cut-off is on or before the last working day.
    within_service = {
        "festival_work": lambda m: m.work_date <= lwd,
        "allowance": lambda m: m.work_date <= lwd,
        "production_bonus": lambda m: m.period_end <= lwd,
        "festival_bonus": lambda m: m.approved_at < datetime.combine(sep.effective_date + timedelta(days=1), datetime.min.time()),
    }
    for key, model in SOURCES.items():
        amount_col = model.compensation_amount if key == "festival_work" else model.amount
        stmt = select(model.id, amount_col).where(
            model.tenant_id == tenant.id, model.employee_id == emp.id, model.status == "APPROVED",
            within_service[key](model),
            or_(model.final_settlement_id.is_(None), model.final_settlement_id == (settlement_id or -1)),
            or_(model.payroll_run_line_id.is_(None), model.payroll_run_line_id.in_(dead_lines)),
        )
        if key == "festival_bonus":
            stmt = stmt.add_columns(BonusDeclaration.eligibility_criteria).join(
                BonusDeclaration, BonusDeclaration.id == model.bonus_declaration_id
            ).where(BonusDeclaration.tenant_id == tenant.id)
            rows = [(i, a) for i, a, crit in (await db.execute(stmt)).all() if _bonus_cutoff(crit) <= lwd]
        else:
            rows = (await db.execute(stmt)).all()
        if rows:
            extra_ids[key] = [i for i, _a in rows]
            allowances += sum((Decimal(str(a)) for _i, a in rows), ZERO)

    # Unused earned leave (s.11), paid at the s.119 leave-wage rate.
    el = (await db.execute(select(LeaveType.id).where(LeaveType.tenant_id == tenant.id, LeaveType.code == "BD-EL"))).scalar_one_or_none()
    el_days = ZERO
    if el is not None:
        bal = (
            await db.execute(
                select(LeaveBalance.closing_balance_days).where(
                    LeaveBalance.tenant_id == tenant.id, LeaveBalance.employee_id == emp.id,
                    LeaveBalance.leave_type_id == el, LeaveBalance.balance_year == lwd.year,
                )
            )
        ).scalar_one_or_none()
        el_days = max(ZERO, Decimal(str(bal or 0)))
    encash = calc.leave_encashment(el_days, snap.gross, eff.rules) if el_days else None

    benefit = calc.service_benefit(
        separation_type=sep.separation_type, service_start=emp.joining_date, separation_date=lwd,
        monthly_basic=snap.basic, permanent=sep.permanent, death_at_work=sep.death_at_work,
        misconduct_no_compensation=sep.misconduct_no_compensation, rules=eff.rules,
    )
    warnings += benefit.warnings

    required = calc.notice_days(sep.separation_type, permanent=sep.permanent, monthly_rated=sep.monthly_rated, rules=eff.rules)
    short = max(0, required - int(sep.notice_days_served or 0))
    notice_pay = notice_recovery = ZERO
    if short and sep.separation_type == "TERMINATION":
        notice_pay = calc.notice_pay(short, snap.basic, eff.rules)  # wages in lieu of notice (s.26(3))
    elif short and sep.separation_type == "RESIGNATION":
        notice_recovery = calc.notice_pay(short, snap.basic, eff.rules)  # worker pays in lieu (s.27(3))

    gross = _money(salary + overtime + allowances + (encash.amount if encash else ZERO) + benefit.amount + notice_pay)
    advances = (
        await db.execute(
            select(EmployeeAdvance).where(
                EmployeeAdvance.tenant_id == tenant.id, EmployeeAdvance.employee_id == emp.id, EmployeeAdvance.status == "ACTIVE"
            )
        )
    ).scalars().all()
    advance_due = sum((Decimal(str(a.outstanding or 0)) for a in advances), ZERO)
    clearance = sum(
        (
            Decimal(str(x or 0))
            for x in (
                await db.execute(
                    select(HrClearanceItem.amount_recoverable).where(
                        HrClearanceItem.tenant_id == tenant.id, HrClearanceItem.separation_id == sep.id, HrClearanceItem.status != "WAIVED"
                    )
                )
            ).scalars()
        ),
        ZERO,
    )
    # Deductions cannot exceed what is payable; anything left stays recoverable.
    owed = notice_recovery + _money(advance_due) + _money(clearance)
    room = gross
    notice_recovery = min(notice_recovery, room)
    room -= notice_recovery
    advance_recovery = min(_money(advance_due), room)
    room -= advance_recovery
    other = min(_money(clearance), room)
    if notice_recovery + advance_recovery + other < owed:
        warnings.append("Recoveries exceed the amount payable; the remainder is still owed by the employee")
    deductions = _money(notice_recovery + advance_recovery + other)
    values = {
        "salary_from": start if salary_days else None,
        "salary_to": lwd if salary_days else None,
        "salary_days": salary_days,
        "salary_amount": salary,
        "overtime_amount": _money(overtime),
        "allowances_amount": _money(allowances),
        "leave_encashment_days": el_days,
        "leave_encashment_amount": encash.amount if encash else ZERO,
        "service_benefit_amount": benefit.amount,
        "notice_pay_amount": notice_pay,
        "notice_recovery_amount": _money(notice_recovery),
        "advance_recovery_amount": advance_recovery,
        "other_deductions_amount": other,
        "gross_amount": gross,
        "deduction_amount": deductions,
        "net_amount": _money(gross - deductions),
    }
    trace = {
        "rule_source": eff.source,
        "monthly_basic": str(snap.basic),
        "monthly_gross": str(snap.gross),
        "days_in_month": str(days_in_month),
        "ot_hours": str(ot_hours),
        "service_benefit": benefit.as_dict(),
        "leave_encashment": encash.as_dict() if encash else None,
        "notice_required_days": required,
        "notice_short_days": short,
        "final_dues_due_by": _working_days_after(sep.effective_date, int(calc.rule(eff.rules, "final_dues_working_days"))).isoformat(),
        "warnings": warnings,
    }
    return Computation(values=values, trace=trace, extra_ids=extra_ids, warnings=warnings)


async def link_settlement_extras(db: AsyncSession, tenant_id: int, settlement_id: int, extra_ids: dict[str, list[int]]) -> None:
    """Lock each extra and point it at the settlement; refuse if a live payroll line took it meanwhile."""
    dead = (
        select(PayrollRunLine.id).join(PayrollRun, PayrollRun.id == PayrollRunLine.run_id).where(PayrollRun.status.in_(DEAD_RUN_STATUSES))
    )
    for key, model in SOURCES.items():
        ids = extra_ids.get(key) or []
        rows = (
            await db.execute(
                select(model).where(model.tenant_id == tenant_id, model.id.in_(ids or [0])).with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalars().all()
        dead_ids = set((await db.execute(dead.where(PayrollRunLine.tenant_id == tenant_id))).scalars()) if rows else set()
        for row in rows:
            if row.final_settlement_id not in (None, settlement_id) or (row.payroll_run_line_id is not None and row.payroll_run_line_id not in dead_ids):
                raise HTTPException(status_code=409, detail=f"{key} #{row.id} is already paid elsewhere; recalculate the settlement")
            row.final_settlement_id = settlement_id
            row.payroll_run_line_id = None
        # Release rows this settlement no longer includes (recalculation).
        stale = (
            await db.execute(
                select(model).where(
                    model.tenant_id == tenant_id, model.final_settlement_id == settlement_id, model.id.not_in(ids or [0])
                ).with_for_update()
            )
        ).scalars().all()
        for row in stale:
            row.final_settlement_id = None


def apply_values(settlement: HrFinalSettlement, comp: Computation) -> None:
    for key, value in comp.values.items():
        setattr(settlement, key, value)
    settlement.calculation_trace = comp.trace
