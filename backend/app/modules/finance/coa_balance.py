"""Chart-of-account running balance updates in Decimal (avoids float drift on every post/reverse)."""

from __future__ import annotations

from decimal import Decimal

from app.common.money import safe_decimal
from app.models import ChartOfAccount

BALANCE_QUANT = Decimal("0.0001")


def apply_account_balance_impact(
    account: ChartOfAccount,
    entry_type: str,
    amount: Decimal | str | float | int | None,
) -> None:
    """Add one voucher line to ``account.balance`` respecting the account's normal side."""
    current = safe_decimal(account.balance)
    amt = safe_decimal(amount)
    if (account.normal_balance or "debit").lower() == "debit":
        current = current + amt if entry_type == "DEBIT" else current - amt
    else:
        current = current + amt if entry_type == "CREDIT" else current - amt
    account.balance = current.quantize(BALANCE_QUANT)
