"""Delivery prediction (Phase 1, deterministic; doc 07 section 2). Read-only.

Target = `orders.delivery_date` (ex-factory). For a confirmed order:
    produced   = sum of completed_qty of the order's line plan rows (CANCELLED rows ignored)
    remaining  = max(0, order quantity - produced)
    rate       = sum over the order's FIRM rows (one per line) of corrected practical pieces per working day
    start      = max(today, earliest live (not cancelled / completed) plan row start), moved to the first working day
    likely     = the ceil(remaining / rate)-th working day counted from `start` (start is working day 1)
    optimistic = rate x 1.10, pessimistic = rate x 0.85 (fixed Phase 1 bands)
Band: ON_TRACK (likely <= target), AT_RISK (pessimistic > target >= likely), LATE (likely > target),
COMPLETE (nothing remaining), UNKNOWN (an input is missing). A date is never invented.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HourlyProductionEntry, Order
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext, load_calendar
from app.modules.mfg_intelligence.capacity_service import compute_capacity
from app.modules.mfg_intelligence.confirmed_demand import is_confirmed_status
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, to_dec
from app.modules.mfg_intelligence.line_loading_service import (
    CLASS_DRAFT,
    CLASS_FIRM,
    CLASS_SOFT,
    demand_class,
    fetch_order_plan_rows,
)
from app.modules.mfg_intelligence.readiness_service import AUTH_ORDER_BOM, BLOCKED, PARTIAL, compute_material
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows
from app.modules.production.calendar_service import add_working_days

BAND_ON_TRACK = "ON_TRACK"
BAND_AT_RISK = "AT_RISK"
BAND_LATE = "LATE"
BAND_UNKNOWN = "UNKNOWN"
BAND_COMPLETE = "COMPLETE"

OPTIMISTIC_FACTOR = Decimal("1.10")
PESSIMISTIC_FACTOR = Decimal("0.85")
HORIZON_DAYS = 1000  # we never look further than this many calendar days ahead
MAX_ORDERS = 200

BASE_ASSUMPTIONS = [
    "Target date is the order delivery date, which is the ex-factory date.",
    "Rate uses corrected practical pieces per working day of each firm-booked line (one row per line).",
    "A line is assumed fully available to this order; sharing a line with other orders is not split in Phase 1.",
    "Optimistic rate = likely x 1.10 and pessimistic rate = likely x 0.85 (fixed Phase 1 bands).",
    "Finishing / QC buffer is 0 working days in Phase 1. The start day counts as working day 1.",
]
EXTERNAL_STAGE_ASSUMPTION = (
    "Integrated planning: open external POST-sewing stages (wash, print, embroidery, subcontract) add their lead "
    "time in calendar days after the sewing finish date, one after another; there is no subcontractor capacity."
)


def _days_needed(remaining: Decimal, rate: Decimal) -> int:
    return int((remaining / rate).to_integral_value(rounding=ROUND_CEILING))


def _finish_date(start: date, days: int, calendar: CalendarContext) -> date | None:
    if days <= 0:
        return start
    if days > HORIZON_DAYS:
        return None
    result = add_working_days(start, days, weekend_days=calendar.weekend_days, overrides=calendar.overrides)
    if (result - start).days > HORIZON_DAYS:
        return None
    return result


def _unknown(base: dict[str, Any], reasons: list[str], missing: list[str] | None = None) -> dict[str, Any]:
    base["band"] = BAND_UNKNOWN
    base["reason_codes"] = reasons
    base["missing_inputs"] = missing or []
    return base


async def predict_deliveries(
    db: AsyncSession,
    tenant_id: int,
    orders: list[Order],
    *,
    today: date,
    planning_math_v2: bool,
    order_bom_v2: bool,
    include_details: bool,
    allocation_v1: bool = False,
    scenario: Any | None = None,
    integrated_planning: bool = False,
) -> list[dict[str, Any]]:
    """One result per order. Batched: plan rows, SMV, calendar and capacity are loaded once for all orders.

    `scenario` (plan revision impact) swaps in what-if plan rows; None keeps the stored plan (Phase 1 output).
    `integrated_planning` (callers pass it only when mfg_integrated_planning_v1 is on): capacity uses line
    assignments, SMV may come from the approved style standard SMV, and open external POST-sewing stages (wash /
    print / embroidery / subcontract) add their lead time after the sewing finish date.
    """
    if not orders:
        return []
    order_ids = [o.id for o in orders]
    all_rows = await fetch_order_plan_rows(db, tenant_id, order_ids, include_completed=True, scenario=scenario)
    rows_by_order: dict[int, list[Any]] = defaultdict(list)
    for r in all_rows:
        rows_by_order[int(r.order_id)].append(r)

    firm_by_order: dict[int, list[Any]] = {}
    for oid, rows in rows_by_order.items():
        firm_by_order[oid] = sorted(
            (r for r in rows if demand_class(r.reservation_status) == CLASS_FIRM and not _completed(r)),
            key=lambda r: (r.start_date, r.id),
        )

    # The order starts at its earliest live (not cancelled, not completed) FIRM or SOFT plan row.
    # DRAFT rows are scenarios and never pull the forecast start earlier.
    live_start: dict[int, date] = {}
    for oid, rows in rows_by_order.items():
        starts = [
            r.start_date
            for r in rows
            if not _completed(r) and demand_class(r.reservation_status) in (CLASS_FIRM, CLASS_SOFT)
        ]
        if starts:
            live_start[oid] = min(starts)

    calendar = await load_calendar(db, tenant_id, today, today + timedelta(days=HORIZON_DAYS + 60))

    # One firm row per line per order (the earliest) decides that line's rate for the order.
    rate_row: dict[tuple[int, int], Any] = {}
    for oid, rows in firm_by_order.items():
        for r in rows:
            rate_row.setdefault((oid, int(r.line_id)), r)
    smv_by_row = await resolve_smv_for_rows(
        db, tenant_id, list(rate_row.values()), use_style_standard=integrated_planning
    )

    rep_day: dict[tuple[int, int], date | None] = {}
    days_by_line: dict[int, list[date]] = defaultdict(list)
    if planning_math_v2:
        for (oid, lid), r in rate_row.items():
            start = max(today, live_start.get(oid, r.start_date))
            first = calendar.first_working_on_or_after(start)
            rep_day[(oid, lid)] = first
            if first is not None:
                days_by_line[lid].append(first)
    capacity_by_line_day: dict[tuple[int, date], Any] = {}
    if days_by_line:
        all_days = [d for ds in days_by_line.values() for d in ds]
        cap = await compute_capacity(
            db,
            tenant_id,
            window_start=min(all_days),
            window_end=max(all_days),
            line_ids=sorted(days_by_line),
            days_by_line=days_by_line,
            scenario=scenario,
            integrated_planning=integrated_planning,
            today=today,
        )
        for lc in cap.lines:
            for dc in lc.days:
                capacity_by_line_day[(lc.line.id, dc.day)] = dc

    stages_by_order: dict[int, list[Any]] | None = None
    if integrated_planning:
        from app.modules.mfg_intelligence.route_stage_service import external_stages_for_orders

        stages_by_order = await external_stages_for_orders(db, tenant_id, order_ids)

    hourly: dict[int, Decimal] = {}
    if include_details:
        for oid, total in (
            await db.execute(
                select(HourlyProductionEntry.order_id, func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0))
                .where(HourlyProductionEntry.tenant_id == tenant_id, HourlyProductionEntry.order_id.in_(order_ids))
                .group_by(HourlyProductionEntry.order_id)
            )
        ).all():
            hourly[int(oid)] = to_dec(total) or ZERO

    results: list[dict[str, Any]] = []
    for order in orders:
        results.append(
            await _predict_one(
                db,
                tenant_id,
                order,
                rows=rows_by_order.get(order.id, []),
                firm=firm_by_order.get(order.id, []),
                live_start=live_start.get(order.id),
                rate_row=rate_row,
                smv_by_row=smv_by_row,
                rep_day=rep_day,
                capacity_by_line_day=capacity_by_line_day,
                calendar=calendar,
                today=today,
                planning_math_v2=planning_math_v2,
                order_bom_v2=order_bom_v2,
                include_details=include_details,
                hourly_good=hourly.get(order.id) if include_details else None,
                allocation_v1=allocation_v1,
                external_stages=stages_by_order.get(order.id, []) if stages_by_order is not None else None,
            )
        )
    return results


def _completed(r: Any) -> bool:
    return (r.reservation_status or "").strip().upper() == "COMPLETED"


async def _predict_one(
    db: AsyncSession,
    tenant_id: int,
    order: Order,
    *,
    rows: list[Any],
    firm: list[Any],
    live_start: date | None,
    rate_row: dict[tuple[int, int], Any],
    smv_by_row: dict[int, Any],
    rep_day: dict[tuple[int, int], date | None],
    capacity_by_line_day: dict[tuple[int, date], Any],
    calendar: CalendarContext,
    today: date,
    planning_math_v2: bool,
    order_bom_v2: bool,
    include_details: bool,
    hourly_good: Decimal | None,
    allocation_v1: bool = False,
    external_stages: list[Any] | None = None,
) -> dict[str, Any]:
    """`external_stages` is None unless mfg_integrated_planning_v1 is on (then the output gains
    `external_lead_time_days` and an assumption line)."""
    qty = to_dec(order.quantity)
    produced = sum((to_dec(r.completed_qty) or ZERO for r in rows), ZERO) if rows else None
    remaining = None
    if qty is not None and produced is not None:
        remaining = max(ZERO, qty - produced)
    base: dict[str, Any] = {
        "order_id": order.id,
        "order_code": order.order_code,
        "order_status": (order.status or "").strip().upper(),
        "target_date": order.delivery_date,
        "target_basis": "EX_FACTORY",
        "order_qty": dec_str(qty, 3),
        "produced_qty": dec_str(produced, 3),
        "hourly_good_qty": dec_str(hourly_good, 3) if hourly_good is not None else None,
        "remaining_qty": dec_str(remaining, 3),
        "start_date": None,
        "likely_complete_date": None,
        "optimistic_complete_date": None,
        "pessimistic_complete_date": None,
        "working_days_needed": None,
        "daily_rate_likely": None,
        "daily_rate_optimistic": None,
        "daily_rate_pessimistic": None,
        "delay_days": None,
        "early_days": None,
        "band": BAND_UNKNOWN,
        "reason_codes": [],
        "missing_inputs": [],
        "lines": [],
        "material": None,
        "assumptions": list(BASE_ASSUMPTIONS),
    }
    external_lead = 0
    if external_stages is not None:
        from app.modules.mfg_intelligence.route_stage_service import open_post_sewing_lead_days

        external_lead = open_post_sewing_lead_days(external_stages)
        base["external_lead_time_days"] = external_lead
        base["assumptions"].append(EXTERNAL_STAGE_ASSUMPTION)
    if not is_confirmed_status(order.status):
        return _unknown(base, ["ORDER_NOT_CONFIRMED"])
    if qty is None or qty <= ZERO:
        return _unknown(base, ["ORDER_QUANTITY_MISSING"], ["order_quantity"])
    if not rows:
        return _unknown(base, ["NO_LINE_PLAN"], ["line_plan"])
    assert remaining is not None
    if remaining == ZERO:
        base["band"] = BAND_COMPLETE
        base["reason_codes"] = ["NOTHING_REMAINING"]
        return base
    if not planning_math_v2:
        return _unknown(base, ["PLANNING_MATH_V2_OFF"])
    if not firm:
        return _unknown(base, ["NO_FIRM_LINE_PLAN"], ["firm_line_plan"])

    material_expected: date | None = None
    if order_bom_v2:
        if allocation_v1:
            from app.modules.mfg_intelligence.allocation_readiness_service import compute_material_v3

            material = await compute_material_v3(db, tenant_id, order)
        else:
            material = await compute_material(db, tenant_id, order)
        base["material"] = {"authority": material.authority, "status": material.status, "reason_codes": material.reason_codes}
        if allocation_v1:
            base["material"]["expected_material_date"] = material.expected_material_date
        if material.authority == AUTH_ORDER_BOM and material.status in (BLOCKED, PARTIAL):
            if allocation_v1 and material.expected_date_complete and material.expected_material_date is not None:
                material_expected = material.expected_material_date  # pegged supply is on its way: start after it
            else:
                return _unknown(base, ["MATERIAL_NOT_READY"], ["materials"])
    else:
        base["assumptions"].append("Material readiness is not considered (mfg_order_bom_readiness_v2 off).")

    missing: set[str] = set()
    reasons: list[str] = []
    if any(demand_class(r.reservation_status) == CLASS_DRAFT for r in rows):
        reasons.append("DRAFT_ROWS_IGNORED")
    rate = ZERO
    line_details: list[dict[str, Any]] = []
    for (oid, lid), r in sorted(rate_row.items()):
        if oid != order.id:
            continue
        day = rep_day.get((oid, lid))
        cap = capacity_by_line_day.get((lid, day)) if day is not None else None
        smv = smv_by_row[r.id].value
        units: Decimal | None = None
        line_missing: list[str] = []
        if day is None or cap is None:
            line_missing.append("working_day")
        elif cap.practical_minutes is None:
            # Capacity itself is unknown. (A day that only has another order's unresolved firm row still has
            # practical minutes; this order's own SMV is checked below.)
            line_missing.extend(cap.missing_inputs)
        if smv is None:
            line_missing.append("smv")
        if not line_missing and cap is not None and cap.practical_minutes is not None and smv is not None:
            units = cap.practical_minutes / smv
            rate += units
        else:
            missing.update(line_missing)
        line_details.append(
            {
                "line_id": lid,
                "plan_row_id": r.id,
                "capacity_date": day,
                "practical_smv_minutes": dec_str(cap.practical_minutes) if cap is not None else None,
                "smv_per_piece": dec_str(smv, 4),
                "practical_units_per_day": dec_str(units),
                "missing_inputs": line_missing,
            }
        )
    base["lines"] = line_details if include_details else []
    if missing or rate <= ZERO:
        reasons.append("RATE_UNKNOWN")
        return _unknown(base, reasons, sorted(missing) or ["rate"])

    start = calendar.first_working_on_or_after(max(today, live_start or firm[0].start_date))
    if start is None:
        return _unknown(base, ["NO_WORKING_DAY_FOUND"])
    if material_expected is not None and material_expected > start:
        start = calendar.first_working_on_or_after(material_expected)
        if start is None:
            return _unknown(base, ["NO_WORKING_DAY_FOUND"])
        reasons.append("MATERIAL_EXPECTED_DATE_USED")
    days_likely = _days_needed(remaining, rate)
    days_opt = _days_needed(remaining, rate * OPTIMISTIC_FACTOR)
    days_pess = _days_needed(remaining, rate * PESSIMISTIC_FACTOR)
    likely = _finish_date(start, days_likely, calendar)
    optimistic = _finish_date(start, days_opt, calendar)
    pessimistic = _finish_date(start, days_pess, calendar)
    base["start_date"] = start
    base["working_days_needed"] = days_likely
    base["daily_rate_likely"] = dec_str(rate)
    base["daily_rate_optimistic"] = dec_str(rate * OPTIMISTIC_FACTOR)
    base["daily_rate_pessimistic"] = dec_str(rate * PESSIMISTIC_FACTOR)
    if likely is None:
        return _unknown(base, ["COMPLETION_BEYOND_HORIZON"])
    if external_lead > 0:
        # Wash / print / embroidery / subcontract after sewing: lead-time only, calendar days after sewing ends.
        lead = timedelta(days=external_lead)
        likely = likely + lead
        optimistic = optimistic + lead if optimistic is not None else None
        pessimistic = pessimistic + lead if pessimistic is not None else None
        reasons.append("EXTERNAL_STAGE_LEAD_TIME_ADDED")
    base["likely_complete_date"] = likely
    base["optimistic_complete_date"] = optimistic
    base["pessimistic_complete_date"] = pessimistic

    target = order.delivery_date
    if target is None:
        return _unknown(base, ["NO_DELIVERY_DATE"], ["delivery_date"])
    delta = (likely - target).days
    base["delay_days"] = max(0, delta)
    base["early_days"] = max(0, -delta)
    if likely > target:
        band = BAND_LATE
    elif pessimistic is None or pessimistic > target:
        band = BAND_AT_RISK
    else:
        band = BAND_ON_TRACK
    base["band"] = band
    base["reason_codes"] = reasons
    return base
