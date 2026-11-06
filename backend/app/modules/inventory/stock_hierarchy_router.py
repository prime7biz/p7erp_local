"""Sprint 2 stock hierarchy / batch / godown / transfer APIs."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.codegen import next_tenant_code
from app.common.inventory_policy import tenant_allows_negative_stock
from app.common.permissions import (
    PERMISSION_INVENTORY_BATCH_CREATE,
    PERMISSION_INVENTORY_BATCH_VIEW,
    PERMISSION_INVENTORY_GODOWN_VIEW,
    PERMISSION_INVENTORY_STOCK_GROUP_CREATE,
    PERMISSION_INVENTORY_STOCK_GROUP_DELETE,
    PERMISSION_INVENTORY_STOCK_GROUP_EDIT,
    PERMISSION_INVENTORY_STOCK_GROUP_VIEW,
    PERMISSION_INVENTORY_STOCK_ITEM_CREATE,
    PERMISSION_INVENTORY_STOCK_ITEM_EDIT,
    PERMISSION_INVENTORY_STOCK_ITEM_VIEW,
    PERMISSION_INVENTORY_STOCK_TRANSFER_CREATE,
    assert_soft_permission_allowed,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import (
    is_batch_tracking_enabled,
    is_stock_hierarchy_enabled,
)
from app.database import get_db
from app.models import Tenant, User
from app.models.costing import Item
from app.models.inventory import (
    StockBatch,
    StockGroup,
    StockItemPrice,
    StockMovement,
    Warehouse,
    WarehouseTransfer,
    WarehouseTransferLine,
)
from app.modules.inventory.stock_on_hand import on_hand_qty_by_item_warehouse
from app.modules.inventory.stock_batch_service import (
    batch_out,
    get_batch_availability,
    get_expiring_batches,
    issue_batch_fifo,
    mark_expired_batches,
    transfer_batch_qty,
)
from app.modules.inventory.stock_locks import lock_stock_items, on_hand_qty_decimal
from app.modules.inventory.stock_valuation_service import (
    _d,
    _money,
    get_stock_value,
    refresh_item_stock_caches,
)

router = APIRouter(prefix="/inventory", tags=["inventory-stock-hierarchy"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")


def _require_hierarchy(tenant: Tenant) -> None:
    if not is_stock_hierarchy_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=404,
            detail="Stock hierarchy is disabled. Enable tenant feature flag stock_hierarchy_enabled.",
        )


# --- Schemas ---


class StockGroupTreeNode(BaseModel):
    id: int
    group_code: str
    name: str
    parent_id: int | None
    is_active: bool
    default_valuation_method: str
    inventory_account_id: int | None = None
    sales_account_id: int | None = None
    purchase_account_id: int | None = None
    item_count: int = 0
    total_stock_value: str = "0"
    children: list["StockGroupTreeNode"] = Field(default_factory=list)


StockGroupTreeNode.model_rebuild()


class PriceUpsert(BaseModel):
    price_list_name: str
    price: Decimal
    currency: str = "BDT"
    effective_from: date | None = None
    effective_to: date | None = None
    is_active: bool = True


class PricesPutBody(BaseModel):
    prices: list[PriceUpsert]


class StockTransferItemBody(BaseModel):
    stock_item_id: int
    batch_id: int | None = None
    qty: Decimal


class StockTransferBody(BaseModel):
    from_godown_id: int
    to_godown_id: int
    items: list[StockTransferItemBody]
    notes: str | None = None
    auto_fifo: bool = True


# --- Stock groups tree ---


@router.get("/stock-groups/tree")
async def stock_groups_tree(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_GROUP_VIEW
    )
    groups = list(
        (
            await db.execute(
                select(StockGroup)
                .where(StockGroup.tenant_id == tenant.id)
                .order_by(StockGroup.group_code)
            )
        ).scalars().all()
    )
    counts = dict(
        (
            await db.execute(
                select(Item.stock_group_id, func.count(Item.id))
                .where(Item.tenant_id == tenant.id, Item.stock_group_id.is_not(None))
                .group_by(Item.stock_group_id)
            )
        ).all()
    )
    values = dict(
        (
            await db.execute(
                select(Item.stock_group_id, func.coalesce(func.sum(Item.current_value), 0))
                .where(Item.tenant_id == tenant.id, Item.stock_group_id.is_not(None))
                .group_by(Item.stock_group_id)
            )
        ).all()
    )

    by_id: dict[int, StockGroupTreeNode] = {}
    for g in groups:
        by_id[g.id] = StockGroupTreeNode(
            id=g.id,
            group_code=g.group_code,
            name=g.name,
            parent_id=g.parent_id,
            is_active=g.is_active,
            default_valuation_method=g.default_valuation_method or "FIFO",
            inventory_account_id=g.inventory_account_id,
            sales_account_id=g.sales_account_id,
            purchase_account_id=g.purchase_account_id,
            item_count=int(counts.get(g.id) or 0),
            total_stock_value=str(_money(_d(values.get(g.id)))),
            children=[],
        )
    roots: list[StockGroupTreeNode] = []
    for node in by_id.values():
        if node.parent_id and node.parent_id in by_id:
            by_id[node.parent_id].children.append(node)
        else:
            roots.append(node)
    return roots


@router.get("/stock-groups/{group_id}/items")
async def stock_group_items(
    group_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_ITEM_VIEW
    )
    sg = await db.get(StockGroup, group_id)
    if not sg or sg.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Stock group not found")
    items = (
        await db.execute(
            select(Item)
            .where(Item.tenant_id == tenant.id, Item.stock_group_id == group_id)
            .order_by(Item.item_code)
        )
    ).scalars().all()
    return [
        {
            "id": it.id,
            "item_code": it.item_code,
            "name": it.name,
            "current_stock": str(_money(_d(it.current_stock))),
            "avg_cost": str(_money(_d(it.avg_cost))),
            "standard_price": str(_money(_d(it.standard_price))) if it.standard_price is not None else None,
            "batch_tracking": bool(it.batch_tracking),
        }
        for it in items
    ]


# --- Stock items enhanced ---


class StockItemCreateBody(BaseModel):
    """Thin create for hierarchy UI; requires category + unit like master items."""

    name: str
    category_id: int
    unit_id: int
    stock_group_id: int | None = None
    item_code: str | None = None
    description: str | None = None
    subcategory_id: int | None = None
    default_warehouse_id: int | None = None
    default_cost: str = "0"
    base_unit: str | None = None
    alternate_unit: str | None = None
    conversion_factor: str | None = None
    standard_price: str | None = None
    batch_tracking: bool = False
    expiry_tracking: bool = False
    gst_applicable: bool = False
    gst_rate: str | None = None
    hsn_code: str | None = None
    default_valuation_method: str | None = None
    reorder_level: str | None = None
    is_active: bool = True


@router.get("/stock-items")
async def list_stock_items(
    group_id: int | None = Query(default=None),
    search: str | None = Query(default=None),
    low_stock: bool = Query(default=False),
    expiry_nearing: bool = Query(default=False),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_ITEM_VIEW
    )
    q = select(Item).where(Item.tenant_id == tenant.id, Item.is_active.is_(True))
    if group_id:
        q = q.where(Item.stock_group_id == group_id)
    if search:
        term = f"%{search.strip()}%"
        q = q.where(or_(Item.name.ilike(term), Item.item_code.ilike(term)))
    if low_stock:
        q = q.where(Item.reorder_level.is_not(None), Item.current_stock <= Item.reorder_level)
    if expiry_nearing and is_batch_tracking_enabled(tenant.feature_flags):
        expiring = await get_expiring_batches(db, tenant.id, days=30)
        ids = {e["stock_item_id"] for e in expiring}
        q = q.where(Item.id.in_(list(ids) or [-1]))

    total = int((await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one() or 0)
    rows = list(
        (
            await db.execute(
                q.order_by(Item.item_code).offset((page - 1) * page_size).limit(page_size)
            )
        ).scalars().all()
    )
    items = []
    for it in rows:
        unit_name = None
        sg_name = None
        if it.stock_group_id:
            sg = await db.get(StockGroup, it.stock_group_id)
            sg_name = sg.name if sg else None
        items.append(
            {
                "id": it.id,
                "item_code": it.item_code,
                "name": it.name,
                "stock_group_id": it.stock_group_id,
                "stock_group_name": sg_name,
                "base_unit": it.base_unit or unit_name,
                "current_stock": str(_money(_d(it.current_stock))),
                "avg_cost": str(_money(_d(it.avg_cost))),
                "standard_price": str(_money(_d(it.standard_price))) if it.standard_price is not None else None,
                "batch_tracking": bool(it.batch_tracking),
                "reorder_level": str(_money(_d(it.reorder_level))) if it.reorder_level is not None else None,
            }
        )
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.post("/stock-items")
async def create_stock_item(
    body: StockItemCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_ITEM_CREATE
    )
    from app.modules.inventory.router import (
        ItemBody,
        create_item,
    )

    # Reuse master create path for validation + codegen
    item_body = ItemBody(
        item_code=body.item_code,
        name=body.name,
        description=body.description,
        category_id=body.category_id,
        subcategory_id=body.subcategory_id,
        unit_id=body.unit_id,
        default_warehouse_id=body.default_warehouse_id,
        stock_group_id=body.stock_group_id,
        default_cost=body.default_cost,
        is_active=body.is_active,
        base_unit=body.base_unit,
        alternate_unit=body.alternate_unit,
        conversion_factor=body.conversion_factor,
        standard_price=body.standard_price,
        batch_tracking=body.batch_tracking,
        expiry_tracking=body.expiry_tracking,
        gst_applicable=body.gst_applicable,
        gst_rate=body.gst_rate,
        hsn_code=body.hsn_code,
        default_valuation_method=body.default_valuation_method,
        reorder_level=body.reorder_level,
    )
    return await create_item(item_body, tenant=tenant, user=user, db=db)


@router.get("/stock-items/{item_id}")
async def get_stock_item_detail(
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_ITEM_VIEW
    )
    it = await db.get(Item, item_id)
    if not it or it.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")

    valuation = await get_stock_value(db, tenant.id, item_id)
    batches = await get_batch_availability(db, tenant.id, item_id) if is_batch_tracking_enabled(tenant.feature_flags) else []
    prices = (
        await db.execute(
            select(StockItemPrice)
            .where(StockItemPrice.tenant_id == tenant.id, StockItemPrice.stock_item_id == item_id)
            .order_by(StockItemPrice.price_list_name)
        )
    ).scalars().all()

    # Godown-wise from batches or movements
    godown_map: dict[int | None, Decimal] = {}
    if batches:
        for b in batches:
            gid = b.get("godown_id")
            godown_map[gid] = godown_map.get(gid, Decimal("0")) + _d(b["current_qty"])
    else:
        whs = (
            await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id, Warehouse.is_active.is_(True)))
        ).scalars().all()
        qty_by_pair = await on_hand_qty_by_item_warehouse(
            db, tenant.id, warehouse_ids=[wh.id for wh in whs], item_ids=[item_id]
        )
        for wh in whs:
            qty = qty_by_pair.get((item_id, wh.id), 0.0)
            if qty > 0:
                godown_map[wh.id] = Decimal(str(qty))

    godown_rows = []
    for gid, qty in godown_map.items():
        name = None
        if gid:
            wh = await db.get(Warehouse, gid)
            name = wh.name if wh else None
        godown_rows.append({"godown_id": gid, "godown_name": name, "qty": str(_money(qty))})

    movements = (
        await db.execute(
            select(StockMovement)
            .where(StockMovement.tenant_id == tenant.id, StockMovement.item_id == item_id)
            .order_by(StockMovement.movement_date.desc(), StockMovement.id.desc())
            .limit(100)
        )
    ).scalars().all()

    return {
        "id": it.id,
        "item_code": it.item_code,
        "name": it.name,
        "stock_group_id": it.stock_group_id,
        "base_unit": it.base_unit,
        "alternate_unit": it.alternate_unit,
        "conversion_factor": str(it.conversion_factor) if it.conversion_factor is not None else None,
        "standard_price": str(_money(_d(it.standard_price))) if it.standard_price is not None else None,
        "current_stock": str(_money(_d(it.current_stock))),
        "current_value": str(_money(_d(it.current_value))),
        "avg_cost": str(_money(_d(it.avg_cost))),
        "batch_tracking": bool(it.batch_tracking),
        "expiry_tracking": bool(it.expiry_tracking),
        "gst_applicable": bool(it.gst_applicable),
        "gst_rate": str(it.gst_rate) if it.gst_rate is not None else None,
        "hsn_code": it.hsn_code,
        "default_valuation_method": it.default_valuation_method,
        "reorder_level": str(_money(_d(it.reorder_level))) if it.reorder_level is not None else None,
        "valuation": valuation,
        "batches": batches,
        "prices": [
            {
                "id": p.id,
                "price_list_name": p.price_list_name,
                "price": str(_money(_d(p.price))),
                "currency": p.currency,
                "effective_from": p.effective_from.isoformat() if p.effective_from else None,
                "effective_to": p.effective_to.isoformat() if p.effective_to else None,
                "is_active": p.is_active,
            }
            for p in prices
        ],
        "godown_stock": godown_rows,
        "ledger": [
            {
                "id": m.id,
                "date": m.movement_date.isoformat() if m.movement_date else None,
                "type": m.movement_type,
                "qty": str(m.quantity),
                "warehouse_id": m.warehouse_id,
                "batch_id": m.batch_id,
                "lot_number": m.lot_number,
                "reference_type": m.reference_type,
                "reference_id": m.reference_id,
                "notes": m.notes,
            }
            for m in movements
        ],
    }


@router.put("/stock-items/{item_id}/prices")
async def put_stock_item_prices(
    item_id: int,
    body: PricesPutBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_ITEM_EDIT
    )
    it = await db.get(Item, item_id)
    if not it or it.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")

    existing = list(
        (
            await db.execute(
                select(StockItemPrice).where(
                    StockItemPrice.tenant_id == tenant.id,
                    StockItemPrice.stock_item_id == item_id,
                )
            )
        ).scalars().all()
    )
    by_key = {(p.price_list_name, p.effective_from): p for p in existing}
    for row in body.prices:
        key = (row.price_list_name.strip(), row.effective_from)
        if key in by_key:
            p = by_key[key]
            p.price = row.price
            p.currency = row.currency
            p.effective_to = row.effective_to
            p.is_active = row.is_active
        else:
            db.add(
                StockItemPrice(
                    tenant_id=tenant.id,
                    stock_item_id=item_id,
                    price_list_name=row.price_list_name.strip(),
                    price=row.price,
                    currency=row.currency,
                    effective_from=row.effective_from,
                    effective_to=row.effective_to,
                    is_active=row.is_active,
                )
            )
    await db.commit()
    return {"ok": True, "count": len(body.prices)}


# --- Batches ---


@router.get("/stock-items/{item_id}/batches")
async def list_item_batches(
    item_id: int,
    godown_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not is_batch_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Batch tracking is disabled")
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_BATCH_VIEW
    )
    it = await db.get(Item, item_id)
    if not it or it.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    return await get_batch_availability(db, tenant.id, item_id, godown_id)


@router.get("/stock-batches/expiring")
async def list_expiring_batches(
    days: int = Query(default=30, ge=0, le=365),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not is_batch_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Batch tracking is disabled")
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_BATCH_VIEW
    )
    return await get_expiring_batches(db, tenant.id, days=days)


@router.post("/stock-batches/mark-expired")
async def api_mark_expired(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not is_batch_tracking_enabled(tenant.feature_flags):
        raise HTTPException(status_code=404, detail="Batch tracking is disabled")
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_BATCH_CREATE
    )
    n = await mark_expired_batches(db, tenant.id)
    await db.commit()
    return {"expired": n}


# --- Godown stock ---


@router.get("/godowns/{godown_id}/stock")
async def godown_stock(
    godown_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_GODOWN_VIEW
    )
    wh = await db.get(Warehouse, godown_id)
    if not wh or wh.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Godown not found")

    if is_batch_tracking_enabled(tenant.feature_flags):
        batches = (
            await db.execute(
                select(StockBatch).where(
                    StockBatch.tenant_id == tenant.id,
                    StockBatch.godown_id == godown_id,
                    StockBatch.status == "ACTIVE",
                    StockBatch.current_qty > 0,
                )
            )
        ).scalars().all()
        by_item: dict[int, Decimal] = {}
        for b in batches:
            by_item[b.stock_item_id] = by_item.get(b.stock_item_id, Decimal("0")) + _d(b.current_qty)
        rows = []
        for iid, qty in by_item.items():
            it = await db.get(Item, iid)
            rows.append(
                {
                    "item_id": iid,
                    "item_code": it.item_code if it else None,
                    "name": it.name if it else None,
                    "qty": str(_money(qty)),
                }
            )
        return {"godown_id": godown_id, "godown_name": wh.name, "items": rows}

    items = (
        await db.execute(select(Item).where(Item.tenant_id == tenant.id, Item.is_active.is_(True)))
    ).scalars().all()
    qty_by_pair = await on_hand_qty_by_item_warehouse(db, tenant.id, warehouse_ids=[godown_id])
    rows = []
    for it in items:
        qty = qty_by_pair.get((it.id, godown_id), 0.0)
        if qty > 0:
            rows.append(
                {
                    "item_id": it.id,
                    "item_code": it.item_code,
                    "name": it.name,
                    "qty": str(_money(Decimal(str(qty)))),
                }
            )
    return {"godown_id": godown_id, "godown_name": wh.name, "items": rows}


@router.get("/stock-by-godown")
async def stock_by_godown_matrix(
    group_id: int | None = Query(default=None),
    godown_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_GODOWN_VIEW
    )
    wh_q = select(Warehouse).where(Warehouse.tenant_id == tenant.id, Warehouse.is_active.is_(True))
    if godown_id:
        wh_q = wh_q.where(Warehouse.id == godown_id)
    warehouses = list((await db.execute(wh_q.order_by(Warehouse.warehouse_code))).scalars().all())

    item_q = select(Item).where(Item.tenant_id == tenant.id, Item.is_active.is_(True))
    if group_id:
        item_q = item_q.where(Item.stock_group_id == group_id)
    items = list((await db.execute(item_q.order_by(Item.item_code).limit(200))).scalars().all())

    batch_tracking = is_batch_tracking_enabled(tenant.feature_flags)
    qty_by_pair: dict[tuple[int, int], float] = {}
    if not batch_tracking:
        qty_by_pair = await on_hand_qty_by_item_warehouse(
            db, tenant.id, warehouse_ids=[w.id for w in warehouses], item_ids=[it.id for it in items]
        )

    matrix = []
    for it in items:
        cells = {}
        for wh in warehouses:
            if batch_tracking:
                avail = await get_batch_availability(db, tenant.id, it.id, wh.id)
                qty = sum((_d(b["current_qty"]) for b in avail), Decimal("0"))
            else:
                qty = Decimal(str(qty_by_pair.get((it.id, wh.id), 0.0)))
            cells[str(wh.id)] = str(_money(qty))
        matrix.append(
            {
                "item_id": it.id,
                "item_code": it.item_code,
                "name": it.name,
                "stock_group_id": it.stock_group_id,
                "cells": cells,
            }
        )
    return {
        "godowns": [
            {
                "id": w.id,
                "code": w.warehouse_code,
                "name": w.name,
                "is_store": w.is_store,
                "is_production_floor": w.is_production_floor,
                "is_rejected": w.is_rejected,
                "is_quarantine": bool(getattr(w, "is_quarantine", False)),

            }
            for w in warehouses
        ],
        "rows": matrix,
    }


# --- Stock transfer (batch-aware, no GL) ---


@router.post("/stock-transfers")
async def create_stock_transfer(
    body: StockTransferBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_TRANSFER_CREATE
    )
    if body.from_godown_id == body.to_godown_id:
        raise HTTPException(status_code=400, detail="from_godown_id and to_godown_id must differ")
    from_wh = await db.get(Warehouse, body.from_godown_id)
    to_wh = await db.get(Warehouse, body.to_godown_id)
    if not from_wh or from_wh.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Source godown not found")
    if not to_wh or to_wh.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Destination godown not found")
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one item is required")

    await lock_stock_items(db, tenant.id, (ln.stock_item_id for ln in body.items))
    if not await tenant_allows_negative_stock(db, tenant.id):
        need_by_item: dict[int, Decimal] = {}
        for ln in body.items:
            q = _money(_d(ln.qty))
            if q > 0:
                need_by_item[ln.stock_item_id] = need_by_item.get(ln.stock_item_id, Decimal("0")) + q
        for iid, need in need_by_item.items():
            available = await on_hand_qty_decimal(db, tenant.id, iid, body.from_godown_id)
            if available + Decimal("0.0001") < need:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient stock for item {iid} at source. Available={available}, required={need}",
                )

    code = await next_tenant_code(db, model=WarehouseTransfer, tenant_id=tenant.id, prefix="ST-", width=5)
    transfer = WarehouseTransfer(
        tenant_id=tenant.id,
        transfer_code=code,
        from_warehouse_id=body.from_godown_id,
        to_warehouse_id=body.to_godown_id,
        status="POSTED",
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(transfer)
    await db.flush()

    results = []
    for line in body.items:
        qty = _money(_d(line.qty))
        if qty <= 0:
            continue
        it = await db.get(Item, line.stock_item_id)
        if not it or it.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Item {line.stock_item_id} not found")

        db.add(
            WarehouseTransferLine(
                tenant_id=tenant.id,
                transfer_id=transfer.id,
                item_id=line.stock_item_id,
                quantity=qty,
            )
        )

        # OUT movement
        out_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.stock_item_id,
            warehouse_id=body.from_godown_id,
            movement_type="OUT",
            quantity=qty,
            reference_type="STOCK_TRANSFER",
            reference_id=transfer.id,
            movement_date=date.today(),
            notes=f"Transfer {code} → {to_wh.warehouse_code}",
            created_by_user_id=user.id,
            movement_kind="WAREHOUSE_TRANSFER_OUT",
        )
        db.add(out_mv)
        await db.flush()

        batch_allocs: list[dict[str, Any]] = []
        if is_batch_tracking_enabled(tenant.feature_flags) and it.batch_tracking:
            if line.batch_id:
                dest = await transfer_batch_qty(
                    db,
                    tenant.id,
                    batch_id=line.batch_id,
                    to_godown_id=body.to_godown_id,
                    qty=qty,
                )
                out_mv.batch_id = line.batch_id
                batch_allocs = [{"batch_id": line.batch_id, "dest_batch_id": dest.id, "qty": str(qty)}]
            elif body.auto_fifo:
                allocs = await issue_batch_fifo(
                    db,
                    tenant.id,
                    line.stock_item_id,
                    body.from_godown_id,
                    qty,
                    method="FIFO",
                    feature_flags=tenant.feature_flags,
                )
                # Recreate destination batches for each allocation
                for a in allocs:
                    src_batch = await db.get(StockBatch, a["batch_id"])
                    if src_batch:
                        # issue_batch_fifo already reduced source; create dest line
                        dest = (
                            await db.execute(
                                select(StockBatch).where(
                                    StockBatch.tenant_id == tenant.id,
                                    StockBatch.stock_item_id == line.stock_item_id,
                                    StockBatch.batch_number == src_batch.batch_number,
                                    StockBatch.godown_id == body.to_godown_id,
                                )
                            )
                        ).scalar_one_or_none()
                        take = _d(a["qty"])
                        if dest:
                            dest.received_qty = _money(_d(dest.received_qty) + take)
                            dest.current_qty = _money(_d(dest.current_qty) + take)
                            dest.status = "ACTIVE"
                        else:
                            dest = StockBatch(
                                tenant_id=tenant.id,
                                stock_item_id=line.stock_item_id,
                                batch_number=src_batch.batch_number,
                                manufacturing_date=src_batch.manufacturing_date,
                                expiry_date=src_batch.expiry_date,
                                opening_qty=Decimal("0"),
                                received_qty=take,
                                issued_qty=Decimal("0"),
                                current_qty=take,
                                cost_per_unit=src_batch.cost_per_unit,
                                godown_id=body.to_godown_id,
                                status="ACTIVE",
                            )
                            db.add(dest)
                        batch_allocs.append({**a, "dest_batch_id": dest.id if dest else None})
                await db.flush()

        in_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.stock_item_id,
            warehouse_id=body.to_godown_id,
            movement_type="IN",
            quantity=qty,
            reference_type="STOCK_TRANSFER",
            reference_id=transfer.id,
            movement_date=date.today(),
            notes=f"Transfer {code} from {from_wh.warehouse_code}",
            created_by_user_id=user.id,
            movement_kind="WAREHOUSE_TRANSFER_IN",
        )
        db.add(in_mv)
        await refresh_item_stock_caches(db, tenant.id, line.stock_item_id)
        results.append(
            {
                "item_id": line.stock_item_id,
                "qty": str(qty),
                "batch_allocations": batch_allocs,
            }
        )

    await db.commit()
    return {
        "id": transfer.id,
        "transfer_code": transfer.transfer_code,
        "from_godown_id": body.from_godown_id,
        "to_godown_id": body.to_godown_id,
        "status": transfer.status,
        "lines": results,
    }


@router.get("/stock-items/{item_id}/valuation")
async def item_valuation(
    item_id: int,
    godown_id: int | None = Query(default=None),
    method: str | None = Query(default=None),
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    _require_hierarchy(tenant)
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_STOCK_ITEM_VIEW
    )
    return await get_stock_value(
        db,
        tenant.id,
        item_id,
        godown_id=godown_id,
        as_of_date=as_of_date,
        method=method,
    )
