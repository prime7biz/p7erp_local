"""Budget analytics, expense analysis and expense controls API (PLAN Phase 4). Mounted inside the finance router
(prefix /finance, finance.access).

  GET /finance/budget-analytics?fiscal_year=&budget_id=&dimension=cost_center|account|month|department
  GET /finance/budget-analytics/drilldown?fiscal_year=&budget_id=&cost_center_id=&account_id=&month=&limit=&offset=
  GET /finance/budget-analytics/export?...same as the first...   (CSV; needs finance.mis_report.export)
  GET /finance/expense-analysis?from_date=&to_date=&group_by=month|account|cost_center|vendor
  GET /finance/expense-controls?as_of_date=

All read-only. Tenant flag `finance_budget_analytics_v2` must be exactly true (otherwise 404); soft permission
`finance.mis_report.view` (explicit false -> 403). Another tenant's budget / cost centre / account looks "not found".
The existing `/finance/budgets/{id}/vs-actual` and budget enforcement are untouched.
"""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.common.permissions import PERMISSION_MIS_REPORT_EXPORT, PERMISSION_MIS_REPORT_VIEW, assert_soft_permission_allowed
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_finance_budget_analytics_v2_enabled
from app.database import get_db
from app.models import Tenant, User
from app.modules.finance.budget_analytics.analytics_service import analytics_to_csv, build_budget_analytics, build_drilldown
from app.modules.finance.budget_analytics.controls_service import build_expense_controls
from app.modules.finance.budget_analytics.expense_service import build_expense_analysis
from app.modules.finance.budget_analytics.schemas import (
    BudgetAnalyticsResponse,
    DrilldownResponse,
    ExpenseAnalysisResponse,
    ExpenseControlsResponse,
)

router = APIRouter(tags=["finance-budget-analytics"])


async def _gate(db: AsyncSession, tenant: Tenant, user: User, *, export: bool = False) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    if not is_finance_budget_analytics_v2_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_MIS_REPORT_VIEW)
    if export:
        await assert_soft_permission_allowed(db, user, tenant.id, permission_key=PERMISSION_MIS_REPORT_EXPORT)


def _error(exc: Exception) -> HTTPException:
    if isinstance(exc, LookupError):
        return HTTPException(status_code=404, detail="Not found")
    return HTTPException(status_code=422, detail=str(exc))


@router.get("/budget-analytics", response_model=BudgetAnalyticsResponse)
async def budget_analytics(
    fiscal_year: str | None = Query(default=None, max_length=16),
    budget_id: int | None = Query(default=None, ge=1),
    dimension: str = Query(default="cost_center", max_length=24),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user)
    try:
        return await build_budget_analytics(db, tenant, fiscal_year=fiscal_year, budget_id=budget_id, dimension=dimension)
    except (ValueError, LookupError) as exc:
        raise _error(exc) from None


@router.get("/budget-analytics/export")
async def budget_analytics_export(
    fiscal_year: str | None = Query(default=None, max_length=16),
    budget_id: int | None = Query(default=None, ge=1),
    dimension: str = Query(default="cost_center", max_length=24),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user, export=True)
    try:
        data = await build_budget_analytics(db, tenant, fiscal_year=fiscal_year, budget_id=budget_id, dimension=dimension)
    except (ValueError, LookupError) as exc:
        raise _error(exc) from None
    return Response(
        content=analytics_to_csv(data),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="budget-analytics-{dimension}.csv"'},
    )


@router.get("/budget-analytics/drilldown", response_model=DrilldownResponse)
async def budget_analytics_drilldown(
    fiscal_year: str | None = Query(default=None, max_length=16),
    budget_id: int | None = Query(default=None, ge=1),
    cost_center_id: int | None = Query(default=None, ge=1),
    no_cost_center: bool = Query(default=False),
    account_id: int | None = Query(default=None, ge=1),
    department: str | None = Query(default=None, max_length=128),
    no_department: bool = Query(default=False),
    month: str | None = Query(default=None, max_length=7),
    limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user)
    try:
        return await build_drilldown(
            db,
            tenant,
            fiscal_year=fiscal_year,
            budget_id=budget_id,
            cost_center_id=cost_center_id,
            no_cost_center=no_cost_center,
            account_id=account_id,
            department=department,
            no_department=no_department,
            month=month,
            limit=limit,
            offset=offset,
        )
    except (ValueError, LookupError) as exc:
        raise _error(exc) from None


@router.get("/expense-analysis", response_model=ExpenseAnalysisResponse)
async def expense_analysis(
    from_date: date | None = Query(default=None),
    to_date: date | None = Query(default=None),
    group_by: str = Query(default="month", max_length=24),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user)
    today = today_local(tenant)
    end = to_date or today
    start = from_date or end.replace(month=1, day=1)
    try:
        return await build_expense_analysis(db, tenant, from_date=start, to_date=end, group_by=group_by)
    except (ValueError, LookupError) as exc:
        raise _error(exc) from None


@router.get("/expense-controls", response_model=ExpenseControlsResponse)
async def expense_controls(
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _gate(db, tenant, user)
    try:
        return await build_expense_controls(db, tenant, as_of=as_of_date or today_local(tenant))
    except (ValueError, LookupError) as exc:
        raise _error(exc) from None
