"""Forward plan: capacity vs layered demand over 90-180 days (Manufacturing Intelligence Phase 5). Read-only, no money.

Plan doc 16 sections 4.1-4.5 with the binding resolutions 15.3-15.6 and 15.16 (Decimal, 4 dp, ROUND_HALF_UP):

Capacity per line-day under parameter set s (4.1, 15.6):
    T      = theoretical operator-minutes of the day (`compute_capacity`); x = extra_operator_pct scales T only
    OT     = min(ot% x T(1+x), operators(1+x) x max(0, 600 - T / operators))   working days only
    eff    = PLAN: the day's own efficiency (`DayCap.efficiency_pct`, so PLAN with no parameters = practical minutes)
             P-basis: (w x empirical + (1 - w) x day efficiency) x r_q (Phase 4 blend of the line, family ALL;
             r_q from `spread_ratios(series, k=20)`, needs >= 29 samples), else FIXED_BANDS: day efficiency x
             1.00 (P50) / 1.10 (Q20) / 0.85 (P80, P90)
    cap    = (T(1+x) + OT) x (1 - absence%) x eff
    UNKNOWN days are never filled (counted, bucket PARTIAL); CLOSED days are 0. Virtual line = median known cap of the
    real lines that day (VIRTUAL). P-bases use plan-basis operator minutes (integrated_planning=False); PLAN follows the
    integrated flag as Phase 1/2 do. At most 2 `compute_capacity` calls per request.
Buckets: weekly = 7-day bins from today, monthly = calendar months clipped to the horizon (PARTIAL_MONTH); month totals
are sums of days. Load = sum of the layers the scenario selects; gap = capacity - load; utilisation = load / capacity
(null when capacity is 0 or the bucket is PARTIAL).
Capacity-constrained (4.5, 15.16), weekly bins: booked layers stay (BOOKED_OVERLOAD when above capacity); then admit
unplanned confirmed by need-by, tentative weighted by confidence desc / start / id, then forecast residual. Each item
fills free capacity from its own week onward (no pre-build); what is left is DEFERRED_BEYOND_HORIZON. Admitted minutes
of a week are placed on its days pro rata to each day's free capacity, so months are still sums of days.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import SewingLine, Tenant
from app.modules.mfg_intelligence import forward_plan_params as fp
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.capacity_service import CapacityResult, DayCap, compute_capacity
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant
from app.modules.mfg_intelligence.delivery_forecast_service import SPREAD_MAX_K, spread_ratios
from app.modules.mfg_intelligence.demand_layers import DemandItem, DemandLayers, load_demand_layers
from app.modules.mfg_intelligence.empirical_efficiency_service import estimate_from_samples, load_efficiency_history
from app.modules.mfg_intelligence.flags import integrated_planning_on, predictive_on
from app.modules.mfg_intelligence.forecast_demand_service import (
    ForecastResult,
    load_forecast,
    month_key,
    residual_days,
)

ENGINE_VERSION = "mi-forward-plan-5.0"
MAX_LINES = 200
MIN_SPREAD_SAMPLES = SPREAD_MAX_K + 9
OT_DAY_MINUTES_CAP = Decimal("600")  # operator-day incl. overtime: 8 h + 2 h (doc 16 D11, 15.6)
HUNDRED = Decimal("100")
ONE = Decimal("1")
MAX_ITEMS_OUT = 500

MODE_PLAN = "PLAN"
MODE_EMPIRICAL = "EMPIRICAL_SPREAD"
MODE_FIXED = "FIXED_BANDS"

ASSUMPTIONS = [
    "Capacity = operator-minutes x efficiency per line-day; unknown days are never filled and closed days are 0.",
    "Overtime is at most 10 hours per operator-day (8 h + 2 h) and only on working days; it is a what-if only.",
    "Measured (P-basis) efficiency already includes absence, so absence can be added only with the PLAN basis.",
    "Each piece of demand is in one layer: planned rows, unplanned confirmed quantity, tentative, or forecast.",
    "Tentative full and weighted are two views of the same bookings and are never added together.",
    "Unplanned confirmed quantity is placed before its need-by date (delivery date minus open post-sewing stages).",
    "Remaining work of a plan row is spread evenly over its working days from today; rows already past their end "
    "date are shown as overdue backlog in the first bucket.",
    "Stale rows of unconfirmed or unlinked orders that ended more than 60 days ago are not read (Phase 1 rule).",
    "Inquiries and quotations without a tentative booking are not demand.",
]


class TooManyLines(Exception):
    def __init__(self, count: int) -> None:
        self.count = count


@dataclass
class LineEfficiency:
    mode: str
    weight: Decimal = ZERO
    empirical: Decimal | None = None
    ratios: dict[Decimal, Decimal] | None = None
    n: int = 0


@dataclass
class EngineInputs:
    tenant_id: int
    today: date
    end: date
    horizon_days: int
    factory_unit: str | None
    integrated: bool
    predictive: bool
    cap_demand: CapacityResult  # PLAN basis capacity + demand (integrated flag as Phase 1/2)
    cap_plan: CapacityResult | None  # plan-basis operator minutes for P-bases (integrated_planning=False)
    history: Any
    layers: DemandLayers
    forecast: ForecastResult
    forecast_days: dict[tuple, dict[date, Decimal]]
    forecast_beyond: Decimal
    settings: dict[str, Any]
    notices: list[str] = field(default_factory=list)

    @property
    def frozen_end(self) -> date:
        return self.today + timedelta(days=int(self.settings.get("frozen_horizon_days", 14)) - 1)


async def count_active_lines(db: AsyncSession, tenant_id: int, factory_unit: str | None) -> int:
    stmt = select(func.count(SewingLine.id)).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True))
    if factory_unit:
        stmt = stmt.where(SewingLine.factory_unit == factory_unit)
    return int((await db.execute(stmt)).scalar_one() or 0)


async def load_inputs(
    db: AsyncSession,
    tenant: Tenant,
    *,
    today: date,
    horizon_days: int,
    factory_unit: str | None,
    need_plan_basis: bool,
) -> EngineInputs:
    from app.modules.production.planning_settings_service import read_planning_settings

    tid = tenant.id
    end = today + timedelta(days=horizon_days - 1)
    n_lines = await count_active_lines(db, tid, factory_unit)
    if n_lines > MAX_LINES:
        raise TooManyLines(n_lines)
    integrated = integrated_planning_on(tenant)
    predictive = predictive_on(tenant)
    cap_demand = await compute_capacity(
        db, tid, window_start=today, window_end=end, factory_unit=factory_unit,
        include_tentative=integrated, integrated_planning=integrated, today=today,
    )
    cap_plan: CapacityResult | None = None
    if need_plan_basis:
        cap_plan = cap_demand if not integrated else await compute_capacity(
            db, tid, window_start=today, window_end=end, factory_unit=factory_unit,
            include_tentative=False, integrated_planning=False, today=today,
        )
    history = None
    if need_plan_basis and predictive and cap_demand.lines:
        history = await load_efficiency_history(
            db, tid, date_to=today - timedelta(days=1), line_ids=[lc.line.id for lc in cap_demand.lines],
            integrated_planning=integrated,
        )
    layers = await load_demand_layers(
        db, tid, cap_demand, today=today, end=end, integrated=integrated, factory_unit=factory_unit
    )
    forecast = await load_forecast(
        db, tid, today=today, end=end, use_style_standard=integrated, tentative_rows=layers.tentative_rows
    )
    if factory_unit:
        forecast_days: dict[tuple, dict[date, Decimal]] = {}
        forecast_beyond = ZERO
    else:
        forecast_days, forecast_beyond = residual_days(forecast, cap_demand.loading.calendar, today=today, end=end)
    settings = await read_planning_settings(db, tid)
    notices = list(cap_demand.notices) + list(layers.notices) + list(forecast.notices)
    if not integrated:
        notices.append("TENTATIVE_REQUIRES_INTEGRATED_PLANNING: tentative bookings are read only with integrated planning on")
    if factory_unit:
        notices.append("FORECAST_NOT_ATTRIBUTED_TO_UNIT: the forecast residual is company-wide and left out for a factory unit")
    return EngineInputs(
        tenant_id=tid, today=today, end=end, horizon_days=horizon_days, factory_unit=factory_unit,
        integrated=integrated, predictive=predictive, cap_demand=cap_demand, cap_plan=cap_plan, history=history,
        layers=layers, forecast=forecast, forecast_days=forecast_days, forecast_beyond=forecast_beyond,
        settings=settings, notices=list(dict.fromkeys(notices)),
    )


# --------------------------------------------------------------------------- capacity


def line_efficiency(inputs: EngineInputs, line_id: int, basis: str) -> LineEfficiency:
    if basis == fp.BASIS_PLAN:
        return LineEfficiency(MODE_PLAN)
    hist = inputs.history.lines.get(line_id) if inputs.history is not None else None
    samples = hist.samples if hist is not None else []
    if not inputs.predictive or len(samples) < MIN_SPREAD_SAMPLES:
        return LineEfficiency(MODE_FIXED, n=len(samples))
    ratios = spread_ratios([s.efficiency for s in samples], SPREAD_MAX_K)
    if ratios is None:
        return LineEfficiency(MODE_FIXED, n=len(samples))
    est = estimate_from_samples(samples, None, ONE)
    return LineEfficiency(MODE_EMPIRICAL, weight=est.weight, empirical=est.empirical, ratios=ratios, n=len(samples))


def day_capacity(d: DayCap, params: fp.ForwardParams, eff_model: LineEfficiency) -> tuple[Decimal | None, Decimal]:
    """(capacity minutes or None when unknown, overtime minutes used) of one line-day under `params`."""
    if not d.is_working_day:
        return ZERO, ZERO
    if d.theoretical_minutes is None or d.practical_minutes is None or d.efficiency_pct is None:
        return None, ZERO
    t = d.theoretical_minutes
    x = ONE + params.extra_operator_pct / HUNDRED
    absence = ONE - params.absence_pct / HUNDRED
    day_eff = d.efficiency_pct / HUNDRED
    ot = ZERO
    if params.overtime_pct > ZERO and d.operators:
        ops = Decimal(int(d.operators))
        ot = min(params.overtime_pct / HUNDRED * t * x, ops * x * max(ZERO, OT_DAY_MINUTES_CAP - t / ops))
    if eff_model.mode == MODE_PLAN:
        value = d.practical_minutes * x * absence + ot * day_eff * absence
    else:
        q = fp.BASIS_Q[params.efficiency_basis]
        if eff_model.mode == MODE_EMPIRICAL:
            assert eff_model.empirical is not None and eff_model.ratios is not None
            eff = (eff_model.weight * eff_model.empirical + (ONE - eff_model.weight) * day_eff) * eff_model.ratios[q]
        else:
            eff = day_eff * fp.FIXED_BAND_FACTOR[params.efficiency_basis]
        value = (t * x + ot) * absence * eff
    return quant(value, 4), quant(ot, 4)


@dataclass
class DayCapacity:
    known: Decimal = ZERO
    unknown: int = 0
    overtime: Decimal = ZERO
    working: bool = False
    reasons: dict[str, int] = field(default_factory=dict)


def capacity_by_day(inputs: EngineInputs, params: fp.ForwardParams) -> tuple[dict[date, DayCapacity], dict[str, int]]:
    cap = inputs.cap_demand if params.efficiency_basis == fp.BASIS_PLAN else (inputs.cap_plan or inputs.cap_demand)
    out: dict[date, DayCapacity] = {}
    modes: dict[str, int] = {}
    per_day_values: dict[date, list[Decimal]] = {}
    for lc in cap.lines:
        model = line_efficiency(inputs, lc.line.id, params.efficiency_basis)
        modes[model.mode] = modes.get(model.mode, 0) + 1
        for d in lc.days:
            slot = out.setdefault(d.day, DayCapacity())
            slot.working = slot.working or d.is_working_day
            value, ot = day_capacity(d, params, model)
            if value is None:
                slot.unknown += 1
                for m in d.missing_inputs or ["capacity"]:
                    slot.reasons[m] = slot.reasons.get(m, 0) + 1
                continue
            slot.known += value
            slot.overtime += ot
            if d.is_working_day:
                per_day_values.setdefault(d.day, []).append(value)
    if params.virtual_lines:
        v = Decimal(params.virtual_lines)
        for day, values in per_day_values.items():
            med = st.median(values)
            if med is not None:
                out[day].known += quant(med * v, 4)
    return out, modes


def _efficiency_mode(modes: dict[str, int]) -> str:
    if not modes:
        return MODE_PLAN
    return next(iter(modes)) if len(modes) == 1 else "MIXED"


# --------------------------------------------------------------------------- buckets


def bucket_ranges(today: date, end: date, bucket: str) -> list[tuple[date, date, bool]]:
    out: list[tuple[date, date, bool]] = []
    if bucket == fp.BUCKET_WEEK:
        start = today
        while start <= end:
            out.append((start, min(start + timedelta(days=6), end), False))
            start += timedelta(days=7)
        return out
    start = today
    while start <= end:
        nxt = date(start.year + (start.month // 12), start.month % 12 + 1, 1)
        stop = min(nxt - timedelta(days=1), end)
        partial = start.day != 1 or stop != nxt - timedelta(days=1)
        out.append((start, stop, partial))
        start = stop + timedelta(days=1)
    return out


def layer_days_of(inputs: EngineInputs) -> dict[str, dict[date, Decimal]]:
    days = {k: dict(v) for k, v in inputs.layers.days.items()}
    for per_day in inputs.forecast_days.values():
        slot = days.setdefault(fp.L_FORECAST, {})
        for d, m in per_day.items():
            slot[d] = slot.get(d, ZERO) + m
    return days


def _forecast_items(inputs: EngineInputs) -> list[DemandItem]:
    from app.modules.mfg_intelligence.demand_layers import KIND_FORECAST

    items = []
    for (mm, fam), per_day in sorted(inputs.forecast_days.items()):
        items.append(DemandItem(kind=KIND_FORECAST, key=f"forecast:{month_key(mm)}:{fam}",
                                days_by_layer={fp.L_FORECAST: per_day}, priority=(mm, fam),
                                meta={"month": month_key(mm), "family": fam}))
    return items


def admission_order(inputs: EngineInputs) -> list[DemandItem]:
    return (
        sorted(inputs.layers.unplanned_items, key=lambda i: i.priority)
        + sorted(inputs.layers.tentative_items, key=lambda i: i.priority)
        + _forecast_items(inputs)
    )


@dataclass
class ConstrainedResult:
    admitted: dict[str, dict[date, Decimal]]
    items: list[dict[str, Any]]
    deferred: dict[str, Decimal]
    overload_weeks: list[int]
    week_free_after: list[Decimal]
    item_admitted: dict[str, Decimal]


def constrain(
    inputs: EngineInputs, cap_days: dict[date, DayCapacity], booked: dict[date, Decimal], items: list[DemandItem]
) -> ConstrainedResult:
    weeks = bucket_ranges(inputs.today, inputs.end, fp.BUCKET_WEEK)

    def week_of(d: date) -> int:
        return (d - inputs.today).days // 7

    week_days = [[s + timedelta(days=k) for k in range((e - s).days + 1)] for s, e, _p in weeks]
    cap_w = [sum((cap_days[d].known for d in ds if d in cap_days), ZERO) for ds in week_days]
    booked_w = [sum((booked.get(d, ZERO) for d in ds), ZERO) for ds in week_days]
    free = [max(ZERO, c - b) for c, b in zip(cap_w, booked_w)]
    overload = [i for i, (c, b) in enumerate(zip(cap_w, booked_w)) if b > c]
    admitted_w: list[dict[str, Decimal]] = [dict() for _ in weeks]
    deferred: dict[str, Decimal] = {}
    out_items: list[dict[str, Any]] = []
    item_admitted: dict[str, Decimal] = {}
    for item in items:
        portions: dict[tuple[int, str], Decimal] = {}
        for layer, per_day in item.days_by_layer.items():
            for d, m in per_day.items():
                key = (week_of(d), layer)
                portions[key] = portions.get(key, ZERO) + m
        got = left = ZERO
        pushed = 0
        for (w0, layer), minutes in sorted(portions.items()):
            rest = minutes
            w = w0
            while rest > ZERO and w < len(weeks):
                take = min(rest, free[w])
                if take > ZERO:
                    free[w] -= take
                    admitted_w[w][layer] = admitted_w[w].get(layer, ZERO) + take
                    got += take
                    pushed = max(pushed, w - w0)
                    rest -= take
                if rest > ZERO:
                    w += 1
            if rest > ZERO:
                deferred[layer] = deferred.get(layer, ZERO) + rest
                left += rest
        item_admitted[item.key] = got
        if len(out_items) < MAX_ITEMS_OUT:
            out_items.append({
                "key": item.key,
                "kind": item.kind,
                "layers": sorted(item.days_by_layer),
                "minutes": dec_str(got + left),
                "admitted_minutes": dec_str(got),
                "deferred_minutes": dec_str(left),
                "buckets_pushed": pushed,
                "reason_codes": ["DEFERRED_BEYOND_HORIZON"] if left > ZERO else [],
            })
    # place each week's admitted minutes on its days, pro rata to the day's free capacity
    admitted: dict[str, dict[date, Decimal]] = {}
    for w, ds in enumerate(week_days):
        if not admitted_w[w]:
            continue
        free_d = [(d, max(ZERO, (cap_days[d].known if d in cap_days else ZERO) - booked.get(d, ZERO))) for d in ds]
        free_d = [(d, f) for d, f in free_d if f > ZERO]
        total = sum((f for _d, f in free_d), ZERO)
        for layer, amount in admitted_w[w].items():
            slot = admitted.setdefault(layer, {})
            if total <= ZERO:
                slot[ds[0]] = slot.get(ds[0], ZERO) + amount
                continue
            placed = ZERO
            for i, (d, f) in enumerate(free_d):
                share = amount - placed if i == len(free_d) - 1 else quant(amount * f / total, 4)
                placed += share
                slot[d] = slot.get(d, ZERO) + share
    return ConstrainedResult(admitted, out_items, deferred, overload, free, item_admitted)


def _bucket_payloads(
    inputs: EngineInputs,
    bucket: str,
    cap_days: dict[date, DayCapacity],
    layer_days: dict[str, dict[date, Decimal]],
    selected: tuple[str, ...],
    overload_weeks: list[int] | None = None,
) -> list[dict[str, Any]]:
    out = []
    for idx, (start, stop, partial) in enumerate(bucket_ranges(inputs.today, inputs.end, bucket)):
        days = [start + timedelta(days=k) for k in range((stop - start).days + 1)]
        capacity = sum((cap_days[d].known for d in days if d in cap_days), ZERO)
        unknown = sum((cap_days[d].unknown for d in days if d in cap_days), 0)
        overtime = sum((cap_days[d].overtime for d in days if d in cap_days), ZERO)
        reasons_count: dict[str, int] = {}
        for d in days:
            if d in cap_days:
                for k, v in cap_days[d].reasons.items():
                    reasons_count[k] = reasons_count.get(k, 0) + v
        layers = {layer: sum((per.get(d, ZERO) for d in days), ZERO) for layer, per in layer_days.items()}
        load = sum((layers.get(layer, ZERO) for layer in selected), ZERO)
        status = "PARTIAL" if unknown else "COMPLETE"
        util = quant(load / capacity * HUNDRED, 2) if capacity > ZERO and not unknown else None
        codes: list[str] = []
        if unknown:
            codes.append("CAPACITY_UNKNOWN_ON_SOME_LINE_DAYS")
        if partial:
            codes.append("PARTIAL_MONTH")
        if overload_weeks is not None and bucket == fp.BUCKET_WEEK and idx in overload_weeks:
            codes.append("BOOKED_OVERLOAD")
        if load > capacity and capacity >= ZERO and not unknown:
            codes.append("OVERLOADED")
        out.append({
            "index": idx,
            "start": start,
            "end": stop,
            "working_days": sum(1 for d in days if d in cap_days and cap_days[d].working),
            "capacity_minutes": dec_str(capacity),
            "capacity_status": status,
            "unknown_line_days": unknown,
            "unknown_reasons": dict(sorted(reasons_count.items())),
            "overtime_minutes": dec_str(overtime),
            "partial_month": partial,
            "layers": {layer: dec_str(layers.get(layer, ZERO)) for layer in fp.LAYERS},
            "load_minutes": dec_str(load),
            "gap_minutes": dec_str(capacity - load),
            "utilization_pct": dec_str(util),
            "reason_codes": codes,
        })
    return out


def evaluate(inputs: EngineInputs, params: fp.ForwardParams, bucket: str) -> dict[str, Any]:
    cap_days, modes = capacity_by_day(inputs, params)
    layer_days = layer_days_of(inputs)
    selected = params.layers
    constrained_out: dict[str, Any] | None = None
    overload_weeks: list[int] | None = None
    effective_days = layer_days
    effective_selected: tuple[str, ...] = selected
    if params.finite:
        booked: dict[date, Decimal] = {}
        for layer in fp.BOOKED_LAYERS:
            for d, m in layer_days.get(layer, {}).items():
                booked[d] = booked.get(d, ZERO) + m
        items = [i for i in admission_order(inputs) if any(layer in selected for layer in i.days_by_layer)]
        res = constrain(inputs, cap_days, booked, items)
        overload_weeks = res.overload_weeks
        effective_days = {layer: layer_days.get(layer, {}) for layer in fp.BOOKED_LAYERS}
        for layer, per_day in res.admitted.items():
            effective_days[layer] = per_day
        effective_selected = selected
        constrained_out = {
            "items": res.items,
            "items_truncated": len(items) > MAX_ITEMS_OUT,
            "deferred_beyond_horizon_minutes": {k: dec_str(v) for k, v in sorted(res.deferred.items())},
            "booked_overload_weeks": res.overload_weeks,
        }
    buckets = _bucket_payloads(inputs, bucket, cap_days, effective_days, effective_selected, overload_weeks)
    totals_layers = {
        layer: sum((m for m in effective_days.get(layer, {}).values()), ZERO) for layer in fp.LAYERS
    }
    capacity_total = sum((c.known for c in cap_days.values()), ZERO)
    load_total = sum((totals_layers[layer] for layer in effective_selected), ZERO)
    reason_codes = list(inputs.layers.reason_codes)
    if any(b["capacity_status"] == "PARTIAL" for b in buckets):
        reason_codes.append("CAPACITY_PARTIAL")
    if params.virtual_lines:
        reason_codes.append("VIRTUAL")
    mode = _efficiency_mode(modes)
    if mode in (MODE_FIXED, "MIXED"):
        reason_codes.append("FIXED_BANDS")
    counts = dict(inputs.layers.counts)
    return {
        "engine_version": ENGINE_VERSION,
        "as_of": inputs.today,
        "date_from": inputs.today,
        "date_to": inputs.end,
        "horizon_days": inputs.horizon_days,
        "bucket": bucket,
        "factory_unit": inputs.factory_unit,
        "scenario": params.scenario,
        "parameters": params.out(),
        "layers_included": list(effective_selected),
        "efficiency": {
            "basis": params.efficiency_basis,
            "mode": mode,
            "lines_by_mode": dict(sorted(modes.items())),
            "predictive": inputs.predictive,
        },
        "frozen_end": inputs.frozen_end,
        "lines": len(inputs.cap_demand.lines),
        "virtual_lines": params.virtual_lines,
        "buckets": buckets,
        "totals": {
            "capacity_minutes": dec_str(capacity_total),
            "load_minutes": dec_str(load_total),
            "gap_minutes": dec_str(capacity_total - load_total),
            "overtime_minutes": dec_str(sum((c.overtime for c in cap_days.values()), ZERO)),
            "layers": {k: dec_str(v) for k, v in totals_layers.items()},
        },
        "constrained": constrained_out,
        "identity": {
            "orders": inputs.layers.identity,
            "totals": {k: dec_str(v, 3) for k, v in inputs.layers.identity_totals.items()},
        },
        "counts": counts,
        "beyond_horizon_minutes": {
            **{k: dec_str(v) for k, v in sorted(inputs.layers.beyond_horizon.items())},
            **({fp.L_FORECAST: dec_str(inputs.forecast_beyond)} if inputs.forecast_beyond > ZERO else {}),
        },
        "forecast": {
            "availability": "AVAILABLE" if inputs.forecast.available else "UNAVAILABLE",
            "families_available": sorted(f for f, s in inputs.forecast.availability.items() if s == "AVAILABLE"),
            "families_insufficient": sorted(f for f, s in inputs.forecast.availability.items() if s != "AVAILABLE"),
            "coverage_pct": dec_str(inputs.forecast.coverage_pct),
        },
        "median_line_daily_minutes": dec_str(inputs.layers.median_daily_minutes),
        "reason_codes": list(dict.fromkeys(reason_codes)),
        "notices": list(inputs.notices),
        "assumptions": list(ASSUMPTIONS) + list(inputs.cap_demand.assumptions_extra),
    }


def compare_payload(inputs: EngineInputs, params_list: list[fp.ForwardParams], bucket: str) -> dict[str, Any]:
    scenarios = []
    for params in params_list:
        full = evaluate(inputs, params, bucket)
        constrained = full["constrained"]
        scenarios.append({
            "scenario": full["scenario"],
            "parameters": full["parameters"],
            "layers_included": full["layers_included"],
            "efficiency": full["efficiency"],
            "buckets": full["buckets"],
            "totals": full["totals"],
            "deferred_beyond_horizon_minutes": constrained["deferred_beyond_horizon_minutes"] if constrained else None,
            "reason_codes": full["reason_codes"],
        })
    return {
        "engine_version": ENGINE_VERSION,
        "as_of": inputs.today,
        "date_from": inputs.today,
        "date_to": inputs.end,
        "horizon_days": inputs.horizon_days,
        "bucket": bucket,
        "factory_unit": inputs.factory_unit,
        "scenarios": scenarios,
        "notices": list(inputs.notices),
        "assumptions": list(ASSUMPTIONS),
    }
