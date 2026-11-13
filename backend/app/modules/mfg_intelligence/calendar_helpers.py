"""Read-only factory calendar helpers (working days and net shift minutes).

Wraps `production.calendar_service` (pure functions only). Unlike the legacy advisory formula this module never
falls back to 480 minutes: a shift without times has no minutes (the caller reports UNKNOWN).
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FactoryCalendarOverride, ProductionShift, TenantProductionSettings
from app.modules.mfg_intelligence.decimals import quant
from app.modules.production.calendar_service import is_working_day, net_shift_minutes

MAX_WINDOW_DAYS = 180
# How far ahead we look for "the first working day" before giving up.
FIRST_WORKING_DAY_HORIZON = 366


@dataclass
class CalendarContext:
    """Weekend setting + holiday / working-day overrides for one tenant over a date range."""

    weekend_days: list[str] | None = None
    overrides: dict[date, str] = field(default_factory=dict)

    def is_working(self, d: date) -> bool:
        return is_working_day(d, weekend_days=self.weekend_days, overrides=self.overrides)

    def working_days(self, start: date, end: date) -> list[date]:
        out: list[date] = []
        cur = start
        while cur <= end:
            if self.is_working(cur):
                out.append(cur)
            cur += timedelta(days=1)
        return out

    def first_working_on_or_after(self, d: date, horizon_days: int = FIRST_WORKING_DAY_HORIZON) -> date | None:
        cur = d
        for _ in range(horizon_days + 1):
            if self.is_working(cur):
                return cur
            cur += timedelta(days=1)
        return None


async def load_calendar(db: AsyncSession, tenant_id: int, start: date, end: date) -> CalendarContext:
    """Tenant weekend days plus the overrides that fall in [start, end] (bounded query)."""
    row = (
        await db.execute(select(TenantProductionSettings).where(TenantProductionSettings.tenant_id == tenant_id))
    ).scalar_one_or_none()
    weekend_days: list[str] | None = None
    if row is not None and isinstance(row.weekend_days, list):
        weekend_days = [str(x) for x in row.weekend_days]
    ov_rows = (
        await db.execute(
            select(FactoryCalendarOverride.override_date, FactoryCalendarOverride.override_type).where(
                FactoryCalendarOverride.tenant_id == tenant_id,
                FactoryCalendarOverride.override_date >= start,
                FactoryCalendarOverride.override_date <= end,
            )
        )
    ).all()
    return CalendarContext(weekend_days=weekend_days, overrides={d: t for d, t in ov_rows})


def shift_net_minutes(shift: Any) -> Decimal | None:
    """Net minutes of one shift after the break. None when times are missing or the result is not positive."""
    if shift is None or not getattr(shift, "start_time", None) or not getattr(shift, "end_time", None):
        return None
    minutes = Decimal(str(net_shift_minutes(shift.start_time, shift.end_time, int(shift.break_minutes or 0))))
    minutes = quant(minutes, 4)
    return minutes if minutes > 0 else None


async def load_active_shifts(db: AsyncSession, tenant_id: int) -> dict[int, ProductionShift]:
    rows = (
        await db.execute(
            select(ProductionShift).where(ProductionShift.tenant_id == tenant_id, ProductionShift.is_active.is_(True))
        )
    ).scalars().all()
    return {s.id: s for s in rows}
