"""Empirical sewing-line efficiency (Phase 4, read-only). Plan 15 sections 5.1-5.2, D3-D6, 17.1, 17.13.

Daily efficiency of a line (sewing department only):
    earned    = sum of hourly good_qty x SMV of the entry's plan row (`line_style_config_id`)
    available = operator-minutes of that line-day from the pure `compute_day_capacity` (plan basis:
                plan-row operator counts and shifts, integrated_planning=False, no attendance / assignments)
    e         = earned / available   (4 decimals, ROUND_HALF_UP)
Excluded days (counted in `excluded_days`): available unknown or 0, earned 0 (line not working), SMV unknown,
e > 1.5 (data error). Label: "plan-basis efficiency (includes absence and balancing loss)".

Estimate per line x style family (`garment_styles.product_type`, upper(trim()), blank = UNSPECIFIED); a family with
fewer than 10 days falls back to the line's all-family sample (confidence at most MEDIUM), then to the planned
efficiency (confidence LOW). Never pooled across lines or tenants.
    winsorise (median +/- 3.5 x 1.4826 x MAD) -> EWMA alpha 0.2 seeded with the median -> blend with planned:
    value = w x empirical + (1 - w) x planned, w = min(0.7, n / 40) for n >= 10, w <= 0.3 when robust CV > 0.25
    or the operation bulletin changed inside the sample.
Window: 90 calendar days ending `date_to`, at most the latest 60 production days.
Query budget (independent of the number of lines and days): lines 1, hourly 1, plan rows 1, referenced rows <= 1,
SMV <= 3, styles <= 1, shifts 1, calendar 2.
"""
from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import GarmentStyle, HourlyProductionEntry, SewingLineStyleConfig
from app.modules.mfg_intelligence import predictive_stats as st
from app.modules.mfg_intelligence.calendar_helpers import load_active_shifts, load_calendar
from app.modules.mfg_intelligence.capacity_service import compute_day_capacity, fetch_active_lines
from app.modules.mfg_intelligence.decimals import ZERO, dec_str, quant, to_dec
from app.modules.mfg_intelligence.line_loading_service import MAX_PLAN_ROWS, DayLoad
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows

WINDOW_DAYS = 90
MAX_PRODUCTION_DAYS = 60
MAX_HOURLY_GROUPS = 50000
MAX_EFFICIENCY = Decimal("1.5")
HUNDRED = Decimal("100")
FAMILY_UNSPECIFIED = "UNSPECIFIED"
FAMILY_ALL = "ALL"

SOURCE_EMPIRICAL = "EMPIRICAL"
SOURCE_BLENDED = "BLENDED"
SOURCE_PLANNED = "PLANNED"
SOURCE_UNKNOWN = "UNKNOWN"
CONF_HIGH = "HIGH"
CONF_MEDIUM = "MEDIUM"
CONF_LOW = "LOW"

METRIC = "PLAN_BASIS_EFFICIENCY"
METRIC_LABEL = "plan-basis efficiency (includes absence and balancing loss)"
ASSUMPTIONS = [
    "Daily efficiency = earned minutes (good pieces x SMV) / available operator-minutes of the line-day.",
    "Available minutes use plan-row operator counts and shifts (plan basis): absence and balancing loss are inside "
    "the measured efficiency, not removed from the denominator.",
    "Only sewing-department hourly output is used.",
    "Days with unknown capacity or SMV, no output, or efficiency above 150 % are excluded and counted.",
    "Robust estimate: winsorised at median +/- 3.5 MAD, then EWMA (alpha 0.2) seeded with the median.",
    "Fewer than 10 production days: the planned efficiency is used (confidence LOW). 10+ days: blended with the "
    "plan, empirical weight min(0.7, days / 40), at most 0.3 when dispersion is high or the operation bulletin "
    "changed. History never mixes lines or companies.",
]


def sewing_clause():
    """Sewing-department hourly rows only (same rule as Phase 3 `cpm_service`, kept here without finance imports)."""
    return func.lower(func.trim(HourlyProductionEntry.department_type)) == "sewing"


def family_of(product_type: str | None) -> str:
    text = (product_type or "").strip().upper()
    return text or FAMILY_UNSPECIFIED


@dataclass
class DaySample:
    day: date
    efficiency: Decimal
    family: str
    earned: Decimal
    available: Decimal
    ob_ids: frozenset[int | None]


@dataclass
class LineHistory:
    line: Any
    samples: list[DaySample] = field(default_factory=list)  # date order, latest MAX_PRODUCTION_DAYS only
    excluded: dict[str, int] = field(default_factory=dict)
    latest_planned: Decimal | None = None  # fraction (0.60 = 60 %)

    @property
    def excluded_days(self) -> int:
        return sum(self.excluded.values())


