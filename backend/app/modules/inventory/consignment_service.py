"""Consignment stock receive / consume / settle (Sprint I4)."""

from __future__ import annotations

import logging
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.codegen import next_tenant_code
from app.common.tenant_feature_keys import is_consignment_stock_enabled
from app.models import Tenant
from app.models.costing import Item
from app.models.inventory import ConsignmentStock, PurchaseOrder, PurchaseOrderItem, StockMovement, Vendor, Warehouse
from app.services.fifo_inventory import finalize_movement_fifo

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _q(v: Decimal) -> Decimal:
    return v.quantize(Q4, rounding=ROUND_HALF_UP)


async def receive_consignment(
    db: AsyncSession,
    tenant: Tenant,
    *,
    vendor_id: int,
    item_id: int,
    warehouse_id: int,
    qty: Decimal,
    unit_cost: Decimal | None = None,
    agreement_date: date | None = None,
    settlement_terms_days: int | None = 30,
    notes: str | None = None,
) -> ConsignmentStock:
    if not is_consignment_stock_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Consignment stock is disabled")
    qty = _q(_d(qty))
    if qty <= ZERO:
        raise HTTPException(status_code=400, detail="qty must be positive")

    vendor = await db.get(Vendor, vendor_id)
    item = await db.get(Item, item_id)
    wh = await db.get(Warehouse, warehouse_id)
    if not vendor or vendor.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor not found")
    if not item or item.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    if not wh or wh.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    cost = _q(_d(unit_cost) or _d(item.avg_cost) or _d(item.default_cost))

    existing = (
        await db.execute(
            select(ConsignmentStock).where(
                ConsignmentStock.tenant_id == tenant.id,
                ConsignmentStock.vendor_id == vendor_id,
                ConsignmentStock.item_id == item_id,
                ConsignmentStock.warehouse_id == warehouse_id,
                ConsignmentStock.is_billed.is_(False),
            )
        )
    ).scalar_one_or_none()

    if existing:
        existing.consigned_qty = _q(_d(existing.consigned_qty) + qty)
        existing.remaining_qty = _q(_d(existing.remaining_qty) + qty)
        if cost > ZERO:
            existing.unit_cost = cost
        existing.updated_at = datetime.utcnow()
        row = existing
    else:
        row = ConsignmentStock(
            tenant_id=tenant.id,
            vendor_id=vendor_id,
            item_id=item_id,
            warehouse_id=warehouse_id,
            consigned_qty=qty,
            consumed_qty=ZERO,
            remaining_qty=qty,
            billed_qty=ZERO,
            is_billed=False,
            agreement_date=agreement_date or today_local(tenant),
            settlement_terms_days=settlement_terms_days,
            unit_cost=cost if cost > ZERO else None,
            notes=notes,
        )
        db.add(row)
        await db.flush()

    # Physical stock in warehouse (consignment owned by vendor — still tracked in WH)
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item_id,
        warehouse_id=warehouse_id,
        movement_type="IN",
        quantity=qty,
        reference_type="CONSIGNMENT",
        reference_id=row.id,
        movement_date=today_local(tenant),
        notes=f"Consignment from vendor {vendor.vendor_code}",
        movement_kind="CONSIGNMENT_RECEIPT",
        vendor_id=vendor_id,
    )
    db.add(mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=float(cost) if cost > ZERO else None)
    await db.flush()
    return row


