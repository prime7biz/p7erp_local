"""Small Decimal helpers: every number we return is a Decimal string, never a float."""
from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

ZERO = Decimal("0")


def to_dec(value: Any) -> Decimal | None:
    """Convert DB numbers (Decimal / int / float / str) to Decimal. None, bad input, NaN or Infinity gives None."""
    if value is None:
        return None
    if isinstance(value, Decimal):
        return value if value.is_finite() else None
    try:
        d = Decimal(str(value).strip())
    except Exception:  # noqa: BLE001 - bad text is treated as "missing"
        return None
    return d if d.is_finite() else None


def quant(value: Decimal, places: int = 2) -> Decimal:
    step = Decimal(1).scaleb(-places)
    return value.quantize(step, rounding=ROUND_HALF_UP)


def dec_str(value: Decimal | None, places: int = 2) -> str | None:
    """Fixed-rounding decimal string, e.g. Decimal('691.2') -> '691.20'. None stays None."""
    if value is None:
        return None
    return format(quant(value, places), "f")
