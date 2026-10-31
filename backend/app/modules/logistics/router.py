"""Logistics API: shipment CRUD, packing lists, and containers."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    DeliveryChallan,
    Order,
    PackingList,
    Shipment,
    ShipmentContainer,
    Tenant,
    TradeCase,
    User,
)
from app.modules.audit.service import log_action
from app.modules.logistics.schemas import (
    PackingListContainerCreate,
    PackingListCreate,
    PackingListResponse,
    PackingListUpdate,
    ShipmentContainerCreate,
    ShipmentContainerResponse,
    ShipmentContainerUpdate,
    ShipmentCreate,
    ShipmentResponse,
    ShipmentUpdate,
)

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

def _d(value: object | None) -> Decimal:
    if value is None:
        return Decimal("0")
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _remaining_capacity_kg(row: ShipmentContainer) -> float | None:
    """MVP: no packing_list_lines yet — capacity = max_weight - tare (cargo deferred)."""
    if row.max_weight_kg is None:
        return None
    max_w = _d(row.max_weight_kg)
    tare = _d(row.tare_weight_kg)
    remaining = max_w - tare
    if remaining < 0:
        remaining = Decimal("0")
    return float(remaining)


def _container_out(row: ShipmentContainer) -> ShipmentContainerResponse:
    return ShipmentContainerResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        shipment_id=row.shipment_id,
        packing_list_id=row.packing_list_id,
        container_number=row.container_number,
        container_type=row.container_type,
        seal_number=row.seal_number,
        tare_weight_kg=float(row.tare_weight_kg) if row.tare_weight_kg is not None else None,
        max_weight_kg=float(row.max_weight_kg) if row.max_weight_kg is not None else None,
        remaining_capacity_kg=_remaining_capacity_kg(row),
        loading_status=row.loading_status,
        loaded_at=row.loaded_at.isoformat() if row.loaded_at else None,
        notes=row.notes,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


async def _packing_list_lookups(db: AsyncSession, tenant_id: int, rows: list[PackingList]) -> dict[str, dict]:
    """Prefetch labels + container counts for a page of packing lists (4 queries total, not 4 per row)."""
    ship_ids = {r.shipment_id for r in rows if r.shipment_id}
    order_ids = {r.order_id for r in rows if r.order_id}
    dc_ids = {r.delivery_challan_id for r in rows if r.delivery_challan_id}
    pl_ids = [r.id for r in rows]
    ships = (
        dict(
            (await db.execute(
                select(Shipment.id, Shipment.reference).where(Shipment.tenant_id == tenant_id, Shipment.id.in_(ship_ids))
            )).all()
        )
        if ship_ids
        else {}
    )
    orders = (
        dict(
            (await db.execute(
                select(Order.id, Order.order_code).where(Order.tenant_id == tenant_id, Order.id.in_(order_ids))
            )).all()
        )
        if order_ids
        else {}
    )
    challans = (
        dict(
            (await db.execute(
                select(DeliveryChallan.id, DeliveryChallan.challan_code).where(
                    DeliveryChallan.tenant_id == tenant_id, DeliveryChallan.id.in_(dc_ids)
                )
            )).all()
        )
        if dc_ids
        else {}
    )
    counts = (
        dict(
            (await db.execute(
                select(ShipmentContainer.packing_list_id, func.count())
                .where(ShipmentContainer.tenant_id == tenant_id, ShipmentContainer.packing_list_id.in_(pl_ids))
                .group_by(ShipmentContainer.packing_list_id)
            )).all()
        )
        if pl_ids
        else {}
    )
    return {"ships": ships, "orders": orders, "challans": challans, "container_counts": counts}


async def _packing_out(
    db: AsyncSession,
    *,
    tenant_id: int,
    row: PackingList,
    include_containers: bool = False,
    lookups: dict[str, dict] | None = None,
) -> PackingListResponse:
    containers: list[ShipmentContainerResponse] = []
    if lookups is not None and not include_containers:
        shipment_reference = lookups["ships"].get(row.shipment_id) if row.shipment_id else None
        order_code = lookups["orders"].get(row.order_id) if row.order_id else None
        challan_code = lookups["challans"].get(row.delivery_challan_id) if row.delivery_challan_id else None
        container_count = int(lookups["container_counts"].get(row.id, 0))
    else:
        shipment_reference = None
        if row.shipment_id:
            ship = await db.get(Shipment, row.shipment_id)
            if ship and ship.tenant_id == tenant_id:
                shipment_reference = ship.reference

        order_code = None
        if row.order_id:
            order = await db.get(Order, row.order_id)
            if order and order.tenant_id == tenant_id:
                order_code = order.order_code

        challan_code = None
        if row.delivery_challan_id:
            challan = await db.get(DeliveryChallan, row.delivery_challan_id)
            if challan and challan.tenant_id == tenant_id:
                challan_code = challan.challan_code

        cont_rows = list(
            (
                await db.execute(
                    select(ShipmentContainer)
                    .where(
                        ShipmentContainer.tenant_id == tenant_id,
                        ShipmentContainer.packing_list_id == row.id,
                    )
                    .order_by(ShipmentContainer.id)
                )
            ).scalars().all()
        )
        container_count = len(cont_rows)
        if include_containers:
            containers = [_container_out(c) for c in cont_rows]

    gw = float(row.gross_weight) if row.gross_weight is not None else None
    nw = float(row.net_weight) if row.net_weight is not None else None
    return PackingListResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        packing_list_number=row.packing_list_number,
        shipment_id=row.shipment_id,
        shipment_reference=shipment_reference,
        order_id=row.order_id,
        order_code=order_code,
        delivery_challan_id=row.delivery_challan_id,
        challan_code=challan_code,
        packing_date=row.packing_date.isoformat() if row.packing_date else None,
        total_cartons=int(row.total_cartons or 0),
        gross_weight=gw,
        net_weight=nw,
        gross_weight_kg=gw,
        net_weight_kg=nw,
        status=row.status,
        notes=row.notes,
        container_count=container_count,
        containers=containers,
        created_at=row.created_at.isoformat() if row.created_at else "",
        updated_at=row.updated_at.isoformat() if row.updated_at else "",
    )


async def _next_packing_list_number(db: AsyncSession, *, tenant: Tenant) -> str:
    """PL-{company_code}-{YYYY}-{seq} truncated to 32 chars."""
    from datetime import datetime

    year = datetime.utcnow().year
    code = (tenant.company_code or f"T{tenant.id}").strip().upper()[:8]
    seq = await next_tenant_code(
        db,
        model=PackingList,
        tenant_id=tenant.id,
        prefix="",
        width=4,
    )
    # next_tenant_code with empty prefix returns zero-padded number.
    return f"PL-{code}-{year}-{seq}"[:32]


@router.get("/packing-lists", response_model=list[PackingListResponse])
async def list_packing_lists(
    order_id: int | None = Query(default=None),
    shipment_id: int | None = Query(default=None),
    delivery_challan_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    stmt = select(PackingList).where(PackingList.tenant_id == tenant.id)
    if order_id is not None:
        stmt = stmt.where(PackingList.order_id == order_id)
    if shipment_id is not None:
        stmt = stmt.where(PackingList.shipment_id == shipment_id)
    if delivery_challan_id is not None:
        stmt = stmt.where(PackingList.delivery_challan_id == delivery_challan_id)
    rows = list((await db.execute(stmt.order_by(PackingList.id.desc()).limit(limit))).scalars().all())
    lookups = await _packing_list_lookups(db, tenant.id, rows)
    return [
        await _packing_out(db, tenant_id=tenant.id, row=r, include_containers=False, lookups=lookups) for r in rows
    ]


@router.get("/packing-lists/{packing_list_id}", response_model=PackingListResponse)
async def get_packing_list(
    packing_list_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    row = await db.get(PackingList, packing_list_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Packing list not found")
    return await _packing_out(db, tenant_id=tenant.id, row=row, include_containers=True)


@router.post("/packing-lists", response_model=PackingListResponse, status_code=status.HTTP_201_CREATED)
async def create_packing_list(
    body: PackingListCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    if body.shipment_id is not None:
        ship = await db.get(Shipment, body.shipment_id)
        if not ship or ship.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Shipment not found")
    if body.order_id is not None:
        order = await db.get(Order, body.order_id)
        if not order or order.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Order not found")
    if body.delivery_challan_id is not None:
        challan = await db.get(DeliveryChallan, body.delivery_challan_id)
        if not challan or challan.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Delivery challan not found")

    number = (body.packing_list_number or "").strip()
    if not number:
        number = await _next_packing_list_number(db, tenant=tenant)
    else:
        dup = (
            await db.execute(
                select(PackingList.id).where(
                    PackingList.tenant_id == tenant.id,
                    PackingList.packing_list_number == number,
                )
            )
        ).scalar_one_or_none()
        if dup is not None:
            raise HTTPException(status_code=400, detail="Packing list number already exists")

    gross = body.gross_weight if body.gross_weight is not None else body.gross_weight_kg
    net = body.net_weight if body.net_weight is not None else body.net_weight_kg

    row = PackingList(
        tenant_id=tenant.id,
        packing_list_number=number[:32],
        shipment_id=body.shipment_id,
        order_id=body.order_id,
        delivery_challan_id=body.delivery_challan_id,
        packing_date=body.packing_date,
        total_cartons=int(body.total_cartons or 0),
        gross_weight=Decimal(str(gross)) if gross is not None else None,
        net_weight=Decimal(str(net)) if net is not None else None,
        status=(body.status or "DRAFT").strip().upper(),
        notes=body.notes,
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _packing_out(db, tenant_id=tenant.id, row=row, include_containers=True)


@router.patch("/packing-lists/{packing_list_id}", response_model=PackingListResponse)
async def update_packing_list(
    packing_list_id: int,
    body: PackingListUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    row = await db.get(PackingList, packing_list_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Packing list not found")
    if (row.status or "").upper() == "FINALIZED":
        raise HTTPException(status_code=400, detail="Cannot edit a FINALIZED packing list")
    updates = body.model_dump(exclude_unset=True)
    if "gross_weight_kg" in updates and "gross_weight" not in updates:
        updates["gross_weight"] = updates.pop("gross_weight_kg")
    else:
        updates.pop("gross_weight_kg", None)
    if "net_weight_kg" in updates and "net_weight" not in updates:
        updates["net_weight"] = updates.pop("net_weight_kg")
    else:
        updates.pop("net_weight_kg", None)
    if "status" in updates and updates["status"] is not None:
        updates["status"] = str(updates["status"]).strip().upper()
        if updates["status"] == "FINALIZED":
            raise HTTPException(status_code=400, detail="Use the finalize action to finalize a packing list")
    for key, model, label in (
        ("shipment_id", Shipment, "Shipment"),
        ("order_id", Order, "Order"),
        ("delivery_challan_id", DeliveryChallan, "Delivery challan"),
    ):
        ref_id = updates.get(key)
        if ref_id is not None:
            ref = await db.get(model, ref_id)
            if not ref or ref.tenant_id != tenant.id:
                raise HTTPException(status_code=400, detail=f"{label} not found")
    for key in ("gross_weight", "net_weight"):
        if key in updates and updates[key] is not None:
            updates[key] = Decimal(str(updates[key]))
    for key, value in updates.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return await _packing_out(db, tenant_id=tenant.id, row=row, include_containers=True)


@router.put("/packing-lists/{packing_list_id}/finalize", response_model=PackingListResponse)
async def finalize_packing_list(
    packing_list_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    row = await db.get(PackingList, packing_list_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Packing list not found")
    if (row.status or "").upper() == "FINALIZED":
        return await _packing_out(db, tenant_id=tenant.id, row=row, include_containers=True)

    container_n = list(
        (
            await db.execute(
                select(ShipmentContainer)
                .where(
                    ShipmentContainer.tenant_id == tenant.id,
                    ShipmentContainer.packing_list_id == row.id,
                )
            )
        ).scalars().all()
    )
    if not container_n:
        raise HTTPException(
            status_code=400,
            detail="Finalize requires at least one container on this packing list",
        )
    if int(row.total_cartons or 0) <= 0:
        raise HTTPException(
            status_code=400,
            detail="Finalize requires total_cartons > 0",
        )
    row.status = "FINALIZED"
    await db.commit()
    await db.refresh(row)
    return await _packing_out(db, tenant_id=tenant.id, row=row, include_containers=True)


@router.post(
    "/packing-lists/{packing_list_id}/containers",
    response_model=ShipmentContainerResponse,
    status_code=status.HTTP_201_CREATED,
)
async def add_container_to_packing_list(
    packing_list_id: int,
    body: PackingListContainerCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    pl = await db.get(PackingList, packing_list_id)
    if not pl or pl.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Packing list not found")
    if (pl.status or "").upper() == "FINALIZED":
        raise HTTPException(status_code=400, detail="Cannot add containers to a FINALIZED packing list")
    if not pl.shipment_id:
        raise HTTPException(
            status_code=400,
            detail="Packing list must be linked to a shipment before adding containers",
        )
    ship = await db.get(Shipment, pl.shipment_id)
    if not ship or ship.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Linked shipment not found")

    number = body.container_number.strip()
    dup = (
        await db.execute(
            select(ShipmentContainer.id).where(
                ShipmentContainer.tenant_id == tenant.id,
                ShipmentContainer.packing_list_id == pl.id,
                ShipmentContainer.container_number == number,
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(
            status_code=400,
            detail="Container number already exists on this packing list",
        )
    # Also enforce unique per shipment (legacy constraint).
    dup_ship = (
        await db.execute(
            select(ShipmentContainer.id).where(
                ShipmentContainer.tenant_id == tenant.id,
                ShipmentContainer.shipment_id == pl.shipment_id,
                ShipmentContainer.container_number == number,
            )
        )
    ).scalar_one_or_none()
    if dup_ship is not None:
        raise HTTPException(
            status_code=400,
            detail="Container number already exists on this shipment",
        )

    ctype = (body.container_type or "40GP").strip().upper()
    status_val = (body.loading_status or "EMPTY").strip().upper()
    if status_val == "SEALED":
        status_val = "CLOSED"

    row = ShipmentContainer(
        tenant_id=tenant.id,
        shipment_id=pl.shipment_id,
        packing_list_id=pl.id,
        container_number=number[:64],
        container_type=ctype[:32] if ctype else None,
        seal_number=body.seal_number,
        tare_weight_kg=Decimal(str(body.tare_weight_kg)) if body.tare_weight_kg is not None else None,
        max_weight_kg=Decimal(str(body.max_weight_kg)) if body.max_weight_kg is not None else None,
        loading_status=status_val,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _container_out(row)


@router.get("/containers", response_model=list[ShipmentContainerResponse])
async def list_containers(
    shipment_id: int | None = Query(default=None),
    packing_list_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    stmt = select(ShipmentContainer).where(ShipmentContainer.tenant_id == tenant.id)
    if shipment_id is not None:
        stmt = stmt.where(ShipmentContainer.shipment_id == shipment_id)
    if packing_list_id is not None:
        stmt = stmt.where(ShipmentContainer.packing_list_id == packing_list_id)
    rows = (await db.execute(stmt.order_by(ShipmentContainer.id.desc()).limit(limit))).scalars().all()
    return [_container_out(r) for r in rows]


@router.post("/containers", response_model=ShipmentContainerResponse, status_code=status.HTTP_201_CREATED)
async def create_container(
    body: ShipmentContainerCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Legacy/direct create on shipment (still supported). Prefer packing-list nested route."""
    _require_tenant_user(user, tenant)
    ship = await db.get(Shipment, body.shipment_id)
    if not ship or ship.tenant_id != tenant.id:
        raise HTTPException(status_code=400, detail="Shipment not found")
    packing_list_id = body.packing_list_id
    if packing_list_id is not None:
        pl = await db.get(PackingList, packing_list_id)
        if not pl or pl.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Packing list not found")
    number = body.container_number.strip()
    dup = (
        await db.execute(
            select(ShipmentContainer.id).where(
                ShipmentContainer.tenant_id == tenant.id,
                ShipmentContainer.shipment_id == body.shipment_id,
                ShipmentContainer.container_number == number,
            )
        )
    ).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=400, detail="Container number already exists on this shipment")
    if packing_list_id is not None:
        dup_pl = (
            await db.execute(
                select(ShipmentContainer.id).where(
                    ShipmentContainer.tenant_id == tenant.id,
                    ShipmentContainer.packing_list_id == packing_list_id,
                    ShipmentContainer.container_number == number,
                )
            )
        ).scalar_one_or_none()
        if dup_pl is not None:
            raise HTTPException(status_code=400, detail="Container number already exists on this packing list")

    status_val = (body.loading_status or "EMPTY").strip().upper()
    if status_val == "SEALED":
        status_val = "CLOSED"
    row = ShipmentContainer(
        tenant_id=tenant.id,
        shipment_id=body.shipment_id,
        packing_list_id=packing_list_id,
        container_number=number[:64],
        container_type=(body.container_type or None),
        seal_number=body.seal_number,
        tare_weight_kg=Decimal(str(body.tare_weight_kg)) if body.tare_weight_kg is not None else None,
        max_weight_kg=Decimal(str(body.max_weight_kg)) if body.max_weight_kg is not None else None,
        loading_status=status_val,
        notes=body.notes,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _container_out(row)


@router.patch("/containers/{container_id}", response_model=ShipmentContainerResponse)
async def update_container(
    container_id: int,
    body: ShipmentContainerUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _require_tenant_user(user, tenant)
    row = await db.get(ShipmentContainer, container_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Container not found")
    updates = body.model_dump(exclude_unset=True)
    if "loading_status" in updates and updates["loading_status"] is not None:
        st = str(updates["loading_status"]).strip().upper()
        if st == "SEALED":
            st = "CLOSED"
        updates["loading_status"] = st
        if st in {"LOADED", "CLOSED"} and row.loaded_at is None:
            from datetime import datetime

            row.loaded_at = datetime.utcnow()
    for key in ("tare_weight_kg", "max_weight_kg"):
        if key in updates and updates[key] is not None:
            updates[key] = Decimal(str(updates[key]))
    for key, value in updates.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _container_out(row)
