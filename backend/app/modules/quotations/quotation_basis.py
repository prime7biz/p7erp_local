"""Small read helpers for quotations that may use dozen-first costing (``costing_basis = 'PER_DOZEN'``).

Readers in other modules (orders, finance, commercial, portals) call these instead of reading
``quoted_price`` / ``total_cost`` directly, so a dozen-first quotation is read on its own basis while a
legacy quotation (``costing_basis IS NULL``) keeps the exact old behaviour.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any

TWELVE = Decimal("12")
FOUR_DP = Decimal("0.0001")


def is_dozen_first(q: Any) -> bool:
    return getattr(q, "costing_basis", None) is not None


def unit_price(q: Any) -> Decimal | None:
    """Buyer unit price: the stored per-piece price for dozen-first quotations, else the legacy ``quoted_price``."""
    if is_dozen_first(q) and q.quoted_price_per_piece is not None:
        return q.quoted_price_per_piece
    return q.quoted_price


def cost_for_quantity(q: Any, quantity: int | float | Decimal | None) -> Decimal | None:
    """Factory cost for ``quantity`` pieces.

    Dozen-first: total cost per dozen x quantity / 12 (works even when the quote had no quantity).
    Legacy: the stored ``total_cost`` unchanged (it is the cost of the quoted projected quantity).
    """
    if is_dozen_first(q) and q.total_cost_per_dozen is not None:
        qty = Decimal(str(quantity or 0))
        return (q.total_cost_per_dozen * qty / TWELVE).quantize(FOUR_DP, rounding=ROUND_HALF_UP)
    return q.total_cost
