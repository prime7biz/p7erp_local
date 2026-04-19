"""Order-driven BOM API (under /merch/order-boms/*)."""

from __future__ import annotations

from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import PERMISSION_BOM_PRICE_OVERRIDE, assert_delegate_manager_or_permission
from app.database import get_db
from app.models import (
    Bom,
    BomItem,
    Customer,
    GarmentStyle,
    Order,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    QuotationMaterial,
    Tenant,
    User,
    Vendor,
)
from app.modules.merch.bom_line_sync import apply_calculations_to_line
from app.modules.merch.bom_prefill_service import create_bom_from_order_prefill
from app.modules.merch import bom_procurement_service as proc_svc
from app.modules.merch import bom_workflow_service as wf_svc
from app.modules.merch.constants import GOVERNED_BOM_STATUSES
from app.modules.merch.deps import ensure_tenant, to_float_safe
from app.modules.merch.permissions import (
    MERCH_PERMISSION_BOM_APPROVE,
    MERCH_PERMISSION_BOM_FREEZE,
    MERCH_PERMISSION_PO_GENERATE,
    require_merch_permission,
)
from app.common.tenant import require_tenant
from app.modules.orders.pipeline_service import auto_advance_order_pipeline
from app.modules.merch.webhooks import dispatch_merch_event

_ensure_tenant = ensure_tenant

router = APIRouter(prefix="/merch/order-boms", tags=["merch-order-boms"])

ELIGIBLE_ORDER_STATUSES = frozenset({"NEW", "CONFIRMED", "IN_PROGRESS", "COMPLETED"})
GOVERNED_SET = GOVERNED_BOM_STATUSES


def _qty_field_api_str(v: Decimal | str | None) -> str | None:
    if v is None:
        return None
    if isinstance(v, Decimal):
        s = format(v, "f").rstrip("0").rstrip(".")
        return s if s else "0"
    return str(v)


def _bom_to_dict(bom: Bom) -> dict:
    return {
        "id": bom.id,
        "tenant_id": bom.tenant_id,
        "bom_code": getattr(bom, "bom_code", None),
        "customer_id": getattr(bom, "customer_id", None),
        "delivery_date_snapshot": bom.delivery_date_snapshot.isoformat()
        if getattr(bom, "delivery_date_snapshot", None)
        else None,
        "style_id": bom.style_id,
        "order_id": bom.order_id,
        "quotation_id": bom.quotation_id,
        "is_active": bom.is_active,
        "is_legacy": bom.is_legacy,
        "revision_of_bom_id": bom.revision_of_bom_id,
        "order_code_snapshot": bom.order_code_snapshot,
        "quotation_code_snapshot": bom.quotation_code_snapshot,
        "order_qty_snapshot": bom.order_qty_snapshot,
        "order_qty_at_approval": bom.order_qty_at_approval,
        "currency_snapshot": bom.currency_snapshot,
        "version_no": bom.version_no,
        "status": bom.status,
        "notes": bom.notes,
        "submitted_at": bom.submitted_at.isoformat() if bom.submitted_at else None,
        "submitted_by": bom.submitted_by,
        "approved_at": bom.approved_at.isoformat() if bom.approved_at else None,
        "approved_by": bom.approved_by,
        "rejected_at": bom.rejected_at.isoformat() if bom.rejected_at else None,
        "rejected_by": bom.rejected_by,
        "rejection_comment": bom.rejection_comment,
        "frozen_at": bom.frozen_at.isoformat() if bom.frozen_at else None,
        "frozen_by": bom.frozen_by,
        "created_at": bom.created_at.isoformat() if bom.created_at else None,
        "updated_at": bom.updated_at.isoformat() if bom.updated_at else None,
    }


