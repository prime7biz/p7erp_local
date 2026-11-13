"""Factory summary for the Control Tower panels (read-only, bounded and cheap).

- capacity: practical / firm / soft minutes and utilization for the window (corrected values only when
  `planning_math_v2` is on)
- overloaded and idle line-days (counts and the 10 worst)
- confirmed orders with a delivery date in the window: quick readiness check (confirmed + firm line booking only,
  NOT the full readiness) and delivery risk bands for at most 200 orders
"""
from __future__ import annotations

from collections import Counter
from datetime import date
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.modules.mfg_intelligence.capacity_service import (
    STATUS_IDLE,
    STATUS_OVERLOADED,
    compute_capacity,
)
from app.modules.mfg_intelligence.confirmed_demand import confirmed_status_clause
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant
from app.modules.mfg_intelligence.delivery_service import MAX_ORDERS, predict_deliveries
from app.modules.mfg_intelligence.line_loading_service import (
    CLASS_FIRM,
    CLASS_DRAFT,
    CLASS_SOFT,
    demand_class,
    fetch_order_plan_rows,
)

TOP_N = 10
BANDS = ("ON_TRACK", "AT_RISK", "LATE", "COMPLETE", "UNKNOWN")


async def build_summary(
    db: AsyncSession,
    tenant_id: int,
    *,
    window_start: date,
    window_end: date,
    factory_unit: str | None,
    today: date,
    planning_math_v2: bool,
    order_bom_v2: bool,
    include_tentative: bool = False,
    integrated_planning: bool = False,
) -> dict[str, Any]:
    cap = await compute_capacity(
        db,
        tenant_id,
        window_start=window_start,
        window_end=window_end,
        factory_unit=factory_unit,
        include_tentative=include_tentative,
        integrated_planning=integrated_planning,
        today=today,
    )
    notices = list(cap.notices)

    practical = firm = soft = draft = firm_known = ZERO
    unknown_days = 0
    overloaded: list[dict[str, Any]] = []
    idle: list[dict[str, Any]] = []
    for lc in cap.lines:
        for d in lc.days:
            firm += d.load.firm
            soft += d.load.soft
            draft += d.load.draft
            if not d.is_working_day:
                continue
            if d.practical_minutes is None:
                unknown_days += 1
                continue
            if d.load_complete:
                practical += d.practical_minutes
                firm_known += d.load.firm
            else:
                unknown_days += 1  # a firm row with unknown SMV also loads this day; keep it out of the totals
            if d.status == STATUS_OVERLOADED:
                overloaded.append(
                    {
                        "line_id": lc.line.id,
                        "line_code": lc.line.line_code,
                        "date": d.day,
                        "firm_smv_minutes": dec_str(d.load.firm),
                        "practical_smv_minutes": dec_str(d.practical_minutes),
                        "overload_smv_minutes": dec_str(d.load.firm - d.practical_minutes),
                        "_sort": d.load.firm - d.practical_minutes,
                    }
                )
            elif d.status == STATUS_IDLE:
                idle.append(
                    {
                        "line_id": lc.line.id,
                        "line_code": lc.line.line_code,
                        "date": d.day,
                        "practical_smv_minutes": dec_str(d.practical_minutes),
                        "_sort": d.practical_minutes,
                    }
                )
    overloaded.sort(key=lambda x: (-x["_sort"], x["date"], x["line_id"]))
    idle.sort(key=lambda x: (-x["_sort"], x["date"], x["line_id"]))
    for item in overloaded + idle:
        item.pop("_sort", None)

    if planning_math_v2:
        capacity_out: dict[str, Any] = {
            "practical_smv_minutes": dec_str(practical),
            "firm_smv_minutes": dec_str(firm),
            "soft_smv_minutes": dec_str(soft),
            "draft_smv_minutes": dec_str(draft),
            "firm_available_smv_minutes": dec_str(practical - firm_known),
            "utilization_pct": dec_str(quant(firm_known / practical * 100, 2)) if practical > ZERO else None,
            "unknown_line_days": unknown_days,
        }
        overloaded_out = {"count": len(overloaded), "top": overloaded[:TOP_N]}
        idle_out = {"count": len(idle), "top": idle[:TOP_N]}
    else:
        notices.append("planning_math_v2 off")
        capacity_out = {
            "practical_smv_minutes": None,
            "firm_smv_minutes": dec_str(firm),
            "soft_smv_minutes": dec_str(soft),
            "draft_smv_minutes": dec_str(draft),
            "firm_available_smv_minutes": None,
            "utilization_pct": None,
            "unknown_line_days": None,
        }
        overloaded_out = {"count": None, "top": []}
        idle_out = {"count": None, "top": []}
    capacity_out["line_count"] = len(cap.lines)

    # Confirmed orders (ex-factory date in the window), bounded.
    order_filter = (
        Order.tenant_id == tenant_id,
        confirmed_status_clause(),
        Order.delivery_date >= window_start,
        Order.delivery_date <= window_end,
    )
    total_orders = (await db.execute(select(func.count()).select_from(Order).where(*order_filter))).scalar_one()
    orders = list(
        (
            await db.execute(
                select(Order).where(*order_filter).order_by(Order.delivery_date, Order.id).limit(MAX_ORDERS)
            )
        )
        .scalars()
        .all()
    )
    truncated = int(total_orders) > len(orders)
    if truncated:
        notices.append(f"ORDERS_TRUNCATED: {len(orders)} of {total_orders} confirmed orders evaluated")
    if factory_unit:
        notices.append("factory_unit filters capacity only; orders are not split by factory unit")

    plan_rows = await fetch_order_plan_rows(db, tenant_id, [o.id for o in orders])
    classes_by_order: dict[int, set[str]] = {}
    for r in plan_rows:
        klass = demand_class(r.reservation_status)
        if klass:
            classes_by_order.setdefault(int(r.order_id), set()).add(klass)
    quick = {"firm_booked": 0, "soft_or_draft_only": 0, "not_booked": 0}
    for o in orders:
        klasses = classes_by_order.get(o.id, set())
        if CLASS_FIRM in klasses:
            quick["firm_booked"] += 1
        elif klasses & {CLASS_SOFT, CLASS_DRAFT}:
            quick["soft_or_draft_only"] += 1
        else:
            quick["not_booked"] += 1

    predictions = await predict_deliveries(
        db,
        tenant_id,
        orders,
        today=today,
        planning_math_v2=planning_math_v2,
        order_bom_v2=False,
        include_details=False,
        integrated_planning=integrated_planning,
    )
    counts = Counter(p["band"] for p in predictions)
    risk = {band: counts.get(band, 0) for band in BANDS}
    notices.append("Delivery risk in the summary does not check material readiness (see each order's prediction).")

    return {
        "date_from": window_start,
        "date_to": window_end,
        "factory_unit": factory_unit,
        "flags": {"planning_math_v2": planning_math_v2, "mfg_order_bom_readiness_v2": order_bom_v2},
        "capacity": capacity_out,
        "overloaded": overloaded_out,
        "idle": idle_out,
        "orders": {
            "confirmed_total": int(total_orders),
            "evaluated": len(orders),
            "truncated": truncated,
            "readiness_quick_check": quick,
            "delivery_risk": risk,
        },
        "notices": notices,
    }
