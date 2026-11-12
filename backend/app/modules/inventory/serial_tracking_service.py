"""Serial number tracking (Sprint I4)."""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.tenant_feature_keys import is_serial_tracking_enabled
from app.models import Tenant
from app.models.costing import Item
from app.models.inventory import (
    DeliveryChallan,
    DeliveryChallanItem,
    GoodsReceiving,
    GoodsReceivingItem,
    StockMovement,
    StockSerial,
    Warehouse,
)

logger = logging.getLogger(__name__)


def _int_qty(qty: Any) -> int:
    try:
        n = int(Decimal(str(qty or 0)))
        return max(n, 0)
    except Exception:
        return 0


async def create_serials_on_grn(
    db: AsyncSession,
    tenant: Tenant,
    *,
    item: Item,
    grn_item: GoodsReceivingItem,
    qty: Any,
    warehouse_id: int | None,
    serial_numbers: list[str] | None = None,
    warranty_days: int | None = None,
) -> list[StockSerial]:
    """Create IN_STOCK serials for a GRN line when serial tracking is enabled."""
    if not is_serial_tracking_enabled(tenant.feature_flags):
        return []
    if not getattr(item, "serial_tracking_enabled", False):
        return []

    count = _int_qty(qty)
    if count <= 0:
        return []

    # Cap auto-create to avoid huge inserts from bad qty
    if count > 500:
        raise HTTPException(
            status_code=400,
            detail="Serial tracking receives at most 500 units per GRN line",
        )

    provided = [s.strip() for s in (serial_numbers or []) if s and str(s).strip()]
    if provided and len(provided) != count:
        raise HTTPException(
            status_code=400,
            detail=f"Expected {count} serial numbers, got {len(provided)}",
        )

    created: list[StockSerial] = []
    w_start = today_local(tenant)
    w_end = w_start + timedelta(days=warranty_days) if warranty_days else None
    slug = uuid.uuid4().hex[:6].upper()

    for i in range(count):
        sn = provided[i] if provided else f"SN-{item.item_code[:8]}-{slug}-{i + 1:04d}"
        existing = (
            await db.execute(
                select(StockSerial.id).where(
                    StockSerial.tenant_id == tenant.id,
                    StockSerial.serial_number == sn,
                )
            )
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail=f"Serial already exists: {sn}")
        row = StockSerial(
            tenant_id=tenant.id,
            item_id=item.id,
            serial_number=sn,
            status="IN_STOCK",
            warehouse_id=warehouse_id or grn_item.warehouse_id,
            grn_item_id=grn_item.id,
            warranty_start=w_start if warranty_days else None,
            warranty_end=w_end,
        )
        db.add(row)
        created.append(row)

    await db.flush()
    logger.info(
        "serials_created tenant=%s item=%s grn_item=%s count=%s",
        tenant.id,
        item.id,
        grn_item.id,
        len(created),
    )
    return created


async def _owned_or_none(db: AsyncSession, model: Any, obj_id: int | None, tenant_id: int) -> Any:
    """Linked row for display, or None when it is missing or belongs to another tenant."""
    if not obj_id:
        return None
    obj = await db.get(model, obj_id)
    return obj if obj is not None and obj.tenant_id == tenant_id else None


