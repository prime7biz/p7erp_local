"""Apply calculation results onto BomItem ORM rows."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import BomItem
from app.modules.merch.bom_calculation_service import compute_bom_line_fields, sync_bom_qty_columns


def _net_from_line(line: BomItem) -> float:
    if line.bom_net_consumption_per_unit is not None:
        return float(line.bom_net_consumption_per_unit)
    try:
        return float(line.base_consumption or 0)
    except (TypeError, ValueError):
        return 0.0


def _wastage_from_line(line: BomItem) -> float:
    try:
        return float(line.wastage_pct or 0)
    except (TypeError, ValueError):
        return 0.0


def _process_loss_from_line(line: BomItem) -> float:
    if line.process_loss_pct is not None:
        return float(line.process_loss_pct)
    return 0.0


def _bom_price_from_line(line: BomItem) -> float:
    if line.bom_expected_unit_price is not None:
        return float(line.bom_expected_unit_price)
    return 0.0


def apply_calculations_to_line(line: BomItem, order_qty: int) -> None:
    """Mutate line in place with computed fields."""
    net = _net_from_line(line)
    w = _wastage_from_line(line)
    pl = _process_loss_from_line(line)
    price = _bom_price_from_line(line)
    qc = float(line.quoted_consumption_per_unit) if line.quoted_consumption_per_unit is not None else None
    qp = float(line.quoted_unit_price) if line.quoted_unit_price is not None else None

    out = compute_bom_line_fields(
        order_qty=order_qty,
        bom_net_consumption_per_unit=net,
        wastage_pct=w,
        process_loss_pct=pl,
        bom_expected_unit_price=price,
        quoted_consumption_per_unit=qc,
        quoted_unit_price=qp,
    )
    line.bom_net_consumption_per_unit = net
    line.bom_gross_consumption_per_unit = out["bom_gross_consumption_per_unit"]
    line.required_net_qty = out["required_net_qty"]
    line.wastage_qty = out["wastage_qty"]
    line.process_loss_qty = out["process_loss_qty"]
    line.required_gross_qty = out["required_gross_qty"]
    line.bom_expected_total_cost = out["bom_expected_total_cost"]
    if out["quoted_total_cost"] is not None:
        line.quoted_total_cost = out["quoted_total_cost"]
    line.consumption_variance_pct = out["consumption_variance_pct"]
    line.price_variance_pct = out["price_variance_pct"]
    line.total_cost_variance = out["total_cost_variance"]
    line.order_qty_snapshot = order_qty

    base_d, wast_d = sync_bom_qty_columns(net=net, wastage_pct=w)
    line.base_consumption = base_d
    line.wastage_pct = wast_d


async def recalc_all_lines_for_bom(db: AsyncSession, lines: list[BomItem], order_qty: int) -> None:
    for line in lines:
        apply_calculations_to_line(line, order_qty)
