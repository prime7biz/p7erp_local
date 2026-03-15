"""Phase F: Purchase/BOM-related AI tools – suggest vendor for item, orders with material shortage."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Bom,
    BomItem,
    Item,
    Order,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    StockMovement,
    GarmentStyle,
)
from app.modules.ai_tool.query_parser import parse_search_query


def _to_float(value: str | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


async def suggest_vendor_for_item(
    db: AsyncSession, *, tenant_id: int, prompt: str
) -> dict:
    """Suggest vendor(s) used for this item recently (from PO history)."""
    query = parse_search_query(prompt)
    item_id: int | None = None
    if query.reference_text:
        try:
            item_id = int(query.reference_text.strip())
        except ValueError:
            pass
    if item_id is None:
        for word in (prompt or "").split():
            if word.isdigit():
                item_id = int(word)
                break
    if item_id is None:
        return {
            "title": "Suggest vendor for item",
            "summary": "Provide an item ID (e.g. 'item 42' or 'item_id 42').",
            "data": {"item_id": None, "vendors": []},
        }
    item = await db.get(Item, item_id)
    if not item or item.tenant_id != tenant_id:
        return {
            "title": "Suggest vendor for item",
            "summary": "Item not found.",
            "data": {"item_id": item_id, "vendors": []},
        }
    rows = (
        await db.execute(
            select(PurchaseOrder.supplier_name, PurchaseOrder.vendor_id, func.count())
            .join(PurchaseOrderItem, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
            .where(
                PurchaseOrder.tenant_id == tenant_id,
                PurchaseOrderItem.item_id == item_id,
            )
            .group_by(PurchaseOrder.supplier_name, PurchaseOrder.vendor_id)
            .order_by(func.count().desc())
            .limit(query.top_n)
        )
    ).all()
    vendors = [
        {"supplier_name": name, "vendor_id": vid, "po_count": int(cnt)}
        for name, vid, cnt in rows
    ]
    return {
        "title": "Suggest vendor for item",
        "summary": f"Item {item.item_code}: {len(vendors)} vendor(s) used in past POs.",
        "data": {"item_id": item_id, "item_code": item.item_code, "vendors": vendors},
    }


async def suggest_orders_with_shortage(
    db: AsyncSession, *, tenant_id: int, prompt: str
) -> dict:
    """List orders that have material requirement shortage (actual vs BOM; no PO created yet)."""
    query = parse_search_query(prompt)
    mov_result = await db.execute(
        select(StockMovement.reference_id).where(
            StockMovement.tenant_id == tenant_id,
            StockMovement.reference_type == "CONSUMPTION_ISSUE",
            StockMovement.reference_id.isnot(None),
        ).distinct()
    )
    order_ids = [r[0] for r in mov_result.scalars().all() if r[0] is not None]
    if not order_ids:
        return {
            "title": "Orders with material shortage",
            "summary": "No consumption-issued orders found.",
            "data": {"orders_with_shortage": []},
        }
    stmt = select(Order).where(Order.tenant_id == tenant_id, Order.id.in_(order_ids))
    orders_result = await db.execute(stmt)
    orders = list(orders_result.scalars().all())
    shortage_list: list[dict] = []
    for order in orders:
        if not order.quotation_id:
            continue
        quotation = await db.get(Quotation, order.quotation_id)
        if not quotation or quotation.tenant_id != tenant_id or not quotation.style_id:
            continue
        order_qty = _to_float(str(order.quantity)) if order.quantity else 0.0
        if order_qty <= 0:
            continue
        bom_result = await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant_id,
                Bom.style_id == quotation.style_id,
            ).order_by(Bom.version_no.desc()).limit(1)
        )
        bom = bom_result.scalar_one_or_none()
        if not bom:
            continue
        lines = (
            await db.execute(
                select(BomItem).where(
                    BomItem.tenant_id == tenant_id,
                    BomItem.bom_id == bom.id,
                    BomItem.item_id.isnot(None),
                )
            )
        ).scalars().all()
        shortage_count = 0
        for line in lines:
            base = _to_float(line.base_consumption)
            wastage = _to_float(line.wastage_pct) / 100.0
            required = order_qty * base * (1.0 + wastage)
            act = await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "CONSUMPTION_ISSUE",
                    StockMovement.reference_id == order.id,
                    StockMovement.item_id == line.item_id,
                )
            )
            actual = sum(
                _to_float(m.quantity)
                for m in act.scalars().all()
                if (m.movement_type or "").upper() == "OUT"
            )
            if actual < required and (required - actual) > 0.0001:
                shortage_count += 1
        if shortage_count > 0:
            style = await db.get(GarmentStyle, quotation.style_id)
            shortage_list.append({
                "order_id": order.id,
                "order_code": order.order_code,
                "style_id": quotation.style_id,
                "style_code": style.style_code if style else str(quotation.style_id),
                "shortage_line_count": shortage_count,
            })
    shortage_list.sort(key=lambda x: x["shortage_line_count"], reverse=True)
    shortage_list = shortage_list[: query.top_n]
    return {
        "title": "Orders with material shortage",
        "summary": f"Found {len(shortage_list)} order(s) with material shortage vs BOM.",
        "data": {
            "applied_filters": ["has CONSUMPTION_ISSUE", "shortage vs BOM expected"],
            "orders_with_shortage": shortage_list,
        },
    }
