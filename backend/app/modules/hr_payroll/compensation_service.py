"""Effective-dated employee compensation: payroll structure assignments and Bangladesh wage grades.

Every write to ``hr_payroll_employee_structure_assignments`` or ``hr_bd_employee_wage_assignments``
goes through these helpers. Each one starts with ``lock_employee`` (``SELECT ... FOR UPDATE`` on the
employee row), so two writers for the same employee are serialized and the overlap checks below see
committed rows. Lock order is always employee first, then assignment rows.

Nothing here commits; the caller owns the transaction. Effective ranges are inclusive.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant
from app.models.hr import Employee
from app.models.hr_bd import HrBdEmployeeWageAssignment, HrBdRuleSet, HrBdWageScheduleRate
from app.models.hr_payroll import PayrollEmployeeStructureAssignment, PayrollPeriod, PayrollStructure
from app.modules.hr_localization.employee_pay import structure_gross

MONEY_PLACES = Decimal("0.01")
# Salary columns are Numeric(18, 4): 14 digits before the point.
MAX_MONEY = Decimal("1e12")


async def lock_employee(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    emp = (
        await db.execute(
            select(Employee)
            .where(Employee.id == employee_id, Employee.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if emp is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    return emp


def parse_money(value: str | Decimal | None, label: str = "base_salary") -> Decimal | None:
    if value is None or (isinstance(value, str) and not value.strip()):
        return None
    try:
        amount = Decimal(str(value).strip())
        if not amount.is_finite() or amount < 0:
            raise HTTPException(status_code=400, detail=f"{label} must be zero or more")
        if amount >= MAX_MONEY:
            raise HTTPException(status_code=400, detail=f"{label} is too large")
        return amount.quantize(MONEY_PLACES)
    except (InvalidOperation, ValueError):
        raise HTTPException(status_code=400, detail=f"{label} must be a decimal number") from None


async def structure_for_tenant(db: AsyncSession, tenant_id: int, structure_id: int) -> PayrollStructure:
    structure = await db.get(PayrollStructure, structure_id)
    if not structure or structure.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Payroll structure not found")
    return structure


async def approved_wage_rate(
    db: AsyncSession, tenant_id: int, wage_rate_id: int, effective_from: date
) -> HrBdWageScheduleRate:
    rate = await db.get(HrBdWageScheduleRate, wage_rate_id)
    if rate is None or rate.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Wage rate not found")
    rule_set = await db.get(HrBdRuleSet, rate.rule_set_id)
    if rule_set is None or rule_set.tenant_id != tenant_id or rule_set.status != "APPROVED":
        raise HTTPException(status_code=409, detail="The wage rate belongs to a rule set that is not approved")
    if effective_from < rate.effective_from:
        raise HTTPException(status_code=400, detail="effective_from is before the wage rate's effective date")
    if rate.effective_to is not None and effective_from > rate.effective_to:
        raise HTTPException(status_code=400, detail="effective_from is after the wage rate's end date")
    return rate


async def _structure_rows(db: AsyncSession, tenant_id: int, employee_id: int) -> list[PayrollEmployeeStructureAssignment]:
    return list(
        (
            await db.execute(
                select(PayrollEmployeeStructureAssignment)
                .where(
                    PayrollEmployeeStructureAssignment.tenant_id == tenant_id,
                    PayrollEmployeeStructureAssignment.employee_id == employee_id,
                )
                .order_by(PayrollEmployeeStructureAssignment.effective_from)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )


async def _wage_rows(db: AsyncSession, tenant_id: int, employee_id: int) -> list[HrBdEmployeeWageAssignment]:
    return list(
        (
            await db.execute(
                select(HrBdEmployeeWageAssignment)
                .where(
                    HrBdEmployeeWageAssignment.tenant_id == tenant_id,
                    HrBdEmployeeWageAssignment.employee_id == employee_id,
                )
                .order_by(HrBdEmployeeWageAssignment.effective_from)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )


def _overlaps(a_from: date, a_to: date | None, b_from: date, b_to: date | None) -> bool:
    return a_from <= (b_to or date.max) and b_from <= (a_to or date.max)


async def insert_structure_assignment(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee_id: int,
    structure_id: int,
    effective_from: date,
    effective_to: date | None,
    base_salary: Decimal | None,
    component_overrides: dict | None,
    created_by: int | None,
) -> PayrollEmployeeStructureAssignment:
    """Caller must hold ``lock_employee`` for this employee."""
    if effective_to is not None and effective_to < effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on/after effective_from")
    await structure_for_tenant(db, tenant_id, structure_id)
    for row in await _structure_rows(db, tenant_id, employee_id):
        if _overlaps(effective_from, effective_to, row.effective_from, row.effective_to):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Overlapping payroll structure assignment for this employee. "
                    "Close the previous assignment (set effective_to) before opening a new one."
                ),
            )
    row = PayrollEmployeeStructureAssignment(
        tenant_id=tenant_id,
        employee_id=employee_id,
        structure_id=structure_id,
        effective_from=effective_from,
        effective_to=effective_to,
        base_salary=base_salary,
        component_overrides=component_overrides,
        created_by=created_by,
    )
    db.add(row)
    await db.flush()
    return row


async def close_structure_assignment(
    db: AsyncSession, *, tenant_id: int, assignment_id: int, effective_to: date
) -> PayrollEmployeeStructureAssignment:
    """Locks the owning employee, then the assignment row."""
    probe = await db.get(PayrollEmployeeStructureAssignment, assignment_id)
    if not probe or probe.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    await lock_employee(db, tenant_id, probe.employee_id)
    row = (
        await db.execute(
            select(PayrollEmployeeStructureAssignment)
            .where(
                PayrollEmployeeStructureAssignment.id == assignment_id,
                PayrollEmployeeStructureAssignment.tenant_id == tenant_id,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if effective_to < row.effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on/after effective_from")
    row.effective_to = effective_to
    row.updated_at = datetime.utcnow()
    await db.flush()
    return row


async def insert_wage_assignment(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee_id: int,
    rate: HrBdWageScheduleRate,
    effective_from: date,
    created_by: int | None,
) -> HrBdEmployeeWageAssignment:
    """Caller must hold ``lock_employee``. Any row still open on or after ``effective_from`` blocks."""
    for row in await _wage_rows(db, tenant_id, employee_id):
        if row.effective_to is None or row.effective_to >= effective_from:
            raise HTTPException(
                status_code=409, detail="Employee already has a wage grade covering this date; end it first"
            )
    row = HrBdEmployeeWageAssignment(
        tenant_id=tenant_id,
        employee_id=employee_id,
        wage_rate_id=rate.id,
        effective_from=effective_from,
        created_by=created_by,
    )
    db.add(row)
    await db.flush()
    return row


async def close_wage_assignment(
    db: AsyncSession, *, tenant_id: int, assignment_id: int, effective_to: date, ended_by: int | None
) -> HrBdEmployeeWageAssignment:
    """Locks the owning employee, then the wage assignment row."""
    probe = await db.get(HrBdEmployeeWageAssignment, assignment_id)
    if not probe or probe.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Wage assignment not found")
    await lock_employee(db, tenant_id, probe.employee_id)
    row = (
        await db.execute(
            select(HrBdEmployeeWageAssignment)
            .where(HrBdEmployeeWageAssignment.id == assignment_id, HrBdEmployeeWageAssignment.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    if row.effective_to is not None:
        raise HTTPException(status_code=409, detail="Wage assignment already ended")
    if effective_to < row.effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on or after effective_from")
    row.effective_to, row.ended_by, row.ended_at = effective_to, ended_by, datetime.utcnow()
    await db.flush()
    return row


@dataclass
class CompensationResult:
    structure_assignment: PayrollEmployeeStructureAssignment
    wage_assignment: HrBdEmployeeWageAssignment | None
    wage_rate: HrBdWageScheduleRate | None
    basic: Decimal
    gross: Decimal
    closed_structure_assignment_ids: list[int]
    closed_wage_assignment_ids: list[int]


def audit_details(result: "CompensationResult", effective_from: date) -> str:
    """Audit text without amounts: the audit log is readable with settings access, salaries are not."""
    return (
        f"structure_assignment={result.structure_assignment.id} structure={result.structure_assignment.structure_id} "
        f"from={effective_from.isoformat()} grade={result.wage_rate.rate_code if result.wage_rate else '-'} "
        f"closed_structures={result.closed_structure_assignment_ids} closed_grades={result.closed_wage_assignment_ids}"
    )


async def preview_compensation(
    db: AsyncSession,
    *,
    tenant_id: int,
    structure_id: int,
    rate: HrBdWageScheduleRate | None,
    base_salary: Decimal | None,
) -> tuple[Decimal, Decimal]:
    """Prospective (basic, gross); raises 400 below the grade's legal minimum basic or gross."""
    await structure_for_tenant(db, tenant_id, structure_id)
    basic = base_salary
    if basic is None and rate is not None:
        basic = Decimal(rate.basic).quantize(MONEY_PLACES)
    if basic is None:
        raise HTTPException(status_code=400, detail="Enter a base salary or choose a Bangladesh wage grade")
    gross = await structure_gross(db, tenant_id, structure_id, basic)
    if rate is not None:
        if basic < Decimal(rate.basic):
            raise HTTPException(
                status_code=400,
                detail=f"Basic {basic} is below the {rate.rate_code} minimum basic {rate.basic} (Bangladesh minimum wage)",
            )
        if gross < Decimal(rate.gross):
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Gross {gross} from this salary structure is below the {rate.rate_code} minimum gross "
                    f"{rate.gross} (Bangladesh minimum wage)"
                ),
            )
    return basic, gross