async def consume_consignment(
    db: AsyncSession,
    tenant: Tenant,
    *,
    consignment_id: int | None = None,
    item_id: int | None = None,
    warehouse_id: int | None = None,
    qty: Decimal,
) -> ConsignmentStock:
    if not is_consignment_stock_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Consignment stock is disabled")
    qty = _q(_d(qty))
    if qty <= ZERO:
        raise HTTPException(status_code=400, detail="qty must be positive")

    # FOR UPDATE + populate_existing: a concurrent consumption waits, then re-reads remaining_qty.
    row: ConsignmentStock | None = None
    if consignment_id:
        row = (
            await db.execute(
                select(ConsignmentStock)
                .where(ConsignmentStock.id == consignment_id, ConsignmentStock.tenant_id == tenant.id)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()
    elif item_id and warehouse_id:
        row = (
            await db.execute(
                select(ConsignmentStock)
                .where(
                    ConsignmentStock.tenant_id == tenant.id,
                    ConsignmentStock.item_id == item_id,
                    ConsignmentStock.warehouse_id == warehouse_id,
                    ConsignmentStock.remaining_qty > 0,
                )
                .order_by(ConsignmentStock.id)
                .limit(1)
                .with_for_update()
                .execution_options(populate_existing=True)
            )
        ).scalar_one_or_none()

    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Consignment stock not found")
    if _d(row.remaining_qty) + Decimal("0.0001") < qty:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient consignment remaining ({row.remaining_qty})",
        )

    row.consumed_qty = _q(_d(row.consumed_qty) + qty)
    row.remaining_qty = _q(_d(row.remaining_qty) - qty)
    row.is_billed = False
    row.updated_at = datetime.utcnow()

    # Issue from warehouse (consumption)
    out_mv = StockMovement(
        tenant_id=tenant.id,
        item_id=row.item_id,
        warehouse_id=row.warehouse_id,
        movement_type="OUT",
        quantity=qty,
        reference_type="CONSIGNMENT",
        reference_id=row.id,
        movement_date=today_local(tenant),
        notes="Consignment consumption",
        movement_kind="CONSIGNMENT_CONSUME",
        vendor_id=row.vendor_id,
    )
    db.add(out_mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, out_mv)
    await db.flush()
    return row


async def settle_consignment(
    db: AsyncSession,
    tenant: Tenant,
    *,
    vendor_id: int,
    consignment_id: int | None = None,
) -> dict[str, Any]:
    """Bill unbilled consumed qty — create a DRAFT PO for the vendor."""
    if not is_consignment_stock_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Consignment stock is disabled")

    vendor = await db.get(Vendor, vendor_id)
    if not vendor or vendor.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor not found")

    q = select(ConsignmentStock).where(
        ConsignmentStock.tenant_id == tenant.id,
        ConsignmentStock.vendor_id == vendor_id,
    )
    if consignment_id:
        q = q.where(ConsignmentStock.id == consignment_id)
    rows = list((await db.execute(q)).scalars().all())

    to_bill: list[tuple[ConsignmentStock, Decimal]] = []
    for r in rows:
        unbilled = _q(_d(r.consumed_qty) - _d(r.billed_qty))
        if unbilled > ZERO:
            to_bill.append((r, unbilled))

    if not to_bill:
        raise HTTPException(status_code=400, detail="No unbilled consumed qty to settle")

    po_code = await next_tenant_code(db, model=PurchaseOrder, tenant_id=tenant.id, prefix="PO-CNS-", width=4)
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=po_code,
        vendor_id=vendor_id,
        supplier_name=vendor.name,
        order_date=today_local(tenant),
        status="DRAFT",
        notes="Consignment settlement",
        currency=getattr(vendor, "default_currency", None) or "BDT",
    )
    db.add(po)
    await db.flush()

    lines_out = []
    for r, unbilled in to_bill:
        item = await db.get(Item, r.item_id)
        unit = _d(r.unit_cost) or (_d(item.avg_cost) if item else ZERO) or (_d(item.default_cost) if item else ZERO)
        db.add(
            PurchaseOrderItem(
                tenant_id=tenant.id,
                purchase_order_id=po.id,
                item_id=r.item_id,
                warehouse_id=r.warehouse_id,
                quantity=unbilled,
                unit_price=_q(unit),
            )
        )
        r.billed_qty = _q(_d(r.billed_qty) + unbilled)
        if _d(r.billed_qty) + Decimal("0.0001") >= _d(r.consumed_qty) and _d(r.remaining_qty) <= ZERO:
            r.is_billed = True
        r.last_settled_at = datetime.utcnow()
        r.updated_at = datetime.utcnow()
        lines_out.append(
            {
                "consignment_id": r.id,
                "item_id": r.item_id,
                "billed_qty": str(unbilled),
                "unit_cost": str(_q(unit)),
            }
        )

    await db.flush()
    logger.info(
        "consignment_settled tenant=%s vendor=%s po=%s lines=%s",
        tenant.id,
        vendor_id,
        po.id,
        len(lines_out),
    )
    return {
        "purchase_order_id": po.id,
        "po_code": po.po_code,
        "vendor_id": vendor_id,
        "lines": lines_out,
        "message": f"Draft PO {po.po_code} created for consumed consignment",
    }


async def list_consignments(
    db: AsyncSession,
    tenant_id: int,
    *,
    vendor_id: int | None = None,
    limit: int = 200,
) -> list[ConsignmentStock]:
    q = select(ConsignmentStock).where(ConsignmentStock.tenant_id == tenant_id)
    if vendor_id is not None:
        q = q.where(ConsignmentStock.vendor_id == vendor_id)
    q = q.order_by(ConsignmentStock.id.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def consignment_to_dict(db: AsyncSession, row: ConsignmentStock) -> dict[str, Any]:
    vendor = await db.get(Vendor, row.vendor_id)
    item = await db.get(Item, row.item_id)
    wh = await db.get(Warehouse, row.warehouse_id)
    unbilled = _q(_d(row.consumed_qty) - _d(row.billed_qty))
    return {
        "id": row.id,
        "vendor_id": row.vendor_id,
        "vendor_name": vendor.name if vendor else None,
        "item_id": row.item_id,
        "item_code": item.item_code if item else None,
        "item_name": item.name if item else None,
        "warehouse_id": row.warehouse_id,
        "warehouse_name": wh.name if wh else None,
        "consigned_qty": str(_q(_d(row.consigned_qty))),
        "consumed_qty": str(_q(_d(row.consumed_qty))),
        "remaining_qty": str(_q(_d(row.remaining_qty))),
        "billed_qty": str(_q(_d(row.billed_qty))),
        "unbilled_consumed_qty": str(unbilled),
        "is_billed": bool(row.is_billed),
        "unit_cost": str(_q(_d(row.unit_cost))) if row.unit_cost is not None else None,
        "agreement_date": row.agreement_date.isoformat() if row.agreement_date else None,
        "settlement_terms_days": row.settlement_terms_days,
        "notes": row.notes,
    }
