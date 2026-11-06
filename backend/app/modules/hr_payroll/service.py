"""Payroll calculation helpers and Phase 1.4 auto-calculate service."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.orm_numeric import api_money_to_decimal, decimal_to_money_response
from app.common.tenant_feature_keys import (
    is_payroll_auto_calculate_enabled,
    is_payroll_lop_enabled,
    is_payroll_ot_from_salary_enabled,
)
from app.models import (
    Employee,
    PayrollCalculationSnapshot,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
    Tenant,
)
from app.modules.hr_payroll.formula_engine import (
    assert_valid_calculation_type,
    quantize_money,
)
from app.modules.hr_payroll.payroll_calculation_service import (
    EmployeeCalcPreview,
    calculate_employee_payroll,
)


def sum_payroll_lines_net(lines: list[dict]) -> float:
    total = 0.0
    for ln in lines:
        try:
            total += float(ln.get("net_pay") or 0)
        except (TypeError, ValueError):
            continue
    return round(total, 2)


def _ranges_overlap(
    a_from: date,
    a_to: date | None,
    b_from: date,
    b_to: date | None,
) -> bool:
    """True when two effective ranges overlap (null end = open-ended)."""
    a_end = a_to or date.max
    b_end = b_to or date.max
    return a_from <= b_end and b_from <= a_end


def assignment_covers(asgn: PayrollEmployeeStructureAssignment, as_of: date) -> bool:
    if asgn.effective_from > as_of:
        return False
    if asgn.effective_to is not None and asgn.effective_to < as_of:
        return False
    return True


async def assert_no_overlapping_assignment(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee_id: int,
    effective_from: date,
    effective_to: date | None,
    exclude_id: int | None = None,
) -> None:
    stmt = select(PayrollEmployeeStructureAssignment).where(
        PayrollEmployeeStructureAssignment.tenant_id == tenant_id,
        PayrollEmployeeStructureAssignment.employee_id == employee_id,
    )
    if exclude_id is not None:
        stmt = stmt.where(PayrollEmployeeStructureAssignment.id != exclude_id)
    rows = (await db.execute(stmt)).scalars().all()
    for row in rows:
        if _ranges_overlap(effective_from, effective_to, row.effective_from, row.effective_to):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Overlapping payroll structure assignment for this employee. "
                    "Close the previous assignment (set effective_to) before opening a new one."
                ),
            )


def _validate_component_overrides(component_overrides: dict | None) -> dict | None:
    if component_overrides is None:
        return None
    if not isinstance(component_overrides, dict):
        raise HTTPException(status_code=400, detail="component_overrides must be an object")
    cleaned: dict[str, Any] = {}
    for key, raw in component_overrides.items():
        if isinstance(raw, dict):
            ftype = raw.get("formula_type") or raw.get("calculation_type")
            if ftype is not None:
                try:
                    assert_valid_calculation_type(str(ftype))
                except ValueError as exc:
                    raise HTTPException(status_code=400, detail=str(exc)) from exc
            cleaned[str(key)] = raw
        else:
            cleaned[str(key)] = raw
    return cleaned


async def create_structure_assignment(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee_id: int,
    structure_id: int,
    effective_from: date,
    effective_to: date | None,
    base_salary: str | None,
    component_overrides: dict | None,
    created_by: int | None,
) -> PayrollEmployeeStructureAssignment:
    if effective_to is not None and effective_to < effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on/after effective_from")

    emp = await db.get(Employee, employee_id)
    if not emp or emp.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Employee not found")
    structure = await db.get(PayrollStructure, structure_id)
    if not structure or structure.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Payroll structure not found")

    await assert_no_overlapping_assignment(
        db,
        tenant_id=tenant_id,
        employee_id=employee_id,
        effective_from=effective_from,
        effective_to=effective_to,
    )
    from app.modules.hr_localization.enforcement_service import assert_base_salary_meets_grade

    tenant_row = await db.get(Tenant, tenant_id)
    await assert_base_salary_meets_grade(
        db,
        tenant=tenant_row,
        employee_id=employee_id,
        base_salary=api_money_to_decimal(base_salary) if base_salary is not None else None,
        as_of=effective_from,
    )

    row = PayrollEmployeeStructureAssignment(
        tenant_id=tenant_id,
        employee_id=employee_id,
        structure_id=structure_id,
        effective_from=effective_from,
        effective_to=effective_to,
        base_salary=api_money_to_decimal(base_salary) if base_salary is not None else None,
        component_overrides=_validate_component_overrides(component_overrides),
        created_by=created_by,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


async def list_structure_assignments(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee_id: int | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[PayrollEmployeeStructureAssignment]:
    stmt = select(PayrollEmployeeStructureAssignment).where(
        PayrollEmployeeStructureAssignment.tenant_id == tenant_id
    )
    if employee_id is not None:
        stmt = stmt.where(PayrollEmployeeStructureAssignment.employee_id == employee_id)
    stmt = (
        stmt.order_by(
            PayrollEmployeeStructureAssignment.employee_id.asc(),
            PayrollEmployeeStructureAssignment.effective_from.desc(),
        )
        .offset(offset)
        .limit(limit)
    )
    return list((await db.execute(stmt)).scalars().all())


async def end_structure_assignment(
    db: AsyncSession,
    *,
    tenant_id: int,
    assignment_id: int,
    effective_to: date | None = None,
) -> PayrollEmployeeStructureAssignment:
    row = await db.get(PayrollEmployeeStructureAssignment, assignment_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Assignment not found")
    end = effective_to or today_local(await db.get(Tenant, tenant_id))
    if end < row.effective_from:
        raise HTTPException(status_code=400, detail="effective_to must be on/after effective_from")
    row.effective_to = end
    row.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return row


@dataclass
class AutoCalculatePreview:
    run_id: int
    period_id: int
    as_of: date
    existing_line_count: int
    requires_overwrite_confirm: bool
    employees: list[EmployeeCalcPreview]
    missing_assignment_employee_ids: list[int]
    warnings: list[str] = field(default_factory=list)
    lop_applied: bool = False
    ot_from_salary: bool = False


async def _first_calculation_trace(db: AsyncSession, *, tenant: Tenant, run: PayrollRun) -> dict | None:
    """Trace of the run's FIRST auto-calculation ({} when it has none), or None if never auto-calculated."""
    first_trace = (
        await db.execute(
            select(PayrollCalculationSnapshot.trace_json)
            .join(PayrollRunLine, PayrollRunLine.id == PayrollCalculationSnapshot.payroll_run_line_id)
            .where(
                PayrollCalculationSnapshot.tenant_id == tenant.id,
                PayrollRunLine.run_id == run.id,
            )
            .order_by(PayrollCalculationSnapshot.id.asc())
            .limit(1)
        )
    ).first()
    if first_trace is None:
        return None
    return first_trace[0] if isinstance(first_trace[0], dict) else {}