async def replace_employee_compensation(
    db: AsyncSession,
    *,
    tenant: Tenant,
    employee_id: int,
    structure_id: int,
    bd_wage_rate_id: int | None,
    base_salary: str | Decimal | None,
    effective_from: date,
    actor_id: int | None,
) -> CompensationResult:
    """Open a new structure (and optionally wage-grade) window from ``effective_from``.

    Prior open windows close at ``effective_from - 1 day``. A window that already starts on or
    after ``effective_from`` is never overwritten (no backdating, no clash with future rows).
    The grade in force (selected, else the one already covering ``effective_from``) is checked
    on both basic and gross whatever the tenant's payroll enforcement flag says.
    """
    tenant_id = tenant.id
    emp = await lock_employee(db, tenant_id, employee_id)
    if emp.joining_date is not None and effective_from < emp.joining_date:
        raise HTTPException(status_code=400, detail="The salary cannot start before the joining date")
    locked_until = (
        await db.execute(
            select(func.max(PayrollPeriod.end_date)).where(
                PayrollPeriod.tenant_id == tenant_id,
                PayrollPeriod.is_locked.is_(True),
                PayrollPeriod.end_date >= effective_from,
            )
        )
    ).scalar_one_or_none()
    if locked_until is not None:
        raise HTTPException(
            status_code=400,
            detail=f"Payroll is finalized up to {locked_until.isoformat()}; the new salary must start after that date",
        )
    await structure_for_tenant(db, tenant_id, structure_id)
    amount = parse_money(base_salary)

    structure_rows = await _structure_rows(db, tenant_id, employee_id)
    wage_rows = await _wage_rows(db, tenant_id, employee_id)
    for row in structure_rows:
        if row.effective_from >= effective_from:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A salary assignment already starts on {row.effective_from.isoformat()}. "
                    "Choose an effective date after it."
                ),
            )

    covering_wage = next(
        (r for r in wage_rows if r.effective_from <= effective_from and (r.effective_to is None or r.effective_to >= effective_from)),
        None,
    )
    new_rate: HrBdWageScheduleRate | None = None
    if bd_wage_rate_id is not None:
        new_rate = await approved_wage_rate(db, tenant_id, bd_wage_rate_id, effective_from)
        replace_wage = covering_wage is None or covering_wage.wage_rate_id != new_rate.id
        if replace_wage:
            for row in wage_rows:
                if row.effective_from >= effective_from:
                    raise HTTPException(
                        status_code=409,
                        detail=(
                            f"A wage grade already starts on {row.effective_from.isoformat()}. "
                            "Choose an effective date after it."
                        ),
                    )
        rate_in_force = new_rate
    else:
        replace_wage = False
        rate_in_force = None
        if covering_wage is not None:
            rate_in_force = await db.get(HrBdWageScheduleRate, covering_wage.wage_rate_id)
            if rate_in_force is not None and rate_in_force.tenant_id != tenant_id:
                rate_in_force = None

    basic, gross = await preview_compensation(
        db, tenant_id=tenant_id, structure_id=structure_id, rate=rate_in_force, base_salary=amount
    )

    day_before = effective_from - timedelta(days=1)
    closed_structures: list[int] = []
    for row in structure_rows:
        if row.effective_to is None or row.effective_to >= effective_from:
            row.effective_to = day_before
            row.updated_at = datetime.utcnow()
            closed_structures.append(row.id)
    closed_wages: list[int] = []
    wage_assignment: HrBdEmployeeWageAssignment | None = None
    if replace_wage and new_rate is not None:
        for row in wage_rows:
            if row.effective_to is None or row.effective_to >= effective_from:
                row.effective_to, row.ended_by, row.ended_at = day_before, actor_id, datetime.utcnow()
                closed_wages.append(row.id)
        await db.flush()
        wage_assignment = await insert_wage_assignment(
            db,
            tenant_id=tenant_id,
            employee_id=employee_id,
            rate=new_rate,
            effective_from=effective_from,
            created_by=actor_id,
        )
    elif covering_wage is not None and new_rate is not None:
        wage_assignment = covering_wage
    await db.flush()

    structure_assignment = await insert_structure_assignment(
        db,
        tenant_id=tenant_id,
        employee_id=employee_id,
        structure_id=structure_id,
        effective_from=effective_from,
        effective_to=None,
        base_salary=basic,
        component_overrides=None,
        created_by=actor_id,
    )
    return CompensationResult(
        structure_assignment=structure_assignment,
        wage_assignment=wage_assignment,
        wage_rate=rate_in_force,
        basic=basic,
        gross=gross,
        closed_structure_assignment_ids=closed_structures,
        closed_wage_assignment_ids=closed_wages,
    )


async def wage_rate_in_force(
    db: AsyncSession, tenant_id: int, employee_id: int, as_of: date
) -> tuple[HrBdEmployeeWageAssignment | None, HrBdWageScheduleRate | None]:
    row = (
        await db.execute(
            select(HrBdEmployeeWageAssignment)
            .where(
                HrBdEmployeeWageAssignment.tenant_id == tenant_id,
                HrBdEmployeeWageAssignment.employee_id == employee_id,
                HrBdEmployeeWageAssignment.effective_from <= as_of,
                or_(HrBdEmployeeWageAssignment.effective_to.is_(None), HrBdEmployeeWageAssignment.effective_to >= as_of),
            )
            .order_by(HrBdEmployeeWageAssignment.effective_from.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is None:
        return None, None
    rate = await db.get(HrBdWageScheduleRate, row.wage_rate_id)
    if rate is None or rate.tenant_id != tenant_id:
        return row, None
    return row, rate
