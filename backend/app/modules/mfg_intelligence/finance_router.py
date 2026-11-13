"""Manufacturing Intelligence Phase 3 API: cost at completion and cash requirement. GET only, read-only.

Prefix ``/api/v1/mfg-intelligence`` (shared with the Phase 1 / 2 routers). Every endpoint:
1. needs `production.planning.read` AND `finance.access` (router-level; RBAC modes as usual)
2. needs the signed-in user to belong to the resolved tenant (403 "Tenant mismatch")
3. returns 404 "Not found" unless `manufacturing_intelligence_v1` and the endpoint flag are exactly true
   (`mfg_cost_intelligence_v1` for cost at completion, `mfg_financial_readiness_v1` for the cash requirement)
4. passes the finance gate in EVERY RBAC mode (admin / manager role, or finance.access + finance.mis_report.view
   explicitly granted; else 403)
5. never writes; another tenant's order id is 404

| Endpoint                                   | Flag                         |
|--------------------------------------------|------------------------------|
| GET /orders/{order_id}/cost-at-completion  | mfg_cost_intelligence_v1     |
| GET /cost-at-completion?status&limit&offset| mfg_cost_intelligence_v1     |
| GET /cash-requirement?date_from&horizon_days | mfg_financial_readiness_v1 |
"""
from __future__ import annotations

import logging
import time
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.permissions import require_internal_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Order, Tenant, User
from app.modules.mfg_intelligence import schemas
from app.modules.mfg_intelligence.cash_requirement_service import (
    DEFAULT_HORIZON_DAYS,
    MAX_HORIZON_DAYS,
    build_cash_requirement,
)
from app.modules.mfg_intelligence.confirmed_demand import CONFIRMED_ORDER_STATUSES, confirmed_status_clause
from app.modules.mfg_intelligence.cost_at_completion_service import (
    ASSUMPTIONS,
    MAX_ORDERS,
    build_order_cost,
    cpm_block,
    gl_actual_block,
    load_batch,
    margin_pct,
)
from app.modules.mfg_intelligence.decimals import ZERO
from app.modules.mfg_intelligence.finance_gate import assert_mfg_finance_view
from app.modules.mfg_intelligence.flags import (
    integrated_planning_on,
    planning_math_v2_on,
    require_cost_intelligence_enabled,
    require_financial_readiness_enabled,
)
from app.modules.mfg_intelligence.money import base_currency, m4

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/mfg-intelligence",
    tags=["mfg-intelligence-finance"],
    dependencies=[
        Depends(require_internal_permission("production.planning.read")),
        Depends(require_internal_permission("finance.access")),
    ],
)


MAX_DATE_FROM_YEARS = 5


def _shift_years(day: date, years: int) -> date:
    try:
        return day.replace(year=day.year + years)
    except ValueError:  # 29 February
        return day.replace(year=day.year + years, day=28)


