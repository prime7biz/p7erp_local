"""Calibrated-style delivery forecast P50 / P80 / P90 + on-time probability (Phase 4, read-only, deterministic).

Plan 15 sections 5.5, D10-D13, 17.1, 17.10-17.12, 17.14. Never changes `predict_deliveries` (Phase 1).

For a confirmed order (target = `orders.delivery_date`, ex-factory):
    remaining = max(0, order qty - completed qty of its plan rows)
    per firm line (earliest firm row per line, as Phase 1):
        operator_minutes = plan-basis capacity of the representative day (integrated_planning=False, 17.1)
        efficiency       = blended empirical / planned efficiency of the line x style family (5.2); PLANNED
                           uses the corrected practical minutes, so P50 equals the Phase 1 likely date then
        rate_line        = operator_minutes x efficiency / SMV
    spread (D11 / 17.14): k = clamp(ceil(remaining / rate_likely), 5, 20) production days; each line needs
        >= k + 9 days of history; rolling k-day mean efficiencies -> r_q = Q_(1-q) / Q_0.5 (nearest rank),
        clamped to [0.5, 1.5]; rate_q = sum rate_line x r_q(line)
    material (5.5, 17.10, 17.11): predicted receipt R_q of the open PO lines needed to cover each BOM shortage
        (shortage = requirement - free on-hand stock); `mfg_material_allocation_v1` on -> only this order's HARD
        pegs (readiness v3); off -> PO lines bought for this order first, then other unpegged lines in ETA order,
        marked SHARED_SUPPLY_NOT_ALLOCATED (confidence <= MEDIUM). Shortage not on order -> UNKNOWN.
    start_q  = first working day >= max(today, live plan start, material_ready_q)
    finish_q = add_working_days(start_q, ceil(remaining / rate_q)) (+ open POST-sewing stage days, integrated only)
    same q for material and rate (comonotonic, D12); finish dates forced monotone in q (17.12)
    p = largest grid q (0.05 .. 0.95) with finish_q <= target; ends stored as 0.025 / 0.975
    band ON_TRACK (p >= 0.8), AT_RISK (0.5 <= p < 0.8), LATE (p < 0.5), COMPLETE, UNKNOWN
Fixed-band fallback (any line without enough history): P50 = likely rate, P90 = likely x 0.85, P80 null,
probability null, reason INSUFFICIENT_HISTORY; band ON_TRACK (P90 <= target), AT_RISK (P50 <= target < P90), LATE.
An unknown input gives UNKNOWN; a date is never invented. No money.
"""
from __future__ import annotations

import hashlib
import json
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, Order, Tenant
from app.models.costing import Item
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext, load_calendar
from app.modules.mfg_intelligence.capacity_service import compute_capacity
from app.modules.mfg_intelligence.confirmed_demand import is_confirmed_status
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.empirical_efficiency_service import (
    CONF_HIGH,
    CONF_LOW,
    CONF_MEDIUM,
    SOURCE_PLANNED,
    EfficiencyEstimate,
    family_of,
    load_efficiency_history,
)
from app.modules.mfg_intelligence.flags import allocation_v1_on, integrated_planning_on, order_bom_readiness_v2_on
from app.modules.mfg_intelligence.line_loading_service import (
    CLASS_DRAFT,
    CLASS_FIRM,
    CLASS_SOFT,
    demand_class,
    fetch_order_plan_rows,
)
from app.modules.mfg_intelligence.readiness_service import AUTH_ORDER_BOM, SHORT_TOLERANCE
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows
from app.modules.mfg_intelligence.supplier_lateness_service import (
    SOURCE_RANK,
    SRC_UNKNOWN,
    LatenessModel,
    load_lateness_model,
    predicted_receipt,
)
from app.modules.production.calendar_service import add_working_days

MODEL_VERSION = "mi-forecast-4.0"
HORIZON_DAYS = 1000
MAX_ORDERS = 200
SPREAD_MIN_K = 5
SPREAD_MAX_K = 20
SPREAD_EXTRA_DAYS = 9
R_MIN = Decimal("0.5")
R_MAX = Decimal("1.5")
FALLBACK_P90_FACTOR = Decimal("0.85")
P_ON_TRACK = Decimal("0.8")
P_AT_RISK = Decimal("0.5")

BAND_ON_TRACK = "ON_TRACK"
BAND_AT_RISK = "AT_RISK"
BAND_LATE = "LATE"
BAND_UNKNOWN = "UNKNOWN"
BAND_COMPLETE = "COMPLETE"

SPREAD_EMPIRICAL = "EMPIRICAL_SPREAD"
SPREAD_FIXED = "FIXED_BANDS"

