"""Bangladesh salary TDS: database side (tax profile, year-to-date payroll, enablement approval).

The maths lives in ``bd_salary_tds.py`` (pure). This file reads prior frozen payroll to build the
year-to-date position, and decides whether the company switch may be turned on.
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.hr import Employee
from app.models.hr_bd import HrEmployeeTaxProfile
from app.models.hr_payroll import PayrollCalculationSnapshot, PayrollPeriod, PayrollRun, PayrollRunLine
from app.modules.hr_localization import bd_salary_tds as engine

BD_TDS_CODE = "BD-TDS"
BD_TDS_KIND = "BD_TDS"
BD_TDS_NAME = "Income tax (TDS)"
QUALIFYING_RUN_STATUSES = ("FINALIZED", "APPROVED", "POSTED")
APPROVAL_FILE = Path(__file__).parent / "data" / "bd_salary_tds_approval.json"


# --- Enablement approval -----------------------------------------------------------------------------


def load_approval() -> dict[str, Any]:
    try:
        data = json.loads(APPROVAL_FILE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return data if isinstance(data, dict) else {}


def approval_problems(approval: dict[str, Any] | None = None) -> list[str]:
    """Reasons the TDS switch may not be enabled (empty list = signed off for exactly this schedule)."""
    data = load_approval() if approval is None else approval
    problems: list[str] = []
    if not data:
        return ["The tax approval record is missing or unreadable"]
    if str(data.get("status") or "").upper() != "PASS":
        problems.append("The Bangladesh tax / compliance sign-off is not PASS yet")
    if not str(data.get("approval_id") or "").strip():
        problems.append("The approval record has no approval ID")
    if data.get("schedule_version") != engine.SCHEDULE_VERSION:
        problems.append("The approved schedule version does not match the schedule in the software")
    if data.get("schedule_checksum") != engine.schedule_checksum():
        problems.append("The approved schedule checksum does not match the schedule in the software")
    sources = data.get("sources")
    if not isinstance(sources, list) or not sources or not all(
        isinstance(s, dict) and len(str(s.get("sha256") or "")) == 64 for s in sources
    ):
        problems.append("Every official source needs a SHA-256 checksum in the approval record")
    if not str(data.get("approver") or "").strip() or not str(data.get("approved_on") or "").strip():
        problems.append("The approval record has no approver / approval date")
    if engine.SETTLEMENT_CLASSIFICATION_VERSION is None or (
        data.get("settlement_classification_version") != engine.SETTLEMENT_CLASSIFICATION_VERSION
    ):
        problems.append("Final-settlement earnings have no approved taxable / exempt classification")
    return problems


# --- Tax profile -------------------------------------------------------------------------------------


async def get_tax_profile(db: AsyncSession, tenant_id: int, employee_id: int) -> HrEmployeeTaxProfile | None:
    return (
        await db.execute(
            select(HrEmployeeTaxProfile).where(
                HrEmployeeTaxProfile.tenant_id == tenant_id, HrEmployeeTaxProfile.employee_id == employee_id
            )
        )
    ).scalar_one_or_none()


def profile_kwargs(profile: HrEmployeeTaxProfile | None) -> dict[str, Any]:
    """Engine arguments from a profile row (defaults when the employee has none)."""
    if profile is None:
        return {
            "category_override": "AUTO",
            "disabled_children": 0,
            "rebate_mode": "NONE",
            "declared_investment": None,
            "first_time_taxpayer": False,
        }
    return {
        "category_override": profile.tax_category_override,
        "disabled_children": profile.disabled_children_count,
        "rebate_mode": profile.rebate_mode,
        "declared_investment": profile.declared_annual_investment,
        "first_time_taxpayer": profile.is_first_time_taxpayer,
    }


# --- Year-to-date ------------------------------------------------------------------------------------


def _trace_tds(trace: dict[str, Any]) -> Decimal:
    total = Decimal("0")
    for comp in trace.get("components") or []:
        if isinstance(comp, dict) and comp.get("code") == BD_TDS_CODE:
            total += engine._dec(comp.get("amount"))
    return total


async def load_ytd(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee: Employee,
    period: PayrollPeriod,
    income_year_start: date,
    profile: HrEmployeeTaxProfile | None,
) -> dict[str, Any]:
    """Gross and TDS already settled earlier in this income year.

    Opening balance (through its cutoff date) + qualifying earlier payroll periods that start after the
    cutoff. Per period only the newest qualifying run is used and, for each AUTO line, only its newest
    calculation snapshot. A cutoff inside a payroll period, or an earlier MANUAL / snapshot-less line
    that the opening balance does not cover, stops the calculation (nothing is guessed).
    """
    cutoff: date | None = None
    opening_gross = opening_tds = Decimal("0")
    if (
        profile is not None
        and profile.opening_through_date is not None
        and profile.opening_income_year_start == income_year_start
    ):
        cutoff = profile.opening_through_date
        opening_gross = engine._dec(profile.opening_ytd_gross)
        opening_tds = engine._dec(profile.opening_ytd_tds)

    rows = (
        await db.execute(
            select(PayrollRunLine, PayrollRun, PayrollPeriod)
            .join(PayrollRun, PayrollRun.id == PayrollRunLine.run_id)
            .join(PayrollPeriod, PayrollPeriod.id == PayrollRun.period_id)
            .where(
                PayrollRunLine.tenant_id == tenant_id,
                PayrollRunLine.employee_id == employee.id,
                PayrollRun.tenant_id == tenant_id,
                PayrollPeriod.tenant_id == tenant_id,
                PayrollRun.status.in_(QUALIFYING_RUN_STATUSES),
                PayrollPeriod.start_date >= income_year_start,
                PayrollPeriod.end_date < period.start_date,
            )
            .order_by(PayrollPeriod.start_date.asc(), PayrollRun.id.asc())
        )
    ).all()

    newest_per_period: dict[int, tuple[PayrollRunLine, PayrollRun, PayrollPeriod]] = {}
    for line, run, per in rows:
        newest_per_period[per.id] = (line, run, per)  # ascending run id, so the last one wins

    gross = tds = Decimal("0")
    covered_periods = 0
    for line, run, per in newest_per_period.values():
        if cutoff is not None and per.start_date <= cutoff < per.end_date:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Tax opening balance for {employee.employee_code} ends on {cutoff.isoformat()}, inside payroll "
                    f"period {per.period_code}. Move the cutoff to a period end."
                ),
            )
        if cutoff is not None and per.end_date <= cutoff:
            covered_periods += 1
            continue  # already inside the opening balance
        snap_trace = None
        if (line.calculation_source or "MANUAL").upper() == "AUTO":
            snap = (
                await db.execute(
                    select(PayrollCalculationSnapshot.trace_json)
                    .where(
                        PayrollCalculationSnapshot.tenant_id == tenant_id,
                        PayrollCalculationSnapshot.payroll_run_line_id == line.id,
                    )
                    .order_by(PayrollCalculationSnapshot.id.desc())
                    .limit(1)
                )
            ).first()
            snap_trace = snap[0] if snap and isinstance(snap[0], dict) else None
        if snap_trace is None:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Earlier payroll {run.run_code} (period {per.period_code}) for {employee.employee_code} has no "
                    "calculation snapshot, so its gross pay and tax cannot be split safely. Enter a tax opening "
                    f"balance on the employee tax profile that runs through {per.end_date.isoformat()} or later."
                ),
            )
        gross += engine._dec(snap_trace.get("gross_pay"))
        tds += _trace_tds(snap_trace)
        covered_periods += 1

    return {
        "ytd_gross": opening_gross + gross,
        "prior_tds": opening_tds + tds,
        "opening_gross": opening_gross,
        "opening_tds": opening_tds,
        "opening_through_date": cutoff,
        "erp_gross": gross,
        "erp_tds": tds,
        "periods_found": covered_periods,
    }


def _months_between(start: date, end: date) -> int:
    return max((end.year * 12 + end.month) - (start.year * 12 + start.month), 0)


async def compute_payroll_tds(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee: Employee,
    period: PayrollPeriod,
    current_gross: Decimal,
    recurring_monthly: Decimal,
) -> dict[str, Any]:
    """TDS for one employee in one payroll period (see ``bd_salary_tds.payroll_installment``)."""
    warnings: list[str] = []
    profile = await get_tax_profile(db, tenant_id, employee.id)
    kwargs = profile_kwargs(profile)
    try:
        schedule = engine.get_schedule(period.end_date)
    except engine.UnsupportedTaxYear as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    iy_start, iy_end, assessment = engine.income_year_window(period.end_date)
    category, cat_warnings = engine.resolve_taxpayer_category(
        employee.gender, employee.date_of_birth, iy_end, kwargs["category_override"], schedule
    )
    warnings.extend(cat_warnings)
    tds_on = profile is None or bool(profile.tds_enabled)

    ytd = await load_ytd(
        db, tenant_id=tenant_id, employee=employee, period=period, income_year_start=iy_start, profile=profile
    )
    remaining = engine.remaining_months_after(period.end_date, employee.exit_date, iy_end)
    result = engine.payroll_installment(
        ytd_gross=ytd["ytd_gross"],
        prior_tds=ytd["prior_tds"],
        current_gross=current_gross,
        recurring_monthly=recurring_monthly,
        remaining_months=remaining,
        schedule=schedule,
        category=category,
        disabled_children=kwargs["disabled_children"],
        rebate_mode=kwargs["rebate_mode"],
        declared_investment=kwargs["declared_investment"],
        first_time_taxpayer=kwargs["first_time_taxpayer"],
        fixed_override=profile.monthly_tds_override if profile is not None else None,
    )

    # Months of the income year before this period that have no payroll data and no opening balance.
    first_month = max(iy_start, employee.joining_date or iy_start)
    expected_prior = _months_between(first_month, period.start_date)
    if expected_prior > ytd["periods_found"] and ytd["opening_through_date"] is None:
        warnings.append(
            f"{expected_prior - ytd['periods_found']} earlier month(s) of this income year have no payroll in the "
            "system; add an opening balance on the tax profile if tax was already deducted"
        )

    if not tds_on:
        result["monthly_tds"] = Decimal("0")
        result["method"] = "EMPLOYEE_TDS_OFF"
        warnings.append("TDS is switched off for this employee: nothing is deducted")

    result["assessment_year"] = assessment
    result["employee_tds_enabled"] = tds_on
    result["opening_through_date"] = (
        ytd["opening_through_date"].isoformat() if ytd["opening_through_date"] is not None else None
    )
    result["warnings"] = warnings
    return result
