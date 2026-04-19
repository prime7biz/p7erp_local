"""Classic style-level BOMs under /merch/boms (not order-boms)."""

from __future__ import annotations

from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.money import format_money, parse_money, safe_decimal
from app.common.codegen import next_tenant_code
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.common.workflow import BOM_TRANSITIONS, validate_transition
from app.database import get_db
from app.models import (
    Bom,
    BomItem,
    GarmentStyle,
    Item,
    ItemUnit,
    PurchaseOrder,
    PurchaseOrderItem,
    Tenant,
    User,
    Vendor,
)
from app.modules.merch.bom_utils import GOVERNED_BOM_STATUSES
from app.modules.merch.deps import ensure_tenant as _ensure_tenant, to_float_safe as _to_float_safe
from app.modules.merch.permissions import (
    MERCH_PERMISSION_BOM_APPROVE,
    MERCH_PERMISSION_BOM_FREEZE,
    MERCH_PERMISSION_PO_GENERATE,
    require_merch_permission,
)

router = APIRouter(tags=["merch"])

class BomCreate(BaseModel):
    style_id: int
    version_no: int = 1
    status: str = "DRAFT"
    notes: str | None = None


class BomUpdate(BaseModel):
    version_no: int | None = None
    status: str | None = None
    notes: str | None = None


class BomItemBody(BaseModel):
    item_id: int | None = None
    category: str
    item_code: str | None = None
    description: str | None = None
    uom: str | None = None
    base_consumption: str
    wastage_pct: str | None = None


@router.get("/boms")
async def list_boms(
    response: Response,
    style_id: int | None = Query(default=None),
    limit: int = Query(default=200, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(Bom).where(Bom.tenant_id == tenant.id)
    if style_id is not None:
        stmt = stmt.where(Bom.style_id == style_id)
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int((await db.execute(count_stmt)).scalar() or 0)
    result = await db.execute(stmt.order_by(Bom.created_at.desc()).offset(offset).limit(limit))
    response.headers["X-Total-Count"] = str(total)
    return result.scalars().all()


@router.post("/boms", status_code=201)
async def create_bom(
    body: BomCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    style = await db.get(GarmentStyle, body.style_id)
    if not style or style.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Style not found")
    payload = body.model_dump()
    payload["status"] = validate_transition(
        BOM_TRANSITIONS,
        "DRAFT",
        payload.get("status") or "DRAFT",
        fallback="DRAFT",
        entity_label="bom",
    )
    row = Bom(tenant_id=tenant.id, **payload)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.get("/boms/{bom_id}")
async def get_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    items = await db.execute(
        select(BomItem)
        .where(BomItem.tenant_id == tenant.id, BomItem.bom_id == bom_id)
        .order_by(BomItem.id)
    )
    return {"bom": bom, "items": items.scalars().all()}


@router.patch("/boms/{bom_id}")
async def update_bom(
    bom_id: int,
    body: BomUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Bom, bom_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if body.version_no is not None:
        row.version_no = body.version_no
    if body.status is not None:
        row.status = validate_transition(
            BOM_TRANSITIONS,
            row.status,
            body.status,
            fallback="DRAFT",
            entity_label="bom",
        )
    if body.notes is not None:
        row.notes = body.notes
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/boms/{bom_id}", status_code=204)
async def delete_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Bom, bom_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (row.status or "").upper() in GOVERNED_BOM_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Approved/Frozen BOM cannot be deleted. Create a new BOM version instead.",
        )
    await db.delete(row)
    await db.flush()


@router.post("/boms/{bom_id}/submit")
async def submit_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Bom, bom_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    row.status = validate_transition(
        BOM_TRANSITIONS,
        row.status,
        "SUBMITTED",
        fallback="DRAFT",
        entity_label="bom",
    )
    await db.flush()
    await db.refresh(row)
    return row


@router.post("/boms/{bom_id}/approve")
async def approve_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_BOM_APPROVE)),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Bom, bom_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    row.status = validate_transition(
        BOM_TRANSITIONS,
        row.status,
        "APPROVED",
        fallback="DRAFT",
        entity_label="bom",
    )
    await db.flush()
    await db.refresh(row)
    return row


@router.post("/boms/{bom_id}/freeze")
async def freeze_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_BOM_FREEZE)),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Bom, bom_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    row.status = validate_transition(
        BOM_TRANSITIONS,
        row.status,
        "FROZEN",
        fallback="DRAFT",
        entity_label="bom",
    )
    await db.flush()
    await db.refresh(row)
    return row


