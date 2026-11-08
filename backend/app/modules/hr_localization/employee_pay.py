"""Read an employee's current basic / gross wage and Bangladesh wage grade (no writes)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.orm_numeric import api_money_to_decimal
from app.models.hr import Employee
from app.models.hr_bd import HrBdEmployeeWageAssignment, HrBdWageScheduleRate
from app.models.hr_payroll import PayrollComponent, PayrollStructure, PayrollStructureLine
from app.modules.hr_payroll.payroll_calculation_service import resolve_assignment


@dataclass
class PaySnapshot:
    basic: Decimal
    gross: Decimal
    structure_code: str | None
    assignment_id: int | None
    wage_rate: HrBdWageScheduleRate | None
    wage_rate_source: str | None


async def employee_or_404(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    row = await db.get(Employee, employee_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Employee not found")
    return row


async def active_wage_assignment(
    db: AsyncSession, tenant_id: int, employee_id: int, as_of: date
) -> HrBdEmployeeWageAssignment | None:
    return (
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


async def structure_gross(db: AsyncSession, tenant_id: int, structure_id: int, basic: Decimal) -> Decimal:
    """Monthly earnings of a structure for a basic: FIXED lines plus PERCENT_OF_BASE lines, deductions excluded."""
    lines = (
        await db.execute(
            select(PayrollStructureLine, PayrollComponent)
            .join(PayrollComponent, PayrollComponent.id == PayrollStructureLine.component_id)
            .where(PayrollStructureLine.tenant_id == tenant_id, PayrollStructureLine.structure_id == structure_id)
        )
    ).all()
    gross = Decimal("0")
    for line, comp in lines:
        if (comp.component_type or "").upper() == "DEDUCTION":
            continue
        amount = api_money_to_decimal(line.amount)
        calc = (comp.calculation_type or "FIXED").upper()
        if calc == "PERCENT_OF_BASE":
            gross += basic * amount / Decimal("100")
        elif calc == "FIXED":
            gross += amount
    return gross.quantize(Decimal("0.01"))


async def pay_snapshot(
    db: AsyncSession, tenant_id: int, employee: Employee, as_of: date, rates_by_code: dict[str, HrBdWageScheduleRate]
) -> PaySnapshot:
    asgn = await resolve_assignment(db, tenant_id=tenant_id, employee_id=employee.id, as_of=as_of)
    basic = api_money_to_decimal(asgn.base_salary) if asgn and asgn.base_salary is not None else Decimal("0")
    gross = Decimal("0")
    code: str | None = None
    if asgn is not None:
        structure = await db.get(PayrollStructure, asgn.structure_id)
        code = structure.code if structure and structure.tenant_id == tenant_id else None
        gross = await structure_gross(db, tenant_id, asgn.structure_id, basic)
    rate: HrBdWageScheduleRate | None = None
    source: str | None = None
    wa = await active_wage_assignment(db, tenant_id, employee.id, as_of)
    if wa is not None:
        rate = await db.get(HrBdWageScheduleRate, wa.wage_rate_id)
        if rate is not None and rate.tenant_id != tenant_id:
            rate = None
        source = "wage_assignment" if rate else None
    elif code and code.startswith("BD-") and code[3:] in rates_by_code:
        rate, source = rates_by_code[code[3:]], "structure_code"
    return PaySnapshot(basic, gross.quantize(Decimal("0.01")), code, asgn.id if asgn else None, rate, source)
