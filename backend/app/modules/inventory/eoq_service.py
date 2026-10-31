"""Economic Order Quantity (Sprint I3)."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP
from math import sqrt
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.tenant_feature_keys import get_eoq_holding_cost_rate, get_eoq_ordering_cost
from app.models import Tenant
from app.models.costing import Item
from app.models.inventory import StockMovement

ZERO = Decimal("0")
Q4 = Decimal("0.0001")


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _q(v: Decimal) -> Decimal:
    return v.quantize(Q4, rounding=ROUND_HALF_UP)


async def _annual_demand(db: AsyncSession, tenant_id: int, item_id: int) -> Decimal:
    cutoff = date.today() - timedelta(days=365)
    rows = (
        await db.execute(
            select(StockMovement.quantity).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.item_id == item_id,
                StockMovement.movement_type == "OUT",
                StockMovement.movement_date >= cutoff,
            )
        )
    ).all()
    return _q(sum((_d(r[0]) for r in rows), ZERO))


def compute_eoq(
    annual_demand: Decimal,
    ordering_cost: Decimal,
    holding_cost_per_unit: Decimal,
) -> dict[str, Any]:
    d = _d(annual_demand)
    s = _d(ordering_cost)
    h = _d(holding_cost_per_unit)
    if d <= ZERO or s <= ZERO or h <= ZERO:
        return {
            "eoq": "0",
            "annual_demand": str(_q(d)),
            "ordering_cost": str(_q(s)),
            "holding_cost_per_unit": str(_q(h)),
            "order_frequency_per_year": 0.0,
            "orders_per_year": 0.0,
            "total_annual_cost": "0",
            "ordering_annual_cost": "0",
            "holding_annual_cost": "0",
        }
    eoq = Decimal(str(sqrt(float(2 * d * s / h))))
    eoq = _q(max(eoq, Decimal("0.0001")))
    orders_per_year = float(d / eoq) if eoq > ZERO else 0.0
    ordering_annual = _q(s * Decimal(str(orders_per_year)))
    holding_annual = _q(h * (eoq / Decimal("2")))
    total = _q(ordering_annual + holding_annual)
    return {
        "eoq": str(eoq),
        "annual_demand": str(_q(d)),
        "ordering_cost": str(_q(s)),
        "holding_cost_per_unit": str(_q(h)),
        "order_frequency_per_year": round(orders_per_year, 4),
        "orders_per_year": round(orders_per_year, 4),
        "total_annual_cost": str(total),
        "ordering_annual_cost": str(ordering_annual),
        "holding_annual_cost": str(holding_annual),
    }


async def calculate_eoq(
    db: AsyncSession,
    tenant: Tenant,
    item_id: int,
) -> dict[str, Any]:
    item = await db.get(Item, item_id)
    if not item or item.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")

    demand = await _annual_demand(db, tenant.id, item_id)
    ordering = Decimal(str(get_eoq_ordering_cost(tenant.feature_flags)))
    unit = _d(item.avg_cost) or _d(item.default_cost) or Decimal("1")
    rate = Decimal(str(get_eoq_holding_cost_rate(tenant.feature_flags)))
    holding = _q(max(unit * rate, Decimal("0.01")))

    result = compute_eoq(demand, ordering, holding)
    current_order = _d(item.reorder_qty) or _d(item.fixed_lot_size) or ZERO
    eoq_d = _d(result["eoq"])
    diff = abs(current_order - eoq_d) if eoq_d > ZERO else ZERO
    significant = eoq_d > ZERO and current_order > ZERO and (diff / eoq_d) > Decimal("0.20")
    # Rough savings vs ordering at current_order qty (if both positive)
    savings = ZERO
    if current_order > ZERO and eoq_d > ZERO and demand > ZERO:
        cur_orders = demand / current_order
        cur_cost = ordering * cur_orders + holding * (current_order / Decimal("2"))
        eoq_cost = _d(result["total_annual_cost"])
        savings = _q(max(cur_cost - eoq_cost, ZERO))

    return {
        "item_id": item.id,
        "item_code": item.item_code,
        "item_name": item.name,
        "abc_class": item.abc_class,
        "unit_cost": str(_q(unit)),
        "holding_cost_rate": float(rate),
        "current_order_qty": str(_q(current_order)),
        "differs_significantly": significant,
        "estimated_annual_savings": str(savings),
        **result,
    }


async def list_eoq_for_tenant(
    db: AsyncSession,
    tenant: Tenant,
    *,
    limit: int = 200,
) -> list[dict[str, Any]]:
    items = list(
        (
            await db.execute(
                select(Item)
                .where(Item.tenant_id == tenant.id, Item.is_active.is_(True))
                .order_by(Item.item_code)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    out: list[dict[str, Any]] = []
    for it in items:
        try:
            out.append(await calculate_eoq(db, tenant, it.id))
        except Exception:
            continue
    out.sort(key=lambda r: float(r.get("estimated_annual_savings") or 0), reverse=True)
    return out
