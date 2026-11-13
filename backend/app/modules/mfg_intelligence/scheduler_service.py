"""Finite-capacity scheduler (Manufacturing Intelligence Phase 5, run B2). Read-only: produces a PROPOSAL only.

Plan doc 16 D14-D24 with the binding resolutions 15.7-15.11. A pure greedy engine (`run_scheduler`) over plain
dataclasses; the async loader (`load_scheduler_inputs`) reads everything first in a fixed number of queries.

Scope (15.7)
- Basis is PLAN only. frozen_end = today + frozen_horizon_days - 1; nothing is placed or moved on or before it.
- Jobs: `row:<config_id>` = a SOFT_BOOKED row of a confirmed order, starting after frozen_end, completed_qty 0
  (UPDATE line / start / end only); `order:<order_id>` = the unplanned remainder of a confirmed order (one CREATE,
  SOFT_BOOKED). FIRM rows are never moved (late ones: FIRM_RESCHEDULE_SUGGESTED). DRAFT, unconfirmed and unlinked
  rows are never jobs; DRAFT rows are not fixed load.
- Free capacity: one `compute_capacity` call with a Scenario that removes every movable row; their current load is
  then reserved again and released only when the job itself is scheduled, so a job that is not changed (JOB_LIMIT,
  SMV_UNKNOWN, REVISION_ITEM_LIMIT, NO_CAPACITY_IN_HORIZON, PINNED_BY_USER) keeps its load. Tentative bookings never
  block (TENTATIVE_DISPLACED is reported). At most 100 jobs (D17 key), 50 changed items, 60 candidate lines.
Priority (D17): (need-by, slack, order code, job id); need-by = delivery date - open POST-sewing lead days;
slack = need-by - earliest start - ceil(minutes / median line daily practical minutes).
Earliest start (D23): max(frozen_end + 1, material ready P50 + material_delay_days (+ btb_delay_days when a PO of the
order is BTB-linked)); lateness percentiles only when predictive is on; unknown material = not limiting.
Placement (15.8, 15.9): base capacity only (no overtime). From the first working day >= earliest with free capacity,
the shortest span of n working days with minutes / n <= free on every day (Phase 1 even spread); the first day loses
the changeover share (D19: changeover_loss_pct of that day's practical minutes, half for a same-family change).
Line choice (D18): min (lateness days, changeover rank, idle gap days, overtime minutes, line code, line id);
changeover rank 0 same style, 1 same family, 2 other / new setup, 3 family never run on the line in 365 days (D21).
Late jobs: OVERTIME_WOULD_RECOVER with the minutes overtime would need (advisory), SPLIT_NOT_EVALUATED.
`proposal_hash` = sha256 over {engine_version, params, today, frozen_end, settings, every job result} (15.11).
"""
from __future__ import annotations

import bisect
import hashlib
import json
import re
from dataclasses import dataclass, field, replace
from datetime import date, timedelta
from decimal import ROUND_CEILING, ROUND_FLOOR, Decimal
from types import SimpleNamespace
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, Order, SewingLineStyleConfig, Tenant
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.modules.mfg_intelligence import forward_plan_params as fp
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.capacity_service import compute_capacity, fetch_active_lines
from app.modules.mfg_intelligence.confirmed_demand import is_confirmed_status
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, to_dec
from app.modules.mfg_intelligence.empirical_efficiency_service import FAMILY_UNSPECIFIED, family_of
from app.modules.mfg_intelligence.flags import predictive_on
from app.modules.mfg_intelligence.forward_plan_service import TooManyLines, count_active_lines
from app.modules.mfg_intelligence.line_loading_service import (
    CLASS_FIRM,
    CLASS_SOFT,
    fetch_live_plan_rows,
    row_end_date,
)
from app.modules.mfg_intelligence.scenario import Scenario
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows

ENGINE_VERSION = "mi-scheduler-5.0"
MAX_JOBS = 100
MAX_ITEMS = 50
MAX_LINES = 60
MAX_EXCLUDE = 100
MAX_JOBS_OUT = 300
MAX_DELAY_DAYS = 60
PROVEN_DAYS = 365
OT_MINUTES_PER_OPERATOR = 120  # 8 h + 2 h overtime per operator-day (doc 16 15.6)
BLOCKED = 10**15
JOB_ID = re.compile(r"^(row|order):([1-9][0-9]{0,17})$")
HUNDRED = Decimal("100")
CENTS = Decimal("100")

ASSUMPTIONS = [
    "Proposal only: nothing changes until an approver applies the plan revision (four-eyes and lock checks apply).",
    "No booking is placed or moved inside the frozen zone; FIRM bookings are never moved.",
    "Each job goes on one line (no split); the load is spread evenly over its working days like the line loading view.",
    "Placements use normal capacity only; overtime is shown as a suggestion for late jobs.",
    "A style change costs part of the first day (changeover loss setting); a line that never ran the style family "
    "in the last 365 days is the last choice.",
    "Tentative bookings never block a placement; overlaps are listed.",
    "Moved bookings keep their own efficiency, operators and shift; new bookings use the line's efficiency of the "
    "first day and the line's default operators. The approval recomputes the exact impact.",
]


def coded(status_code: int, code: str, message: str):
    return fp.coded_error(status_code, code, message)


def _cents_floor(value: Decimal | None) -> int | None:
    if value is None:
        return None
    return int((value * CENTS).to_integral_value(rounding=ROUND_FLOOR))