@dataclass
class EfficiencyEstimate:
    value: Decimal | None
    planned: Decimal | None
    empirical: Decimal | None
    median: Decimal | None
    weight: Decimal
    n: int
    robust_cv: Decimal | None
    source: str
    confidence: str
    group: str
    reason_codes: list[str]
    series: list[Decimal]  # raw daily efficiencies of the group used, date order (spread input)


@dataclass
class EfficiencyHistory:
    date_from: date
    date_to: date
    lines: dict[int, LineHistory]
    notices: list[str]

    def estimate(self, line_id: int, family: str | None, planned: Decimal | None) -> EfficiencyEstimate:
        hist = self.lines.get(line_id)
        samples = hist.samples if hist is not None else []
        return estimate_from_samples(samples, family, planned)


def _pct(value: Decimal | None) -> str | None:
    return dec_str(value * HUNDRED, 2) if value is not None else None


def estimate_from_samples(samples: list[DaySample], family: str | None, planned: Decimal | None) -> EfficiencyEstimate:
    """Pure blend for one line (17.13). `planned` is a fraction or None."""
    reasons: list[str] = []
    group = FAMILY_ALL
    chosen: list[DaySample] = []
    cap_medium = False
    if family is not None:
        fam = [s for s in samples if s.family == family]
        if len(fam) >= st.MIN_EMPIRICAL_N:
            chosen, group = fam, family
        elif len(samples) >= st.MIN_EMPIRICAL_N:
            chosen, group, cap_medium = list(samples), FAMILY_ALL, True
            reasons.append("FAMILY_FALLBACK_LINE_ALL")
    elif len(samples) >= st.MIN_EMPIRICAL_N:
        chosen = list(samples)

    if not chosen:
        reasons.append("INSUFFICIENT_HISTORY")
        if planned is None:
            reasons.append("PLANNED_EFFICIENCY_MISSING")
            return EfficiencyEstimate(None, None, None, None, ZERO, len(samples), None, SOURCE_UNKNOWN, CONF_LOW,
                                      group, reasons, [])
        return EfficiencyEstimate(planned, planned, None, None, ZERO, len(samples), None, SOURCE_PLANNED, CONF_LOW,
                                  group, reasons, [])

    values = [s.efficiency for s in chosen]
    clipped = st.winsorize(values)
    seed = st.median(clipped)
    empirical = st.ewma(clipped, seed=seed)
    assert empirical is not None
    med = st.median(values)
    cv = st.robust_cv(values)
    plan_changed = len({ob for s in chosen for ob in s.ob_ids}) > 1
    n = len(chosen)
    weight = st.blend_weight(n, cv, plan_changed)
    if cv is not None and cv > st.CV_UNSTABLE:
        reasons.append("HIGH_DISPERSION_WEIGHT_CAPPED")
    if plan_changed:
        reasons.append("PLAN_OR_OB_CHANGED_WEIGHT_CAPPED")
    if planned is None:
        value = empirical
        source = SOURCE_EMPIRICAL
        reasons.append("PLANNED_EFFICIENCY_MISSING")
        cap_medium = True
    else:
        value = weight * empirical + (st.ONE - weight) * planned
        source = SOURCE_BLENDED
    confidence = CONF_HIGH if (n >= 20 and weight == st.WEIGHT_CAP) else CONF_MEDIUM
    if cap_medium and confidence == CONF_HIGH:
        confidence = CONF_MEDIUM
    return EfficiencyEstimate(
        value=quant(value, 4),
        planned=planned,
        empirical=quant(empirical, 4),
        median=quant(med, 4) if med is not None else None,
        weight=quant(weight, 4),
        n=n,
        robust_cv=quant(cv, 4) if cv is not None else None,
        source=source,
        confidence=confidence,
        group=group,
        reason_codes=reasons,
        series=values,
    )


async def history_plan_rows(
    db: AsyncSession, tenant_id: int, line_ids: list[int], window_start: date, window_end: date
) -> tuple[list[SewingLineStyleConfig], bool]:
    """Plan rows of the lines overlapping the window, any status except CANCELLED (COMPLETED included; DRAFT rows
    are scenarios and are never history). Bounded to MAX_PLAN_ROWS (17.1)."""
    if not line_ids:
        return [], False
    cfg = SewingLineStyleConfig
    rows = list(
        (
            await db.execute(
                select(cfg)
                .where(
                    cfg.tenant_id == tenant_id,
                    cfg.line_id.in_(line_ids),
                    func.upper(func.trim(cfg.reservation_status)).notin_(("CANCELLED", "DRAFT")),
                    cfg.start_date <= window_end,
                    func.coalesce(cfg.planned_end_date, cfg.start_date) >= window_start,
                )
                .order_by(cfg.start_date, cfg.id)
                .limit(MAX_PLAN_ROWS + 1)
            )
        )
        .scalars()
        .all()
    )
    truncated = len(rows) > MAX_PLAN_ROWS
    return rows[:MAX_PLAN_ROWS], truncated


