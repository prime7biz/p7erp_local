"""Canonical parsing/formatting for commercial string amounts (Phase 3A — pre–DB migration).

Use these helpers in services and Pydantic validators so money logic is consistent before columns become Numeric.
"""

from __future__ import annotations

import re
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Any

# Precision targets for future Numeric columns
MONEY_PRECISION = (18, 4)
RATE_PRECISION = (18, 6)
PCT_PRECISION = (10, 4)


def parse_money(val: str | int | float | Decimal | None) -> Decimal | None:
    """Parse user/API string to Decimal; empty/whitespace → None. Commas stripped."""
    if val is None:
        return None
    if isinstance(val, Decimal):
        return val
    if isinstance(val, (int, float)):
        try:
            return Decimal(str(val))
        except (InvalidOperation, ValueError, TypeError):
            return None
    s = str(val).strip()
    if not s:
        return None
    s = s.replace(",", "").replace(" ", "")
    if s.startswith("(") and s.endswith(")"):
        s = "-" + s[1:-1]
    try:
        return Decimal(s)
    except (InvalidOperation, ValueError, TypeError):
        return None


def format_money(val: Decimal | str | int | float | None, *, quantize: str = "0.0001") -> str | None:
    """Serialize Decimal to string for backward-compatible JSON (matches legacy string headers)."""
    if val is None:
        return None
    if not isinstance(val, Decimal):
        val = parse_money(val)
    if val is None:
        return None
    try:
        q = Decimal(quantize)
        return str(val.quantize(q))
    except (InvalidOperation, ValueError, TypeError):
        return None


def format_rate(val: Decimal | str | int | float | None) -> str | None:
    """FX / unit rates — 6 decimal places (RATE_PRECISION)."""
    return format_money(val, quantize="0.000001")


def format_pct(val: Decimal | None) -> str | None:
    """Percentages — 4 decimal places (PCT_PRECISION)."""
    return format_money(val, quantize="0.0001")


def safe_decimal(val: Any, *, default: Decimal = Decimal("0")) -> Decimal:
    """Never raises; returns default if unparsable."""
    p = parse_money(val)
    return p if p is not None else default


def is_plausible_money_string(s: str | None) -> bool:
    """True if string looks like a finite decimal number (for profiling dirty data)."""
    if s is None or not str(s).strip():
        return True
    t = str(s).strip().replace(",", "")
    return bool(re.fullmatch(r"-?\d+(\.\d+)?", t))


def quantize_line_money(d: Decimal) -> Decimal:
    """Quotation costing line money fields (numeric(18,4))."""
    return d.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def quantize_line_rate(d: Decimal) -> Decimal:
    """FX / consumption-per-dozen (numeric(18,6))."""
    return d.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)


def quantize_line_pct(d: Decimal) -> Decimal:
    """Line percentage fields (numeric(10,4))."""
    return d.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def line_money_from_input(val: Any) -> Decimal:
    """Persisted line money from API/JSON (4 dp)."""
    return quantize_line_money(safe_decimal(val, default=Decimal("0")))


def line_rate_from_input(val: Any, *, default: Decimal = Decimal("1")) -> Decimal:
    """Line exchange_rate etc. (6 dp); empty → default (usually 1)."""
    p = parse_money(val)
    return quantize_line_rate(p if p is not None else default)


def line_consumption_from_input(val: Any) -> Decimal:
    """Material consumption_per_dozen (6 dp)."""
    return quantize_line_rate(safe_decimal(val, default=Decimal("0")))


def line_pct_from_input(val: Any) -> Decimal:
    """Other-cost percentage (4 dp on 10,4 column)."""
    return quantize_line_pct(safe_decimal(val, default=Decimal("0")))


def fabric_factor_from_input(val: Any) -> Decimal:
    """Size ratio fabric_factor; empty → 1."""
    p = parse_money(val)
    return quantize_line_money(p if p is not None else Decimal("1"))
