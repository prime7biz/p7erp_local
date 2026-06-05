"""SQLAlchemy Numeric column helpers and API ↔ ORM conversion (go-live remediation)."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from sqlalchemy import Numeric

from app.common.money import (
    MONEY_PRECISION,
    PCT_PRECISION,
    RATE_PRECISION,
    format_money,
    format_pct,
    format_rate,
    parse_money,
    safe_decimal,
)

MONEY_NUMERIC = Numeric(*MONEY_PRECISION)
RATE_NUMERIC = Numeric(*RATE_PRECISION)
PCT_NUMERIC = Numeric(*PCT_PRECISION)
QTY_NUMERIC = Numeric(*MONEY_PRECISION)


def money_default() -> Decimal:
    return Decimal("0")


def rate_default() -> Decimal:
    return Decimal("1")


def api_money_to_decimal(value: str | Decimal | float | int | None, *, default: Decimal | None = None) -> Decimal:
    if default is None:
        default = money_default()
    return safe_decimal(value, default=default)


def api_rate_to_decimal(value: str | Decimal | float | int | None) -> Decimal:
    return safe_decimal(value, default=rate_default())


def decimal_to_money_response(value: Any) -> str:
    return format_money(value) or "0.0000"


def decimal_to_rate_response(value: Any) -> str:
    return format_rate(value) or "1.000000"


def decimal_to_pct_response(value: Any) -> str:
    return format_pct(parse_money(value)) or "0.0000"
