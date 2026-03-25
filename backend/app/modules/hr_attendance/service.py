"""HR attendance domain services (overtime calculations, bulk import helpers)."""

from __future__ import annotations


def overtime_hours_to_amount(hours: float, hourly_rate: float, multiplier: float) -> float:
    """Convert OT hours to amount using a simple multiplier."""
    return round(hours * hourly_rate * multiplier, 2)
