"""Employee salary set-up for the employee workspace Salary tab. All routes need hr.payroll.manage.

GET  /hr/compensation/options                   salary structures + Bangladesh wage grades in force
POST /hr/compensation/preview                   prospective basic / gross against the grade (no write)
GET  /hr/employees/{id}/compensation            current pay snapshot + assignment history
PUT  /hr/employees/{id}/compensation            open a new effective-dated salary (and grade) window
GET  /hr/employees/{id}/pay-benefits            overtime + bill switches (defaults filled in)
PUT  /hr/employees/{id}/pay-benefits            save overtime + bill switches
GET  /hr/employees/{id}/tax-profile             Bangladesh salary tax (TDS) profile
PUT  /hr/employees/{id}/tax-profile             save the TDS profile (TIN, category, rebate, override, opening balance)
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.orm_numeric import decimal_to_money_response
from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_allowance import HrAllowanceRule
from app.models.hr_bd import HrBdEmployeeWageAssignment, HrBdWageScheduleRate
from app.models.hr_payroll import PayrollComponent, PayrollEmployeeStructureAssignment, PayrollStructure, PayrollStructureLine
from app.modules.audit.service import log_action
from app.modules.hr.employee_service import get_employee_or_404
from app.modules.hr import tax_profile as tax
from app.modules.hr_localization import bd_salary_tds_service as tds_service
from app.modules.hr.schemas import ComponentOverrides, EmployeeCompensationReplace, EmployeePaySnapshot, PayBenefitsUpdate
from app.modules.hr_allowances import pay_benefits as benefits
from app.modules.hr_localization import bd_rmg_catalog as cat
from app.modules.hr_localization.employee_pay import (
    ComponentRow,
    active_structure_lines,
    is_basic_line,
    is_overridable_line,
    pay_snapshot,
    price_lines,
)
from app.modules.hr_localization.rules_service import effective_rates, effective_rules
from app.modules.hr_payroll import compensation_service as comp

router = APIRouter(prefix="/hr", tags=["hr-compensation"])

HISTORY_CAP = 50


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_payroll(db: AsyncSession, user: User, tenant: Tenant) -> None:
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_PAYROLL_MANAGE)


def _money(value: Decimal | None) -> str | None:
    return decimal_to_money_response(value) if value is not None else None


def _plain_overrides(stored: dict | None) -> dict[str, str]:
    """Stored ``{code: {"amount": .., "formula_type": "FIXED"}}`` as ``{code: amount}`` for the screen."""
    if not isinstance(stored, dict):
        return {}
    out: dict[str, str] = {}
    for code, raw in stored.items():
        value = raw.get("amount") if isinstance(raw, dict) else raw
        if value is not None:
            out[str(code)] = str(value)
    return out


def _component_out(row: ComponentRow) -> dict:
    return {
        "component_id": row.component_id,
        "code": row.code,
        "name": row.name,
        "component_type": row.component_type,
        "calculation_type": row.calculation_type,
        "rule_amount": _money(row.rule_amount),
        "standard_amount": _money(row.standard_amount),
        "amount": _money(row.amount),
        "is_basic": row.is_basic,
        "editable": row.editable,
        "overridden": row.overridden,
    }


async def employee_pay_snapshot(
    db: AsyncSession, tenant: Tenant, employee: Employee, as_of: date | None = None
) -> EmployeePaySnapshot:
    """Read-only pay view. Callers must already have checked hr.payroll.manage."""
    as_of = as_of or today_local(tenant)
    eff = await effective_rules(db, tenant.id, as_of)
    rates = {r.rate_code: r for r in await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, as_of)}
    snap = await pay_snapshot(db, tenant.id, employee, as_of, rates)
    structure_row = await db.get(PayrollEmployeeStructureAssignment, snap.assignment_id) if snap.assignment_id else None
    wage_row, _ = await comp.wage_rate_in_force(db, tenant.id, employee.id, as_of)
    rate = snap.wage_rate
    components: list[dict] = []
    if structure_row is not None and structure_row.tenant_id == tenant.id:
        overrides = structure_row.component_overrides if isinstance(structure_row.component_overrides, dict) else None
        lines = await active_structure_lines(db, tenant.id, structure_row.structure_id)
        components = [_component_out(r) for r in price_lines(lines, snap.basic, overrides)]
    return EmployeePaySnapshot(
        components=components,
        as_of=as_of,
        basic=_money(snap.basic) or "0.0000",
        gross=_money(snap.gross) or "0.0000",
        structure_id=structure_row.structure_id if structure_row else None,
        structure_code=snap.structure_code,
        structure_assignment_id=snap.assignment_id,
        structure_effective_from=structure_row.effective_from if structure_row else None,
        structure_effective_to=structure_row.effective_to if structure_row else None,
        wage_rate_id=rate.id if rate else None,
        wage_rate_code=rate.rate_code if rate else None,
        wage_grade_basic=_money(rate.basic) if rate else None,
        wage_grade_gross=_money(rate.gross) if rate else None,
        wage_assignment_id=wage_row.id if wage_row and snap.wage_rate_source == "wage_assignment" else None,
        wage_effective_from=wage_row.effective_from if wage_row and snap.wage_rate_source == "wage_assignment" else None,
        component_overrides=_plain_overrides(structure_row.component_overrides if structure_row else None),
        change_type=structure_row.change_type if structure_row else None,
        change_note=structure_row.change_note if structure_row else None,
    )


class CompensationPreviewBody(BaseModel):
    structure_id: int
    bd_wage_rate_id: int | None = None
    base_salary: str | None = Field(None, max_length=32)
    effective_from: date | None = None
    component_overrides: ComponentOverrides | None = None
    # Optional inputs for the live Bangladesh salary tax (TDS) estimate beside the salary.
    employee_id: int | None = None
    gender: str | None = Field(None, max_length=32)
    date_of_birth: date | None = None
    tax_profile: tax.TaxProfileBody | None = None


async def _structure_lines_by_id(db: AsyncSession, tenant_id: int, structure_ids: list[int]) -> dict[int, list[dict]]:
    if not structure_ids:
        return {}
    rows = (
        await db.execute(
            select(PayrollStructureLine, PayrollComponent)
            .join(PayrollComponent, PayrollComponent.id == PayrollStructureLine.component_id)
            .where(
                PayrollStructureLine.tenant_id == tenant_id,
                PayrollStructureLine.structure_id.in_(structure_ids),
                PayrollComponent.tenant_id == tenant_id,
                PayrollComponent.is_active.is_(True),
            )
            .order_by(PayrollStructureLine.sort_order.asc(), PayrollStructureLine.id.asc())
        )
    ).all()
    out: dict[int, list[dict]] = {}
    for line, component in rows:
        out.setdefault(line.structure_id, []).append(
            {
                "component_id": component.id,
                "code": component.code,
                "name": component.name,
                "component_type": (component.component_type or "EARNING").strip().upper(),
                "calculation_type": (component.calculation_type or "FIXED").strip().upper(),
                "amount": _money(line.amount),
                "is_basic": is_basic_line(line, component),
                "editable": is_overridable_line(line, component),
            }
        )
    return out


async def _bill_rules(db: AsyncSession, tenant_id: int, as_of: date) -> list[dict]:
    rows = (
        await db.execute(
            select(HrAllowanceRule)
            .where(
                HrAllowanceRule.tenant_id == tenant_id,
                HrAllowanceRule.status == "APPROVED",
                HrAllowanceRule.effective_from <= as_of,
                or_(HrAllowanceRule.effective_to.is_(None), HrAllowanceRule.effective_to >= as_of),
            )
            .order_by(HrAllowanceRule.bill_type, HrAllowanceRule.code)
            .limit(200)
        )
    ).scalars().all()
    return [
        {
            "id": r.id,
            "code": r.code,
            "name": r.name,
            "bill_type": r.bill_type,
            "eligibility_basis": r.eligibility_basis,
            "amount": _money(r.amount),
        }
        for r in rows
    ]


@router.get("/compensation/options")
async def compensation_options(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    as_of = today_local(tenant)
    structures = (
        await db.execute(
            select(PayrollStructure)
            .where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.is_active.is_(True))
            .order_by(PayrollStructure.name)
            .limit(500)
        )
    ).scalars().all()
    eff = await effective_rules(db, tenant.id, as_of)
    rates = await effective_rates(db, tenant.id, eff.rule_set.id if eff.rule_set else None, as_of)
    lines = await _structure_lines_by_id(db, tenant.id, [s.id for s in structures])
    return {
        "as_of": as_of.isoformat(),
        "structures": [{"id": s.id, "code": s.code, "name": s.name, "lines": lines.get(s.id, [])} for s in structures],
        "wage_grades": [
            {
                "id": r.id,
                "rate_code": r.rate_code,
                "grade_code": r.grade_code,
                "schedule_class": r.schedule_class,
                "employment_stage": r.employment_stage,
                "basic": _money(r.basic),
                "gross": _money(r.gross),
                "annual_increment_pct": str(r.annual_increment_pct),
            }
            for r in rates
        ],
        "annual_increment_pct": str(cat.ANNUAL_INCREMENT_PCT_OF_BASIC),
        "bill_rules": await _bill_rules(db, tenant.id, as_of),
    }


@router.post("/compensation/preview")
async def compensation_preview(
    body: CompensationPreviewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    as_of = body.effective_from or today_local(tenant)
    rate = await comp.approved_wage_rate(db, tenant.id, body.bd_wage_rate_id, as_of) if body.bd_wage_rate_id else None
    out: dict = {
        "minimum_basic": _money(rate.basic) if rate else None,
        "minimum_gross": _money(rate.gross) if rate else None,
        "basic": None,
        "gross": None,
        "meets_minimum": True,
        "message": None,
        "components": [],
    }
    amount = comp.parse_money(body.base_salary)
    await comp.structure_for_tenant(db, tenant.id, body.structure_id)
    overrides = await comp.validate_component_overrides(db, tenant.id, body.structure_id, body.component_overrides)
    lines = await active_structure_lines(db, tenant.id, body.structure_id)
    try:
        basic, gross = await comp.preview_compensation(
            db,
            tenant_id=tenant.id,
            structure_id=body.structure_id,
            rate=rate,
            base_salary=amount,
            component_overrides=overrides,
        )
        out.update(basic=_money(basic), gross=_money(gross))
        out["components"] = [_component_out(r) for r in price_lines(lines, basic, overrides)]
    except HTTPException as exc:
        if exc.status_code != 400:
            raise
        out.update(meets_minimum=False, message=exc.detail)
        if amount is not None:
            structure_gross_value = await comp.structure_gross(db, tenant.id, body.structure_id, amount, overrides)
            out.update(basic=_money(amount), gross=_money(structure_gross_value))
            out["components"] = [_component_out(r) for r in price_lines(lines, amount, overrides)]
    gender, birth_date, saved_profile = body.gender, body.date_of_birth, None
    if body.employee_id is not None:
        employee = await get_employee_or_404(db, tenant.id, body.employee_id)
        gender = gender if gender is not None else employee.gender
        birth_date = birth_date or employee.date_of_birth
        saved_profile = await tds_service.get_tax_profile(db, tenant.id, employee.id)
    out["tds_estimate"] = tax.tds_estimate(
        tenant=tenant,
        monthly_gross=Decimal(out["gross"] or "0"),
        gender=gender,
        date_of_birth=birth_date,
        as_of=as_of,
        profile_body=body.tax_profile,
        profile_row=saved_profile,
    )
    return out


async def _compensation_view(db: AsyncSession, tenant: Tenant, employee: Employee) -> dict:
    structures = (
        await db.execute(
            select(PayrollEmployeeStructureAssignment, PayrollStructure.code)
            .join(PayrollStructure, PayrollStructure.id == PayrollEmployeeStructureAssignment.structure_id)
            .where(
                PayrollEmployeeStructureAssignment.tenant_id == tenant.id,
                PayrollEmployeeStructureAssignment.employee_id == employee.id,
            )
            .order_by(PayrollEmployeeStructureAssignment.effective_from.desc())
            .limit(HISTORY_CAP)
        )
    ).all()
    wages = (
        await db.execute(
            select(HrBdEmployeeWageAssignment, HrBdWageScheduleRate.rate_code)
            .join(HrBdWageScheduleRate, HrBdWageScheduleRate.id == HrBdEmployeeWageAssignment.wage_rate_id)
            .where(
                HrBdEmployeeWageAssignment.tenant_id == tenant.id,
                HrBdEmployeeWageAssignment.employee_id == employee.id,
            )
            .order_by(HrBdEmployeeWageAssignment.effective_from.desc())
            .limit(HISTORY_CAP)
        )
    ).all()
    snapshot = await employee_pay_snapshot(db, tenant, employee)
    return {
        "employee_id": employee.id,
        "snapshot": snapshot.model_dump(mode="json"),
        "tds_estimate": await tax.estimate_for_employee(db, tenant, employee, Decimal(snapshot.gross or "0")),
        "structure_assignments": [
            {
                "id": a.id,
                "structure_id": a.structure_id,
                "structure_code": code,
                "base_salary": _money(a.base_salary),
                "effective_from": a.effective_from.isoformat(),
                "effective_to": a.effective_to.isoformat() if a.effective_to else None,
                "component_overrides": _plain_overrides(a.component_overrides),
                "change_type": a.change_type,
                "change_note": a.change_note,
            }
            for a, code in structures
        ],
        "wage_assignments": [
            {
                "id": w.id,
                "wage_rate_id": w.wage_rate_id,
                "rate_code": code,
                "effective_from": w.effective_from.isoformat(),
                "effective_to": w.effective_to.isoformat() if w.effective_to else None,
            }
            for w, code in wages
        ],
    }


@router.get("/employees/{employee_id}/compensation")
async def get_employee_compensation(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    employee = await get_employee_or_404(db, tenant.id, employee_id)
    return await _compensation_view(db, tenant, employee)


@router.put("/employees/{employee_id}/compensation")
async def replace_employee_compensation(
    employee_id: int,
    body: EmployeeCompensationReplace,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    tenant_id, user_id = tenant.id, user.id
    try:
        result = await comp.replace_employee_compensation(
            db,
            tenant=tenant,
            employee_id=employee_id,
            structure_id=body.structure_id,
            bd_wage_rate_id=body.bd_wage_rate_id,
            base_salary=body.base_salary,
            effective_from=body.effective_from,
            actor_id=user_id,
            component_overrides=body.component_overrides,
            change_type=body.change_type,
            change_note=body.change_note,
        )
        await log_action(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="HR_EMPLOYEE_COMPENSATION_REPLACED",
            resource=f"hr.employee:{employee_id}",
            details=comp.audit_details(result, body.effective_from),
        )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=409, detail="Salary assignment changed at the same time; reload and try again")
    employee = await get_employee_or_404(db, tenant_id, employee_id)
    return await _compensation_view(db, tenant, employee)


async def _pay_benefits_view(db: AsyncSession, tenant_id: int, employee_id: int) -> dict:
    rows = (await benefits.benefits_by_employee(db, tenant_id, [employee_id])).get(employee_id, {})
    return {"employee_id": employee_id, "benefits": benefits.benefits_view(rows)}


@router.get("/employees/{employee_id}/pay-benefits")
async def get_employee_pay_benefits(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    await get_employee_or_404(db, tenant.id, employee_id)
    return await _pay_benefits_view(db, tenant.id, employee_id)


@router.put("/employees/{employee_id}/pay-benefits")
async def replace_employee_pay_benefits(
    employee_id: int,
    body: PayBenefitsUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    tenant_id, user_id = tenant.id, user.id
    try:
        await comp.lock_employee(db, tenant_id, employee_id)
        switched_off = await benefits.upsert_pay_benefits(
            db, tenant_id=tenant_id, employee_id=employee_id, items=body.benefits, actor_id=user_id
        )
        await log_action(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="HR_EMPLOYEE_PAY_BENEFITS_UPDATED",
            resource=f"hr.employee:{employee_id}",
            details=f"codes={sorted(b.benefit_code for b in body.benefits)} off={switched_off}",
        )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=409, detail="The switches changed at the same time; reload and try again")
    return await _pay_benefits_view(db, tenant_id, employee_id)


async def _tax_profile_view(db: AsyncSession, tenant: Tenant, employee: Employee) -> dict:
    row = await tds_service.get_tax_profile(db, tenant.id, employee.id)
    return {"employee_id": employee.id, "profile": tax.profile_out(row)}


@router.get("/employees/{employee_id}/tax-profile")
async def get_employee_tax_profile(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    employee = await get_employee_or_404(db, tenant.id, employee_id)
    return await _tax_profile_view(db, tenant, employee)


@router.put("/employees/{employee_id}/tax-profile")
async def replace_employee_tax_profile(
    employee_id: int,
    body: tax.TaxProfileBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_payroll(db, user, tenant)
    tenant_id, user_id = tenant.id, user.id
    try:
        await comp.lock_employee(db, tenant_id, employee_id)
        changed = await tax.upsert_tax_profile(
            db, tenant_id=tenant_id, employee_id=employee_id, body=body, actor_id=user_id
        )
        # Field names only: never the TIN or any amount.
        await log_action(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="HR_EMPLOYEE_TAX_PROFILE_UPDATED",
            resource=f"hr.employee:{employee_id}",
            details=f"fields={changed}",
        )
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=409, detail="The tax profile changed at the same time; reload and try again")
    employee = await get_employee_or_404(db, tenant_id, employee_id)
    return await _tax_profile_view(db, tenant, employee)
