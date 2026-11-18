"""Pure COA interest math (no DB). Amounts are Decimal, ROUND_HALF_UP to 4 dp."""

from __future__ import annotations

from calendar import monthrange
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from typing import Literal

AMOUNT_Q = Decimal("0.0001")
FACTOR_Q = Decimal("0.00000001")
ZERO = Decimal("0")
MIN_INTEREST = Decimal("0.01")

Basis = Literal["simple", "compound"]
Method = Literal["monthly_fixed", "yearly_fixed", "yearly_rate"]
Frequency = Literal["monthly", "quarterly"]
Nature = Literal["Asset", "Liability"]

ALLOWED_BASIS = frozenset({"simple", "compound"})
ALLOWED_METHODS = frozenset({"monthly_fixed", "yearly_fixed", "yearly_rate"})
ALLOWED_FREQUENCIES = frozenset({"monthly", "quarterly"})
ALLOWED_NATURES = frozenset({"asset", "liability"})


def to_decimal(value: object) -> Decimal:
    if isinstance(value, Decimal):
        d = value
    else:
        raw = str(value if value is not None else "").replace(",", "").strip() or "0"
        try:
            d = Decimal(raw)
        except InvalidOperation as exc:
            raise ValueError(f"Invalid decimal: {value!r}") from exc
    if not d.is_finite():
        raise ValueError(f"Invalid decimal: {value!r}")
    return d


def q4(value: object) -> Decimal:
    return to_decimal(value).quantize(AMOUNT_Q, rounding=ROUND_HALF_UP)


def q_factor(value: object) -> Decimal:
    return to_decimal(value).quantize(FACTOR_Q, rounding=ROUND_HALF_UP)


def _last_day(year: int, month: int) -> date:
    return date(year, month, monthrange(year, month)[1])


def period_key_for(d: date, frequency: str) -> str:
    freq = (frequency or "").strip().lower()
    if freq == "monthly":
        return f"{d.year:04d}-{d.month:02d}"
    if freq == "quarterly":
        q = (d.month - 1) // 3 + 1
        return f"{d.year:04d}-Q{q}"
    raise ValueError(f"Unsupported frequency: {frequency}")


def period_bounds(period_key: str) -> tuple[date, date]:
    key = (period_key or "").strip().upper()
    if len(key) == 7 and key[4:6] == "-Q":
        year = int(key[:4])
        q = int(key[6])
        if q < 1 or q > 4:
            raise ValueError(f"Invalid period key: {period_key}")
        start_month = (q - 1) * 3 + 1
        end_month = start_month + 2
        return date(year, start_month, 1), _last_day(year, end_month)
    if len(key) == 7 and key[4] == "-" and key[5:7].isdigit():  # YYYY-MM
        year = int(key[:4])
        month = int(key[5:7])
        return date(year, month, 1), _last_day(year, month)
    raise ValueError(f"Invalid period key: {period_key}")


def days_inclusive(start: date, end: date) -> int:
    if end < start:
        return 0
    return (end - start).days + 1


def proration_factor(*, activation: date, period_start: date, period_end: date) -> Decimal:
    """First-period days-from-activation / days-in-period. Full period otherwise."""
    if activation > period_end:
        return ZERO
    total = days_inclusive(period_start, period_end)
    if total <= 0:
        return ZERO
    if activation <= period_start:
        return Decimal("1")
    used = days_inclusive(activation, period_end)
    return q_factor(Decimal(used) / Decimal(total))


def periods_per_year(frequency: str) -> int:
    freq = (frequency or "").strip().lower()
    if freq == "monthly":
        return 12
    if freq == "quarterly":
        return 4
    raise ValueError(f"Unsupported frequency: {frequency}")


def full_period_interest(
    *,
    method: str,
    frequency: str,
    base_balance: Decimal,
    rate_yearly: Decimal | None,
    fixed_amount: Decimal | None,
) -> Decimal:
    method_l = (method or "").strip().lower()
    freq = (frequency or "").strip().lower()
    if method_l == "monthly_fixed":
        if freq != "monthly":
            raise ValueError("monthly_fixed requires monthly frequency")
        return q4(fixed_amount or ZERO)
    if method_l == "yearly_fixed":
        amt = to_decimal(fixed_amount or ZERO)
        return q4(amt / Decimal(periods_per_year(freq)))
    if method_l == "yearly_rate":
        rate = to_decimal(rate_yearly or ZERO)
        if rate <= 0:
            return ZERO
        return q4(base_balance * (rate / Decimal("100")) / Decimal(periods_per_year(freq)))
    raise ValueError(f"Unsupported method: {method}")


