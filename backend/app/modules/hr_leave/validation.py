"""Shared leave request checks (HR leave router and ESS self-service)."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import LeaveRequest

HALF_DAY = Decimal("0.5")
# Statuses that hold a leave balance and block other requests on the same dates.
ACTIVE_LEAVE_STATUSES = ("PENDING", "APPROVED")


def normalize_leave_days(raw: object) -> str:
    """Positive number of days in half-day steps, e.g. "1", "0.5", "2.5". Raises ValueError."""
    try:
        days = Decimal(str(raw).strip())
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("days_requested must be a number") from exc
    if not days.is_finite() or days <= 0:
        raise ValueError("days_requested must be greater than 0")
    if days % HALF_DAY != 0:
        raise ValueError("days_requested must be in half-day steps (0.5, 1, 1.5, ...)")
    return format(days.normalize(), "f")


def assert_leave_dates_and_days(from_date: date, to_date: date, days_requested: object) -> None:
    if to_date < from_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="to_date cannot be before from_date")
    span = (to_date - from_date).days + 1
    try:
        days = Decimal(str(days_requested))
    except (InvalidOperation, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="days_requested must be a number")
    if days > span:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"days_requested ({days}) cannot exceed the {span} day(s) between from_date and to_date",
        )


async def assert_no_overlapping_leave(
    db: AsyncSession,
    *,
    tenant_id: int,
    employee_id: int,
    from_date: date,
    to_date: date,
    exclude_request_id: int | None = None,
) -> None:
    stmt = select(LeaveRequest.id).where(
        LeaveRequest.tenant_id == tenant_id,
        LeaveRequest.employee_id == employee_id,
        LeaveRequest.status.in_(ACTIVE_LEAVE_STATUSES),
        LeaveRequest.from_date <= to_date,
        LeaveRequest.to_date >= from_date,
    )
    if exclude_request_id is not None:
        stmt = stmt.where(LeaveRequest.id != exclude_request_id)
    clash = (await db.execute(stmt.limit(1))).scalar_one_or_none()
    if clash is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"These dates overlap leave request #{clash} that is already pending or approved",
        )
