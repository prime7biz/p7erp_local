"""Impact of a what-if plan change (read-only; plan revision preview and the figures stored on a revision).

Compares the stored plan ("before") with the same plan plus a `Scenario` ("after"), using the Phase 1 engines:
- delivery: likely completion date and band per affected order (max 50 orders)
- overload: days a line is OVERLOADED (firm load above practical capacity), per affected line, in a window that
  covers the affected rows (max 180 days)
- material: for orders that gain a FIRM row, an expected-material-date warning when materials are not ready.
  A FIRM row for a confirmed order is allowed even when materials are not ready (owner rule): this is a warning only.

Nothing here writes. Output uses plain dicts / Decimal strings, never ORM objects.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.modules.mfg_intelligence.capacity_service import STATUS_OVERLOADED, compute_capacity
from app.modules.mfg_intelligence.delivery_service import predict_deliveries
from app.modules.mfg_intelligence.readiness_service import READY, compute_material
from app.modules.mfg_intelligence.scenario import Scenario

MAX_IMPACT_ORDERS = 50
MAX_IMPACT_ITEMS = 50
MAX_IMPACT_WINDOW_DAYS = 180
MAX_NEW_OVERLOAD_DATES = 20


def _delivery_view(d: dict[str, Any]) -> dict[str, Any]:
    return {
        "band": d.get("band"),
        "likely_complete_date": d.get("likely_complete_date"),
        "delay_days": d.get("delay_days"),
        "reason_codes": d.get("reason_codes") or [],
    }


def _delta_days(before: date | None, after: date | None) -> int | None:
    if before is None or after is None:
        return None
    return (after - before).days


async def compute_scenario_impact(
    db: AsyncSession,
    tenant_id: int,
    scenario: Scenario,
    *,
    today: date,
    planning_math_v2: bool,
    order_bom_v2: bool,
    allocation_v1: bool,
    integrated_planning: bool = False,
) -> dict[str, Any]:
    notices: list[str] = []
    order_ids = sorted(scenario.order_ids)
    if len(order_ids) > MAX_IMPACT_ORDERS:
        order_ids = order_ids[:MAX_IMPACT_ORDERS]
        notices.append(f"ORDERS_TRUNCATED: only the first {MAX_IMPACT_ORDERS} affected orders are compared")
    orders: list[Order] = []
    if order_ids:
        orders = list(
            (
                await db.execute(
                    select(Order).where(Order.tenant_id == tenant_id, Order.id.in_(order_ids)).order_by(Order.id)
                )
            )
            .scalars()
            .all()
        )

    # ---- delivery before / after
    deliveries: list[dict[str, Any]] = []
    if orders:
        common = dict(
            today=today,
            planning_math_v2=planning_math_v2,
            order_bom_v2=order_bom_v2,
            include_details=False,
            allocation_v1=allocation_v1,
            integrated_planning=integrated_planning,
        )
        before = {d["order_id"]: d for d in await predict_deliveries(db, tenant_id, orders, **common)}
        after = {d["order_id"]: d for d in await predict_deliveries(db, tenant_id, orders, scenario=scenario, **common)}
        for o in orders:
            b, a = before[o.id], after[o.id]
            deliveries.append(
                {
                    "order_id": o.id,
                    "order_code": o.order_code,
                    "target_date": o.delivery_date,
                    "before": _delivery_view(b),
                    "after": _delivery_view(a),
                    "likely_delta_days": _delta_days(b.get("likely_complete_date"), a.get("likely_complete_date")),
                    "band_changed": b.get("band") != a.get("band"),
                }
            )

    # ---- overload before / after
    overload: list[dict[str, Any]] = []
    window_start = window_end = None
    if scenario.line_ids and scenario.date_min is not None and scenario.date_max is not None:
        window_start = min(scenario.date_min, scenario.date_max)
        window_end = max(scenario.date_min, scenario.date_max)
        if (window_end - window_start).days + 1 > MAX_IMPACT_WINDOW_DAYS:
            window_end = window_start + timedelta(days=MAX_IMPACT_WINDOW_DAYS - 1)
            notices.append(f"WINDOW_TRUNCATED: overload is compared for the first {MAX_IMPACT_WINDOW_DAYS} days only")
        line_ids = sorted(scenario.line_ids)
        staffing = dict(integrated_planning=integrated_planning, today=today)
        cap_before = await compute_capacity(
            db, tenant_id, window_start=window_start, window_end=window_end, line_ids=line_ids, **staffing
        )
        cap_after = await compute_capacity(
            db, tenant_id, window_start=window_start, window_end=window_end, line_ids=line_ids, scenario=scenario,
            **staffing,
        )

        def overloaded(cap: Any) -> dict[int, set[date]]:
            out: dict[int, set[date]] = {}
            for lc in cap.lines:
                out[lc.line.id] = {d.day for d in lc.days if d.status == STATUS_OVERLOADED}
            return out

        ob_days, oa_days = overloaded(cap_before), overloaded(cap_after)
        codes = {lc.line.id: lc.line.line_code for lc in cap_after.lines}
        for lid in sorted(codes):
            b_days, a_days = ob_days.get(lid, set()), oa_days.get(lid, set())
            overload.append(
                {
                    "line_id": lid,
                    "line_code": codes[lid],
                    "overload_days_before": len(b_days),
                    "overload_days_after": len(a_days),
                    "newly_overloaded_dates": sorted(a_days - b_days)[:MAX_NEW_OVERLOAD_DATES],
                }
            )

    # ---- material warnings for orders gaining a FIRM row
    material: list[dict[str, Any]] = []
    gain = set(scenario.gaining_firm_order_ids)
    for o in orders:
        if o.id not in gain:
            continue
        if allocation_v1:
            from app.modules.mfg_intelligence.allocation_readiness_service import compute_material_v3

            res = await compute_material_v3(db, tenant_id, o)
        else:
            res = await compute_material(db, tenant_id, o)
        ready = res.status == READY
        material.append(
            {
                "order_id": o.id,
                "order_code": o.order_code,
                "material_status": res.status,
                "materials_ready": ready,
                "expected_material_date": res.expected_material_date,
                "warning": None
                if ready
                else "Materials are not ready. The FIRM booking is still allowed for a confirmed order.",
                "reason_codes": list(res.reason_codes),
            }
        )

    worse = [
        d["order_id"]
        for d in deliveries
        if (d["likely_delta_days"] or 0) > 0 or (d["band_changed"] and d["after"]["band"] in ("LATE", "AT_RISK"))
    ]
    more_overload = [x["line_id"] for x in overload if x["overload_days_after"] > x["overload_days_before"]]
    return {
        "window_start": window_start,
        "window_end": window_end,
        "orders_compared": len(orders),
        "deliveries": deliveries,
        "overload": overload,
        "material_warnings": [m for m in material if m["warning"]],
        "material": material,
        "summary": {
            "orders_delayed_or_at_risk": len(worse),
            "lines_with_more_overload": len(more_overload),
            "material_warnings": sum(1 for m in material if m["warning"]),
        },
        "notices": notices,
    }