async def run_applies_lop(db: AsyncSession, *, tenant: Tenant, run: PayrollRun) -> bool:
    """Should loss of pay be applied when this run is (re)calculated?

    The mode is fixed by the run's FIRST auto-calculation, so numbers of a run calculated before
    loss of pay existed never change on a recalculation. Runs never auto-calculated use the flag.
    """
    if not is_payroll_lop_enabled(tenant.feature_flags):
        return False
    trace = await _first_calculation_trace(db, tenant=tenant, run=run)
    if trace is None:
        return True
    return trace.get("lop_applied") is True


async def run_applies_ot_from_salary(db: AsyncSession, *, tenant: Tenant, run: PayrollRun) -> bool:
    """Should overtime be priced from salary when this run is (re)calculated?

    Same rule as ``run_applies_lop``: the run's first auto-calculation fixes the mode, so a run
    calculated before the flag was switched on keeps its overtime numbers.
    """
    if not is_payroll_ot_from_salary_enabled(tenant.feature_flags):
        return False
    trace = await _first_calculation_trace(db, tenant=tenant, run=run)
    if trace is None:
        return True
    return trace.get("ot_from_salary") is True


def _line_is_manual(line: PayrollRunLine) -> bool:
    src = (line.calculation_source or "MANUAL").strip().upper()
    if src == "AUTO":
        return False
    return True


def _assert_run_editable(run: PayrollRun, period: PayrollPeriod) -> None:
    if period.is_locked or (period.status or "").upper() == "FINALIZED":
        raise HTTPException(status_code=400, detail="Payroll period is locked; auto-calculate rejected")
    if (run.status or "").upper() not in {"DRAFT", "CHECKED", "REJECTED"}:
        raise HTTPException(
            status_code=400,
            detail=f"Run status {run.status} cannot be auto-calculated (must be DRAFT/CHECKED/REJECTED)",
        )


def _require_auto_calc_flag(tenant: Tenant) -> None:
    if not is_payroll_auto_calculate_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                "Payroll auto-calculation is disabled. "
                "Enable 'payroll_auto_calculate_enabled' in Settings → Configuration."
            ),
        )


