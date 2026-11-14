"""Finance > Management Performance API (docs/management-performance/). Mounted inside the finance router.

All paths under /api/v1/finance/mgmt-performance. Tenant flag `mgmt_performance_v1` must be exactly true (else 404).
Reads never write. Money (company figures) needs admin / manager or an explicit `finance.mgmt_performance.view`;
cost-centre owners see only their own budget rows and exceptions (access.py).

  GET  /access                              what the current user may see / do (for the screen)
  GET  /summary?period=                     accounting profit, finished-goods contribution, opex, targets
  GET  /budget-forecast?period=             budget, actual, committed, forecast, status per cost centre x category
  GET  /fg-contribution?period=&limit&offset   finished-goods receipts valued per order
  GET  /targets?period=                     break-even, production, marketing gap, profit target
  GET  /cash?horizon_days=                  weekly collections, payments, funding gap
  GET/PUT /setup/category-map | /setup/thresholds | /setup/targets | /setup/cost-center-owners
  GET  /revisions   POST /revisions   POST /revisions/{id}/approve|reject
  GET  /exceptions  POST /exceptions/scan   POST /exceptions/{id}/respond|review|approve|reject
"""

from __future__ import annotations

import logging
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE
from app.common.permissions import (
    PERMISSION_BUDGET_EXCEPTION_APPROVE,
    PERMISSION_BUDGET_EXCEPTION_RESPOND,
    PERMISSION_BUDGET_EXCEPTION_REVIEW,
    PERMISSION_BUDGET_REVISION_APPROVE,
    PERMISSION_MGMT_PERFORMANCE_SETUP,
)
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.finance.budget_analytics.common import month_key
from app.modules.finance.mgmt_performance import exception_service, revision_service, setup_service
from app.modules.finance.mgmt_performance.access import (
    assert_action,
    assert_company_view,
    ensure_enabled,
    has_action,
    viewer_scope,
)
from app.modules.finance.mgmt_performance.contribution_service import compute_contribution, order_out
from app.modules.finance.mgmt_performance.expense_forecast_service import compute_forecast, forecast_payload
from app.modules.finance.mgmt_performance.periods import parse_period
from app.modules.finance.mgmt_performance.summary_service import (
    CASH_HORIZON_DEFAULT,
    CASH_HORIZON_MAX,
    build_summary,
    cash_forecast,
)
from app.modules.finance.mgmt_performance.targets_service import compute_targets, load_targets, targets_out

router = APIRouter(prefix="/mgmt-performance", tags=["finance-mgmt-performance"])
_log = logging.getLogger(__name__)

REQUEST_ID = r"^[A-Za-z0-9_-]{8,64}$"
PERIOD_Q = Query(default=None, max_length=12, description="2026-11 | 2026-Q2 | FY2026 (default: current month)")


async def _guard_read(db: AsyncSession, exc: Exception) -> HTTPException:
    if isinstance(exc, ValueError):
        return HTTPException(status_code=422, detail=str(exc))
    await safe_async_session_rollback(db)
    _log.exception("mgmt_performance_read_failed")
    return HTTPException(status_code=503, detail="The report could not be calculated, please retry")


async def _guarded_write(db: AsyncSession, scope: str, call):
    """Run a write; a raw database error rolls the session back and answers 503 (HTTP errors pass through)."""
    try:
        return await call()
    except SQLAlchemyError:
        await safe_async_session_rollback(db)
        _log.exception("mgmt_performance_write_failed scope=%s", scope)
        raise HTTPException(status_code=503, detail="Could not save, please retry") from None


def _period(text: str | None, tenant: Tenant):
    try:
        return parse_period(text, tenant)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from None


# ------------------------------------------------------------------ reads