async def import_serials_csv(
    db: AsyncSession,
    tenant: Tenant,
    *,
    rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Import serials: each row needs item_id + serial_number (+ optional warehouse_id)."""
    if not is_serial_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Serial tracking is disabled")
    created = 0
    errors: list[str] = []
    for idx, row in enumerate(rows, start=1):
        try:
            item_id = int(row.get("item_id") or 0)
            sn = str(row.get("serial_number") or "").strip()
        except (TypeError, ValueError):
            errors.append(f"row {idx}: item_id must be a number")
            continue
        if not item_id or not sn:
            errors.append(f"row {idx}: item_id and serial_number required")
            continue
        try:
            # One savepoint per row: a failed row is undone on its own and the session stays usable.
            async with db.begin_nested():
                item = await db.get(Item, item_id)
                if not item or item.tenant_id != tenant.id:
                    errors.append(f"row {idx}: item not found")
                    continue
                exists = (
                    await db.execute(
                        select(StockSerial.id).where(
                            StockSerial.tenant_id == tenant.id,
                            StockSerial.serial_number == sn,
                        )
                    )
                ).first()
                if exists:
                    errors.append(f"row {idx}: duplicate {sn}")
                    continue
                wh = row.get("warehouse_id")
                if wh:
                    wh_row = await db.get(Warehouse, int(wh))
                    if not wh_row or wh_row.tenant_id != tenant.id:
                        errors.append(f"row {idx}: warehouse not found")
                        continue
                db.add(
                    StockSerial(
                        tenant_id=tenant.id,
                        item_id=item_id,
                        serial_number=sn,
                        status=str(row.get("status") or "IN_STOCK").upper(),
                        warehouse_id=int(wh) if wh else item.default_warehouse_id,
                        notes=row.get("notes"),
                    )
                )
                await db.flush()
            created += 1
        except Exception:
            logger.warning("serial import row %s failed tenant_id=%s", idx, tenant.id, exc_info=True)
            errors.append(f"row {idx}: could not be saved")
    await db.flush()
    return {"created": created, "errors": errors}


async def issue_serials(
    db: AsyncSession,
    tenant: Tenant,
    *,
    serial_ids: list[int],
    status: str = "ISSUED",
    dc_item_id: int | None = None,
) -> list[StockSerial]:
    if not is_serial_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Serial tracking is disabled")
    status = status.upper()
    if status not in ("ISSUED", "SOLD", "SCRAPPED"):
        raise HTTPException(status_code=400, detail="Invalid serial status")
    if dc_item_id is not None:
        dci = await db.get(DeliveryChallanItem, dc_item_id)
        if not dci or dci.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail=f"Delivery challan line {dc_item_id} not found")
    out: list[StockSerial] = []
    for sid in serial_ids:
        row = await db.get(StockSerial, sid)
        if not row or row.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Serial {sid} not found")
        if row.status != "IN_STOCK":
            raise HTTPException(status_code=400, detail=f"Serial {row.serial_number} is {row.status}")
        row.status = status
        row.dc_item_id = dc_item_id
        row.updated_at = datetime.utcnow()
        out.append(row)
    await db.flush()
    return out


async def list_serials(
    db: AsyncSession,
    tenant_id: int,
    *,
    item_id: int | None = None,
    status: str | None = None,
    q: str | None = None,
    limit: int = 200,
) -> list[StockSerial]:
    stmt = select(StockSerial).where(StockSerial.tenant_id == tenant_id)
    if item_id is not None:
        stmt = stmt.where(StockSerial.item_id == item_id)
    if status:
        stmt = stmt.where(StockSerial.status == status.upper())
    if q:
        stmt = stmt.where(StockSerial.serial_number.ilike(f"%{q.strip()}%"))
    stmt = stmt.order_by(StockSerial.id.desc()).limit(limit)
    return list((await db.execute(stmt)).scalars().all())


async def trace_serial(
    db: AsyncSession,
    tenant_id: int,
    serial_number: str,
) -> dict[str, Any]:
    row = (
        await db.execute(
            select(StockSerial).where(
                StockSerial.tenant_id == tenant_id,
                StockSerial.serial_number == serial_number.strip(),
            )
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Serial not found")

    item = await _owned_or_none(db, Item, row.item_id, tenant_id)
    wh = await _owned_or_none(db, Warehouse, row.warehouse_id, tenant_id)
    grn_code = None
    grn_id = None
    gri = await _owned_or_none(db, GoodsReceivingItem, row.grn_item_id, tenant_id)
    if gri:
        grn = await _owned_or_none(db, GoodsReceiving, gri.goods_receiving_id, tenant_id)
        if grn:
            grn_code = grn.grn_code
            grn_id = grn.id
    dc_code = None
    dc_id = None
    dci = await _owned_or_none(db, DeliveryChallanItem, row.dc_item_id, tenant_id)
    if dci:
        dc = await _owned_or_none(db, DeliveryChallan, dci.challan_id, tenant_id)
        if dc:
            dc_code = dc.challan_code
            dc_id = dc.id

    movements: list[dict[str, Any]] = []
    if row.grn_item_id:
        mvs = (
            await db.execute(
                select(StockMovement)
                .where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.goods_receiving_item_id == row.grn_item_id,
                )
                .order_by(StockMovement.id)
            )
        ).scalars().all()
        for m in mvs:
            movements.append(
                {
                    "id": m.id,
                    "movement_type": m.movement_type,
                    "quantity": str(m.quantity),
                    "movement_date": m.movement_date.isoformat() if m.movement_date else None,
                    "reference_type": m.reference_type,
                    "movement_kind": m.movement_kind,
                }
            )

    return {
        "id": row.id,
        "serial_number": row.serial_number,
        "status": row.status,
        "item_id": row.item_id,
        "item_code": item.item_code if item else None,
        "item_name": item.name if item else None,
        "warehouse_id": row.warehouse_id,
        "warehouse_name": wh.name if wh else None,
        "grn_item_id": row.grn_item_id,
        "grn_id": grn_id,
        "grn_code": grn_code,
        "dc_item_id": row.dc_item_id,
        "dc_id": dc_id,
        "dc_code": dc_code,
        "warranty_start": row.warranty_start.isoformat() if row.warranty_start else None,
        "warranty_end": row.warranty_end.isoformat() if row.warranty_end else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
        "movements": movements,
        "lifecycle": [
            {"event": "CREATED", "at": row.created_at.isoformat() if row.created_at else None, "ref": grn_code},
            *[{"event": m["movement_type"], "at": m["movement_date"], "ref": m.get("movement_kind")} for m in movements],
            {"event": row.status, "at": None, "ref": dc_code},
        ],
    }


async def serial_to_dict(db: AsyncSession, row: StockSerial) -> dict[str, Any]:
    tid = row.tenant_id
    item = await _owned_or_none(db, Item, row.item_id, tid)
    wh = await _owned_or_none(db, Warehouse, row.warehouse_id, tid)
    grn_code = None
    gri = await _owned_or_none(db, GoodsReceivingItem, row.grn_item_id, tid)
    if gri:
        grn = await _owned_or_none(db, GoodsReceiving, gri.goods_receiving_id, tid)
        grn_code = grn.grn_code if grn else None
    dc_code = None
    dci = await _owned_or_none(db, DeliveryChallanItem, row.dc_item_id, tid)
    if dci:
        dc = await _owned_or_none(db, DeliveryChallan, dci.challan_id, tid)
        dc_code = dc.challan_code if dc else None
    return {
        "id": row.id,
        "serial_number": row.serial_number,
        "status": row.status,
        "item_id": row.item_id,
        "item_code": item.item_code if item else None,
        "item_name": item.name if item else None,
        "warehouse_id": row.warehouse_id,
        "warehouse_name": wh.name if wh else None,
        "grn_item_id": row.grn_item_id,
        "grn_code": grn_code,
        "dc_item_id": row.dc_item_id,
        "dc_code": dc_code,
        "warranty_start": row.warranty_start.isoformat() if row.warranty_start else None,
        "warranty_end": row.warranty_end.isoformat() if row.warranty_end else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }
