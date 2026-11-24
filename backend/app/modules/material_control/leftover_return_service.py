"""Phase 4: return bought leftover material to store (same item) via FIFO IN."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.ownership import ensure_owned
from app.common.tenant_feature_keys import is_material_conversion_v1_enabled
from app.database import safe_async_session_rollback
from app.models.costing import Item
from app.models.inventory import InventoryCostLayer, StockMovement, Warehouse
from app.models.material_control_alloc import MaterialLeftoverReturn
from app.models.merch import GarmentStyle, Order
from app.models.tenant import Tenant
from app.services.fifo_inventory import finalize_movement_fifo


def require_conversion_flag(tenant: Tenant) -> None:
    if not is_material_conversion_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")


async def _find_leftover_by_request(
    db: AsyncSession, *, tenant_id: int, request_id: str
) -> MaterialLeftoverReturn | None:
    return (
        await db.execute(
            select(MaterialLeftoverReturn)
            .where(
                MaterialLeftoverReturn.tenant_id == tenant_id,
                MaterialLeftoverReturn.request_id == request_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()


async def return_leftover_to_store(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int,
    item_id: int,
    warehouse_id: int,
    qty: Decimal | float | str | int,
    order_id: int | None = None,
    style_id: int | None = None,
    cost_layer_id: int | None = None,
    unit_cost: Decimal | float | str | int | None = None,
    request_id: str | None = None,
    notes: str | None = None,
) -> MaterialLeftoverReturn:
    """Create StockMovement IN + finalize_movement_fifo for leftover return (same item)."""
    require_conversion_flag(tenant)
    qty_dec = Decimal(str(qty))
    if qty_dec <= 0:
        raise HTTPException(status_code=400, detail="qty must be positive")

    if request_id:
        existing = await _find_leftover_by_request(db, tenant_id=tenant.id, request_id=request_id)
        if existing is not None:
            return existing

    try:
        await ensure_owned(db, Item, item_id, tenant.id, "Item", status_code=404)
        await ensure_owned(db, Warehouse, warehouse_id, tenant.id, "Warehouse", status_code=404)
        await ensure_owned(db, Order, order_id, tenant.id, "Order", status_code=404)
        await ensure_owned(db, GarmentStyle, style_id, tenant.id, "Style", status_code=404)

        # FIFO inbound API still takes float; keep Decimal until the call boundary (MC-SEC-07).
        in_cost_dec: Decimal | None = None
        if cost_layer_id is not None:
            layer = await ensure_owned(
                db, InventoryCostLayer, cost_layer_id, tenant.id, "Cost layer", status_code=404
            )
            assert layer is not None
            if layer.item_id != item_id:
                raise HTTPException(status_code=400, detail="Cost layer item mismatch")
            in_cost_dec = Decimal(str(layer.unit_cost or 0))
        elif unit_cost is not None:
            in_cost_dec = Decimal(str(unit_cost))
        in_cost = float(in_cost_dec) if in_cost_dec is not None else None

        row = MaterialLeftoverReturn(
            tenant_id=tenant.id,
            order_id=order_id,
            style_id=style_id,
            item_id=item_id,
            warehouse_id=warehouse_id,
            qty=qty_dec,
            cost_layer_id=cost_layer_id,
            status="POSTING",
            request_id=request_id,
            notes=notes,
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
                existing = await _find_leftover_by_request(db, tenant_id=tenant.id, request_id=request_id)
                if existing is not None:
                    return existing
            raise

        movement = StockMovement(
            tenant_id=tenant.id,
            item_id=item_id,
            warehouse_id=warehouse_id,
            movement_type="IN",
            quantity=qty_dec,
            movement_date=today_local(tenant),
            reference_type="MATERIAL_LEFTOVER_RETURN",
            reference_id=row.id,
            movement_kind="LEFTOVER_RETURN",
            order_id=order_id,
            created_by_user_id=user_id,
        )
        db.add(movement)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, movement, in_unit_cost=in_cost)

        row.stock_movement_id = movement.id
        row.status = "POSTED"
        row.updated_at = datetime.utcnow()
        await db.flush()
        return row
    except HTTPException:
        await safe_async_session_rollback(db)
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


def leftover_to_dict(row: MaterialLeftoverReturn) -> dict:
    return {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "order_id": row.order_id,
        "style_id": row.style_id,
        "item_id": row.item_id,
        "warehouse_id": row.warehouse_id,
        "qty": str(row.qty),
        "cost_layer_id": row.cost_layer_id,
        "status": row.status,
        "stock_movement_id": row.stock_movement_id,
        "voucher_id": row.voucher_id,
        "request_id": row.request_id,
    }
