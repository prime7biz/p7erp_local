"""Line loading: how many SMV minutes each live line plan row puts on each working day (read-only).

Rules (doc 04, section 4):
- rows: `sewing_line_style_configs` that are not CANCELLED / COMPLETED and overlap the requested window
- remaining_qty = max(0, planned_qty - completed_qty); load_minutes = remaining_qty x SMV per piece
- the load is spread evenly over the WORKING days from start_date to planned_end_date (inclusive;
  a missing planned_end_date means start_date); if there is no working day it goes on the first working day
  on or after start_date with reason NO_WORKING_DAY_IN_WINDOW
- classes: FIRM = FIRM_BOOKED / IN_PROGRESS, SOFT = SOFT_BOOKED, DRAFT = DRAFT. Soft and draft load never
  reduce firm availability. "Confirmed firm" = firm rows whose order is confirmed demand.
- rows with unknown SMV are listed in `unresolved_rows` and add nothing to the totals
"""
from __future__ import annotations

from bisect import bisect_left, bisect_right
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any, Iterable

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, SewingLineStyleConfig
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext, load_calendar
from app.modules.mfg_intelligence.confirmed_demand import is_confirmed_status
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.scenario import Scenario, apply_to_rows
from app.modules.mfg_intelligence.smv_resolver import SmvResult, resolve_smv_for_rows

FIRM_STATUSES = ("FIRM_BOOKED", "IN_PROGRESS")
SOFT_STATUSES = ("SOFT_BOOKED",)
DRAFT_STATUSES = ("DRAFT",)
EXCLUDED_STATUSES = ("CANCELLED", "COMPLETED")

CLASS_FIRM = "FIRM"
CLASS_SOFT = "SOFT"
CLASS_DRAFT = "DRAFT"

MAX_PLAN_ROWS = 5000
MAX_SPAN_DAYS = 1100
_FALLBACK_HORIZON_DAYS = 60


def demand_class(reservation_status: str | None) -> str | None:
    rs = (reservation_status or "").strip().upper()
    if rs in FIRM_STATUSES:
        return CLASS_FIRM
    if rs in SOFT_STATUSES:
        return CLASS_SOFT
    if rs in DRAFT_STATUSES:
        return CLASS_DRAFT
    return None


def row_end_date(cfg: Any) -> date:
    end = cfg.planned_end_date or cfg.start_date
    return end if end >= cfg.start_date else cfg.start_date


@dataclass
class DayLoad:
    firm: Decimal = ZERO
    soft: Decimal = ZERO
    draft: Decimal = ZERO
    firm_confirmed: Decimal = ZERO
    firm_unconfirmed: Decimal = ZERO
    unresolved_firm: int = 0  # firm rows on this line-day whose SMV is unknown (their load is NOT in `firm`)
    unresolved_soft: int = 0


@dataclass
class LoadedRow:
    cfg: Any
    demand_class: str | None
    order_code: str | None
    order_confirmed: bool | None
    smv: SmvResult
    remaining_qty: Decimal
    load_minutes: Decimal | None
    allocation: dict[date, Decimal] = field(default_factory=dict)  # only days inside the requested window
    reason_codes: list[str] = field(default_factory=list)
    in_window: bool = True  # False for look-back rows that put nothing inside the window


@dataclass
class LoadingResult:
    rows: list[LoadedRow]
    unresolved: list[LoadedRow]
    per_line_day: dict[tuple[int, date], DayLoad]
    calendar: CalendarContext
    truncated: bool


