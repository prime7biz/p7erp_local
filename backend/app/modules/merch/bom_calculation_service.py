"""Pure BOM line calculations (order-driven, wastage + process loss)."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Any


def _f(x: Any) -> float:
    if x is None:
        return 0.0
    if isinstance(x, Decimal):
        return float(x)
    try:
        return float(x)
    except (TypeError, ValueError):
        return 0.0


def compute_bom_line_fields(
    *,
    order_qty: int,
    bom_net_consumption_per_unit: float,
    wastage_pct: float,
    process_loss_pct: float,
    bom_expected_unit_price: float,
    quoted_consumption_per_unit: float | None,
    quoted_unit_price: float | None,
) -> dict[str, float | None]:
    """Return computed quantities, costs, and variances for one BOM line.

    gross_consumption = net * (1 + wastage_pct/100 + process_loss_pct/100)
    """
    oq = max(0, int(order_qty))
    net = max(0.0, bom_net_consumption_per_unit)
    w = max(0.0, wastage_pct)
    pl = max(0.0, process_loss_pct)
    gross = net * (1.0 + w / 100.0 + pl / 100.0)
    req_net = oq * net
    wastage_qty = req_net * w / 100.0
    process_loss_qty = req_net * pl / 100.0
    req_gross = req_net + wastage_qty + process_loss_qty
    bom_price = max(0.0, bom_expected_unit_price)
    bom_expected_total = req_gross * bom_price

    qc = quoted_consumption_per_unit
    qp = quoted_unit_price
    quoted_total: float | None = None
    if qc is not None and qc > 0 and qp is not None and qp >= 0:
        quoted_total = oq * qc * qp

    consumption_variance_pct: float | None = None
    if qc is not None and qc > 0:
        consumption_variance_pct = (gross - qc) / qc * 100.0

    price_variance_pct: float | None = None
    if qp is not None and qp > 0:
        price_variance_pct = (bom_price - qp) / qp * 100.0

    total_cost_variance: float | None = None
    if quoted_total is not None:
        total_cost_variance = bom_expected_total - quoted_total

    return {
        "bom_gross_consumption_per_unit": round(gross, 6),
        "required_net_qty": round(req_net, 4),
        "wastage_qty": round(wastage_qty, 4),
        "process_loss_qty": round(process_loss_qty, 4),
        "required_gross_qty": round(req_gross, 4),
        "bom_expected_total_cost": round(bom_expected_total, 4),
        "quoted_total_cost": round(quoted_total, 4) if quoted_total is not None else None,
        "consumption_variance_pct": round(consumption_variance_pct, 4) if consumption_variance_pct is not None else None,
        "price_variance_pct": round(price_variance_pct, 4) if price_variance_pct is not None else None,
        "total_cost_variance": round(total_cost_variance, 4) if total_cost_variance is not None else None,
    }


def sync_bom_qty_columns(*, net: float, wastage_pct: float) -> tuple[Decimal, Decimal | None]:
    """Persist net consumption and wastage % on BomItem numeric columns (Phase 3B)."""
    net_d = Decimal(str(net)).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)
    w = max(0.0, wastage_pct)
    if abs(w) < 1e-15:
        return net_d, None
    w_d = Decimal(str(w)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)
    return net_d, w_d
