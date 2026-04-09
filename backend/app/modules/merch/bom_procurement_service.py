"""PO creation from BOM lines and procurement status."""

from __future__ import annotations

from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models import Bom, BomItem, GoodsReceiving, GoodsReceivingItem, PurchaseOrder, PurchaseOrderItem, Vendor


async def has_po_lines_for_bom_line(db: AsyncSession, tenant_id: int, bom_line_id: int) -> bool:
    r = await db.execute(
        select(func.count())
        .select_from(PurchaseOrderItem)
        .where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrderItem.source_bom_line_id == bom_line_id,
        )
    )
    return int(r.scalar() or 0) > 0


async def get_suggested_vendor_prices(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    limit: int = 5,
) -> list[dict]:
    """Recent PO unit prices for item (proxy for vendor price list)."""
    r = await db.execute(
        select(PurchaseOrderItem.unit_price, PurchaseOrder.vendor_id, PurchaseOrder.po_code, PurchaseOrder.id)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrderItem.item_id == item_id,
            PurchaseOrder.tenant_id == tenant_id,
        )
        .order_by(PurchaseOrderItem.id.desc())
        .limit(limit)
    )
    out: list[dict] = []
    for row in r.all():
        out.append(
            {
                "unit_price": row[0],
                "vendor_id": row[1],
                "po_code": row[2],
                "purchase_order_id": row[3],
            }
        )
    return out


def _po_qty_float(qty: str | None) -> float:
    try:
        return float(qty or 0)
    except (TypeError, ValueError):
        return 0.0


async def total_po_qty_for_line(db: AsyncSession, tenant_id: int, bom_line_id: int) -> float:
    r = await db.execute(
        select(PurchaseOrderItem.quantity).where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrderItem.source_bom_line_id == bom_line_id,
        )
    )
    total = 0.0
    for (q,) in r.all():
        total += _po_qty_float(q)
    return total


async def total_accepted_for_po_line(
    db: AsyncSession,
    tenant_id: int,
    *,
    purchase_order_id: int,
    purchase_order_line_id: int,
    item_id: int,
) -> float:
    """Sum accepted (or legacy quantity) on RECEIVED GRNs for this PO line."""
    r = await db.execute(
        select(
            GoodsReceivingItem.accepted_qty,
            GoodsReceivingItem.received_qty,
            GoodsReceivingItem.quantity,
        )
        .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
        .where(
            GoodsReceivingItem.tenant_id == tenant_id,
            GoodsReceiving.tenant_id == tenant_id,
            GoodsReceiving.purchase_order_id == purchase_order_id,
            GoodsReceiving.status == "RECEIVED",
            or_(
                GoodsReceivingItem.purchase_order_line_id == purchase_order_line_id,
                and_(
                    GoodsReceivingItem.purchase_order_line_id.is_(None),
                    GoodsReceivingItem.item_id == item_id,
                ),
            ),
        )
    )
    total = 0.0
    for acc, recv, qty in r.all():
        q = acc or recv or qty
        total += _po_qty_float(q)
    return total


async def total_received_for_po_items(
    db: AsyncSession,
    tenant_id: int,
    purchase_order_id: int,
) -> float:
    """Total accepted receipt qty for PO (all lines)."""
    r = await db.execute(
        select(PurchaseOrderItem.id, PurchaseOrderItem.item_id).where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrderItem.purchase_order_id == purchase_order_id,
        )
    )
    total = 0.0
    for pl_id, it_id in r.all():
        total += await total_accepted_for_po_line(
            db,
            tenant_id,
            purchase_order_id=purchase_order_id,
            purchase_order_line_id=pl_id,
            item_id=it_id,
        )
    return total


async def get_line_procurement_status(
    db: AsyncSession,
    tenant_id: int,
    line: BomItem,
) -> str:
    r = await db.execute(
        select(PurchaseOrderItem, PurchaseOrder)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == tenant_id,
            PurchaseOrderItem.source_bom_line_id == line.id,
        )
    )
    rows = r.all()
    if not rows:
        return "NOT_PROCURED"

    total_ordered = 0.0
    total_received = 0.0
    worst_draft = False
    for poi, po in rows:
        total_ordered += _po_qty_float(poi.quantity)
        recv = await total_accepted_for_po_line(
            db,
            tenant_id,
            purchase_order_id=po.id,
            purchase_order_line_id=poi.id,
            item_id=poi.item_id,
        )
        total_received += recv
        st = (po.status or "").upper()
        if st == "DRAFT":
            worst_draft = True

    need = _po_qty_float(str(line.required_gross_qty)) if line.required_gross_qty is not None else 0.0
    if total_received >= need - 1e-6 and need > 0:
        return "FULLY_RECEIVED"
    if total_received > 0:
        return "PARTIALLY_RECEIVED"
    if worst_draft:
        return "PO_DRAFT"
    return "PO_APPROVED"


