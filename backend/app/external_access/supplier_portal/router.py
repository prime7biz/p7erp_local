"""Supplier portal HTTP API (mounted under /api/external/supplier).

Every query is scoped to the principal's tenant AND its linked vendors; DRAFT purchase
orders are internal and never shown.
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, safe_async_session_rollback
from app.models import ExternalPrincipal, Role, User, Vendor
from app.models.costing import Item
from app.models.inventory import GoodsReceiving, PurchaseOrder, PurchaseOrderItem
from app.models.supplier_portal import (
    UPDATE_CONFIRMED,
    UPDATE_DECLINED,
    UPDATE_NOTE,
    UPDATE_SHIP_DATE,
    SupplierPoUpdate,
)
from app.external_access.audit import log_external_action
from app.external_access.deps import get_allowed_vendor_ids, require_supplier_external

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/supplier", tags=["external-supplier"])

VISIBLE_STATUSES = ("APPROVED", "PARTIALLY_RECEIVED", "RECEIVED", "CLOSED", "CANCELLED")
OPEN_STATUSES = ("APPROVED", "PARTIALLY_RECEIVED")
MAX_UPDATES_PER_PO = 200

Principal = Annotated[ExternalPrincipal, Depends(require_supplier_external)]


# ---------------------------------------------------------------- schemas


class SupplierPoListItem(BaseModel):
    id: int
    po_code: str
    vendor_name: str | None
    status: str
    order_date: date | None
    expected_date: date | None
    currency: str | None
    total_amount: Decimal
    supplier_status: str | None
    promised_ship_date: date | None


class SupplierPoListResponse(BaseModel):
    items: list[SupplierPoListItem]
    total: int


class SupplierDashboard(BaseModel):
    vendor_names: list[str]
    open_po_count: int
    awaiting_confirmation_count: int
    due_next_14_days: int
    overdue_count: int
    recent: list[SupplierPoListItem]


class SupplierPoLine(BaseModel):
    item_code: str | None
    item_name: str | None
    ordered_qty: Decimal
    unit_price: Decimal
    line_total: Decimal
    accepted_received_qty: Decimal
    pending_qty: Decimal


class SupplierReceipt(BaseModel):
    grn_code: str
    received_date: date | None
    status: str


class SupplierUpdateOut(BaseModel):
    id: int
    kind: str
    expected_ship_date: date | None
    message: str | None
    created_at: datetime
    by_supplier: bool


class SupplierPoDetail(SupplierPoListItem):
    lines: list[SupplierPoLine]
    receipts: list[SupplierReceipt]
    updates: list[SupplierUpdateOut]
    can_respond: bool


class SupplierUpdateBody(BaseModel):
    kind: Literal["CONFIRMED", "DECLINED", "SHIP_DATE", "NOTE"]
    expected_ship_date: date | None = None
    message: str | None = Field(default=None, max_length=2000)

    @field_validator("message")
    @classmethod
    def _strip(cls, v: str | None) -> str | None:
        v = (v or "").strip()
        return v or None


# ---------------------------------------------------------------- helpers


def _scoped(principal: ExternalPrincipal, vendor_ids: list[int]):
    return (
        PurchaseOrder.tenant_id == principal.tenant_id,
        PurchaseOrder.vendor_id.in_(vendor_ids or [-1]),
        func.upper(PurchaseOrder.status).in_(VISIBLE_STATUSES),
    )


async def _load_po(db: AsyncSession, principal: ExternalPrincipal, po_id: int, *, lock: bool = False) -> PurchaseOrder:
    vendor_ids = await get_allowed_vendor_ids(db, principal)
    stmt = select(PurchaseOrder).where(PurchaseOrder.id == po_id, *_scoped(principal, vendor_ids))
    if lock:
        stmt = stmt.with_for_update()
    po = (await db.execute(stmt)).scalar_one_or_none()
    if not po:
        # Same answer for "not yours", "draft" and "does not exist" so ids cannot be probed.
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return po


async def _list_items(db: AsyncSession, principal: ExternalPrincipal, pos: list[PurchaseOrder]) -> list[SupplierPoListItem]:
    if not pos:
        return []
    ids = [p.id for p in pos]
    totals = dict(
        (
            await db.execute(
                select(PurchaseOrderItem.purchase_order_id, func.coalesce(func.sum(PurchaseOrderItem.quantity * PurchaseOrderItem.unit_price), 0))
                .where(PurchaseOrderItem.purchase_order_id.in_(ids))
                .group_by(PurchaseOrderItem.purchase_order_id)
            )
        ).all()
    )
    vendor_names = dict(
        (await db.execute(select(Vendor.id, Vendor.name).where(Vendor.id.in_({p.vendor_id for p in pos if p.vendor_id})))).all()
    )
    latest_status: dict[int, str] = {}
    latest_ship: dict[int, date] = {}
    for po_id, kind, ship in (
        await db.execute(
            select(SupplierPoUpdate.purchase_order_id, SupplierPoUpdate.kind, SupplierPoUpdate.expected_ship_date)
            .where(SupplierPoUpdate.tenant_id == principal.tenant_id, SupplierPoUpdate.purchase_order_id.in_(ids))
            .order_by(SupplierPoUpdate.id)
        )
    ).all():
        if kind in (UPDATE_CONFIRMED, UPDATE_DECLINED):
            latest_status[po_id] = kind
        if ship:
            latest_ship[po_id] = ship
    return [
        SupplierPoListItem(
            id=p.id,
            po_code=p.po_code,
            vendor_name=vendor_names.get(p.vendor_id),
            status=(p.status or "").upper(),
            order_date=p.order_date,
            expected_date=p.expected_date,
            currency=p.currency,
            total_amount=Decimal(str(totals.get(p.id, 0))).quantize(Decimal("0.01")),
            supplier_status=latest_status.get(p.id),
            promised_ship_date=latest_ship.get(p.id),
        )
        for p in pos
    ]


async def _buyer_user_ids(db: AsyncSession, tenant_id: int) -> list[int]:
    """Admins/managers who hear about supplier responses (POs carry no creator). Read before any write."""
    try:
        return list(
            (
                await db.execute(
                    select(User.id)
                    .join(Role, Role.id == User.role_id)
                    .where(
                        User.tenant_id == tenant_id,
                        User.is_active.is_(True),
                        func.lower(Role.name).in_(("admin", "manager", "owner")),
                    )
                    .limit(20)
                )
            ).scalars()
        )
    except Exception:
        logger.exception("supplier_notify_lookup_failed tenant_id=%s", tenant_id)
        await safe_async_session_rollback(db)
        return []


# ---------------------------------------------------------------- routes


@router.get("/dashboard", response_model=SupplierDashboard)
async def supplier_dashboard(principal: Principal, db: AsyncSession = Depends(get_db)):
    vendor_ids = await get_allowed_vendor_ids(db, principal)
    names = (
        (await db.execute(select(Vendor.name).where(Vendor.id.in_(vendor_ids or [-1]), Vendor.tenant_id == principal.tenant_id))).scalars().all()
    )
    open_pos = list(
        (
            await db.execute(
                select(PurchaseOrder).where(
                    PurchaseOrder.tenant_id == principal.tenant_id,
                    PurchaseOrder.vendor_id.in_(vendor_ids or [-1]),
                    func.upper(PurchaseOrder.status).in_(OPEN_STATUSES),
                )
            )
        ).scalars()
    )
    items = await _list_items(db, principal, open_pos)
    today = date.today()
    recent_rows = list(
        (
            await db.execute(
                select(PurchaseOrder).where(*_scoped(principal, vendor_ids)).order_by(PurchaseOrder.id.desc()).limit(5)
            )
        ).scalars()
    )
    return SupplierDashboard(
        vendor_names=sorted(names),
        open_po_count=len(items),
        awaiting_confirmation_count=sum(1 for i in items if i.supplier_status is None),
        due_next_14_days=sum(1 for i in items if i.expected_date and today <= i.expected_date <= today + timedelta(days=14)),
        overdue_count=sum(1 for i in items if i.expected_date and i.expected_date < today),
        recent=await _list_items(db, principal, recent_rows),
    )


@router.get("/purchase-orders", response_model=SupplierPoListResponse)
async def supplier_purchase_orders(
    principal: Principal,
    db: AsyncSession = Depends(get_db),
    status_filter: Literal["open", "all"] = Query(default="open", alias="status"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    vendor_ids = await get_allowed_vendor_ids(db, principal)
    where = list(_scoped(principal, vendor_ids))
    if status_filter == "open":
        where.append(func.upper(PurchaseOrder.status).in_(OPEN_STATUSES))
    total = int(await db.scalar(select(func.count()).select_from(PurchaseOrder).where(*where)) or 0)
    rows = list(
        (await db.execute(select(PurchaseOrder).where(*where).order_by(PurchaseOrder.id.desc()).limit(limit).offset(offset))).scalars()
    )
    return SupplierPoListResponse(items=await _list_items(db, principal, rows), total=total)


@router.get("/purchase-orders/{po_id}", response_model=SupplierPoDetail)
async def supplier_purchase_order(po_id: int, principal: Principal, db: AsyncSession = Depends(get_db)):
    from app.modules.inventory.router import _sum_accepted_for_po_line_excluding_grn

    po = await _load_po(db, principal, po_id)
    base = (await _list_items(db, principal, [po]))[0]
    lines_rows = (
        await db.execute(
            select(PurchaseOrderItem, Item.item_code, Item.name)
            .join(Item, Item.id == PurchaseOrderItem.item_id)
            .where(PurchaseOrderItem.purchase_order_id == po.id)
            .order_by(PurchaseOrderItem.id)
        )
    ).all()
    lines: list[SupplierPoLine] = []
    for pl, code, name in lines_rows:
        accepted = Decimal(str(round(await _sum_accepted_for_po_line_excluding_grn(db, po.tenant_id, pl.id, None), 4)))
        qty = Decimal(pl.quantity)
        lines.append(
            SupplierPoLine(
                item_code=code,
                item_name=name,
                ordered_qty=qty,
                unit_price=Decimal(pl.unit_price),
                line_total=(qty * Decimal(pl.unit_price)).quantize(Decimal("0.01")),
                accepted_received_qty=accepted,
                pending_qty=max(Decimal("0"), qty - accepted),
            )
        )
    receipts = [
        SupplierReceipt(grn_code=g.grn_code, received_date=g.received_date, status=g.status)
        for g in (
            await db.execute(
                select(GoodsReceiving)
                .where(
                    GoodsReceiving.tenant_id == po.tenant_id,
                    GoodsReceiving.purchase_order_id == po.id,
                    func.upper(GoodsReceiving.status) != "DRAFT",
                )
                .order_by(GoodsReceiving.id)
            )
        ).scalars()
    ]
    updates = [
        SupplierUpdateOut(
            id=u.id,
            kind=u.kind,
            expected_ship_date=u.expected_ship_date,
            message=u.message,
            created_at=u.created_at,
            by_supplier=u.external_principal_id is not None,
        )
        for u in (
            await db.execute(
                select(SupplierPoUpdate)
                .where(SupplierPoUpdate.tenant_id == po.tenant_id, SupplierPoUpdate.purchase_order_id == po.id)
                .order_by(SupplierPoUpdate.id.desc())
                .limit(100)
            )
        ).scalars()
    ]
    return SupplierPoDetail(
        **base.model_dump(),
        lines=lines,
        receipts=receipts,
        updates=updates,
        can_respond=(po.status or "").upper() in OPEN_STATUSES,
    )


@router.post("/purchase-orders/{po_id}/updates", response_model=SupplierUpdateOut, status_code=201)
async def supplier_post_update(
    po_id: int,
    body: SupplierUpdateBody,
    request: Request,
    principal: Principal,
    db: AsyncSession = Depends(get_db),
):
    from app.modules.notifications.service import notify_user

    buyer_ids = await _buyer_user_ids(db, principal.tenant_id)
    po = await _load_po(db, principal, po_id, lock=True)
    if (po.status or "").upper() not in OPEN_STATUSES:
        raise HTTPException(status_code=409, detail=f"This purchase order is {po.status}; it no longer accepts updates")
    if body.kind == UPDATE_DECLINED and not body.message:
        raise HTTPException(status_code=400, detail="Please tell the buyer why you cannot accept this order")
    if body.kind == UPDATE_SHIP_DATE and not body.expected_ship_date:
        raise HTTPException(status_code=400, detail="Choose the date you expect to ship")
    if body.kind == UPDATE_NOTE and not body.message:
        raise HTTPException(status_code=400, detail="Write a message")
    if body.expected_ship_date and body.expected_ship_date < date.today() - timedelta(days=1):
        raise HTTPException(status_code=400, detail="The ship date cannot be in the past")
    count = int(
        await db.scalar(select(func.count()).select_from(SupplierPoUpdate).where(SupplierPoUpdate.purchase_order_id == po.id)) or 0
    )
    if count >= MAX_UPDATES_PER_PO:
        raise HTTPException(status_code=429, detail="Too many updates on this purchase order")

    row = SupplierPoUpdate(
        tenant_id=po.tenant_id,
        purchase_order_id=po.id,
        external_principal_id=principal.id,
        kind=body.kind,
        expected_ship_date=body.expected_ship_date,
        message=body.message,
    )
    db.add(row)
    await db.flush()
    await log_external_action(
        db,
        tenant_id=po.tenant_id,
        action=f"SUPPLIER_PO_{body.kind}",
        resource_type="purchase_order",
        resource_id=po.id,
        external_principal_id=principal.id,
        details={"expected_ship_date": body.expected_ship_date.isoformat() if body.expected_ship_date else None},
        ip_address=request.client.host if request.client else None,
        user_agent=(request.headers.get("user-agent") or "")[:512] or None,
    )
    verb = {
        UPDATE_CONFIRMED: "confirmed",
        UPDATE_DECLINED: "declined",
        UPDATE_SHIP_DATE: "updated the ship date for",
        UPDATE_NOTE: "left a note on",
    }[body.kind]
    detail = " · ".join(
        x
        for x in (
            f"Ship date {body.expected_ship_date.isoformat()}" if body.expected_ship_date else None,
            body.message[:200] if body.message else None,
        )
        if x
    )
    for uid in buyer_ids:
        notify_user(
            db,
            tenant_id=po.tenant_id,
            user_id=uid,
            kind="supplier.po.update",
            title=f"{principal.full_name} {verb} PO {po.po_code}",
            body=detail or None,
            href=f"/app/inventory/purchase-orders/{po.id}/print",
        )
    await db.commit()
    await db.refresh(row)
    return SupplierUpdateOut(
        id=row.id,
        kind=row.kind,
        expected_ship_date=row.expected_ship_date,
        message=row.message,
        created_at=row.created_at,
        by_supplier=True,
    )
