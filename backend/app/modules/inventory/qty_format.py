"""Decimal helpers for stock quantities (4 decimal places, never scientific notation)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

QTY_STEP = Decimal("0.0001")
ZERO = Decimal("0")


def to_qty_decimal(value: Any) -> Decimal:
    """Parse a quantity from Decimal / float / int / str. Blank or invalid input -> 0."""
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        return Decimal(repr(value))
    try:
        text = str(value).strip().replace(",", "")
        return Decimal(text) if text else ZERO
    except (InvalidOperation, ValueError):
        return ZERO


def quantize_qty(value: Any) -> Decimal:
    return to_qty_decimal(value).quantize(QTY_STEP, rounding=ROUND_HALF_UP)


def format_qty(value: Any) -> str:
    """Quantity as a plain string: 12345.6789 -> "12345.6789", 100 -> "100", 0.5 -> "0.5"."""
    text = format(quantize_qty(value), "f")
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    if text in ("", "-0"):
        return "0"
    return text