async def load_efficiency_history(
    db: AsyncSession,
    tenant_id: int,
    *,
    date_to: date,
    factory_unit: str | None = None,
    line_id: int | None = None,
    line_ids: list[int] | None = None,
    integrated_planning: bool = False,
    window_days: int = WINDOW_DAYS,
    max_days: int = MAX_PRODUCTION_DAYS,
) -> EfficiencyHistory:
    """Daily efficiency samples per active line (batched; see the module docstring for the query budget).

    `integrated_planning` only adds the approved style standard SMV to the SMV hierarchy of the numerator (and for
    entries without a plan row); the denominator is always plan basis. `window_days` / `max_days` are only changed
    by the anomaly check (which needs its own look-back); estimates always use the defaults.
    """
    date_from = date_to - timedelta(days=window_days - 1)
    notices: list[str] = []
    lines = await fetch_active_lines(db, tenant_id, factory_unit=factory_unit, line_id=line_id, line_ids=line_ids)
    ids = [ln.id for ln in lines]
    out = EfficiencyHistory(date_from, date_to, {ln.id: LineHistory(line=ln) for ln in lines}, notices)
    if not ids:
        return out

    h = HourlyProductionEntry
    groups = list(
        (
            await db.execute(
                select(
                    h.line_id,
                    h.production_date,
                    h.line_style_config_id,
                    h.style_id,
                    func.coalesce(func.sum(h.good_qty), 0),
                )
                .where(
                    h.tenant_id == tenant_id,
                    sewing_clause(),
                    h.line_id.in_(ids),
                    h.production_date >= date_from,
                    h.production_date <= date_to,
                )
                .group_by(h.line_id, h.production_date, h.line_style_config_id, h.style_id)
                .order_by(h.line_id, h.production_date)
                .limit(MAX_HOURLY_GROUPS + 1)
            )
        ).all()
    )
    if len(groups) > MAX_HOURLY_GROUPS:
        groups = groups[:MAX_HOURLY_GROUPS]
        notices.append(f"HOURLY_ROWS_TRUNCATED: only the first {MAX_HOURLY_GROUPS} line-day groups were used")

    plan_rows, truncated = await history_plan_rows(db, tenant_id, ids, date_from, date_to)
    if truncated:
        notices.append(f"PLAN_ROWS_TRUNCATED: only the first {MAX_PLAN_ROWS} plan rows were used")
    rows_by_id: dict[int, Any] = {r.id: r for r in plan_rows}
    referenced = sorted({int(g[2]) for g in groups if g[2] is not None} - set(rows_by_id))
    if referenced:
        cfg = SewingLineStyleConfig
        for r in (
            await db.execute(select(cfg).where(cfg.tenant_id == tenant_id, cfg.id.in_(referenced)))
        ).scalars().all():
            rows_by_id[r.id] = r
    smv = await resolve_smv_for_rows(db, tenant_id, list(rows_by_id.values()), use_style_standard=integrated_planning)

    style_ids = {int(g[3]) for g in groups if g[3] is not None} | {
        int(r.style_id) for r in rows_by_id.values() if r.style_id
    }
    style_info: dict[int, tuple[str, Decimal | None]] = {}
    if style_ids:
        for sid, ptype, standard in (
            await db.execute(
                select(GarmentStyle.id, GarmentStyle.product_type, GarmentStyle.standard_smv).where(
                    GarmentStyle.tenant_id == tenant_id, GarmentStyle.id.in_(sorted(style_ids))
                )
            )
        ).all():
            std = to_dec(standard)
            style_info[int(sid)] = (family_of(ptype), std if std is not None and std > ZERO else None)

    shifts = await load_active_shifts(db, tenant_id)
    calendar = await load_calendar(db, tenant_id, date_from, date_to)

    rows_by_line: dict[int, list[Any]] = defaultdict(list)
    for r in plan_rows:
        rows_by_line[int(r.line_id)].append(r)
    for lid, rows in rows_by_line.items():
        rows.sort(key=lambda r: (r.start_date, r.id))
        latest = [r for r in rows if r.start_date <= date_to]
        eff = to_dec(latest[-1].target_efficiency_pct) if latest else None
        if eff is not None and eff > ZERO:
            out.lines[lid].latest_planned = quant(eff / HUNDRED, 4)

    by_line_day: dict[tuple[int, date], list[tuple[Any, Any, Decimal]]] = defaultdict(list)
    for lid, day, cfg_id, style_id, good in groups:
        by_line_day[(int(lid), day)].append((cfg_id, style_id, to_dec(good) or ZERO))

    samples_by_line: dict[int, list[DaySample]] = defaultdict(list)
    for (lid, day), entries in sorted(by_line_day.items(), key=lambda kv: (kv[0][0], kv[0][1])):
        hist = out.lines[lid]

        def exclude(code: str) -> None:
            hist.excluded[code] = hist.excluded.get(code, 0) + 1

        earned = ZERO
        family_minutes: dict[str, Decimal] = defaultdict(lambda: ZERO)
        ob_ids: set[int | None] = set()
        smv_missing = False
        for cfg_id, style_id, good in entries:
            if good <= ZERO:
                continue
            row = rows_by_id.get(int(cfg_id)) if cfg_id is not None else None
            value: Decimal | None = None
            sid = int(row.style_id) if row is not None and row.style_id else (int(style_id) if style_id else None)
            if row is not None:
                value = smv[row.id].value
                ob_ids.add(int(row.ob_id) if row.ob_id else None)
            elif integrated_planning and sid is not None and sid in style_info:
                value = style_info[sid][1]
                ob_ids.add(None)
            if value is None:
                smv_missing = True
                continue
            minutes = good * value
            earned += minutes
            family_minutes[style_info[sid][0] if sid is not None and sid in style_info else FAMILY_UNSPECIFIED] += minutes
        if smv_missing:
            exclude("SMV_UNKNOWN")
            continue
        if earned <= ZERO:
            exclude("NO_OUTPUT")
            continue
        cap = compute_day_capacity(
            day=day,
            calendar=calendar,
            line=hist.line,
            shifts_by_id=shifts,
            line_rows=rows_by_line.get(lid, []),
            history_rows=rows_by_line.get(lid, []),
            smv_by_row={},
            load=DayLoad(),
            staff=None,
        )
        available = cap.theoretical_minutes
        if available is None:
            exclude("CAPACITY_UNKNOWN")
            continue
        if available <= ZERO:
            exclude("NO_AVAILABLE_MINUTES")
            continue
        e = quant(earned / available, 4)
        if e > MAX_EFFICIENCY:
            exclude("EFFICIENCY_ABOVE_150_PCT")
            continue
        family = max(sorted(family_minutes), key=lambda k: family_minutes[k])
        samples_by_line[lid].append(DaySample(day, e, family, quant(earned, 4), available, frozenset(ob_ids)))

    for lid, samples in samples_by_line.items():
        out.lines[lid].samples = samples[-max_days:]
    return out