MAT_NOT_EVALUATED = "NOT_EVALUATED"
MAT_NONE_NEEDED = "NONE_NEEDED"
MAT_DATED = "DATED"
MAT_UNKNOWN = "UNKNOWN"

LATENESS_NONE = "NONE"
LATENESS_NOT_EVALUATED = "NOT_EVALUATED"

_CONF_RANK = {CONF_HIGH: 0, CONF_MEDIUM: 1, CONF_LOW: 2}

ASSUMPTIONS = [
    "Target date is the order delivery date, which is the ex-factory date.",
    "Capacity is plan basis: plan-row operator counts and shifts (no attendance or line assignments).",
    "Efficiency is the blended empirical / planned efficiency of each firm-booked line for the order's style family; "
    "with fewer than 10 production days of history the planned efficiency is used.",
    "A line is assumed fully available to this order (sharing a line with other orders is not split).",
    "P80 / P90 use the spread of rolling k-day efficiency on each line and the supplier lateness percentiles at the "
    "same probability (material and rate move together).",
    "Supplier lateness only delays PO dates taken from the PO expected date or order date + lead time; "
    "supplier-confirmed dates are used as given. A predicted receipt is never earlier than today.",
    "The forecast is not yet calibrated: probabilities are shown 'uncalibrated' until 30 outcomes are resolved.",
]
EXTERNAL_STAGE_ASSUMPTION = (
    "Integrated planning: open external POST-sewing stages add their lead time in calendar days after sewing ends."
)


def _ceil_days(remaining: Decimal, rate: Decimal) -> int:
    return int((remaining / rate).to_integral_value(rounding=ROUND_CEILING))


def _finish(start: date, days: int, calendar: CalendarContext) -> date | None:
    if days <= 0:
        return start
    if days > HORIZON_DAYS:
        return None
    result = add_working_days(start, days, weekend_days=calendar.weekend_days, overrides=calendar.overrides)
    if (result - start).days > HORIZON_DAYS:
        return None
    return result


def _min_conf(a: str, b: str) -> str:
    return a if _CONF_RANK[a] >= _CONF_RANK[b] else b


def probability_display(p: Decimal | None) -> str | None:
    if p is None:
        return None
    if p == st.GRID_LOW_END:
        return "< 5 %"
    if p == st.GRID_HIGH_END:
        return ">= 95 %"
    return f"{int((p * 100).to_integral_value())} %"


def spread_ratios(series: list[Decimal], k: int) -> dict[Decimal, Decimal] | None:
    """r_q for every grid q (17.12 / 17.14), or None when the history is too short (needs >= k + 9 days)."""
    if len(series) < k + SPREAD_EXTRA_DAYS:
        return None
    means = st.rolling_means(series, k)
    mid = st.nearest_rank(means, st.Q50)
    if mid is None or mid <= ZERO:
        return None
    out: dict[Decimal, Decimal] = {}
    for q in st.GRID:
        low = st.nearest_rank(means, st.ONE - q)
        assert low is not None
        out[q] = min(R_MAX, max(R_MIN, low / mid))
    return out


# --------------------------------------------------------------------------- material


@dataclass
class MaterialForecast:
    status: str
    reason_codes: list[str] = field(default_factory=list)
    dates_by_q: dict[Decimal, date] = field(default_factory=dict)
    lateness_source: str = LATENESS_NOT_EVALUATED
    shared_supply: bool = False
    po_lines: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class _UsedLine:
    po_line_id: int
    po_code: str
    item_id: int
    eta_raw: date | None
    eta_source: str
    qty_used: Decimal
    own: bool


async def _po_line_meta(db: AsyncSession, tenant_id: int, line_ids: list[int]) -> dict[int, tuple[int | None, int | None, bool]]:
    """(vendor_id, item category_id, bought for which order) per PO line, one query. Value: (vendor, category, src)."""
    if not line_ids:
        return {}
    poi, po = PurchaseOrderItem, PurchaseOrder
    out: dict[int, Any] = {}
    for lid, line_src, po_src, vendor_id, category_id in (
        await db.execute(
            select(poi.id, poi.source_order_id, po.source_order_id, po.vendor_id, Item.category_id)
            .join(po, po.id == poi.purchase_order_id)
            .outerjoin(Item, (Item.id == poi.item_id) & (Item.tenant_id == tenant_id))
            .where(poi.tenant_id == tenant_id, po.tenant_id == tenant_id, poi.id.in_(sorted(set(line_ids))))
        )
    ).all():
        out[int(lid)] = (
            int(vendor_id) if vendor_id is not None else None,
            int(category_id) if category_id is not None else None,
            int(line_src) if line_src is not None else (int(po_src) if po_src is not None else None),
        )
    return out


