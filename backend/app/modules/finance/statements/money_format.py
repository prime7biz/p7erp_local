"""South-Asian (lakh / crore) money text for the statement exports. Pure functions, no database.

    1234567.5      -> "12,34,567.50"
    1813863870.26  -> "1,81,38,63,870.26"
    -1234.5        -> "(-)1,234.50"      (Tally style negative)
    Dr / Cr suffix -> "1,234.50 Dr"

The last three digits form one group; every group to the left has two digits.
Rounding is ROUND_HALF_UP on the exact Decimal (never float).
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

ZERO = Decimal("0")


def group_indian_digits(digits: str) -> str:
    """'1234567' -> '12,34,567'. `digits` holds only 0-9."""
    if len(digits) <= 3:
        return digits
    head, tail = digits[:-3], digits[-3:]
    parts: list[str] = []
    while len(head) > 2:
        parts.insert(0, head[-2:])
        head = head[:-2]
    if head:
        parts.insert(0, head)
    return ",".join(parts + [tail])


def format_indian(value: Decimal | int | str | None, places: int = 2, *, negative: str = "paren") -> str:
    """Lakh / crore text. `negative`: "paren" -> "(-)1,234.00", "minus" -> "-1,234.00". None -> ""."""
    if value is None:
        return ""
    amount = Decimal(value)
    quant = Decimal(1).scaleb(-places)
    rounded = amount.quantize(quant, rounding=ROUND_HALF_UP)
    is_negative = rounded < ZERO
    text = format(abs(rounded), "f")
    whole, _, frac = text.partition(".")
    out = group_indian_digits(whole) + (f".{frac}" if places > 0 else "")
    if not is_negative:
        return out
    return f"(-){out}" if negative == "paren" else f"-{out}"


def format_dr_cr(net: Decimal | int | str | None, places: int = 2) -> str:
    """Debit-minus-credit balance as '1,234.50 Dr' / '1,234.50 Cr'. Zero has no suffix."""
    if net is None:
        return ""
    amount = Decimal(net).quantize(Decimal(1).scaleb(-places), rounding=ROUND_HALF_UP)
    if amount == ZERO:
        return format_indian(ZERO, places)
    return f"{format_indian(abs(amount), places)} {'Dr' if amount > ZERO else 'Cr'}"


def parse_indian(text: str) -> Decimal:
    """Reverse of `format_indian` / `format_dr_cr` (used by tests to compare exports with JSON)."""
    cleaned = text.strip()
    sign = Decimal(1)
    if cleaned.startswith("(-)"):
        sign, cleaned = Decimal(-1), cleaned[3:]
    elif cleaned.startswith("-"):
        sign, cleaned = Decimal(-1), cleaned[1:]
    suffix = ""
    if cleaned.endswith(" Dr") or cleaned.endswith(" Cr"):
        suffix, cleaned = cleaned[-2:], cleaned[:-3]
    value = Decimal(cleaned.replace(",", "")) if cleaned else ZERO
    if suffix == "Cr":
        sign = -sign
    return sign * value
