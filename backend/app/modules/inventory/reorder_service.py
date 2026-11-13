"""Auto-reorder: monitor stock and generate PO suggestions (Sprint I1)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models.costing import Item
from app.models.inventory import (
    PlannedOrder,
    PurchaseOrder,
    PurchaseOrderItem,
    ReorderSuggestion,
    StockReservation,
    Vendor,
)
from app.modules.inventory.mrp_engine_service import (
    _d,
    _on_order_qty,
    _q,
    apply_lot_sizing,
)

ZERO = Decimal("0")


async def _reserved_qty(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    warehouse_id: int | None = None,
    *,
    allocation_v1: bool | None = None,
) -> Decimal:
    """Reserved stock. Flag ``mfg_material_allocation_v1`` ON: hard holds only, exact warehouse when given."""
    from app.modules.inventory.reservation_service import (
        WAREHOUSE_EXACT,
        allocation_v1_enabled,
        hard_reserved_by_item,
    )

    if await allocation_v1_enabled(db, tenant_id, allocation_v1):
        hard = await hard_reserved_by_item(
            db, tenant_id, [item_id], warehouse_id=warehouse_id, warehouse_mode=WAREHOUSE_EXACT
        )
        return hard.get(item_id, ZERO)
    stmt = select(StockReservation).where(
        StockReservation.tenant_id == tenant_id,
        StockReservation.item_id == item_id,
        StockReservation.status.in_(("HARD", "SOFT")),
    )
    if warehouse_id is not None:
        stmt = stmt.where(StockReservation.warehouse_id == warehouse_id)
    rows = list((await db.execute(stmt)).scalars().all())
    return sum((_d(r.reserved_qty) for r in rows), ZERO)


async def check_reorder_points(
    db: AsyncSession,
    tenant_id: int,
    warehouse_id: int | None = None,
) -> list[ReorderSuggestion]:
    """
    For each item with auto_reorder_enabled=True, create PENDING suggestions
    when available stock is at or below reorder_level.
    Skips items that already have a PENDING/APPROVED suggestion.
    """
    stmt = select(Item).where(
        Item.tenant_id == tenant_id,
        Item.is_active.is_(True),
        Item.auto_reorder_enabled.is_(True),
    )
    items = list((await db.execute(stmt)).scalars().all())
    created: list[ReorderSuggestion] = []
    from app.modules.inventory.reservation_service import allocation_v1_enabled

    alloc_v1 = await allocation_v1_enabled(db, tenant_id)  # resolved once per run

    for item in items:
        level = _d(item.reorder_level)
        if level <= ZERO:
            continue

        stock = _d(item.current_stock)
        on_order = await _on_order_qty(db, tenant_id, item.id, allocation_v1=alloc_v1)
        reserved = await _reserved_qty(db, tenant_id, item.id, warehouse_id, allocation_v1=alloc_v1)
        safety = _d(item.safety_stock)
        available = stock + on_order - reserved - safety

        if available > level:
            continue

        # Skip if open suggestion exists
        existing_q = await db.execute(
            select(ReorderSuggestion).where(
                ReorderSuggestion.tenant_id == tenant_id,
                ReorderSuggestion.item_id == item.id,
                ReorderSuggestion.status.in_(("PENDING", "APPROVED")),
            )
        )
        if existing_q.scalars().first():
            continue

        if item.reorder_qty is not None and _d(item.reorder_qty) > ZERO:
            suggested = _q(_d(item.reorder_qty))
        else:
            suggested = _q(level * 2 - available)
            if suggested <= ZERO:
                suggested = level
        suggested = apply_lot_sizing(suggested, item)

        vendor_id = item.preferred_vendor_id
        unit_cost = _d(item.avg_cost) or _d(item.default_cost) or _d(item.standard_price)
        est = _q(suggested * unit_cost) if unit_cost > ZERO else None

        wh = warehouse_id or item.default_warehouse_id
        sug = ReorderSuggestion(
            tenant_id=tenant_id,
            item_id=item.id,
            warehouse_id=wh,
            current_stock=_q(stock),
            reorder_level=_q(level),
            suggested_qty=suggested,
            preferred_vendor_id=vendor_id,
            estimated_cost=est,
            status="PENDING",
        )
        db.add(sug)
        created.append(sug)

    await db.flush()
    return created


async def approve_suggestion(
    db: AsyncSession,
    tenant_id: int,
    suggestion_id: int,
) -> ReorderSuggestion:
    row = await db.get(ReorderSuggestion, suggestion_id)
    if not row or row.tenant_id != tenant_id:
        raise ValueError("Suggestion not found")
    if row.status != "PENDING":
        raise ValueError("Only PENDING suggestions can be approved")
    row.status = "APPROVED"
    row.updated_at = datetime.utcnow()
    await db.flush()
    return row


async def reject_suggestion(
    db: AsyncSession,
    tenant_id: int,
    suggestion_id: int,
) -> ReorderSuggestion:
    row = await db.get(ReorderSuggestion, suggestion_id)
    if not row or row.tenant_id != tenant_id:
        raise ValueError("Suggestion not found")
    if row.status not in ("PENDING", "APPROVED"):
        raise ValueError("Cannot reject this suggestion")
    row.status = "REJECTED"
    row.updated_at = datetime.utcnow()
    await db.flush()
    return row


async def generate_po_from_suggestion(
    db: AsyncSession,
    tenant_id: int,
    suggestion_id: int,
) -> tuple[ReorderSuggestion, PurchaseOrder]:
    """Convert APPROVED or PENDING suggestion to a draft PurchaseOrder."""
    row = await db.get(ReorderSuggestion, suggestion_id)
    if not row or row.tenant_id != tenant_id:
        raise ValueError("Suggestion not found")
    if row.status not in ("PENDING", "APPROVED"):
        raise ValueError("Suggestion cannot be converted")
    if row.generated_po_id:
        raise ValueError("Suggestion already converted")

    item = await db.get(Item, row.item_id)
    if not item or item.tenant_id != tenant_id:
        raise ValueError("Item not found")

    vendor_id = row.preferred_vendor_id or item.preferred_vendor_id
    supplier_name = "Reorder Vendor"
    if vendor_id:
        vendor = await db.get(Vendor, vendor_id)
        if vendor and vendor.tenant_id == tenant_id:
            supplier_name = vendor.name
        else:
            vendor_id = None

    unit_price = _d(item.avg_cost) or _d(item.default_cost) or _d(item.standard_price)
    po_code = await next_tenant_code(db, model=PurchaseOrder, tenant_id=tenant_id, prefix="PO-", width=4)
    po = PurchaseOrder(
        tenant_id=tenant_id,
        po_code=po_code,
        vendor_id=vendor_id,
        supplier_name=supplier_name,
        status="DRAFT",
        notes=f"From reorder suggestion #{row.id}",
    )
    db.add(po)
    await db.flush()
    db.add(
        PurchaseOrderItem(
            tenant_id=tenant_id,
            purchase_order_id=po.id,
            item_id=row.item_id,
            quantity=row.suggested_qty,
            unit_price=unit_price,
            warehouse_id=row.warehouse_id or item.default_warehouse_id,
        )
    )
    row.status = "CONVERTED"
    row.generated_po_id = po.id
    row.updated_at = datetime.utcnow()
    await db.flush()
    return row, po
