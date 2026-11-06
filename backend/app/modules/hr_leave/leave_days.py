"""Leave day counting and validation, shared by HR leave and Employee Self-Service (ESS).

The server decides how many days a leave request uses:
- every date from ``from_date`` to ``to_date`` (inclusive) counts,
- except weekly off days (weekend) and company holidays,
- a single working day may be requested as a half day (0.5).

Weekend days:
1. ``tenants.feature_flags["hr_weekend_days"]`` (HR setting, e.g. ``["friday", "saturday"]``),
2. otherwise Friday only (Bangladesh weekly holiday).
The production planning calendar is not used here: its weekend defaults to Friday + Saturday for
every tenant that opens Production settings, which is not an HR decision.

Holidays come from HR attendance holidays (``hr_attendance_holidays``); optional holidays still count
as working days. Factory-calendar holidays marked "affects HR" are synced into that table.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AttendanceHoliday, Employee, LeaveRequest

HR_WEEKEND_DAYS_KEY = "hr_weekend_days"
DEFAULT_WEEKEND_DAYS = ("friday",)
# Requests in these statuses block another request on the same dates.
BLOCKING_LEAVE_STATUSES = ("PENDING", "APPROVED")
HALF_DAY = Decimal("0.5")

_WEEKDAY_NUMBERS = {
    "monday": 0,
    "tuesday": 1,
    "wednesday": 2,
    "thursday": 3,
    "friday": 4,
    "saturday": 5,
    "sunday": 6,
}


def weekday_numbers(day_names: Any) -> set[int]:
    """["friday", "saturday"] -> {4, 5}. Unknown names are ignored."""
    if not isinstance(day_names, (list, tuple)):
        return set()
    out: set[int] = set()
    for name in day_names:
        key = str(name or "").strip().lower()
        if key in _WEEKDAY_NUMBERS:
            out.add(_WEEKDAY_NUMBERS[key])
    return out


async def load_weekend_weekdays(db: AsyncSession, tenant: Any) -> set[int]:
    """Weekday numbers (Monday=0) that are weekly off days for this tenant."""
    flags = getattr(tenant, "feature_flags", None)
    if isinstance(flags, dict):
        override = weekday_numbers(flags.get(HR_WEEKEND_DAYS_KEY))
        if override:
            return override
    return weekday_numbers(list(DEFAULT_WEEKEND_DAYS))


async def load_holiday_dates(db: AsyncSession, tenant_id: int, start: date, end: date) -> set[date]:
    """Company (non-optional) holidays between start and end, inclusive."""
    rows = (
        await db.execute(
            select(AttendanceHoliday.holiday_date).where(
                AttendanceHoliday.tenant_id == tenant_id,
                AttendanceHoliday.holiday_date >= start,
                AttendanceHoliday.holiday_date <= end,
                AttendanceHoliday.is_optional.is_(False),
            )
        )
    ).scalars().all()
    return set(rows)


def each_date(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


async def non_working_dates(db: AsyncSession, tenant: Any, start: date, end: date) -> set[date]:
    """Weekend days and company holidays between start and end, inclusive."""
    if end < start:
        return set()
    weekend = await load_weekend_weekdays(db, tenant)
    holidays = await load_holiday_dates(db, tenant.id, start, end)
    return {d for d in each_date(start, end) if d.weekday() in weekend or d in holidays}


def _parse_requested_days(value: Any) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        parsed = Decimal(str(value).strip())
    except (InvalidOperation, ValueError):
        return None
    return parsed if parsed.is_finite() else None


async def count_leave_days(
    db: AsyncSession,
    tenant: Any,
    from_date: date,
    to_date: date,
    requested_days: Any = None,
) -> Decimal:
    """Validate the date range and return the number of leave days (server-calculated).

    ``requested_days`` from the client is ignored, except "0.5" on a single working day (half day).
    Raises HTTP 400 with a clear message when the dates are not allowed.
    """
    if to_date < from_date:
        raise HTTPException(status_code=400, detail="to_date must be on or after from_date")
    if from_date.year != to_date.year:
        raise HTTPException(
            status_code=400,
            detail="Leave cannot cross the year end; please apply separately for each year",
        )
    off_days = await non_working_dates(db, tenant, from_date, to_date)
    working_days = sum(1 for d in each_date(from_date, to_date) if d not in off_days)
    if working_days == 0:
        raise HTTPException(
            status_code=400,
            detail="The selected dates are all weekends or holidays, so there are no leave days to apply for",
        )
    if working_days == 1 and from_date == to_date and _parse_requested_days(requested_days) == HALF_DAY:
        return HALF_DAY
    return Decimal(working_days)


async def assert_no_overlapping_leave(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee_id: int,
    from_date: date,
    to_date: date,
    exclude_request_id: int | None = None,
) -> None:
    """Reject dates that overlap the employee's own pending/approved leave (HTTP 409)."""
    # Lock the employee row so two requests sent at the same time cannot both pass this check.
    await db.execute(select(Employee.id).where(Employee.id == employee_id).with_for_update())
    stmt = select(LeaveRequest).where(
        LeaveRequest.tenant_id == tenant_id,
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.status.in_(BLOCKING_LEAVE_STATUSES),
        LeaveRequest.from_date <= to_date,
        LeaveRequest.to_date >= from_date,
    )
    if exclude_request_id is not None:
        stmt = stmt.where(LeaveRequest.id != exclude_request_id)
    clash = (await db.execute(stmt.order_by(LeaveRequest.from_date).limit(1))).scalars().first()
    if clash is not None:
        raise HTTPException(
            status_code=409,
            detail=(
                f"These dates overlap an existing {clash.status.lower()} leave request "
                f"({clash.from_date.isoformat()} to {clash.to_date.isoformat()})"
            ),
        )


async def validate_leave_request(
    db: AsyncSession,
    *,
    tenant: Any,
    employee_id: int,
    from_date: date,
    to_date: date,
    requested_days: Any = None,
    exclude_request_id: int | None = None,
) -> Decimal:
    """All leave-request date rules in one place; returns the server-calculated number of days."""
    days = await count_leave_days(db, tenant, from_date, to_date, requested_days)
    await assert_no_overlapping_leave(
        db,
        tenant_id=tenant.id,
        employee_id=employee_id,
        from_date=from_date,
        to_date=to_date,
        exclude_request_id=exclude_request_id,
    )
    return days