def _dates_for_used(
    used: list[_UsedLine],
    meta: dict[int, Any],
    model: LatenessModel,
    *,
    today: date,
    buffer_days: int,
) -> tuple[dict[Decimal, date] | None, str, list[dict[str, Any]]]:
    """Latest R_q over the used PO lines for every grid q (None when an ETA is unknown)."""
    worst_source = LATENESS_NONE
    by_q: dict[Decimal, date] = {}
    detail: list[dict[str, Any]] = []
    unknown = False
    for u in used:
        vendor_id, category_id, _src = meta.get(u.po_line_id, (None, None, None))
        line_q: dict[Decimal, date | None] = {}
        source = SRC_UNKNOWN
        for q in st.GRID:
            lateness, source = model.lateness_days(vendor_id, category_id, q)
            line_q[q] = predicted_receipt(u.eta_raw, u.eta_source, today=today, buffer_days=buffer_days, lateness_days=lateness)
        if worst_source == LATENESS_NONE or SOURCE_RANK.get(source, 9) > SOURCE_RANK.get(worst_source, -1):
            worst_source = source
        if u.eta_raw is None:
            unknown = True
        else:
            for q, d in line_q.items():
                assert d is not None
                if q not in by_q or d > by_q[q]:
                    by_q[q] = d
        detail.append(
            {
                "po_line_id": u.po_line_id,
                "po_code": u.po_code,
                "item_id": u.item_id,
                "vendor_id": vendor_id,
                "own_order_supply": u.own,
                "qty_used": dec_str(u.qty_used, 4),
                "eta_date": u.eta_raw,
                "eta_source": u.eta_source,
                "lateness_source": source,
                "receipt_p50": line_q.get(st.Q50),
                "receipt_p80": line_q.get(st.Q80),
                "receipt_p90": line_q.get(st.Q90),
            }
        )
    return (None if unknown else by_q), worst_source, detail


async def _material_forecast(
    db: AsyncSession,
    tenant_id: int,
    order: Order,
    *,
    today: date,
    allocation_v1: bool,
    buffer_days: int,
    lateness: "_LazyLateness",
) -> MaterialForecast:
    from app.modules.inventory.open_po_supply_service import inbound_by_item
    from app.modules.inventory.pegging_service import load_effective_pegs
    from app.models.mfg_planning import PEG_HARD

    if allocation_v1:
        from app.modules.mfg_intelligence.allocation_readiness_service import compute_material_v3

        material = await compute_material_v3(db, tenant_id, order)
    else:
        from app.modules.mfg_intelligence.readiness_service import compute_material

        material = await compute_material(db, tenant_id, order)
    if material.authority != AUTH_ORDER_BOM:
        return MaterialForecast(MAT_NOT_EVALUATED, ["MATERIAL_NOT_BINDING", *material.reason_codes])
    if not material.lines:
        return MaterialForecast(MAT_UNKNOWN, ["MATERIAL_NOT_READY", *material.reason_codes])

    reasons: list[str] = []
    short_lines: list[tuple[dict[str, Any], Decimal]] = []
    for ln in material.lines:
        required = to_dec(ln.get("required_qty"))
        if required is None:
            if "REQUIREMENT_UNKNOWN" not in reasons:
                reasons.append("REQUIREMENT_UNKNOWN")
            continue
        if allocation_v1:
            if ln.get("ready") is False:
                short_lines.append((ln, to_dec(ln.get("short_qty")) or ZERO))
            continue
        free_on_hand = (to_dec(ln.get("available_qty")) or ZERO) - (to_dec(ln.get("in_transit_qty")) or ZERO)
        need = required - free_on_hand
        if need > SHORT_TOLERANCE:
            short_lines.append((ln, need))
    if not short_lines:
        return MaterialForecast(MAT_NONE_NEEDED, reasons or ["MATERIAL_READY"], lateness_source=LATENESS_NONE)

    item_ids = sorted({int(ln["item_id"]) for ln, _ in short_lines})
    inbound = await inbound_by_item(db, tenant_id, item_ids, with_eta=True, receipt_buffer_days=0)
    pegs, _views = await load_effective_pegs(db, tenant_id, item_ids, inbound=inbound)
    all_line_ids = [pl.po_line_id for slot in inbound.values() for pl in slot.lines]
    meta = await _po_line_meta(db, tenant_id, all_line_ids)
    used: list[_UsedLine] = []
    if allocation_v1:
        own_hard: dict[int, list[Any]] = defaultdict(list)
        for p in pegs:
            if p.kind == PEG_HARD and p.order_id == order.id and p.effective_qty > ZERO and p.po_line_id is not None:
                own_hard[p.item_id].append(p)
        by_line = {pl.po_line_id: pl for slot in inbound.values() for pl in slot.lines}
        for ln, short in short_lines:
            codes = ln.get("reason_codes") or []
            if "SUPPLY_NOT_PEGGED" in codes:
                return MaterialForecast(MAT_UNKNOWN, ["MATERIAL_NOT_ON_ORDER", *reasons])
            for p in own_hard.get(int(ln["item_id"]), []):
                pl = by_line.get(p.po_line_id)
                if pl is None:
                    return MaterialForecast(MAT_UNKNOWN, ["MATERIAL_ETA_UNKNOWN", *reasons])
                used.append(_UsedLine(pl.po_line_id, pl.po_code, pl.item_id, pl.expected_date, pl.eta_source,
                                      p.effective_qty, True))
            if not own_hard.get(int(ln["item_id"])):
                return MaterialForecast(MAT_UNKNOWN, ["MATERIAL_NOT_ON_ORDER", *reasons])
    else:
        reasons.append("SHARED_SUPPLY_NOT_ALLOCATED")
        hard_other: dict[int, Decimal] = defaultdict(lambda: ZERO)
        for p in pegs:
            if p.kind == PEG_HARD and p.order_id != order.id and p.po_line_id is not None:
                hard_other[p.po_line_id] += p.effective_qty
        for ln, need in short_lines:
            slot = inbound.get(int(ln["item_id"]))
            candidates = list(slot.lines) if slot is not None else []

            def sort_key(pl: Any) -> tuple[int, int, date, int]:
                own = meta.get(pl.po_line_id, (None, None, None))[2] == order.id
                return (0 if own else 1, 1 if pl.expected_date is None else 0, pl.expected_date or date.max, pl.po_line_id)

            covered = ZERO
            for pl in sorted(candidates, key=sort_key):
                if covered >= need - SHORT_TOLERANCE:
                    break
                usable = max(ZERO, pl.on_order_net - hard_other.get(pl.po_line_id, ZERO))
                if usable <= ZERO:
                    continue
                take = min(usable, need - covered)
                covered += take
                own = meta.get(pl.po_line_id, (None, None, None))[2] == order.id
                used.append(_UsedLine(pl.po_line_id, pl.po_code, pl.item_id, pl.expected_date, pl.eta_source, take, own))
            if covered < need - SHORT_TOLERANCE:
                return MaterialForecast(MAT_UNKNOWN, ["MATERIAL_NOT_ON_ORDER", *reasons], shared_supply=True)

    model = await lateness.get()
    by_q, source, detail = _dates_for_used(used, meta, model, today=today, buffer_days=buffer_days)
    if by_q is None:
        return MaterialForecast(MAT_UNKNOWN, ["MATERIAL_ETA_UNKNOWN", *reasons], lateness_source=source,
                                shared_supply=not allocation_v1, po_lines=detail)
    return MaterialForecast(MAT_DATED, ["MATERIAL_EXPECTED_DATE_USED", *reasons], dates_by_q=by_q,
                            lateness_source=source, shared_supply=not allocation_v1, po_lines=detail)


