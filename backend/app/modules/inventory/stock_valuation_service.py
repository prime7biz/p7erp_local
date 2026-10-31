"""Stock valuation: FIFO / LIFO / AVG / STD from batches + item master."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.costing import Item
from app.models.inventory import StockBatch, StockGroup
from app.models.inventory import InventoryCostLayer

ZERO = Decimal("0")
ValuationMethod = Literal["FIFO", "LIFO", "AVG", "STD"]


def _d(value: Any) -> Decimal:
    if value is None:
        return ZERO
    if isinstance(value, Decimal):
        return value
    try:
        return Decimal(str(value).replace(",", "") or "0")
    except Exception:
        return ZERO


def _money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"))


async def resolve_valuation_method(
    db: AsyncSession,
    tenant_id: int,
    item: Item,
    method: str | None = None,
) -> ValuationMethod:
    if method and method.upper() in {"FIFO", "LIFO", "AVG", "STD"}:
        return method.upper()  # type: ignore[return-value]
    if item.default_valuation_method and item.default_valuation_method.upper() in {
        "FIFO",
        "LIFO",
        "AVG",
        "STD",
    }:
        return item.default_valuation_method.upper()  # type: ignore[return-value]
    if item.stock_group_id:
        sg = await db.get(StockGroup, item.stock_group_id)
        if sg and sg.tenant_id == tenant_id and (sg.default_valuation_method or "").upper() in {
            "FIFO",
            "LIFO",
            "AVG",
            "STD",
        }:
            return sg.default_valuation_method.upper()  # type: ignore[return-value]
    return "FIFO"


async def get_stock_value(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    *,
    godown_id: int | None = None,
    as_of_date: date | None = None,
    method: str | None = None,
) -> dict[str, Any]:
    """Return qty + value for an item (optionally godown-scoped) using valuation method."""
    item = await db.get(Item, item_id)
    if not item or item.tenant_id != tenant_id:
        return {
            "item_id": item_id,
            "qty": "0",
            "value": "0",
            "unit_cost": "0",
            "method": method or "FIFO",
            "layers": [],
        }

    resolved = await resolve_valuation_method(db, tenant_id, item, method)
    as_of = as_of_date or date.today()

    if resolved == "STD":
        # On-hand from batch or current_stock cache
        qty = await _on_hand_from_batches(db, tenant_id, item_id, godown_id)
        if qty <= ZERO:
            qty = _d(item.current_stock)
        unit = _d(item.standard_price) if item.standard_price is not None else _d(item.default_cost)
        value = _money(qty * unit)
        return {
            "item_id": item_id,
            "godown_id": godown_id,
            "as_of_date": as_of.isoformat(),
            "qty": str(_money(qty)),
            "value": str(value),
            "unit_cost": str(_money(unit)),
            "method": resolved,
            "layers": [],
        }

    batches = await _active_batches(db, tenant_id, item_id, godown_id)
    if not batches:
        # Fallback to cost layers when no physical batches
        return await _value_from_cost_layers(db, tenant_id, item_id, godown_id, resolved, as_of)

    if resolved == "AVG":
        total_qty = sum((_d(b.current_qty) for b in batches), ZERO)
        total_val = sum((_d(b.current_qty) * _d(b.cost_per_unit) for b in batches), ZERO)
        unit = (total_val / total_qty) if total_qty > ZERO else ZERO
        return {
            "item_id": item_id,
            "godown_id": godown_id,
            "as_of_date": as_of.isoformat(),
            "qty": str(_money(total_qty)),
            "value": str(_money(total_val)),
            "unit_cost": str(_money(unit)),
            "method": resolved,
            "layers": [
                {
                    "batch_id": b.id,
                    "batch_number": b.batch_number,
                    "qty": str(_money(_d(b.current_qty))),
                    "cost_per_unit": str(_money(_d(b.cost_per_unit))),
                }
                for b in batches
            ],
        }

    ordered = sorted(
        batches,
        key=lambda b: (b.created_at or as_of, b.id),
        reverse=(resolved == "LIFO"),
    )
    total_qty = sum((_d(b.current_qty) for b in ordered), ZERO)
    total_val = sum((_d(b.current_qty) * _d(b.cost_per_unit) for b in ordered), ZERO)
    unit = (total_val / total_qty) if total_qty > ZERO else ZERO
    return {
        "item_id": item_id,
        "godown_id": godown_id,
        "as_of_date": as_of.isoformat(),
        "qty": str(_money(total_qty)),
        "value": str(_money(total_val)),
        "unit_cost": str(_money(unit)),
        "method": resolved,
        "layers": [
            {
                "batch_id": b.id,
                "batch_number": b.batch_number,
                "qty": str(_money(_d(b.current_qty))),
                "cost_per_unit": str(_money(_d(b.cost_per_unit))),
                "expiry_date": b.expiry_date.isoformat() if b.expiry_date else None,
            }
            for b in ordered
        ],
    }


async def _active_batches(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    godown_id: int | None,
) -> list[StockBatch]:
    q = select(StockBatch).where(
        StockBatch.tenant_id == tenant_id,
        StockBatch.stock_item_id == item_id,
        StockBatch.status == "ACTIVE",
        StockBatch.current_qty > 0,
    )
    if godown_id is not None:
        q = q.where(StockBatch.godown_id == godown_id)
    return list((await db.execute(q)).scalars().all())


async def _on_hand_from_batches(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    godown_id: int | None,
) -> Decimal:
    batches = await _active_batches(db, tenant_id, item_id, godown_id)
    return sum((_d(b.current_qty) for b in batches), ZERO)


async def _value_from_cost_layers(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    godown_id: int | None,
    method: ValuationMethod,
    as_of: date,
) -> dict[str, Any]:
    q = select(InventoryCostLayer).where(
        InventoryCostLayer.tenant_id == tenant_id,
        InventoryCostLayer.item_id == item_id,
        InventoryCostLayer.qty_remaining > 0,
    )
    if godown_id is not None:
        q = q.where(InventoryCostLayer.warehouse_id == godown_id)
    layers = list((await db.execute(q)).scalars().all())
    if method == "LIFO":
        layers.sort(key=lambda L: (L.id,), reverse=True)
    else:
        layers.sort(key=lambda L: (L.id,))

    total_qty = sum((_d(L.qty_remaining) for L in layers), ZERO)
    total_val = sum((_d(L.qty_remaining) * _d(L.unit_cost) for L in layers), ZERO)
    unit = (total_val / total_qty) if total_qty > ZERO else ZERO
    return {
        "item_id": item_id,
        "godown_id": godown_id,
        "as_of_date": as_of.isoformat(),
        "qty": str(_money(total_qty)),
        "value": str(_money(total_val)),
        "unit_cost": str(_money(unit)),
        "method": method,
        "layers": [
            {
                "layer_id": L.id,
                "qty": str(_money(_d(L.qty_remaining))),
                "cost_per_unit": str(_money(_d(L.unit_cost))),
            }
            for L in layers
        ],
    }


async def refresh_item_stock_caches(db: AsyncSession, tenant_id: int, item_id: int) -> None:
    """Update Item.current_stock / current_value / avg_cost from active batches (or leave zeros)."""
    item = await db.get(Item, item_id)
    if not item or item.tenant_id != tenant_id:
        return
    val = await get_stock_value(db, tenant_id, item_id, method="AVG")
    item.current_stock = _d(val["qty"])
    item.current_value = _d(val["value"])
    item.avg_cost = _d(val["unit_cost"])
    await db.flush()
