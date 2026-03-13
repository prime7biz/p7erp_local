from __future__ import annotations

from datetime import date, datetime
import json

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    DeliveryChallan,
    DeliveryChallanItem,
    EnhancedGatePass,
    ConsumptionChangeRequest,
    GoodsReceiving,
    GoodsReceivingItem,
    ManufacturingOrder,
    ManufacturingStage,
    Item,
    ItemCategory,
    ItemSubcategory,
    ItemUnit,
    PurchaseOrder,
    PurchaseOrderItem,
    ProcessOrder,
    StockGroup,
    StockMovement,
    Tenant,
    Role,
    User,
    Warehouse,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _next_code(prefix: str, last_id: int | None) -> str:
    return f"{prefix}{(last_id or 0) + 1:04d}"


def _to_float(value: str | None) -> float:
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


async def _require_manager_or_admin(db: AsyncSession, user: User) -> None:
    role = await db.get(Role, user.role_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Only admin or manager can review change requests")


async def _on_hand_qty(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    warehouse_id: int | None,
) -> float:
    stmt = select(StockMovement).where(StockMovement.tenant_id == tenant_id, StockMovement.item_id == item_id)
    if warehouse_id is None:
        stmt = stmt.where(StockMovement.warehouse_id.is_(None))
    else:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())
    in_qty = sum(_to_float(r.quantity) for r in rows if r.movement_type == "IN")
    out_qty = sum(_to_float(r.quantity) for r in rows if r.movement_type == "OUT")
    return round(in_qty - out_qty, 3)


class ItemCategoryBody(BaseModel):
    category_code: str
    name: str
    description: str | None = None
    is_active: bool = True


class ItemCategoryOut(BaseModel):
    id: int
    tenant_id: int
    category_code: str
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ItemSubcategoryBody(BaseModel):
    category_id: int
    subcategory_code: str
    name: str
    description: str | None = None
    is_active: bool = True


class ItemSubcategoryOut(BaseModel):
    id: int
    tenant_id: int
    category_id: int
    subcategory_code: str
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ItemUnitBody(BaseModel):
    unit_code: str
    name: str
    description: str | None = None
    is_active: bool = True


class ItemUnitOut(BaseModel):
    id: int
    tenant_id: int
    unit_code: str
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ItemBody(BaseModel):
    item_code: str
    name: str
    description: str | None = None
    category_id: int
    subcategory_id: int | None = None
    unit_id: int
    default_cost: str = "0"
    is_active: bool = True


class ItemOut(BaseModel):
    id: int
    tenant_id: int
    item_code: str
    name: str
    description: str | None
    category_id: int
    subcategory_id: int | None
    unit_id: int
    default_cost: str
    is_active: bool

    class Config:
        from_attributes = True


class WarehouseBody(BaseModel):
    warehouse_code: str
    name: str
    address: str | None = None
    is_active: bool = True


class WarehouseOut(BaseModel):
    id: int
    tenant_id: int
    warehouse_code: str
    name: str
    address: str | None
    is_active: bool

    class Config:
        from_attributes = True


class StockGroupBody(BaseModel):
    group_code: str
    name: str
    parent_id: int | None = None
    is_active: bool = True


class StockGroupOut(BaseModel):
    id: int
    tenant_id: int
    group_code: str
    name: str
    parent_id: int | None
    is_active: bool

    class Config:
        from_attributes = True


class PurchaseOrderItemBody(BaseModel):
    item_id: int
    warehouse_id: int | None = None
    quantity: str
    unit_price: str = "0"


class PurchaseOrderBody(BaseModel):
    po_code: str | None = None
    supplier_name: str
    order_date: date | None = None
    expected_date: date | None = None
    notes: str | None = None
    status: str = "DRAFT"
    items: list[PurchaseOrderItemBody] = []


class PurchaseOrderItemOut(BaseModel):
    id: int
    purchase_order_id: int
    item_id: int
    warehouse_id: int | None
    quantity: str
    unit_price: str

    class Config:
        from_attributes = True


class PurchaseOrderOut(BaseModel):
    id: int
    tenant_id: int
    po_code: str
    supplier_name: str
    order_date: date | None
    expected_date: date | None
    status: str
    notes: str | None
    items: list[PurchaseOrderItemOut]


class GoodsReceivingItemBody(BaseModel):
    item_id: int
    warehouse_id: int
    quantity: str


class GoodsReceivingBody(BaseModel):
    grn_code: str | None = None
    purchase_order_id: int | None = None
    received_date: date | None = None
    notes: str | None = None
    status: str = "DRAFT"
    items: list[GoodsReceivingItemBody] = []


class GoodsReceivingItemOut(BaseModel):
    id: int
    goods_receiving_id: int
    item_id: int
    warehouse_id: int
    quantity: str

    class Config:
        from_attributes = True


class GoodsReceivingOut(BaseModel):
    id: int
    tenant_id: int
    grn_code: str
    purchase_order_id: int | None
    received_date: date | None
    status: str
    notes: str | None
    items: list[GoodsReceivingItemOut]


class StockSummaryRow(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    warehouse_id: int | None
    warehouse_name: str | None
    in_qty: float
    out_qty: float
    on_hand_qty: float


class StockLedgerRow(BaseModel):
    id: int
    movement_date: date | None
    movement_type: str
    item_id: int
    item_code: str
    item_name: str
    warehouse_id: int | None
    warehouse_name: str | None
    quantity: str
    reference_type: str | None
    reference_id: int | None
    notes: str | None


class DeliveryChallanItemBody(BaseModel):
    item_id: int
    warehouse_id: int
    quantity: str


class DeliveryChallanBody(BaseModel):
    challan_code: str | None = None
    customer_name: str
    delivery_date: date | None = None
    notes: str | None = None
    status: str = "DRAFT"
    items: list[DeliveryChallanItemBody] = []


class DeliveryChallanItemOut(BaseModel):
    id: int
    challan_id: int
    item_id: int
    warehouse_id: int
    quantity: str

    class Config:
        from_attributes = True


class DeliveryChallanOut(BaseModel):
    id: int
    tenant_id: int
    challan_code: str
    customer_name: str
    delivery_date: date | None
    status: str
    notes: str | None
    items: list[DeliveryChallanItemOut]


class GatePassBody(BaseModel):
    gate_pass_code: str | None = None
    challan_id: int | None = None
    purpose: str
    destination: str | None = None
    vehicle_no: str | None = None
    notes: str | None = None
    status: str = "DRAFT"


class GatePassOut(BaseModel):
    id: int
    tenant_id: int
    gate_pass_code: str
    challan_id: int | None
    purpose: str
    destination: str | None
    vehicle_no: str | None
    status: str
    guard_acknowledged: bool
    notes: str | None

    class Config:
        from_attributes = True


@router.get("/item-categories", response_model=list[ItemCategoryOut])
async def list_item_categories(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ItemCategory).where(ItemCategory.tenant_id == tenant.id).order_by(ItemCategory.category_code)
    )
    return list(result.scalars().all())


