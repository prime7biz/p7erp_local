"""Material requirement for an order + consumption plans."""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Bom,
    BomItem,
    ConsumptionPlan,
    ConsumptionPlanItem,
    Item,
    ItemUnit,
    Order,
    Quotation,
    StockMovement,
    Tenant,
    User,
)
from app.modules.merch.bom_utils import get_latest_governed_bom
from app.modules.merch.deps import ensure_tenant as _ensure_tenant, to_float_safe as _to_float_safe

router = APIRouter(tags=["merch"])

class ConsumptionPlanCreate(BaseModel):
    order_id: int
    status: str = "PLANNED"


class ConsumptionPlanUpdate(BaseModel):
    status: str | None = None


class ConsumptionPlanItemBody(BaseModel):
    item_code: str | None = None
    required_qty: str
    uom: str | None = None


class MaterialRequirementLineOut(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    uom: str | None
    required_qty: float
    available_qty: float
    shortage_qty: float


class MaterialRequirementOut(BaseModel):
    order_id: int
    order_code: str
    style_id: int
    bom_id: int
    quantity_used: float
    lines: list[MaterialRequirementLineOut]


@router.get("/orders/{order_id}/material-requirement", response_model=MaterialRequirementOut)
async def get_order_material_requirement(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Explode BOM for the order's style by order quantity; return required vs available stock per item (no persistence)."""
    _ensure_tenant(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    style_id: int | None = None
    if order.quotation_id:
        quotation = await db.get(Quotation, order.quotation_id)
        if quotation and quotation.tenant_id == tenant.id:
            style_id = quotation.style_id
    if not style_id:
        raise HTTPException(
            status_code=400,
            detail="Order has no style. Link a quotation with a style to generate material requirement.",
        )
    order_qty = _to_float_safe(str(order.quantity)) if order.quantity is not None else 0.0
    if order_qty <= 0:
        raise HTTPException(status_code=400, detail="Order quantity must be positive")
    bom = await get_latest_governed_bom(
        db,
        tenant_id=tenant.id,
        style_id=style_id,
    )
    if not bom:
        raise HTTPException(
            status_code=400,
            detail="No APPROVED/FROZEN BOM found for this order style.",
        )
    bom_lines_result = await db.execute(
        select(BomItem)
        .where(
            BomItem.tenant_id == tenant.id,
            BomItem.bom_id == bom.id,
            BomItem.item_id.isnot(None),
        )
        .order_by(BomItem.id)
    )
    bom_lines = list(bom_lines_result.scalars().all())
    if not bom_lines:
        raise HTTPException(
            status_code=400,
            detail="BOM has no lines linked to inventory items.",
        )
    lines_out: list[MaterialRequirementLineOut] = []
    for line in bom_lines:
        item = await db.get(Item, line.item_id)
        if not item or item.tenant_id != tenant.id:
            continue
        base = _to_float_safe(line.base_consumption)
        wastage = _to_float_safe(line.wastage_pct) / 100.0
        required = order_qty * base * (1.0 + wastage)
        mov_in = await db.execute(
            select(StockMovement.quantity).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.item_id == line.item_id,
                func.upper(StockMovement.movement_type) == "IN",
            )
        )
        mov_out = await db.execute(
            select(StockMovement.quantity).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.item_id == line.item_id,
                func.upper(StockMovement.movement_type) == "OUT",
            )
        )
        in_qty = sum(_to_float_safe(q[0]) for q in mov_in.all())
        out_qty = sum(_to_float_safe(q[0]) for q in mov_out.all())
        available = round(in_qty - out_qty, 4)
        shortage = round(max(0.0, required - available), 4)
        unit_name = None
        if item.unit_id:
            unit = await db.get(ItemUnit, item.unit_id)
            if unit and unit.tenant_id != tenant.id:
                unit = None
            if unit:
                unit_name = unit.unit_code
        lines_out.append(
            MaterialRequirementLineOut(
                item_id=line.item_id,
                item_code=item.item_code,
                item_name=item.name,
                uom=unit_name or line.uom,
                required_qty=round(required, 4),
                available_qty=available,
                shortage_qty=shortage,
            )
        )
    return MaterialRequirementOut(
        order_id=order.id,
        order_code=order.order_code,
        style_id=style_id,
        bom_id=bom.id,
        quantity_used=order_qty,
        lines=lines_out,
    )


@router.get("/consumption-plans")
async def list_consumption_plans(
    response: Response,
    order_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ConsumptionPlan).where(ConsumptionPlan.tenant_id == tenant.id)
    if order_id is not None:
        stmt = stmt.where(ConsumptionPlan.order_id == order_id)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db.execute(count_stmt)).scalar() or 0)
    result = await db.execute(stmt.order_by(ConsumptionPlan.created_at.desc()).offset(offset).limit(limit))
    response.headers["X-Total-Count"] = str(total)
    return result.scalars().all()


