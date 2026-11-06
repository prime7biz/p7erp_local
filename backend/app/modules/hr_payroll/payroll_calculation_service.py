"""Phase 1.4 payroll calculation service — safe formula preview per employee.

Does not persist run lines; callers (preview/apply) own that.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.orm_numeric import api_money_to_decimal, decimal_to_money_response
from app.models import (
    AttendanceEntry,
    Employee,
    LeaveRequest,
    LeaveType,
    OvertimeEntry,
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollStructureLine,
)
from app.models.tenant import Tenant
from app.modules.hr_leave.leave_days import each_date, non_working_dates
from app.modules.hr_payroll.formula_engine import (
    OUTPUT_BASED_TYPES,
    PERIOD_SALARY_TYPES,
    assert_valid_calculation_type,
    calculate_component_amount,
    prorate_amount,
    quantize_money,
)


@dataclass
class ComponentCalcLine:
    component_id: int
    component_code: str
    component_name: str
    component_type: str
    calculation_type: str
    amount: str
    source_amount: str
    is_statutory: bool = False
    statutory_kind: str | None = None  # PF_EE | PF_ER | ESI_EE | ESI_ER | PT | GRATUITY


@dataclass
class EmployeeCalcPreview:
    employee_id: int
    employee_code: str
    employee_name: str
    structure_id: int | None
    assignment_id: int | None
    base_salary: str
    days_present: str
    absent_days: str
    late_days: str
    ot_hours: str
    paid_leave_days: str
    unpaid_leave_days: str
    gross_pay: str
    deductions: str
    net_pay: str
    overtime_amount: str
    components: list[ComponentCalcLine] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    skipped: bool = False
    skip_reason: str | None = None
    status: str = "Ready"  # Ready | Missing Assignment | Manual Override Exists
    has_manual_override: bool = False
    calculation_source: str = "AUTO"
    trace: dict[str, Any] = field(default_factory=dict)
    # Piece-rate output (shop-floor scans where operator_code = employee_code); 0 when not used.
    pieces: str = "0.0000"
    earned_minutes: str = "0.0000"
    pay_basis: str = "SALARY"  # SALARY | DAILY | PIECE (derived from the structure's components)
    # Loss of pay (flag payroll_lop_enabled). All zero when lop_applied is False.
    lop_applied: bool = False
    period_days: str = "0.0000"
    employed_days: str = "0.0000"  # days in the period between joining and exit date
    payable_days: str = "0.0000"  # employed days minus loss-of-pay days
    lop_days: str = "0.0000"  # unpaid absences + unpaid leave days
    lop_absent_days: str = "0.0000"
    lop_unpaid_leave_days: str = "0.0000"
    lop_amount: str = "0.0000"  # salary not paid because of LOP / partial employment


def _employee_display_name(employee: Employee) -> str:
    parts = [p for p in [employee.first_name, employee.last_name] if p]
    return " ".join(parts) if parts else employee.employee_code


def _override_payload(overrides: dict | None, component: PayrollComponent) -> tuple[Decimal | None, str | None]:
    """Return (amount override, formula_type override) from assignment overrides."""
    if not isinstance(overrides, dict):
        return None, None
    raw = overrides.get(component.code)
    if raw is None:
        raw = overrides.get(str(component.id))
    if raw is None:
        return None, None
    if isinstance(raw, dict):
        amount = api_money_to_decimal(raw.get("amount")) if raw.get("amount") is not None else None
        ftype = raw.get("formula_type") or raw.get("calculation_type")
        return amount, str(ftype) if ftype is not None else None
    return api_money_to_decimal(raw), None


async def piece_output_in_period(
    db: AsyncSession, *, tenant_id: int, employee_code: str, start: date, end: date
) -> tuple[Decimal, Decimal]:
    """(pieces, standard minutes earned) from shop-floor bundle scans for one worker.

    Scans carry the operator code typed / scanned at the station; it must match the employee code.
    """
    from datetime import datetime, time

    from sqlalchemy import func

    from app.models.shop_floor_scan import BundleOperationScan

    code = (employee_code or "").strip().lower()
    if not code:
        return Decimal("0"), Decimal("0")
    pieces, minutes = (
        await db.execute(
            select(
                func.coalesce(func.sum(BundleOperationScan.pieces), 0),
                func.coalesce(func.sum(BundleOperationScan.pieces * BundleOperationScan.smv), 0),
            ).where(
                BundleOperationScan.tenant_id == tenant_id,
                func.lower(func.trim(BundleOperationScan.operator_code)) == code,
                BundleOperationScan.scanned_at >= datetime.combine(start, time.min),
                BundleOperationScan.scanned_at <= datetime.combine(end, time.max),
            )
        )
    ).one()
    return Decimal(str(pieces or 0)), Decimal(str(minutes or 0))


async def count_present_days(
    db: AsyncSession, *, tenant_id: int, employee_id: int, start: date, end: date
) -> Decimal:
    rows = (
        await db.execute(
            select(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant_id,
                AttendanceEntry.employee_id == employee_id,
                AttendanceEntry.attendance_date >= start,
                AttendanceEntry.attendance_date <= end,
                # LATE is a worked day (late penalties are counted separately); omitting it underpaid late workers.
                AttendanceEntry.status.in_(["PRESENT", "LATE", "HALF_DAY", "WORK_FROM_HOME"]),
            )
        )
    ).scalars().all()
    total = Decimal("0")
    for row in rows:
        status_u = (row.status or "").upper()
        if status_u == "HALF_DAY":
            total += Decimal("0.5")
        else:
            total += Decimal("1")
    return total


async def count_absent_and_late_days(
    db: AsyncSession, *, tenant_id: int, employee_id: int, start: date, end: date
) -> tuple[Decimal, Decimal]:
    rows = (
        await db.execute(
            select(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant_id,
                AttendanceEntry.employee_id == employee_id,
                AttendanceEntry.attendance_date >= start,
                AttendanceEntry.attendance_date <= end,
                AttendanceEntry.status.in_(["ABSENT", "LATE"]),
            )
        )
    ).scalars().all()
    absent = Decimal("0")
    late = Decimal("0")
    for row in rows:
        status_u = (row.status or "").upper()
        if status_u == "ABSENT":
            absent += Decimal("1")
        elif status_u == "LATE":
            late += Decimal("1")
    return absent, late


async def sum_approved_ot_hours(
    db: AsyncSession, *, tenant_id: int, employee_id: int, start: date, end: date
) -> Decimal:
    rows = (
        await db.execute(
            select(OvertimeEntry).where(
                OvertimeEntry.tenant_id == tenant_id,
                OvertimeEntry.employee_id == employee_id,
                OvertimeEntry.work_date >= start,
                OvertimeEntry.work_date <= end,
                OvertimeEntry.status.in_(["APPROVED", "POSTED"]),
            )
        )
    ).scalars().all()
    total = Decimal("0")
    for row in rows:
        total += api_money_to_decimal(row.ot_hours)
    return total


async def leave_days_in_period(
    db: AsyncSession, *, tenant_id: int, employee_id: int, start: date, end: date
) -> tuple[Decimal, Decimal]:
    """Return (paid_leave_days, unpaid_leave_days) for APPROVED leave overlapping period."""
    rows = (
        await db.execute(
            select(LeaveRequest, LeaveType)
            .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
            .where(
                LeaveRequest.tenant_id == tenant_id,
                LeaveRequest.employee_id == employee_id,
                LeaveRequest.status == "APPROVED",
                LeaveRequest.from_date <= end,
                LeaveRequest.to_date >= start,
            )
        )
    ).all()
    paid = Decimal("0")
    unpaid = Decimal("0")
    for req, ltype in rows:
        overlap_start = max(req.from_date, start)
        overlap_end = min(req.to_date, end)
        days = Decimal(str((overlap_end - overlap_start).days + 1))
        if days < 0:
            continue
        if ltype.is_paid:
            paid += days
        else:
            unpaid += days
    return paid, unpaid


@dataclass
class LopDays:
    """Loss-of-pay day counts for one employee in one pay period."""

    period_days: Decimal
    employed_from: date | None  # None = not employed at all during the period
    employed_to: date | None
    employed_days: Decimal
    absent_days: Decimal  # ABSENT attendance not covered by approved leave
    unpaid_leave_days: Decimal  # approved unpaid leave on working days (weekends / holidays skipped)
    payable_days: Decimal

    @property
    def lop_days(self) -> Decimal:
        return self.absent_days + self.unpaid_leave_days


async def compute_lop_days(
    db: AsyncSession, *, tenant: Tenant, employee: Employee, start: date, end: date
) -> LopDays:
    """Payable days = employed days in the period - unpaid absences - unpaid leave days."""
    zero = Decimal("0")
    period_days = Decimal((end - start).days + 1)
    employed_from = max(start, employee.joining_date) if employee.joining_date else start
    employed_to = min(end, employee.exit_date) if employee.exit_date else end
    if employed_to < employed_from:
        return LopDays(period_days, None, None, zero, zero, zero, zero)
    employed_days = Decimal((employed_to - employed_from).days + 1)

    leave_rows = (
        await db.execute(
            select(LeaveRequest.from_date, LeaveRequest.to_date, LeaveType.is_paid)
            .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
            .where(
                LeaveRequest.tenant_id == tenant.id,
                LeaveRequest.employee_id == employee.id,
                LeaveRequest.status == "APPROVED",
                LeaveRequest.from_date <= employed_to,
                LeaveRequest.to_date >= employed_from,
            )
        )
    ).all()
    off_days = await non_working_dates(db, tenant, employed_from, employed_to)
    on_leave: set[date] = set()
    unpaid_leave: set[date] = set()
    for from_d, to_d, is_paid in leave_rows:
        for d in each_date(max(from_d, employed_from), min(to_d, employed_to)):
            on_leave.add(d)
            if not is_paid and d not in off_days:
                unpaid_leave.add(d)

    absent_dates = set(
        (
            await db.execute(
                select(AttendanceEntry.attendance_date).where(
                    AttendanceEntry.tenant_id == tenant.id,
                    AttendanceEntry.employee_id == employee.id,
                    AttendanceEntry.attendance_date >= employed_from,
                    AttendanceEntry.attendance_date <= employed_to,
                    AttendanceEntry.status == "ABSENT",
                )
            )
        ).scalars().all()
    )
    # An absence on a leave day is already handled by that leave (paid: no LOP, unpaid: counted once).
    unpaid_absent = absent_dates - on_leave
    lop = Decimal(len(unpaid_absent) + len(unpaid_leave))
    return LopDays(
        period_days=period_days,
        employed_from=employed_from,
        employed_to=employed_to,
        employed_days=employed_days,
        absent_days=Decimal(len(unpaid_absent)),
        unpaid_leave_days=Decimal(len(unpaid_leave)),
        payable_days=max(employed_days - lop, zero),
    )


async def resolve_assignment(
    db: AsyncSession, *, tenant_id: int, employee_id: int, as_of: date
) -> PayrollEmployeeStructureAssignment | None:
    rows = (
        await db.execute(
            select(PayrollEmployeeStructureAssignment)
            .where(
                PayrollEmployeeStructureAssignment.tenant_id == tenant_id,
                PayrollEmployeeStructureAssignment.employee_id == employee_id,
                PayrollEmployeeStructureAssignment.effective_from <= as_of,
                or_(
                    PayrollEmployeeStructureAssignment.effective_to.is_(None),
                    PayrollEmployeeStructureAssignment.effective_to >= as_of,
                ),
            )
            .order_by(PayrollEmployeeStructureAssignment.effective_from.desc())
        )
    ).scalars().all()
    return rows[0] if rows else None


async def calculate_employee_payroll(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee: Employee,
    period: PayrollPeriod,
    as_of: date | None = None,
    has_manual_override: bool = False,
    apply_lop: bool = False,
) -> EmployeeCalcPreview:
    """Build a read-only payroll preview for one employee in a pay period.

    ``apply_lop`` prorates period-salary earnings (FIXED / PERCENT_OF_BASE) by payable days.
    """
    as_of_date = as_of or period.end_date
    name = _employee_display_name(employee)
    lop: LopDays | None = None
    if apply_lop:
        tenant_row = await db.get(Tenant, tenant_id)
        lop = await compute_lop_days(
            db, tenant=tenant_row, employee=employee, start=period.start_date, end=period.end_date
        )
        if lop.employed_to is None:
            return EmployeeCalcPreview(
                employee_id=employee.id,
                employee_code=employee.employee_code,
                employee_name=name,
                structure_id=None,
                assignment_id=None,
                base_salary="0.0000",
                days_present="0.0000",
                absent_days="0.0000",
                late_days="0.0000",
                ot_hours="0.0000",
                paid_leave_days="0.0000",
                unpaid_leave_days="0.0000",
                gross_pay="0.0000",
                deductions="0.0000",
                net_pay="0.0000",
                overtime_amount="0.0000",
                warnings=["Not employed during this pay period (joining / exit date)"],
                skipped=True,
                skip_reason="not_employed_in_period",
                status="Not Employed",
                has_manual_override=has_manual_override,
                calculation_source="AUTO",
                trace={"as_of": as_of_date.isoformat(), "not_employed_in_period": True},
                lop_applied=True,
                period_days=decimal_to_money_response(lop.period_days),
            )
        # Look up the structure on a day the person was employed: a leaver's assignment usually ends
        # on the exit date, and a joiner's starts on the joining date.
        as_of_date = min(max(as_of_date, lop.employed_from), lop.employed_to)
    asgn = await resolve_assignment(db, tenant_id=tenant_id, employee_id=employee.id, as_of=as_of_date)
    if asgn is None:
        return EmployeeCalcPreview(
            employee_id=employee.id,
            employee_code=employee.employee_code,
            employee_name=name,
            structure_id=None,
            assignment_id=None,
            base_salary="0.0000",
            days_present="0.0000",
            absent_days="0.0000",
            late_days="0.0000",
            ot_hours="0.0000",
            paid_leave_days="0.0000",
            unpaid_leave_days="0.0000",
            gross_pay="0.0000",
            deductions="0.0000",
            net_pay="0.0000",
            overtime_amount="0.0000",
            warnings=["No effective payroll structure assignment"],
            skipped=True,
            skip_reason="missing_assignment",
            status="Missing Assignment",
            has_manual_override=has_manual_override,
            calculation_source="AUTO",
            trace={"as_of": as_of_date.isoformat(), "missing_assignment": True},
        )

    days_present = await count_present_days(
        db, tenant_id=tenant_id, employee_id=employee.id, start=period.start_date, end=period.end_date
    )
    absent_days, late_days = await count_absent_and_late_days(
        db, tenant_id=tenant_id, employee_id=employee.id, start=period.start_date, end=period.end_date
    )
    ot_hours = await sum_approved_ot_hours(
        db, tenant_id=tenant_id, employee_id=employee.id, start=period.start_date, end=period.end_date
    )
    paid_leave, unpaid_leave = await leave_days_in_period(
        db, tenant_id=tenant_id, employee_id=employee.id, start=period.start_date, end=period.end_date
    )
    # PER_DAY uses paid attendance days (present + paid leave).
    paid_days_for_allowance = days_present + paid_leave

    base = api_money_to_decimal(asgn.base_salary) if asgn.base_salary is not None else Decimal("0")
    warnings: list[str] = []
    if asgn.base_salary is None:
        warnings.append("No base_salary on assignment; PERCENT_OF_BASE uses 0 until set")
    if has_manual_override:
        warnings.append("Has manual override — will be skipped unless forced")

    lines = (
        await db.execute(
            select(PayrollStructureLine, PayrollComponent)
            .join(PayrollComponent, PayrollComponent.id == PayrollStructureLine.component_id)
            .where(
                PayrollStructureLine.tenant_id == tenant_id,
                PayrollStructureLine.structure_id == asgn.structure_id,
                PayrollComponent.is_active.is_(True),
            )
            .order_by(PayrollStructureLine.sort_order.asc(), PayrollStructureLine.id.asc())
        )
    ).all()

    if not lines:
        warnings.append("Structure has no active component lines")

    def _line_calc_type(component: PayrollComponent) -> str:
        _amt, ftype = _override_payload(asgn.component_overrides, component)
        return (ftype or component.calculation_type or "FIXED").strip().upper()

    line_types = {_line_calc_type(c) for _sl, c in lines}
    pieces = earned_minutes = Decimal("0")
    if line_types & OUTPUT_BASED_TYPES:
        pieces, earned_minutes = await piece_output_in_period(
            db, tenant_id=tenant_id, employee_code=employee.employee_code, start=period.start_date, end=period.end_date
        )
        if pieces == 0:
            warnings.append(
                f"Piece-rate structure but no scanned pieces for operator code '{employee.employee_code}' in this period"
            )
    pay_basis = "PIECE" if line_types & OUTPUT_BASED_TYPES else "DAILY" if "PER_DAY" in line_types else "SALARY"
    piece_earnings = Decimal("0")

    gross = Decimal("0")
    deductions = Decimal("0")
    overtime_amount = Decimal("0")
    lop_amount = Decimal("0")
    component_out: list[ComponentCalcLine] = []
    component_trace: list[dict[str, Any]] = []

    for sline, component in lines:
        override_amt, override_ftype = _override_payload(asgn.component_overrides, component)
        source_amount = override_amt if override_amt is not None else api_money_to_decimal(sline.amount)
        if source_amount == 0 and component.default_amount is not None:
            if override_amt is None and api_money_to_decimal(sline.amount) == 0:
                source_amount = api_money_to_decimal(component.default_amount)

        raw_calc = override_ftype or component.calculation_type or "FIXED"
        try:
            calc_type = assert_valid_calculation_type(raw_calc)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        amount = calculate_component_amount(
            calculation_type=calc_type,
            amount=source_amount,
            base_salary=base,
            days_present=paid_days_for_allowance,
            ot_hours=ot_hours,
            pieces=pieces,
            earned_minutes=earned_minutes,
            strict=True,
        )
        ctype = (component.component_type or "EARNING").strip().upper()
        full_amount = amount
        if lop is not None and ctype != "DEDUCTION" and calc_type in PERIOD_SALARY_TYPES:
            amount = prorate_amount(amount, lop.payable_days, lop.period_days)
            lop_amount += full_amount - amount
        if ctype == "DEDUCTION":
            deductions += amount
        else:
            gross += amount
            if calc_type == "PER_HOUR_OT":
                overtime_amount += amount
            if calc_type in OUTPUT_BASED_TYPES:
                piece_earnings += amount

        component_out.append(
            ComponentCalcLine(
                component_id=component.id,
                component_code=component.code,
                component_name=component.name,
                component_type=ctype,
                calculation_type=calc_type,
                amount=decimal_to_money_response(amount),
                source_amount=decimal_to_money_response(source_amount),
            )
        )
        component_trace.append(
            {
                "component_id": component.id,
                "code": component.code,
                "calculation_type": calc_type,
                "source_amount": decimal_to_money_response(source_amount),
                "amount": decimal_to_money_response(amount),
                "full_amount": decimal_to_money_response(full_amount),
                "component_type": ctype,
            }
        )

    if unpaid_leave > 0:
        warnings.append(f"Unpaid leave days in period: {unpaid_leave}")
    # Salary base for this period: reduced by loss of pay when it applies.
    earned_base = prorate_amount(base, lop.payable_days, lop.period_days) if lop is not None else base
    if lop is not None:
        if lop.employed_days < lop.period_days:
            warnings.append(
                f"Employed {lop.employed_days} of {lop.period_days} day(s) in this period (joined or left mid-period)"
            )
        if lop.lop_days > 0:
            warnings.append(
                f"Loss of pay: {lop.lop_days} day(s) (absent {lop.absent_days}, unpaid leave "
                f"{lop.unpaid_leave_days}); salary paid for {lop.payable_days} of {lop.period_days} day(s)"
            )
    # Bangladesh Labour Act: piece-rated workers must still receive at least the minimum wage.
    # Mixed structures (FIXED basic + piece bonus) count every regular earning; overtime does not count.
    regular_earnings = gross - overtime_amount
    if pay_basis == "PIECE" and earned_base > 0 and regular_earnings < earned_base:
        warnings.append(
            f"Earnings {quantize_money(regular_earnings)} (piece {quantize_money(piece_earnings)}) are below the "
            f"base salary / minimum wage {quantize_money(earned_base)} — add a top-up before paying"
        )

    statutory_trace: dict[str, Any] = {}
    from app.common.tenant_feature_keys import is_statutory_payroll_enabled
    from app.models.payroll_statutory import PayrollStatutoryConfig
    from app.modules.hr_payroll.statutory_calculation_service import calculate_all_statutory

    tenant_row = await db.get(Tenant, tenant_id)
    if tenant_row and is_statutory_payroll_enabled(tenant_row.feature_flags):
        cfg = (
            await db.execute(
                select(PayrollStatutoryConfig).where(
                    PayrollStatutoryConfig.tenant_id == tenant_id,
                    PayrollStatutoryConfig.is_active.is_(True),
                )
            )
        ).scalars().first()
        # Avoid double-counting if structure already has PF/ESI/PT flagged lines
        has_pf = any(getattr(sl, "is_pf_component", False) for sl, _ in lines)
        has_esi = any(getattr(sl, "is_esi_component", False) for sl, _ in lines)
        has_pt = any(getattr(sl, "is_pt_component", False) for sl, _ in lines)
        statutory = calculate_all_statutory(
            basic_salary=earned_base,
            gross_salary=quantize_money(gross),
            config=cfg,
        )
        statutory_trace = statutory

        def _add_stat(code: str, name: str, ctype: str, amount: Decimal, kind: str) -> None:
            nonlocal deductions, gross
            if amount <= 0:
                return
            if ctype == "DEDUCTION":
                deductions += amount
            else:
                # Employer contributions tracked as info earnings (not paid to employee)
                pass
            component_out.append(
                ComponentCalcLine(
                    component_id=0,
                    component_code=code,
                    component_name=name,
                    component_type=ctype,
                    calculation_type="STATUTORY",
                    amount=decimal_to_money_response(amount),
                    source_amount=decimal_to_money_response(amount),
                    is_statutory=True,
                    statutory_kind=kind,
                )
            )

        if not has_pf:
            _add_stat(
                "STAT_PF_EE",
                "PF Employee Contribution",
                "DEDUCTION",
                api_money_to_decimal(statutory["pf"]["employee_pf"]),
                "PF_EE",
            )
            _add_stat(
                "STAT_PF_ER",
                "PF Employer Contribution",
                "EMPLOYER",
                api_money_to_decimal(statutory["pf"]["employer_pf"]),
                "PF_ER",
            )
        if not has_esi:
            _add_stat(
                "STAT_ESI_EE",
                "ESI Employee Contribution",
                "DEDUCTION",
                api_money_to_decimal(statutory["esi"]["employee_esi"]),
                "ESI_EE",
            )
            _add_stat(
                "STAT_ESI_ER",
                "ESI Employer Contribution",
                "EMPLOYER",
                api_money_to_decimal(statutory["esi"]["employer_esi"]),
                "ESI_ER",
            )
        if not has_pt:
            _add_stat(
                "STAT_PT",
                "Professional Tax",
                "DEDUCTION",
                api_money_to_decimal(statutory["pt_amount"]),
                "PT",
            )

    net = quantize_money(gross - deductions)
    if net < 0:
        warnings.append("Deductions are more than earnings for this period; net pay is negative")
    status = "Manual Override Exists" if has_manual_override else "Ready"
    lop_fields: dict[str, Any] = {"lop_applied": lop is not None}
    if lop is not None:
        lop_fields.update(
            period_days=decimal_to_money_response(lop.period_days),
            employed_days=decimal_to_money_response(lop.employed_days),
            payable_days=decimal_to_money_response(lop.payable_days),
            lop_days=decimal_to_money_response(lop.lop_days),
            lop_absent_days=decimal_to_money_response(lop.absent_days),
            lop_unpaid_leave_days=decimal_to_money_response(lop.unpaid_leave_days),
            lop_amount=decimal_to_money_response(quantize_money(lop_amount)),
        )
    trace = {
        "as_of": as_of_date.isoformat(),
        "period_start": period.start_date.isoformat(),
        "period_end": period.end_date.isoformat(),
        "assignment_id": asgn.id,
        "structure_id": asgn.structure_id,
        "base_salary": decimal_to_money_response(base),
        "attendance_days": decimal_to_money_response(days_present),
        "absent_days": decimal_to_money_response(absent_days),
        "late_days": decimal_to_money_response(late_days),
        "leave_days_paid": decimal_to_money_response(paid_leave),
        "leave_days_unpaid": decimal_to_money_response(unpaid_leave),
        "paid_days_for_per_day": decimal_to_money_response(paid_days_for_allowance),
        "ot_hours": decimal_to_money_response(ot_hours),
        "pay_basis": pay_basis,
        "pieces": decimal_to_money_response(pieces),
        "earned_minutes": decimal_to_money_response(earned_minutes),
        "piece_earnings": decimal_to_money_response(quantize_money(piece_earnings)),
        "components": component_trace,
        "statutory": statutory_trace,
        "gross_pay": decimal_to_money_response(quantize_money(gross)),
        "deductions": decimal_to_money_response(quantize_money(deductions)),
        "net_pay": decimal_to_money_response(net),
        "calculation_source": "AUTO",
        # "lop_applied" also marks which calculation mode the run uses (see service.run_applies_lop).
        **lop_fields,
    }
    return EmployeeCalcPreview(
        employee_id=employee.id,
        employee_code=employee.employee_code,
        employee_name=name,
        structure_id=asgn.structure_id,
        assignment_id=asgn.id,
        base_salary=decimal_to_money_response(base),
        days_present=decimal_to_money_response(days_present),
        absent_days=decimal_to_money_response(absent_days),
        late_days=decimal_to_money_response(late_days),
        ot_hours=decimal_to_money_response(ot_hours),
        paid_leave_days=decimal_to_money_response(paid_leave),
        unpaid_leave_days=decimal_to_money_response(unpaid_leave),
        gross_pay=decimal_to_money_response(quantize_money(gross)),
        deductions=decimal_to_money_response(quantize_money(deductions)),
        net_pay=decimal_to_money_response(net),
        overtime_amount=decimal_to_money_response(quantize_money(overtime_amount)),
        components=component_out,
        warnings=warnings,
        skipped=False,
        status=status,
        has_manual_override=has_manual_override,
        calculation_source="AUTO",
        trace=trace,
        pieces=decimal_to_money_response(pieces),
        earned_minutes=decimal_to_money_response(earned_minutes),
        pay_basis=pay_basis,
        **lop_fields,
    )


def preview_to_dict(preview: EmployeeCalcPreview) -> dict[str, Any]:
    data = asdict(preview)
    return data
