"""Money helpers for Manufacturing Intelligence Phase 3 (cost at completion, cash requirement). Read-only, pure.

Rules (doc 14 sections 3, 12 #12, 13 Q7):
- Every amount is a Decimal, rounded to 4 decimals (ROUND_HALF_UP) and returned as a decimal string.
- Float `Numeric` columns are read through `Decimal(str(value))`, never through float arithmetic.
- Every value carries a class (ACTUAL / COMMITTED / ESTIMATED / FORECAST), a source, the source currency + amount,
  the rate used and where the rate came from. A foreign amount without a stored rate is UNKNOWN: its base amount
  is None, it is left out of every total and listed per currency (`unknown_by_currency`). No rate is ever guessed.
"""
from __future__ import annotations

from collections import defaultdict
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Iterable

from app.modules.mfg_intelligence.decimals import ZERO, to_dec

Q4 = Decimal("0.0001")
ONE = Decimal("1")
HUNDRED = Decimal("100")

CLASS_ACTUAL = "ACTUAL"
CLASS_COMMITTED = "COMMITTED"
CLASS_ESTIMATED = "ESTIMATED"
CLASS_FORECAST = "FORECAST"

RATE_BASE_CURRENCY = "BASE_CURRENCY"
RATE_UNKNOWN = "UNKNOWN"
RATE_AS_RECORDED = "AS_RECORDED"  # bill-wise sources without a currency column (amounts as recorded, like finance)


def q4(value: Decimal) -> Decimal:
    return value.quantize(Q4, rounding=ROUND_HALF_UP)


def m4(value: Decimal | None) -> str | None:
    return format(q4(value), "f") if value is not None else None


def positive(value: Any) -> Decimal | None:
    d = to_dec(value)
    return d if d is not None and d.is_finite() and d > ZERO else None


def norm_ccy(value: Any) -> str | None:
    text = (str(value).strip().upper() if value is not None else "")[:10]
    return text or None


def base_currency(tenant: Any) -> str:
    return norm_ccy(getattr(tenant, "base_currency", None)) or "BDT"


def fx(currency: str | None, base: str, stored_rate: Any, rate_source: str) -> tuple[Decimal | None, str]:
    """(rate, rate source). Base currency = 1; otherwise the stored rate when > 0; else (None, UNKNOWN)."""
    ccy = norm_ccy(currency) or base
    if ccy == base:
        return ONE, RATE_BASE_CURRENCY
    rate = positive(stored_rate)
    if rate is not None:
        return rate, rate_source
    return None, RATE_UNKNOWN


def to_base(amount: Decimal | None, rate: Decimal | None) -> Decimal | None:
    if amount is None or rate is None:
        return None
    return q4(amount * rate)


def value_out(
    amount: Decimal | None,
    value_class: str,
    source: str | None,
    *,
    currency: str | None = None,
    source_amount: Decimal | None = None,
    rate: Decimal | None = None,
    rate_source: str | None = None,
    reason_codes: Iterable[str] = (),
    missing_inputs: Iterable[str] = (),
) -> dict[str, Any]:
    return {
        "amount": m4(amount),
        "value_class": value_class,
        "source": source,
        "currency": currency,
        "source_amount": m4(source_amount),
        "rate": format(rate.normalize(), "f") if rate is not None else None,
        "rate_source": rate_source,
        "reason_codes": list(dict.fromkeys(reason_codes)),
        "missing_inputs": list(dict.fromkeys(missing_inputs)),
    }


class UnknownByCurrency:
    """Source amounts left out of the totals because their currency has no stored rate."""

    def __init__(self) -> None:
        self._amounts: dict[str, Decimal] = defaultdict(lambda: ZERO)

    def add(self, currency: str | None, amount: Decimal | None) -> None:
        if amount is None:
            return
        self._amounts[norm_ccy(currency) or "UNKNOWN"] += amount

    def __bool__(self) -> bool:
        return bool(self._amounts)

    def as_dict(self) -> dict[str, str]:
        return {k: format(q4(v), "f") for k, v in sorted(self._amounts.items())}