class _LazyLateness:
    """Loads the tenant lateness model once, only when an order really needs PO supply."""

    def __init__(self, db: AsyncSession, tenant_id: int, today: date) -> None:
        self._db, self._tenant_id, self._today = db, tenant_id, today
        self._model: LatenessModel | None = None

    async def get(self) -> LatenessModel:
        if self._model is None:
            self._model = await load_lateness_model(self._db, self._tenant_id, today=self._today)
        return self._model


class _ZeroLateness:
    """Lateness model for `apply_lateness=False`: every PO line keeps its own date (source NONE)."""

    def lateness_days(self, vendor_id: int | None, category_id: int | None, q: Decimal) -> tuple[int, str]:
        return 0, LATENESS_NONE


class _NoLateness:
    async def get(self) -> Any:
        return _ZeroLateness()


@dataclass
class MaterialReadyDate:
    order_id: int
    status: str
    ready_date: date | None
    reason_codes: list[str]
    lateness_source: str


async def material_ready_dates(
    db: AsyncSession,
    tenant: Tenant,
    orders: list[Order],
    *,
    today: date,
    q: Decimal,
    apply_lateness: bool,
) -> dict[int, MaterialReadyDate]:
    """Phase 5 public wrapper: material-ready date R_q per order (read-only, bounded to MAX_ORDERS).

    Same rules as the Phase 4 forecast (`_material_forecast`); it never changes `forecast_deliveries`. With
    `apply_lateness=False` every PO line keeps its own date (lateness source NONE). Material is evaluated only while
    `mfg_order_bom_readiness_v2` is on (else NOT_EVALUATED).
    """
    out: dict[int, MaterialReadyDate] = {}
    if not orders:
        return out
    if not order_bom_readiness_v2_on(tenant):
        for o in orders[:MAX_ORDERS]:
            out[o.id] = MaterialReadyDate(o.id, MAT_NOT_EVALUATED, None, ["MATERIAL_NOT_EVALUATED"], LATENESS_NOT_EVALUATED)
        return out
    integrated = integrated_planning_on(tenant)
    allocation_v1 = allocation_v1_on(tenant)
    buffer_days = 0
    if integrated:
        from app.modules.production.planning_settings_service import get_receipt_buffer_days

        buffer_days = await get_receipt_buffer_days(db, tenant.id)
    lateness: Any = _LazyLateness(db, tenant.id, today) if apply_lateness else _NoLateness()
    for order in orders[:MAX_ORDERS]:
        mf = await _material_forecast(
            db, tenant.id, order, today=today, allocation_v1=allocation_v1, buffer_days=buffer_days, lateness=lateness
        )
        ready = mf.dates_by_q.get(q) if mf.status == MAT_DATED else None
        out[order.id] = MaterialReadyDate(order.id, mf.status, ready, list(mf.reason_codes), mf.lateness_source)
    return out