async def create_po_from_bom_line(
    db: AsyncSession,
    *,
    tenant_id: int,
    bom: Bom,
    line: BomItem,
    vendor_id: int | None,
    quantity: float,
    unit_price: str,
    currency: str | None,
    warehouse_id: int | None,
    supplier_name_fallback: str = "From BOM line",
) -> tuple[PurchaseOrder, PurchaseOrderItem, list[str]]:
    warnings: list[str] = []
    if not line.item_id:
        raise ValueError("BOM line has no item_id; link inventory item first")

    supplier_name = supplier_name_fallback
    vid = vendor_id
    if vid is not None:
        v = await db.get(Vendor, vid)
        if not v or v.tenant_id != tenant_id:
            raise ValueError("Vendor not found")
        supplier_name = v.name
    else:
        vid = None

    po_code = await next_tenant_code(
        db,
        model=PurchaseOrder,
        tenant_id=tenant_id,
        prefix="PO-",
        width=4,
    )
    po = PurchaseOrder(
        tenant_id=tenant_id,
        po_code=po_code,
        vendor_id=vid,
        supplier_name=supplier_name,
        status="DRAFT",
        source_bom_id=bom.id,
        source_order_id=bom.order_id,
        currency=currency,
        notes=f"From BOM #{bom.id} line #{line.id} order {bom.order_id}",
    )
    db.add(po)
    await db.flush()

    qty_str = f"{quantity:.4g}".strip()
    if qty_str == "0":
        qty_str = "0"

    poi = PurchaseOrderItem(
        tenant_id=tenant_id,
        purchase_order_id=po.id,
        item_id=line.item_id,
        warehouse_id=warehouse_id,
        quantity=qty_str,
        unit_price=unit_price or "0",
        source_bom_id=bom.id,
        source_bom_line_id=line.id,
        source_order_id=bom.order_id,
        source_quotation_line_id=line.quotation_line_id,
    )
    db.add(poi)
    await db.flush()
    return po, poi, warnings


async def bulk_create_pos_by_vendor(
    db: AsyncSession,
    *,
    tenant_id: int,
    bom: Bom,
    lines: list[BomItem],
) -> list[tuple[PurchaseOrder, list[PurchaseOrderItem]]]:
    """One draft PO per distinct preferred_vendor_id; lines grouped."""
    from collections import defaultdict

    groups: dict[int | None, list[BomItem]] = defaultdict(list)
    for line in lines:
        if not line.item_id:
            continue
        groups[line.preferred_vendor_id].append(line)

    created: list[tuple[PurchaseOrder, list[PurchaseOrderItem]]] = []
    for vid, grp in groups.items():
        if not grp:
            continue
        po_code = await next_tenant_code(
            db,
            model=PurchaseOrder,
            tenant_id=tenant_id,
            prefix="PO-",
            width=4,
        )
        supplier_name = "From BOM bulk"
        vendor_id = vid
        if vendor_id is not None:
            v = await db.get(Vendor, vendor_id)
            if v and v.tenant_id == tenant_id:
                supplier_name = v.name
            else:
                vendor_id = None

        po = PurchaseOrder(
            tenant_id=tenant_id,
            po_code=po_code,
            vendor_id=vendor_id,
            supplier_name=supplier_name,
            status="DRAFT",
            source_bom_id=bom.id,
            source_order_id=bom.order_id,
            notes=f"Bulk from BOM #{bom.id} ({len(grp)} lines)",
        )
        db.add(po)
        await db.flush()
        pois: list[PurchaseOrderItem] = []
        for line in grp:
            already = await total_po_qty_for_line(db, tenant_id, line.id)
            need = float(line.required_gross_qty or 0)
            remaining = max(0.0, need - already)
            if remaining <= 0:
                continue
            price = str(line.bom_expected_unit_price) if line.bom_expected_unit_price is not None else "0"
            qty_str = f"{remaining:.4g}"
            poi = PurchaseOrderItem(
                tenant_id=tenant_id,
                purchase_order_id=po.id,
                item_id=line.item_id,
                quantity=qty_str,
                unit_price=price,
                source_bom_id=bom.id,
                source_bom_line_id=line.id,
                source_order_id=bom.order_id,
                source_quotation_line_id=line.quotation_line_id,
            )
            db.add(poi)
            pois.append(poi)
        await db.flush()
        if pois:
            created.append((po, pois))
    return created
