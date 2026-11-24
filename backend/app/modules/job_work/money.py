"""Decimal money/qty helpers for inbound job work (never float)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from fastapi import HTTPException

ZERO = Decimal("0")
Q4 = Decimal("0.0001")
Q2 = Decimal("0.01")
RATE_Q = Decimal("0.000001")


def d(value: object, *, field: str = "amount") -> Decimal:
    if value is None or value == "":
        return ZERO
    if isinstance(value, Decimal):
        raw = value
    else:
        try:
            raw = Decimal(str(value).replace(",", "").strip())
        except (InvalidOperation, ValueError) as exc:
            raise HTTPException(status_code=400, detail=f"Invalid {field}") from exc
    if not raw.is_finite():
        raise HTTPException(status_code=400, detail=f"Invalid {field}")
    return raw


def q4(value: object, *, field: str = "qty") -> Decimal:
    return d(value, field=field).quantize(Q4, rounding=ROUND_HALF_UP)


def money2(value: object, *, field: str = "amount") -> Decimal:
    return d(value, field=field).quantize(Q2, rounding=ROUND_HALF_UP)


def rate6(value: object) -> Decimal:
    r = d(value, field="exchange_rate").quantize(RATE_Q, rounding=ROUND_HALF_UP)
    if r <= ZERO:
        raise HTTPException(status_code=400, detail="exchange_rate must be greater than zero")
    return r


def s4(value: Decimal) -> str:
    return str(q4(value))


def s2(value: Decimal) -> str:
    return str(money2(value))