# --------------------------------------------------------------------------- forecast


def _completed(r: Any) -> bool:
    return (r.reservation_status or "").strip().upper() == "COMPLETED"


def _estimate_out(est: EfficiencyEstimate) -> dict[str, Any]:
    pct = lambda v: dec_str(v * Decimal(100), 2) if v is not None else None  # noqa: E731
    return {
        "source": est.source,
        "confidence": est.confidence,
        "group_used": est.group,
        "n": est.n,
        "planned_pct": pct(est.planned),
        "empirical_pct": pct(est.empirical),
        "blended_pct": pct(est.value),
        "weight": dec_str(est.weight, 4),
        "robust_cv": dec_str(est.robust_cv, 4),
        "reason_codes": est.reason_codes,
    }


async def forecast_deliveries(
    db: AsyncSession,
    tenant: Tenant,
    orders: list[Order],
    *,
    today: date,
    include_details: bool = True,
) -> list[dict[str, Any]]:
    """One forecast per order. Plan rows, SMV, capacity, history and the lateness model are loaded once."""
    if not orders:
        return []
    tenant_id = tenant.id
    integrated = integrated_planning_on(tenant)
    order_bom_v2 = order_bom_readiness_v2_on(tenant)
    allocation_v1 = allocation_v1_on(tenant)
    order_ids = [o.id for o in orders]

    all_rows = await fetch_order_plan_rows(db, tenant_id, order_ids, include_completed=True)
    rows_by_order: dict[int, list[Any]] = defaultdict(list)
    for r in all_rows:
        rows_by_order[int(r.order_id)].append(r)
    firm_by_order: dict[int, list[Any]] = {}
    live_start: dict[int, date] = {}
    for oid, rows in rows_by_order.items():
        firm_by_order[oid] = sorted(
            (r for r in rows if demand_class(r.reservation_status) == CLASS_FIRM and not _completed(r)),
            key=lambda r: (r.start_date, r.id),
        )
        starts = [r.start_date for r in rows if not _completed(r) and demand_class(r.reservation_status) in (CLASS_FIRM, CLASS_SOFT)]
        if starts:
            live_start[oid] = min(starts)
    rate_row: dict[tuple[int, int], Any] = {}
    for oid, rows in firm_by_order.items():
        for r in rows:
            rate_row.setdefault((oid, int(r.line_id)), r)

    calendar = await load_calendar(db, tenant_id, today, today + timedelta(days=HORIZON_DAYS + 60))
    smv_by_row = await resolve_smv_for_rows(db, tenant_id, list(rate_row.values()), use_style_standard=integrated)

    rep_day: dict[tuple[int, int], date | None] = {}
    days_by_line: dict[int, list[date]] = defaultdict(list)
    for (oid, lid), r in rate_row.items():
        first = calendar.first_working_on_or_after(max(today, live_start.get(oid, r.start_date)))
        rep_day[(oid, lid)] = first
        if first is not None:
            days_by_line[lid].append(first)
    capacity_by_line_day: dict[tuple[int, date], Any] = {}
    line_codes: dict[int, str] = {}
    if days_by_line:
        all_days = [d for ds in days_by_line.values() for d in ds]
        cap = await compute_capacity(
            db,
            tenant_id,
            window_start=min(all_days),
            window_end=max(all_days),
            line_ids=sorted(days_by_line),
            days_by_line=days_by_line,
            integrated_planning=False,
            today=today,
        )
        for lc in cap.lines:
            line_codes[lc.line.id] = lc.line.line_code
            for dc in lc.days:
                capacity_by_line_day[(lc.line.id, dc.day)] = dc
    history = await load_efficiency_history(
        db, tenant_id, date_to=today - timedelta(days=1), line_ids=sorted(days_by_line), integrated_planning=integrated
    ) if days_by_line else None

    style_ids = {int(o.style_id) for o in orders if o.style_id} | {int(r.style_id) for r in rate_row.values() if r.style_id}
    families: dict[int, str] = {}
    if style_ids:
        for sid, ptype in (
            await db.execute(
                select(GarmentStyle.id, GarmentStyle.product_type).where(
                    GarmentStyle.tenant_id == tenant_id, GarmentStyle.id.in_(sorted(style_ids))
                )
            )
        ).all():
            families[int(sid)] = family_of(ptype)

    stages_by_order: dict[int, list[Any]] | None = None
    if integrated:
        from app.modules.mfg_intelligence.route_stage_service import external_stages_for_orders

        stages_by_order = await external_stages_for_orders(db, tenant_id, order_ids)
    buffer_days = 0
    if integrated and order_bom_v2:
        from app.modules.production.planning_settings_service import get_receipt_buffer_days

        buffer_days = await get_receipt_buffer_days(db, tenant_id)
    lateness = _LazyLateness(db, tenant_id, today)

    results: list[dict[str, Any]] = []
    for order in orders:
        results.append(
            await _forecast_one(
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
                line_codes=line_codes,
                history=history,
                families=families,
                calendar=calendar,
                today=today,
                order_bom_v2=order_bom_v2,
                allocation_v1=allocation_v1,
                buffer_days=buffer_days,
                lateness=lateness,
                external_stages=stages_by_order.get(order.id, []) if stages_by_order is not None else None,
                include_details=include_details,
            )
        )
    return results


