"""Company payroll projection for one month (totals only; no per-person figure ever leaves this module).

1. A finalised-or-later payroll run of a period that starts in the month exists -> its gross total
   (newest run per period). Source PAYROLL_RUN.
2. Else an estimate (source ATTENDANCE_ACCRUAL), batched (fixed number of queries, not per employee):
     monthly gross   = active salary-structure lines priced for the assignment's base salary
                       (`hr_localization/employee_pay.py` `price_lines`, same rule as payroll)
     earned to date  = gross x (employed days so far - ABSENT days so far) / days in month   (loss of pay)
     remaining       = gross x employed days after today / days in month
     overtime        = APPROVED overtime entries of the month that carry an amount
     projection      = earned + remaining + overtime
   Active employees without a salary structure add nothing and are counted (EMPLOYEE_WITHOUT_STRUCTURE).
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.orm_numeric import api_money_to_decimal
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, OvertimeEntry
from app.models.hr_payroll import (
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollStructureLine,
)
from app.modules.finance.budget_analytics.common import month_end, q4
from app.modules.hr_localization.employee_pay import gross_of, price_lines

ZERO = Decimal("0")
DONE_RUN_STATUSES = ("FINALIZED", "CHECKED", "APPROVED", "POSTED")
SRC_RUN = "PAYROLL_RUN"
SRC_ACCRUAL = "ATTENDANCE_ACCRUAL"


@dataclass
class PayrollProjection:
    amount: Decimal | None
    source: str
    earned_to_date: Decimal = ZERO
    remaining: Decimal = ZERO
    overtime: Decimal = ZERO
    employees: int = 0
    employees_without_structure: int = 0
    reason_codes: list[str] = field(default_factory=list)


async def _run_total(db: AsyncSession, tenant_id: int, start: date, end: date) -> Decimal | None:
    rows = (
        await db.execute(
            select(PayrollRun.period_id, PayrollRun.id, PayrollRun.gross_total)
            .join(PayrollPeriod, and_(PayrollPeriod.id == PayrollRun.period_id, PayrollPeriod.tenant_id == tenant_id))
            .where(
                PayrollRun.tenant_id == tenant_id,
                func.upper(PayrollRun.status).in_(DONE_RUN_STATUSES),
                PayrollPeriod.start_date >= start,
                PayrollPeriod.start_date <= end,
            )
            .order_by(PayrollRun.period_id, PayrollRun.id.desc())
        )
    ).all()
    if not rows:
        return None
    newest: dict[int, Decimal] = {}
    for period_id, _run_id, gross in rows:
        newest.setdefault(int(period_id), api_money_to_decimal(gross))
    return q4(sum(newest.values(), ZERO))


def _days(a: date, b: date) -> int:
    return max(0, (b - a).days + 1)


async def payroll_projection(db: AsyncSession, tenant_id: int, month: date, today: date) -> PayrollProjection:
    start, end = month.replace(day=1), month_end(month)
    run_total = await _run_total(db, tenant_id, start, end)
    if run_total is not None:
        return PayrollProjection(amount=run_total, source=SRC_RUN, earned_to_date=run_total)

    days_in_month = Decimal(_days(start, end))
    if today < start:
        elapsed_end = start - timedelta(days=1)  # future month: nothing earned yet
    else:
        elapsed_end = min(today, end)

    employees = (
        await db.execute(
            select(Employee.id, Employee.joining_date, Employee.exit_date).where(
                Employee.tenant_id == tenant_id,
                Employee.is_active.is_(True),
                or_(Employee.joining_date.is_(None), Employee.joining_date <= end),
                or_(Employee.exit_date.is_(None), Employee.exit_date >= start),
            )
        )
    ).all()
    proj = PayrollProjection(amount=ZERO, source=SRC_ACCRUAL, employees=len(employees))
    if not employees:
        proj.reason_codes.append("NO_ACTIVE_EMPLOYEES")
        return proj
    emp_ids = [int(e[0]) for e in employees]

    as_of = min(max(today, start), end)
    assignments: dict[int, PayrollEmployeeStructureAssignment] = {}
    for a in (
        await db.execute(
            select(PayrollEmployeeStructureAssignment)
            .where(
                PayrollEmployeeStructureAssignment.tenant_id == tenant_id,
                PayrollEmployeeStructureAssignment.employee_id.in_(emp_ids),
                PayrollEmployeeStructureAssignment.effective_from <= as_of,
                or_(
                    PayrollEmployeeStructureAssignment.effective_to.is_(None),
                    PayrollEmployeeStructureAssignment.effective_to >= as_of,
                ),
            )
            .order_by(PayrollEmployeeStructureAssignment.employee_id, PayrollEmployeeStructureAssignment.effective_from.desc())
        )
    ).scalars():
        assignments.setdefault(int(a.employee_id), a)

    lines_by_structure: dict[int, list] = defaultdict(list)
    structure_ids = {int(a.structure_id) for a in assignments.values()}
    if structure_ids:
        for line, comp in (
            await db.execute(
                select(PayrollStructureLine, PayrollComponent)
                .join(PayrollComponent, PayrollComponent.id == PayrollStructureLine.component_id)
                .where(
                    PayrollStructureLine.tenant_id == tenant_id,
                    PayrollStructureLine.structure_id.in_(structure_ids),
                    PayrollComponent.tenant_id == tenant_id,
                    PayrollComponent.is_active.is_(True),
                )
                .order_by(PayrollStructureLine.structure_id, PayrollStructureLine.sort_order.asc(), PayrollStructureLine.id.asc())
            )
        ).all():
            lines_by_structure[int(line.structure_id)].append((line, comp))

    absent: dict[int, int] = {}
    if elapsed_end >= start:
        absent = {
            int(eid): int(n)
            for eid, n in (
                await db.execute(
                    select(AttendanceEntry.employee_id, func.count(AttendanceEntry.id))
                    .where(
                        AttendanceEntry.tenant_id == tenant_id,
                        AttendanceEntry.employee_id.in_(emp_ids),
                        AttendanceEntry.attendance_date >= start,
                        AttendanceEntry.attendance_date <= elapsed_end,
                        AttendanceEntry.status == "ABSENT",
                    )
                    .group_by(AttendanceEntry.employee_id)
                )
            ).all()
        }

    earned = ZERO
    remaining = ZERO
    for eid, joining, exit_d in employees:
        a = assignments.get(int(eid))
        if a is None:
            proj.employees_without_structure += 1
            continue
        basic = api_money_to_decimal(a.base_salary) if a.base_salary is not None else ZERO
        overrides = a.component_overrides if isinstance(a.component_overrides, dict) else None
        gross = gross_of(price_lines(lines_by_structure.get(int(a.structure_id), []), basic, overrides))
        emp_from = max(start, joining) if joining else start
        emp_to = min(end, exit_d) if exit_d else end
        if emp_to < emp_from:
            continue
        done_days = _days(emp_from, min(emp_to, elapsed_end)) if elapsed_end >= emp_from else 0
        left_days = _days(max(emp_from, elapsed_end + timedelta(days=1)), emp_to)
        paid_done = max(0, done_days - absent.get(int(eid), 0))
        earned += gross * Decimal(paid_done) / days_in_month
        remaining += gross * Decimal(left_days) / days_in_month

    ot_total, ot_missing = (
        await db.execute(
            select(
                func.coalesce(func.sum(OvertimeEntry.amount), 0),
                func.count(OvertimeEntry.id).filter(OvertimeEntry.amount.is_(None)),
            ).where(
                OvertimeEntry.tenant_id == tenant_id,
                func.upper(OvertimeEntry.status) == "APPROVED",
                OvertimeEntry.work_date >= start,
                OvertimeEntry.work_date <= end,
            )
        )
    ).one()
    proj.earned_to_date = q4(earned)
    proj.remaining = q4(remaining)
    proj.overtime = q4(api_money_to_decimal(ot_total))
    proj.amount = proj.earned_to_date + proj.remaining + proj.overtime
    if proj.employees_without_structure:
        proj.reason_codes.append("EMPLOYEE_WITHOUT_STRUCTURE")
    if int(ot_missing or 0):
        proj.reason_codes.append("OVERTIME_WITHOUT_AMOUNT")
    return proj