def _line_to_dict(line: BomItem, procurement_status: str) -> dict:
    def n(v):
        return float(v) if v is not None else None

    return {
        "id": line.id,
        "bom_id": line.bom_id,
        "item_id": line.item_id,
        "quotation_line_id": line.quotation_line_id,
        "category": line.category,
        "item_code": line.item_code,
        "description": line.description,
        "item_code_snapshot": line.item_code_snapshot,
        "description_snapshot": line.description_snapshot,
        "material_type": line.material_type,
        "uom": line.uom,
        "base_consumption": _qty_field_api_str(line.base_consumption) or "0",
        "wastage_pct": _qty_field_api_str(line.wastage_pct),
        "process_loss_pct": n(line.process_loss_pct),
        "quoted_consumption_per_unit": n(line.quoted_consumption_per_unit),
        "quoted_unit_price": n(line.quoted_unit_price),
        "quoted_currency": line.quoted_currency,
        "quoted_total_cost": n(line.quoted_total_cost),
        "bom_net_consumption_per_unit": n(line.bom_net_consumption_per_unit),
        "bom_gross_consumption_per_unit": n(line.bom_gross_consumption_per_unit),
        "order_qty_snapshot": line.order_qty_snapshot,
        "required_net_qty": n(line.required_net_qty),
        "wastage_qty": n(line.wastage_qty),
        "process_loss_qty": n(line.process_loss_qty),
        "required_gross_qty": n(line.required_gross_qty),
        "vendor_suggested_price": n(line.vendor_suggested_price),
        "bom_expected_unit_price": n(line.bom_expected_unit_price),
        "bom_expected_total_cost": n(line.bom_expected_total_cost),
        "consumption_variance_pct": n(line.consumption_variance_pct),
        "price_variance_pct": n(line.price_variance_pct),
        "total_cost_variance": n(line.total_cost_variance),
        "preferred_vendor_id": line.preferred_vendor_id,
        "remarks": line.remarks,
        "sort_order": line.sort_order,
        "procurement_status": procurement_status,
    }


async def _active_bom_for_order(db: AsyncSession, tenant_id: int, order_id: int) -> Bom | None:
    r = await db.execute(
        select(Bom).where(
            Bom.tenant_id == tenant_id,
            Bom.order_id == order_id,
            Bom.is_active.is_(True),
        )
    )
    return r.scalars().first()


async def _load_bom_detail(db: AsyncSession, tenant: Tenant, bom: Bom) -> dict:
    lr = await db.execute(
        select(BomItem)
        .where(BomItem.tenant_id == tenant.id, BomItem.bom_id == bom.id)
        .order_by(BomItem.sort_order, BomItem.id)
    )
    lines = list(lr.scalars().all())
    items = []
    sq = bom.order_qty_snapshot or 0
    total_quoted = 0.0
    total_bom = 0.0
    pending_vendor = 0
    ready_po = 0
    procured = 0
    for line in lines:
        st = await proc_svc.get_line_procurement_status(db, tenant.id, line)
        items.append(_line_to_dict(line, st))
        if line.quoted_total_cost is not None:
            total_quoted += float(line.quoted_total_cost)
        if line.bom_expected_total_cost is not None:
            total_bom += float(line.bom_expected_total_cost)
        if line.item_id and not line.preferred_vendor_id:
            pending_vendor += 1
        if (bom.status or "").upper() == "APPROVED" and line.item_id:
            if st == "NOT_PROCURED":
                ready_po += 1
        if st in {"PARTIALLY_RECEIVED", "FULLY_RECEIVED", "PO_APPROVED"}:
            procured += 1

    summary = {
        "total_quoted_material_cost": round(total_quoted, 4),
        "total_bom_material_cost": round(total_bom, 4),
        "variance_amount": round(total_bom - total_quoted, 4),
        "planned_wastage_cost": 0.0,
        "planned_process_loss_cost": 0.0,
        "lines_pending_vendor": pending_vendor,
        "lines_ready_for_po": ready_po,
        "lines_procurement_started": procured,
    }
    for line in lines:
        if line.wastage_qty is not None and line.bom_expected_unit_price is not None:
            summary["planned_wastage_cost"] += float(line.wastage_qty) * float(line.bom_expected_unit_price)
        if line.process_loss_qty is not None and line.bom_expected_unit_price is not None:
            summary["planned_process_loss_cost"] += float(line.process_loss_qty) * float(
                line.bom_expected_unit_price
            )
    summary["planned_wastage_cost"] = round(summary["planned_wastage_cost"], 4)
    summary["planned_process_loss_cost"] = round(summary["planned_process_loss_cost"], 4)

    return {"bom": _bom_to_dict(bom), "items": items, "summary": summary}


