"""Colour × size grid per purchase-order line (flag `po_color_size_matrix_enabled`, default on).

The grid is a breakdown only — it never changes the PO line quantity or PO totals.
- DRAFT PO: the grid may differ from the line quantity (UI shows a mismatch warning).
- Approved / sent PO: a saved grid must total exactly the line quantity.
- CLOSED / CANCELLED PO: read-only.
"""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_po_color_size_matrix_enabled
from app.database import get_db
from app.models import Tenant, User
from app.models.costing import Item
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.models.order_matrix import OrderColorSizeLine
from app.models.po_matrix import PurchaseOrderColorSizeLine

router = APIRouter(prefix="/inventory/purchase-orders", tags=["inventory"])

MAX_COLORS = 50
MAX_SIZES = 30
READ_ONLY_STATUSES = {"CLOSED", "CANCELLED", "CANCELED"}


class GridColor(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str | None = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("colour name is required")
        return v


class GridCell(BaseModel):
    color: str = Field(..., min_length=1, max_length=100)
    size: str = Field(..., min_length=1, max_length=16)
    quantity: Decimal = Field(..., ge=0, le=Decimal("1000000000"))


class GridBody(BaseModel):
    colors: list[GridColor] = Field(default_factory=list, max_length=MAX_COLORS)
    sizes: list[str] = Field(default_factory=list, max_length=MAX_SIZES)
    cells: list[GridCell] = Field(default_factory=list)

    @field_validator("sizes")
    @classmethod
    def _sizes(cls, v: list[str]) -> list[str]:
        out = [s.strip() for s in v]
        if any(not s or len(s) > 16 for s in out):
            raise ValueError("each size must be 1–16 characters")
        return out


def _q(v: Decimal) -> str:
    return format(v.normalize(), "f")


async def _get_po(db: AsyncSession, tenant: Tenant, user: User, po_id: int, *, lock: bool = False) -> PurchaseOrder:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(PurchaseOrder).where(PurchaseOrder.id == po_id, PurchaseOrder.tenant_id == tenant.id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    po = (await db.execute(stmt)).scalar_one_or_none()
    if not po:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase order not found")
    return po


async def _suggestions(db: AsyncSession, tenant_id: int, order_ids: set[int]) -> tuple[list[dict], list[str]]:
    if not order_ids:
        return [], []
    rows = (
        await db.execute(
            select(OrderColorSizeLine)
            .where(OrderColorSizeLine.tenant_id == tenant_id, OrderColorSizeLine.order_id.in_(order_ids))
            .order_by(OrderColorSizeLine.order_id, OrderColorSizeLine.color_sort, OrderColorSizeLine.size_sort)
        )
    ).scalars().all()
    colors: list[dict] = []
    sizes: list[str] = []
    for r in rows:
        if all(c["name"].lower() != r.color_name.lower() for c in colors):
            colors.append({"name": r.color_name, "code": r.color_code})
        if r.size.lower() not in {s.lower() for s in sizes}:
            sizes.append(r.size)
    return colors[:MAX_COLORS], sizes[:MAX_SIZES]


async def _grid_out(db: AsyncSession, tenant: Tenant, po: PurchaseOrder) -> dict:
    items = (
        await db.execute(
            select(PurchaseOrderItem, Item.item_code, Item.name)
            .join(Item, Item.id == PurchaseOrderItem.item_id)
            .where(PurchaseOrderItem.tenant_id == tenant.id, PurchaseOrderItem.purchase_order_id == po.id)
            .order_by(PurchaseOrderItem.id)
        )
    ).all()
    cells = (
        await db.execute(
            select(PurchaseOrderColorSizeLine)
            .where(
                PurchaseOrderColorSizeLine.tenant_id == tenant.id,
                PurchaseOrderColorSizeLine.purchase_order_id == po.id,
            )
            .order_by(PurchaseOrderColorSizeLine.color_sort, PurchaseOrderColorSizeLine.size_sort)
        )
    ).scalars().all()
    by_item: dict[int, list[PurchaseOrderColorSizeLine]] = {}
    for c in cells:
        by_item.setdefault(c.po_item_id, []).append(c)
    order_ids = {po.source_order_id} if po.source_order_id else set()
    lines = []
    for it, code, name in items:
        if it.source_order_id:
            order_ids.add(it.source_order_id)
        rows = by_item.get(it.id, [])
        colors: list[dict] = []
        sizes: list[str] = []
        for r in sorted(rows, key=lambda x: x.color_sort):
            if all(c["name"] != r.color_name for c in colors):
                colors.append({"name": r.color_name, "code": r.color_code})
        for r in sorted(rows, key=lambda x: x.size_sort):
            if r.size not in sizes:
                sizes.append(r.size)
        total = sum((r.quantity for r in rows), Decimal("0"))
        lines.append(
            {
                "po_item_id": it.id,
                "item_code": code,
                "item_name": name,
                "quantity": _q(Decimal(it.quantity or 0)),
                "colors": colors,
                "sizes": sizes,
                "cells": [{"color": r.color_name, "size": r.size, "quantity": _q(r.quantity)} for r in rows],
                "total": _q(total),
                "matches_quantity": None if not rows else total == Decimal(it.quantity or 0),
            }
        )
    suggested_colors, suggested_sizes = await _suggestions(db, tenant.id, order_ids)
    st = (po.status or "").upper()
    return {
        "enabled": is_po_color_size_matrix_enabled(tenant.feature_flags),
        "purchase_order_id": po.id,
        "po_code": po.po_code,
        "po_status": po.status,
        "read_only": st in READ_ONLY_STATUSES,
        "must_match_quantity": st != "DRAFT",
        "lines": lines,
        "suggested_colors": suggested_colors,
        "suggested_sizes": suggested_sizes,
    }


@router.get("/{po_id}/color-size")
async def get_po_color_size(
    po_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    po = await _get_po(db, tenant, user, po_id)
    return await _grid_out(db, tenant, po)


@router.put("/{po_id}/items/{po_item_id}/color-size")
async def put_po_item_color_size(
    po_id: int,
    po_item_id: int,
    body: GridBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_po_color_size_matrix_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "PO colour/size grid is not enabled for this company."},
        )
    po = await _get_po(db, tenant, user, po_id, lock=True)
    st = (po.status or "").upper()
    if st in READ_ONLY_STATUSES:
        raise HTTPException(status_code=409, detail=f"Purchase order is {po.status}; the grid is read-only")
    item = (
        await db.execute(
            select(PurchaseOrderItem).where(
                PurchaseOrderItem.id == po_item_id,
                PurchaseOrderItem.tenant_id == tenant.id,
                PurchaseOrderItem.purchase_order_id == po.id,
            )
        )
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=404, detail="PO line not found")

    color_keys = [c.name.lower() for c in body.colors]
    size_keys = [s.lower() for s in body.sizes]
    if len(set(color_keys)) != len(color_keys):
        raise HTTPException(status_code=400, detail="Each colour may appear only once")
    if len(set(size_keys)) != len(size_keys):
        raise HTTPException(status_code=400, detail="Each size may appear only once")
    color_by_key = {c.name.lower(): (i, c) for i, c in enumerate(body.colors)}
    size_by_key = {s.lower(): (i, s) for i, s in enumerate(body.sizes)}
    qty: dict[tuple[str, str], Decimal] = {}
    for cell in body.cells:
        ck, sk = cell.color.strip().lower(), cell.size.strip().lower()
        if ck not in color_by_key or sk not in size_by_key:
            raise HTTPException(status_code=400, detail=f"Cell {cell.color} / {cell.size} is not in the colour and size lists")
        if (ck, sk) in qty:
            raise HTTPException(status_code=400, detail=f"Cell {cell.color} / {cell.size} is listed twice")
        qty[(ck, sk)] = cell.quantity
    total = sum(qty.values(), Decimal("0"))
    line_qty = Decimal(item.quantity or 0)
    if st != "DRAFT" and qty and total != line_qty:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "GRID_QUANTITY_MISMATCH",
                "message": (
                    f"PO is {po.status}: the grid must total the line quantity {_q(line_qty)} (currently {_q(total)})."
                ),
            },
        )

    await db.execute(
        delete(PurchaseOrderColorSizeLine).where(
            PurchaseOrderColorSizeLine.tenant_id == tenant.id,
            PurchaseOrderColorSizeLine.po_item_id == item.id,
        )
    )
    for ck, (ci, color) in color_by_key.items():
        for sk, (si, size) in size_by_key.items():
            db.add(
                PurchaseOrderColorSizeLine(
                    tenant_id=tenant.id,
                    purchase_order_id=po.id,
                    po_item_id=item.id,
                    color_name=color.name,
                    color_code=color.code,
                    size=size,
                    quantity=qty.get((ck, sk), Decimal("0")),
                    color_sort=ci,
                    size_sort=si,
                )
            )
    await db.commit()
    po = await _get_po(db, tenant, user, po_id)
    return await _grid_out(db, tenant, po)