@router.get("/access")
async def mp_access(tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    try:
        scope = await viewer_scope(db, user, tenant)
    except HTTPException as exc:
        if exc.status_code != 403:
            raise
        return {"company": False, "cost_center_ids": [], "allowed": False}
    return {
        "allowed": True,
        "company": scope.company,
        "cost_center_ids": sorted(scope.cost_center_ids),
        "payroll_visible": scope.payroll_visible,
        "can_setup": await has_action(db, user, tenant, PERMISSION_MGMT_PERFORMANCE_SETUP),
        "can_respond_unowned": await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_RESPOND),
        "can_review": await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_REVIEW),
        "can_decide": await has_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_APPROVE),
        "can_approve_revisions": await has_action(db, user, tenant, PERMISSION_BUDGET_REVISION_APPROVE),
        "user_id": user.id,
    }


@router.get("/summary")
async def mp_summary(period: str | None = PERIOD_Q, tenant: Tenant = Depends(require_tenant),
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    p = _period(period, tenant)
    scope = await viewer_scope(db, user, tenant)
    try:
        return await build_summary(db, tenant, p, scope)
    except (ValueError, SQLAlchemyError) as exc:
        raise await _guard_read(db, exc) from None


@router.get("/budget-forecast")
async def mp_budget_forecast(period: str | None = PERIOD_Q, tenant: Tenant = Depends(require_tenant),
                             user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    scope = await viewer_scope(db, user, tenant)
    p = _period(period, tenant)
    try:
        return forecast_payload(await compute_forecast(db, tenant, p), scope)
    except (ValueError, SQLAlchemyError) as exc:
        raise await _guard_read(db, exc) from None


@router.get("/fg-contribution")
async def mp_fg_contribution(period: str | None = PERIOD_Q, limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
                             offset: int = Query(default=0, ge=0), tenant: Tenant = Depends(require_tenant),
                             user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    p = _period(period, tenant)
    try:
        c = await compute_contribution(db, tenant, p)
    except (ValueError, SQLAlchemyError) as exc:
        raise await _guard_read(db, exc) from None
    fmt = lambda v: format(v, "f") if v is not None else None  # noqa: E731
    return {
        "period": {"kind": p.kind, "label": p.label, "start": p.start, "end": p.end},
        "totals": {
            "value": fmt(c.value), "direct_cost": fmt(c.direct_cost), "contribution": fmt(c.contribution),
            "contribution_pct": fmt(c.contribution_pct), "counted_qty": fmt(c.counted_qty),
            "contribution_per_piece": fmt(c.contribution_per_piece),
        },
        "orders_total": len(c.orders),
        "unknown_orders": c.unknown_orders,
        "receipts_without_order": {"rows": c.receipts_without_order_rows, "qty": fmt(c.receipts_without_order_qty)},
        "pipeline": {"orders": c.pipeline_orders, "value": fmt(c.pipeline_value), "contribution": fmt(c.pipeline_contribution),
                     "unknown_orders": c.pipeline_unknown_orders},
        "order_book_contribution_pct": fmt(c.order_book_contribution_pct),
        "fg_stock_groups": c.fg_groups,
        "truncated": c.truncated,
        "reason_codes": c.reason_codes,
        "items": [order_out(o) for o in c.orders[offset:offset + limit]],
        "limit": limit,
        "offset": offset,
        "notes": ["Estimate - not posted. Counted quantity never exceeds the order quantity across periods."],
    }


@router.get("/targets")
async def mp_targets(period: str | None = PERIOD_Q, tenant: Tenant = Depends(require_tenant),
                     user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    p = _period(period, tenant)
    try:
        forecast = await compute_forecast(db, tenant, p)
        contribution = await compute_contribution(db, tenant, p)
        t = compute_targets(forecast, contribution, await load_targets(db, tenant.id, p.months))
    except (ValueError, SQLAlchemyError) as exc:
        raise await _guard_read(db, exc) from None
    return {"period": {"kind": p.kind, "label": p.label, "start": p.start, "end": p.end}, "base_currency": forecast.base_currency,
            **targets_out(t)}


@router.get("/cash")
async def mp_cash(horizon_days: int = Query(default=CASH_HORIZON_DEFAULT, ge=7, le=CASH_HORIZON_MAX),
                  tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    p = _period(None, tenant)
    try:
        return await cash_forecast(db, tenant, p.today, horizon_days)
    except (ValueError, SQLAlchemyError) as exc:
        raise await _guard_read(db, exc) from None


# ------------------------------------------------------------------ setup


class CategoryMapItem(BaseModel):
    account_id: int | None = Field(default=None, ge=1)
    account_group_id: int | None = Field(default=None, ge=1)
    category: str | None = Field(default=None, max_length=32)


class CategoryMapBody(BaseModel):
    items: list[CategoryMapItem] = Field(default_factory=list, max_length=500)


class ThresholdItem(BaseModel):
    category: str = Field(max_length=32)
    warning_pct: str = Field(max_length=16)


class ThresholdsBody(BaseModel):
    items: list[ThresholdItem] = Field(default_factory=list, max_length=20)


class TargetBody(BaseModel):
    period_month: str = Field(max_length=7)
    target_profit_amount: str = Field(max_length=24)
    contingency_pct: str = Field(max_length=16)
    notes: str | None = Field(default=None, max_length=1000)


class OwnerBody(BaseModel):
    cost_center_id: int = Field(ge=1)
    owner_user_id: int | None = Field(default=None, ge=1)


@router.get("/setup/category-map")
async def mp_category_map(tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    return await setup_service.category_map_view(db, tenant.id)


@router.put("/setup/category-map")
async def mp_category_map_save(body: CategoryMapBody, tenant: Tenant = Depends(require_tenant),
                               user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_action(db, user, tenant, PERMISSION_MGMT_PERFORMANCE_SETUP)
    await setup_service.save_category_map(db, tenant, user, [i.model_dump() for i in body.items])
    return await setup_service.category_map_view(db, tenant.id)


@router.get("/setup/thresholds")
async def mp_thresholds(tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    return {"items": await setup_service.thresholds_view(db, tenant.id)}


@router.put("/setup/thresholds")
async def mp_thresholds_save(body: ThresholdsBody, tenant: Tenant = Depends(require_tenant),
                             user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_action(db, user, tenant, PERMISSION_MGMT_PERFORMANCE_SETUP)
    await setup_service.save_thresholds(db, tenant, user, [i.model_dump() for i in body.items])
    return {"items": await setup_service.thresholds_view(db, tenant.id)}


@router.get("/setup/targets")
async def mp_targets_setup(fiscal_year: str | None = Query(default=None, max_length=8, description="FY2026"),
                           tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user),
                           db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    p = _period(fiscal_year or None, tenant)
    if p.kind == "month":
        p = _period(f"FY{p.start.year if p.start.month >= p.fy_start_month else p.start.year - 1}", tenant)
    return {"fiscal_year": p.label, "items": await setup_service.targets_view(db, tenant.id, [month_key(m) for m in p.months])}


@router.put("/setup/targets")
async def mp_targets_save(body: TargetBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user),
                          db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_action(db, user, tenant, PERMISSION_MGMT_PERFORMANCE_SETUP)
    await setup_service.save_target(db, tenant, user, body.model_dump())
    return {"ok": True}


@router.get("/setup/cost-center-owners")
async def mp_owners(tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_company_view(db, user, tenant)
    return await setup_service.owners_view(db, tenant.id)


@router.put("/setup/cost-center-owners")
async def mp_owner_save(body: OwnerBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_action(db, user, tenant, PERMISSION_MGMT_PERFORMANCE_SETUP)
    await setup_service.save_owner(db, tenant, user, body.cost_center_id, body.owner_user_id)
    return {"ok": True}


# ------------------------------------------------------------------ revisions


class RevisionBody(BaseModel):
    request_id: str = Field(pattern=REQUEST_ID)
    kind: Literal["CHANGE", "ADD_LINE"]
    budget_line_id: int | None = Field(default=None, ge=1)
    budget_id: int | None = Field(default=None, ge=1)
    cost_center_id: int | None = Field(default=None, ge=1)
    account_id: int | None = Field(default=None, ge=1)
    period_month: str | None = Field(default=None, max_length=7)
    new_amount: str = Field(max_length=24)
    reason: str = Field(max_length=2000)
    exception_id: int | None = Field(default=None, ge=1)


class DecisionBody(BaseModel):
    note: str | None = Field(default=None, max_length=2000)


@router.get("/revisions")
async def mp_revisions(status: Literal["PENDING", "APPROVED", "REJECTED"] | None = None,
                       limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(default=0, ge=0),
                       tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    scope = await viewer_scope(db, user, tenant)
    return await revision_service.list_revisions(db, tenant, user, scope, status=status, limit=limit, offset=offset)


@router.post("/revisions", status_code=201)
async def mp_revision_create(body: RevisionBody, tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    row, replay = await _guarded_write(db, "revision_create", lambda: revision_service.request_revision(db, tenant, user, **body.model_dump()))
    return {**await _revision_response(db, tenant, user, row), "replay": replay}


async def _revision_response(db: AsyncSession, tenant: Tenant, user: User, row) -> dict[str, Any]:
    try:
        payroll_visible = (await viewer_scope(db, user, tenant)).payroll_visible
    except HTTPException:
        payroll_visible = False
    hidden = await revision_service.payroll_restricted_check(db, tenant.id, payroll_visible)
    return revision_service.revision_out(row, restricted=hidden(row.account_id))


@router.post("/revisions/{revision_id}/{decision}")
async def mp_revision_decide(revision_id: int, decision: Literal["approve", "reject"], body: DecisionBody,
                             tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    row, replay = await _guarded_write(db, "revision_decide", lambda: revision_service.decide_revision(
        db, tenant, user, revision_id, approve=decision == "approve", note=body.note))
    return {**await _revision_response(db, tenant, user, row), "replay": replay}


# ------------------------------------------------------------------ exceptions


class ExceptionActionBody(BaseModel):
    request_id: str = Field(pattern=REQUEST_ID)
    reason: str | None = Field(default=None, max_length=2000)
    corrective_action: str | None = Field(default=None, max_length=2000)
    revised_forecast: str | None = Field(default=None, max_length=24)
    note: str | None = Field(default=None, max_length=2000)


@router.get("/exceptions")
async def mp_exceptions(month: str | None = Query(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$"),
                        status: Literal["OPEN", "RESPONDED", "REVIEWED", "APPROVED", "REJECTED"] | None = None,
                        family: Literal["BUDGET", "UNBUDGETED", "UNMAPPED"] | None = None,
                        limit: int = Query(default=DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE), offset: int = Query(default=0, ge=0),
                        tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    scope = await viewer_scope(db, user, tenant)
    return await exception_service.list_exceptions(db, tenant, user, scope, month=month, status=status, family=family,
                                                   limit=limit, offset=offset)


@router.post("/exceptions/scan")
async def mp_exceptions_scan(tenant: Tenant = Depends(require_tenant), user: User = Depends(get_current_user),
                             db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    await assert_action(db, user, tenant, PERMISSION_BUDGET_EXCEPTION_REVIEW)
    try:
        counts = await exception_service.scan_tenant(db, tenant, actor_user_id=user.id)
        await db.commit()
    except SQLAlchemyError:
        await safe_async_session_rollback(db)
        _log.exception("mgmt_performance_scan_failed")
        raise HTTPException(status_code=503, detail="The budget scan failed, please retry") from None
    return counts


@router.post("/exceptions/{exception_id}/{action}")
async def mp_exception_action(exception_id: int, action: Literal["respond", "review", "approve", "reject"],
                              body: ExceptionActionBody, tenant: Tenant = Depends(require_tenant),
                              user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    ensure_enabled(user, tenant)
    row, replay = await _guarded_write(db, "exception_action", lambda: exception_service.act(
        db, tenant, user, exception_id, action.upper(), request_id=body.request_id, reason=body.reason,
        corrective_action=body.corrective_action, revised_forecast=body.revised_forecast, note=body.note,
    ))
    return {"id": row.id, "status": row.status, "severity": row.severity, "replay": replay}


__all__: list[Any] = ["router"]