class CreateBomFromOrderBody(BaseModel):
    order_id: int = Field(..., ge=1)


class RejectBody(BaseModel):
    comment: str = ""


class BomLinePatchBody(BaseModel):
    bom_net_consumption_per_unit: float | None = None
    wastage_pct: float | None = None
    process_loss_pct: float | None = None
    bom_expected_unit_price: float | None = None
    preferred_vendor_id: int | None = None
    remarks: str | None = None
    item_id: int | None = None


class BomLineCreateBody(BaseModel):
    item_id: int | None = None
    description: str | None = None
    uom: str | None = None
    bom_net_consumption_per_unit: float = 0
    wastage_pct: float = 0
    process_loss_pct: float = 0
    bom_expected_unit_price: float = 0
    category: str = "MATERIAL"


class PoFromLineBody(BaseModel):
    vendor_id: int | None = None
    quantity: float = Field(..., gt=0)
    unit_price: str = "0"
    currency: str | None = None
    warehouse_id: int | None = None


class BulkPoBody(BaseModel):
    line_ids: list[int] | None = None


@router.get("/eligible-orders")
async def list_eligible_orders_for_bom(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    has_materials = exists(
        select(1).where(
            QuotationMaterial.tenant_id == tenant.id,
            QuotationMaterial.quotation_id == Order.quotation_id,
        )
    )
    r2 = await db.execute(
        select(Order, Customer, Quotation)
        .join(Customer, Customer.id == Order.customer_id)
        .outerjoin(Quotation, Quotation.id == Order.quotation_id)
        .where(
            Order.tenant_id == tenant.id,
            Order.quotation_id.isnot(None),
            Order.quantity.isnot(None),
            Order.quantity > 0,
            Order.status.in_(ELIGIBLE_ORDER_STATUSES),
            has_materials,
        )
    )
    out = []
    for order, customer, quotation in r2.all():
        existing = await _active_bom_for_order(db, tenant.id, order.id)
        if existing:
            continue
        if not quotation or not quotation.style_id:
            continue
        style = await db.get(GarmentStyle, quotation.style_id)
        # Tenant isolation: style must belong to same tenant as order/quotation.
        if not style or style.tenant_id != tenant.id:
            continue
        out.append(
            {
                "order_id": order.id,
                "order_code": order.order_code,
                "customer_name": customer.name,
                "style_id": quotation.style_id,
                "style_code": style.style_code if style else None,
                "style_name": style.name if style else None,
                "quotation_id": quotation.id,
                "quotation_code": quotation.quotation_code,
                "order_qty": order.quantity,
                "delivery_date": order.delivery_date.isoformat() if order.delivery_date else None,
                "status": order.status,
            }
        )
    return out


@router.post("/from-order", status_code=201)
async def create_bom_from_order(
    body: CreateBomFromOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if await _active_bom_for_order(db, tenant.id, body.order_id):
        raise HTTPException(status_code=400, detail="An active BOM already exists for this order")
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    if not order.quotation_id:
        raise HTTPException(status_code=400, detail="Order has no quotation")
    quotation = await db.get(Quotation, order.quotation_id)
    if not quotation or quotation.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Quotation not found")
    if order.status not in ELIGIBLE_ORDER_STATUSES:
        raise HTTPException(status_code=400, detail="Order status is not eligible for BOM creation")
    try:
        bom, _lines = await create_bom_from_order_prefill(
            db, tenant_id=tenant.id, order=order, quotation=quotation
        )
        await db.commit()
        await db.refresh(bom)
        await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=body.order_id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    return await _load_bom_detail(db, tenant, bom)


@router.get("/by-order/{order_id}")
async def get_bom_by_order(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await _active_bom_for_order(db, tenant.id, order_id)
    if not bom:
        raise HTTPException(status_code=404, detail="No active BOM for this order")
    return await _load_bom_detail(db, tenant, bom)


@router.get("/{bom_id}/detail")
async def get_order_bom_detail(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if not bom.order_id:
        raise HTTPException(status_code=400, detail="Not an order-driven BOM")
    return await _load_bom_detail(db, tenant, bom)


@router.patch("/{bom_id}/lines/{line_id}")
async def patch_bom_line(
    bom_id: int,
    line_id: int,
    body: BomLinePatchBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id or bom.order_id is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    line = await db.get(BomItem, line_id)
    if not line or line.bom_id != bom_id or line.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM line not found")
    oq = bom.order_qty_snapshot or 0
    st_bom = (bom.status or "").upper()
    if st_bom == "DRAFT":
        pass
    elif st_bom in GOVERNED_SET:
        patch_in = body.model_dump(exclude_unset=True)
        if not patch_in:
            raise HTTPException(status_code=400, detail="No fields to update")
        non_price = {k: v for k, v in patch_in.items() if k != "bom_expected_unit_price" and v is not None}
        if non_price:
            raise HTTPException(
                status_code=400,
                detail="Approved/frozen BOM: only bom_expected_unit_price can be changed (requires override permission).",
            )
        if "bom_expected_unit_price" not in patch_in:
            raise HTTPException(
                status_code=400,
                detail="Approved/frozen BOM: send bom_expected_unit_price only for a governed price update.",
            )
        await assert_delegate_manager_or_permission(
            db, user, tenant.id, permission_key=PERMISSION_BOM_PRICE_OVERRIDE
        )
        line.bom_expected_unit_price = patch_in["bom_expected_unit_price"]
        apply_calculations_to_line(line, int(oq))
        await db.commit()
        await db.refresh(line)
        st = await proc_svc.get_line_procurement_status(db, tenant.id, line)
        return _line_to_dict(line, st)
    else:
        raise HTTPException(status_code=400, detail="BOM status does not allow line edits")

    if body.bom_net_consumption_per_unit is not None:
        line.bom_net_consumption_per_unit = body.bom_net_consumption_per_unit
    if body.wastage_pct is not None:
        w = float(body.wastage_pct)
        line.wastage_pct = None if abs(w) < 1e-15 else Decimal(str(w)).quantize(
            Decimal("0.0001"), rounding=ROUND_HALF_UP
        )
    if body.process_loss_pct is not None:
        line.process_loss_pct = body.process_loss_pct
    if body.bom_expected_unit_price is not None:
        line.bom_expected_unit_price = body.bom_expected_unit_price
    if body.preferred_vendor_id is not None:
        line.preferred_vendor_id = body.preferred_vendor_id
    if body.remarks is not None:
        line.remarks = body.remarks
    if body.item_id is not None:
        line.item_id = body.item_id
    apply_calculations_to_line(line, int(oq))
    await db.commit()
    await db.refresh(line)
    st = await proc_svc.get_line_procurement_status(db, tenant.id, line)
    return _line_to_dict(line, st)


@router.post("/{bom_id}/lines", status_code=201)
async def add_bom_line(
    bom_id: int,
    body: BomLineCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id or bom.order_id is None:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (bom.status or "").upper() != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT BOM can add lines")
    oq = bom.order_qty_snapshot or 0
    mx = await db.execute(select(func.max(BomItem.sort_order)).where(BomItem.bom_id == bom_id))
    sort_order = int(mx.scalar() or 0) + 1
    w0 = float(body.wastage_pct)
    line = BomItem(
        tenant_id=tenant.id,
        bom_id=bom_id,
        item_id=body.item_id,
        category=body.category,
        description=body.description,
        uom=body.uom,
        base_consumption=Decimal(str(body.bom_net_consumption_per_unit)).quantize(
            Decimal("0.000001"), rounding=ROUND_HALF_UP
        ),
        wastage_pct=None
        if abs(w0) < 1e-15
        else Decimal(str(body.wastage_pct)).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP),
        process_loss_pct=body.process_loss_pct,
        bom_net_consumption_per_unit=body.bom_net_consumption_per_unit,
        bom_expected_unit_price=body.bom_expected_unit_price,
        material_type=body.category,
        sort_order=sort_order,
    )
    apply_calculations_to_line(line, int(oq))
    db.add(line)
    await db.commit()
    await db.refresh(line)
    st = await proc_svc.get_line_procurement_status(db, tenant.id, line)
    return _line_to_dict(line, st)


@router.delete("/{bom_id}/lines/{line_id}", status_code=204)
async def delete_bom_line(
    bom_id: int,
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (bom.status or "").upper() != "DRAFT":
        raise HTTPException(status_code=400, detail="Only DRAFT BOM can delete lines")
    line = await db.get(BomItem, line_id)
    if not line or line.bom_id != bom_id:
        raise HTTPException(status_code=404, detail="BOM line not found")
    if await proc_svc.has_po_lines_for_bom_line(db, tenant.id, line_id):
        raise HTTPException(status_code=400, detail="Cannot delete line with existing purchase orders")
    await db.delete(line)
    await db.commit()


@router.post("/{bom_id}/submit")
async def submit_order_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id or not bom.order_id:
        raise HTTPException(status_code=404, detail="BOM not found")
    await wf_svc.submit_bom(db, bom, user.id)
    await db.commit()
    await db.refresh(bom)
    return await _load_bom_detail(db, tenant, bom)


@router.post("/{bom_id}/approve")
async def approve_order_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_BOM_APPROVE)),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id or not bom.order_id:
        raise HTTPException(status_code=404, detail="BOM not found")
    await wf_svc.approve_bom(db, bom, user.id)
    await db.commit()
    await db.refresh(bom)
    await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=bom.order_id)
    await db.commit()
    return await _load_bom_detail(db, tenant, bom)


@router.post("/{bom_id}/reject")
async def reject_order_bom(
    bom_id: int,
    body: RejectBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_BOM_APPROVE)),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id or not bom.order_id:
        raise HTTPException(status_code=404, detail="BOM not found")
    await wf_svc.reject_bom(db, bom, user.id, body.comment)
    await db.commit()
    await db.refresh(bom)
    return await _load_bom_detail(db, tenant, bom)


@router.post("/{bom_id}/freeze")
async def freeze_order_bom(
    bom_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_BOM_FREEZE)),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id or not bom.order_id:
        raise HTTPException(status_code=404, detail="BOM not found")
    await wf_svc.freeze_bom(db, bom, user.id)
    await db.commit()
    await db.refresh(bom)
    await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=bom.order_id)
    await db.commit()
    dispatch_merch_event(
        "order_bom_frozen",
        {"tenant_id": tenant.id, "bom_id": bom.id, "order_id": bom.order_id, "user_id": user.id},
    )
    return await _load_bom_detail(db, tenant, bom)


