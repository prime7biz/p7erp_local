"""Pydantic BeforeValidators for string money fields (Phase 3A — pre–Numeric migration)."""

from __future__ import annotations

from decimal import Decimal
from typing import Annotated, Any

from pydantic import BeforeValidator

from app.common.inventory_validation import (
    validate_non_negative_money_str,
    validate_non_negative_qty_str,
)
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


def _strict_money_nonneg(v: Any) -> str:
    normalized = _strict_money_optional(v)
    if normalized is None:
        return format_money(parse_money("0")) or "0.0000"
    return validate_non_negative_money_str(normalized, "amount")


def _strict_money_nonneg_optional(v: Any) -> str | None:
    normalized = _strict_money_optional(v)
    if normalized is None:
        return None
    return validate_non_negative_money_str(normalized, "amount")


def _strict_rate_nonneg(v: Any) -> str:
    normalized = _strict_rate_optional(v)
    if normalized is None:
        return format_rate(parse_money("1")) or "1.000000"
    return validate_non_negative_money_str(normalized, "exchange_rate")


def _strict_rate_nonneg_optional(v: Any) -> str | None:
    normalized = _strict_rate_optional(v)
    if normalized is None:
        return None
    return validate_non_negative_money_str(normalized, "exchange_rate")


def _strict_qty_nonneg(v: Any) -> str:
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return format_money(parse_money("0")) or "0.0000"
    d = parse_money(v)
    if d is None:
        raise ValueError("Invalid quantity")
    formatted = format_money(d) or "0.0000"
    return validate_non_negative_qty_str(formatted, "quantity")


def _strict_qty_nonneg_optional(v: Any) -> str | None:
    if v is None or (isinstance(v, str) and not str(v).strip()):
        return None
    d = parse_money(v)
    if d is None:
        raise ValueError("Invalid quantity")
    formatted = format_money(d) or "0.0000"
    return validate_non_negative_qty_str(formatted, "quantity")


def _line_money_nonneg_coerce(v: Any) -> str:
    base = _line_money_coerce(v)
    return validate_non_negative_money_str(base, "amount")


def _line_qty_nonneg_coerce(v: Any) -> str:
    base = _line_money_coerce(v)
    return validate_non_negative_qty_str(base, "quantity")


# Inquiry / quotation headers (optional)
MoneyStrOpt = Annotated[str | None, BeforeValidator(_strict_money_optional)]
RateStrOpt = Annotated[str | None, BeforeValidator(_strict_rate_optional)]
PctStrOpt = Annotated[str | None, BeforeValidator(_strict_pct_optional)]

# Non-negative money/qty (finance, inventory, HR write paths)
MoneyStrNonNeg = Annotated[str, BeforeValidator(_strict_money_nonneg)]
MoneyStrNonNegOpt = Annotated[str | None, BeforeValidator(_strict_money_nonneg_optional)]
RateStrNonNeg = Annotated[str, BeforeValidator(_strict_rate_nonneg)]
RateStrNonNegOpt = Annotated[str | None, BeforeValidator(_strict_rate_nonneg_optional)]
QtyStrNonNeg = Annotated[str, BeforeValidator(_strict_qty_nonneg)]
QtyStrNonNegOpt = Annotated[str | None, BeforeValidator(_strict_qty_nonneg_optional)]
MoneyLineNonNegStr = Annotated[str, BeforeValidator(_line_money_nonneg_coerce)]
QtyLineNonNegStr = Annotated[str, BeforeValidator(_line_qty_nonneg_coerce)]

# Costing lines (required string with defaults)
MoneyLineStr = Annotated[str, BeforeValidator(_line_money_coerce)]
RateLineStr = Annotated[str, BeforeValidator(_line_rate_coerce)]
PctLineStr = Annotated[str, BeforeValidator(_line_pct_coerce)]
FabricFactorLineStr = Annotated[str, BeforeValidator(_line_fabric_factor_coerce)]
