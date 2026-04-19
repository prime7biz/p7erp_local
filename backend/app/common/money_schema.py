"""Pydantic BeforeValidators for string money fields (Phase 3A — pre–Numeric migration)."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any

from pydantic import BeforeValidator

from app.common.money import format_money, format_pct, format_rate, parse_money


def _strict_money_optional(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    d = parse_money(v)
    if d is None:
        raise ValueError("Invalid monetary amount")
    return format_money(d)


def _strict_rate_optional(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    d = parse_money(v)
    if d is None:
        raise ValueError("Invalid exchange rate")
    return format_rate(d)


def _strict_pct_optional(v: Any) -> str | None:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    d = parse_money(v)
    if d is None:
        raise ValueError("Invalid percentage value")
    return format_pct(d)


def _line_money_coerce(v: Any) -> str:
    """Costing lines: normalize; unparseable legacy values fall back to 0 (avoid breaking GET/PUT)."""
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return format_money(Decimal("0")) or "0.0000"
    d = parse_money(v)
    if d is None:
        return format_money(Decimal("0")) or "0.0000"
    return format_money(d) or "0.0000"


def _line_rate_coerce(v: Any) -> str:
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return format_rate(Decimal("1")) or "1.000000"
    d = parse_money(v)
    if d is None:
        return format_rate(Decimal("1")) or "1.000000"
    return format_rate(d) or "1.000000"


def _line_pct_coerce(v: Any) -> str:
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return format_pct(Decimal("0")) or "0.0000"
    d = parse_money(v)
    if d is None:
        return format_pct(Decimal("0")) or "0.0000"
    return format_pct(d) or "0.0000"


def _line_fabric_factor_coerce(v: Any) -> str:
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return format_money(Decimal("1")) or "1.0000"
    d = parse_money(v)
    if d is None:
        return format_money(Decimal("1")) or "1.0000"
    return format_money(d) or "1.0000"


# Inquiry / quotation headers (optional)
MoneyStrOpt = Annotated[str | None, BeforeValidator(_strict_money_optional)]
RateStrOpt = Annotated[str | None, BeforeValidator(_strict_rate_optional)]
PctStrOpt = Annotated[str | None, BeforeValidator(_strict_pct_optional)]

# Costing lines (required string with defaults)
MoneyLineStr = Annotated[str, BeforeValidator(_line_money_coerce)]
RateLineStr = Annotated[str, BeforeValidator(_line_rate_coerce)]
PctLineStr = Annotated[str, BeforeValidator(_line_pct_coerce)]
FabricFactorLineStr = Annotated[str, BeforeValidator(_line_fabric_factor_coerce)]