@router.post("/lines/{line_id}/purchase-order")
async def create_po_from_line(
    line_id: int,
    body: PoFromLineBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_PO_GENERATE)),
):
    _ensure_tenant(user, tenant)
    line = await db.get(BomItem, line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM line not found")
    bom = await db.get(Bom, line.bom_id)
    if not bom or not bom.order_id:
        raise HTTPException(status_code=400, detail="Invalid BOM")
    if (bom.status or "").upper() not in GOVERNED_SET:
        raise HTTPException(status_code=400, detail="BOM must be APPROVED or FROZEN to create PO")
    try:
        po, _poi, warnings = await proc_svc.create_po_from_bom_line(
            db,
            tenant_id=tenant.id,
            bom=bom,
            line=line,
            vendor_id=body.vendor_id,
            quantity=body.quantity,
            unit_price=body.unit_price,
            currency=body.currency,
            warehouse_id=body.warehouse_id,
        )
        await db.commit()
        await db.refresh(po)
        await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=bom.order_id)
        await db.commit()
    except ValueError as e:
        await db.rollback()
        raise HTTPException(status_code=400, detail=str(e)) from e
    return {"id": po.id, "po_code": po.po_code, "warnings": warnings}


@router.post("/{bom_id}/generate-purchase-orders-bulk")
async def bulk_generate_pos(
    bom_id: int,
    body: BulkPoBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_merch_permission(MERCH_PERMISSION_PO_GENERATE)),
):
    _ensure_tenant(user, tenant)
    bom = await db.get(Bom, bom_id)
    if not bom or bom.tenant_id != tenant.id or not bom.order_id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if (bom.status or "").upper() not in GOVERNED_SET:
        raise HTTPException(status_code=400, detail="BOM must be APPROVED or FROZEN")
    q = select(BomItem).where(BomItem.bom_id == bom_id, BomItem.tenant_id == tenant.id)
    if body.line_ids:
        q = q.where(BomItem.id.in_(body.line_ids))
    r = await db.execute(q)
    lines = list(r.scalars().all())
    created = await proc_svc.bulk_create_pos_by_vendor(db, tenant_id=tenant.id, bom=bom, lines=lines)
    await db.commit()
    await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=bom.order_id)
    await db.commit()
    return {
        "created": [{"id": po.id, "po_code": po.po_code, "line_count": len(pois)} for po, pois in created],
    }


