"""Packing list carton detail (flag `packing_list_cartons_enabled`, default on)."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_packing_list_cartons_enabled
from app.database import get_db
from app.models import Order, Tenant, User
from app.models.logistics_packing import PackingList
from app.models.order_matrix import OrderColorSizeLine
from app.models.packing_cartons import PackingListCartonLine
from app.modules.logistics.carton_service import CartonError, CartonLineIn, summarize

router = APIRouter(prefix="/logistics", tags=["logistics"])


class CartonLine(BaseModel):
    carton_from: int = Field(..., ge=1, le=1_000_000)
    carton_to: int = Field(..., ge=1, le=1_000_000)
    color_name: str = Field(..., min_length=1, max_length=100)
    size: str = Field(..., min_length=1, max_length=16)
    pcs_per_carton: int = Field(..., ge=1, le=100_000)
    net_kg_per_carton: Decimal | None = Field(default=None, ge=0, le=10_000)
    gross_kg_per_carton: Decimal | None = Field(default=None, ge=0, le=10_000)
    length_cm: Decimal | None = Field(default=None, ge=0, le=1_000)
    width_cm: Decimal | None = Field(default=None, ge=0, le=1_000)
    height_cm: Decimal | None = Field(default=None, ge=0, le=1_000)


class CartonsBody(BaseModel):
    lines: list[CartonLine] = Field(default_factory=list, max_length=500)
    # Copy carton count and weights into the packing list header.
    sync_header: bool = True


class SummaryOut(BaseModel):
    total_cartons: int
    total_pcs: int
    net_kg: Decimal
    gross_kg: Decimal
    cbm: Decimal


class BreakdownRow(BaseModel):
    color_name: str
    size: str
    packed_this_list: int
    packed_all_lists: int
    ordered_qty: int | None
    balance_to_pack: int | None


class CartonsOut(BaseModel):
    enabled: bool
    packing_list_id: int
    order_id: int | None
    order_code: str | None
    status: str
    locked: bool
    lines: list[CartonLine]
    summary: SummaryOut
    breakdown: list[BreakdownRow]


def _to_in(line: CartonLine | PackingListCartonLine) -> CartonLineIn:
    return CartonLineIn(
        carton_from=line.carton_from,
        carton_to=line.carton_to,
        color_name=line.color_name,
        size=line.size,
        pcs_per_carton=line.pcs_per_carton,
        net_kg_per_carton=line.net_kg_per_carton,
        gross_kg_per_carton=line.gross_kg_per_carton,
        length_cm=line.length_cm,
        width_cm=line.width_cm,
        height_cm=line.height_cm,
    )


async def _get_pl(db: AsyncSession, tenant: Tenant, user: User, pl_id: int, *, lock: bool = False) -> PackingList:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(PackingList).where(PackingList.id == pl_id, PackingList.tenant_id == tenant.id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    row = (await db.execute(stmt)).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Packing list not found")
    return row


async def _out(db: AsyncSession, tenant: Tenant, pl: PackingList) -> CartonsOut:
    rows = list(
        (
            await db.execute(
                select(PackingListCartonLine)
                .where(PackingListCartonLine.packing_list_id == pl.id)
                .order_by(PackingListCartonLine.sort_order, PackingListCartonLine.id)
            )
        ).scalars()
    )
    summary = summarize([_to_in(r) for r in rows])

    # Rows keyed by lower-cased (colour, size); `labels` keeps display spelling, order-grid cells first.
    labels: dict[tuple[str, str], tuple[str, str]] = {}
    this_list: dict[tuple[str, str], int] = {}

    ordered: dict[tuple[str, str], int] = {}
    packed_all: dict[tuple[str, str], int] = {}
    order_code = None
    if pl.order_id:
        order_code = await db.scalar(select(Order.order_code).where(Order.id == pl.order_id))
        for c, s, q in (
            await db.execute(
                select(OrderColorSizeLine.color_name, OrderColorSizeLine.size, OrderColorSizeLine.quantity)
                .where(OrderColorSizeLine.tenant_id == tenant.id, OrderColorSizeLine.order_id == pl.order_id)
                .order_by(OrderColorSizeLine.color_sort, OrderColorSizeLine.size_sort)
            )
        ).all():
            k = (c.lower(), s.lower())
            labels.setdefault(k, (c, s))
            ordered[k] = q
        others = (
            await db.execute(
                select(
                    PackingListCartonLine.color_name,
                    PackingListCartonLine.size,
                    func.sum((PackingListCartonLine.carton_to - PackingListCartonLine.carton_from + 1) * PackingListCartonLine.pcs_per_carton),
                )
                .join(PackingList, PackingList.id == PackingListCartonLine.packing_list_id)
                .where(
                    PackingList.tenant_id == tenant.id,
                    PackingList.order_id == pl.order_id,
                    func.upper(PackingList.status) != "CANCELLED",
                )
                .group_by(PackingListCartonLine.color_name, PackingListCartonLine.size)
            )
        ).all()
        for c, s, q in others:
            k = (c.lower(), s.lower())
            packed_all[k] = packed_all.get(k, 0) + int(q or 0)

    for (c, s), q in summary.by_color_size.items():
        k = (c.lower(), s.lower())
        labels.setdefault(k, (c, s))
        this_list[k] = this_list.get(k, 0) + q

    breakdown = []
    for k, (c, s) in labels.items():
        # With an order grid, cells missing from it were ordered 0; without one, ordered is unknown.
        ord_q = ordered.get(k, 0) if ordered else None
        all_q = packed_all.get(k, this_list.get(k, 0))
        breakdown.append(
            BreakdownRow(
                color_name=c,
                size=s,
                packed_this_list=this_list.get(k, 0),
                packed_all_lists=all_q,
                ordered_qty=ord_q,
                balance_to_pack=None if ord_q is None else ord_q - all_q,
            )
        )

    return CartonsOut(
        enabled=is_packing_list_cartons_enabled(tenant.feature_flags),
        packing_list_id=pl.id,
        order_id=pl.order_id,
        order_code=order_code,
        status=pl.status,
        locked=(pl.status or "").upper() == "FINALIZED",
        lines=[CartonLine.model_validate(r, from_attributes=True) for r in rows],
        summary=SummaryOut(
            total_cartons=summary.total_cartons,
            total_pcs=summary.total_pcs,
            net_kg=summary.net_kg,
            gross_kg=summary.gross_kg,
            cbm=summary.cbm,
        ),
        breakdown=breakdown,
    )


@router.get("/packing-lists/{packing_list_id}/cartons", response_model=CartonsOut)
async def get_cartons(
    packing_list_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    pl = await _get_pl(db, tenant, user, packing_list_id)
    return await _out(db, tenant, pl)


@router.put("/packing-lists/{packing_list_id}/cartons", response_model=CartonsOut)
async def put_cartons(
    packing_list_id: int,
    body: CartonsBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_packing_list_cartons_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "Carton detail is not enabled for this company."},
        )
    pl = await _get_pl(db, tenant, user, packing_list_id, lock=True)
    if (pl.status or "").upper() == "FINALIZED":
        raise HTTPException(status_code=409, detail="This packing list is FINALIZED; its cartons can no longer change")
    try:
        summary = summarize([_to_in(ln) for ln in body.lines])
    except CartonError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    await db.execute(delete(PackingListCartonLine).where(PackingListCartonLine.packing_list_id == pl.id))
    for i, ln in enumerate(body.lines):
        db.add(
            PackingListCartonLine(
                tenant_id=tenant.id,
                packing_list_id=pl.id,
                sort_order=i,
                **{**ln.model_dump(), "color_name": ln.color_name.strip(), "size": ln.size.strip()},
            )
        )
    if body.sync_header:
        pl.total_cartons = summary.total_cartons
        if summary.gross_kg:
            pl.gross_weight = summary.gross_kg
        if summary.net_kg:
            pl.net_weight = summary.net_kg
    await db.commit()
    await db.refresh(pl)
    return await _out(db, tenant, pl)
