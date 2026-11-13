"""Owner rule: which orders count as confirmed demand.

Confirmed = `orders.status` is NEW, CONFIRMED or IN_PROGRESS (case-insensitive).
DRAFT, CANCELLED, COMPLETED and any other value are NOT confirmed. `pipeline_status` is not used.
"""
from __future__ import annotations

from sqlalchemy import func

from app.models import Order

CONFIRMED_ORDER_STATUSES: tuple[str, ...] = ("NEW", "CONFIRMED", "IN_PROGRESS")


def is_confirmed_status(status: str | None) -> bool:
    return (status or "").strip().upper() in CONFIRMED_ORDER_STATUSES


def confirmed_status_clause():
    """SQL condition for use in `.where(...)` on the Order table."""
    return func.upper(func.trim(Order.status)).in_(CONFIRMED_ORDER_STATUSES)