@router.get("/lines/{line_id}/suggested-vendors")
async def suggested_vendors_for_line(
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    line = await db.get(BomItem, line_id)
    if not line or line.tenant_id != tenant.id or not line.item_id:
        raise HTTPException(status_code=404, detail="BOM line not found")
    raw = await proc_svc.get_suggested_vendor_prices(db, tenant.id, line.item_id)
    enriched = []
    for row in raw:
        vid = row.get("vendor_id")
        name = None
        if vid:
            v = await db.get(Vendor, vid)
            if v and v.tenant_id == tenant.id:
                name = v.name
        enriched.append({**row, "vendor_name": name})
    return {"suggestions": enriched}


@router.get("/lines/{line_id}/purchase-orders")
async def list_pos_for_line(
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    line = await db.get(BomItem, line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM line not found")
    r = await db.execute(
        select(PurchaseOrderItem, PurchaseOrder)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == tenant.id,
            PurchaseOrderItem.source_bom_line_id == line_id,
        )
    )
    out = []
    for poi, po in r.all():
        recv = await proc_svc.total_received_for_po_items(db, tenant.id, po.id)
        out.append(
            {
                "purchase_order_id": po.id,
                "po_code": po.po_code,
                "status": po.status,
                "line_quantity": poi.quantity,
                "unit_price": poi.unit_price,
                "received_qty": recv,
            }
        )
    return {"items": out}


@router.get("/lines/{line_id}/procurement-status")
async def line_procurement_status(
    line_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    line = await db.get(BomItem, line_id)
    if not line or line.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM line not found")
    st = await proc_svc.get_line_procurement_status(db, tenant.id, line)
    return {"status": st}


@router.post("/lines/{line_id}/refresh-vendor-price")
async def refresh_vendor_suggested_price(
    line_id: int,
    vendor_id: int = Query(..., ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Set vendor_suggested_price from latest PO for item+vendor."""
    _ensure_tenant(user, tenant)
    line = await db.get(BomItem, line_id)
    if not line or line.tenant_id != tenant.id or not line.item_id:
        raise HTTPException(status_code=404, detail="BOM line not found")
    r = await db.execute(
        select(PurchaseOrderItem.unit_price)
        .join(PurchaseOrder, PurchaseOrder.id == PurchaseOrderItem.purchase_order_id)
        .where(
            PurchaseOrderItem.tenant_id == tenant.id,
            PurchaseOrderItem.item_id == line.item_id,
            PurchaseOrder.vendor_id == vendor_id,
            PurchaseOrder.tenant_id == tenant.id,
        )
        .order_by(PurchaseOrderItem.id.desc())
        .limit(1)
    )
    row = r.first()
    if not row:
        raise HTTPException(status_code=404, detail="No historical price for this vendor and item")
    price = to_float_safe(row[0])
    line.preferred_vendor_id = vendor_id
    line.vendor_suggested_price = price
    if (bom := await db.get(Bom, line.bom_id)) and (bom.status or "").upper() == "DRAFT":
        line.bom_expected_unit_price = price
        oq = bom.order_qty_snapshot or 0
        apply_calculations_to_line(line, int(oq))
    await db.commit()
    await db.refresh(line)
    st = await proc_svc.get_line_procurement_status(db, tenant.id, line)
    return _line_to_dict(line, st)