def _ensure_tenant_user(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _log(endpoint: str, tenant_id: int, started: float, **counts: int) -> None:
    logger.info(
        "mfg_intelligence endpoint=%s tenant_id=%s duration_ms=%d %s",
        endpoint,
        tenant_id,
        int((time.perf_counter() - started) * 1000),
        " ".join(f"{k}={v}" for k, v in counts.items()),
    )


@router.get("/orders/{order_id}/cost-at-completion", response_model=schemas.OrderCostDetailOut)
async def mfg_order_cost_at_completion(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_cost_intelligence_enabled(tenant)
    await assert_mfg_finance_view(db, user, tenant)
    started = time.perf_counter()
    order = (
        await db.execute(select(Order).where(Order.tenant_id == tenant.id, Order.id == order_id))
    ).scalar_one_or_none()
    if order is None:
        raise HTTPException(status_code=404, detail="Order not found")
    data = await load_batch(db, tenant, [order], today=today_local(tenant), use_style_standard=integrated_planning_on(tenant))
    payload = build_order_cost(order, data, tenant)
    from app.modules.finance.control.profitability_service import build_entity_profit

    profit = await build_entity_profit(db, tenant, kind="order", entity_id=order.id, from_date=None, to_date=None)
    procured = data.procured.get(order.id)
    payload["gl_actual"] = gl_actual_block(profit, procured.base if procured is not None else ZERO)
    payload["cpm_detail"] = cpm_block(data.cpm)
    payload["assumptions"] = list(ASSUMPTIONS)
    _log("cost-at-completion", tenant.id, started, orders=1)
    return payload


@router.get("/cost-at-completion", response_model=schemas.CostListOut)
async def mfg_cost_at_completion_list(
    status_filter: Literal["NEW", "CONFIRMED", "IN_PROGRESS"] | None = Query(None, alias="status"),
    limit: int = Query(50, ge=1, le=MAX_ORDERS),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Confirmed orders (NEW / CONFIRMED / IN_PROGRESS), earliest delivery first. Batched: no per-order queries."""
    _ensure_tenant_user(user, tenant)
    require_cost_intelligence_enabled(tenant)
    await assert_mfg_finance_view(db, user, tenant)
    started = time.perf_counter()
    conds = [Order.tenant_id == tenant.id, confirmed_status_clause()]
    if status_filter in CONFIRMED_ORDER_STATUSES:
        conds.append(func.upper(func.trim(Order.status)) == status_filter)
    total = int((await db.execute(select(func.count()).select_from(Order).where(*conds))).scalar_one())
    orders = list(
        (
            await db.execute(
                select(Order)
                .where(*conds)
                .order_by(Order.delivery_date.asc().nulls_last(), Order.id)
                .limit(limit)
                .offset(offset)
            )
        )
        .scalars()
        .all()
    )
    data = await load_batch(db, tenant, orders, today=today_local(tenant), use_style_standard=integrated_planning_on(tenant))
    items = [build_order_cost(o, data, tenant) for o in orders]
    revenue = eac = ZERO
    counted = 0
    for it in items:
        net, cost = it["revenue"]["net"]["amount"], it["eac"]["amount"]
        if it["status"] == "UNKNOWN" or net is None or cost is None:
            continue
        revenue += Decimal(net)
        eac += Decimal(cost)
        counted += 1
    margin = revenue - eac
    _log("cost-at-completion-list", tenant.id, started, orders=len(items))
    return {
        "base_currency": base_currency(tenant),
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
        "totals": {
            "revenue_net": m4(revenue),
            "eac": m4(eac),
            "margin": m4(margin),
            "margin_pct": m4(margin_pct(margin, revenue)),
            "orders_counted": counted,
            "orders_excluded": len(items) - counted,
        },
        "cpm": cpm_block(data.cpm),
        "assumptions": list(ASSUMPTIONS),
    }


@router.get("/cash-requirement", response_model=schemas.CashRequirementOut)
async def mfg_cash_requirement(
    date_from: date | None = Query(None, description="First day of week 1 (default: today in the tenant time zone)"),
    horizon_days: int = Query(DEFAULT_HORIZON_DAYS, ge=1, le=MAX_HORIZON_DAYS),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_financial_readiness_enabled(tenant)
    await assert_mfg_finance_view(db, user, tenant)
    started = time.perf_counter()
    today = today_local(tenant)
    if date_from is not None and not (_shift_years(today, -MAX_DATE_FROM_YEARS) <= date_from <= _shift_years(today, MAX_DATE_FROM_YEARS)):
        raise HTTPException(status_code=422, detail=f"date_from must be within {MAX_DATE_FROM_YEARS} years of today")
    payload = await build_cash_requirement(
        db,
        tenant,
        date_from=date_from or today,
        horizon_days=horizon_days,
        today=today,
        planning_math_v2=planning_math_v2_on(tenant),
        integrated_planning=integrated_planning_on(tenant),
    )
    _log("cash-requirement", tenant.id, started, rows=payload["row_count"], weeks=len(payload["weeks"]))
    return payload