@router.post("/item-categories", response_model=ItemCategoryOut)
async def create_item_category(
    body: ItemCategoryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = ItemCategory(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/item-categories/{category_id}", response_model=ItemCategoryOut)
async def update_item_category(
    category_id: int,
    body: ItemCategoryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemCategory, category_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Category not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/item-categories/{category_id}")
async def delete_item_category(
    category_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemCategory, category_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Category not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/item-subcategories", response_model=list[ItemSubcategoryOut])
async def list_item_subcategories(
    category_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ItemSubcategory).where(ItemSubcategory.tenant_id == tenant.id).order_by(ItemSubcategory.subcategory_code)
    if category_id is not None:
        stmt = stmt.where(ItemSubcategory.category_id == category_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/item-subcategories", response_model=ItemSubcategoryOut)
async def create_item_subcategory(
    body: ItemSubcategoryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = ItemSubcategory(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/item-subcategories/{subcategory_id}", response_model=ItemSubcategoryOut)
async def update_item_subcategory(
    subcategory_id: int,
    body: ItemSubcategoryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemSubcategory, subcategory_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/item-subcategories/{subcategory_id}")
async def delete_item_subcategory(
    subcategory_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemSubcategory, subcategory_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/item-units", response_model=list[ItemUnitOut])
async def list_item_units(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(select(ItemUnit).where(ItemUnit.tenant_id == tenant.id).order_by(ItemUnit.unit_code))
    return list(result.scalars().all())


@router.post("/item-units", response_model=ItemUnitOut)
async def create_item_unit(
    body: ItemUnitBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = ItemUnit(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/item-units/{unit_id}", response_model=ItemUnitOut)
async def update_item_unit(
    unit_id: int,
    body: ItemUnitBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemUnit, unit_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Unit not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/item-units/{unit_id}")
async def delete_item_unit(
    unit_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemUnit, unit_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Unit not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/items", response_model=list[ItemOut])
async def list_items(
    category_id: int | None = Query(default=None),
    subcategory_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Item).where(Item.tenant_id == tenant.id).order_by(Item.item_code)
    if category_id is not None:
        stmt = stmt.where(Item.category_id == category_id)
    if subcategory_id is not None:
        stmt = stmt.where(Item.subcategory_id == subcategory_id)
    result = await db.execute(stmt)
    return list(result.scalars().all())


@router.post("/items", response_model=ItemOut)
async def create_item(
    body: ItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = Item(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/items/{item_id}", response_model=ItemOut)
async def update_item(
    item_id: int,
    body: ItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Item, item_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Item, item_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/warehouses", response_model=list[WarehouseOut])
async def list_warehouses(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id).order_by(Warehouse.warehouse_code))
    return list(result.scalars().all())


@router.post("/warehouses", response_model=WarehouseOut)
async def create_warehouse(
    body: WarehouseBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = Warehouse(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/warehouses/{warehouse_id}", response_model=WarehouseOut)
async def update_warehouse(
    warehouse_id: int,
    body: WarehouseBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Warehouse, warehouse_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/warehouses/{warehouse_id}")
async def delete_warehouse(
    warehouse_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Warehouse, warehouse_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/stock-groups", response_model=list[StockGroupOut])
async def list_stock_groups(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(select(StockGroup).where(StockGroup.tenant_id == tenant.id).order_by(StockGroup.group_code))
    return list(result.scalars().all())


@router.post("/stock-groups", response_model=StockGroupOut)
async def create_stock_group(
    body: StockGroupBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = StockGroup(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.patch("/stock-groups/{group_id}", response_model=StockGroupOut)
async def update_stock_group(
    group_id: int,
    body: StockGroupBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StockGroup, group_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Stock group not found")
    for key, value in body.model_dump().items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/stock-groups/{group_id}")
async def delete_stock_group(
    group_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StockGroup, group_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Stock group not found")
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/purchase-orders", response_model=list[PurchaseOrderOut])
async def list_purchase_orders(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(PurchaseOrder.status == status_filter.strip().upper())
    if date_from:
        stmt = stmt.where(PurchaseOrder.order_date >= date_from)
    if date_to:
        stmt = stmt.where(PurchaseOrder.order_date <= date_to)
    result = await db.execute(stmt.order_by(PurchaseOrder.id.desc()))
    rows = list(result.scalars().all())
    out: list[PurchaseOrderOut] = []
    for row in rows:
        items_result = await db.execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == row.id).order_by(PurchaseOrderItem.id)
        )
        out.append(
            PurchaseOrderOut(
                id=row.id,
                tenant_id=row.tenant_id,
                po_code=row.po_code,
                supplier_name=row.supplier_name,
                order_date=row.order_date,
                expected_date=row.expected_date,
                status=row.status,
                notes=row.notes,
                items=list(items_result.scalars().all()),
            )
        )
    return out


@router.post("/purchase-orders", response_model=PurchaseOrderOut)
async def create_purchase_order(
    body: PurchaseOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.po_code:
        po_code = body.po_code
    else:
        last_id = (await db.execute(select(func.max(PurchaseOrder.id)).where(PurchaseOrder.tenant_id == tenant.id))).scalar()
        po_code = _next_code("PO-", last_id)
    row = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=po_code,
        supplier_name=body.supplier_name,
        order_date=body.order_date,
        expected_date=body.expected_date,
        status=body.status,
        notes=body.notes,
    )
    db.add(row)
    await db.flush()
    for line in body.items:
        db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=row.id, **line.model_dump()))
    await db.commit()
    await db.refresh(row)
    items_result = await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == row.id))
    return PurchaseOrderOut(
        id=row.id,
        tenant_id=row.tenant_id,
        po_code=row.po_code,
        supplier_name=row.supplier_name,
        order_date=row.order_date,
        expected_date=row.expected_date,
        status=row.status,
        notes=row.notes,
        items=list(items_result.scalars().all()),
    )


@router.patch("/purchase-orders/{po_id}/status", response_model=PurchaseOrderOut)
async def update_purchase_order_status(
    po_id: int,
    status_body: dict[str, str],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(PurchaseOrder, po_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    next_status = (status_body.get("status") or "").strip().upper()
    if next_status not in {"DRAFT", "APPROVED", "CLOSED", "CANCELLED"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    row.status = next_status
    await db.commit()
    await db.refresh(row)
    items_result = await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == row.id))
    return PurchaseOrderOut(
        id=row.id,
        tenant_id=row.tenant_id,
        po_code=row.po_code,
        supplier_name=row.supplier_name,
        order_date=row.order_date,
        expected_date=row.expected_date,
        status=row.status,
        notes=row.notes,
        items=list(items_result.scalars().all()),
    )


@router.get("/goods-receiving", response_model=list[GoodsReceivingOut])
async def list_goods_receiving(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(GoodsReceiving).where(GoodsReceiving.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(GoodsReceiving.status == status_filter.strip().upper())
    if date_from:
        stmt = stmt.where(GoodsReceiving.received_date >= date_from)
    if date_to:
        stmt = stmt.where(GoodsReceiving.received_date <= date_to)
    result = await db.execute(stmt.order_by(GoodsReceiving.id.desc()))
    rows = list(result.scalars().all())
    out: list[GoodsReceivingOut] = []
    for row in rows:
        items_result = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id))
        out.append(
            GoodsReceivingOut(
                id=row.id,
                tenant_id=row.tenant_id,
                grn_code=row.grn_code,
                purchase_order_id=row.purchase_order_id,
                received_date=row.received_date,
                status=row.status,
                notes=row.notes,
                items=list(items_result.scalars().all()),
            )
        )
    return out


@router.post("/goods-receiving", response_model=GoodsReceivingOut)
async def create_goods_receiving(
    body: GoodsReceivingBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.grn_code:
        grn_code = body.grn_code
    else:
        last_id = (await db.execute(select(func.max(GoodsReceiving.id)).where(GoodsReceiving.tenant_id == tenant.id))).scalar()
        grn_code = _next_code("GRN-", last_id)
    row = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=grn_code,
        purchase_order_id=body.purchase_order_id,
        received_date=body.received_date,
        status=body.status,
        notes=body.notes,
    )
    db.add(row)
    await db.flush()

    if body.items:
        lines = body.items
    elif body.purchase_order_id:
        po_items_result = await db.execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == body.purchase_order_id)
        )
        lines = [
            GoodsReceivingItemBody(item_id=p.item_id, warehouse_id=p.warehouse_id or 0, quantity=p.quantity)
            for p in po_items_result.scalars().all()
            if p.warehouse_id
        ]
    else:
        lines = []

    for line in lines:
        db.add(GoodsReceivingItem(tenant_id=tenant.id, goods_receiving_id=row.id, **line.model_dump()))
    await db.commit()
    await db.refresh(row)
    items_result = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id))
    return GoodsReceivingOut(
        id=row.id,
        tenant_id=row.tenant_id,
        grn_code=row.grn_code,
        purchase_order_id=row.purchase_order_id,
        received_date=row.received_date,
        status=row.status,
        notes=row.notes,
        items=list(items_result.scalars().all()),
    )


@router.post("/goods-receiving/{grn_id}/receive", response_model=GoodsReceivingOut)
async def receive_goods(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GoodsReceiving, grn_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    items_result = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id))
    items = list(items_result.scalars().all())
    if not items:
        raise HTTPException(status_code=400, detail="GRN has no items")
    for line in items:
        db.add(
            StockMovement(
                tenant_id=tenant.id,
                item_id=line.item_id,
                warehouse_id=line.warehouse_id,
                movement_type="IN",
                quantity=line.quantity,
                reference_type="GRN",
                reference_id=row.id,
                movement_date=row.received_date,
                notes=f"Received via {row.grn_code}",
            )
        )
    row.status = "RECEIVED"
    if row.purchase_order_id:
        po = await db.get(PurchaseOrder, row.purchase_order_id)
        if po and po.tenant_id == tenant.id and po.status != "CANCELLED":
            po.status = "CLOSED"
    await db.commit()
    await db.refresh(row)
    return GoodsReceivingOut(
        id=row.id,
        tenant_id=row.tenant_id,
        grn_code=row.grn_code,
        purchase_order_id=row.purchase_order_id,
        received_date=row.received_date,
        status=row.status,
        notes=row.notes,
        items=items,
    )


@router.get("/stock-summary", response_model=list[StockSummaryRow])
async def stock_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    movements_result = await db.execute(select(StockMovement).where(StockMovement.tenant_id == tenant.id))
    movements = list(movements_result.scalars().all())
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    wh_result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id))
    wh_map = {r.id: r for r in wh_result.scalars().all()}

    bucket: dict[tuple[int, int | None], dict[str, float]] = {}
    for mv in movements:
        key = (mv.item_id, mv.warehouse_id)
        if key not in bucket:
            bucket[key] = {"in_qty": 0.0, "out_qty": 0.0}
        qty = _to_float(mv.quantity)
        if mv.movement_type == "IN":
            bucket[key]["in_qty"] += qty
        else:
            bucket[key]["out_qty"] += qty
    rows: list[StockSummaryRow] = []
    for (item_id, warehouse_id), v in bucket.items():
        item = item_map.get(item_id)
        if not item:
            continue
        wh = wh_map.get(warehouse_id) if warehouse_id is not None else None
        rows.append(
            StockSummaryRow(
                item_id=item_id,
                item_code=item.item_code,
                item_name=item.name,
                warehouse_id=warehouse_id,
                warehouse_name=wh.name if wh else None,
                in_qty=round(v["in_qty"], 3),
                out_qty=round(v["out_qty"], 3),
                on_hand_qty=round(v["in_qty"] - v["out_qty"], 3),
            )
        )
    rows.sort(key=lambda r: (r.item_code, r.warehouse_name or ""))
    return rows


@router.get("/stock-ledger", response_model=list[StockLedgerRow])
async def stock_ledger(
    item_id: int | None = Query(default=None),
    warehouse_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(StockMovement).where(StockMovement.tenant_id == tenant.id).order_by(StockMovement.id.desc())
    if item_id is not None:
        stmt = stmt.where(StockMovement.item_id == item_id)
    if warehouse_id is not None:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    result = await db.execute(stmt.limit(500))
    rows = list(result.scalars().all())
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    wh_result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id))
    wh_map = {r.id: r for r in wh_result.scalars().all()}
    return [
        StockLedgerRow(
            id=row.id,
            movement_date=row.movement_date,
            movement_type=row.movement_type,
            item_id=row.item_id,
            item_code=item_map[row.item_id].item_code if row.item_id in item_map else f"#{row.item_id}",
            item_name=item_map[row.item_id].name if row.item_id in item_map else "Unknown",
            warehouse_id=row.warehouse_id,
            warehouse_name=wh_map[row.warehouse_id].name if row.warehouse_id in wh_map else None,
            quantity=row.quantity,
            reference_type=row.reference_type,
            reference_id=row.reference_id,
            notes=row.notes,
        )
        for row in rows
    ]


@router.get("/delivery-challans", response_model=list[DeliveryChallanOut])
async def list_delivery_challans(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(DeliveryChallan).where(DeliveryChallan.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(DeliveryChallan.status == status_filter.strip().upper())
    if date_from:
        stmt = stmt.where(DeliveryChallan.delivery_date >= date_from)
    if date_to:
        stmt = stmt.where(DeliveryChallan.delivery_date <= date_to)
    result = await db.execute(stmt.order_by(DeliveryChallan.id.desc()))
    rows = list(result.scalars().all())
    out: list[DeliveryChallanOut] = []
    for row in rows:
        lines_result = await db.execute(
            select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id).order_by(DeliveryChallanItem.id)
        )
        out.append(
            DeliveryChallanOut(
                id=row.id,
                tenant_id=row.tenant_id,
                challan_code=row.challan_code,
                customer_name=row.customer_name,
                delivery_date=row.delivery_date,
                status=row.status,
                notes=row.notes,
                items=list(lines_result.scalars().all()),
            )
        )
    return out


@router.post("/delivery-challans", response_model=DeliveryChallanOut)
async def create_delivery_challan(
    body: DeliveryChallanBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.challan_code:
        challan_code = body.challan_code
    else:
        last_id = (
            await db.execute(select(func.max(DeliveryChallan.id)).where(DeliveryChallan.tenant_id == tenant.id))
        ).scalar()
        challan_code = _next_code("DC-", last_id)
    row = DeliveryChallan(
        tenant_id=tenant.id,
        challan_code=challan_code,
        customer_name=body.customer_name,
        delivery_date=body.delivery_date,
        status=body.status,
        notes=body.notes,
    )
    db.add(row)
    await db.flush()
    for line in body.items:
        db.add(DeliveryChallanItem(tenant_id=tenant.id, challan_id=row.id, **line.model_dump()))
    await db.commit()
    await db.refresh(row)
    lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
    return DeliveryChallanOut(
        id=row.id,
        tenant_id=row.tenant_id,
        challan_code=row.challan_code,
        customer_name=row.customer_name,
        delivery_date=row.delivery_date,
        status=row.status,
        notes=row.notes,
        items=list(lines_result.scalars().all()),
    )


@router.post("/delivery-challans/{challan_id}/status", response_model=DeliveryChallanOut)
async def update_delivery_challan_status(
    challan_id: int,
    body: dict[str, str],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(DeliveryChallan, challan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Delivery challan not found")
    next_status = (body.get("status") or "").strip().upper()
    allowed = {"DRAFT", "SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "REJECTED"}
    if next_status not in allowed:
        raise HTTPException(status_code=400, detail="Invalid status")

    # Safe stock posting: only create OUT stock movements once.
    if next_status == "POSTED" and row.status != "POSTED":
        lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
        lines = list(lines_result.scalars().all())
        if not lines:
            raise HTTPException(status_code=400, detail="Delivery challan has no items")
        for line in lines:
            db.add(
                StockMovement(
                    tenant_id=tenant.id,
                    item_id=line.item_id,
                    warehouse_id=line.warehouse_id,
                    movement_type="OUT",
                    quantity=line.quantity,
                    reference_type="DELIVERY_CHALLAN",
                    reference_id=row.id,
                    movement_date=row.delivery_date,
                    notes=f"Posted {row.challan_code}",
                )
            )

    row.status = next_status
    await db.commit()
    await db.refresh(row)
    lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
    return DeliveryChallanOut(
        id=row.id,
        tenant_id=row.tenant_id,
        challan_code=row.challan_code,
        customer_name=row.customer_name,
        delivery_date=row.delivery_date,
        status=row.status,
        notes=row.notes,
        items=list(lines_result.scalars().all()),
    )


@router.get("/enhanced-gate-passes", response_model=list[GatePassOut])
async def list_enhanced_gate_passes(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(EnhancedGatePass).where(EnhancedGatePass.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(EnhancedGatePass.status == status_filter.strip().upper())
    if date_from:
        stmt = stmt.where(func.date(EnhancedGatePass.created_at) >= date_from)
    if date_to:
        stmt = stmt.where(func.date(EnhancedGatePass.created_at) <= date_to)
    result = await db.execute(stmt.order_by(EnhancedGatePass.id.desc()))
    return list(result.scalars().all())


@router.post("/enhanced-gate-passes", response_model=GatePassOut)
async def create_enhanced_gate_pass(
    body: GatePassBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.gate_pass_code:
        code = body.gate_pass_code
    else:
        last_id = (
            await db.execute(select(func.max(EnhancedGatePass.id)).where(EnhancedGatePass.tenant_id == tenant.id))
        ).scalar()
        code = _next_code("GP-", last_id)
    row = EnhancedGatePass(tenant_id=tenant.id, gate_pass_code=code, **body.model_dump(exclude={"gate_pass_code"}))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/enhanced-gate-passes/{gate_pass_id}/status", response_model=GatePassOut)
async def update_enhanced_gate_pass_status(
    gate_pass_id: int,
    body: dict[str, str | bool],
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(EnhancedGatePass, gate_pass_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    if "status" in body:
        next_status = str(body["status"]).strip().upper()
        allowed = {"DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "RELEASED"}
        if next_status not in allowed:
            raise HTTPException(status_code=400, detail="Invalid status")
        row.status = next_status
    if "guard_acknowledged" in body:
        row.guard_acknowledged = bool(body["guard_acknowledged"])
    await db.commit()
    await db.refresh(row)
    return row


class ProcessOrderBody(BaseModel):
    process_number: str | None = None
    process_type: str
    process_method: str = "in_house"
    linked_order_id: int | None = None
    warehouse_id: int | None = None
    input_item_id: int
    output_item_id: int
    input_quantity: str
    expected_output_qty: str
    remarks: str | None = None


class ProcessOrderOut(BaseModel):
    id: int
    tenant_id: int
    process_number: str
    process_type: str
    process_method: str
    linked_order_id: int | None
    warehouse_id: int | None
    input_item_id: int
    output_item_id: int
    input_quantity: str
    expected_output_qty: str
    actual_output_qty: str | None
    processing_charges: str
    status: str
    remarks: str | None

    class Config:
        from_attributes = True


class ProcessReceiveBody(BaseModel):
    actual_output_qty: str
    processing_charges: str | None = "0"


@router.get("/process-orders", response_model=list[ProcessOrderOut])
async def list_process_orders(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ProcessOrder).where(ProcessOrder.tenant_id == tenant.id).order_by(ProcessOrder.id.desc())
    )
    return list(result.scalars().all())


@router.get("/process-orders/{process_order_id}", response_model=ProcessOrderOut)
async def get_process_order(
    process_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    return row


@router.post("/process-orders", response_model=ProcessOrderOut)
async def create_process_order(
    body: ProcessOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    input_qty = _to_float(body.input_quantity)
    output_qty = _to_float(body.expected_output_qty)
    if input_qty <= 0 or output_qty <= 0:
        raise HTTPException(status_code=400, detail="Input and expected output quantity must be greater than 0")

    if body.process_number:
        process_number = body.process_number
    else:
        last_id = (await db.execute(select(func.max(ProcessOrder.id)).where(ProcessOrder.tenant_id == tenant.id))).scalar()
        process_number = _next_code("PRO-", last_id)
    row = ProcessOrder(tenant_id=tenant.id, process_number=process_number, **body.model_dump(exclude={"process_number"}))
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.put("/process-orders/{process_order_id}", response_model=ProcessOrderOut)
async def update_process_order(
    process_order_id: int,
    body: ProcessOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    if row.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft process order can be edited")
    input_qty = _to_float(body.input_quantity)
    output_qty = _to_float(body.expected_output_qty)
    if input_qty <= 0 or output_qty <= 0:
        raise HTTPException(status_code=400, detail="Input and expected output quantity must be greater than 0")
    for key, value in body.model_dump(exclude={"process_number"}).items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/process-orders/{process_order_id}/issue", response_model=ProcessOrderOut)
async def issue_process_order(
    process_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    if row.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft process order can be issued")
    if row.warehouse_id is None:
        raise HTTPException(status_code=400, detail="Warehouse is required before issuing process order")
    available = await _on_hand_qty(db, tenant.id, row.input_item_id, row.warehouse_id)
    req_qty = _to_float(row.input_quantity)
    if available < req_qty:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient stock for issue. Available={available}, Required={round(req_qty, 3)}",
        )
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=row.input_item_id,
            warehouse_id=row.warehouse_id,
            movement_type="OUT",
            quantity=row.input_quantity,
            reference_type="PROCESS_ORDER",
            reference_id=row.id,
            notes=f"Issue input for {row.process_number}",
        )
    )
    row.status = "ISSUED"
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/process-orders/{process_order_id}/receive", response_model=ProcessOrderOut)
async def receive_process_order(
    process_order_id: int,
    body: ProcessReceiveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    if row.status != "ISSUED":
        raise HTTPException(status_code=400, detail="Only issued process order can be received")
    actual_qty = _to_float(body.actual_output_qty)
    if actual_qty <= 0:
        raise HTTPException(status_code=400, detail="Actual output quantity must be greater than 0")
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=row.output_item_id,
            warehouse_id=row.warehouse_id,
            movement_type="IN",
            quantity=str(actual_qty),
            reference_type="PROCESS_ORDER",
            reference_id=row.id,
            notes=f"Receive output for {row.process_number}",
        )
    )
    row.actual_output_qty = str(actual_qty)
    row.processing_charges = body.processing_charges or "0"
    row.status = "RECEIVED"
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/process-orders/{process_order_id}/approve", response_model=ProcessOrderOut)
async def approve_process_order(
    process_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    if row.status != "RECEIVED":
        raise HTTPException(status_code=400, detail="Only received process order can be approved")
    row.status = "APPROVED"
    await db.commit()
    await db.refresh(row)
    return row


class ManufacturingOrderBody(BaseModel):
    mo_number: str | None = None
    finished_item_id: int
    planned_quantity: str
    notes: str | None = None


class ManufacturingOrderOut(BaseModel):
    id: int
    tenant_id: int
    mo_number: str
    finished_item_id: int
    planned_quantity: str
    completed_quantity: str
    current_stage: str | None
    status: str
    notes: str | None

    class Config:
        from_attributes = True


class ManufacturingStageOut(BaseModel):
    id: int
    tenant_id: int
    manufacturing_order_id: int
    stage_name: str
    stage_order: int
    status: str
    input_quantity: str | None
    output_quantity: str | None
    process_loss_percentage: str | None
    notes: str | None

    class Config:
        from_attributes = True


class ManufacturingStageUpdate(BaseModel):
    input_quantity: str | None = None
    output_quantity: str | None = None
    process_loss_percentage: str | None = None
    notes: str | None = None


STAGES = [
    "yarn_sourcing",
    "knitting",
    "dyeing",
    "printing",
    "cutting",
    "sewing",
    "washing",
    "finishing",
    "quality_check",
]


@router.get("/manufacturing-orders", response_model=list[ManufacturingOrderOut])
async def list_manufacturing_orders(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ManufacturingOrder).where(ManufacturingOrder.tenant_id == tenant.id).order_by(ManufacturingOrder.id.desc())
    )
    return list(result.scalars().all())


@router.get("/manufacturing-orders/{mo_id}", response_model=ManufacturingOrderOut)
async def get_manufacturing_order(
    mo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingOrder, mo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    return row


@router.get("/manufacturing-orders/{mo_id}/stages", response_model=list[ManufacturingStageOut])
async def list_manufacturing_stages(
    mo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ManufacturingStage)
        .where(ManufacturingStage.tenant_id == tenant.id, ManufacturingStage.manufacturing_order_id == mo_id)
        .order_by(ManufacturingStage.stage_order)
    )
    return list(result.scalars().all())


@router.post("/manufacturing-orders", response_model=ManufacturingOrderOut)
async def create_manufacturing_order(
    body: ManufacturingOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if _to_float(body.planned_quantity) <= 0:
        raise HTTPException(status_code=400, detail="Planned quantity must be greater than 0")
    if body.mo_number:
        mo_number = body.mo_number
    else:
        last_id = (await db.execute(select(func.max(ManufacturingOrder.id)).where(ManufacturingOrder.tenant_id == tenant.id))).scalar()
        mo_number = _next_code("MO-", last_id)
    row = ManufacturingOrder(
        tenant_id=tenant.id,
        mo_number=mo_number,
        finished_item_id=body.finished_item_id,
        planned_quantity=body.planned_quantity,
        completed_quantity="0",
        current_stage=STAGES[0],
        status="draft",
        notes=body.notes,
    )
    db.add(row)
    await db.flush()
    for idx, stage_name in enumerate(STAGES):
        db.add(
            ManufacturingStage(
                tenant_id=tenant.id,
                manufacturing_order_id=row.id,
                stage_name=stage_name,
                stage_order=idx + 1,
                status="pending",
            )
        )
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/manufacturing-orders/{mo_id}/start", response_model=ManufacturingOrderOut)
async def start_manufacturing_order(
    mo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingOrder, mo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    if row.status not in {"draft", "planned", "on_hold"}:
        raise HTTPException(status_code=400, detail="Invalid order status for start")
    row.status = "in_progress"
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/manufacturing-orders/{mo_id}/hold", response_model=ManufacturingOrderOut)
async def hold_manufacturing_order(
    mo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingOrder, mo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    if row.status != "in_progress":
        raise HTTPException(status_code=400, detail="Only in-progress order can be put on hold")
    row.status = "on_hold"
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/manufacturing-orders/{mo_id}/resume", response_model=ManufacturingOrderOut)
async def resume_manufacturing_order(
    mo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingOrder, mo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    if row.status != "on_hold":
        raise HTTPException(status_code=400, detail="Only on-hold order can be resumed")
    row.status = "in_progress"
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/manufacturing-orders/{mo_id}/complete", response_model=ManufacturingOrderOut)
async def complete_manufacturing_order(
    mo_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingOrder, mo_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Manufacturing order not found")
    stages_result = await db.execute(
        select(ManufacturingStage).where(
            ManufacturingStage.tenant_id == tenant.id, ManufacturingStage.manufacturing_order_id == row.id
        )
    )
    all_stages = list(stages_result.scalars().all())
    if not all_stages or not all(s.status in {"completed", "skipped"} for s in all_stages):
        raise HTTPException(status_code=400, detail="All stages must be completed or skipped before completion")
    row.status = "completed"
    if _to_float(row.completed_quantity) <= 0:
        row.completed_quantity = row.planned_quantity
    await db.commit()
    await db.refresh(row)
    return row


@router.post("/manufacturing-orders/stages/{stage_id}/start", response_model=ManufacturingStageOut)
async def start_manufacturing_stage(
    stage_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stage = await db.get(ManufacturingStage, stage_id)
    if not stage or stage.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Stage not found")
    if stage.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending stage can be started")
    prev_result = await db.execute(
        select(ManufacturingStage).where(
            ManufacturingStage.tenant_id == tenant.id,
            ManufacturingStage.manufacturing_order_id == stage.manufacturing_order_id,
            ManufacturingStage.stage_order == stage.stage_order - 1,
        )
    )
    prev_stage = prev_result.scalars().first()
    if prev_stage and prev_stage.status not in {"completed", "skipped"}:
        raise HTTPException(status_code=400, detail="Previous stage must be completed or skipped first")
    stage.status = "in_progress"
    await db.commit()
    await db.refresh(stage)
    return stage


@router.post("/manufacturing-orders/stages/{stage_id}/complete", response_model=ManufacturingStageOut)
async def complete_manufacturing_stage(
    stage_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stage = await db.get(ManufacturingStage, stage_id)
    if not stage or stage.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Stage not found")
    if stage.status != "in_progress":
        raise HTTPException(status_code=400, detail="Only in-progress stage can be completed")
    stage.status = "completed"
    await db.commit()
    await db.refresh(stage)

    order = await db.get(ManufacturingOrder, stage.manufacturing_order_id)
    if order and order.tenant_id == tenant.id:
        order.current_stage = stage.stage_name
        stages_result = await db.execute(
            select(ManufacturingStage).where(
                ManufacturingStage.tenant_id == tenant.id,
                ManufacturingStage.manufacturing_order_id == order.id,
            )
        )
        all_stages = list(stages_result.scalars().all())
        if all(s.status in {"completed", "skipped"} for s in all_stages):
            order.status = "completed"
            if _to_float(order.completed_quantity) <= 0:
                order.completed_quantity = order.planned_quantity
        await db.commit()
    return stage


@router.post("/manufacturing-orders/stages/{stage_id}/skip", response_model=ManufacturingStageOut)
async def skip_manufacturing_stage(
    stage_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stage = await db.get(ManufacturingStage, stage_id)
    if not stage or stage.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Stage not found")
    if stage.status not in {"pending", "in_progress"}:
        raise HTTPException(status_code=400, detail="Only pending or in-progress stage can be skipped")
    stage.status = "skipped"
    await db.commit()
    await db.refresh(stage)
    return stage


@router.put("/manufacturing-orders/stages/{stage_id}", response_model=ManufacturingStageOut)
async def update_manufacturing_stage(
    stage_id: int,
    body: ManufacturingStageUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stage = await db.get(ManufacturingStage, stage_id)
    if not stage or stage.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Stage not found")
    in_qty = _to_float(body.input_quantity) if body.input_quantity is not None else None
    out_qty = _to_float(body.output_quantity) if body.output_quantity is not None else None
    if in_qty is not None and in_qty < 0:
        raise HTTPException(status_code=400, detail="Input quantity cannot be negative")
    if out_qty is not None and out_qty < 0:
        raise HTTPException(status_code=400, detail="Output quantity cannot be negative")
    if in_qty is not None and out_qty is not None and out_qty > in_qty:
        raise HTTPException(status_code=400, detail="Output quantity cannot exceed input quantity")
    for key, value in body.model_dump().items():
        setattr(stage, key, value)
    await db.commit()
    await db.refresh(stage)
    return stage


class ConsumptionSnapshotRow(BaseModel):
    order_id: int
    snapshot_locked: bool
    items: list[dict]


class ReservationRow(BaseModel):
    item_id: int
    item_name: str
    reserved_qty: float
    issued_qty: float
    remaining_qty: float


class IssueMaterialBody(BaseModel):
    order_id: int
    item_id: int
    issue_qty: float
    warehouse_id: int | None = None
    remarks: str | None = None


class ReconciliationOverview(BaseModel):
    purchase_orders_total: int
    purchase_orders_open: int
    goods_receiving_total: int
    goods_receiving_open: int
    delivery_challans_total: int
    delivery_challans_posted: int
    gate_pass_total: int
    gate_pass_released: int
    stock_items_on_hand: int


@router.post("/consumption-control/finalize-order/{order_id}")
async def finalize_consumption_order(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    from app.models import ConsumptionPlan, ConsumptionPlanItem, Order  # local import avoids broader module churn

    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status == "FINALIZED":
        return {"ok": True, "already_finalized": True}
    plan_result = await db.execute(
        select(ConsumptionPlan).where(ConsumptionPlan.tenant_id == tenant.id, ConsumptionPlan.order_id == order_id)
    )
    plan = plan_result.scalars().first()
    if not plan:
        raise HTTPException(status_code=400, detail="No consumption plan found for this order")
    item_count = (
        await db.execute(
            select(func.count())
            .select_from(ConsumptionPlanItem)
            .where(ConsumptionPlanItem.tenant_id == tenant.id, ConsumptionPlanItem.plan_id == plan.id)
        )
    ).scalar()
    if not item_count:
        raise HTTPException(status_code=400, detail="Consumption plan has no items")
    order.status = "FINALIZED"
    await db.commit()
    return {"ok": True}


@router.get("/consumption-control/snapshot/{order_id}", response_model=ConsumptionSnapshotRow)
async def consumption_snapshot(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    from app.models import ConsumptionPlan, ConsumptionPlanItem, Order  # local import

    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")

    plan_result = await db.execute(
        select(ConsumptionPlan).where(ConsumptionPlan.tenant_id == tenant.id, ConsumptionPlan.order_id == order_id)
    )
    plan = plan_result.scalars().first()
    items: list[dict] = []
    if plan:
        item_master_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
        item_by_code = {str(i.item_code): i for i in item_master_result.scalars().all()}
        item_result = await db.execute(
            select(ConsumptionPlanItem).where(
                ConsumptionPlanItem.tenant_id == tenant.id, ConsumptionPlanItem.plan_id == plan.id
            )
        )
        item_rows = list(item_result.scalars().all())
        items = [
            {
                "planItemId": r.id,
                "itemId": item_by_code.get(str(r.item_code)).id if r.item_code and str(r.item_code) in item_by_code else 0,
                "itemName": r.item_code or "ITEM",
                "requiredQty": r.required_qty,
                "uom": r.uom,
            }
            for r in item_rows
        ]

    return ConsumptionSnapshotRow(order_id=order_id, snapshot_locked=order.status == "FINALIZED", items=items)


@router.get("/consumption-control/reservations/{order_id}", response_model=list[ReservationRow])
async def consumption_reservations(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    snapshot = await consumption_snapshot(order_id, tenant, user, db)
    rows: list[ReservationRow] = []
    for item in snapshot.items:
        item_id = int(item.get("itemId") or 0)
        if item_id <= 0:
            continue
        reserved = _to_float(str(item.get("requiredQty")))
        issue_result = await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.item_id == item_id,
                StockMovement.reference_type == "CONSUMPTION_ISSUE",
                StockMovement.reference_id == order_id,
            )
        )
        issue_rows = list(issue_result.scalars().all())
        issued = sum(_to_float(r.quantity) for r in issue_rows if r.movement_type == "OUT")
        rows.append(
            ReservationRow(
                item_id=item_id,
                item_name=str(item.get("itemName") or f"Item #{item_id}"),
                reserved_qty=round(reserved, 3),
                issued_qty=round(issued, 3),
                remaining_qty=round(max(reserved - issued, 0.0), 3),
            )
        )
    return rows


@router.post("/consumption-control/issue-material")
async def issue_consumption_material(
    body: IssueMaterialBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.issue_qty <= 0:
        raise HTTPException(status_code=400, detail="Issue quantity must be greater than 0")
    reservations = await consumption_reservations(body.order_id, tenant, user, db)
    target = next((r for r in reservations if r.item_id == body.item_id), None)
    if not target:
        raise HTTPException(status_code=404, detail="Reserved item not found for this order")
    if body.issue_qty > target.remaining_qty:
        raise HTTPException(
            status_code=400,
            detail=f"Issue quantity exceeds reservation. Remaining={target.remaining_qty}",
        )
    if body.warehouse_id is None:
        raise HTTPException(status_code=400, detail="Warehouse is required for issue")
    available = await _on_hand_qty(db, tenant.id, body.item_id, body.warehouse_id)
    if body.issue_qty > available:
        raise HTTPException(status_code=400, detail=f"Insufficient stock in warehouse. Available={available}")

    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=body.item_id,
            warehouse_id=body.warehouse_id,
            movement_type="OUT",
            quantity=str(body.issue_qty),
            reference_type="CONSUMPTION_ISSUE",
            reference_id=body.order_id,
            notes=body.remarks or "Issue against finalized consumption plan",
        )
    )
    await db.commit()
    return {"ok": True}


@router.get("/reconciliation/overview", response_model=ReconciliationOverview)
async def reconciliation_overview(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    po_rows = list((await db.execute(select(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant.id))).scalars().all())
    grn_rows = list((await db.execute(select(GoodsReceiving).where(GoodsReceiving.tenant_id == tenant.id))).scalars().all())
    challan_rows = list(
        (await db.execute(select(DeliveryChallan).where(DeliveryChallan.tenant_id == tenant.id))).scalars().all()
    )
    gate_rows = list(
        (await db.execute(select(EnhancedGatePass).where(EnhancedGatePass.tenant_id == tenant.id))).scalars().all()
    )
    stock_rows = await stock_summary(tenant, user, db)
    on_hand_items = len([r for r in stock_rows if r.on_hand_qty > 0])
    return ReconciliationOverview(
        purchase_orders_total=len(po_rows),
        purchase_orders_open=len([r for r in po_rows if (r.status or "").upper() not in {"CLOSED", "CANCELLED"}]),
        goods_receiving_total=len(grn_rows),
        goods_receiving_open=len([r for r in grn_rows if (r.status or "").upper() != "RECEIVED"]),
        delivery_challans_total=len(challan_rows),
        delivery_challans_posted=len([r for r in challan_rows if (r.status or "").upper() == "POSTED"]),
        gate_pass_total=len(gate_rows),
        gate_pass_released=len([r for r in gate_rows if (r.status or "").upper() == "RELEASED"]),
        stock_items_on_hand=on_hand_items,
    )


class ConsumptionChangeItemBody(BaseModel):
    plan_item_id: int
    new_qty: str
    reason: str | None = None


class ConsumptionChangeRequestBody(BaseModel):
    order_id: int
    change_type: str
    reason: str
    items: list[ConsumptionChangeItemBody]


class ConsumptionChangeRequestOut(BaseModel):
    id: int
    order_id: int
    change_type: str
    reason: str
    items: list[dict]
    status: str
    requested_by: int | None
    reviewed_by: int | None
    review_note: str | None
    created_at: datetime
    reviewed_at: datetime | None


class ConsumptionCRReviewBody(BaseModel):
    reason: str | None = None


@router.get("/consumption-control/change-requests", response_model=list[ConsumptionChangeRequestOut])
async def list_consumption_change_requests(
    status_filter: str | None = Query(default=None),
    order_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ConsumptionChangeRequest).where(ConsumptionChangeRequest.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(ConsumptionChangeRequest.status == status_filter.strip().upper())
    if order_id is not None:
        stmt = stmt.where(ConsumptionChangeRequest.order_id == order_id)
    result = await db.execute(stmt.order_by(ConsumptionChangeRequest.id.desc()))
    rows = list(result.scalars().all())
    return [
        ConsumptionChangeRequestOut(
            id=r.id,
            order_id=r.order_id,
            change_type=r.change_type,
            reason=r.reason,
            items=json.loads(r.items_json or "[]"),
            status=r.status,
            requested_by=r.requested_by,
            reviewed_by=r.reviewed_by,
            review_note=r.review_note,
            created_at=r.created_at,
            reviewed_at=r.reviewed_at,
        )
        for r in rows
    ]


@router.post("/consumption-control/change-request", response_model=ConsumptionChangeRequestOut)
async def create_consumption_change_request(
    body: ConsumptionChangeRequestBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    from app.models import ConsumptionPlan, ConsumptionPlanItem, Order

    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status != "FINALIZED":
        raise HTTPException(status_code=400, detail="Change request is allowed only for finalized orders")
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    plan_result = await db.execute(
        select(ConsumptionPlan).where(ConsumptionPlan.tenant_id == tenant.id, ConsumptionPlan.order_id == body.order_id)
    )
    plan = plan_result.scalars().first()
    if not plan:
        raise HTTPException(status_code=400, detail="No consumption plan found for this order")

    valid_ids_result = await db.execute(
        select(ConsumptionPlanItem.id).where(
            ConsumptionPlanItem.tenant_id == tenant.id,
            ConsumptionPlanItem.plan_id == plan.id,
        )
    )
    valid_ids = {r[0] for r in valid_ids_result.all()}
    payload_items: list[dict] = []
    for it in body.items:
        if it.plan_item_id not in valid_ids:
            raise HTTPException(status_code=400, detail=f"Invalid plan item id: {it.plan_item_id}")
        if _to_float(it.new_qty) <= 0:
            raise HTTPException(status_code=400, detail="New quantity must be greater than 0")
        payload_items.append({"plan_item_id": it.plan_item_id, "new_qty": it.new_qty, "reason": it.reason})

    row = ConsumptionChangeRequest(
        tenant_id=tenant.id,
        order_id=body.order_id,
        change_type=body.change_type.strip().upper(),
        reason=body.reason,
        items_json=json.dumps(payload_items),
        status="PENDING",
        requested_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return ConsumptionChangeRequestOut(
        id=row.id,
        order_id=row.order_id,
        change_type=row.change_type,
        reason=row.reason,
        items=payload_items,
        status=row.status,
        requested_by=row.requested_by,
        reviewed_by=row.reviewed_by,
        review_note=row.review_note,
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
    )


@router.post("/consumption-control/change-requests/{request_id}/approve", response_model=ConsumptionChangeRequestOut)
async def approve_consumption_change_request(
    request_id: int,
    body: ConsumptionCRReviewBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    from app.models import ConsumptionPlanItem

    row = await db.get(ConsumptionChangeRequest, request_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Change request not found")
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending request can be approved")

    items = json.loads(row.items_json or "[]")
    for item in items:
        plan_item_id = int(item.get("plan_item_id") or 0)
        new_qty = str(item.get("new_qty") or "0")
        cpi = await db.get(ConsumptionPlanItem, plan_item_id)
        if cpi and cpi.tenant_id == tenant.id:
            cpi.required_qty = new_qty

    row.status = "APPROVED"
    row.reviewed_by = user.id
    row.review_note = (body.reason if body else None) or row.review_note
    row.reviewed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return ConsumptionChangeRequestOut(
        id=row.id,
        order_id=row.order_id,
        change_type=row.change_type,
        reason=row.reason,
        items=items,
        status=row.status,
        requested_by=row.requested_by,
        reviewed_by=row.reviewed_by,
        review_note=row.review_note,
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
    )


@router.post("/consumption-control/change-requests/{request_id}/reject", response_model=ConsumptionChangeRequestOut)
async def reject_consumption_change_request(
    request_id: int,
    body: ConsumptionCRReviewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(ConsumptionChangeRequest, request_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Change request not found")
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending request can be rejected")
    if not (body.reason or "").strip():
        raise HTTPException(status_code=400, detail="Rejection reason is required")

    row.status = "REJECTED"
    row.reviewed_by = user.id
    row.review_note = body.reason
    row.reviewed_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return ConsumptionChangeRequestOut(
        id=row.id,
        order_id=row.order_id,
        change_type=row.change_type,
        reason=row.reason,
        items=json.loads(row.items_json or "[]"),
        status=row.status,
        requested_by=row.requested_by,
        reviewed_by=row.reviewed_by,
        review_note=row.review_note,
        created_at=row.created_at,
        reviewed_at=row.reviewed_at,
    )


