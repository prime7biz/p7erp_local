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


BASIC_COMPONENT_CODES = frozenset({"BD-BASIC", "BASIC"})
MONTHLY_TYPES = frozenset({"FIXED", "PERCENT_OF_BASE"})
HUNDRED = Decimal("100")


@dataclass
class ComponentRow:
    """One active structure line priced for a basic (monthly view, as payroll pays it before loss of pay)."""

    component_id: int
    code: str
    name: str
    component_type: str
    calculation_type: str
    rule_amount: Decimal
    standard_amount: Decimal | None
    amount: Decimal | None
    is_basic: bool
    editable: bool
    overridden: bool


def is_basic_line(line: PayrollStructureLine, comp: PayrollComponent) -> bool:
    """The line that pays the basic itself. Its amount always comes from the assignment's base salary."""
    if (comp.code or "").strip().upper() in BASIC_COMPONENT_CODES:
        return True
    calc = (comp.calculation_type or "FIXED").strip().upper()
    return (
        calc == "PERCENT_OF_BASE"
        and (comp.component_type or "EARNING").strip().upper() != "DEDUCTION"
        and api_money_to_decimal(line.amount) == HUNDRED
    )


def is_overridable_line(line: PayrollStructureLine, comp: PayrollComponent) -> bool:
    """Only monthly earnings other than the basic can get a per-employee amount."""
    calc = (comp.calculation_type or "FIXED").strip().upper()
    return (
        (comp.component_type or "EARNING").strip().upper() != "DEDUCTION"
        and calc in MONTHLY_TYPES
        and not is_basic_line(line, comp)
    )


async def active_structure_lines(
    db: AsyncSession, tenant_id: int, structure_id: int
) -> list[tuple[PayrollStructureLine, PayrollComponent]]:
    """Lines payroll uses: active components only, in payroll order."""
    return list(
        (
            await db.execute(
                select(PayrollStructureLine, PayrollComponent)
                .join(PayrollComponent, PayrollComponent.id == PayrollStructureLine.component_id)
                .where(
                    PayrollStructureLine.tenant_id == tenant_id,
                    PayrollStructureLine.structure_id == structure_id,
                    PayrollComponent.tenant_id == tenant_id,
                    PayrollComponent.is_active.is_(True),
                )
                .order_by(PayrollStructureLine.sort_order.asc(), PayrollStructureLine.id.asc())
            )
        ).all()
    )


def price_lines(
    lines: list[tuple[PayrollStructureLine, PayrollComponent]], basic: Decimal, overrides: dict | None
) -> list[ComponentRow]:
    """Price each line the way payroll does (``_override_payload`` semantics) for a monthly view."""
    from app.modules.hr_payroll.payroll_calculation_service import _override_payload

    rows: list[ComponentRow] = []
    for line, comp in lines:
        rule_amount = api_money_to_decimal(line.amount)
        native = (comp.calculation_type or "FIXED").strip().upper()
        override_amt, override_type = _override_payload(overrides, comp)
        calc = (override_type or native).strip().upper()
        source = override_amt if override_amt is not None else rule_amount

        def monthly(kind: str, value: Decimal) -> Decimal | None:
            if kind == "PERCENT_OF_BASE":
                return (basic * value / HUNDRED).quantize(Decimal("0.01"))
            if kind == "FIXED":
                return value.quantize(Decimal("0.01"))
            return None

        rows.append(
            ComponentRow(
                component_id=comp.id,
                code=comp.code,
                name=comp.name,
                component_type=(comp.component_type or "EARNING").strip().upper(),
                calculation_type=native,
                rule_amount=rule_amount,
                standard_amount=monthly(native, rule_amount),
                amount=monthly(calc, source),
                is_basic=is_basic_line(line, comp),
                editable=is_overridable_line(line, comp),
                overridden=override_amt is not None or override_type is not None,
            )
        )
    return rows


def gross_of(rows: list[ComponentRow]) -> Decimal:
    gross = sum((r.amount for r in rows if r.component_type != "DEDUCTION" and r.amount is not None), Decimal("0"))
    return gross.quantize(Decimal("0.01"))


async def structure_gross(
    db: AsyncSession, tenant_id: int, structure_id: int, basic: Decimal, overrides: dict | None = None
) -> Decimal:
    """Monthly earnings of a structure for a basic: FIXED lines plus PERCENT_OF_BASE lines (with the
    employee's component overrides), deductions and inactive components excluded."""
    return gross_of(price_lines(await active_structure_lines(db, tenant_id, structure_id), basic, overrides))


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
        overrides = asgn.component_overrides if isinstance(asgn.component_overrides, dict) else None
        gross = await structure_gross(db, tenant_id, asgn.structure_id, basic, overrides)
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
