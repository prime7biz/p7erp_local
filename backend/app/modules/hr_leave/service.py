"""Leave accrual and policy helpers."""

from __future__ import annotations


def days_between_inclusive(start, end) -> int:
    """Inclusive calendar days between two dates."""
    return (end - start).days + 1
