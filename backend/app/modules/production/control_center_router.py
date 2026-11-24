"""Unified Production Control Center read APIs (flag ``prod_control_center_v1``)."""
from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_cutting_loss_control_v1_enabled,
    is_floor_live_monitor_v1_enabled,
    is_mfg_machine_match_v1_enabled,
    is_prod_control_center_v1_enabled,
    is_tna_auto_plan_v1_enabled,
)
from app.database import get_db
from app.models import Order, Tenant, User
from app.modules.mfg_intelligence.feeding_readiness_service import feeding_readiness_upcoming
from app.modules.merch.tna_slip_service import get_order_tna_slip_warnings
from app.modules.production.cutting_control_service import order_consumption_variance
from app.modules.production.floor_monitor_service import live_board

router = APIRouter(prefix="/production/control-center", tags=["production-control-center"])


def _ensure(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    if not is_prod_control_center_v1_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/summary")
async def control_center_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    limit: int = Query(50, ge=1, le=200),
):
    """Order readiness matrix: delivery date, TNA slip, feeding gate."""
    _ensure(user, tenant)
    as_of = today_local(tenant)
    orders = list(
        (
            await db.execute(
                select(Order)
                .where(
                    Order.tenant_id == tenant.id,
                    Order.status.in_(("NEW", "CONFIRMED", "IN_PROGRESS")),
                )
                .order_by(Order.delivery_date.asc().nulls_last(), Order.id.desc())
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    items = []
    for o in orders:
        slips = []
        if is_tna_auto_plan_v1_enabled(tenant.feature_flags):
            slips = await get_order_tna_slip_warnings(db, tenant=tenant, order_id=o.id)
        max_slip = max((s.get("slip_days") or 0 for s in slips), default=0)
        items.append(
            {
                "order_id": o.id,
                "order_code": o.order_code,
                "status": o.status,
                "delivery_date": o.delivery_date.isoformat() if o.delivery_date else None,
                "quantity": str(o.quantity or 0),
                "tna_slip_days": max_slip,
                "tna_warnings": slips[:5],
                "tna_health": "critical" if max_slip >= 14 else "warning" if max_slip >= 3 else "ok",
            }
        )
    feeding = await feeding_readiness_upcoming(db, tenant=tenant, within_days=14, limit=50)
    return {
        "as_of": as_of.isoformat(),
        "orders": items,
        "feeding": feeding,
        "flags": {
            "tna_auto_plan_v1": is_tna_auto_plan_v1_enabled(tenant.feature_flags),
            "mfg_machine_match_v1": is_mfg_machine_match_v1_enabled(tenant.feature_flags),
            "cutting_loss_control_v1": is_cutting_loss_control_v1_enabled(tenant.feature_flags),
            "floor_live_monitor_v1": is_floor_live_monitor_v1_enabled(tenant.feature_flags),
        },
    }


@router.get("/floor-board")
async def control_center_floor(
    production_date: date | None = Query(None),
    factory_unit: str | None = Query(None, max_length=64),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    d = production_date or today_local(tenant)
    return await live_board(db, tenant=tenant, production_date=d, factory_unit=factory_unit)


@router.get("/orders/{order_id}/cutting-variance")
async def control_center_cutting(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    return await order_consumption_variance(db, tenant=tenant, order_id=order_id)


@router.get("/orders/{order_id}/tna-slip")
async def control_center_tna_slip(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure(user, tenant)
    return {"order_id": order_id, "warnings": await get_order_tna_slip_warnings(db, tenant=tenant, order_id=order_id)}