def _estimate_out(est: EfficiencyEstimate, family: str) -> dict[str, Any]:
    return {
        "family": family,
        "n": est.n,
        "group_used": est.group,
        "empirical_pct": _pct(est.empirical),
        "median_pct": _pct(est.median),
        "robust_cv": dec_str(est.robust_cv, 4),
        "planned_pct": _pct(est.planned),
        "weight": dec_str(est.weight, 4),
        "blended_pct": _pct(est.value),
        "source": est.source,
        "confidence": est.confidence,
        "reason_codes": est.reason_codes,
    }


def line_efficiency_payload(history: EfficiencyHistory) -> dict[str, Any]:
    lines_out: list[dict[str, Any]] = []
    for hist in history.lines.values():
        overall = estimate_from_samples(hist.samples, None, hist.latest_planned)
        families = sorted({s.family for s in hist.samples})
        lines_out.append(
            {
                "line_id": hist.line.id,
                "line_code": hist.line.line_code,
                "name": hist.line.name,
                "factory_unit": hist.line.factory_unit,
                "production_days": len(hist.samples),
                "excluded_days": hist.excluded_days,
                "excluded_reasons": dict(sorted(hist.excluded.items())),
                "last_production_date": hist.samples[-1].day if hist.samples else None,
                "overall": _estimate_out(overall, FAMILY_ALL),
                "families": [
                    _estimate_out(estimate_from_samples(hist.samples, fam, hist.latest_planned), fam)
                    for fam in families
                ],
            }
        )
    return {
        "date_from": history.date_from,
        "date_to": history.date_to,
        "window_days": WINDOW_DAYS,
        "max_production_days": MAX_PRODUCTION_DAYS,
        "metric": METRIC,
        "metric_label": METRIC_LABEL,
        "lines": lines_out,
        "notices": list(history.notices),
        "assumptions": list(ASSUMPTIONS),
    }
