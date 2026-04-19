from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.control_tower_flags import require_control_tower_enabled
from app.common.pagination import clamp_page_size
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.control_tower import schemas as ct_schemas
from app.modules.control_tower.service import (
    build_capacity_heatmap,
    build_master_lc_snapshot,
    build_order_timeline,
    count_orders_for_tower,
    fetch_control_tower_order_rows,
)

router = APIRouter(prefix="/control-tower", tags=["control-tower"])

_MAX_RANGE_DAYS = 180


def _ensure_tenant_user(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _validate_delivery_window(delivery_from: date, delivery_to: date) -> None:
    if delivery_to < delivery_from:
        raise HTTPException(status_code=400, detail="delivery_to must be on or after delivery_from")
    if (delivery_to - delivery_from).days > _MAX_RANGE_DAYS:
        raise HTTPException(
            status_code=400,
            detail=f"Date range must not exceed {_MAX_RANGE_DAYS} days",
        )


@router.get("/summary", response_model=ct_schemas.ControlTowerSummaryOut)
async def control_tower_summary(
    delivery_from: date = Query(..., description="Inclusive delivery date start"),
    delivery_to: date = Query(..., description="Inclusive delivery date end"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_control_tower_enabled(tenant)
    _validate_delivery_window(delivery_from, delivery_to)
    ps = min(clamp_page_size(limit), 200)
    total = await count_orders_for_tower(db, tenant_id=tenant.id, delivery_from=delivery_from, delivery_to=delivery_to)
    rows = await fetch_control_tower_order_rows(
        db,
        tenant_id=tenant.id,
        delivery_from=delivery_from,
        delivery_to=delivery_to,
        limit=ps,
        offset=offset,
    )
    return ct_schemas.ControlTowerSummaryOut(
        delivery_from=delivery_from,
        delivery_to=delivery_to,
        limit=ps,
        offset=offset,
        total=total,
        orders=[ct_schemas.ControlTowerOrderRow.model_validate(r) for r in rows],
    )


@router.get("/order/{order_id}/timeline", response_model=ct_schemas.ControlTowerTimelineOut)
async def control_tower_order_timeline(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_control_tower_enabled(tenant)
    payload = await build_order_timeline(db, tenant_id=tenant.id, order_id=order_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Order not found")
    return ct_schemas.ControlTowerTimelineOut.model_validate(payload)


@router.get("/master-lc/{master_contract_id}/snapshot", response_model=ct_schemas.ControlTowerLcSnapshotOut)
async def control_tower_master_lc_snapshot(
    master_contract_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_control_tower_enabled(tenant)
    payload = await build_master_lc_snapshot(db, tenant_id=tenant.id, master_contract_id=master_contract_id)
    if not payload:
        raise HTTPException(status_code=404, detail="Master contract not found")
    return ct_schemas.ControlTowerLcSnapshotOut.model_validate(payload)


@router.get("/capacity-heatmap", response_model=ct_schemas.ControlTowerCapacityHeatmapOut)
async def control_tower_capacity_heatmap(
    date_from: date = Query(...),
    date_to: date = Query(...),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant_user(user, tenant)
    require_control_tower_enabled(tenant)
    if date_to < date_from:
        raise HTTPException(status_code=400, detail="date_to must be on or after date_from")
    if (date_to - date_from).days > _MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"Date range must not exceed {_MAX_RANGE_DAYS} days")
    cells_raw = await build_capacity_heatmap(db, tenant_id=tenant.id, date_from=date_from, date_to=date_to)
    return ct_schemas.ControlTowerCapacityHeatmapOut(
        date_from=date_from,
        date_to=date_to,
        cells=[ct_schemas.CapacityHeatmapCell.model_validate(c) for c in cells_raw],
    )
