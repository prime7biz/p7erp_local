"""Colour × size quantity grid for an order (flag `order_color_size_matrix_enabled`, default off)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_order_color_size_matrix_enabled
from app.database import get_db
from app.models import Order, Tenant, User
from app.models.costing import QuotationSizeRatio
from app.models.merch import StyleColorway, StyleSizeScale
from app.models.order_matrix import OrderColorSizeLine
from app.modules.orders.commercial_fields import is_order_commercial_locked

router = APIRouter(prefix="/orders", tags=["orders"])

MAX_COLORS = 50
MAX_SIZES = 30
MAX_CELL_QTY = 10_000_000


class MatrixColor(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    code: str | None = Field(default=None, max_length=32)

    @field_validator("name")
    @classmethod
    def _strip(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("colour name is required")
        return v


class MatrixCell(BaseModel):
    color: str = Field(..., min_length=1, max_length=100)
    size: str = Field(..., min_length=1, max_length=16)
    quantity: int = Field(..., ge=0, le=MAX_CELL_QTY)


class MatrixBody(BaseModel):
    colors: list[MatrixColor] = Field(default_factory=list, max_length=MAX_COLORS)
    sizes: list[str] = Field(default_factory=list, max_length=MAX_SIZES)
    cells: list[MatrixCell] = Field(default_factory=list)
    # When the order is not commercially locked, copy the grid total into Order.quantity.
    sync_order_quantity: bool = False

    @field_validator("sizes")
    @classmethod
    def _sizes(cls, v: list[str]) -> list[str]:
        out = [s.strip() for s in v]
        if any(not s or len(s) > 16 for s in out):
            raise ValueError("each size must be 1–16 characters")
        return out


class MatrixOut(BaseModel):
    enabled: bool
    order_id: int
    order_quantity: int | None
    locked: bool
    colors: list[MatrixColor]
    sizes: list[str]
    cells: list[MatrixCell]
    total: int
    matches_order_quantity: bool | None
    suggested_colors: list[MatrixColor]
    suggested_sizes: list[str]


async def _get_order(db: AsyncSession, tenant: Tenant, user: User, order_id: int, *, lock: bool = False) -> Order:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    stmt = select(Order).where(Order.id == order_id, Order.tenant_id == tenant.id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    order = (await db.execute(stmt)).scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    return order


async def _suggestions(db: AsyncSession, tenant_id: int, order: Order) -> tuple[list[MatrixColor], list[str]]:
    colors: list[MatrixColor] = []
    sizes: list[str] = []
    if order.style_id:
        rows = (
            await db.execute(
                select(StyleColorway)
                .where(StyleColorway.tenant_id == tenant_id, StyleColorway.style_id == order.style_id)
                .order_by(StyleColorway.id)
            )
        ).scalars().all()
        colors = [MatrixColor(name=r.color_name[:100], code=r.color_code) for r in rows if (r.color_name or "").strip()]
        scale = (
            await db.execute(
                select(StyleSizeScale)
                .where(StyleSizeScale.tenant_id == tenant_id, StyleSizeScale.style_id == order.style_id)
                .order_by(StyleSizeScale.id)
                .limit(1)
            )
        ).scalar_one_or_none()
        if scale and scale.sizes_csv:
            sizes = [s.strip()[:16] for s in scale.sizes_csv.split(",") if s.strip()]
    if not sizes and order.quotation_id:
        ratios = (
            await db.execute(
                select(QuotationSizeRatio.size)
                .where(QuotationSizeRatio.tenant_id == tenant_id, QuotationSizeRatio.quotation_id == order.quotation_id)
                .order_by(QuotationSizeRatio.serial_no)
            )
        ).scalars().all()
        sizes = [s.strip()[:16] for s in ratios if s and s.strip()]
    unique_sizes: list[str] = []
    for s in sizes:
        if s.lower() not in {u.lower() for u in unique_sizes}:
            unique_sizes.append(s)
    return colors[:MAX_COLORS], unique_sizes[:MAX_SIZES]


async def _matrix_out(db: AsyncSession, tenant: Tenant, order: Order) -> MatrixOut:
    rows = (
        await db.execute(
            select(OrderColorSizeLine)
            .where(OrderColorSizeLine.tenant_id == tenant.id, OrderColorSizeLine.order_id == order.id)
            .order_by(OrderColorSizeLine.color_sort, OrderColorSizeLine.size_sort)
        )
    ).scalars().all()
    colors: list[MatrixColor] = []
    sizes: list[str] = []
    for r in sorted(rows, key=lambda x: x.color_sort):
        if all(c.name != r.color_name for c in colors):
            colors.append(MatrixColor(name=r.color_name, code=r.color_code))
    for r in sorted(rows, key=lambda x: x.size_sort):
        if r.size not in sizes:
            sizes.append(r.size)
    total = sum(r.quantity for r in rows)
    suggested_colors, suggested_sizes = await _suggestions(db, tenant.id, order)
    return MatrixOut(
        enabled=is_order_color_size_matrix_enabled(tenant.feature_flags),
        order_id=order.id,
        order_quantity=order.quantity,
        locked=is_order_commercial_locked(order.status),
        colors=colors,
        sizes=sizes,
        cells=[MatrixCell(color=r.color_name, size=r.size, quantity=r.quantity) for r in rows],
        total=total,
        matches_order_quantity=None if not rows or order.quantity is None else total == order.quantity,
        suggested_colors=suggested_colors,
        suggested_sizes=suggested_sizes,
    )


@router.get("/{order_id}/color-size-matrix", response_model=MatrixOut)
async def get_color_size_matrix(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    order = await _get_order(db, tenant, user, order_id)
    return await _matrix_out(db, tenant, order)


@router.put("/{order_id}/color-size-matrix", response_model=MatrixOut)
async def put_color_size_matrix(
    order_id: int,
    body: MatrixBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not is_order_color_size_matrix_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FEATURE_DISABLED", "message": "Colour/size matrix is not enabled for this company."},
        )
    order = await _get_order(db, tenant, user, order_id, lock=True)

    color_keys = [c.name.lower() for c in body.colors]
    size_keys = [s.lower() for s in body.sizes]
    if len(set(color_keys)) != len(color_keys):
        raise HTTPException(status_code=400, detail="Each colour may appear only once")
    if len(set(size_keys)) != len(size_keys):
        raise HTTPException(status_code=400, detail="Each size may appear only once")

    color_by_key = {c.name.lower(): (i, c) for i, c in enumerate(body.colors)}
    size_by_key = {s.lower(): (i, s) for i, s in enumerate(body.sizes)}
    qty: dict[tuple[str, str], int] = {}
    for cell in body.cells:
        ck, sk = cell.color.strip().lower(), cell.size.strip().lower()
        if ck not in color_by_key or sk not in size_by_key:
            raise HTTPException(status_code=400, detail=f"Cell {cell.color} / {cell.size} is not in the colour and size lists")
        if (ck, sk) in qty:
            raise HTTPException(status_code=400, detail=f"Cell {cell.color} / {cell.size} is listed twice")
        qty[(ck, sk)] = cell.quantity
    total = sum(qty.values())

    locked = is_order_commercial_locked(order.status)
    if locked and order.quantity is not None and qty and total != order.quantity:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={
                "code": "COMMERCIAL_CHANGE_REQUIRED",
                "message": (
                    f"Order is {order.status} with quantity {order.quantity}; the grid totals {total}. "
                    "Redistribute within the confirmed quantity, or raise a commercial change request."
                ),
                "fields": ["quantity"],
            },
        )

    await db.execute(
        delete(OrderColorSizeLine).where(OrderColorSizeLine.tenant_id == tenant.id, OrderColorSizeLine.order_id == order.id)
    )
    for ck, (ci, color) in color_by_key.items():
        for sk, (si, size) in size_by_key.items():
            db.add(
                OrderColorSizeLine(
                    tenant_id=tenant.id,
                    order_id=order.id,
                    color_name=color.name,
                    color_code=color.code,
                    size=size,
                    quantity=qty.get((ck, sk), 0),
                    color_sort=ci,
                    size_sort=si,
                )
            )
    if body.sync_order_quantity and not locked and qty:
        order.quantity = total
    await db.commit()
    await db.refresh(order)
    return await _matrix_out(db, tenant, order)
