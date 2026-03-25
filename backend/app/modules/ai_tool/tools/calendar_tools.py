"""Factory calendar helpers for AI Tool (read-only summaries + proposed actions)."""
from __future__ import annotations

import calendar
import re
from datetime import date, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FactoryCalendarOverride, SewingLineStyleConfig, TenantProductionSettings
from app.modules.production.calendar_service import count_working_days_between, is_working_day


async def _load_calendar_context(
    db: AsyncSession, tenant_id: int
) -> tuple[list[str] | None, dict[date, str], dict[date, str | None]]:
    s = await db.execute(
        select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id)
    )
    row = s.scalar_one_or_none()
    weekend_days = list(row.weekend_days) if row and row.weekend_days else None
    r = await db.execute(select(FactoryCalendarOverride).where(FactoryCalendarOverride.tenant_id == tenant_id))
    overrides_list = list(r.scalars().all())
    omap: dict[date, str] = {x.override_date: x.override_type for x in overrides_list}
    names: dict[date, str | None] = {
        x.override_date: x.name for x in overrides_list if x.override_type == "holiday"
    }
    return weekend_days, omap, names


def _month_range(year: int, month: int) -> tuple[date, date]:
    _, last = calendar.monthrange(year, month)
    return date(year, month, 1), date(year, month, last)


async def calendar_summary_tool(db: AsyncSession, tenant_id: int, prompt: str) -> dict[str, Any]:
    """Working days / next holiday in a referenced month (defaults to current month)."""
    weekend_days, omap, hnames = await _load_calendar_context(db, tenant_id)
    today = date.today()
    y, m = today.year, today.month
    mm = re.search(r"(20\d{2})-(\d{2})", prompt)
    if mm:
        y = int(mm.group(1))
        m = int(mm.group(2))
    start, end = _month_range(y, m)
    wd = count_working_days_between(start, end, weekend_days=weekend_days, overrides=omap)
    holidays = [(d, t) for d, t in omap.items() if t == "holiday" and start <= d <= end]
    upcoming: list[tuple[date, str]] = []
    for d in sorted(omap.keys()):
        if omap.get(d) != "holiday" or d < today:
            continue
        label = (hnames.get(d) or "Holiday").strip() or "Holiday"
        upcoming.append((d, label))
    upcoming.sort(key=lambda x: x[0])
    next_h = upcoming[0] if upcoming else None
    summary = (
        f"{y}-{m:02d}: {wd} working day(s), {len(holidays)} holiday override(s) in month."
        + (f" Next holiday: {next_h[1]} on {next_h[0].isoformat()}." if next_h else " No upcoming holidays in calendar overrides.")
    )
    return {
        "summary": summary,
        "data": {
            "year": y,
            "month": m,
            "working_days_in_month": wd,
            "holiday_overrides_in_month": len(holidays),
            "next_holiday": {"date": next_h[0].isoformat(), "name": next_h[1]} if next_h else None,
        },
    }


async def calendar_impact_tool(db: AsyncSession, tenant_id: int, prompt: str) -> dict[str, Any]:
    """Rough impact: one fewer working day in a month; sewing line configs overlapping that month."""
    weekend_days, omap, _ = await _load_calendar_context(db, tenant_id)
    today = date.today()
    y, m = today.year, today.month
    mm = re.search(r"(20\d{2})-(\d{2})", prompt)
    if mm:
        y = int(mm.group(1))
        m = int(mm.group(2))
    start, end = _month_range(y, m)
    wd_before = count_working_days_between(start, end, weekend_days=weekend_days, overrides=omap)
    sim_date = start
    while sim_date <= end:
        if is_working_day(sim_date, weekend_days=weekend_days, overrides=omap):
            break
        sim_date += timedelta(days=1)
    sim_map = dict(omap)
    if sim_date <= end:
        sim_map[sim_date] = "holiday"
    wd_after = count_working_days_between(start, end, weekend_days=weekend_days, overrides=sim_map)
    delta = wd_before - wd_after

    r = await db.execute(
        select(func.count())
        .select_from(SewingLineStyleConfig)
        .where(
            SewingLineStyleConfig.tenant_id == tenant_id,
            SewingLineStyleConfig.start_date <= end,
            or_(
                SewingLineStyleConfig.planned_end_date.is_(None),
                SewingLineStyleConfig.planned_end_date >= start,
            ),
        )
    )
    line_cnt = int(r.scalar() or 0)
    summary = (
        f"If one working day in {y}-{m:02d} became a holiday, working days drop from {wd_before} to ~{wd_after} "
        f"({delta} day). ~{line_cnt} sewing line style config(s) overlap this month (review planned dates)."
    )
    return {
        "summary": summary,
        "data": {
            "month": f"{y}-{m:02d}",
            "working_days_now": wd_before,
            "working_days_if_one_holiday_added": wd_after,
            "delta_working_days": delta,
            "sewing_line_configs_overlapping_month": line_cnt,
        },
    }


async def calendar_manage_tool(db: AsyncSession, tenant_id: int, prompt: str) -> dict[str, Any]:
    """Parse a simple date range + name; return proposed rows (user applies via Factory Calendar UI)."""
    del tenant_id
    text = prompt.strip()
    dates_found = re.findall(r"(20\d{2}-\d{2}-\d{2})", text)
    name_guess = "Holiday"
    if "eid" in text.lower():
        name_guess = "Eid"
    proposed: list[dict[str, str]] = []
    if len(dates_found) >= 2:
        d0 = date.fromisoformat(dates_found[0])
        d1 = date.fromisoformat(dates_found[1])
        if d1 < d0:
            d0, d1 = d1, d0
        cur = d0
        while cur <= d1:
            proposed.append({"override_date": cur.isoformat(), "override_type": "holiday", "name": name_guess})
            cur += timedelta(days=1)
    elif len(dates_found) == 1:
        d0 = date.fromisoformat(dates_found[0])
        proposed.append({"override_date": d0.isoformat(), "override_type": "holiday", "name": name_guess})
    summary = (
        f"Proposed {len(proposed)} factory calendar override(s). "
        "Confirm in the Factory Calendar page or POST /api/v1/production/calendar for each date."
        if proposed
        else "Could not parse a date range. Try: 'Add holidays 2026-03-30 to 2026-04-02'."
    )
    return {
        "summary": summary,
        "data": {"proposed": proposed, "requires_ui_confirmation": True},
    }