@router.post("/boms/{bom_id}/items", status_code=201)
async def create_bom_item(
    bom_id: int,
    body: BomItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (bom.status or "").upper() in GOVERNED_BOM_STATUSES:
        raise HTTPException(status_code=400, detail="BOM is approved/frozen and cannot be edited.")
    payload = body.model_dump()
    item_id = payload.get("item_id")
    if item_id is not None:
        item = await db.get(Item, item_id)
        if not item or item.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Item not found or not in tenant")
        if payload.get("item_code") is None:
            payload["item_code"] = item.item_code
        if payload.get("description") is None:
            payload["description"] = item.name or item.description
        if payload.get("uom") is None:
            unit = await db.get(ItemUnit, item.unit_id) if item.unit_id else None
            if unit and unit.tenant_id != tenant.id:
                unit = None
            payload["uom"] = unit.unit_code if unit else None
    base_dec = parse_money(payload.get("base_consumption"))
    payload["base_consumption"] = base_dec if base_dec is not None else Decimal("0")
    payload["wastage_pct"] = parse_money(payload.get("wastage_pct"))
    row = BomItem(tenant_id=tenant.id, bom_id=bom_id, **payload)
    db.add(row)
    await db.flush()
    await db.refresh(row)
    return row


@router.patch("/boms/{bom_id}/items/{item_id}")
async def update_bom_item(
    bom_id: int,
    item_id: int,
    body: BomItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (bom.status or "").upper() in GOVERNED_BOM_STATUSES:
        raise HTTPException(status_code=400, detail="BOM is approved/frozen and cannot be edited.")
    row = await db.get(BomItem, item_id)
    if not row or row.tenant_id != tenant.id or row.bom_id != bom_id:
        raise HTTPException(status_code=404, detail="BOM item not found")
    patch = body.model_dump(exclude_unset=True)
    if not patch:
        await db.refresh(row)
        return row
    if "item_id" in patch:
        new_item_id = patch["item_id"]
        if new_item_id is not None:
            item = await db.get(Item, new_item_id)
            if not item or item.tenant_id != tenant.id:
                raise HTTPException(status_code=404, detail="Item not found or not in tenant")
            if "item_code" not in patch:
                patch["item_code"] = item.item_code
            if "description" not in patch:
                patch["description"] = item.name or item.description
            if "uom" not in patch:
                unit = await db.get(ItemUnit, item.unit_id) if item.unit_id else None
                if unit and unit.tenant_id != tenant.id:
                    unit = None
                patch["uom"] = unit.unit_code if unit else None
    if "base_consumption" in patch:
        base_dec = parse_money(patch.get("base_consumption"))
        patch["base_consumption"] = base_dec if base_dec is not None else Decimal("0")
    if "wastage_pct" in patch:
        patch["wastage_pct"] = parse_money(patch.get("wastage_pct"))
    for key, value in patch.items():
        setattr(row, key, value)
    await db.flush()
    await db.refresh(row)
    return row


@router.delete("/boms/{bom_id}/items/{item_id}", status_code=204)
async def delete_bom_item(
    bom_id: int,
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (bom.status or "").upper() in GOVERNED_BOM_STATUSES:
        raise HTTPException(status_code=400, detail="BOM is approved/frozen and cannot be edited.")
    row = await db.get(BomItem, item_id)
    if not row or row.tenant_id != tenant.id or row.bom_id != bom_id:
        raise HTTPException(status_code=404, detail="BOM item not found")
    await db.delete(row)
    await db.flush()


class GeneratePOFromBOMBody(BaseModel):
    quantity: float
    supplier_name: str | None = None
    vendor_id: int | None = None


@router.post("/boms/{bom_id}/generate-purchase-order")
async def generate_purchase_order_from_bom(
    bom_id: int,
    body: GeneratePOFromBOMBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_PO_GENERATE)),
):
    """Create a draft purchase order from BOM lines that have item_id set. Qty = quantity × base_consumption × (1 + wastage_pct/100)."""
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (bom.status or "").upper() not in GOVERNED_BOM_STATUSES:
        raise HTTPException(
            status_code=400,
            detail="Only APPROVED/FROZEN BOM can generate purchase order.",
        )
    result = await db.execute(
        select(BomItem)
        .where(
            BomItem.tenant_id == tenant.id,
            BomItem.bom_id == bom_id,
            BomItem.item_id.isnot(None),
        )
        .order_by(BomItem.id)
    )
    bom_lines = list(result.scalars().all())
    if not bom_lines:
        raise HTTPException(
            status_code=400,
            detail="BOM has no lines linked to inventory items. Link BOM lines to items first.",
        )
    quantity = body.quantity
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be positive")

    supplier_name = (body.supplier_name or "").strip() or "From BOM"
    vendor_id = body.vendor_id
    if vendor_id is not None:
        vendor = await db.get(Vendor, vendor_id)
        if not vendor or vendor.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Vendor not found")
        supplier_name = vendor.name
    else:
        vendor_id = None

    po_code = await next_tenant_code(
        db,
        model=PurchaseOrder,
        tenant_id=tenant.id,
        prefix="PO-",
        width=4,
    )
    warnings: list[str] = []

    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=po_code,
        vendor_id=vendor_id,
        supplier_name=supplier_name,
        status="DRAFT",
        source_bom_id=bom_id,
        notes=f"Generated from BOM #{bom_id} (Style {bom.style_id}), quantity={quantity}",
    )
    db.add(po)
    await db.flush()

    for line in bom_lines:
        item = await db.get(Item, line.item_id)
        if not item or item.tenant_id != tenant.id:
            warnings.append(f"Skipped BOM line {line.id}: item not found or wrong tenant.")
            continue
        base_d = safe_decimal(line.base_consumption, default=Decimal("0"))
        wastage_d = safe_decimal(line.wastage_pct, default=Decimal("0"))
        qty_dec = Decimal(str(quantity)) * base_d * (Decimal("1") + wastage_d / Decimal("100"))
        qty_str = format_money(qty_dec) or "0"
        unit_price = format_money(parse_money(item.default_cost)) or "0"
        db.add(
            PurchaseOrderItem(
                tenant_id=tenant.id,
                purchase_order_id=po.id,
                item_id=line.item_id,
                quantity=qty_str,
                unit_price=unit_price,
            )
        )
    await db.commit()
    await db.refresh(po)
    return {"id": po.id, "po_code": po.po_code, "warnings": warnings}
