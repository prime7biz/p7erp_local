"""Production anomalies (Phase 4, read-only). Plan 15 sections 5.8, D16, 17.13.

Series (sewing department only, per tenant, never pooled across lines):
- EFFICIENCY per line-day (plan-basis efficiency from `empirical_efficiency_service`), flagged when LOW
- REJECTION_RATE per line-day = reject / (good + reject), flagged when HIGH and the day has >= 5 rejected pieces
- HOURLY_OUTPUT per line x hour slot (good qty), flagged when LOW
Baseline of a point = the previous 30 production days of the same series (at least 10 points).
Modified z = 0.6745 x (x - median) / MAD; MAD = 0 -> (x - median) / (1.253314 x MeanAD); both 0 -> skipped.
Flag at |z| >= 3.5 in the one direction that matters. Request window at most 31 days.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import HourlyProductionEntry
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.capacity_service import fetch_active_lines
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, to_dec
from app.modules.mfg_intelligence.empirical_efficiency_service import load_efficiency_history, sewing_clause

MAX_WINDOW_DAYS = 31
BASELINE_DAYS = 30
MIN_BASELINE = 10
MIN_REJECTED_PIECES = Decimal("5")
LOOKBACK_CALENDAR_DAYS = 75  # enough calendar days to find 30 earlier production days on a 6-day week
MAX_ANOMALIES = 500
MAX_SLOT_ROWS = 100000

METRIC_EFFICIENCY = "EFFICIENCY"
METRIC_REJECTION = "REJECTION_RATE"
METRIC_HOURLY = "HOURLY_OUTPUT"

ASSUMPTIONS = [
    "Each point is compared with the previous 30 production days of the same line (and hour slot); at least 10 "
    "points are needed.",
    "Robust (modified) z-score: 0.6745 x (value - median) / MAD; flagged at 3.5 or more in the bad direction.",
    "Rejection spikes need at least 5 rejected pieces on the day.",
    "Only sewing-department hourly output is used.",
]


def _check(
    series: list[tuple[date, Decimal]], *, date_from: date, date_to: date, low_is_bad: bool, skipped: dict[str, int]
) -> list[tuple[date, Decimal, Decimal, Decimal, int]]:
    """(day, value, baseline median, z, baseline n) for flagged points of one date-ordered series."""
    out = []
    for i, (day, value) in enumerate(series):
        if day < date_from or day > date_to:
            continue
        baseline = [v for _, v in series[max(0, i - BASELINE_DAYS):i]]
        if len(baseline) < MIN_BASELINE:
            skipped["INSUFFICIENT_BASELINE"] += 1
            continue
        z = st.robust_z(value, baseline)
        if z is None:
            skipped["NO_DISPERSION"] += 1
            continue
        if (low_is_bad and z <= -st.ANOMALY_Z) or (not low_is_bad and z >= st.ANOMALY_Z):
            med = st.median(baseline)
            assert med is not None
            out.append((day, value, med, z, len(baseline)))
    return out


async def anomalies_payload(
    db: AsyncSession,
    tenant_id: int,
    *,
    date_from: date,
    date_to: date,
    line_id: int | None = None,
    factory_unit: str | None = None,
    integrated_planning: bool = False,
) -> dict[str, Any]:
    lines = await fetch_active_lines(db, tenant_id, factory_unit=factory_unit, line_id=line_id)
    ids = [ln.id for ln in lines]
    codes = {ln.id: ln.line_code for ln in lines}
    look_from = date_from - timedelta(days=LOOKBACK_CALENDAR_DAYS)
    skipped: dict[str, int] = defaultdict(int)
    notices: list[str] = []
    found: list[dict[str, Any]] = []

    if ids:
        history = await load_efficiency_history(
            db,
            tenant_id,
            date_to=date_to,
            line_ids=ids,
            integrated_planning=integrated_planning,
            window_days=(date_to - look_from).days + 1,
            max_days=10**6,
        )
        notices.extend(history.notices)
        for lid, hist in history.lines.items():
            series = [(s.day, s.efficiency) for s in hist.samples]
            for day, value, med, z, n in _check(series, date_from=date_from, date_to=date_to, low_is_bad=True, skipped=skipped):
                found.append(_row(lid, codes, day, None, METRIC_EFFICIENCY, "LOW", value * 100, med * 100, z, n))

        h = HourlyProductionEntry
        day_rows = (
            await db.execute(
                select(
                    h.line_id,
                    h.production_date,
                    func.coalesce(func.sum(h.good_qty), 0),
                    func.coalesce(func.sum(h.reject_qty), 0),
                )
                .where(
                    h.tenant_id == tenant_id,
                    sewing_clause(),
                    h.line_id.in_(ids),
                    h.production_date >= look_from,
                    h.production_date <= date_to,
                )
                .group_by(h.line_id, h.production_date)
                .order_by(h.line_id, h.production_date)
            )
        ).all()
        rates: dict[int, list[tuple[date, Decimal]]] = defaultdict(list)
        rejected: dict[tuple[int, date], Decimal] = {}
        for lid, day, good, reject in day_rows:
            good_d, reject_d = to_dec(good) or ZERO, to_dec(reject) or ZERO
            total = good_d + reject_d
            if total <= ZERO:
                continue
            rates[int(lid)].append((day, reject_d / total))
            rejected[(int(lid), day)] = reject_d
        for lid, series in rates.items():
            for day, value, med, z, n in _check(series, date_from=date_from, date_to=date_to, low_is_bad=False, skipped=skipped):
                if rejected.get((lid, day), ZERO) < MIN_REJECTED_PIECES:
                    skipped["LOW_VOLUME"] += 1
                    continue
                found.append(_row(lid, codes, day, None, METRIC_REJECTION, "HIGH", value * 100, med * 100, z, n))

        slot_rows = list(
            (
                await db.execute(
                    select(h.line_id, h.hour_slot, h.production_date, func.coalesce(func.sum(h.good_qty), 0))
                    .where(
                        h.tenant_id == tenant_id,
                        sewing_clause(),
                        h.line_id.in_(ids),
                        h.production_date >= look_from,
                        h.production_date <= date_to,
                    )
                    .group_by(h.line_id, h.hour_slot, h.production_date)
                    .order_by(h.line_id, h.hour_slot, h.production_date)
                    .limit(MAX_SLOT_ROWS + 1)
                )
            ).all()
        )
        if len(slot_rows) > MAX_SLOT_ROWS:
            slot_rows = slot_rows[:MAX_SLOT_ROWS]
            notices.append(f"HOURLY_ROWS_TRUNCATED: only the first {MAX_SLOT_ROWS} line-slot-day groups were used")
        slots: dict[tuple[int, int], list[tuple[date, Decimal]]] = defaultdict(list)
        for lid, slot, day, good in slot_rows:
            slots[(int(lid), int(slot))].append((day, to_dec(good) or ZERO))
        for (lid, slot), series in slots.items():
            for day, value, med, z, n in _check(series, date_from=date_from, date_to=date_to, low_is_bad=True, skipped=skipped):
                found.append(_row(lid, codes, day, slot, METRIC_HOURLY, "LOW", value, med, z, n))

    found.sort(key=lambda r: (-abs(Decimal(r["robust_z"])), r["date"], r["line_id"], r["hour_slot"] or 0))
    truncated = len(found) > MAX_ANOMALIES
    return {
        "date_from": date_from,
        "date_to": date_to,
        "threshold": dec_str(st.ANOMALY_Z, 1),
        "baseline_production_days": BASELINE_DAYS,
        "min_baseline_points": MIN_BASELINE,
        "lines_checked": len(ids),
        "anomalies": found[:MAX_ANOMALIES],
        "truncated": truncated,
        "series_skipped": dict(sorted(skipped.items())),
        "notices": notices,
        "assumptions": list(ASSUMPTIONS),
    }


def _row(
    lid: int, codes: dict[int, str], day: date, slot: int | None, metric: str, direction: str,
    value: Decimal, median: Decimal, z: Decimal, n: int,
) -> dict[str, Any]:
    places = 2
    return {
        "line_id": lid,
        "line_code": codes.get(lid),
        "date": day,
        "hour_slot": slot,
        "metric": metric,
        "direction": direction,
        "value": dec_str(value, places),
        "baseline_median": dec_str(median, places),
        "robust_z": dec_str(z, 2),
        "baseline_n": n,
    }


async def line_point_scores(
    db: AsyncSession,
    tenant_id: int,
    *,
    line_id: int,
    metric: str,
    hour_slot: int | None,
    date_from: date,
    date_to: date,
    integrated_planning: bool = False,
) -> list[tuple[date, Decimal | None]]:
    """Modified z of every point of one series in [date_from, date_to] (same baseline rules as the check, no
    threshold). Used to measure anomaly outcomes. z is None when the baseline is too short or has no dispersion."""
    look_from = date_from - timedelta(days=LOOKBACK_CALENDAR_DAYS)
    series: list[tuple[date, Decimal]] = []
    h = HourlyProductionEntry
    if metric == METRIC_EFFICIENCY:
        history = await load_efficiency_history(
            db, tenant_id, date_to=date_to, line_ids=[line_id], integrated_planning=integrated_planning,
            window_days=(date_to - look_from).days + 1, max_days=10**6,
        )
        hist = history.lines.get(line_id)
        series = [(s.day, s.efficiency) for s in hist.samples] if hist is not None else []
    elif metric == METRIC_REJECTION:
        for day, good, reject in (
            await db.execute(
                select(h.production_date, func.coalesce(func.sum(h.good_qty), 0), func.coalesce(func.sum(h.reject_qty), 0))
                .where(h.tenant_id == tenant_id, sewing_clause(), h.line_id == line_id,
                       h.production_date >= look_from, h.production_date <= date_to)
                .group_by(h.production_date)
                .order_by(h.production_date)
            )
        ).all():
            total = (to_dec(good) or ZERO) + (to_dec(reject) or ZERO)
            if total > ZERO:
                series.append((day, (to_dec(reject) or ZERO) / total))
    else:
        stmt = (
            select(h.production_date, func.coalesce(func.sum(h.good_qty), 0))
            .where(h.tenant_id == tenant_id, sewing_clause(), h.line_id == line_id,
                   h.production_date >= look_from, h.production_date <= date_to)
            .group_by(h.production_date)
            .order_by(h.production_date)
        )
        if hour_slot is not None:
            stmt = stmt.where(h.hour_slot == hour_slot)
        series = [(day, to_dec(good) or ZERO) for day, good in (await db.execute(stmt)).all()]
    out: list[tuple[date, Decimal | None]] = []
    for i, (day, value) in enumerate(series):
        if day < date_from or day > date_to:
            continue
        baseline = [v for _, v in series[max(0, i - BASELINE_DAYS):i]]
        out.append((day, st.robust_z(value, baseline) if len(baseline) >= MIN_BASELINE else None))
    return out
