"""Factory calendar: working days, weekend config, holiday overrides."""
from __future__ import annotations

import datetime as dt
from datetime import date, timedelta
from typing import Any

_WEEKDAY_MAP = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def _weekend_set(weekend_days: list[str] | None) -> set[int]:
    if not weekend_days:
        return {5, 6}  # sat, sun default
    out: set[int] = set()
    for d in weekend_days:
        key = (d or "").strip().lower()
        if key in _WEEKDAY_MAP:
            out.add(_WEEKDAY_MAP[key])
    return out if out else {5, 6}


def is_working_day(
    d: date,
    *,
    weekend_days: list[str] | None,
    overrides: dict[date, str],
) -> bool:
    """overrides: date -> 'holiday' | 'working_day' (from FactoryCalendarOverride)."""
    o = overrides.get(d)
    if o == "holiday":
        return False
    if o == "working_day":
        return True
    wd = d.weekday()
    return wd not in _weekend_set(weekend_days)


def add_working_days(
    start: date,
    working_days: int,
    *,
    weekend_days: list[str] | None,
    overrides: dict[date, str],
) -> date:
    """Add N working days starting from start (inclusive)."""
    if working_days <= 0:
        return start
    cur = start
    remaining = working_days - 1
    while remaining > 0:
        cur += timedelta(days=1)
        if is_working_day(cur, weekend_days=weekend_days, overrides=overrides):
            remaining -= 1
    return cur


def count_working_days_between(
    start: date,
    end: date,
    *,
    weekend_days: list[str] | None,
    overrides: dict[date, str],
) -> int:
    """Inclusive count of working days from start to end."""
    if end < start:
        return 0
    n = 0
    cur = start
    while cur <= end:
        if is_working_day(cur, weekend_days=weekend_days, overrides=overrides):
            n += 1
        cur += timedelta(days=1)
    return n


def net_shift_minutes(start_time: Any, end_time: Any, break_minutes: int) -> float:
    """Compute duration in minutes between two time objects, minus break."""
    if not start_time or not end_time:
        return 480.0
    t0 = dt.datetime.combine(date.today(), start_time)
    t1 = dt.datetime.combine(date.today(), end_time)
    if t1 <= t0:
        t1 += timedelta(days=1)
    delta = (t1 - t0).total_seconds() / 60.0
    return max(0.0, float(delta) - float(break_minutes or 0))