async def fetch_live_plan_rows(
    db: AsyncSession,
    tenant_id: int,
    *,
    window_start: date,
    window_end: date,
    line_ids: Iterable[int] | None = None,
    order_ids: Iterable[int] | None = None,
    lookback_days: int = _FALLBACK_HORIZON_DAYS,
    scenario: Scenario | None = None,
) -> tuple[list[SewingLineStyleConfig], bool]:
    """Live (not CANCELLED / COMPLETED) plan rows overlapping the window, bounded to MAX_PLAN_ROWS.

    Rows that ended up to `lookback_days` before the window are fetched too: a row with no working day in its
    own span moves its load to the first working day after it, which can fall inside the window.
    """
    cfg = SewingLineStyleConfig
    stmt = select(cfg).where(
        cfg.tenant_id == tenant_id,
        func.upper(func.trim(cfg.reservation_status)).notin_(EXCLUDED_STATUSES),
        cfg.start_date <= window_end,
        func.coalesce(cfg.planned_end_date, cfg.start_date) >= window_start - timedelta(days=lookback_days),
    )
    if line_ids is not None:
        ids = list(line_ids)
        if not ids:
            return [], False
        stmt = stmt.where(cfg.line_id.in_(ids))
    if order_ids is not None:
        oids = list(order_ids)
        if not oids:
            return [], False
        stmt = stmt.where(cfg.order_id.in_(oids))
    stmt = stmt.order_by(cfg.start_date, cfg.id).limit(MAX_PLAN_ROWS + 1)
    rows = list((await db.execute(stmt)).scalars().all())
    truncated = len(rows) > MAX_PLAN_ROWS
    rows = rows[:MAX_PLAN_ROWS]
    if scenario is not None and not scenario.is_empty():
        rows = apply_to_rows(
            rows,
            scenario,
            window_start=window_start - timedelta(days=lookback_days),
            window_end=window_end,
            line_ids=set(line_ids) if line_ids is not None else None,
            order_ids=set(order_ids) if order_ids is not None else None,
        )
    return rows, truncated