def _base(order: Order, today: date) -> dict[str, Any]:
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "order_status": (order.status or "").strip().upper(),
        "model_version": MODEL_VERSION,
        "as_of": today,
        "target_date": order.delivery_date,
        "target_basis": "EX_FACTORY",
        "order_qty": None,
        "produced_qty": None,
        "remaining_qty": None,
        "band": BAND_UNKNOWN,
        "on_time_probability": None,
        "probability_display": None,
        "calibrated": False,
        "calibration_label": "uncalibrated",
        "spread_mode": None,
        "spread_window_days": None,
        "p50_date": None,
        "p80_date": None,
        "p90_date": None,
        "start_date": None,
        "working_days_needed": None,
        "daily_rate_likely": None,
        "daily_rate_p80": None,
        "daily_rate_p90": None,
        "delay_days": None,
        "early_days": None,
        "efficiency_source": None,
        "lateness_source": LATENESS_NOT_EVALUATED,
        "confidence": CONF_LOW,
        "material": None,
        "lines": [],
        "grid": [],
        "drivers": [],
        "reason_codes": [],
        "missing_inputs": [],
        "assumptions": list(ASSUMPTIONS),
        "inputs_hash": None,
    }


def _unknown(base: dict[str, Any], reasons: list[str], missing: list[str] | None = None) -> dict[str, Any]:
    base["band"] = BAND_UNKNOWN
    base["reason_codes"] = list(dict.fromkeys(base["reason_codes"] + reasons))
    base["missing_inputs"] = missing or base["missing_inputs"]
    return base


