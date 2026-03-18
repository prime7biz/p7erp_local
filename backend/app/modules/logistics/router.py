"""Logistics API: shipment CRUD linked to trade cases."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Shipment, Tenant, TradeCase, User
from app.modules.audit.service import log_action
from app.modules.logistics.schemas import ShipmentCreate, ShipmentResponse, ShipmentUpdate

router = APIRouter(prefix="/logistics", tags=["logistics"])


def _to_response(row: Shipment) -> ShipmentResponse:
    return ShipmentResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        trade_case_id=row.trade_case_id,
        reference=row.reference,
        status=row.status,
        carrier=row.carrier,
        booking_ref=row.booking_ref,
        bl_awb=row.bl_awb,
        etd=row.etd.isoformat() if row.etd else None,
        eta=row.eta.isoformat() if row.eta else None,
        origin_port=row.origin_port,
        dest_port=row.dest_port,
        notes=row.notes,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _require_tenant_user(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/shipments", response_model=list[ShipmentResponse])
async def list_shipments(
    trade_case_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    stmt = select(Shipment).where(Shipment.tenant_id == tenant.id)
    if trade_case_id is not None:
        stmt = stmt.where(Shipment.trade_case_id == trade_case_id)
    if status_filter:
        stmt = stmt.where(Shipment.status == status_filter.strip().upper())
    result = await db.execute(stmt.order_by(Shipment.created_at.desc()).limit(limit).offset(offset))
    return [_to_response(r) for r in result.scalars().all()]


@router.get("/shipments/{shipment_id}", response_model=ShipmentResponse)
async def get_shipment(
    shipment_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    row = await db.get(Shipment, shipment_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Shipment not found")
    return _to_response(row)


@router.post("/shipments", response_model=ShipmentResponse, status_code=status.HTTP_201_CREATED)
async def create_shipment(
    body: ShipmentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    trade_case = await db.get(TradeCase, body.trade_case_id)
    if not trade_case or trade_case.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Trade case not found")
    row = Shipment(
        tenant_id=tenant.id,
        trade_case_id=body.trade_case_id,
        reference=body.reference,
        status=(body.status or "PLANNED").strip().upper(),
        carrier=body.carrier,
        booking_ref=body.booking_ref,
        bl_awb=body.bl_awb,
        etd=body.etd,
        eta=body.eta,
        origin_port=body.origin_port,
        dest_port=body.dest_port,
        notes=body.notes,
    )
    db.add(row)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SHIPMENT_CREATE",
        resource="trade.shipment",
        details=f"Created shipment {row.reference}",
    )
    await db.refresh(row)
    return _to_response(row)


@router.patch("/shipments/{shipment_id}", response_model=ShipmentResponse)
async def update_shipment(
    shipment_id: int,
    body: ShipmentUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    row = await db.get(Shipment, shipment_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Shipment not found")
    updates = body.model_dump(exclude_unset=True)
    if "status" in updates and updates["status"] is not None:
        updates["status"] = str(updates["status"]).strip().upper()
    for key, value in updates.items():
        setattr(row, key, value)
    await db.flush()
    await log_action(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        action="SHIPMENT_UPDATE",
        resource="trade.shipment",
        details=f"Updated shipment {row.reference}",
    )
    await db.refresh(row)
    return _to_response(row)
