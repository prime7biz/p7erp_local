"""Safe payroll formula helpers — NO eval / exec.

Supported calculation_type values on PayrollComponent:
  FIXED          — use line/default amount as-is
  PERCENT_OF_BASE — amount is a percent of base_salary (e.g. 40 → 40% of base)
  PER_DAY        — amount × paid days (present + paid leave)
  PER_HOUR_OT    — amount × ot_hours
"""

from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Any

ALLOWED_CALCULATION_TYPES = frozenset({"FIXED", "PERCENT_OF_BASE", "PER_DAY", "PER_HOUR_OT"})

_MONEY_QUANT = Decimal("0.0001")


def _to_decimal(value: Any, default: Decimal = Decimal("0")) -> Decimal:
    if value is None:
        return default
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value))
    except Exception:
        return default


def quantize_money(value: Decimal) -> Decimal:
    return value.quantize(_MONEY_QUANT, rounding=ROUND_HALF_UP)


def normalize_calculation_type(calculation_type: str | None) -> str:
    return (calculation_type or "FIXED").strip().upper()


def assert_valid_calculation_type(calculation_type: str | None) -> str:
    """Reject unknown formula types (no arbitrary evaluation)."""
    calc = normalize_calculation_type(calculation_type)
    if calc not in ALLOWED_CALCULATION_TYPES:
        allowed = ", ".join(sorted(ALLOWED_CALCULATION_TYPES))
        raise ValueError(f"Invalid calculation_type '{calculation_type}'. Allowed: {allowed}")
    return calc


def calculate_component_amount(
    *,
    calculation_type: str,
    amount: Decimal | str | float | int | None,
    base_salary: Decimal | str | float | int | None = None,
    days_present: Decimal | str | float | int | None = None,
    ot_hours: Decimal | str | float | int | None = None,
    strict: bool = False,
) -> Decimal:
    """Compute one component amount from a known calculation_type (no eval)."""
    calc = normalize_calculation_type(calculation_type)
    rate = _to_decimal(amount)
    if calc not in ALLOWED_CALCULATION_TYPES:
        if strict:
            assert_valid_calculation_type(calc)
        # Unknown types are treated as fixed so a bad row never crashes a run.
        return quantize_money(rate)

    if calc == "FIXED":
        return quantize_money(rate)

    if calc == "PERCENT_OF_BASE":
        base = _to_decimal(base_salary)
        return quantize_money(base * rate / Decimal("100"))

    if calc == "PER_DAY":
        days = _to_decimal(days_present)
        return quantize_money(rate * days)

    # PER_HOUR_OT
    hours = _to_decimal(ot_hours)
    return quantize_money(rate * hours)
