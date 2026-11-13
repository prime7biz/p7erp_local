"""Corrected capacity per sewing line per day (read-only). Formula version `mi-capacity-1`.

    operator_minutes     = sum over shifts h of (net shift minutes M_h x operators O_h)   (operators PER SHIFT)
    theoretical_minutes  = operator_minutes
    practical_smv_minutes = operator_minutes x efficiency% / 100                          (de-rated once)
    practical_units      = practical_smv_minutes / SMV  (only when the day has exactly one resolvable SMV)

Shift and operator rules (decided PER DAY, never from the requested window):
- Shifts come from the live plan rows active on that day (a row with a known `shift_id` names its shift; its
  `operator_count` is that shift's operators, else the line default). Two named shifts are separate operator pools.
- When no row names a shift that day (no active row, or rows without a shift) every active shift applies as ONE
  shared operator pool: overlapping clock intervals are merged (midnight crossing handled) and counted once;
  breaks are subtracted once per merged group (the longest break of the group). Reason SHIFTS_OVERLAP_MERGED.
- Machines never multiply operators. L (learning curve) = C (changeover) = 1 in Phase 1.
Missing shift / shift times / operators / efficiency -> UNKNOWN with `missing_inputs` (never a guess, never 480).
A firm row with unknown SMV leaves the day UNKNOWN (reason UNRESOLVED_FIRM_LOAD) unless the known firm load
already exceeds practical capacity (OVERLOADED); its firm_available is then unknown.
Closed days (weekend or holiday override) -> 0 with reason CLOSED_DAY.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from functools import lru_cache
from types import SimpleNamespace
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ProductionShift, SewingLine, SewingLineStyleConfig
from app.modules.mfg_intelligence.assignment_capacity import AssignmentStaffing, DayStaff, load_assignment_staffing
from app.modules.mfg_intelligence.calendar_helpers import (
    CalendarContext,
    load_active_shifts,
    shift_net_minutes,
)
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.legacy_comparison import LEGACY_BASIS, build_legacy_context, legacy_line_capacity
from app.modules.mfg_intelligence.line_loading_service import (
    CLASS_DRAFT,
    CLASS_FIRM,
    CLASS_SOFT,
    DayLoad,
    LoadingResult,
    build_line_loading,
    demand_class,
    fetch_live_plan_rows,
    row_end_date,
)

FORMULA_VERSION = "mi-capacity-1"
MAX_LINES = 500
MAX_HISTORY_ROWS = 5000
HUNDRED = Decimal("100")

STATUS_OVERLOADED = "OVERLOADED"
STATUS_IDLE = "IDLE"
STATUS_LOADED = "LOADED"
STATUS_CLOSED = "CLOSED"
STATUS_UNKNOWN = "UNKNOWN"

_CLASS_PRIORITY = {CLASS_FIRM: 0, CLASS_SOFT: 1, CLASS_DRAFT: 2}

PHASE1_ASSUMPTIONS = [
    "Operators are counted per shift; overlapping shifts that share one operator pool are merged and counted once "
    "(longest break of the merged group subtracted once). Machines never multiply operators.",
    "Learning-curve factor L = 1 and changeover factor C = 1 in Phase 1.",
    "Attendance factor A = 1 (forward absence is not applied in Phase 1).",
    "Machine constraint is not evaluated in Phase 1 (MACHINE_PROFILE_NOT_EVALUATED).",
    "Units are shown only when a day has exactly one resolvable SMV per piece.",
    "A firm plan row with unknown SMV makes that day UNKNOWN (never idle); it is listed as UNRESOLVED_FIRM_LOAD.",
]
ASSIGNMENT_ASSUMPTION = (
    "Integrated planning: on a line-day with OPERATOR line assignments the operators are the assigned employees "
    "(today: only those marked PRESENT, LATE or HALF_DAY once attendance is recorded); assigned machines are shown "
    "as a separate constraint and never change the operator minutes."
)


@dataclass
class DayCap:
    day: date
    is_working_day: bool
    theoretical_minutes: Decimal | None
    practical_minutes: Decimal | None
    load: DayLoad
    status: str
    reason_codes: list[str] = field(default_factory=list)
    missing_inputs: list[str] = field(default_factory=list)
    operators: int | None = None
    efficiency_pct: Decimal | None = None
    smv_per_piece: Decimal | None = None
    theoretical_units: Decimal | None = None
    practical_units: Decimal | None = None
    # Phase 2 (mfg_integrated_planning_v1 only): counts from dated line assignments; None = not used.
    assigned_operators: int | None = None
    assigned_machines: int | None = None

    @property
    def load_complete(self) -> bool:
        """False when a firm row with unknown SMV also lands on this day (its minutes are not in `load.firm`)."""
        return self.load.unresolved_firm == 0

    @property
    def firm_available(self) -> Decimal | None:
        if self.practical_minutes is None or not self.load_complete:
            return None
        return self.practical_minutes - self.load.firm

    @property
    def utilization_pct(self) -> Decimal | None:
        if self.practical_minutes is None or self.practical_minutes <= ZERO or not self.load_complete:
            return None
        return quant(self.load.firm / self.practical_minutes * HUNDRED, 2)


@dataclass
class LineCap:
    line: Any
    days: list[DayCap]
    reason_codes: list[str]
    legacy_value: Decimal


@dataclass
class CapacityResult:
    window_start: date
    window_end: date
    lines: list[LineCap]
    loading: LoadingResult
    notices: list[str]
    legacy_average_shift_minutes: Decimal
    legacy_working_days: int
    assumptions_extra: list[str] = field(default_factory=list)


def _active_rows_on(rows: list[Any], day: date) -> list[Any]:
    return [r for r in rows if r.start_date <= day <= row_end_date(r)]


def _row_sort_key(r: Any) -> tuple[int, int]:
    return (_CLASS_PRIORITY.get(demand_class(r.reservation_status) or "", 9), r.id)


# --------------------------------------------------------------------------- shifts and operators


def _interval(shift: ProductionShift) -> tuple[int, int] | None:
    """Clock interval in minutes; an end at or before the start means the shift crosses midnight."""
    if shift.start_time is None or shift.end_time is None:
        return None
    a = shift.start_time.hour * 60 + shift.start_time.minute
    b = shift.end_time.hour * 60 + shift.end_time.minute
    if b <= a:
        b += 1440
    return a, b


def _covered(interval: tuple[int, int]) -> set[int]:
    return {m % 1440 for m in range(interval[0], interval[1])}


def pool_minutes(shifts: list[ProductionShift]) -> tuple[Decimal | None, list[str]]:
    """Minutes one shared operator pool works across `shifts`, with overlaps merged.

    Shifts whose clock intervals overlap (also across midnight) form a group: its minutes are the union of the
    intervals minus the LONGEST break in the group (each break counted once). Returns (None, reasons) when no
    shift has usable times.

    The result depends only on the shifts' times and breaks, so it is memoised per distinct shift set
    (`_pool_minutes_cached`); a capacity call over many lines and days computes each set once.
    """
    key = tuple(sorted(((s.start_time, s.end_time, int(s.break_minutes or 0)) for s in shifts), key=repr))
    minutes, reasons = _pool_minutes_cached(key)
    return minutes, list(reasons)


@lru_cache(maxsize=1024)
def _pool_minutes_cached(key: tuple[tuple[Any, Any, int], ...]) -> tuple[Decimal | None, tuple[str, ...]]:
    shifts = [SimpleNamespace(start_time=a, end_time=b, break_minutes=c) for a, b, c in key]
    minutes, reasons = _pool_minutes_uncached(shifts)
    return minutes, tuple(reasons)


def _pool_minutes_uncached(shifts: list[Any]) -> tuple[Decimal | None, list[str]]:
    reasons: list[str] = []
    valid: list[tuple[Any, set[int]]] = []
    for s in shifts:
        interval = _interval(s)
        if interval is None or shift_net_minutes(s) is None:
            if "SHIFT_TIMES_MISSING" not in reasons:
                reasons.append("SHIFT_TIMES_MISSING")
            continue
        valid.append((s, _covered(interval)))
    if not valid:
        return None, reasons

    parent = list(range(len(valid)))

    def find(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(valid)):
        for j in range(i + 1, len(valid)):
            if valid[i][1] & valid[j][1]:
                parent[find(i)] = find(j)
    groups: dict[int, list[int]] = {}
    for i in range(len(valid)):
        groups.setdefault(find(i), []).append(i)

    total = 0
    merged = False
    for members in groups.values():
        cover: set[int] = set()
        longest_break = 0
        for i in members:
            cover |= valid[i][1]
            longest_break = max(longest_break, int(valid[i][0].break_minutes or 0))
        if len(members) > 1:
            merged = True
        total += max(0, len(cover) - longest_break)
    if merged:
        reasons.append("SHIFTS_OVERLAP_MERGED")
    return Decimal(total), reasons


@dataclass
class DayShiftPlan:
    operator_minutes: Decimal | None
    operators: int | None
    reasons: list[str]
    missing: list[str]


def _operators_for(row: Any | None, line: Any) -> tuple[int | None, str | None]:
    if row is not None and int(row.operator_count or 0) > 0:
        return int(row.operator_count), "OPERATORS_FROM_PLAN_ROW"
    if int(line.default_operator_count or 0) > 0:
        return int(line.default_operator_count), "OPERATORS_FROM_LINE_DEFAULT"
    return None, None


def resolve_day_shifts(
    line: Any, active_rows: list[Any], shifts_by_id: dict[int, ProductionShift]
) -> DayShiftPlan:
    """Operator minutes of one line on one day (pure). `active_rows` is already in priority order."""
    reasons: list[str] = []

    def add(code: str | None) -> None:
        if code and code not in reasons:
            reasons.append(code)

    by_shift: dict[int, Any] = {}
    for r in active_rows:
        if r.shift_id and int(r.shift_id) in shifts_by_id:
            by_shift.setdefault(int(r.shift_id), r)

    if by_shift:
        total = ZERO
        total_ops = 0
        usable = 0
        ops_missing = False
        times_missing = False
        default_ops = int(line.default_operator_count or 0)
        default_pool: list[ProductionShift] = []  # shifts whose operators come from the line default
        for sid in sorted(by_shift):
            row = by_shift[sid]
            if int(row.operator_count or 0) > 0:
                # Explicit operator count on the plan row: this shift is its own operator pool.
                minutes, shift_reasons = pool_minutes([shifts_by_id[sid]])
                for code in shift_reasons:
                    add(code)
                if minutes is None:
                    times_missing = True
                    continue
                add("OPERATORS_FROM_PLAN_ROW")
                total += minutes * Decimal(int(row.operator_count))
                total_ops += int(row.operator_count)
                usable += 1
            elif default_ops > 0:
                default_pool.append(shifts_by_id[sid])
            else:
                add("SHIFT_OPERATORS_MISSING")
                ops_missing = True
        if default_pool:
            # One shared pool of default operators: overlapping shifts are merged, not double counted.
            minutes, shift_reasons = pool_minutes(default_pool)
            for code in shift_reasons:
                add(code)
            if minutes is None:
                times_missing = True
            else:
                add("OPERATORS_FROM_LINE_DEFAULT")
                total += minutes * Decimal(default_ops)
                total_ops += default_ops
                usable += 1
        missing: list[str] = []
        if times_missing and not usable:
            missing.append("shift_times")
        if ops_missing and not usable:
            missing.append("operators")
        if usable:
            return DayShiftPlan(total, total_ops, reasons, missing)
        return DayShiftPlan(None, None, reasons, missing)

    # No row names a shift today: every active shift, one shared operator pool.
    missing = []
    minutes: Decimal | None = None
    if not shifts_by_id:
        missing.append("shift")
    else:
        add("SHIFT_ASSUMED_ALL_ACTIVE")
        minutes, shift_reasons = pool_minutes(list(shifts_by_id.values()))
        for code in shift_reasons:
            add(code)
        if minutes is None:
            missing.append("shift_times")
    chosen = active_rows[0] if active_rows else None
    ops, code = _operators_for(chosen, line)
    if ops is None:
        missing.append("operators")
    else:
        add(code)
    if missing:
        return DayShiftPlan(None, ops, reasons, missing)
    assert minutes is not None
    return DayShiftPlan(minutes * Decimal(ops), ops, reasons, [])


def resolve_day_shifts_from_assignments(
    active_rows: list[Any], shifts_by_id: dict[int, ProductionShift], staff: DayStaff
) -> DayShiftPlan:
    """Operator minutes from dated OPERATOR assignments (Phase 2, mfg_integrated_planning_v1 only; pure).

    Operators assigned to a shift work that shift (its own pool). Operators assigned without a shift work the
    day's shifts exactly as Phase 1 decides them (shifts named by the active plan rows, else every active shift as
    one merged pool). Plan-row operator counts and the line default are not used for this line-day.
    """
    reasons: list[str] = ["OPERATORS_FROM_ASSIGNMENTS"]

    def add(code: str | None) -> None:
        if code and code not in reasons:
            reasons.append(code)

    if staff.attendance_used:
        add("OPERATORS_FROM_ATTENDANCE_TODAY")
    elif staff.attendance_missing:
        add("ATTENDANCE_NOT_RECORDED")
    total = ZERO
    total_ops = 0
    usable = False
    missing: list[str] = []
    for sid in sorted(k for k in staff.operators_by_shift if k is not None):
        count = staff.operators_by_shift[sid]
        shift = shifts_by_id.get(sid)
        if shift is None:
            add("ASSIGNED_SHIFT_NOT_ACTIVE")
            continue
        minutes, shift_reasons = pool_minutes([shift])
        for code in shift_reasons:
            add(code)
        if minutes is None:
            continue
        total += minutes * Decimal(count)
        total_ops += count
        usable = True
    pool_count = staff.operators_by_shift.get(None, 0)
    if pool_count:
        named = sorted({int(r.shift_id) for r in active_rows if r.shift_id and int(r.shift_id) in shifts_by_id})
        day_shifts = [shifts_by_id[s] for s in named] if named else list(shifts_by_id.values())
        if not named and day_shifts:
            add("SHIFT_ASSUMED_ALL_ACTIVE")
        if not day_shifts:
            missing.append("shift")
        else:
            minutes, shift_reasons = pool_minutes(day_shifts)
            for code in shift_reasons:
                add(code)
            if minutes is None:
                missing.append("shift_times")
            else:
                total += minutes * Decimal(pool_count)
                total_ops += pool_count
                usable = True
    if usable:
        return DayShiftPlan(total, total_ops, reasons, [])
    if staff.operators == 0:
        add("NO_OPERATORS_PRESENT")
        return DayShiftPlan(ZERO, 0, reasons, [])
    return DayShiftPlan(None, None, reasons, missing or ["shift_times"])


def compute_day_capacity(
    *,
    day: date,
    calendar: CalendarContext,
    line: Any,
    shifts_by_id: dict[int, ProductionShift],
    line_rows: list[Any],
    history_rows: list[Any],
    smv_by_row: dict[int, Decimal | None],
    load: DayLoad,
    staff: DayStaff | None = None,
) -> DayCap:
    """Pure calculation for one line on one day (no database access).

    `line_rows` are the live plan rows of the line (those active on `day` are used); `history_rows` are the
    non-draft, non-cancelled rows sorted by start date, used only for the efficiency fallback.
    `staff` (only passed when mfg_integrated_planning_v1 is on and the line-day has assignments): operators come
    from OPERATOR assignments, machines are reported as a separate constraint. None = exact Phase 1 behaviour.
    """
    if not calendar.is_working(day):
        return DayCap(
            day=day,
            is_working_day=False,
            theoretical_minutes=ZERO,
            practical_minutes=ZERO,
            load=load,
            status=STATUS_CLOSED,
            reason_codes=["CLOSED_DAY"],
        )

    active = sorted(_active_rows_on(line_rows, day), key=_row_sort_key)
    chosen = active[0] if active else None

    assigned_ops: int | None = None
    assigned_machines: int | None = None
    if staff is not None and staff.operators_by_shift:
        plan = resolve_day_shifts_from_assignments(active, shifts_by_id, staff)
        assigned_ops = staff.operators
    else:
        plan = resolve_day_shifts(line, active, shifts_by_id)
    reasons = list(plan.reasons)
    missing = list(plan.missing)
    operators = plan.operators
    if staff is not None and staff.machines:
        # A separate constraint: machines never multiply or replace operators.
        assigned_machines = staff.machines
        reasons.append("MACHINES_FROM_ASSIGNMENTS")
        if operators is not None and staff.machines < operators:
            reasons.append("MACHINES_FEWER_THAN_OPERATORS")

    efficiency: Decimal | None = None
    chosen_eff = to_dec(chosen.target_efficiency_pct) if chosen is not None else None
    if chosen_eff is not None and chosen_eff > ZERO:
        efficiency = chosen_eff
    else:
        for h in reversed([h for h in history_rows if h.start_date <= day]):
            h_eff = to_dec(h.target_efficiency_pct)
            if h_eff is not None and h_eff > ZERO:
                efficiency = h_eff
                reasons.append("EFFICIENCY_FROM_LATEST_PLAN")
                break
        if efficiency is None:
            missing.append("efficiency")

    if load.unresolved_firm:
        reasons.append("UNRESOLVED_FIRM_LOAD")
    if load.unresolved_soft:
        reasons.append("UNRESOLVED_SOFT_LOAD")

    smvs = {smv_by_row.get(r.id) for r in active if smv_by_row.get(r.id) is not None}
    smv_value = next(iter(smvs)) if len(smvs) == 1 else None

    if missing:
        return DayCap(
            day=day,
            is_working_day=True,
            theoretical_minutes=None,
            practical_minutes=None,
            load=load,
            status=STATUS_UNKNOWN,
            reason_codes=reasons + ["INPUT_MISSING"],
            missing_inputs=missing,
            operators=operators or None,
            efficiency_pct=efficiency,
            assigned_operators=assigned_ops,
            assigned_machines=assigned_machines,
        )

    assert plan.operator_minutes is not None and efficiency is not None
    operator_minutes = quant(plan.operator_minutes, 4)
    practical = quant(operator_minutes * efficiency / HUNDRED, 4)

    theoretical_units = practical_units = None
    if smv_value is not None:
        theoretical_units = operator_minutes / smv_value
        practical_units = practical / smv_value
    elif not smvs:
        reasons.append("UNITS_NOT_COMPUTED_NO_SMV")
    else:
        reasons.append("UNITS_NOT_COMPUTED_MULTIPLE_SMV")

    missing_out: list[str] = []
    if load.firm > practical:
        status = STATUS_OVERLOADED
    elif load.unresolved_firm:
        status = STATUS_UNKNOWN
        missing_out.append("smv")
    elif practical > ZERO and load.firm == ZERO:
        status = STATUS_IDLE
    else:
        status = STATUS_LOADED
    return DayCap(
        day=day,
        is_working_day=True,
        theoretical_minutes=operator_minutes,
        practical_minutes=practical,
        load=load,
        status=status,
        reason_codes=reasons,
        missing_inputs=missing_out,
        operators=operators,
        efficiency_pct=efficiency,
        smv_per_piece=smv_value,
        theoretical_units=theoretical_units,
        practical_units=practical_units,
        assigned_operators=assigned_ops,
        assigned_machines=assigned_machines,
    )


async def fetch_active_lines(
    db: AsyncSession,
    tenant_id: int,
    *,
    factory_unit: str | None = None,
    line_id: int | None = None,
    line_ids: list[int] | None = None,
) -> list[SewingLine]:
    stmt = select(SewingLine).where(SewingLine.tenant_id == tenant_id, SewingLine.is_active.is_(True))
    if factory_unit:
        stmt = stmt.where(SewingLine.factory_unit == factory_unit)
    if line_id is not None:
        stmt = stmt.where(SewingLine.id == line_id)
    if line_ids is not None:
        if not line_ids:
            return []
        stmt = stmt.where(SewingLine.id.in_(line_ids))
    stmt = stmt.order_by(SewingLine.line_code, SewingLine.id).limit(MAX_LINES)
    return list((await db.execute(stmt)).scalars().all())


async def _efficiency_history(
    db: AsyncSession, tenant_id: int, line_ids: list[int], window_start: date, window_end: date
) -> dict[int, list[Any]]:
    """Per line, non-DRAFT / non-CANCELLED rows ordered by start date (oldest first).

    Contains every row starting inside the window plus the latest row starting before it, so the
    "most recent row starting on or before the day" is the same for any window that contains the day.
    """
    out: dict[int, list[Any]] = {}
    if not line_ids:
        return out
    cfg = SewingLineStyleConfig
    status = func.upper(func.trim(cfg.reservation_status))
    inside = (
        await db.execute(
            select(cfg)
            .where(
                cfg.tenant_id == tenant_id,
                cfg.line_id.in_(line_ids),
                status.notin_(("CANCELLED", "DRAFT")),
                cfg.start_date >= window_start,
                cfg.start_date <= window_end,
            )
            .order_by(cfg.start_date, cfg.id)
            .limit(MAX_HISTORY_ROWS)
        )
    ).scalars().all()
    before = (
        await db.execute(
            select(cfg)
            .where(
                cfg.tenant_id == tenant_id,
                cfg.line_id.in_(line_ids),
                status.notin_(("CANCELLED", "DRAFT")),
                cfg.start_date < window_start,
            )
            .distinct(cfg.line_id)
            .order_by(cfg.line_id, cfg.start_date.desc(), cfg.id.desc())
        )
    ).scalars().all()
    for r in list(before) + list(inside):
        out.setdefault(r.line_id, []).append(r)
    for rows in out.values():
        rows.sort(key=lambda r: (r.start_date, r.id))
    return out


async def compute_capacity(
    db: AsyncSession,
    tenant_id: int,
    *,
    window_start: date,
    window_end: date,
    factory_unit: str | None = None,
    line_id: int | None = None,
    line_ids: list[int] | None = None,
    days_by_line: dict[int, list[date]] | None = None,
    scenario: Any | None = None,
    include_tentative: bool = False,
    integrated_planning: bool = False,
    today: date | None = None,
) -> CapacityResult:
    """Corrected capacity for every day in the window, or only for `days_by_line` (used by delivery prediction).

    `scenario` (what-if rows, plan revision impact) and `include_tentative` (tentative inquiry / quotation demand as
    SOFT load; callers pass it only when mfg_integrated_planning_v1 is on) default to "off": Phase 1 output is identical.
    `integrated_planning` (callers pass it only when mfg_integrated_planning_v1 is on): operators of a line-day with
    OPERATOR assignments come from those assignments (today: attendance), machines from machine assignments are a
    separate constraint, and the approved style standard SMV joins the SMV hierarchy. `today` (tenant business date)
    decides which day uses attendance.
    """
    lines = await fetch_active_lines(
        db, tenant_id, factory_unit=factory_unit, line_id=line_id, line_ids=line_ids
    )
    notices: list[str] = []
    ids = [ln.id for ln in lines]
    plan_rows, truncated = await fetch_live_plan_rows(
        db, tenant_id, window_start=window_start, window_end=window_end, line_ids=ids, scenario=scenario
    )
    if truncated:
        notices.append("PLAN_ROWS_TRUNCATED: only the first 5000 plan rows were used")
    tentative_rows: list[Any] | None = None
    if include_tentative:
        from app.modules.mfg_intelligence.tentative_demand_service import fetch_tentative_rows

        tentative_rows = await fetch_tentative_rows(
            db, tenant_id, window_start=window_start, window_end=window_end, line_ids=ids
        )
    loading = await build_line_loading(
        db,
        tenant_id,
        window_start=window_start,
        window_end=window_end,
        plan_rows=plan_rows,
        truncated=truncated,
        tentative_rows=tentative_rows,
        style_standard_smv=integrated_planning,
    )
    shifts = await load_active_shifts(db, tenant_id)
    history = await _efficiency_history(db, tenant_id, ids, window_start, window_end)
    smv_by_row: dict[int, Decimal | None] = {item.cfg.id: item.smv.value for item in loading.rows}
    rows_by_line: dict[int, list[Any]] = {}
    for r in plan_rows:
        rows_by_line.setdefault(r.line_id, []).append(r)

    legacy_ctx = build_legacy_context(list(shifts.values()), loading.calendar, window_start, window_end)

    total_days = (window_end - window_start).days + 1
    wanted_by_line: dict[int, list[date]] = {}
    for ln in lines:
        if days_by_line is not None:
            wanted_by_line[ln.id] = sorted(set(days_by_line.get(ln.id, [])))
        else:
            wanted_by_line[ln.id] = [window_start + timedelta(days=offset) for offset in range(total_days)]
    staffing: AssignmentStaffing | None = None
    assumptions_extra: list[str] = []
    if integrated_planning:
        staffing = await load_assignment_staffing(
            db, tenant_id, line_ids=ids, days_by_line=wanted_by_line, today=today
        )
        notices.extend(staffing.notices)
        assumptions_extra.append(ASSIGNMENT_ASSUMPTION)

    result_lines: list[LineCap] = []
    for ln in lines:
        line_rows = rows_by_line.get(ln.id, [])
        days: list[DayCap] = []
        wanted_days = wanted_by_line[ln.id]
        line_reasons = ["MACHINE_PROFILE_NOT_EVALUATED"]
        for day in wanted_days:
            days.append(
                compute_day_capacity(
                    day=day,
                    calendar=loading.calendar,
                    line=ln,
                    shifts_by_id=shifts,
                    line_rows=line_rows,
                    history_rows=history.get(ln.id, []),
                    smv_by_row=smv_by_row,
                    load=loading.per_line_day.get((ln.id, day), DayLoad()),
                    staff=staffing.get(ln.id, day) if staffing is not None else None,
                )
            )
        if staffing is not None:
            if any(d.assigned_operators is not None for d in days):
                line_reasons.append("OPERATORS_FROM_ASSIGNMENTS")
            if any(d.assigned_machines is not None for d in days):
                line_reasons.append("MACHINES_FROM_ASSIGNMENTS")
        result_lines.append(
            LineCap(
                line=ln,
                days=days,
                reason_codes=line_reasons,
                legacy_value=legacy_line_capacity(ln, legacy_ctx),
            )
        )
    if len(lines) >= MAX_LINES:
        notices.append(f"LINES_TRUNCATED: only the first {MAX_LINES} active lines are shown")
    return CapacityResult(
        window_start=window_start,
        window_end=window_end,
        lines=result_lines,
        loading=loading,
        notices=notices,
        legacy_average_shift_minutes=Decimal(str(legacy_ctx.average_shift_minutes)),
        legacy_working_days=legacy_ctx.working_days,
        assumptions_extra=assumptions_extra,
    )


# --------------------------------------------------------------------------- payloads


def line_totals(line_cap: LineCap) -> dict[str, Any]:
    practical = firm = soft = draft = firm_known = ZERO
    known = unknown = closed = 0
    for d in line_cap.days:
        soft += d.load.soft
        draft += d.load.draft
        firm += d.load.firm
        if not d.is_working_day:
            closed += 1
        elif d.practical_minutes is None or not d.load_complete:
            unknown += 1  # capacity unknown, or a firm row with unknown SMV makes the firm load incomplete
        else:
            known += 1
            practical += d.practical_minutes
            firm_known += d.load.firm
    util = quant(firm_known / practical * HUNDRED, 2) if practical > ZERO else None
    return {
        "practical_smv_minutes": dec_str(practical) if known else None,
        "firm_smv_minutes": dec_str(firm),
        "soft_smv_minutes": dec_str(soft),
        "draft_smv_minutes": dec_str(draft),
        "firm_available_smv_minutes": dec_str(practical - firm_known) if known else None,
        "utilization_pct": dec_str(util),
        "working_days_known": known,
        "working_days_unknown": unknown,
        "closed_days": closed,
    }


def corrected_line_value(line_cap: LineCap) -> tuple[Decimal | None, bool]:
    """Sum of practical SMV minutes over known open days, and whether every open day was known."""
    known = [d for d in line_cap.days if d.is_working_day and d.practical_minutes is not None]
    unknown = [d for d in line_cap.days if d.is_working_day and d.practical_minutes is None]
    if not known:
        return None, not unknown
    return sum((d.practical_minutes for d in known), ZERO), not unknown


def day_payload(d: DayCap, include_corrected: bool) -> dict[str, Any]:
    base = {
        "date": d.day,
        "is_working_day": d.is_working_day,
        "firm_smv_minutes": dec_str(d.load.firm),
        "soft_smv_minutes": dec_str(d.load.soft),
        "draft_smv_minutes": dec_str(d.load.draft),
        "firm_confirmed_smv_minutes": dec_str(d.load.firm_confirmed),
        "firm_unconfirmed_smv_minutes": dec_str(d.load.firm_unconfirmed),
        "unresolved_firm_rows": d.load.unresolved_firm,
        "unresolved_soft_rows": d.load.unresolved_soft,
    }
    if not include_corrected:
        base.update(
            {
                "theoretical_minutes": None,
                "practical_smv_minutes": None,
                "firm_available_smv_minutes": None,
                "utilization_pct": None,
                "status": STATUS_UNKNOWN if d.is_working_day else STATUS_CLOSED,
                "reason_codes": ["PLANNING_MATH_V2_OFF"] if d.is_working_day else ["CLOSED_DAY"],
                "missing_inputs": [],
                "operators": None,
                "efficiency_pct": None,
                "smv_per_piece": None,
                "theoretical_units": None,
                "practical_units": None,
            }
        )
        return base
    base.update(
        {
            "theoretical_minutes": dec_str(d.theoretical_minutes),
            "practical_smv_minutes": dec_str(d.practical_minutes),
            "firm_available_smv_minutes": dec_str(d.firm_available),
            "utilization_pct": dec_str(d.utilization_pct),
            "status": d.status,
            "reason_codes": d.reason_codes,
            "missing_inputs": d.missing_inputs,
            "operators": d.operators,
            "efficiency_pct": dec_str(d.efficiency_pct),
            "smv_per_piece": dec_str(d.smv_per_piece, 4),
            "theoretical_units": dec_str(d.theoretical_units),
            "practical_units": dec_str(d.practical_units),
        }
    )
    # Phase 2 keys appear only when assignments were used (flag off: output unchanged).
    if d.assigned_operators is not None:
        base["assigned_operators"] = d.assigned_operators
    if d.assigned_machines is not None:
        base["assigned_machines"] = d.assigned_machines
    return base


def capacity_payload(result: CapacityResult, *, include_corrected: bool) -> dict[str, Any]:
    lines_out: list[dict[str, Any]] = []
    legacy_total = ZERO
    corrected_total = ZERO
    corrected_any = False
    corrected_complete = True
    for lc in result.lines:
        legacy_total += lc.legacy_value
        corrected, complete = corrected_line_value(lc)
        line_notice = None
        if include_corrected:
            if corrected is not None:
                corrected_total += corrected
                corrected_any = True
            corrected_complete = corrected_complete and complete
            difference = lc.legacy_value - corrected if corrected is not None and complete else None
        else:
            corrected = None
            difference = None
            line_notice = "planning_math_v2 off"
        missing = sorted({m for d in lc.days for m in d.missing_inputs})
        reasons = list(lc.reason_codes)
        if include_corrected and missing:
            reasons.append("INPUT_MISSING_ON_SOME_DAYS")
        lines_out.append(
            {
                "line_id": lc.line.id,
                "line_code": lc.line.line_code,
                "name": lc.line.name,
                "factory_unit": lc.line.factory_unit,
                "days": [day_payload(d, include_corrected) for d in lc.days],
                "totals": line_totals(lc) if include_corrected else _loads_only_totals(lc),
                "legacy_value": dec_str(lc.legacy_value),
                "corrected_value": dec_str(corrected),
                "corrected_complete": (complete if include_corrected else None),
                "difference": dec_str(difference),
                "notice": line_notice,
                "reason_codes": reasons,
                "missing_inputs": missing,
            }
        )
    notices = list(result.notices)
    if not include_corrected:
        notices.append("planning_math_v2 off")
    return {
        "date_from": result.window_start,
        "date_to": result.window_end,
        "formula_version": FORMULA_VERSION,
        "planning_math_v2": include_corrected,
        "legacy_basis": LEGACY_BASIS,
        "legacy_working_days": result.legacy_working_days,
        "legacy_average_shift_minutes": dec_str(result.legacy_average_shift_minutes),
        "lines": lines_out,
        "totals": {
            "legacy_value": dec_str(legacy_total),
            "corrected_value": dec_str(corrected_total) if include_corrected and corrected_any else None,
            "corrected_complete": corrected_complete if include_corrected else None,
            "difference": (
                dec_str(legacy_total - corrected_total)
                if include_corrected and corrected_any and corrected_complete
                else None
            ),
        },
        "notices": notices,
        "assumptions": PHASE1_ASSUMPTIONS + result.assumptions_extra,
    }


def _loads_only_totals(lc: LineCap) -> dict[str, Any]:
    firm = sum((d.load.firm for d in lc.days), ZERO)
    soft = sum((d.load.soft for d in lc.days), ZERO)
    draft = sum((d.load.draft for d in lc.days), ZERO)
    return {
        "practical_smv_minutes": None,
        "firm_smv_minutes": dec_str(firm),
        "soft_smv_minutes": dec_str(soft),
        "draft_smv_minutes": dec_str(draft),
        "firm_available_smv_minutes": None,
        "utilization_pct": None,
        "working_days_known": 0,
        "working_days_unknown": 0,
        "closed_days": sum(1 for d in lc.days if not d.is_working_day),
    }
