"""Phase 7 lite: material rolls + shade-band enforcement (flag material_budget_plan_v1)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_material_budget_plan_v1_enabled
from app.database import safe_async_session_rollback
from app.models.costing import Item
from app.models.inventory import GoodsReceivingItem, InventoryCostLayer, Warehouse
from app.models.material_control_alloc import MaterialRoll
from app.models.merch import GarmentStyle, StyleColorway
from app.models.tenant import Tenant


def require_budget_plan_flag(tenant: Tenant) -> None:
    if not is_material_budget_plan_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _norm_shade(value: str | None) -> str | None:
    if value is None:
        return None
    s = str(value).strip().upper()
    return s or None


async def _find_by_request(
    db: AsyncSession, *, tenant_id: int, request_id: str
) -> MaterialRoll | None:
    return (
        await db.execute(
            select(MaterialRoll)
            .where(MaterialRoll.tenant_id == tenant_id, MaterialRoll.request_id == request_id)
            .with_for_update()
        )
    ).scalar_one_or_none()


async def create_roll(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    item_id: int,
    warehouse_id: int,
    qty: Decimal | float | str | int,
    shade_band: str | None = None,
    width_cm: str | None = None,
    lot_number: str | None = None,
    grn_item_id: int | None = None,
    cost_layer_id: int | None = None,
    style_id: int | None = None,
    colorway_id: int | None = None,
    notes: str | None = None,
    request_id: str | None = None,
) -> MaterialRoll:
    require_budget_plan_flag(tenant)
    qty_dec = Decimal(str(qty))
    if qty_dec <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")

    if request_id:
        existing = await _find_by_request(db, tenant_id=tenant.id, request_id=request_id)
        if existing is not None:
            return existing

    try:
        await ensure_owned(db, Item, item_id, tenant.id, "Item", status_code=404)
        await ensure_owned(db, Warehouse, warehouse_id, tenant.id, "Warehouse", status_code=404)
        await ensure_owned(db, GarmentStyle, style_id, tenant.id, "Style", status_code=404)
        await ensure_owned(db, StyleColorway, colorway_id, tenant.id, "Colorway", status_code=404)
        await ensure_owned(db, InventoryCostLayer, cost_layer_id, tenant.id, "Cost layer", status_code=404)

        if grn_item_id is not None:
            gri = await ensure_owned(
                db, GoodsReceivingItem, grn_item_id, tenant.id, "GRN line", status_code=404
            )
            assert gri is not None
            if gri.item_id != item_id:
                raise HTTPException(status_code=400, detail="GRN line item mismatch")
            if not shade_band and gri.shade_band:
                shade_band = gri.shade_band
            if not width_cm and gri.width_cm:
                width_cm = gri.width_cm
            if not lot_number and gri.lot_number:
                lot_number = gri.lot_number
            if style_id is None and gri.style_id:
                style_id = gri.style_id
            if colorway_id is None and gri.colorway_id:
                colorway_id = gri.colorway_id

        roll_code = await next_tenant_code(db, model=MaterialRoll, tenant_id=tenant.id, prefix="ROLL-", width=4)
        row = MaterialRoll(
            tenant_id=tenant.id,
            roll_code=roll_code,
            item_id=item_id,
            warehouse_id=warehouse_id,
            grn_item_id=grn_item_id,
            cost_layer_id=cost_layer_id,
            style_id=style_id,
            colorway_id=colorway_id,
            lot_number=lot_number,
            shade_band=_norm_shade(shade_band),
            width_cm=(str(width_cm).strip() if width_cm else None) or None,
            qty=qty_dec,
            qty_remaining=qty_dec,
            status="AVAILABLE",
            notes=notes,
            request_id=request_id,
            created_by_user_id=user_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        db.add(row)
        try:
            await db.flush()
        except IntegrityError:
            await safe_async_session_rollback(db)
            if request_id:
                existing = await _find_by_request(db, tenant_id=tenant.id, request_id=request_id)
                if existing is not None:
                    return existing
            raise
        return row
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


async def list_rolls(
    db: AsyncSession,
    *,
    tenant: Tenant,
    item_id: int | None = None,
    warehouse_id: int | None = None,
    shade_band: str | None = None,
    available_only: bool = True,
    limit: int = 100,
) -> list[MaterialRoll]:
    require_budget_plan_flag(tenant)
    q = select(MaterialRoll).where(MaterialRoll.tenant_id == tenant.id)
    if item_id is not None:
        q = q.where(MaterialRoll.item_id == item_id)
    if warehouse_id is not None:
        q = q.where(MaterialRoll.warehouse_id == warehouse_id)
    if shade_band:
        q = q.where(MaterialRoll.shade_band == _norm_shade(shade_band))
    if available_only:
        q = q.where(MaterialRoll.status == "AVAILABLE", MaterialRoll.qty_remaining > 0)
    q = q.order_by(MaterialRoll.id.desc()).limit(min(max(limit, 1), 500))
    return list((await db.execute(q)).scalars().all())


async def assert_shade_compatible(
    db: AsyncSession,
    *,
    tenant: Tenant,
    item_id: int,
    warehouse_id: int,
    required_shade_band: str,
    qty_needed: Decimal | float | str | int | None = None,
) -> None:
    """409 when shaded rolls exist for item/wh but none match (or matching qty too low)."""
    require_budget_plan_flag(tenant)
    need = _norm_shade(required_shade_band)
    if not need:
        return

    shaded = list(
        (
            await db.execute(
                select(MaterialRoll).where(
                    MaterialRoll.tenant_id == tenant.id,
                    MaterialRoll.item_id == item_id,
                    MaterialRoll.warehouse_id == warehouse_id,
                    MaterialRoll.status == "AVAILABLE",
                    MaterialRoll.qty_remaining > 0,
                    MaterialRoll.shade_band.is_not(None),
                )
            )
        )
        .scalars()
        .all()
    )
    if not shaded:
        # No shade-tracked stock → do not block legacy issues.
        return

    matching = [r for r in shaded if _norm_shade(r.shade_band) == need]
    if not matching:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"SHADE_MISMATCH: no available rolls with shade_band={need}",
        )
    if qty_needed is not None:
        need_qty = Decimal(str(qty_needed))
        avail = sum((Decimal(str(r.qty_remaining)) for r in matching), Decimal("0"))
        if avail + Decimal("0.0001") < need_qty:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SHADE_QTY_SHORT: shade {need} available {avail}, need {need_qty}",
            )


async def consume_roll(
    db: AsyncSession,
    *,
    tenant: Tenant,
    roll_id: int,
    qty: Decimal | float | str | int,
    required_shade_band: str | None = None,
    expected_item_id: int | None = None,
    expected_warehouse_id: int | None = None,
) -> MaterialRoll:
    require_budget_plan_flag(tenant)
    qty_dec = Decimal(str(qty))
    if qty_dec <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")

    row = (
        await db.execute(
            select(MaterialRoll)
            .where(MaterialRoll.id == roll_id, MaterialRoll.tenant_id == tenant.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Roll not found")
    if row.status != "AVAILABLE":
        raise HTTPException(status_code=409, detail="Roll is not available")
    if expected_item_id is not None and row.item_id != expected_item_id:
        raise HTTPException(status_code=400, detail="Roll item mismatch")
    if expected_warehouse_id is not None and row.warehouse_id != expected_warehouse_id:
        raise HTTPException(status_code=400, detail="Roll warehouse mismatch")

    need = _norm_shade(required_shade_band)
    if need:
        roll_shade = _norm_shade(row.shade_band)
        if not roll_shade:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SHADE_MISMATCH: roll {row.roll_code} has no shade_band, need {need}",
            )
        if roll_shade != need:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"SHADE_MISMATCH: roll {row.roll_code} is {row.shade_band}, need {need}",
            )

    rem = Decimal(str(row.qty_remaining))
    if rem + Decimal("0.0001") < qty_dec:
        raise HTTPException(status_code=409, detail="Insufficient roll qty")
    row.qty_remaining = rem - qty_dec
    if row.qty_remaining <= 0:
        row.qty_remaining = Decimal("0")
        row.status = "CONSUMED"
    row.updated_at = datetime.utcnow()
    await db.flush()
    return row


def roll_to_dict(row: MaterialRoll) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "roll_code": row.roll_code,
        "item_id": row.item_id,
        "warehouse_id": row.warehouse_id,
        "grn_item_id": row.grn_item_id,
        "cost_layer_id": row.cost_layer_id,
        "style_id": row.style_id,
        "colorway_id": row.colorway_id,
        "lot_number": row.lot_number,
        "shade_band": row.shade_band,
        "width_cm": row.width_cm,
        "qty": str(row.qty),
        "qty_remaining": str(row.qty_remaining),
        "status": row.status,
        "notes": row.notes,
        "request_id": row.request_id,
    }
