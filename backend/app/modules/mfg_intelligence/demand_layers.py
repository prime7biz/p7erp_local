"""Forward-plan demand layers (Manufacturing Intelligence Phase 5; doc 16 D4-D7, 15.2-15.4). Read-only.

Every piece of demand sits in exactly one layer (minutes = quantity x SMV per piece, 4 decimals):

    CONFIRMED_PLANNED_FIRM / _SOFT  remaining minutes of live rows of confirmed orders (FIRM_BOOKED + IN_PROGRESS /
                                    SOFT_BOOKED), re-spread evenly over the row's working days from max(start, today)
    UNCONFIRMED_ORDER_ROWS          live rows of orders that are not confirmed (booked load, separate layer)
    UNLINKED_ROWS                   live rows without an order
    OVERDUE_PLANNED_BACKLOG         live rows that ended before today with work left (first bucket)
    CONFIRMED_UNPLANNED             max(0, order qty - planned qty of FIRM / SOFT / IN_PROGRESS / COMPLETED rows, any date)
                                    spread backward from need-by over ceil(minutes / median line daily practical
                                    minutes) working days, clipped at today
    OVERDUE_UNPLANNED               the clipped part (first bucket)
    TENTATIVE_FULL / _WEIGHTED      counted tentative bookings (Phase 2 dedupe), full and x confidence: two views of the
                                    same rows, never added together
    FORECAST_RESIDUAL               forecast_demand_service (never part of confirmed)

Identity per confirmed order (quantity terms): order qty = completed + remaining on live rows + unplanned
(OVER_PLANNED when planned > order qty; unplanned is then 0). DRAFT rows never load and are never planned
(count only, DRAFT_ROWS_PRESENT). need-by = delivery date - open POST-sewing lead days (integrated planning on; else
the delivery date, reason POST_SEWING_NOT_APPLIED). Unknown SMV / quantity is counted, never zero.
Query budget (independent of the number of orders): orders 1, plan rows 1, SMV <= 3 (+ <= 3 for stale rows), route
stages 1, unconfirmed orders without rows 1.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from sqlalchemy import and_, exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, SewingLineStyleConfig
from app.modules.mfg_intelligence import forward_plan_params as fp
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext
from app.modules.mfg_intelligence.capacity_service import CapacityResult
from app.modules.mfg_intelligence.confirmed_demand import CONFIRMED_ORDER_STATUSES, confirmed_status_clause
from app.modules.mfg_intelligence.cpm_service import order_smv_map
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.line_loading_service import (
    CLASS_DRAFT,
    CLASS_FIRM,
    CLASS_SOFT,
    MAX_PLAN_ROWS,
    demand_class,
    fetch_order_plan_rows,
    row_end_date,
)
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows

MAX_ORDERS = 2000
MAX_IDENTITY_ROWS = 200
MAX_PLACEMENT_DAYS = 400
HUNDRED = Decimal("100")
_LOOKBACK_DAYS = 60  # rows ending earlier than this are not in the capacity read (fetch_live_plan_rows)

KIND_UNPLANNED = "UNPLANNED"
KIND_TENTATIVE = "TENTATIVE"
KIND_FORECAST = "FORECAST"


@dataclass
class DemandItem:
    """One unit of uncommitted or unplanned demand (capacity-constrained admission, finance cut)."""

    kind: str
    key: str
    days_by_layer: dict[str, dict[date, Decimal]]
    priority: tuple
    meta: dict[str, Any] = field(default_factory=dict)

    @property
    def minutes(self) -> Decimal:
        return sum((m for days in self.days_by_layer.values() for m in days.values()), ZERO)


@dataclass
class DemandLayers:
    today: date
    end: date
    days: dict[str, dict[date, Decimal]]
    unplanned_items: list[DemandItem]
    tentative_items: list[DemandItem]  # weighted layer; meta carries the full minutes
    tentative_rows: list[dict[str, Any]]  # (style, end, full minutes) for forecast consumption
    identity: list[dict[str, Any]]
    identity_totals: dict[str, Decimal]
    counts: dict[str, int]
    beyond_horizon: dict[str, Decimal]
    reason_codes: list[str]
    notices: list[str]
    order_meta: dict[int, dict[str, Any]]
    median_daily_minutes: Decimal | None

    def add(self, layer: str, day: date, minutes: Decimal) -> None:
        slot = self.days.setdefault(layer, {})
        slot[day] = slot.get(day, ZERO) + minutes


def spread_even(minutes: Decimal, days: list[date]) -> dict[date, Decimal]:
    """Even split in 4 decimals; the last day takes the rounding remainder so the sum is exact."""
    if not days:
        return {}
    share = quant(minutes / Decimal(len(days)), 4)
    out = {d: share for d in days}
    out[days[-1]] = minutes - share * Decimal(len(days) - 1)
    return out


def _ceil(value: Decimal) -> int:
    return int(value.to_integral_value(rounding=ROUND_CEILING))


def respread(
    minutes: Decimal, start: date, end: date, *, today: date, horizon_end: date, calendar: CalendarContext
) -> tuple[dict[date, Decimal], Decimal, bool]:
    """(minutes per day inside the horizon, minutes beyond the horizon, overdue) for one live row (15.3)."""
    if end < today:
        return {today: minutes}, ZERO, True
    first = max(start, today)
    days = calendar.working_days(first, end)
    if not days:
        d = calendar.first_working_on_or_after(first)
        days = [d] if d is not None else [first]
    alloc = spread_even(minutes, days)
    inside = {d: m for d, m in alloc.items() if d <= horizon_end}
    beyond = sum((m for d, m in alloc.items() if d > horizon_end), ZERO)
    return inside, beyond, False


def place_unplanned(
    minutes: Decimal,
    need_by: date,
    *,
    today: date,
    median_daily: Decimal | None,
    calendar: CalendarContext,
) -> tuple[dict[date, Decimal], Decimal, list[str]]:
    """RCCP lead-time offset (15.4): (minutes per day >= today, overdue minutes for the first bucket, reasons)."""
    if median_daily is None or median_daily <= ZERO:
        if need_by < today:
            return {}, minutes, ["UNPLANNED_AT_NEED_BY_BUCKET", "OVERDUE_UNPLANNED"]
        return {need_by: minutes}, ZERO, ["UNPLANNED_AT_NEED_BY_BUCKET"]
    if need_by < today:
        return {}, minutes, ["OVERDUE_UNPLANNED"]
    n = max(1, min(MAX_PLACEMENT_DAYS, _ceil(minutes / median_daily)))
    share = quant(minutes / Decimal(n), 4)
    picked: list[date] = []
    cur = need_by
    while len(picked) < n and cur >= today:
        if calendar.is_working(cur):
            picked.append(cur)
        cur -= timedelta(days=1)
    reasons: list[str] = []
    if not picked:
        return {}, minutes, ["OVERDUE_UNPLANNED"]
    out = {d: share for d in picked}
    overdue = minutes - share * Decimal(len(picked))
    if len(picked) < n:
        reasons.append("OVERDUE_UNPLANNED")
    else:
        # all n days inside: the earliest day takes the rounding remainder so the sum is exact
        out[picked[-1]] += overdue
        overdue = ZERO
    return out, overdue, reasons


def median_daily_practical(cap: CapacityResult) -> Decimal | None:
    """Median over lines of each line's median known working-day practical minutes (plan basis)."""
    per_line: list[Decimal] = []
    for lc in cap.lines:
        vals = [d.practical_minutes for d in lc.days if d.is_working_day and d.practical_minutes is not None and d.practical_minutes > ZERO]
        m = st.median(vals)
        if m is not None:
            per_line.append(m)
    return st.median(per_line)


async def load_tentative_consumption(db: AsyncSession, tenant_id: int, *, today: date, end: date) -> list[dict[str, Any]]:
    """Counted tentative bookings of the horizon as (style, end date, full minutes) for forecast consumption."""
    from app.modules.mfg_intelligence.tentative_demand_service import fetch_tentative_rows

    rows = await fetch_tentative_rows(db, tenant_id, window_start=today, window_end=end)
    if not rows:
        return []
    smv = await resolve_smv_for_rows(db, tenant_id, rows, use_style_standard=True)
    out = []
    for r in rows:
        value = smv[r.id].value
        if value is not None:
            out.append({"style_id": r.style_id, "end_date": row_end_date(r), "minutes": quant(r.planned_qty * value, 4)})
    return out


def _layer_for(klass: str, confirmed: bool | None, order_id: Any) -> str:
    if order_id and confirmed:
        return fp.L_CONFIRMED_FIRM if klass == CLASS_FIRM else fp.L_CONFIRMED_SOFT
    if order_id:
        return fp.L_UNCONFIRMED
    return fp.L_UNLINKED


async def load_demand_layers(
    db: AsyncSession,
    tenant_id: int,
    cap: CapacityResult,
    *,
    today: date,
    end: date,
    integrated: bool,
    factory_unit: str | None,
) -> DemandLayers:
    calendar = cap.loading.calendar
    line_ids = {lc.line.id for lc in cap.lines}
    median_daily = median_daily_practical(cap)
    out = DemandLayers(
        today=today, end=end, days={}, unplanned_items=[], tentative_items=[], tentative_rows=[], identity=[],
        identity_totals={}, counts={
            "draft_rows": 0, "rows_smv_unknown": 0, "rows_unclassified": 0, "bookings_smv_unknown": 0,
            "orders_confirmed": 0, "orders_qty_unknown": 0, "orders_smv_unknown": 0, "orders_undated": 0,
            "orders_over_planned": 0, "unplanned_need_by_beyond_horizon": 0, "unconfirmed_orders_without_rows": 0,
            "rows_starting_beyond_horizon": 0,
        },
        beyond_horizon={}, reason_codes=[], notices=[], order_meta={}, median_daily_minutes=median_daily,
    )

    def beyond(layer: str, minutes: Decimal) -> None:
        if minutes > ZERO:
            out.beyond_horizon[layer] = out.beyond_horizon.get(layer, ZERO) + minutes

    # ---- booked rows and tentative bookings read by the capacity call (window today .. end, 60-day look-back)
    loaded_ids: set[int] = set()
    for item in cap.loading.rows:
        cfg = item.cfg
        if getattr(cfg, "is_tentative", False):
            if item.smv.value is None:
                out.counts["bookings_smv_unknown"] += 1
                continue
            full = quant(item.remaining_qty * item.smv.value, 4)
            conf = to_dec(getattr(cfg, "confidence_pct", None)) or ZERO
            weighted = quant(full * conf / HUNDRED, 4)
            days_full, beyond_full, overdue = respread(full, cfg.start_date, row_end_date(cfg), today=today, horizon_end=end, calendar=calendar)
            days_w, beyond_w, _ = respread(weighted, cfg.start_date, row_end_date(cfg), today=today, horizon_end=end, calendar=calendar)
            for d, m in days_full.items():
                out.add(fp.L_TENTATIVE_FULL, d, m)
            for d, m in days_w.items():
                out.add(fp.L_TENTATIVE_WEIGHTED, d, m)
            beyond(fp.L_TENTATIVE_FULL, beyond_full)
            beyond(fp.L_TENTATIVE_WEIGHTED, beyond_w)
            out.tentative_items.append(
                DemandItem(
                    kind=KIND_TENTATIVE,
                    key=f"booking:{cfg.booking_id}",
                    days_by_layer={fp.L_TENTATIVE_WEIGHTED: days_w},
                    priority=(-conf, cfg.start_date, int(cfg.booking_id)),
                    meta={
                        "booking_id": int(cfg.booking_id), "line_id": int(cfg.line_id), "style_id": cfg.style_id,
                        "inquiry_id": cfg.inquiry_id, "quotation_id": cfg.quotation_id, "start_date": cfg.start_date,
                        "end_date": row_end_date(cfg), "planned_qty": to_dec(cfg.planned_qty) or ZERO,
                        "confidence_pct": conf, "full_minutes": full, "weighted_minutes": weighted,
                        "past_end": overdue,
                    },
                )
            )
            out.tentative_rows.append({"style_id": cfg.style_id, "end_date": row_end_date(cfg), "minutes": full})
            continue
        loaded_ids.add(int(cfg.id))
        klass = item.demand_class
        if klass is None:
            out.counts["rows_unclassified"] += 1
            continue
        if klass == CLASS_DRAFT:
            out.counts["draft_rows"] += 1
            continue
        if item.remaining_qty <= ZERO:
            continue
        if item.smv.value is None or item.load_minutes is None:
            out.counts["rows_smv_unknown"] += 1
            continue
        layer = _layer_for(klass, item.order_confirmed, cfg.order_id)
        days, extra, overdue = respread(item.load_minutes, cfg.start_date, row_end_date(cfg), today=today, horizon_end=end, calendar=calendar)
        target = fp.L_OVERDUE_PLANNED if overdue else layer
        for d, m in days.items():
            out.add(target, d, m)
        beyond(layer, extra)

    # ---- confirmed orders: identity, stale rows, unplanned remainder
    orders = list(
        (
            await db.execute(
                select(Order)
                .where(Order.tenant_id == tenant_id, confirmed_status_clause())
                .order_by(Order.delivery_date.asc().nulls_last(), Order.id)
                .limit(MAX_ORDERS + 1)
            )
        ).scalars().all()
    )
    if len(orders) > MAX_ORDERS:
        orders = orders[:MAX_ORDERS]
        out.notices.append(f"ORDERS_TRUNCATED: only the first {MAX_ORDERS} confirmed orders (by delivery date) are used")
    out.counts["orders_confirmed"] = len(orders)
    order_ids = [o.id for o in orders]
    rows = await fetch_order_plan_rows(db, tenant_id, order_ids, include_completed=True) if order_ids else []
    if len(rows) >= MAX_PLAN_ROWS:
        out.notices.append(f"ORDER_PLAN_ROWS_TRUNCATED: only the first {MAX_PLAN_ROWS} plan rows of confirmed orders were used")
    rows_by_order: dict[int, list[Any]] = {}
    for r in rows:
        rows_by_order.setdefault(int(r.order_id), []).append(r)
    smv_by_order = await order_smv_map(
        db, tenant_id, {o.id: o.style_id for o in orders}, use_style_standard=integrated, plan_rows=rows
    ) if orders else {}
    stages: dict[int, list[Any]] | None = None
    if integrated and order_ids:
        from app.modules.mfg_intelligence.route_stage_service import external_stages_for_orders

        stages = await external_stages_for_orders(db, tenant_id, order_ids)
    else:
        out.reason_codes.append("POST_SEWING_NOT_APPLIED")

    # stale live rows of confirmed orders (ended before the capacity look-back) are still overdue backlog
    stale = [
        r for r in rows
        if int(r.id) not in loaded_ids and r.line_id in line_ids and demand_class(r.reservation_status) in (CLASS_FIRM, CLASS_SOFT)
        and row_end_date(r) < today - timedelta(days=_LOOKBACK_DAYS)
        and (to_dec(r.planned_qty) or ZERO) > (to_dec(r.completed_qty) or ZERO)
    ]
    if stale:
        stale_smv = await resolve_smv_for_rows(db, tenant_id, stale, use_style_standard=integrated)
        for r in stale:
            smv = stale_smv[r.id].value
            if smv is None:
                out.counts["rows_smv_unknown"] += 1
                continue
            remaining = max(ZERO, (to_dec(r.planned_qty) or ZERO) - (to_dec(r.completed_qty) or ZERO))
            out.add(fp.L_OVERDUE_PLANNED, today, quant(remaining * smv, 4))
    out.counts["rows_starting_beyond_horizon"] = sum(
        1 for r in rows if r.line_id in line_ids and demand_class(r.reservation_status) in (CLASS_FIRM, CLASS_SOFT) and r.start_date > end
    )

    tot = {"order_qty": ZERO, "completed_qty": ZERO, "remaining_qty": ZERO, "unplanned_qty": ZERO}
    if factory_unit:
        out.notices.append(
            "UNPLANNED_NOT_ATTRIBUTED_TO_UNIT: unplanned confirmed quantity has no line yet, so it is left out when a "
            "factory unit is selected (shown in the identity list only)."
        )
    for o in orders:
        o_rows = rows_by_order.get(o.id, [])
        qty = to_dec(o.quantity)
        planned = completed = remaining = ZERO
        drafts = 0
        for r in o_rows:
            status = (r.reservation_status or "").strip().upper()
            klass = demand_class(status)
            if klass == CLASS_DRAFT:
                drafts += 1
                continue
            if klass in (CLASS_FIRM, CLASS_SOFT) or status == "COMPLETED":
                p = to_dec(r.planned_qty) or ZERO
                c = to_dec(r.completed_qty) or ZERO
                planned += p
                completed += c
                if klass in (CLASS_FIRM, CLASS_SOFT):
                    remaining += max(ZERO, p - c)
        reasons: list[str] = []
        if drafts:
            reasons.append("DRAFT_ROWS_PRESENT")
        smv_res = smv_by_order.get(o.id)
        smv = smv_res.value if smv_res is not None else None
        lead = 0
        if stages is not None:
            from app.modules.mfg_intelligence.route_stage_service import open_post_sewing_lead_days

            lead = open_post_sewing_lead_days(stages.get(o.id, []))
        else:
            reasons.append("POST_SEWING_NOT_APPLIED")
        need_by = (o.delivery_date - timedelta(days=lead)) if o.delivery_date is not None else None
        unplanned: Decimal | None = None
        if qty is None or qty <= ZERO:
            reasons.append("QTY_UNKNOWN")
            out.counts["orders_qty_unknown"] += 1
        else:
            unplanned = max(ZERO, qty - planned)
            if planned > qty:
                reasons.append("OVER_PLANNED")
                out.counts["orders_over_planned"] += 1
            tot["order_qty"] += qty
            tot["completed_qty"] += completed
            tot["remaining_qty"] += remaining
            tot["unplanned_qty"] += unplanned
        out.order_meta[o.id] = {
            "order_code": o.order_code, "style_id": o.style_id, "need_by": need_by, "smv": smv, "draft_rows": drafts,
            "first_live_start": min(
                (r.start_date for r in o_rows if demand_class(r.reservation_status) in (CLASS_FIRM, CLASS_SOFT)),
                default=None,
            ),
        }
        if len(out.identity) < MAX_IDENTITY_ROWS:
            out.identity.append({
                "order_id": o.id,
                "order_code": o.order_code,
                "delivery_date": o.delivery_date,
                "need_by_date": need_by,
                "order_qty": dec_str(qty, 3),
                "completed_qty": dec_str(completed, 3),
                "remaining_qty": dec_str(remaining, 3),
                "unplanned_qty": dec_str(unplanned, 3),
                "smv_per_piece": dec_str(smv, 4),
                "draft_rows": drafts,
                "reason_codes": list(reasons),
            })
        if unplanned is None or unplanned <= ZERO or factory_unit:
            continue
        if smv is None:
            out.counts["orders_smv_unknown"] += 1
            continue
        if need_by is None:
            out.counts["orders_undated"] += 1
            continue
        minutes = quant(unplanned * smv, 4)
        if need_by > end:
            out.counts["unplanned_need_by_beyond_horizon"] += 1
            beyond(fp.L_UNPLANNED, minutes)
            continue
        days, overdue, place_reasons = place_unplanned(minutes, need_by, today=today, median_daily=median_daily, calendar=calendar)
        by_layer: dict[str, dict[date, Decimal]] = {}
        if days:
            by_layer[fp.L_UNPLANNED] = days
        if overdue > ZERO:
            by_layer[fp.L_OVERDUE_UNPLANNED] = {today: overdue}
        for layer, ds in by_layer.items():
            for d, m in ds.items():
                out.add(layer, d, m)
        if "UNPLANNED_AT_NEED_BY_BUCKET" in place_reasons and "UNPLANNED_AT_NEED_BY_BUCKET" not in out.reason_codes:
            out.reason_codes.append("UNPLANNED_AT_NEED_BY_BUCKET")
        out.unplanned_items.append(
            DemandItem(
                kind=KIND_UNPLANNED, key=f"order:{o.id}", days_by_layer=by_layer,
                priority=(need_by, o.order_code or "", o.id),
                meta={"order_id": o.id, "order_code": o.order_code, "need_by": need_by, "unplanned_qty": unplanned,
                      "minutes": minutes, "reason_codes": place_reasons},
            )
        )
    out.identity_totals = tot
    if len(orders) > MAX_IDENTITY_ROWS:
        out.notices.append(f"IDENTITY_TRUNCATED: the identity list shows the first {MAX_IDENTITY_ROWS} confirmed orders")
    if out.counts["draft_rows"] or any("DRAFT_ROWS_PRESENT" in i["reason_codes"] for i in out.identity):
        out.reason_codes.append("DRAFT_ROWS_PRESENT")

    # ---- unconfirmed orders that have no live plan rows are not demand (notice, 15.18)
    cfg = SewingLineStyleConfig
    status = func.upper(func.trim(Order.status))
    out.counts["unconfirmed_orders_without_rows"] = int(
        (
            await db.execute(
                select(func.count(Order.id)).where(
                    Order.tenant_id == tenant_id,
                    status.notin_((*CONFIRMED_ORDER_STATUSES, "CANCELLED", "COMPLETED")),
                    ~exists().where(
                        and_(
                            cfg.tenant_id == tenant_id,
                            cfg.order_id == Order.id,
                            func.upper(func.trim(cfg.reservation_status)).notin_(("CANCELLED", "COMPLETED", "DRAFT")),
                        )
                    ),
                )
            )
        ).scalar_one()
        or 0
    )
    if out.counts["unconfirmed_orders_without_rows"]:
        out.notices.append(
            f"UNCONFIRMED_ORDERS_WITHOUT_ROWS: {out.counts['unconfirmed_orders_without_rows']} unconfirmed order(s) "
            "have no line plan rows and are not counted as demand."
        )
    return out