def _cents_ceil(value: Decimal) -> int:
    return int((value * CENTS).to_integral_value(rounding=ROUND_CEILING))


def _ceil_div(a: int, b: int) -> int:
    return -(-a // b)


# --------------------------------------------------------------------------- parameters


@dataclass(frozen=True)
class SchedulerParams:
    horizon_days: int = fp.DEFAULT_HORIZON
    factory_unit: str | None = None
    material_delay_days: int = 0
    btb_delay_days: int = 0
    exclude_job_ids: tuple[str, ...] = ()

    def out(self) -> dict[str, Any]:
        return {
            "horizon_days": self.horizon_days,
            "factory_unit": self.factory_unit,
            "efficiency_basis": fp.BASIS_PLAN,
            "material_delay_days": self.material_delay_days,
            "btb_delay_days": self.btb_delay_days,
            "exclude_job_ids": list(self.exclude_job_ids),
        }


def build_scheduler_params(
    *,
    horizon_days: int = fp.DEFAULT_HORIZON,
    factory_unit: str | None = None,
    efficiency_basis: str | None = None,
    material_delay_days: int = 0,
    btb_delay_days: int = 0,
    exclude_job_ids: list[str] | tuple[str, ...] | None = None,
) -> SchedulerParams:
    if horizon_days not in fp.HORIZONS:
        raise coded(422, "HORIZON_NOT_ALLOWED", f"horizon_days must be one of {', '.join(map(str, fp.HORIZONS))}")
    basis = (efficiency_basis or fp.BASIS_PLAN).strip().upper()
    if basis != fp.BASIS_PLAN:
        raise coded(422, "SCHEDULER_PLAN_BASIS_ONLY", "The scheduler uses the PLAN efficiency basis only")
    for name, value in (("material_delay_days", material_delay_days), ("btb_delay_days", btb_delay_days)):
        if not isinstance(value, int) or isinstance(value, bool) or not 0 <= value <= MAX_DELAY_DAYS:
            raise coded(422, "PARAMETER_OUT_OF_RANGE", f"{name} must be between 0 and {MAX_DELAY_DAYS}")
    raw = [str(x).strip() for x in (exclude_job_ids or []) if str(x).strip()]
    if len(raw) > MAX_EXCLUDE:
        raise coded(422, "TOO_MANY_EXCLUDED_JOBS", f"At most {MAX_EXCLUDE} jobs can be excluded")
    for job_id in raw:
        if not JOB_ID.match(job_id):
            raise coded(422, "JOB_ID_INVALID", "exclude_job_ids must look like row:<id> or order:<id>")
    unit = (factory_unit or "").strip() or None
    return SchedulerParams(horizon_days, unit, material_delay_days, btb_delay_days, tuple(sorted(set(raw))))


# --------------------------------------------------------------------------- data


@dataclass
class LineState:
    line_id: int
    line_code: str
    name: str | None
    factory_unit: str | None
    theo: list[int | None]  # centi operator-minutes per working day after frozen_end
    base_prac: list[int | None]  # centi SMV-minutes of practical capacity without the movable rows
    prac: list[int | None]
    eff: list[Decimal | None]  # the day's efficiency % (Phase 1)
    ops: list[int | None]
    used: list[int]
    owners: list[int]  # live rows active on the day (decides whose efficiency Phase 1 uses)
    timeline: list[tuple[date, date, int, int | None, str]] = field(default_factory=list)  # (end, start, seq, style, family)
    tentative: list[tuple[date, date, int]] = field(default_factory=list)  # (start, end, booking id)

    def copy(self) -> "LineState":
        return replace(
            self, theo=list(self.theo), base_prac=list(self.base_prac), prac=list(self.prac), eff=list(self.eff),
            ops=list(self.ops), used=list(self.used), owners=list(self.owners), timeline=list(self.timeline),
            tentative=list(self.tentative),
        )


@dataclass
class Job:
    job_id: str
    kind: str  # ROW | ORDER
    order_id: int
    order_code: str | None
    config_id: int | None
    style_id: int | None
    family: str
    qty: Decimal
    smv: Decimal | None
    minutes_c: int | None
    need_by: date | None
    row_eff: Decimal | None = None  # UPDATE keeps the row's own efficiency
    current: tuple[int, date, date] | None = None  # (line, start, end)
    reserved: tuple[int, list[int], int] | None = None  # (line index, day indexes, centi-minutes per day)
    earliest: date | None = None
    reasons: list[str] = field(default_factory=list)
    status: str | None = None  # preset (PINNED / UNSCHEDULED) before the run


@dataclass
class SchedulerInputs:
    today: date
    end: date
    frozen_end: date
    params: SchedulerParams
    settings: dict[str, int]
    days: list[date]  # working days after frozen_end up to the horizon end
    lines: list[LineState]
    jobs: list[Job]  # every job, D17 order; only the first MAX_JOBS without a preset status are scheduled
    proven: set[tuple[int, str]]
    median_daily_c: int | None
    firm_late: list[dict[str, Any]]
    counts: dict[str, int]
    notices: list[str]


# --------------------------------------------------------------------------- loader


async def _order_rows(db: AsyncSession, tenant_id: int, ids: set[int]) -> dict[int, Any]:
    if not ids:
        return {}
    return {
        int(r.id): r
        for r in (
            await db.execute(
                select(Order.id, Order.status, Order.order_code, Order.delivery_date, Order.style_id).where(
                    Order.tenant_id == tenant_id, Order.id.in_(sorted(ids))
                )
            )
        ).all()
    }


async def _families(db: AsyncSession, tenant_id: int, style_ids: set[int]) -> dict[int, str]:
    if not style_ids:
        return {}
    return {
        int(sid): family_of(ptype)
        for sid, ptype in (
            await db.execute(
                select(GarmentStyle.id, GarmentStyle.product_type).where(
                    GarmentStyle.tenant_id == tenant_id, GarmentStyle.id.in_(sorted(style_ids))
                )
            )
        ).all()
    }


async def _proven_families(db: AsyncSession, tenant_id: int, line_ids: list[int], today: date) -> set[tuple[int, str]]:
    if not line_ids:
        return set()
    cfg = SewingLineStyleConfig
    rows = (
        await db.execute(
            select(cfg.line_id, GarmentStyle.product_type)
            .join(GarmentStyle, (GarmentStyle.id == cfg.style_id) & (GarmentStyle.tenant_id == tenant_id))
            .where(
                cfg.tenant_id == tenant_id,
                cfg.line_id.in_(line_ids),
                func.upper(func.trim(cfg.reservation_status)).notin_(("CANCELLED", "DRAFT")),
                cfg.start_date >= today - timedelta(days=PROVEN_DAYS),
                cfg.start_date <= today,
            )
            .distinct()
        )
    ).all()
    return {(int(lid), family_of(ptype)) for lid, ptype in rows}


async def _btb_linked_orders(db: AsyncSession, tenant_id: int, order_ids: list[int]) -> set[int]:
    if not order_ids:
        return set()
    eff_order = func.coalesce(PurchaseOrderItem.source_order_id, PurchaseOrder.source_order_id)
    rows = (
        await db.execute(
            select(eff_order)
            .join(PurchaseOrder, (PurchaseOrder.id == PurchaseOrderItem.purchase_order_id) & (PurchaseOrder.tenant_id == tenant_id))
            .where(
                PurchaseOrderItem.tenant_id == tenant_id,
                eff_order.in_(order_ids),
                PurchaseOrder.btb_lc_id.isnot(None),
                or_(PurchaseOrder.status.is_(None), func.upper(PurchaseOrder.status).notin_(("CANCELLED", "DRAFT"))),
            )
            .distinct()
        )
    ).all()
    return {int(r[0]) for r in rows if r[0] is not None}


def _spread_days(calendar: Any, start: date, end: date) -> list[date]:
    days = calendar.working_days(start, end)
    if not days:
        d = calendar.first_working_on_or_after(start)
        days = [d] if d is not None else []
    return days


async def load_scheduler_inputs(db: AsyncSession, tenant: Tenant, params: SchedulerParams, *, today: date) -> SchedulerInputs:
    from app.modules.mfg_intelligence.delivery_forecast_service import material_ready_dates
    from app.modules.mfg_intelligence.demand_layers import load_demand_layers
    from app.modules.production.planning_settings_service import read_planning_settings

    tid = tenant.id
    settings_raw = await read_planning_settings(db, tid)
    settings = {
        "frozen_horizon_days": int(settings_raw["frozen_horizon_days"]),
        "changeover_loss_pct": int(settings_raw["changeover_loss_pct"]),
    }
    end = today + timedelta(days=params.horizon_days - 1)
    frozen_end = today + timedelta(days=settings["frozen_horizon_days"] - 1)
    n_lines = await count_active_lines(db, tid, params.factory_unit)
    if n_lines > MAX_LINES:
        raise TooManyLines(n_lines)
    lines = await fetch_active_lines(db, tid, factory_unit=params.factory_unit)
    line_ids = [ln.id for ln in lines]
    notices: list[str] = []

    # movable rows are decided before the capacity read (they are removed from it)
    raw_rows, truncated = await fetch_live_plan_rows(db, tid, window_start=today, window_end=end, line_ids=line_ids)
    if truncated:
        notices.append("PLAN_ROWS_TRUNCATED: only the first 5000 plan rows were read")
    orders = await _order_rows(db, tid, {int(r.order_id) for r in raw_rows if r.order_id})
    movable = [
        r for r in raw_rows
        if (r.reservation_status or "").strip().upper() == "SOFT_BOOKED" and r.order_id
        and int(r.order_id) in orders and is_confirmed_status(orders[int(r.order_id)].status)
        and r.start_date > frozen_end
        and (to_dec(r.completed_qty) or ZERO) == ZERO and (to_dec(r.planned_qty) or ZERO) > ZERO
    ]
    movable_ids = {int(r.id) for r in movable}
    scenario = Scenario(replacements={int(r.id): None for r in movable})
    cap = await compute_capacity(
        db, tid, window_start=today, window_end=end, line_ids=line_ids, scenario=scenario,
        include_tentative=True, integrated_planning=True, today=today,
    )
    calendar = cap.loading.calendar
    layers = await load_demand_layers(db, tid, cap, today=today, end=end, integrated=True, factory_unit=params.factory_unit)
    notices.extend(n for n in cap.notices + layers.notices if n not in notices)

    days = [d for d in calendar.working_days(frozen_end + timedelta(days=1), end)]
    index = {d: k for k, d in enumerate(days)}
    smv_rows = await resolve_smv_for_rows(db, tid, movable, use_style_standard=True) if movable else {}
    unplanned = list(layers.unplanned_items)
    synth = [
        SimpleNamespace(id=int(i.meta["order_id"]), style_id=layers.order_meta[int(i.meta["order_id"])]["style_id"],
                        ob_id=None, smv_per_piece=None)
        for i in unplanned
    ]
    smv_orders = await resolve_smv_for_rows(db, tid, synth, use_style_standard=True) if synth else {}
    style_ids = {int(r.style_id) for r in movable if r.style_id} | {int(s.style_id) for s in synth if s.style_id} | {
        int(i.cfg.style_id) for i in cap.loading.rows if getattr(i.cfg, "style_id", None)
    }
    families = await _families(db, tid, style_ids)
    proven = await _proven_families(db, tid, line_ids, today)

    def fam(style_id: Any) -> str:
        return families.get(int(style_id), FAMILY_UNSPECIFIED) if style_id else FAMILY_UNSPECIFIED

    # ---- line states
    states: list[LineState] = []
    pos_by_line: dict[int, int] = {}
    for lc in cap.lines:
        by_day = {d.day: d for d in lc.days}
        n = len(days)
        st_ = LineState(
            line_id=lc.line.id, line_code=lc.line.line_code, name=lc.line.name, factory_unit=lc.line.factory_unit,
            theo=[None] * n, base_prac=[None] * n, prac=[None] * n, eff=[None] * n, ops=[None] * n,
            used=[0] * n, owners=[0] * n,
        )
        for k, d in enumerate(days):
            dc = by_day.get(d)
            if dc is None or not dc.is_working_day:
                continue
            st_.theo[k] = _cents_floor(dc.theoretical_minutes)
            st_.base_prac[k] = st_.prac[k] = _cents_floor(dc.practical_minutes)
            st_.eff[k] = dc.efficiency_pct
            st_.ops[k] = dc.operators
            if dc.load.unresolved_firm or dc.load.unresolved_soft:
                st_.used[k] = BLOCKED  # a booked row with unknown SMV: its load is unknown, never fill the day
        pos_by_line[lc.line.id] = len(states)
        states.append(st_)

    seq = 0
    for item in cap.loading.rows:
        cfg = item.cfg
        li = pos_by_line.get(int(cfg.line_id))
        if li is None:
            continue
        state = states[li]
        start, stop = cfg.start_date, row_end_date(cfg)
        if getattr(cfg, "is_tentative", False):
            state.tentative.append((start, stop, int(cfg.booking_id)))
            continue
        # every live row active on a day (DRAFT included) decides the day's efficiency in Phase 1
        for k in range(bisect.bisect_left(days, start), bisect.bisect_right(days, stop)):
            state.owners[k] += 1
        if item.demand_class in (CLASS_FIRM, CLASS_SOFT):  # DRAFT rows are never fixed load
            for d, m in item.allocation.items():
                k = index.get(d)
                if k is not None and state.used[k] < BLOCKED:
                    state.used[k] += _cents_ceil(m)
            seq += 1
            state.timeline.append((stop, start, seq, int(cfg.style_id) if cfg.style_id else None, fam(cfg.style_id)))
    for state in states:
        state.timeline.sort()
        state.tentative.sort()

    # ---- jobs
    jobs: list[Job] = []
    for r in movable:
        o = orders[int(r.order_id)]
        smv = smv_rows[r.id].value if r.id in smv_rows else None
        qty = to_dec(r.planned_qty) or ZERO
        job = Job(
            job_id=f"row:{r.id}", kind="ROW", order_id=int(r.order_id), order_code=o.order_code, config_id=int(r.id),
            style_id=int(r.style_id) if r.style_id else None, family=fam(r.style_id), qty=qty, smv=smv,
            minutes_c=_cents_ceil(qty * smv) if smv is not None else None,
            need_by=(layers.order_meta.get(int(r.order_id)) or {}).get("need_by"),
            row_eff=to_dec(r.target_efficiency_pct), current=(int(r.line_id), r.start_date, row_end_date(r)),
        )
        li = pos_by_line.get(int(r.line_id))
        span = [index[d] for d in _spread_days(calendar, r.start_date, row_end_date(r)) if d in index]
        if li is not None and span:
            state = states[li]
            share = _ceil_div(job.minutes_c, len(_spread_days(calendar, r.start_date, row_end_date(r)))) if job.minutes_c else BLOCKED
            for k in span:
                state.used[k] = min(BLOCKED, state.used[k] + share)
                state.owners[k] += 1
            job.reserved = (li, span, share)
        if smv is None:
            job.status, job.reasons = "UNSCHEDULED", ["SMV_UNKNOWN"]
        jobs.append(job)
    for i, s in zip(unplanned, synth):
        oid = int(i.meta["order_id"])
        smv = smv_orders[oid].value if oid in smv_orders else None
        qty = to_dec(i.meta["unplanned_qty"]) or ZERO
        job = Job(
            job_id=f"order:{oid}", kind="ORDER", order_id=oid, order_code=i.meta.get("order_code"), config_id=None,
            style_id=int(s.style_id) if s.style_id else None, family=fam(s.style_id), qty=qty, smv=smv,
            minutes_c=_cents_ceil(qty * smv) if smv is not None else None, need_by=i.meta.get("need_by"),
        )
        if smv is None:
            job.status, job.reasons = "UNSCHEDULED", ["SMV_UNKNOWN"]
        elif int((layers.order_meta.get(oid) or {}).get("draft_rows") or 0) > 0:
            # a planner already drafted rows for this order; a new booking may duplicate them (warning, not a block)
            job.reasons.append("DRAFT_ROWS_PRESENT")
        jobs.append(job)
    for job in jobs:
        if job.job_id in params.exclude_job_ids and job.status is None:
            job.status, job.reasons = "PINNED", ["PINNED_BY_USER"]

    median_c = _cents_floor(layers.median_daily_minutes) if layers.median_daily_minutes else None
    first_day = days[0] if days else frozen_end + timedelta(days=1)

    def key(job: Job, earliest: date) -> tuple:
        est = _ceil_div(job.minutes_c, median_c) if job.minutes_c and median_c else 0
        slack = ((job.need_by - earliest).days - est) if job.need_by else 10**6
        return (job.need_by or date.max, slack, job.order_code or "", job.kind, job.config_id or job.order_id)

    open_jobs = sorted((j for j in jobs if j.status is None), key=lambda j: key(j, first_day))
    for j in open_jobs[MAX_JOBS:]:
        j.status, j.reasons = "UNSCHEDULED", ["JOB_LIMIT"]
    chosen = open_jobs[:MAX_JOBS]

    # ---- earliest start: frozen fence + material (D23)
    order_ids = sorted({j.order_id for j in chosen})
    ready: dict[int, Any] = {}
    btb: set[int] = set()
    if order_ids:
        order_objs = list((await db.execute(select(Order).where(Order.tenant_id == tid, Order.id.in_(order_ids)).order_by(Order.id))).scalars().all())
        ready = await material_ready_dates(db, tenant, order_objs, today=today, q=st.Q50, apply_lateness=predictive_on(tenant))
        btb = await _btb_linked_orders(db, tid, order_ids)
    for j in chosen:
        earliest = first_day
        mr = ready.get(j.order_id)
        if mr is None or mr.status == "NOT_EVALUATED":
            j.reasons.append("MATERIAL_NOT_EVALUATED")
        elif mr.status == "UNKNOWN":
            j.reasons.append("MATERIAL_DATE_UNKNOWN")
        else:
            base = mr.ready_date or today
            limit = base + timedelta(days=params.material_delay_days + (params.btb_delay_days if j.order_id in btb else 0))
            if limit > earliest:
                earliest = limit
                j.reasons.append("MATERIAL_LIMITED")
        j.earliest = earliest
    chosen.sort(key=lambda j: key(j, j.earliest or first_day))
    ordered = chosen + [j for j in jobs if j not in chosen]

    # ---- FIRM rows that would be late (read-only message)
    firm_late: list[dict[str, Any]] = []
    for item in cap.loading.rows:
        cfg = item.cfg
        if getattr(cfg, "is_tentative", False) or item.demand_class != CLASS_FIRM or not item.order_confirmed or not cfg.order_id:
            continue
        need_by = (layers.order_meta.get(int(cfg.order_id)) or {}).get("need_by")
        if need_by is not None and row_end_date(cfg) > need_by and len(firm_late) < MAX_JOBS:
            firm_late.append({"config_id": int(cfg.id), "order_id": int(cfg.order_id), "order_code": item.order_code,
                              "line_id": int(cfg.line_id), "end_date": row_end_date(cfg), "need_by": need_by,
                              "lateness_days": (row_end_date(cfg) - need_by).days,
                              "reason_codes": ["FIRM_RESCHEDULE_SUGGESTED"]})
    if params.factory_unit:
        notices.append("UNPLANNED_NOT_ATTRIBUTED_TO_UNIT: unplanned confirmed quantity is scheduled only without a factory unit")
    counts = {
        "candidate_lines": len(states),
        "movable_rows": len(movable_ids),
        "unplanned_orders": len(unplanned),
        "jobs_total": len(jobs),
        "jobs_scheduled": len(chosen),
        "job_limit": sum(1 for j in jobs if "JOB_LIMIT" in j.reasons),
        "pinned_by_user": sum(1 for j in jobs if j.status == "PINNED"),
        "smv_unknown": sum(1 for j in jobs if "SMV_UNKNOWN" in j.reasons) + layers.counts.get("orders_smv_unknown", 0),
        "orders_undated": layers.counts.get("orders_undated", 0),
        "unplanned_need_by_beyond_horizon": layers.counts.get("unplanned_need_by_beyond_horizon", 0),
        "draft_rows": layers.counts.get("draft_rows", 0),
    }
    return SchedulerInputs(
        today=today, end=end, frozen_end=frozen_end, params=params, settings=settings, days=days, lines=states,
        jobs=ordered, proven=proven, median_daily_c=median_c, firm_late=firm_late, counts=counts, notices=notices,
    )


# --------------------------------------------------------------------------- engine (pure)


@dataclass
class Candidate:
    line_index: int
    s: int
    e: int
    share: int
    loss: int
    rank: int
    idle: int
    lateness: int

    def score(self, lines: list[LineState]) -> tuple:
        ln = lines[self.line_index]
        return (self.lateness, self.rank, self.idle, 0, ln.line_code, ln.line_id)


CRITERIA = ("LATENESS", "CHANGEOVER", "IDLE_GAP", "OVERTIME", "LINE_CODE", "LINE_ID")


def _prev_entry(state: LineState, day: date) -> tuple | None:
    pos = bisect.bisect_left(state.timeline, (day,))
    return state.timeline[pos - 1] if pos > 0 else None


def _rank(state: LineState, job: Job, day: date, proven: set[tuple[int, str]]) -> tuple[int, date | None]:
    prev = _prev_entry(state, day)
    prev_end = prev[0] if prev else None
    if (state.line_id, job.family) not in proven:
        return 3, prev_end
    if prev is None:
        return 2, prev_end
    if job.style_id is not None and prev[3] == job.style_id:
        return 0, prev_end
    if prev[4] == job.family:
        return 1, prev_end
    return 2, prev_end


def _day_cap(state: LineState, k: int, job: Job) -> int | None:
    if state.theo[k] is None or state.prac[k] is None or state.eff[k] is None:
        return None
    if state.owners[k] == 0 and job.row_eff is not None and job.row_eff > ZERO:
        return int(Decimal(state.theo[k]) * job.row_eff / HUNDRED)
    return state.prac[k]


def _free(state: LineState, k: int, job: Job) -> int:
    cap = _day_cap(state, k, job)
    if cap is None:
        return 0
    return max(0, cap - state.used[k])


def _place(inputs: SchedulerInputs, state: LineState, li: int, job: Job, loss_pct: int) -> Candidate | None:
    days = inputs.days
    n = len(days)
    assert job.minutes_c is not None and job.earliest is not None
    need = job.minutes_c
    s = bisect.bisect_left(days, job.earliest)
    steps, max_steps = 0, 4 * max(1, n)
    while s < n and steps <= max_steps:
        while s < n and _free(state, s, job) <= 0:
            s += 1
            steps += 1
        if s >= n:
            return None
        rank, prev_end = _rank(state, job, days[s], inputs.proven)
        cap_s = _day_cap(state, s, job) or 0
        factor = Decimal(0) if rank == 0 else (Decimal("0.5") if rank == 1 else Decimal(1))
        loss = int(Decimal(cap_s) * Decimal(loss_pct) / HUNDRED * factor)
        minf: int | None = None
        argmin = s
        k = s
        while k < n:
            f = _free(state, k, job) - (loss if k == s else 0)
            steps += 1
            if f <= 0:
                break
            if minf is None or f < minf:
                minf, argmin = f, k
                if s + _ceil_div(need, minf) - 1 >= n:  # minf only falls: this start can never fit the horizon
                    k = n
                    break
            cnt = k - s + 1
            if need <= cnt * minf:
                base = max(job.earliest, prev_end + timedelta(days=1)) if prev_end else job.earliest
                lateness = max(0, (days[k] - job.need_by).days) if job.need_by else 0
                return Candidate(li, s, k, _ceil_div(need, cnt), loss, rank, max(0, (days[s] - base).days), lateness)
            k += 1
        s = (argmin + 1 if argmin + 1 > s else s + 1) if k >= n else k + 1
    return None


def _consume(state: LineState, cand: Candidate, job: Job, seq: int, days: list[date]) -> None:
    for k in range(cand.s, cand.e + 1):
        if state.owners[k] == 0 and job.row_eff is not None and state.theo[k] is not None:
            state.prac[k] = int(Decimal(state.theo[k]) * job.row_eff / HUNDRED)
        state.owners[k] += 1
        state.used[k] += cand.share
    state.used[cand.s] += cand.loss
    bisect.insort(state.timeline, (days[cand.e], days[cand.s], seq, job.style_id, job.family))


def _release(lines: list[LineState], job: Job) -> None:
    if job.reserved is None:
        return
    li, span, share = job.reserved
    state = lines[li]
    for k in span:
        state.used[k] = max(0, state.used[k] - share) if state.used[k] < BLOCKED else state.used[k]
        state.owners[k] = max(0, state.owners[k] - 1)
        if state.owners[k] == 0:
            state.prac[k] = state.base_prac[k]


def _reserve(lines: list[LineState], job: Job) -> None:
    if job.reserved is None:
        return
    li, span, share = job.reserved
    state = lines[li]
    for k in span:
        state.used[k] = min(BLOCKED, state.used[k] + share)
        state.owners[k] += 1


def _overtime_need(inputs: SchedulerInputs, state: LineState, job: Job, cand: Candidate) -> int | None:
    """Centi-minutes overtime would have to add before need-by to finish on time (None = cannot recover)."""
    if job.need_by is None or cand.lateness <= 0 or job.minutes_c is None:
        return None
    last = bisect.bisect_right(inputs.days, job.need_by) - 1
    if last < cand.s:
        return None
    avail = sum(_free(state, k, job) for k in range(cand.s, last + 1)) - cand.loss
    need = job.minutes_c - max(0, avail)
    if need <= 0:
        return None
    ot_cap = 0
    for k in range(cand.s, last + 1):
        if state.ops[k] and state.eff[k] is not None:
            ot_cap += int(Decimal(state.ops[k] * OT_MINUTES_PER_OPERATOR) * state.eff[k] / HUNDRED * CENTS)
    return need if need <= ot_cap else None


def _cents_str(c: int | None) -> str | None:
    return dec_str(Decimal(c) / CENTS) if c is not None else None


def _changeovers(entries_by_line: dict[int, list[tuple]], job_keys: set[Any]) -> int:
    """Count job entries whose previous entry on the same line (by end date) has another style."""
    total = 0
    for entries in entries_by_line.values():
        ordered = sorted(entries, key=lambda e: (e[0], e[1], str(e[2])))
        for pos, e in enumerate(ordered):
            if e[2] not in job_keys:
                continue
            prev = [p for p in ordered[:pos] if p[0] < e[1]]
            if prev and prev[-1][3] != e[3]:
                total += 1
    return total


def run_scheduler(inputs: SchedulerInputs) -> dict[str, Any]:
    """Deterministic greedy run; never mutates `inputs`."""
    lines = [ln.copy() for ln in inputs.lines]
    loss_pct = int(inputs.settings["changeover_loss_pct"])
    results: dict[str, dict[str, Any]] = {}
    items: list[dict[str, Any]] = []
    changed = 0
    seq = 10**6
    priority = 0
    final_pos: dict[str, tuple[int, date, date]] = {}
    for job in inputs.jobs:
        res: dict[str, Any] = {"status": job.status, "reasons": list(job.reasons), "cand": None, "alts": [],
                               "priority": None, "action": None, "ot": None, "tentative": []}
        results[job.job_id] = res
        if job.status is not None:
            if job.current is not None:
                final_pos[job.job_id] = job.current
            continue
        priority += 1
        res["priority"] = priority
        _release(lines, job)
        if changed >= MAX_ITEMS:
            _reserve(lines, job)
            res["status"], res["reasons"] = "UNSCHEDULED", res["reasons"] + ["REVISION_ITEM_LIMIT"]
            if job.current is not None:
                final_pos[job.job_id] = job.current
            continue
        cands = [c for li, ln in enumerate(lines) if (c := _place(inputs, ln, li, job, loss_pct)) is not None]
        if not cands:
            _reserve(lines, job)
            res["status"], res["reasons"] = "UNSCHEDULED", res["reasons"] + ["NO_CAPACITY_IN_HORIZON"]
            if job.current is not None:
                final_pos[job.job_id] = job.current
            continue
        cands.sort(key=lambda c: c.score(lines))
        best = cands[0]
        state = lines[best.line_index]
        res["cand"], res["alts"] = best, cands[1:3]
        reasons = res["reasons"]
        reasons.append("LATE" if best.lateness > 0 else "ON_TIME")
        if best.lateness > 0:
            reasons.append("SPLIT_NOT_EVALUATED")
            if best.s == 0:
                reasons.append("FROZEN_LIMITED")
            ot = _overtime_need(inputs, state, job, best)
            if ot is not None:
                res["ot"] = ot
                reasons.append("OVERTIME_WOULD_RECOVER")
        reasons.append({0: "SAME_STYLE", 1: "SAME_FAMILY", 2: "STYLE_CHANGE", 3: "NEW_FAMILY_FOR_LINE"}[best.rank])
        start, stop = inputs.days[best.s], inputs.days[best.e]
        res["tentative"] = sorted(b for (ts, te, b) in state.tentative if ts <= stop and te >= start)
        if res["tentative"]:
            reasons.append("TENTATIVE_DISPLACED")
        seq += 1
        _consume(state, best, job, seq, inputs.days)
        final_pos[job.job_id] = (state.line_id, start, stop)
        if job.kind == "ROW" and job.current == (state.line_id, start, stop):
            res["status"] = "UNCHANGED"
            reasons.append("UNCHANGED")
            continue
        res["status"] = "PLACED"
        changed += 1
        if job.kind == "ROW":
            res["action"] = "UPDATE"
            items.append({"job_id": job.job_id, "action": "UPDATE", "config_id": job.config_id, "line_id": state.line_id,
                          "order_id": None, "style_id": None, "start_date": start, "planned_end_date": stop,
                          "planned_qty": None, "reservation_status": None, "target_efficiency_pct": None})
        else:
            res["action"] = "CREATE"
            eff = state.eff[best.s]
            items.append({"job_id": job.job_id, "action": "CREATE", "config_id": None, "line_id": state.line_id,
                          "order_id": job.order_id, "style_id": job.style_id, "start_date": start,
                          "planned_end_date": stop, "planned_qty": dec_str(job.qty, 3), "reservation_status": "SOFT_BOOKED",
                          "target_efficiency_pct": dec_str(eff, 2) if eff is not None else None})
    return _payload(inputs, lines, results, items, final_pos)


def _kpis(inputs: SchedulerInputs, positions: dict[str, tuple[int, date, date]]) -> dict[str, Any]:
    jobs = {j.job_id: j for j in inputs.jobs}
    late = lateness = 0
    for job_id, (_line, _start, stop) in positions.items():
        need = jobs[job_id].need_by
        if need is not None and stop > need:
            late += 1
            lateness += (stop - need).days
    entries: dict[int, list[tuple]] = {}
    for ln in inputs.lines:
        entries[ln.line_id] = [(e[0], e[1], f"fixed:{e[2]}", e[3]) for e in ln.timeline]
    for job_id, (line, start, stop) in positions.items():
        entries.setdefault(line, []).append((stop, start, job_id, jobs[job_id].style_id))
    unscheduled = sum(1 for j in inputs.jobs if j.kind == "ORDER" and j.job_id not in positions)
    return {"late_jobs": late, "lateness_days": lateness, "changeovers": _changeovers(entries, set(positions)),
            "overtime_minutes": "0.00", "unscheduled_jobs": unscheduled}


def _score_out(c: Candidate, lines: list[LineState]) -> dict[str, Any]:
    return {"lateness_days": c.lateness, "changeover_rank": c.rank, "idle_gap_days": c.idle, "overtime_minutes": "0.00",
            "line_code": lines[c.line_index].line_code}


def _payload(inputs: SchedulerInputs, lines: list[LineState], results: dict[str, dict[str, Any]],
             items: list[dict[str, Any]], final_pos: dict[str, tuple[int, date, date]]) -> dict[str, Any]:
    days = inputs.days
    before_pos = {j.job_id: j.current for j in inputs.jobs if j.current is not None}
    jobs_out: list[dict[str, Any]] = []
    hash_jobs: list[dict[str, Any]] = []
    for job in inputs.jobs:
        res = results[job.job_id]
        cand: Candidate | None = res["cand"]
        placement = None
        alternatives = []
        if cand is not None:
            ln = lines[cand.line_index]
            placement = {"line_id": ln.line_id, "line_code": ln.line_code, "start_date": days[cand.s],
                         "end_date": days[cand.e], "working_days": cand.e - cand.s + 1, "lateness_days": cand.lateness,
                         "changeover_rank": cand.rank, "score": _score_out(cand, lines)}
            best = cand.score(lines)
            for alt in res["alts"]:
                a = alt.score(lines)
                crit = next((CRITERIA[i] for i in range(len(a)) if a[i] != best[i]), "LINE_ID")
                alternatives.append({"line_id": lines[alt.line_index].line_id, "line_code": lines[alt.line_index].line_code,
                                     "start_date": days[alt.s], "end_date": days[alt.e], "score": _score_out(alt, lines),
                                     "deciding_criterion": crit})
        reasons = list(dict.fromkeys(res["reasons"]))
        pos = final_pos.get(job.job_id)
        hash_jobs.append({"id": job.job_id, "action": res["action"], "line_id": pos[0] if pos else None,
                          "start": pos[1].isoformat() if pos else None, "end": pos[2].isoformat() if pos else None,
                          "qty": dec_str(job.qty, 3), "status": res["status"], "reasons": reasons})
        if len(jobs_out) < MAX_JOBS_OUT:
            jobs_out.append({
                "job_id": job.job_id, "kind": job.kind, "order_id": job.order_id, "order_code": job.order_code,
                "config_id": job.config_id, "style_id": job.style_id, "family": job.family, "qty": dec_str(job.qty, 3),
                "smv_per_piece": dec_str(job.smv, 4),
                "minutes": _cents_str(job.minutes_c),
                "need_by": job.need_by, "earliest_start": job.earliest, "priority_rank": res["priority"],
                "status": res["status"], "action": res["action"],
                "current": {"line_id": job.current[0], "start_date": job.current[1], "end_date": job.current[2]}
                if job.current else None,
                "placement": placement, "alternatives": alternatives, "tentative_displaced": res["tentative"],
                "overtime_would_recover_minutes": _cents_str(res["ot"]), "reason_codes": reasons,
            })
    params_out = inputs.params.out()
    canonical = {
        "engine_version": ENGINE_VERSION, "params": params_out, "today": inputs.today.isoformat(),
        "frozen_end": inputs.frozen_end.isoformat(), "settings": inputs.settings, "jobs": hash_jobs,
    }
    digest = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    counts = dict(inputs.counts)
    counts.update({
        "items": len(items),
        "placed": sum(1 for r in results.values() if r["status"] == "PLACED"),
        "unchanged": sum(1 for r in results.values() if r["status"] == "UNCHANGED"),
        "unscheduled": sum(1 for r in results.values() if r["status"] == "UNSCHEDULED"),
        "revision_item_limit": sum(1 for r in results.values() if "REVISION_ITEM_LIMIT" in r["reasons"]),
        "jobs_shown": len(jobs_out),
    })
    reason_codes = ["PROPOSAL_ONLY"]
    if inputs.firm_late:
        reason_codes.append("FIRM_RESCHEDULE_SUGGESTED")
    if counts["job_limit"]:
        reason_codes.append("JOB_LIMIT")
    if counts["revision_item_limit"]:
        reason_codes.append("REVISION_ITEM_LIMIT")
    return {
        "engine_version": ENGINE_VERSION,
        "as_of": inputs.today,
        "date_from": inputs.today,
        "date_to": inputs.end,
        "horizon_days": inputs.params.horizon_days,
        "frozen_end": inputs.frozen_end,
        "factory_unit": inputs.params.factory_unit,
        "parameters": params_out,
        "settings": dict(inputs.settings),
        "lines": [{"line_id": ln.line_id, "line_code": ln.line_code, "name": ln.name, "factory_unit": ln.factory_unit}
                  for ln in inputs.lines],
        "jobs": jobs_out,
        "items": items,
        "kpis": {"before": _kpis(inputs, before_pos), "after": _kpis(inputs, final_pos)},
        "firm_reschedule_suggested": list(inputs.firm_late),
        "counts": counts,
        "proposal_hash": digest,
        "proposal_only": True,
        "reason_codes": reason_codes,
        "notices": list(inputs.notices),
        "assumptions": list(ASSUMPTIONS),
    }
