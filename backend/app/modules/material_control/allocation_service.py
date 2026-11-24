"""Phase 2B: allocate / release FIFO cost-layer qty to orders (shared stock)."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_material_alloc_ud_v1_enabled
from app.database import safe_async_session_rollback
from app.models.costing import Item
from app.models.inventory import InventoryCostLayer, Warehouse
from app.models.material_control_alloc import MaterialLayerAllocation
from app.models.merch import Order
from app.models.tenant import Tenant


def require_alloc_ud_flag(tenant: Tenant) -> None:
    if not is_material_alloc_ud_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


def _qty(value: Decimal | float | str | int) -> Decimal:
    q = Decimal(str(value))
    if q <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")
    return q.quantize(Decimal("0.0001"))


async def _active_allocated_sum(db: AsyncSession, *, tenant_id: int, cost_layer_id: int) -> Decimal:
    total = (
        await db.execute(
            select(func.coalesce(func.sum(MaterialLayerAllocation.qty_allocated), 0)).where(
                MaterialLayerAllocation.tenant_id == tenant_id,
                MaterialLayerAllocation.cost_layer_id == cost_layer_id,
                MaterialLayerAllocation.status == "ACTIVE",
            )
        )
    ).scalar_one()
    return Decimal(str(total or 0))


async def _find_alloc_by_request(
    db: AsyncSession, *, tenant_id: int, request_id: str
) -> MaterialLayerAllocation | None:
    return (
        await db.execute(
            select(MaterialLayerAllocation)
            .where(
                MaterialLayerAllocation.tenant_id == tenant_id,
                MaterialLayerAllocation.request_id == request_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


async def allocate_layer(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    cost_layer_id: int,
    qty: Decimal | float | str | int,
    order_id: int | None = None,
    style_id: int | None = None,
    colorway_id: int | None = None,
    request_id: str | None = None,
) -> MaterialLayerAllocation:
    """Lock cost layer; ensure remaining qty covers ACTIVE allocations + new qty."""
    require_alloc_ud_flag(tenant)
    qty_dec = _qty(qty)

    if request_id:
        existing = await _find_alloc_by_request(db, tenant_id=tenant.id, request_id=request_id)
        if existing is not None:
            return existing

    try:
        layer = (
            await db.execute(
                select(InventoryCostLayer)
                .where(
                    InventoryCostLayer.id == cost_layer_id,
                    InventoryCostLayer.tenant_id == tenant.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if layer is None:
            raise HTTPException(status_code=404, detail="Cost layer not found")

        from app.modules.material_control.style_tagging import resolve_style_colorway

        await ensure_owned(db, Item, layer.item_id, tenant.id, "Item", status_code=404)
        if layer.warehouse_id is not None:
            await ensure_owned(db, Warehouse, layer.warehouse_id, tenant.id, "Warehouse", status_code=404)
        await ensure_owned(db, Order, order_id, tenant.id, "Order", status_code=404)
        style_id, colorway_id = await resolve_style_colorway(
            db, tenant_id=tenant.id, style_id=style_id, colorway_id=colorway_id
        )

        remaining = Decimal(str(layer.qty_remaining or 0))
        already = await _active_allocated_sum(db, tenant_id=tenant.id, cost_layer_id=layer.id)
        if already + qty_dec > remaining:
            raise HTTPException(
                status_code=409,
                detail=f"Insufficient layer qty remaining (need {qty_dec}, available {remaining - already})",
            )

        if layer.warehouse_id is None:
            raise HTTPException(status_code=400, detail="Cost layer has no warehouse")

        row = MaterialLayerAllocation(
            tenant_id=tenant.id,
            cost_layer_id=layer.id,
            item_id=layer.item_id,
            warehouse_id=int(layer.warehouse_id),
            style_id=style_id,
            colorway_id=colorway_id,
            order_id=order_id,
            qty_allocated=qty_dec,
            qty_consumed=Decimal("0"),
            qty_released=Decimal("0"),
            status="ACTIVE",
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
                existing = await _find_alloc_by_request(db, tenant_id=tenant.id, request_id=request_id)
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


async def release_allocation(
    db: AsyncSession,
    *,
    tenant: Tenant,
    allocation_id: int,
) -> MaterialLayerAllocation:
    require_alloc_ud_flag(tenant)
    try:
        row = (
            await db.execute(
                select(MaterialLayerAllocation)
                .where(
                    MaterialLayerAllocation.id == allocation_id,
                    MaterialLayerAllocation.tenant_id == tenant.id,
                )
                .with_for_update()
            )
        ).scalar_one_or_none()
        if row is None:
            raise HTTPException(status_code=404, detail="Allocation not found")
        if row.status != "ACTIVE":
            raise HTTPException(status_code=409, detail="Allocation is not ACTIVE")
        row.qty_released = Decimal(str(row.qty_allocated or 0))
        row.status = "RELEASED"
        row.updated_at = datetime.utcnow()
        await db.flush()
        return row
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


def allocation_to_dict(row: MaterialLayerAllocation) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "cost_layer_id": row.cost_layer_id,
        "item_id": row.item_id,
        "warehouse_id": row.warehouse_id,
        "style_id": row.style_id,
        "colorway_id": row.colorway_id,
        "order_id": row.order_id,
        "qty_allocated": str(row.qty_allocated),
        "qty_consumed": str(row.qty_consumed),
        "qty_released": str(row.qty_released),
        "status": row.status,
        "request_id": row.request_id,
    }