async def fetch_order_plan_rows(
    db: AsyncSession,
    tenant_id: int,
    order_ids: Iterable[int],
    *,
    include_completed: bool = False,
    scenario: Scenario | None = None,
) -> list[SewingLineStyleConfig]:
    """Plan rows of the given orders at any date (CANCELLED never; COMPLETED only when asked), bounded."""
    ids = list(order_ids)
    if not ids:
        return []
    cfg = SewingLineStyleConfig
    excluded = EXCLUDED_STATUSES if not include_completed else ("CANCELLED",)
    stmt = (
        select(cfg)
        .where(
            cfg.tenant_id == tenant_id,
            cfg.order_id.in_(ids),
            func.upper(func.trim(cfg.reservation_status)).notin_(excluded),
        )
        .order_by(cfg.start_date, cfg.id)
        .limit(MAX_PLAN_ROWS)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    if scenario is not None and not scenario.is_empty():
        rows = apply_to_rows(
            rows, scenario, order_ids=set(ids), include_completed=include_completed, live_only=False
        )
    return rows


def _spread(minutes: Decimal, days: list[date]) -> dict[date, Decimal]:
    """Even split in 4 decimals; the last day takes the rounding remainder so the sum is exact."""
    n = len(days)
    if n == 0:
        return {}
    share = quant(minutes / Decimal(n), 4)
    out = {d: share for d in days}
    out[days[-1]] = minutes - share * Decimal(n - 1)
    return out


async def build_line_loading(
    db: AsyncSession,
    tenant_id: int,
    *,
    window_start: date,
    window_end: date,
    line_ids: Iterable[int] | None = None,
    plan_rows: list[SewingLineStyleConfig] | None = None,
    truncated: bool = False,
    scenario: Scenario | None = None,
    tentative_rows: list[Any] | None = None,
    style_standard_smv: bool = False,
) -> LoadingResult:
    """`tentative_rows` (only passed when mfg_integrated_planning_v1 is on) load as SOFT, never FIRM.

    `style_standard_smv` (only True when mfg_integrated_planning_v1 is on) lets the SMV resolver use the approved
    style standard SMV.
    """
    if plan_rows is None:
        plan_rows, truncated = await fetch_live_plan_rows(
            db, tenant_id, window_start=window_start, window_end=window_end, line_ids=line_ids, scenario=scenario
        )
    plan_rows = list(plan_rows) + list(tentative_rows or [])

    # Calendar must cover every row's span (the spread uses the whole row, not just the window).
    lo, hi = window_start, window_end
    for r in plan_rows:
        lo = min(lo, r.start_date)
        hi = max(hi, min(row_end_date(r), r.start_date + timedelta(days=MAX_SPAN_DAYS)))
    calendar = await load_calendar(db, tenant_id, lo, hi + timedelta(days=_FALLBACK_HORIZON_DAYS))
    working = calendar.working_days(lo, hi)

    smv_by_row = await resolve_smv_for_rows(db, tenant_id, plan_rows, use_style_standard=style_standard_smv)

    order_ids = {int(r.order_id) for r in plan_rows if r.order_id}
    orders: dict[int, tuple[str, str]] = {}
    if order_ids:
        for oid, code, status in (
            await db.execute(
                select(Order.id, Order.order_code, Order.status).where(
                    Order.tenant_id == tenant_id, Order.id.in_(order_ids)
                )
            )
        ).all():
            orders[int(oid)] = (code, status)

    rows: list[LoadedRow] = []
    unresolved: list[LoadedRow] = []
    per_line_day: dict[tuple[int, date], DayLoad] = {}

    for cfg in plan_rows:
        klass = demand_class(cfg.reservation_status)
        order_info = orders.get(int(cfg.order_id)) if cfg.order_id else None
        order_confirmed = is_confirmed_status(order_info[1]) if order_info else None
        smv = smv_by_row[cfg.id]
        planned = to_dec(cfg.planned_qty) or ZERO
        done = to_dec(cfg.completed_qty) or ZERO
        remaining = max(ZERO, planned - done)
        item = LoadedRow(
            cfg=cfg,
            demand_class=klass,
            order_code=order_info[0] if order_info else None,
            order_confirmed=order_confirmed,
            smv=smv,
            remaining_qty=remaining,
            load_minutes=None,
            reason_codes=list(smv.reason_codes),
        )
        item.in_window = cfg.start_date <= window_end and row_end_date(cfg) >= window_start
        if klass is None:
            item.reason_codes.append("RESERVATION_STATUS_NOT_CLASSIFIED")
            unresolved.append(item)
            rows.append(item)
            continue

        start = cfg.start_date
        end = row_end_date(cfg)
        if end > start + timedelta(days=MAX_SPAN_DAYS):
            end = start + timedelta(days=MAX_SPAN_DAYS)
            item.reason_codes.append("PLAN_SPAN_TRUNCATED")
        span_days = working[bisect_left(working, start) : bisect_right(working, end)]
        if not span_days:
            first = calendar.first_working_on_or_after(start, _FALLBACK_HORIZON_DAYS)
            if first is None:
                item.reason_codes.append("NO_WORKING_DAY_FOUND")
                unresolved.append(item)
                rows.append(item)
                continue
            span_days = [first]
            item.reason_codes.append("NO_WORKING_DAY_IN_WINDOW")

        if smv.value is None:
            # Unknown SMV: no minutes, but the day must not look idle -> count the row on each day it would load.
            unresolved.append(item)
            rows.append(item)
            if remaining > ZERO and klass in (CLASS_FIRM, CLASS_SOFT):
                for day in span_days:
                    if day < window_start or day > window_end:
                        continue
                    item.in_window = True
                    slot = per_line_day.setdefault((cfg.line_id, day), DayLoad())
                    if klass == CLASS_FIRM:
                        slot.unresolved_firm += 1
                    else:
                        slot.unresolved_soft += 1
            continue

        item.load_minutes = quant(remaining * smv.value, 4)
        for day, minutes in _spread(item.load_minutes, span_days).items():
            if day < window_start or day > window_end:
                continue
            item.in_window = True
            item.allocation[day] = minutes
            slot = per_line_day.setdefault((cfg.line_id, day), DayLoad())
            if klass == CLASS_FIRM:
                slot.firm += minutes
                if order_confirmed:
                    slot.firm_confirmed += minutes
                else:
                    slot.firm_unconfirmed += minutes
            elif klass == CLASS_SOFT:
                slot.soft += minutes
            else:
                slot.draft += minutes
        rows.append(item)

    return LoadingResult(
        rows=rows, unresolved=unresolved, per_line_day=per_line_day, calendar=calendar, truncated=truncated
    )


async def line_loading_payload(
    db: AsyncSession,
    tenant_id: int,
    *,
    window_start: date,
    window_end: date,
    factory_unit: str | None = None,
    line_id: int | None = None,
    scenario: Scenario | None = None,
    include_tentative: bool = False,
    style_standard_smv: bool = False,
) -> dict[str, Any]:
    """Response of GET /line-loading: rows, unresolved rows and per line-day class totals.

    `include_tentative` (callers pass it only when mfg_integrated_planning_v1 is on) adds tentative inquiry /
    quotation demand to the SOFT line-day totals. Tentative rows are never listed in `rows` (see /tentative-demand).
    `style_standard_smv` (same flag) adds the approved style standard SMV to the SMV hierarchy.
    """
    from app.modules.mfg_intelligence.capacity_service import MAX_LINES, fetch_active_lines  # avoid import cycle

    lines = await fetch_active_lines(db, tenant_id, factory_unit=factory_unit, line_id=line_id)
    line_by_id = {ln.id: ln for ln in lines}
    tentative_rows = None
    if include_tentative:
        from app.modules.mfg_intelligence.tentative_demand_service import fetch_tentative_rows

        tentative_rows = await fetch_tentative_rows(
            db, tenant_id, window_start=window_start, window_end=window_end, line_ids=list(line_by_id)
        )
    result = await build_line_loading(
        db,
        tenant_id,
        window_start=window_start,
        window_end=window_end,
        line_ids=list(line_by_id),
        scenario=scenario,
        tentative_rows=tentative_rows,
        style_standard_smv=style_standard_smv,
    )
    result.rows = [i for i in result.rows if not getattr(i.cfg, "is_tentative", False)]
    result.unresolved = [i for i in result.unresolved if not getattr(i.cfg, "is_tentative", False)]
    notices: list[str] = []
    if result.truncated:
        notices.append("PLAN_ROWS_TRUNCATED: only the first 5000 plan rows are returned")
    if len(lines) >= MAX_LINES:
        notices.append(f"LINES_TRUNCATED: only the first {MAX_LINES} active lines are shown")
    unresolved_ids = {id(i) for i in result.unresolved}
    line_days = []
    for (lid, day), load in sorted(result.per_line_day.items(), key=lambda kv: (line_by_id[kv[0][0]].line_code, kv[0][1])):
        if load.firm == ZERO and load.soft == ZERO and load.draft == ZERO:
            continue  # only unresolved rows land here (their counts show in /capacity)
        line_days.append(
            {
                "line_id": lid,
                "line_code": line_by_id[lid].line_code,
                "date": day,
                "is_working_day": result.calendar.is_working(day),
                "firm_smv_minutes": dec_str(load.firm),
                "firm_confirmed_smv_minutes": dec_str(load.firm_confirmed),
                "firm_unconfirmed_smv_minutes": dec_str(load.firm_unconfirmed),
                "soft_smv_minutes": dec_str(load.soft),
                "draft_smv_minutes": dec_str(load.draft),
            }
        )
    return {
        "date_from": window_start,
        "date_to": window_end,
        "rows": [loading_row_payload(i) for i in result.rows if id(i) not in unresolved_ids and i.in_window],
        "unresolved_rows": [unresolved_payload(i) for i in result.unresolved if i.in_window],
        "line_days": line_days,
        "truncated": result.truncated,
        "notices": notices,
    }


def loading_row_payload(item: LoadedRow) -> dict[str, Any]:
    cfg = item.cfg
    return {
        "config_id": cfg.id,
        "line_id": cfg.line_id,
        "order_id": cfg.order_id,
        "order_code": item.order_code,
        "order_confirmed": item.order_confirmed,
        "style_id": cfg.style_id,
        "reservation_status": (cfg.reservation_status or "").strip().upper(),
        "demand_class": item.demand_class,
        "start_date": cfg.start_date,
        "planned_end_date": cfg.planned_end_date,
        "planned_qty": dec_str(to_dec(cfg.planned_qty), 3),
        "completed_qty": dec_str(to_dec(cfg.completed_qty), 3),
        "remaining_qty": dec_str(item.remaining_qty, 3),
        "smv_per_piece": dec_str(item.smv.value, 4),
        "smv_source": item.smv.source,
        "smv_confidence": item.smv.confidence,
        "total_load_minutes": dec_str(item.load_minutes, 2),
        "daily_allocation": [
            {"date": d, "smv_minutes": dec_str(m, 2)} for d, m in sorted(item.allocation.items())
        ],
        "reason_codes": item.reason_codes,
    }


def unresolved_payload(item: LoadedRow) -> dict[str, Any]:
    return {
        "config_id": item.cfg.id,
        "line_id": item.cfg.line_id,
        "order_id": item.cfg.order_id,
        "reservation_status": (item.cfg.reservation_status or "").strip().upper(),
        "remaining_qty": dec_str(item.remaining_qty, 3),
        "reason_codes": item.reason_codes or ["SMV_UNKNOWN"],
        "missing_inputs": ["smv"] if item.smv.value is None else [],
    }