def apply_proration(full_amount: Decimal, factor: Decimal) -> Decimal:
    if factor <= 0:
        return ZERO
    if factor >= 1:
        return q4(full_amount)
    return q4(to_decimal(full_amount) * to_decimal(factor))


def balance_eligible(*, nature: str, balance: Decimal) -> bool:
    """Liability accrues only on credit (positive for credit-normal); Asset only on debit."""
    n = (nature or "").strip().lower()
    bal = to_decimal(balance)
    if bal < MIN_INTEREST:
        return False
    if n == "liability":
        return True  # caller already expressed balance in normal (credit) direction
    if n == "asset":
        return True
    return False


def completed_period_keys(
    *,
    frequency: str,
    activation: date,
    as_of: date,
    max_periods: int = 12,
) -> list[str]:
    """Completed periods ending on/before as_of-1 day, starting from activation's period, oldest first."""
    if as_of <= activation:
        # Need at least one day after activation inside a completed period.
        pass
    # Last completed period is the one whose end is before as_of (strict: period must be finished).
    yesterday = as_of - timedelta(days=1)
    if yesterday < activation:
        return []

    keys: list[str] = []
    # Walk forward from activation period.
    cursor = activation
    while True:
        key = period_key_for(cursor, frequency)
        _start, end = period_bounds(key)
        if end > yesterday:
            break
        if end >= activation:
            keys.append(key)
        # Advance to first day of next period
        cursor = end + timedelta(days=1)
        if len(keys) > 600:  # hard safety (~50 years monthly); trimmed to max_periods below
            break
    # Keep the newest completed periods so catch-up advances (oldest-first would stall forever).
    if len(keys) > max_periods:
        return keys[-max_periods:]
    return keys


@dataclass(frozen=True)
class InterestPreview:
    period_key: str
    period_start: date
    period_end: date
    base_balance: Decimal
    proration_factor: Decimal
    full_amount: Decimal
    interest_amount: Decimal
    skip_reason: str | None = None


def compute_period_interest(
    *,
    method: str,
    frequency: str,
    base_balance: Decimal,
    rate_yearly: Decimal | None,
    fixed_amount: Decimal | None,
    activation: date,
    period_key: str,
    nature: str,
) -> InterestPreview:
    start, end = period_bounds(period_key)
    factor = proration_factor(activation=activation, period_start=start, period_end=end)
    if factor <= 0:
        return InterestPreview(
            period_key=period_key,
            period_start=start,
            period_end=end,
            base_balance=q4(base_balance),
            proration_factor=ZERO,
            full_amount=ZERO,
            interest_amount=ZERO,
            skip_reason="before_activation",
        )
    if not balance_eligible(nature=nature, balance=base_balance):
        return InterestPreview(
            period_key=period_key,
            period_start=start,
            period_end=end,
            base_balance=q4(base_balance),
            proration_factor=factor,
            full_amount=ZERO,
            interest_amount=ZERO,
            skip_reason="ineligible_balance",
        )
    full = full_period_interest(
        method=method,
        frequency=frequency,
        base_balance=to_decimal(base_balance),
        rate_yearly=rate_yearly,
        fixed_amount=fixed_amount,
    )
    amount = apply_proration(full, factor)
    if amount < MIN_INTEREST:
        return InterestPreview(
            period_key=period_key,
            period_start=start,
            period_end=end,
            base_balance=q4(base_balance),
            proration_factor=factor,
            full_amount=full,
            interest_amount=ZERO,
            skip_reason="below_minimum",
        )
    return InterestPreview(
        period_key=period_key,
        period_start=start,
        period_end=end,
        base_balance=q4(base_balance),
        proration_factor=factor,
        full_amount=full,
        interest_amount=amount,
        skip_reason=None,
    )