async def preview_auto_calculate(
    db: AsyncSession,
    *,
    tenant: Tenant,
    run_id: int,
    require_feature_flag: bool = True,
) -> AutoCalculatePreview:
    if require_feature_flag:
        _require_auto_calc_flag(tenant)

    run = await db.get(PayrollRun, run_id)
    if not run or run.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll run not found")
    period = await db.get(PayrollPeriod, run.period_id)
    if not period or period.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Payroll period not found")
    _assert_run_editable(run, period)

    as_of = run.run_date
    existing = (
        await db.execute(
            select(PayrollRunLine).where(
                PayrollRunLine.tenant_id == tenant.id,
                PayrollRunLine.run_id == run.id,
            )
        )
    ).scalars().all()
    existing_by_emp = {ln.employee_id: ln for ln in existing}
    existing_count = len(existing)
    manual_count = sum(1 for ln in existing if _line_is_manual(ln))

    apply_lop = await run_applies_lop(db, tenant=tenant, run=run)
    emp_stmt = select(Employee).where(Employee.tenant_id == tenant.id)
    if apply_lop:
        # Everyone employed for at least one day of the period, including people who left during it.
        emp_stmt = emp_stmt.where(
            or_(Employee.joining_date.is_(None), Employee.joining_date <= period.end_date),
            or_(
                and_(
                    Employee.is_active.is_(True),
                    or_(Employee.exit_date.is_(None), Employee.exit_date >= period.start_date),
                ),
                and_(
                    Employee.exit_date.is_not(None),
                    Employee.exit_date >= period.start_date,
                    Employee.exit_date <= period.end_date,
                ),
            ),
        )
    else:
        emp_stmt = emp_stmt.where(Employee.is_active.is_(True))
    employees = (await db.execute(emp_stmt.order_by(Employee.id))).scalars().all()

    previews: list[EmployeeCalcPreview] = []
    missing: list[int] = []
    global_warnings: list[str] = []
    if not apply_lop and is_payroll_lop_enabled(tenant.feature_flags):
        global_warnings.append(
            "This run was first calculated before loss of pay was switched on, so it keeps the old "
            "calculation (absences and mid-period joiners / leavers are not prorated)"
        )
    apply_ot_from_salary = await run_applies_ot_from_salary(db, tenant=tenant, run=run)
    if not apply_ot_from_salary and is_payroll_ot_from_salary_enabled(tenant.feature_flags):
        global_warnings.append(
            "This run was first calculated before overtime from salary was switched on, so it keeps "
            "the old overtime calculation"
        )

    for emp in employees:
        existing_line = existing_by_emp.get(emp.id)
        has_manual = existing_line is not None and _line_is_manual(existing_line)
        row = await calculate_employee_payroll(
            db,
            tenant_id=tenant.id,
            employee=emp,
            period=period,
            as_of=as_of,
            has_manual_override=has_manual,
            apply_lop=apply_lop,
            ot_from_salary=apply_ot_from_salary,
            run_line_id=existing_line.id if existing_line is not None else None,
        )
        previews.append(row)
        if row.skipped and row.skip_reason == "missing_assignment":
            missing.append(emp.id)

    if missing:
        global_warnings.append(f"{len(missing)} active employee(s) have no effective structure assignment")
    if manual_count > 0:
        global_warnings.append(
            f"{manual_count} manual line(s) will be preserved unless force=true"
        )

    return AutoCalculatePreview(
        run_id=run.id,
        period_id=period.id,
        as_of=as_of,
        existing_line_count=existing_count,
        requires_overwrite_confirm=manual_count > 0,
        employees=previews,
        missing_assignment_employee_ids=missing,
        warnings=global_warnings,
        lop_applied=apply_lop,
        ot_from_salary=apply_ot_from_salary,
    )