@router.post("/consumption-plans", status_code=201)
async def create_consumption_plan(
    body: ConsumptionPlanCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    style_id: int | None = None
    if order.quotation_id:
        quotation = await db.get(Quotation, order.quotation_id)
        if quotation and quotation.tenant_id == tenant.id:
            style_id = quotation.style_id
    if not style_id:
        raise HTTPException(status_code=400, detail="Order has no style linked for BOM-driven plan")
    bom = await get_latest_governed_bom(db, tenant_id=tenant.id, style_id=style_id)
    if not bom:
        raise HTTPException(status_code=400, detail="No APPROVED/FROZEN BOM found for order style")
    bom_lines = (
        await db.execute(
            select(BomItem).where(
                BomItem.tenant_id == tenant.id,
                BomItem.bom_id == bom.id,
            )
        )
    ).scalars().all()

    row = ConsumptionPlan(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.flush()
    order_qty = _to_float_safe(str(order.quantity)) if order.quantity is not None else 0.0
    for line in bom_lines:
        base = _to_float_safe(line.base_consumption)
        wastage = _to_float_safe(line.wastage_pct) / 100.0
        required_qty = order_qty * base * (1.0 + wastage)
        db.add(
            ConsumptionPlanItem(
                tenant_id=tenant.id,
                plan_id=row.id,
                item_code=line.item_code,
                required_qty=Decimal(str(round(required_qty, 4))).quantize(
                    Decimal("0.0001"), rounding=ROUND_HALF_UP
                ),
                uom=line.uom,
            )
        )
    await db.refresh(row)
    return row


@router.get("/consumption-plans/{plan_id}")
async def get_consumption_plan(
    plan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlan, plan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Consumption plan not found")
    items = await db.execute(
        select(ConsumptionPlanItem)
        .where(ConsumptionPlanItem.tenant_id == tenant.id, ConsumptionPlanItem.plan_id == plan_id)
        .order_by(ConsumptionPlanItem.id)
    )
    return {"plan": row, "items": items.scalars().all()}


@router.patch("/consumption-plans/{plan_id}")
async def update_consumption_plan(
    plan_id: int,
    body: ConsumptionPlanUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlan, plan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Consumption plan not found")
    if body.status is not None:
        row.status = body.status
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/consumption-plans/{plan_id}", status_code=204)
async def delete_consumption_plan(
    plan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ConsumptionPlan, plan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Consumption plan not found")
    await db.delete(row)
    await db.flush()


@router.post("/consumption-plans/{plan_id}/items", status_code=201)
async def create_consumption_plan_item(
    plan_id: int,
    body: ConsumptionPlanItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    raise HTTPException(
        status_code=400,
        detail="Consumption plan items are BOM-driven. Use approved BOM changes/change request flow.",
    )


@router.patch("/consumption-plans/{plan_id}/items/{item_id}")
async def update_consumption_plan_item(
    plan_id: int,
    item_id: int,
    body: ConsumptionPlanItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    raise HTTPException(
        status_code=400,
        detail="Manual item override is disabled. Use approved BOM changes/change request flow.",
    )


@router.delete("/consumption-plans/{plan_id}/items/{item_id}", status_code=204)
async def delete_consumption_plan_item(
    plan_id: int,
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    raise HTTPException(
        status_code=400,
        detail="Manual deletion is disabled. Use approved BOM changes/change request flow.",
    )

