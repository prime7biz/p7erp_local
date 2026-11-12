"""Employee Bangladesh salary tax (TDS) profile: request model, validation, save and the salary-tab estimate.

TIN and tax amounts are private: the routes need ``hr.payroll.manage`` and nothing here is written to
audit details beyond the names of the fields that changed.
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal

from fastapi import HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import is_hr_bd_salary_tds_enabled
from app.models import Tenant
from app.models.hr import Employee
from app.models.hr_bd import HrEmployeeTaxProfile
from app.modules.hr_localization import bd_salary_tds as engine
from app.modules.hr_localization import bd_salary_tds_service as tds_service

CategoryOverride = Literal["AUTO", "GENERAL", "FEMALE", "SENIOR_65", "DISABLED", "THIRD_GENDER", "FREEDOM_FIGHTER"]
MAX_MONEY = Decimal("1000000000")


class TaxProfileBody(BaseModel):
    tds_enabled: bool = True
    tin_number: str | None = Field(None, max_length=32)
    tax_circle: str | None = Field(None, max_length=64)
    tax_zone: str | None = Field(None, max_length=64)
    tax_category_override: CategoryOverride = "AUTO"
    category_evidence_reference: str | None = Field(None, max_length=255)
    disabled_children_count: int = Field(0, ge=0, le=100)
    is_first_time_taxpayer: bool = False
    rebate_mode: Literal["NONE", "DECLARED_INVESTMENT"] = "NONE"
    declared_annual_investment: str | None = Field(None, max_length=32)
    monthly_tds_override: str | None = Field(None, max_length=32)
    opening_ytd_gross: str | None = Field(None, max_length=32)
    opening_ytd_tds: str | None = Field(None, max_length=32)
    opening_income_year_start: date | None = None
    opening_through_date: date | None = None


def _money(value: str | None, label: str) -> Decimal | None:
    if value is None or str(value).strip() == "":
        return None
    try:
        parsed = Decimal(str(value).strip())
    except InvalidOperation:
        raise HTTPException(status_code=400, detail=f"{label} must be a number") from None
    if not parsed.is_finite() or parsed < 0 or parsed > MAX_MONEY:
        raise HTTPException(status_code=400, detail=f"{label} must be zero or more")
    return parsed.quantize(Decimal("0.0001"))


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def parse_profile(body: TaxProfileBody) -> dict[str, Any]:
    """Validated column values (raises 400 for anything unsafe or incomplete)."""
    values: dict[str, Any] = {
        "tds_enabled": body.tds_enabled,
        "tin_number": _clean(body.tin_number),
        "tax_circle": _clean(body.tax_circle),
        "tax_zone": _clean(body.tax_zone),
        "tax_category_override": body.tax_category_override,
        "category_evidence_reference": _clean(body.category_evidence_reference),
        "disabled_children_count": body.disabled_children_count,
        "is_first_time_taxpayer": body.is_first_time_taxpayer,
        "rebate_mode": body.rebate_mode,
        "declared_annual_investment": _money(body.declared_annual_investment, "Declared investment"),
        "monthly_tds_override": _money(body.monthly_tds_override, "Fixed monthly TDS"),
        "opening_ytd_gross": _money(body.opening_ytd_gross, "Opening gross pay"),
        "opening_ytd_tds": _money(body.opening_ytd_tds, "Opening tax deducted"),
        "opening_income_year_start": body.opening_income_year_start,
        "opening_through_date": body.opening_through_date,
    }
    needs_evidence = body.tax_category_override in engine.EVIDENCE_CATEGORIES or body.disabled_children_count > 0
    if needs_evidence and not values["category_evidence_reference"]:
        raise HTTPException(
            status_code=400,
            detail="A special tax category or disabled-child claim needs an evidence reference (certificate number)",
        )
    if body.rebate_mode == "DECLARED_INVESTMENT":
        if not values["declared_annual_investment"] or values["declared_annual_investment"] <= 0:
            raise HTTPException(status_code=400, detail="Enter the declared eligible investment for the rebate")
    else:
        values["declared_annual_investment"] = None
    opening_parts = (
        values["opening_income_year_start"], values["opening_through_date"],
        values["opening_ytd_gross"], values["opening_ytd_tds"],
    )
    if any(p is not None for p in opening_parts):
        if values["opening_income_year_start"] is None or values["opening_through_date"] is None:
            raise HTTPException(status_code=400, detail="An opening balance needs its income year and 'through' date")
        start = values["opening_income_year_start"]
        if (start.month, start.day) != (7, 1):
            raise HTTPException(status_code=400, detail="The opening income year must start on 1 July")
        if not (start <= values["opening_through_date"] <= date(start.year + 1, 6, 30)):
            raise HTTPException(status_code=400, detail="The opening 'through' date must be inside that income year")
        values["opening_ytd_gross"] = values["opening_ytd_gross"] or Decimal("0")
        values["opening_ytd_tds"] = values["opening_ytd_tds"] or Decimal("0")
    return values


async def upsert_tax_profile(
    db: AsyncSession, *, tenant_id: int, employee_id: int, body: TaxProfileBody, actor_id: int
) -> list[str]:
    """Insert or replace the employee's profile (one row per employee). Returns the changed field names."""
    values = parse_profile(body)
    existing = await tds_service.get_tax_profile(db, tenant_id, employee_id)
    changed = (
        sorted(k for k, v in values.items() if getattr(existing, k) != v) if existing is not None else sorted(values)
    )
    now = datetime.utcnow()
    stmt = pg_insert(HrEmployeeTaxProfile).values(
        tenant_id=tenant_id, employee_id=employee_id, updated_by=actor_id, created_at=now, updated_at=now, **values
    )
    stmt = stmt.on_conflict_do_update(
        constraint="uq_hr_employee_tax_profile",
        set_={**values, "updated_by": actor_id, "updated_at": now},
    )
    await db.execute(stmt)
    await db.flush()
    return changed


