"""Sprint 6: MIS reports HTTP API (fund flow, ratios, comparative, scenarios)."""

from __future__ import annotations

from datetime import date
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import (
    PERMISSION_MIS_REPORT_EXPORT,
    PERMISSION_MIS_REPORT_VIEW,
    PERMISSION_SCENARIO_ANALYSIS_VIEW,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_mis_reports_enabled
from app.database import get_db
from app.models import Tenant, User
from app.modules.finance.comparative_statement_service import (
    generate_comparative_balance_sheet,
    generate_comparative_pl,
)
from app.modules.finance.enhanced_cash_flow_service import (
    break_even_analysis,
    cash_runway,
    scenario_analysis,
    sensitivity_analysis,
)
from app.modules.finance.fund_flow_service import generate_fund_flow
from app.modules.finance.ratio_analysis_service import calculate_ratios, ratio_trend

router = APIRouter(tags=["finance-mis"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_mis(tenant: Tenant) -> None:
    if not is_mis_reports_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="MIS reports disabled. Set tenant feature flag mis_reports_enabled to true (or omit it).",
        )


class SensitivityBody(BaseModel):
    variable: str = "sales"
    change_percent: float = Field(default=-20)


@router.get("/finance/reports/fund-flow")
async def fund_flow_report(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_MIS_REPORT_VIEW)
    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = date(to_date.year, 1, 1)
    if from_date > to_date:
        raise HTTPException(status_code=400, detail="from_date must be <= to_date")
    return await generate_fund_flow(db, tenant.id, from_date=from_date, to_date=to_date)


@router.get("/finance/reports/ratio-analysis")
async def ratio_analysis_report(
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_MIS_REPORT_VIEW)
    return await calculate_ratios(db, tenant.id, as_of_date=as_of_date or date.today())


@router.get("/finance/reports/ratio-analysis/trend")
async def ratio_analysis_trend(
    ratio_name: str = Query(...),
    months: int = Query(default=6, ge=1, le=24),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_MIS_REPORT_VIEW)
    return await ratio_trend(db, tenant.id, ratio_name=ratio_name, months=months)


@router.get("/finance/reports/comparative-balance-sheet")
async def comparative_bs(
    year1: int = Query(...),
    year2: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_MIS_REPORT_VIEW)
    return await generate_comparative_balance_sheet(db, tenant.id, year1=year1, year2=year2)


@router.get("/finance/reports/comparative-pl")
async def comparative_pl(
    year1: int = Query(...),
    year2: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Comparative P&L (path uses comparative-pl; alias also registered)."""
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_MIS_REPORT_VIEW)
    return await generate_comparative_pl(db, tenant.id, year1=year1, year2=year2)


# Spec path with & is awkward in URLs — keep alias
@router.get("/finance/reports/comparative-p-and-l")
async def comparative_pl_alias(
    year1: int = Query(...),
    year2: int = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await comparative_pl(year1=year1, year2=year2, tenant=tenant, user=user, db=db)


@router.get("/finance/cash-flow/scenario-analysis")
async def cash_scenario(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_SCENARIO_ANALYSIS_VIEW)
    return await scenario_analysis(db, tenant.id)


@router.post("/finance/cash-flow/sensitivity")
async def cash_sensitivity(
    body: SensitivityBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_SCENARIO_ANALYSIS_VIEW)
    return await sensitivity_analysis(
        db, tenant.id, variable=body.variable, change_percent=body.change_percent
    )


@router.get("/finance/cash-flow/break-even")
async def cash_break_even(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_SCENARIO_ANALYSIS_VIEW)
    return await break_even_analysis(db, tenant.id)


@router.get("/finance/cash-flow/runway")
async def cash_runway_api(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_SCENARIO_ANALYSIS_VIEW)
    return await cash_runway(db, tenant.id)


@router.get("/finance/reports/mis-health")
async def mis_health_card(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Compact financial health for dashboard card."""
    _ensure_tenant(user, tenant)
    if not is_mis_reports_enabled(tenant.feature_flags):
        return {"enabled": False}
    ratios = await calculate_ratios(db, tenant.id, as_of_date=date.today())
    runway = await cash_runway(db, tenant.id)
    by_name = {r["name"]: r for r in ratios["ratios"]}
    return {
        "enabled": True,
        "net_profit": ratios["snapshot"]["net_profit"],
        "current_ratio": by_name.get("current_ratio"),
        "cash": ratios["snapshot"]["cash"],
        "ar": ratios["snapshot"]["ar"],
        "receivables_turnover": by_name.get("receivables_turnover"),
        "runway_months": runway.get("runway_months"),
        "links": {
            "fund_flow": "/app/finance/mis/fund-flow",
            "ratios": "/app/finance/mis/ratios",
            "comparative": "/app/finance/mis/comparative",
            "scenarios": "/app/finance/mis/cash-scenarios",
            "dashboard": "/app/finance/mis",
        },
    }


@router.get("/finance/reports/mis-export/{report_type}")
async def mis_export_meta(
    report_type: Literal["fund-flow", "ratios", "comparative-bs", "scenarios"],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export is JSON payload for frontend CSV/PDF helpers (permission gate)."""
    _ensure_tenant(user, tenant)
    _require_mis(tenant)
    await assert_soft_permission_allowed(db, user, tenant.id, PERMISSION_MIS_REPORT_EXPORT)
    return {"ok": True, "report_type": report_type, "format": "use_client_csv_pdf"}