async def _forecast_one(
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
    line_codes: dict[int, str],
    history: Any,
    families: dict[int, str],
    calendar: CalendarContext,
    today: date,
    order_bom_v2: bool,
    allocation_v1: bool,
    buffer_days: int,
    lateness: _LazyLateness,
    external_stages: list[Any] | None,
    include_details: bool,
) -> dict[str, Any]:
    base = _base(order, today)
    qty = to_dec(order.quantity)
    produced = sum((to_dec(r.completed_qty) or ZERO for r in rows), ZERO) if rows else None
    remaining = max(ZERO, qty - produced) if qty is not None and produced is not None else None
    base["order_qty"] = dec_str(qty, 3)
    base["produced_qty"] = dec_str(produced, 3)
    base["remaining_qty"] = dec_str(remaining, 3)
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
    if not firm:
        return _unknown(base, ["NO_FIRM_LINE_PLAN"], ["firm_line_plan"])

    reasons: list[str] = []
    if any(demand_class(r.reservation_status) == CLASS_DRAFT for r in rows):
        reasons.append("DRAFT_ROWS_IGNORED")
    confidence = CONF_HIGH

    # ---- rate per line
    family = families.get(int(order.style_id)) if order.style_id else None
    missing: set[str] = set()
    line_parts: list[dict[str, Any]] = []
    for (oid, lid), r in sorted(rate_row.items()):
        if oid != order.id:
            continue
        day = rep_day.get((oid, lid))
        cap = capacity_by_line_day.get((lid, day)) if day is not None else None
        smv = smv_by_row[r.id].value
        line_missing: list[str] = []
        if day is None or cap is None:
            line_missing.append("working_day")
        elif cap.practical_minutes is None or cap.theoretical_minutes is None:
            line_missing.extend(cap.missing_inputs or ["capacity"])
        if smv is None:
            line_missing.append("smv")
        row_family = families.get(int(r.style_id)) if r.style_id else family
        planned = quant(cap.efficiency_pct / Decimal(100), 4) if cap is not None and cap.efficiency_pct is not None else None
        est = history.estimate(lid, row_family, planned) if history is not None else None
        part: dict[str, Any] = {
            "line_id": lid,
            "line_code": line_codes.get(lid),
            "plan_row_id": r.id,
            "capacity_date": day,
            "operator_minutes": dec_str(cap.theoretical_minutes) if cap is not None else None,
            "smv_per_piece": dec_str(smv, 4),
            "efficiency": _estimate_out(est) if est is not None else None,
            "rate_likely_units": None,
            "rate_planned_units": None,
            "history_days": len(est.series) if est is not None else 0,
            "missing_inputs": line_missing,
            "_est": est,
            "_rate": None,
            "_planned_rate": None,
        }
        if not line_missing and est is not None and est.value is not None and smv is not None:
            planned_rate = cap.practical_minutes / smv
            if est.source == SOURCE_PLANNED:
                rate = planned_rate
            else:
                rate = quant(cap.theoretical_minutes * est.value, 4) / smv
            part["_rate"], part["_planned_rate"] = rate, planned_rate
            part["rate_likely_units"] = dec_str(rate)
            part["rate_planned_units"] = dec_str(planned_rate)
            confidence = _min_conf(confidence, est.confidence)
        else:
            if est is not None and est.value is None:
                line_missing.append("efficiency")
            missing.update(line_missing)
        line_parts.append(part)

    def public_lines() -> list[dict[str, Any]]:
        return [{k: v for k, v in p.items() if not k.startswith("_")} for p in line_parts] if include_details else []

    base["lines"] = public_lines()
    rate_likely = sum((p["_rate"] for p in line_parts if p["_rate"] is not None), ZERO)
    if missing or rate_likely <= ZERO:
        return _unknown(base, reasons + ["RATE_UNKNOWN"], sorted(missing) or ["rate"])
    planned_rate_total = sum((p["_planned_rate"] for p in line_parts), ZERO)
    sources = {p["_est"].source for p in line_parts}
    base["efficiency_source"] = (
        next(iter(sources)) if len(sources) == 1 else ("MIXED" if SOURCE_PLANNED in sources else "BLENDED")
    )

    # ---- start (plan) and material
    plan_start = calendar.first_working_on_or_after(max(today, live_start or firm[0].start_date))
    if plan_start is None:
        return _unknown(base, reasons + ["NO_WORKING_DAY_FOUND"])
    material_dates: dict[Decimal, date] = {}
    if order_bom_v2:
        mf = await _material_forecast(
            db, tenant_id, order, today=today, allocation_v1=allocation_v1, buffer_days=buffer_days, lateness=lateness
        )
        base["material"] = {
            "status": mf.status,
            "reason_codes": mf.reason_codes,
            "ready_p50": mf.dates_by_q.get(st.Q50),
            "ready_p80": mf.dates_by_q.get(st.Q80),
            "ready_p90": mf.dates_by_q.get(st.Q90),
            "lateness_source": mf.lateness_source,
            "shared_supply": mf.shared_supply,
            "po_lines": mf.po_lines if include_details else [],
        }
        base["lateness_source"] = mf.lateness_source
        if mf.shared_supply:
            confidence = _min_conf(confidence, CONF_MEDIUM)
            reasons.append("SHARED_SUPPLY_NOT_ALLOCATED")
        if mf.status == MAT_UNKNOWN:
            material_codes = [c for c in mf.reason_codes if c.startswith("MATERIAL_")] or ["MATERIAL_NOT_READY"]
            return _unknown(base, reasons + material_codes, ["materials"])
        if mf.status == MAT_DATED:
            material_dates = mf.dates_by_q
            reasons.append("MATERIAL_EXPECTED_DATE_USED")
            if mf.lateness_source in (SRC_UNKNOWN,):
                confidence = _min_conf(confidence, CONF_MEDIUM)
    else:
        base["assumptions"].append("Material readiness is not considered (mfg_order_bom_readiness_v2 off).")

    # ---- spread
    k = min(SPREAD_MAX_K, max(SPREAD_MIN_K, _ceil_days(remaining, rate_likely)))
    ratios: list[dict[Decimal, Decimal] | None] = [spread_ratios(p["_est"].series, k) for p in line_parts]
    fallback = any(r is None for r in ratios)
    base["spread_window_days"] = k

    def finish_for(rate: Decimal, q: Decimal) -> tuple[date | None, date | None, int]:
        start = plan_start
        m = material_dates.get(q)
        if m is not None and m > start:
            start = calendar.first_working_on_or_after(m)
            if start is None:
                return None, None, 0
        days = _ceil_days(remaining, rate)
        end = _finish(start, days, calendar)
        if end is not None and external_lead > 0:
            end = end + timedelta(days=external_lead)
        return end, start, days

    likely, start50, days50 = finish_for(rate_likely, st.Q50)
    base["start_date"] = start50
    base["working_days_needed"] = days50
    base["daily_rate_likely"] = dec_str(rate_likely)
    if likely is None:
        return _unknown(base, reasons + ["COMPLETION_BEYOND_HORIZON"])

    target = order.delivery_date
    if fallback:
        reasons.append("INSUFFICIENT_HISTORY")
        confidence = CONF_LOW
        base["spread_mode"] = SPREAD_FIXED
        rate90 = rate_likely * FALLBACK_P90_FACTOR
        p90, _s, _d = finish_for(rate90, st.Q90)
        p90 = max(p90, likely) if p90 is not None else None
        base.update({"p50_date": likely, "p90_date": p90, "daily_rate_p90": dec_str(rate90)})
    else:
        base["spread_mode"] = SPREAD_EMPIRICAL
        grid: list[tuple[Decimal, date | None]] = []
        running: date | None = None
        broken = False
        rate_by_q: dict[Decimal, Decimal] = {}
        for q in st.GRID:
            rate_q = sum((p["_rate"] * ratio[q] for p, ratio in zip(line_parts, ratios) if ratio is not None), ZERO)
            rate_by_q[q] = rate_q
            end, _s, _d = finish_for(rate_q, q) if rate_q > ZERO else (None, None, 0)
            if end is None or broken:
                broken = True
                grid.append((q, None))
                continue
            running = end if running is None or end > running else running
            grid.append((q, running))
        by_q = dict(grid)
        base.update(
            {
                "p50_date": by_q.get(st.Q50),
                "p80_date": by_q.get(st.Q80),
                "p90_date": by_q.get(st.Q90),
                "daily_rate_p80": dec_str(rate_by_q[st.Q80]),
                "daily_rate_p90": dec_str(rate_by_q[st.Q90]),
                "grid": [{"q": dec_str(q, 2), "finish_date": d} for q, d in grid],
            }
        )
        if base["p50_date"] is None:
            return _unknown(base, reasons + ["COMPLETION_BEYOND_HORIZON"])
        if target is not None:
            p = st.probability_from_grid(grid, lambda d: d is not None and d <= target)
            base["on_time_probability"] = dec_str(p, 4)
            base["probability_display"] = probability_display(p)

    p50 = base["p50_date"]
    planned_end, _s, _d = finish_for(planned_rate_total, st.Q50) if planned_rate_total > ZERO else (None, None, 0)
    drivers = [
        {
            "driver": "MATERIAL",
            "impact_days": max(0, (start50 - plan_start).days) if start50 is not None else 0,
            "detail": "Waiting for purchase order material" if material_dates else "No material wait",
        },
        {
            "driver": "EFFICIENCY",
            "impact_days": (p50 - planned_end).days if planned_end is not None else 0,
            "detail": "Measured efficiency versus the planned efficiency (positive = later than plan)",
        },
        {
            "driver": "LOAD",
            "impact_days": max(0, (plan_start - today).days),
            "detail": "Days until the order's line plan starts",
        },
    ]
    base["drivers"] = sorted(drivers, key=lambda d: (-abs(d["impact_days"]), d["driver"]))
    base["confidence"] = confidence
    base["inputs_hash"] = hashlib.sha256(
        json.dumps(
            {
                "remaining": str(remaining),
                "rate": str(rate_likely),
                "start": str(plan_start),
                "material": {str(q): str(d) for q, d in sorted(material_dates.items())},
                "target": str(target),
                "k": k,
                "fallback": fallback,
            },
            sort_keys=True,
        ).encode()
    ).hexdigest()

    if target is None:
        return _unknown(base, reasons + ["NO_DELIVERY_DATE"], ["delivery_date"])
    delta = (p50 - target).days
    base["delay_days"] = max(0, delta)
    base["early_days"] = max(0, -delta)
    if fallback:
        p90 = base["p90_date"]
        if p50 > target:
            band = BAND_LATE
        elif p90 is None or p90 > target:
            band = BAND_AT_RISK
        else:
            band = BAND_ON_TRACK
    else:
        p = to_dec(base["on_time_probability"]) or ZERO
        band = BAND_ON_TRACK if p >= P_ON_TRACK else (BAND_AT_RISK if p >= P_AT_RISK else BAND_LATE)
    base["band"] = band
    base["reason_codes"] = list(dict.fromkeys(reasons))
    return base