def profile_out(row: HrEmployeeTaxProfile | None) -> dict[str, Any]:
    """Screen view (defaults when the employee has no row yet)."""
    if row is None:
        return TaxProfileBody().model_dump(mode="json") | {"exists": False}

    def text(value: Decimal | None) -> str | None:
        return None if value is None else format(value, "f")

    return {
        "exists": True,
        "tds_enabled": row.tds_enabled,
        "tin_number": row.tin_number,
        "tax_circle": row.tax_circle,
        "tax_zone": row.tax_zone,
        "tax_category_override": row.tax_category_override,
        "category_evidence_reference": row.category_evidence_reference,
        "disabled_children_count": row.disabled_children_count,
        "is_first_time_taxpayer": row.is_first_time_taxpayer,
        "rebate_mode": row.rebate_mode,
        "declared_annual_investment": text(row.declared_annual_investment),
        "monthly_tds_override": text(row.monthly_tds_override),
        "opening_ytd_gross": text(row.opening_ytd_gross),
        "opening_ytd_tds": text(row.opening_ytd_tds),
        "opening_income_year_start": row.opening_income_year_start,
        "opening_through_date": row.opening_through_date,
    }


def _engine_kwargs(body: TaxProfileBody | None, row: HrEmployeeTaxProfile | None) -> dict[str, Any]:
    if body is not None:
        values = parse_profile(body)
        return {
            "category_override": values["tax_category_override"],
            "disabled_children": values["disabled_children_count"],
            "rebate_mode": values["rebate_mode"],
            "declared_investment": values["declared_annual_investment"],
            "first_time_taxpayer": values["is_first_time_taxpayer"],
        }
    return tds_service.profile_kwargs(row)


def tds_estimate(
    *,
    tenant: Tenant,
    monthly_gross: Decimal,
    gender: str | None,
    date_of_birth: date | None,
    as_of: date | None = None,
    profile_body: TaxProfileBody | None = None,
    profile_row: HrEmployeeTaxProfile | None = None,
) -> dict[str, Any]:
    """Salary-only estimate for the Salary tab. Never raises for a missing / unsupported tax year."""
    as_of = as_of or today_local(tenant)
    employee_on = profile_body.tds_enabled if profile_body is not None else (profile_row is None or profile_row.tds_enabled)
    base: dict[str, Any] = {
        "estimate_basis": "SALARY_ONLY",
        "payroll_enabled": is_hr_bd_salary_tds_enabled(tenant.feature_flags),
        "employee_tds_enabled": employee_on,
        "supported": True,
        "message": None,
    }
    try:
        result = engine.estimate_monthly_tds(
            monthly_gross=monthly_gross,
            as_of=as_of,
            gender=gender,
            date_of_birth=date_of_birth,
            **_engine_kwargs(profile_body, profile_row),
        )
    except engine.UnsupportedTaxYear as exc:
        return {**base, "supported": False, "message": str(exc)}
    out = engine.jsonable(result)
    net = max(monthly_gross - result["monthly_tds"], Decimal("0"))
    return {**base, **out, "estimated_net_monthly": format(engine.money(net), "f")}


async def estimate_for_employee(
    db: AsyncSession, tenant: Tenant, employee: Employee, monthly_gross: Decimal
) -> dict[str, Any]:
    row = await tds_service.get_tax_profile(db, tenant.id, employee.id)
    return tds_estimate(
        tenant=tenant,
        monthly_gross=monthly_gross,
        gender=employee.gender,
        date_of_birth=employee.date_of_birth,
        profile_row=row,
    )