async def apply_auto_calculate(
    db: AsyncSession,
    *,
    tenant: Tenant,
    run_id: int,
    employee_ids: list[int] | None = None,
    force: bool = False,
    overwrite_confirm: bool = False,
    created_by: int | None = None,
) -> dict[str, Any]:
    """Apply auto-calc for selected employees. Preserves MANUAL lines unless force=true."""
    _require_auto_calc_flag(tenant)
    force_overwrite = bool(force or overwrite_confirm)

    preview = await preview_auto_calculate(
        db, tenant=tenant, run_id=run_id, require_feature_flag=False
    )

    run = await db.get(PayrollRun, run_id)
    assert run is not None

    existing = (
        await db.execute(
            select(PayrollRunLine).where(
                PayrollRunLine.tenant_id == tenant.id,
                PayrollRunLine.run_id == run.id,
            )
        )
    ).scalars().all()
    existing_by_emp = {ln.employee_id: ln for ln in existing}

    selected: set[int] | None = set(employee_ids) if employee_ids is not None else None

    from app.modules.hr_localization.enforcement_service import assert_minimum_wage_for_payroll
    from app.modules.hr_localization.payroll_extras import link_extras

    await assert_minimum_wage_for_payroll(
        db,
        tenant=tenant,
        as_of=run.run_date,
        employee_ids=[
            p.employee_id for p in preview.employees
            if not p.skipped and (selected is None or p.employee_id in selected)
        ],
    )

    applied = 0
    skipped = 0
    skip_warnings: list[str] = list(preview.warnings)

    for emp_prev in preview.employees:
        if selected is not None and emp_prev.employee_id not in selected:
            continue
        if emp_prev.skipped:
            skipped += 1
            continue

        existing_line = existing_by_emp.get(emp_prev.employee_id)
        if existing_line is not None and _line_is_manual(existing_line) and not force_overwrite:
            skipped += 1
            skip_warnings.append(
                f"Employee {emp_prev.employee_code}: manual override preserved (pass force=true to overwrite)"
            )
            continue

        if existing_line is not None:
            line = existing_line
            line.structure_id = emp_prev.structure_id
            line.gross_pay = api_money_to_decimal(emp_prev.gross_pay)
            line.deductions = api_money_to_decimal(emp_prev.deductions)
            line.net_pay = api_money_to_decimal(emp_prev.net_pay)
            line.overtime_amount = api_money_to_decimal(emp_prev.overtime_amount)
            line.remarks = "AUTO: structure assignment calc"
            line.calculation_source = "AUTO"
            line.updated_at = datetime.utcnow()
        else:
            line = PayrollRunLine(
                tenant_id=tenant.id,
                run_id=run.id,
                employee_id=emp_prev.employee_id,
                structure_id=emp_prev.structure_id,
                gross_pay=api_money_to_decimal(emp_prev.gross_pay),
                deductions=api_money_to_decimal(emp_prev.deductions),
                net_pay=api_money_to_decimal(emp_prev.net_pay),
                overtime_amount=api_money_to_decimal(emp_prev.overtime_amount),
                remarks="AUTO: structure assignment calc",
                calculation_source="AUTO",
            )
            db.add(line)
            await db.flush()

        await link_extras(
            db,
            tenant_id=tenant.id,
            run_line_id=line.id,
            sources=(emp_prev.trace or {}).get("bd_extra_sources") or {},
        )
        snap = PayrollCalculationSnapshot(
            tenant_id=tenant.id,
            payroll_run_line_id=line.id,
            attendance_days=api_money_to_decimal(emp_prev.days_present),
            absent_days=api_money_to_decimal(emp_prev.absent_days),
            late_days=api_money_to_decimal(emp_prev.late_days),
            leave_days_paid=api_money_to_decimal(emp_prev.paid_leave_days),
            leave_days_unpaid=api_money_to_decimal(emp_prev.unpaid_leave_days),
            ot_hours=api_money_to_decimal(emp_prev.ot_hours),
            base_salary_applied=api_money_to_decimal(emp_prev.base_salary),
            structure_id=emp_prev.structure_id,
            calculation_source="AUTO",
            trace_json=emp_prev.trace or None,
        )
        db.add(snap)
        applied += 1

    await db.flush()
    lines = (
        await db.execute(
            select(PayrollRunLine).where(
                PayrollRunLine.tenant_id == tenant.id,
                PayrollRunLine.run_id == run.id,
            )
        )
    ).scalars().all()
    run.gross_total = quantize_money(sum((api_money_to_decimal(x.gross_pay) for x in lines), Decimal("0")))
    run.deduction_total = quantize_money(
        sum((api_money_to_decimal(x.deductions) for x in lines), Decimal("0"))
    )
    run.net_total = quantize_money(sum((api_money_to_decimal(x.net_pay) for x in lines), Decimal("0")))
    run.updated_at = datetime.utcnow()
    _ = created_by
    await db.commit()
    await db.refresh(run)

    return {
        "run_id": run.id,
        "applied": applied,
        "skipped": skipped,
        "gross_total": decimal_to_money_response(run.gross_total),
        "deduction_total": decimal_to_money_response(run.deduction_total),
        "net_total": decimal_to_money_response(run.net_total),
        "preview_warnings": skip_warnings,
        "missing_assignment_employee_ids": preview.missing_assignment_employee_ids,
    }
