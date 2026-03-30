from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import Date as SQLDate
from sqlalchemy import case, cast, delete, desc, func, or_, select
from sqlalchemy.types import Numeric
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.codegen import next_tenant_code
from app.common.db_errors import commit_handling_duplicate_document_code, flush_handling_duplicate_document_code
from app.common.inventory_validation import (
    validate_non_negative_money_str,
    validate_non_negative_qty_str,
    validate_positive_qty_str,
    validate_signed_adjustment_qty_str,
)
from app.common.inventory_policy import tenant_allows_negative_stock
from app.common.pagination import (
    DEFAULT_PAGE_SIZE,
    HR_LIST_DEFAULT_LIMIT,
    HR_LIST_MAX_LIMIT,
    MAX_PAGE_SIZE,
    clamp_page_size,
    safe_page,
    total_pages,
)
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    BomItem,
    ChartOfAccount,
    DeliveryChallan,
    DeliveryChallanItem,
    EnhancedGatePass,
    ConsumptionChangeRequest,
    GoodsReceiving,
    GoodsReceivingItem,
    ManufacturingMaterialIssue,
    ManufacturingMaterialReturn,
    ManufacturingOrder,
    ManufacturingStage,
    Item,
    ItemCategory,
    ItemSubcategory,
    ItemUnit,
    PurchaseOrder,
    PurchaseOrderItem,
    ProcessOrder,
    QuotationMaterial,
    StockGroup,
    StockAdjustment,
    StockMovement,
    InventoryCostLayer,
    CoAConfig,
    ChartOfAccount,
    Tenant,
    User,
    Vendor,
    Warehouse,
    WarehouseTransfer,
    WarehouseTransferLine,
    PhysicalInventorySession,
    PhysicalInventoryLine,
)

from app.services.fifo_inventory import finalize_movement_fifo, rebuild_fifo_layers_for_tenant, fifo_on_hand_value
from app.services.grn_inventory_gl import post_grn_receipt_gl_journal
from app.services.inventory_gl_service import (
    post_consumption_issue_gl,
    post_delivery_challan_gl,
    post_physical_inventory_gl,
    post_process_order_issue_gl,
    post_process_order_receive_gl,
    post_stock_adjustment_gl,
)

router = APIRouter(prefix="/inventory", tags=["inventory"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _as_str(v: object) -> str:
    if v is None:
        return ""
    if isinstance(v, str):
        return v.strip()
    return str(v).strip()


def _purchase_order_to_out(row: PurchaseOrder, items: list[PurchaseOrderItem]) -> PurchaseOrderOut:
    return PurchaseOrderOut(
        id=row.id,
        tenant_id=row.tenant_id,
        po_code=row.po_code,
        vendor_id=getattr(row, "vendor_id", None),
        supplier_name=row.supplier_name,
        order_date=row.order_date,
        expected_date=row.expected_date,
        currency=row.currency,
        exchange_rate_to_base=(
            float(row.exchange_rate_to_base) if row.exchange_rate_to_base is not None else None
        ),
        base_total_amount=(float(row.base_total_amount) if row.base_total_amount is not None else None),
        btb_lc_id=row.btb_lc_id,
        source_bom_id=getattr(row, "source_bom_id", None),
        status=row.status,
        notes=row.notes,
        items=list(items),
    )


def _goods_receiving_to_out(row: GoodsReceiving, items: list[GoodsReceivingItem]) -> GoodsReceivingOut:
    return GoodsReceivingOut(
        id=row.id,
        tenant_id=row.tenant_id,
        grn_code=row.grn_code,
        purchase_order_id=row.purchase_order_id,
        received_date=row.received_date,
        status=row.status,
        notes=row.notes,
        created_by_user_id=getattr(row, "created_by_user_id", None),
        items=list(items),
    )


async def _count_where(db: AsyncSession, model, tenant_id: int, *filters) -> int:
    stmt = select(func.count()).select_from(model).where(model.tenant_id == tenant_id)
    for f in filters:
        stmt = stmt.where(f)
    return int((await db.execute(stmt)).scalar() or 0)


async def _ensure_item_deletable(db: AsyncSession, tenant_id: int, item_id: int) -> None:
    reasons: list[str] = []
    n = await _count_where(db, StockMovement, tenant_id, StockMovement.item_id == item_id)
    if n:
        reasons.append(f"stock movements ({n})")
    n = await _count_where(db, PurchaseOrderItem, tenant_id, PurchaseOrderItem.item_id == item_id)
    if n:
        reasons.append(f"purchase order lines ({n})")
    n = await _count_where(db, GoodsReceivingItem, tenant_id, GoodsReceivingItem.item_id == item_id)
    if n:
        reasons.append(f"GRN lines ({n})")
    n = await _count_where(db, DeliveryChallanItem, tenant_id, DeliveryChallanItem.item_id == item_id)
    if n:
        reasons.append(f"delivery challan lines ({n})")
    n = await _count_where(
        db,
        ProcessOrder,
        tenant_id,
        or_(ProcessOrder.input_item_id == item_id, ProcessOrder.output_item_id == item_id),
    )
    if n:
        reasons.append(f"process orders ({n})")
    n = await _count_where(db, ManufacturingOrder, tenant_id, ManufacturingOrder.finished_item_id == item_id)
    if n:
        reasons.append(f"manufacturing orders ({n})")
    n = await _count_where(db, WarehouseTransferLine, tenant_id, WarehouseTransferLine.item_id == item_id)
    if n:
        reasons.append(f"warehouse transfer lines ({n})")
    n = await _count_where(db, StockAdjustment, tenant_id, StockAdjustment.item_id == item_id)
    if n:
        reasons.append(f"stock adjustments ({n})")
    n = await _count_where(db, QuotationMaterial, tenant_id, QuotationMaterial.item_id == item_id)
    if n:
        reasons.append(f"quotation materials ({n})")
    n = await _count_where(db, BomItem, tenant_id, BomItem.item_id == item_id)
    if n:
        reasons.append(f"BOM lines ({n})")
    n = await _count_where(db, ManufacturingMaterialIssue, tenant_id, ManufacturingMaterialIssue.item_id == item_id)
    if n:
        reasons.append(f"manufacturing material issues ({n})")
    if reasons:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete item: referenced by " + ", ".join(reasons) + ".",
        )


async def _ensure_category_deletable(db: AsyncSession, tenant_id: int, category_id: int) -> None:
    n = await _count_where(db, ItemSubcategory, tenant_id, ItemSubcategory.category_id == category_id)
    if n:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete category: {n} subcategory(ies) still use it.",
        )
    n = await _count_where(db, Item, tenant_id, Item.category_id == category_id)
    if n:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete category: {n} item(s) still use it.",
        )
    n = await _count_where(db, QuotationMaterial, tenant_id, QuotationMaterial.category_id == category_id)
    if n:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete category: {n} quotation material line(s) still reference it.",
        )


async def _ensure_subcategory_deletable(db: AsyncSession, tenant_id: int, subcategory_id: int) -> None:
    n = await _count_where(db, Item, tenant_id, Item.subcategory_id == subcategory_id)
    if n:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete subcategory: {n} item(s) still use it.",
        )


async def _ensure_unit_deletable(db: AsyncSession, tenant_id: int, unit_id: int) -> None:
    n = await _count_where(db, Item, tenant_id, Item.unit_id == unit_id)
    if n:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete unit: {n} item(s) still use it.",
        )


async def _ensure_warehouse_deletable(db: AsyncSession, tenant_id: int, warehouse_id: int) -> None:
    reasons: list[str] = []
    n = await _count_where(db, Item, tenant_id, Item.default_warehouse_id == warehouse_id)
    if n:
        reasons.append(f"items default warehouse ({n})")
    n = await _count_where(db, PurchaseOrderItem, tenant_id, PurchaseOrderItem.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"purchase order lines ({n})")
    n = await _count_where(db, GoodsReceivingItem, tenant_id, GoodsReceivingItem.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"GRN lines ({n})")
    n = await _count_where(db, StockMovement, tenant_id, StockMovement.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"stock movements ({n})")
    n = await _count_where(db, DeliveryChallanItem, tenant_id, DeliveryChallanItem.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"delivery challan lines ({n})")
    n = await _count_where(db, ProcessOrder, tenant_id, ProcessOrder.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"process orders ({n})")
    n = await _count_where(
        db,
        WarehouseTransfer,
        tenant_id,
        or_(
            WarehouseTransfer.from_warehouse_id == warehouse_id,
            WarehouseTransfer.to_warehouse_id == warehouse_id,
        ),
    )
    if n:
        reasons.append(f"warehouse transfers ({n})")
    n = await _count_where(db, StockAdjustment, tenant_id, StockAdjustment.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"stock adjustments ({n})")
    n = await _count_where(db, ManufacturingMaterialIssue, tenant_id, ManufacturingMaterialIssue.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"manufacturing material issues ({n})")
    n = await _count_where(db, ManufacturingMaterialReturn, tenant_id, ManufacturingMaterialReturn.warehouse_id == warehouse_id)
    if n:
        reasons.append(f"manufacturing material returns ({n})")
    if reasons:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot delete warehouse: referenced by " + ", ".join(reasons) + ".",
        )


async def _ensure_stock_group_deletable(db: AsyncSession, tenant_id: int, group_id: int) -> None:
    n = await _count_where(db, StockGroup, tenant_id, StockGroup.parent_id == group_id)
    if n:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete stock group: {n} child group(s) still reference it as parent.",
        )
    ni = await _count_where(db, Item, tenant_id, Item.stock_group_id == group_id)
    if ni:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot delete stock group: {ni} item(s) still reference it.",
        )


def _to_float(value: str | None) -> float:
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


async def _require_manager_or_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
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


async def _stock_summary_rows(db: AsyncSession, tenant_id: int) -> list[StockSummaryRow]:
    qty_col = cast(StockMovement.quantity, Numeric)
    in_agg = func.coalesce(
        func.sum(case((StockMovement.movement_type == "IN", qty_col), else_=0)),
        0,
    )
    out_agg = func.coalesce(
        func.sum(case((StockMovement.movement_type != "IN", qty_col), else_=0)),
        0,
    )
    agg_stmt = (
        select(
            StockMovement.item_id,
            StockMovement.warehouse_id,
            in_agg.label("in_qty"),
            out_agg.label("out_qty"),
        )
        .where(StockMovement.tenant_id == tenant_id)
        .group_by(StockMovement.item_id, StockMovement.warehouse_id)
    )
    agg_result = await db.execute(agg_stmt)
    agg_rows = list(agg_result.all())
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant_id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    wh_result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))
    wh_map = {r.id: r for r in wh_result.scalars().all()}

    rows: list[StockSummaryRow] = []
    for item_id, warehouse_id, in_qty_raw, out_qty_raw in agg_rows:
        item = item_map.get(item_id)
        if not item:
            continue
        in_qty = float(in_qty_raw or 0)
        out_qty = float(out_qty_raw or 0)
        wh = wh_map.get(warehouse_id) if warehouse_id is not None else None
        rows.append(
            StockSummaryRow(
                item_id=item_id,
                item_code=item.item_code,
                item_name=item.name,
                warehouse_id=warehouse_id,
                warehouse_name=wh.name if wh else None,
                in_qty=round(in_qty, 3),
                out_qty=round(out_qty, 3),
                on_hand_qty=round(in_qty - out_qty, 3),
            )
        )
    rows.sort(key=lambda r: (r.item_code, r.warehouse_name or ""))
    return rows


async def _fifo_layer_qty_value_map(
    db: AsyncSession, tenant_id: int, as_of_date: date | None = None
) -> dict[tuple[int, int | None], tuple[float, float]]:
    """Map (item_id, warehouse_id) -> (qty_remaining, value)."""
    stmt = select(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant_id)
    if as_of_date is not None:
        stmt = stmt.where(
            InventoryCostLayer.layer_date.is_not(None),
            InventoryCostLayer.layer_date <= as_of_date,
        )
    layers = list((await db.execute(stmt)).scalars().all())
    acc: dict[tuple[int, int | None], list[float]] = defaultdict(lambda: [0.0, 0.0])
    for layer in layers:
        qr = _to_float(layer.qty_remaining)
        if qr <= 0:
            continue
        key = (layer.item_id, layer.warehouse_id)
        uc = _to_float(layer.unit_cost)
        acc[key][0] += qr
        acc[key][1] += qr * uc
    return {k: (v[0], round(v[1], 4)) for k, v in acc.items()}


def _inventory_line_from_summary(
    s: StockSummaryRow,
    item_map: dict[int, Item],
    fifo_map: dict[tuple[int, int | None], tuple[float, float]],
) -> InventorySummaryLine:
    item = item_map.get(s.item_id)
    key = (s.item_id, s.warehouse_id)
    fq, fv = fifo_map.get(key, (0.0, 0.0))
    if fq > 1e-9 and fv > 0:
        uc = fv / fq
        lv = round(fv, 2)
    else:
        uc = _to_float(item.default_cost if item else "0")
        lv = round(s.on_hand_qty * uc, 2)
    return InventorySummaryLine(
        item_id=s.item_id,
        item_code=s.item_code,
        item_name=s.item_name,
        warehouse_id=s.warehouse_id,
        warehouse_name=s.warehouse_name,
        on_hand_qty=s.on_hand_qty,
        unit_cost=round(uc, 4),
        line_value=lv,
    )


async def _ensure_chart_account_for_tenant(db: AsyncSession, tenant_id: int, account_id: int | None) -> None:
    if account_id is None:
        return
    acc = await db.get(ChartOfAccount, account_id)
    if not acc or acc.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Invalid chart of accounts account for this tenant")


async def _ensure_stock_group_for_item(db: AsyncSession, tenant_id: int, stock_group_id: int | None) -> None:
    if stock_group_id is None:
        return
    sg = await db.get(StockGroup, stock_group_id)
    if not sg or sg.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Invalid stock group for this tenant")


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
    default_warehouse_id: int | None = None
    stock_group_id: int | None = None
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
    default_warehouse_id: int | None = None
    stock_group_id: int | None = None
    default_cost: str
    is_active: bool

    @field_validator("default_cost", mode="before")
    @classmethod
    def _default_cost_as_str(cls, v: object) -> str:
        # DB drivers may return Decimal/float; response validation must not 500 on list endpoints.
        if v is None:
            return "0"
        s = str(v).strip()
        return s if s else "0"

    @field_validator("item_code", "name", mode="before")
    @classmethod
    def _strip_text_fields(cls, v: object) -> str:
        if v is None:
            return ""
        return str(v).strip()

    @field_validator("is_active", mode="before")
    @classmethod
    def _coerce_active(cls, v: object) -> bool:
        if v is None:
            return True
        if isinstance(v, (int, float)):
            return bool(int(v))
        return bool(v)

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
    inventory_account_id: int | None = None
    wip_account_id: int | None = None
    cogs_account_id: int | None = None
    adjustment_account_id: int | None = None
    grni_account_id: int | None = None


class StockGroupOut(BaseModel):
    id: int
    tenant_id: int
    group_code: str
    name: str
    parent_id: int | None
    is_active: bool
    inventory_account_id: int | None = None
    wip_account_id: int | None = None
    cogs_account_id: int | None = None
    adjustment_account_id: int | None = None
    grni_account_id: int | None = None

    class Config:
        from_attributes = True


class VendorCreate(BaseModel):
    vendor_code: str
    name: str
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool = True
    ledger_id: int | None = None
    default_currency: str | None = None
    payment_terms_days: int | None = None
    vendor_type: str | None = None
    country: str | None = None
    city: str | None = None
    tax_id: str | None = None
    bank_name: str | None = None
    bank_account_no: str | None = None
    swift_code: str | None = None
    credit_limit: float | None = None
    legal_name: str | None = None
    trade_name: str | None = None
    website: str | None = None
    mobile: str | None = None
    designation: str | None = None
    address_line1: str | None = None
    state_or_region: str | None = None
    postal_code: str | None = None
    registration_number: str | None = None
    bank_account_title: str | None = None
    iban: str | None = None
    payment_terms: str | None = None
    incoterms: str | None = None
    shipping_terms: str | None = None
    lead_time_notes: str | None = None
    compliance_status: str | None = None
    compliance_reference_numbers: str | None = None
    certifications_summary: str | None = None
    onboarding_status: str | None = None
    remarks: str | None = None
    internal_notes: str | None = None


class VendorUpdate(BaseModel):
    vendor_code: str | None = None
    name: str | None = None
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    is_active: bool | None = None
    ledger_id: int | None = None
    default_currency: str | None = None
    payment_terms_days: int | None = None
    vendor_type: str | None = None
    country: str | None = None
    city: str | None = None
    tax_id: str | None = None
    bank_name: str | None = None
    bank_account_no: str | None = None
    swift_code: str | None = None
    credit_limit: float | None = None
    legal_name: str | None = None
    trade_name: str | None = None
    website: str | None = None
    mobile: str | None = None
    designation: str | None = None
    address_line1: str | None = None
    state_or_region: str | None = None
    postal_code: str | None = None
    registration_number: str | None = None
    bank_account_title: str | None = None
    iban: str | None = None
    payment_terms: str | None = None
    incoterms: str | None = None
    shipping_terms: str | None = None
    lead_time_notes: str | None = None
    compliance_status: str | None = None
    compliance_reference_numbers: str | None = None
    certifications_summary: str | None = None
    onboarding_status: str | None = None
    remarks: str | None = None
    internal_notes: str | None = None


class VendorOut(BaseModel):
    id: int
    tenant_id: int
    vendor_code: str
    name: str
    contact_person: str | None
    email: str | None
    phone: str | None
    address: str | None
    is_active: bool
    ledger_id: int | None
    default_currency: str | None
    payment_terms_days: int | None
    vendor_type: str | None
    country: str | None
    city: str | None
    tax_id: str | None
    bank_name: str | None
    bank_account_no: str | None
    swift_code: str | None
    credit_limit: float | None
    legal_name: str | None = None
    trade_name: str | None = None
    website: str | None = None
    mobile: str | None = None
    designation: str | None = None
    address_line1: str | None = None
    state_or_region: str | None = None
    postal_code: str | None = None
    registration_number: str | None = None
    bank_account_title: str | None = None
    iban: str | None = None
    payment_terms: str | None = None
    incoterms: str | None = None
    shipping_terms: str | None = None
    lead_time_notes: str | None = None
    compliance_status: str | None = None
    compliance_reference_numbers: str | None = None
    certifications_summary: str | None = None
    onboarding_status: str | None = None
    remarks: str | None = None
    internal_notes: str | None = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PurchaseOrderItemBody(BaseModel):
    item_id: int
    warehouse_id: int | None = None
    quantity: str
    unit_price: str = "0"

    @field_validator("quantity", mode="before")
    @classmethod
    def _v_po_line_qty(cls, v: object) -> str:
        return validate_positive_qty_str(_as_str(v), "quantity")

    @field_validator("unit_price", mode="before")
    @classmethod
    def _v_po_line_price(cls, v: object) -> str:
        raw = _as_str(v)
        return validate_non_negative_money_str(raw if raw != "" else "0", "unit_price")


class PurchaseOrderBody(BaseModel):
    po_code: str | None = None
    supplier_name: str | None = None
    vendor_id: int | None = None
    order_date: date | None = None
    expected_date: date | None = None
    currency: str | None = None
    exchange_rate_to_base: float | None = None
    base_total_amount: float | None = None
    btb_lc_id: int | None = None
    source_bom_id: int | None = None
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
    vendor_id: int | None
    supplier_name: str
    order_date: date | None
    expected_date: date | None
    currency: str | None
    exchange_rate_to_base: float | None
    base_total_amount: float | None
    btb_lc_id: int | None
    source_bom_id: int | None = None
    status: str
    notes: str | None
    items: list[PurchaseOrderItemOut]


class GoodsReceivingItemBody(BaseModel):
    item_id: int
    warehouse_id: int
    quantity: str
    lot_number: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def _v_grn_line_qty(cls, v: object) -> str:
        return validate_positive_qty_str(_as_str(v), "quantity")


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
    lot_number: str | None = None

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
    created_by_user_id: int | None = None
    items: list[GoodsReceivingItemOut]


class ItemListPageOut(BaseModel):
    items: list[ItemOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class VendorListPageOut(BaseModel):
    items: list[VendorOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class PurchaseOrderListPageOut(BaseModel):
    items: list[PurchaseOrderOut]
    total: int
    page: int
    page_size: int
    total_pages: int


class GoodsReceivingListPageOut(BaseModel):
    items: list[GoodsReceivingOut]
    total: int
    page: int
    page_size: int
    total_pages: int


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
    created_by_user_id: int | None = None
    running_balance: float


class StockLedgerPageOut(BaseModel):
    items: list[StockLedgerRow]
    total: int


class StockValuationRow(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    warehouse_id: int | None
    warehouse_name: str | None
    on_hand_qty: float
    unit_cost: float
    line_value: float


class StockValuationOut(BaseModel):
    """Valuation using FIFO layers (qty_remaining × unit_cost); falls back to default_cost if no layers."""

    method: str = "fifo"
    total_value: float
    rows: list[StockValuationRow]


class StockDashboardOut(BaseModel):
    open_purchase_orders: int
    grns_pending_receive: int
    skus_with_positive_stock: int
    low_stock_lines: int
    low_stock_threshold: float
    recent_movements: list[StockLedgerRow]


class InventorySummaryLine(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    warehouse_id: int | None
    warehouse_name: str | None
    on_hand_qty: float
    unit_cost: float
    line_value: float


class StockSummaryGroupBlock(BaseModel):
    stock_group_id: int | None
    stock_group_code: str | None
    stock_group_name: str | None
    total_qty: float
    total_value: float
    lines: list[InventorySummaryLine]


class StockSummaryByGroupOut(BaseModel):
    as_of_date: date | None
    groups: list[StockSummaryGroupBlock]


class StockSummaryWarehouseBlock(BaseModel):
    warehouse_id: int | None
    warehouse_code: str | None
    warehouse_name: str | None
    total_qty: float
    total_value: float
    lines: list[InventorySummaryLine]


class StockSummaryByWarehouseOut(BaseModel):
    as_of_date: date | None
    warehouses: list[StockSummaryWarehouseBlock]


class WipProcessLine(BaseModel):
    process_order_id: int
    process_number: str
    warehouse_id: int | None
    input_item_id: int
    input_item_code: str
    output_item_id: int
    output_item_code: str
    input_quantity: str
    wip_value: float


class WipSummaryOut(BaseModel):
    rows: list[WipProcessLine]
    total_wip_value: float


class StockOverviewOut(BaseModel):
    as_of_date: date | None
    stock_on_hand_value: float
    wip_value: float
    grand_total: float


class StockVsGlOut(BaseModel):
    fifo_stock_value: float
    gl_inventory_balance: float
    variance: float
    inventory_account_ids: list[int]


class WipVsGlOut(BaseModel):
    process_wip_value: float
    gl_wip_balance: float
    variance: float
    wip_account_ids: list[int]


class DeliveryChallanItemBody(BaseModel):
    item_id: int
    warehouse_id: int
    quantity: str

    @field_validator("quantity", mode="before")
    @classmethod
    def _v_dc_line_qty(cls, v: object) -> str:
        return validate_positive_qty_str(_as_str(v), "quantity")


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
    created_by_user_id: int | None = None
    items: list[DeliveryChallanItemOut]


def _delivery_challan_to_out(row: DeliveryChallan, items: list[DeliveryChallanItem]) -> DeliveryChallanOut:
    return DeliveryChallanOut(
        id=row.id,
        tenant_id=row.tenant_id,
        challan_code=row.challan_code,
        customer_name=row.customer_name,
        delivery_date=row.delivery_date,
        status=row.status,
        notes=row.notes,
        created_by_user_id=getattr(row, "created_by_user_id", None),
        items=list(items),
    )


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
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ItemCategory)
        .where(ItemCategory.tenant_id == tenant.id)
        .order_by(ItemCategory.category_code)
        .limit(limit)
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
    await _ensure_category_deletable(db, tenant.id, category_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/item-subcategories", response_model=list[ItemSubcategoryOut])
async def list_item_subcategories(
    category_id: int | None = Query(default=None),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ItemSubcategory).where(ItemSubcategory.tenant_id == tenant.id).order_by(ItemSubcategory.subcategory_code)
    if category_id is not None:
        stmt = stmt.where(ItemSubcategory.category_id == category_id)
    result = await db.execute(stmt.limit(limit))
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
    await _ensure_subcategory_deletable(db, tenant.id, subcategory_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/item-units", response_model=list[ItemUnitOut])
async def list_item_units(
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ItemUnit).where(ItemUnit.tenant_id == tenant.id).order_by(ItemUnit.unit_code).limit(limit)
    )
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
    await _ensure_unit_deletable(db, tenant.id, unit_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/items", response_model=ItemListPageOut)
async def list_items(
    category_id: int | None = Query(default=None),
    subcategory_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ps = clamp_page_size(page_size)
    filters = [Item.tenant_id == tenant.id]
    if category_id is not None:
        filters.append(Item.category_id == category_id)
    if subcategory_id is not None:
        filters.append(Item.subcategory_id == subcategory_id)
    total = int((await db.execute(select(func.count(Item.id)).where(*filters))).scalar() or 0)
    tp = total_pages(total, ps)
    sp = safe_page(page, total, ps)
    offset = (sp - 1) * ps
    result = await db.execute(
        select(Item).where(*filters).order_by(Item.item_code).limit(ps).offset(offset)
    )
    rows = list(result.scalars().all())
    return ItemListPageOut(
        items=rows,
        total=total,
        page=sp,
        page_size=ps,
        total_pages=tp,
    )


@router.post("/items", response_model=ItemOut)
async def create_item(
    body: ItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _ensure_item_default_warehouse(db, tenant.id, body.default_warehouse_id)
    await _ensure_stock_group_for_item(db, tenant.id, body.stock_group_id)
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
    await _ensure_item_default_warehouse(db, tenant.id, body.default_warehouse_id)
    await _ensure_stock_group_for_item(db, tenant.id, body.stock_group_id)
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
    await _ensure_item_deletable(db, tenant.id, item_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/warehouses", response_model=list[WarehouseOut])
async def list_warehouses(
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE, description="Max rows (safety cap for large tenants)"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(Warehouse)
        .where(Warehouse.tenant_id == tenant.id)
        .order_by(Warehouse.warehouse_code)
        .limit(limit)
    )
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
    await commit_handling_duplicate_document_code(db)
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
    await _ensure_warehouse_deletable(db, tenant.id, warehouse_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}


@router.get("/stock-groups", response_model=list[StockGroupOut])
async def list_stock_groups(
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(StockGroup)
        .where(StockGroup.tenant_id == tenant.id)
        .order_by(StockGroup.group_code)
        .limit(limit)
    )
    return list(result.scalars().all())


async def _validate_stock_group_body(db: AsyncSession, tenant: Tenant, body: StockGroupBody) -> None:
    if body.parent_id is not None:
        parent = await db.get(StockGroup, body.parent_id)
        if not parent or parent.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Invalid parent stock group")
    for aid in (
        body.inventory_account_id,
        body.wip_account_id,
        body.cogs_account_id,
        body.adjustment_account_id,
        body.grni_account_id,
    ):
        await _ensure_chart_account_for_tenant(db, tenant.id, aid)


@router.post("/stock-groups", response_model=StockGroupOut)
async def create_stock_group(
    body: StockGroupBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _validate_stock_group_body(db, tenant, body)
    row = StockGroup(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await commit_handling_duplicate_document_code(db)
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
    if body.parent_id is not None and body.parent_id == group_id:
        raise HTTPException(status_code=400, detail="Stock group cannot be its own parent")
    await _validate_stock_group_body(db, tenant, body)
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
    await _ensure_stock_group_deletable(db, tenant.id, group_id)
    await db.delete(row)
    await db.commit()
    return {"ok": True}


# ---------- Vendors (Phase C) ----------


@router.get("/vendors", response_model=VendorListPageOut)
async def list_vendors(
    search: str | None = Query(default=None),
    is_active: bool | None = Query(default=None),
    vendor_type: str | None = Query(default=None),
    currency: str | None = Query(default=None),
    ledger_id: int | None = Query(default=None, description="Filter by linked ledger (chart_of_accounts id)"),
    has_ledger: bool | None = Query(default=None, description="Filter: true=has ledger, false=no ledger"),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ps = clamp_page_size(page_size)
    stmt = select(Vendor).where(Vendor.tenant_id == tenant.id)
    if search:
        pattern = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            func.lower(Vendor.vendor_code).like(pattern)
            | func.lower(Vendor.name).like(pattern)
        )
    if is_active is not None:
        stmt = stmt.where(Vendor.is_active == is_active)
    if vendor_type:
        stmt = stmt.where(func.lower(Vendor.vendor_type) == vendor_type.strip().lower())
    if currency:
        stmt = stmt.where(func.lower(Vendor.default_currency) == currency.strip().lower())
    if ledger_id is not None:
        stmt = stmt.where(Vendor.ledger_id == ledger_id)
    if has_ledger is True:
        stmt = stmt.where(Vendor.ledger_id.isnot(None))
    elif has_ledger is False:
        stmt = stmt.where(Vendor.ledger_id.is_(None))
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0)
    tp = total_pages(total, ps)
    sp = safe_page(page, total, ps)
    offset = (sp - 1) * ps
    result = await db.execute(stmt.order_by(Vendor.vendor_code).limit(ps).offset(offset))
    rows = list(result.scalars().all())
    return VendorListPageOut(
        items=rows,
        total=total,
        page=sp,
        page_size=ps,
        total_pages=tp,
    )


@router.get("/vendors/{vendor_id}", response_model=VendorOut)
async def get_vendor(
    vendor_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Vendor, vendor_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor not found")
    return row


@router.post("/vendors", response_model=VendorOut, status_code=status.HTTP_201_CREATED)
async def create_vendor(
    body: VendorCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    existing = await db.execute(
        select(Vendor).where(
            Vendor.tenant_id == tenant.id,
            func.lower(Vendor.vendor_code) == body.vendor_code.strip().lower(),
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Vendor code already exists")
    if body.ledger_id is not None:
        ledger = await db.get(ChartOfAccount, body.ledger_id)
        if not ledger or ledger.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Ledger not found or tenant mismatch")
    if body.payment_terms_days is not None and body.payment_terms_days < 0:
        raise HTTPException(status_code=400, detail="payment_terms_days cannot be negative")
    row = Vendor(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.patch("/vendors/{vendor_id}", response_model=VendorOut)
async def update_vendor(
    vendor_id: int,
    body: VendorUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Vendor, vendor_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor not found")
    updates = body.model_dump(exclude_unset=True)
    if "payment_terms_days" in updates and updates["payment_terms_days"] is not None and updates["payment_terms_days"] < 0:
        raise HTTPException(status_code=400, detail="payment_terms_days cannot be negative")
    if "ledger_id" in updates and updates["ledger_id"] is not None:
        ledger = await db.get(ChartOfAccount, updates["ledger_id"])
        if not ledger or ledger.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Ledger not found or tenant mismatch")
    for k, v in updates.items():
        setattr(row, k, v)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/vendors/{vendor_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_vendor(
    vendor_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Vendor, vendor_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Vendor not found")
    await db.delete(row)
    await db.commit()


# ---------- Purchase Orders ----------


@router.get("/purchase-orders", response_model=PurchaseOrderListPageOut)
async def list_purchase_orders(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    source_bom_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ps = clamp_page_size(page_size)
    stmt = select(PurchaseOrder).where(PurchaseOrder.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(PurchaseOrder.status == status_filter.strip().upper())
    if date_from:
        stmt = stmt.where(PurchaseOrder.order_date >= date_from)
    if date_to:
        stmt = stmt.where(PurchaseOrder.order_date <= date_to)
    if source_bom_id is not None:
        stmt = stmt.where(PurchaseOrder.source_bom_id == source_bom_id)
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0)
    tp = total_pages(total, ps)
    sp = safe_page(page, total, ps)
    offset = (sp - 1) * ps
    result = await db.execute(stmt.order_by(PurchaseOrder.id.desc()).limit(ps).offset(offset))
    rows = list(result.scalars().all())
    po_ids = [r.id for r in rows]
    items_by_po: dict[int, list[PurchaseOrderItem]] = defaultdict(list)
    if po_ids:
        items_result = await db.execute(
            select(PurchaseOrderItem)
            .where(
                PurchaseOrderItem.tenant_id == tenant.id,
                PurchaseOrderItem.purchase_order_id.in_(po_ids),
            )
            .order_by(PurchaseOrderItem.purchase_order_id, PurchaseOrderItem.id)
        )
        for it in items_result.scalars().all():
            items_by_po[it.purchase_order_id].append(it)
    out = [_purchase_order_to_out(row, items_by_po.get(row.id, [])) for row in rows]
    return PurchaseOrderListPageOut(
        items=out,
        total=total,
        page=sp,
        page_size=ps,
        total_pages=tp,
    )


@router.get("/purchase-orders/{po_id}", response_model=PurchaseOrderOut)
async def get_purchase_order(
    po_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(PurchaseOrder, po_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    items_result = await db.execute(
        select(PurchaseOrderItem)
        .where(PurchaseOrderItem.purchase_order_id == row.id)
        .order_by(PurchaseOrderItem.id)
    )
    return _purchase_order_to_out(row, list(items_result.scalars().all()))


@router.post("/purchase-orders", response_model=PurchaseOrderOut)
async def create_purchase_order(
    body: PurchaseOrderBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    supplier_name = body.supplier_name
    vendor_id = body.vendor_id
    if vendor_id is not None:
        vendor = await db.get(Vendor, vendor_id)
        if not vendor or vendor.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Vendor not found")
        supplier_name = supplier_name or vendor.name
        if not body.currency and vendor.default_currency:
            body.currency = vendor.default_currency
    if not supplier_name:
        raise HTTPException(status_code=400, detail="Either supplier_name or vendor_id (with existing vendor) is required")
    line_total = 0.0
    for line in body.items:
        line_total += _to_float(line.quantity) * _to_float(line.unit_price)
    fx = body.exchange_rate_to_base if body.exchange_rate_to_base is not None else 1.0
    base_total = body.base_total_amount if body.base_total_amount is not None else (line_total * fx if line_total else None)
    if body.po_code:
        po_code = body.po_code
    else:
        po_code = await next_tenant_code(db, model=PurchaseOrder, tenant_id=tenant.id, prefix="PO-", width=4)
    row = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=po_code,
        vendor_id=vendor_id,
        supplier_name=supplier_name,
        order_date=body.order_date,
        expected_date=body.expected_date,
        currency=body.currency,
        exchange_rate_to_base=body.exchange_rate_to_base,
        base_total_amount=base_total,
        btb_lc_id=body.btb_lc_id,
        source_bom_id=body.source_bom_id,
        status=body.status,
        notes=body.notes,
    )
    db.add(row)
    await flush_handling_duplicate_document_code(db)
    t_full = await db.get(Tenant, tenant.id)
    default_rm = getattr(t_full, "default_rm_warehouse_id", None) if t_full else None
    for line in body.items:
        it = await db.get(Item, line.item_id)
        if not it or it.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Item not found: {line.item_id}")
        wh_id = line.warehouse_id
        if wh_id is not None:
            await _warehouse_for_tenant(db, tenant.id, wh_id)
        else:
            wh_id = getattr(it, "default_warehouse_id", None)
            if wh_id is None:
                wh_id = default_rm
            if wh_id is not None:
                await _warehouse_for_tenant(db, tenant.id, wh_id)
        ld = line.model_dump()
        ld["warehouse_id"] = wh_id
        db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=row.id, **ld))
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    items_result = await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == row.id))
    return PurchaseOrderOut(
        id=row.id,
        tenant_id=row.tenant_id,
        po_code=row.po_code,
        vendor_id=row.vendor_id,
        supplier_name=row.supplier_name,
        order_date=row.order_date,
        expected_date=row.expected_date,
        currency=row.currency,
        exchange_rate_to_base=(
            float(row.exchange_rate_to_base) if row.exchange_rate_to_base is not None else None
        ),
        base_total_amount=float(row.base_total_amount) if row.base_total_amount is not None else None,
        btb_lc_id=row.btb_lc_id,
        source_bom_id=getattr(row, "source_bom_id", None),
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
        vendor_id=row.vendor_id,
        supplier_name=row.supplier_name,
        order_date=row.order_date,
        expected_date=row.expected_date,
        currency=row.currency,
        exchange_rate_to_base=(
            float(row.exchange_rate_to_base) if row.exchange_rate_to_base is not None else None
        ),
        base_total_amount=float(row.base_total_amount) if row.base_total_amount is not None else None,
        btb_lc_id=row.btb_lc_id,
        source_bom_id=getattr(row, "source_bom_id", None),
        status=row.status,
        notes=row.notes,
        items=list(items_result.scalars().all()),
    )


class LotTraceGrnLineOut(BaseModel):
    grn_id: int
    grn_code: str
    received_date: date | None
    item_id: int
    quantity: str
    warehouse_id: int
    lot_number: str | None = None


class LotTraceMovementOut(BaseModel):
    id: int
    movement_type: str
    quantity: str
    item_id: int
    warehouse_id: int | None
    reference_type: str | None
    reference_id: int | None
    movement_date: date | None
    lot_number: str | None
    created_at: datetime


class LotTraceResponse(BaseModel):
    lot_number: str
    grn_lines: list[LotTraceGrnLineOut]
    movements: list[LotTraceMovementOut]


@router.get("/lot-trace", response_model=LotTraceResponse)
async def trace_lot_number(
    lot_number: str = Query(..., min_length=1, max_length=64),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trace a lot from GRN receipt lines through stock movements (same tenant)."""
    _ensure_tenant(user, tenant)
    raw = lot_number.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="lot_number required")
    like_pattern = f"%{raw}%"
    grn_lines: list[LotTraceGrnLineOut] = []
    grn_item_rows = list(
        (
            await db.execute(
                select(GoodsReceivingItem, GoodsReceiving)
                .join(GoodsReceiving, GoodsReceivingItem.goods_receiving_id == GoodsReceiving.id)
                .where(
                    GoodsReceivingItem.tenant_id == tenant.id,
                    GoodsReceiving.tenant_id == tenant.id,
                    or_(GoodsReceivingItem.lot_number == raw, GoodsReceivingItem.lot_number.ilike(like_pattern)),
                )
                .order_by(GoodsReceiving.id.desc(), GoodsReceivingItem.id)
            )
        ).all()
    )
    for gi, grn in grn_item_rows:
        grn_lines.append(
            LotTraceGrnLineOut(
                grn_id=grn.id,
                grn_code=grn.grn_code,
                received_date=grn.received_date,
                item_id=gi.item_id,
                quantity=gi.quantity,
                warehouse_id=gi.warehouse_id,
                lot_number=gi.lot_number,
            )
        )
    mov_rows = list(
        (
            await db.execute(
                select(StockMovement)
                .where(
                    StockMovement.tenant_id == tenant.id,
                    or_(StockMovement.lot_number == raw, StockMovement.lot_number.ilike(like_pattern)),
                )
                .order_by(StockMovement.id.desc())
                .limit(500)
            )
        ).scalars().all()
    )
    movements = [
        LotTraceMovementOut(
            id=m.id,
            movement_type=m.movement_type,
            quantity=m.quantity,
            item_id=m.item_id,
            warehouse_id=m.warehouse_id,
            reference_type=m.reference_type,
            reference_id=m.reference_id,
            movement_date=m.movement_date,
            lot_number=m.lot_number,
            created_at=m.created_at,
        )
        for m in mov_rows
    ]
    return LotTraceResponse(lot_number=raw, grn_lines=grn_lines, movements=movements)


@router.get("/goods-receiving", response_model=GoodsReceivingListPageOut)
async def list_goods_receiving(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ps = clamp_page_size(page_size)
    stmt = select(GoodsReceiving).where(GoodsReceiving.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(GoodsReceiving.status == status_filter.strip().upper())
    if date_from:
        stmt = stmt.where(GoodsReceiving.received_date >= date_from)
    if date_to:
        stmt = stmt.where(GoodsReceiving.received_date <= date_to)
    total = int((await db.execute(select(func.count()).select_from(stmt.subquery()))).scalar() or 0)
    tp = total_pages(total, ps)
    sp = safe_page(page, total, ps)
    offset = (sp - 1) * ps
    result = await db.execute(stmt.order_by(GoodsReceiving.id.desc()).limit(ps).offset(offset))
    rows = list(result.scalars().all())
    grn_ids = [r.id for r in rows]
    items_by_grn: dict[int, list[GoodsReceivingItem]] = defaultdict(list)
    if grn_ids:
        items_result = await db.execute(
            select(GoodsReceivingItem)
            .where(
                GoodsReceivingItem.tenant_id == tenant.id,
                GoodsReceivingItem.goods_receiving_id.in_(grn_ids),
            )
            .order_by(GoodsReceivingItem.goods_receiving_id, GoodsReceivingItem.id)
        )
        for it in items_result.scalars().all():
            items_by_grn[it.goods_receiving_id].append(it)
    out = [_goods_receiving_to_out(row, items_by_grn.get(row.id, [])) for row in rows]
    return GoodsReceivingListPageOut(
        items=out,
        total=total,
        page=sp,
        page_size=ps,
        total_pages=tp,
    )


@router.get("/goods-receiving/{grn_id}", response_model=GoodsReceivingOut)
async def get_goods_receiving(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GoodsReceiving, grn_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    items_result = await db.execute(
        select(GoodsReceivingItem)
        .where(GoodsReceivingItem.goods_receiving_id == row.id)
        .order_by(GoodsReceivingItem.id)
    )
    return _goods_receiving_to_out(row, list(items_result.scalars().all()))


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
        grn_code = await next_tenant_code(db, model=GoodsReceiving, tenant_id=tenant.id, prefix="GRN-", width=4)
    row = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=grn_code,
        purchase_order_id=body.purchase_order_id,
        received_date=body.received_date,
        status=body.status,
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(row)
    await flush_handling_duplicate_document_code(db)

    if body.items:
        lines = body.items
    elif body.purchase_order_id:
        po_items_result = await db.execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == body.purchase_order_id)
        )
        lines = [
            GoodsReceivingItemBody(
                item_id=p.item_id,
                warehouse_id=p.warehouse_id or 0,
                quantity=p.quantity,
                lot_number=None,
            )
            for p in po_items_result.scalars().all()
            if p.warehouse_id
        ]
    else:
        lines = []

    for line in lines:
        db.add(GoodsReceivingItem(tenant_id=tenant.id, goods_receiving_id=row.id, **line.model_dump()))
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    items_result = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id))
    return _goods_receiving_to_out(row, list(items_result.scalars().all()))


async def _apply_grn_receive_goods(
    db: AsyncSession,
    tenant: Tenant,
    user: User,
    grn_id: int,
) -> GoodsReceivingOut:
    _ensure_tenant(user, tenant)
    row = await db.get(GoodsReceiving, grn_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    if (row.status or "").upper() == "RECEIVED":
        raise HTTPException(status_code=400, detail="GRN already received")
    items_result = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id))
    items = list(items_result.scalars().all())
    if not items:
        raise HTTPException(status_code=400, detail="GRN has no items")
    po_lines: dict[tuple[int, int | None], PurchaseOrderItem] = {}
    if row.purchase_order_id:
        pls = (
            await db.execute(
                select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == row.purchase_order_id)
            )
        ).scalars().all()
        for pl in pls:
            po_lines[(pl.item_id, pl.warehouse_id)] = pl
    for line in items:
        mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.item_id,
            warehouse_id=line.warehouse_id,
            movement_type="IN",
            quantity=line.quantity,
            reference_type="GRN",
            reference_id=row.id,
            movement_date=row.received_date,
            notes=f"Received via {row.grn_code}",
            lot_number=getattr(line, "lot_number", None),
            created_by_user_id=user.id,
        )
        db.add(mv)
        await db.flush()
        pl = po_lines.get((line.item_id, line.warehouse_id)) or po_lines.get((line.item_id, None))
        uc = _to_float(pl.unit_price) if pl is not None else 0.0
        if uc <= 0:
            it_row = await db.get(Item, line.item_id)
            uc = _to_float(it_row.default_cost) if it_row and it_row.tenant_id == tenant.id else 0.0
        await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=uc)
    row.status = "RECEIVED"
    if row.purchase_order_id:
        po = await db.get(PurchaseOrder, row.purchase_order_id)
        if po and po.tenant_id == tenant.id and po.status != "CANCELLED":
            po_lines_result = await db.execute(
                select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
            )
            po_lines_list = list(po_lines_result.scalars().all())
            ordered: dict[int, float] = defaultdict(float)
            for pl in po_lines_list:
                ordered[pl.item_id] += _to_float(pl.quantity)
            received: dict[int, float] = defaultdict(float)
            prev_grns = await db.execute(
                select(GoodsReceiving).where(
                    GoodsReceiving.tenant_id == tenant.id,
                    GoodsReceiving.purchase_order_id == po.id,
                    GoodsReceiving.status == "RECEIVED",
                    GoodsReceiving.id != row.id,
                )
            )
            for grn in prev_grns.scalars().all():
                gi_result = await db.execute(
                    select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == grn.id)
                )
                for gi in gi_result.scalars().all():
                    received[gi.item_id] += _to_float(gi.quantity)
            for line in items:
                received[line.item_id] += _to_float(line.quantity)
            fully_received = True
            for item_id, ord_q in ordered.items():
                if ord_q <= 0:
                    continue
                if received.get(item_id, 0) + 1e-9 < ord_q:
                    fully_received = False
                    break
            if fully_received and ordered:
                po.status = "CLOSED"
            elif po.status not in ("CLOSED", "CANCELLED"):
                po.status = "APPROVED"
    await post_grn_receipt_gl_journal(db, tenant.id, user.id, row, items)
    await db.commit()
    await db.refresh(row)
    return _goods_receiving_to_out(row, items)


@router.post("/goods-receiving/{grn_id}/receive", response_model=GoodsReceivingOut)
async def receive_goods(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _apply_grn_receive_goods(db, tenant, user, grn_id)


@router.get("/stock-summary", response_model=list[StockSummaryRow])
async def stock_summary(
    response: Response,
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    search: str | None = Query(default=None, description="Filter by item code or name (contains, case-insensitive)"),
    warehouse_id: int | None = Query(default=None, description="Filter to one warehouse"),
    hide_zero: bool = Query(default=False, description="Exclude rows where on-hand qty is 0"),
    sort: str = Query(default="item", description="item | warehouse | in | out | on_hand"),
    sort_dir: str = Query(default="asc", description="asc | desc"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = list(await _stock_summary_rows(db, tenant.id))
    q = (search or "").strip().lower()
    if q:
        rows = [r for r in rows if q in (r.item_code or "").lower() or q in (r.item_name or "").lower()]
    if warehouse_id is not None:
        rows = [r for r in rows if r.warehouse_id == warehouse_id]
    if hide_zero:
        rows = [r for r in rows if r.on_hand_qty != 0]

    sort_key = (sort or "item").lower()
    ascending = (sort_dir or "asc").lower() != "desc"
    reverse = not ascending

    def sort_tuple(r: StockSummaryRow) -> tuple:
        if sort_key == "warehouse":
            return (r.warehouse_name or "", r.item_code)
        if sort_key == "in":
            return (r.in_qty, r.item_code, r.warehouse_name or "")
        if sort_key == "out":
            return (r.out_qty, r.item_code, r.warehouse_name or "")
        if sort_key == "on_hand":
            return (r.on_hand_qty, r.item_code, r.warehouse_name or "")
        return (r.item_code, r.item_name, r.warehouse_name or "")

    rows.sort(key=sort_tuple, reverse=reverse)
    total = len(rows)
    response.headers["X-Total-Count"] = str(total)
    return rows[offset : offset + limit]


@router.get("/stock-valuation", response_model=StockValuationOut)
async def stock_valuation(
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    fifo_map = await _fifo_layer_qty_value_map(db, tenant.id, as_of_date)
    all_summary = await _stock_summary_rows(db, tenant.id)
    summary = all_summary[offset:offset + limit]
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    out_rows: list[StockValuationRow] = []
    total = 0.0
    for s in summary:
        item = item_map.get(s.item_id)
        key = (s.item_id, s.warehouse_id)
        fq, fv = fifo_map.get(key, (0.0, 0.0))
        if fq > 1e-9 and fv > 0:
            uc = fv / fq
            lv = round(fv, 2)
        else:
            uc = _to_float(item.default_cost if item else "0")
            lv = round(s.on_hand_qty * uc, 2)
        total += lv
        out_rows.append(
            StockValuationRow(
                item_id=s.item_id,
                item_code=s.item_code,
                item_name=s.item_name,
                warehouse_id=s.warehouse_id,
                warehouse_name=s.warehouse_name,
                on_hand_qty=s.on_hand_qty,
                unit_cost=round(uc, 4),
                line_value=lv,
            )
        )
    out_rows.sort(key=lambda r: (r.item_code, r.warehouse_name or ""))
    return StockValuationOut(method="fifo", total_value=round(total, 2), rows=out_rows)


@router.post("/fifo-rebuild")
async def fifo_rebuild(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    stats = await rebuild_fifo_layers_for_tenant(db, tenant.id)
    await db.commit()
    return {"ok": True, **stats}


@router.get("/stock-summary/by-group", response_model=StockSummaryByGroupOut)
async def stock_summary_by_group(
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    fifo_map = await _fifo_layer_qty_value_map(db, tenant.id, as_of_date)
    summary = await _stock_summary_rows(db, tenant.id)
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    sg_result = await db.execute(select(StockGroup).where(StockGroup.tenant_id == tenant.id))
    sg_map = {r.id: r for r in sg_result.scalars().all()}

    by_gid: dict[int | None, list[InventorySummaryLine]] = defaultdict(list)
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        it = item_map.get(s.item_id)
        gid = it.stock_group_id if it else None
        by_gid[gid].append(_inventory_line_from_summary(s, item_map, fifo_map))

    blocks: list[StockSummaryGroupBlock] = []
    for gid, lines in sorted(by_gid.items(), key=lambda x: (x[0] is None, x[0] or 0)):
        lines.sort(key=lambda r: (r.item_code, r.warehouse_name or ""))
        tq = sum(r.on_hand_qty for r in lines)
        tv = sum(r.line_value for r in lines)
        sg = sg_map.get(gid) if gid is not None else None
        blocks.append(
            StockSummaryGroupBlock(
                stock_group_id=gid,
                stock_group_code=sg.group_code if sg else None,
                stock_group_name=sg.name if sg else None,
                total_qty=round(tq, 4),
                total_value=round(tv, 2),
                lines=lines,
            )
        )
    return StockSummaryByGroupOut(as_of_date=as_of_date, groups=blocks)


@router.get("/stock-summary/by-warehouse", response_model=StockSummaryByWarehouseOut)
async def stock_summary_by_warehouse(
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    fifo_map = await _fifo_layer_qty_value_map(db, tenant.id, as_of_date)
    summary = await _stock_summary_rows(db, tenant.id)
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    wh_result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id))
    wh_map = {r.id: r for r in wh_result.scalars().all()}

    by_wh: dict[int | None, list[InventorySummaryLine]] = defaultdict(list)
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        by_wh[s.warehouse_id].append(_inventory_line_from_summary(s, item_map, fifo_map))

    blocks: list[StockSummaryWarehouseBlock] = []
    for wid, lines in sorted(by_wh.items(), key=lambda x: (x[0] is None, x[0] or 0)):
        lines.sort(key=lambda r: (r.item_code, r.warehouse_name or ""))
        tq = sum(r.on_hand_qty for r in lines)
        tv = sum(r.line_value for r in lines)
        wh = wh_map.get(wid) if wid is not None else None
        blocks.append(
            StockSummaryWarehouseBlock(
                warehouse_id=wid,
                warehouse_code=wh.warehouse_code if wh else None,
                warehouse_name=wh.name if wh else None,
                total_qty=round(tq, 4),
                total_value=round(tv, 2),
                lines=lines,
            )
        )
    return StockSummaryByWarehouseOut(as_of_date=as_of_date, warehouses=blocks)


@router.get("/stock-summary/wip", response_model=WipSummaryOut)
async def stock_summary_wip(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    pos = (
        await db.execute(
            select(ProcessOrder).where(ProcessOrder.tenant_id == tenant.id, ProcessOrder.status == "ISSUED")
        )
    ).scalars().all()
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    rows_out: list[WipProcessLine] = []
    total_wip = 0.0
    for po in pos:
        mvs = (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant.id,
                    StockMovement.reference_type == "PROCESS_ORDER",
                    StockMovement.reference_id == po.id,
                    StockMovement.movement_type == "OUT",
                    StockMovement.item_id == po.input_item_id,
                )
            )
        ).scalars().all()
        wval = sum(_to_float(m.movement_value or "0") for m in mvs)
        total_wip += wval
        inp = item_map.get(po.input_item_id)
        outp = item_map.get(po.output_item_id)
        rows_out.append(
            WipProcessLine(
                process_order_id=po.id,
                process_number=po.process_number,
                warehouse_id=po.warehouse_id,
                input_item_id=po.input_item_id,
                input_item_code=inp.item_code if inp else str(po.input_item_id),
                output_item_id=po.output_item_id,
                output_item_code=outp.item_code if outp else str(po.output_item_id),
                input_quantity=po.input_quantity,
                wip_value=round(wval, 2),
            )
        )
    return WipSummaryOut(rows=rows_out, total_wip_value=round(total_wip, 2))


@router.get("/stock-summary/overview", response_model=StockOverviewOut)
async def stock_summary_overview(
    as_of_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stock_v = await fifo_on_hand_value(db, tenant.id, as_of_date=as_of_date)
    wip = await stock_summary_wip(tenant, user, db)
    return StockOverviewOut(
        as_of_date=as_of_date,
        stock_on_hand_value=stock_v,
        wip_value=wip.total_wip_value,
        grand_total=round(stock_v + wip.total_wip_value, 2),
    )


async def _sum_chart_balances(db: AsyncSession, tenant_id: int, account_ids: list[int]) -> float:
    if not account_ids:
        return 0.0
    accs = (
        await db.execute(
            select(ChartOfAccount).where(
                ChartOfAccount.tenant_id == tenant_id,
                ChartOfAccount.id.in_(account_ids),
            )
        )
    ).scalars().all()
    return round(sum(_to_float(a.balance) for a in accs), 4)


@router.get("/reconciliation/stock-vs-gl", response_model=StockVsGlOut)
async def reconciliation_stock_vs_gl(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    fifo_total = await fifo_on_hand_value(db, tenant.id, as_of_date=None)
    cfg = (await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant.id))).scalars().first()
    ids: set[int] = set()
    if cfg and cfg.inventory_stock_account_id:
        ids.add(cfg.inventory_stock_account_id)
    sgs = (
        await db.execute(
            select(StockGroup).where(
                StockGroup.tenant_id == tenant.id,
                StockGroup.inventory_account_id.is_not(None),
            )
        )
    ).scalars().all()
    for sg in sgs:
        if sg.inventory_account_id:
            ids.add(sg.inventory_account_id)
    gl_bal = await _sum_chart_balances(db, tenant.id, list(ids))
    return StockVsGlOut(
        fifo_stock_value=fifo_total,
        gl_inventory_balance=gl_bal,
        variance=round(fifo_total - gl_bal, 4),
        inventory_account_ids=sorted(ids),
    )


@router.get("/reconciliation/wip-vs-gl", response_model=WipVsGlOut)
async def reconciliation_wip_vs_gl(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wip = await stock_summary_wip(tenant, user, db)
    ids: set[int] = set()
    sgs = (
        await db.execute(
            select(StockGroup).where(
                StockGroup.tenant_id == tenant.id,
                StockGroup.wip_account_id.is_not(None),
            )
        )
    ).scalars().all()
    for sg in sgs:
        if sg.wip_account_id:
            ids.add(sg.wip_account_id)
    gl_bal = await _sum_chart_balances(db, tenant.id, list(ids))
    return WipVsGlOut(
        process_wip_value=wip.total_wip_value,
        gl_wip_balance=gl_bal,
        variance=round(wip.total_wip_value - gl_bal, 4),
        wip_account_ids=sorted(ids),
    )


@router.get("/stock-dashboard", response_model=StockDashboardOut)
async def stock_dashboard(
    low_stock_threshold: float = Query(default=10.0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    open_po = (
        await db.execute(
            select(func.count())
            .select_from(PurchaseOrder)
            .where(
                PurchaseOrder.tenant_id == tenant.id,
                PurchaseOrder.status.notin_(["CLOSED", "CANCELLED"]),
            )
        )
    ).scalar_one()
    grn_open = (
        await db.execute(
            select(func.count())
            .select_from(GoodsReceiving)
            .where(GoodsReceiving.tenant_id == tenant.id, GoodsReceiving.status != "RECEIVED")
        )
    ).scalar_one()
    summary = await _stock_summary_rows(db, tenant.id)
    skus = sum(1 for r in summary if r.on_hand_qty > 0)
    low = sum(1 for r in summary if 0 < r.on_hand_qty < low_stock_threshold)

    stmt = select(StockMovement).where(StockMovement.tenant_id == tenant.id)
    stmt = stmt.order_by(desc(StockMovement.movement_date).nulls_last(), desc(StockMovement.id)).limit(12)
    result = await db.execute(stmt)
    mv_rows = list(result.scalars().all())
    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    wh_result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id))
    wh_map = {r.id: r for r in wh_result.scalars().all()}
    recent = [
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
            created_by_user_id=getattr(row, "created_by_user_id", None),
            running_balance=0.0,
        )
        for row in mv_rows
    ]

    return StockDashboardOut(
        open_purchase_orders=int(open_po or 0),
        grns_pending_receive=int(grn_open or 0),
        skus_with_positive_stock=skus,
        low_stock_lines=low,
        low_stock_threshold=low_stock_threshold,
        recent_movements=recent,
    )


@router.get("/stock-ledger", response_model=StockLedgerPageOut)
async def stock_ledger(
    item_id: int | None = Query(default=None),
    warehouse_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Cumulative running balance per item + warehouse (signed IN − OUT) through each movement in chronological order."""
    _ensure_tenant(user, tenant)
    sm = StockMovement
    eff = func.coalesce(sm.movement_date, cast(sm.created_at, SQLDate))
    qty_n = cast(sm.quantity, Numeric)
    signed_qty = case((sm.movement_type == "IN", qty_n), else_=-qty_n)
    wh_key = func.coalesce(sm.warehouse_id, -1)
    running_bal = func.sum(signed_qty).over(
        partition_by=(sm.item_id, wh_key),
        order_by=(eff.asc(), sm.id.asc()),
    )

    inner = select(
        sm.id,
        sm.movement_date,
        sm.movement_type,
        sm.item_id,
        sm.warehouse_id,
        sm.quantity,
        sm.reference_type,
        sm.reference_id,
        sm.notes,
        sm.created_by_user_id,
        sm.created_at,
        eff.label("eff_date"),
        running_bal.label("running_balance"),
    ).where(sm.tenant_id == tenant.id)
    if item_id is not None:
        inner = inner.where(sm.item_id == item_id)
    if warehouse_id is not None:
        inner = inner.where(sm.warehouse_id == warehouse_id)

    sq = inner.subquery()
    count_stmt = select(func.count()).select_from(sq)
    if date_from is not None:
        count_stmt = count_stmt.where(sq.c.eff_date >= date_from)
    if date_to is not None:
        count_stmt = count_stmt.where(sq.c.eff_date <= date_to)
    total = int((await db.execute(count_stmt)).scalar() or 0)

    page_stmt = select(sq)
    if date_from is not None:
        page_stmt = page_stmt.where(sq.c.eff_date >= date_from)
    if date_to is not None:
        page_stmt = page_stmt.where(sq.c.eff_date <= date_to)
    page_stmt = (
        page_stmt.order_by(desc(sq.c.eff_date).nulls_last(), desc(sq.c.id)).limit(limit).offset(offset)
    )
    result = await db.execute(page_stmt)
    raw_rows = list(result.mappings())

    items_result = await db.execute(select(Item).where(Item.tenant_id == tenant.id))
    item_map = {r.id: r for r in items_result.scalars().all()}
    wh_result = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id))
    wh_map = {r.id: r for r in wh_result.scalars().all()}

    out_items: list[StockLedgerRow] = []
    for row in raw_rows:
        iid = row["item_id"]
        wid = row["warehouse_id"]
        rb = row["running_balance"]
        out_items.append(
            StockLedgerRow(
                id=row["id"],
                movement_date=row["movement_date"],
                movement_type=row["movement_type"],
                item_id=iid,
                item_code=item_map[iid].item_code if iid in item_map else f"#{iid}",
                item_name=item_map[iid].name if iid in item_map else "Unknown",
                warehouse_id=wid,
                warehouse_name=wh_map[wid].name if wid is not None and wid in wh_map else None,
                quantity=str(row["quantity"]),
                reference_type=row["reference_type"],
                reference_id=row["reference_id"],
                notes=row["notes"],
                created_by_user_id=row.get("created_by_user_id"),
                running_balance=float(rb) if rb is not None else 0.0,
            )
        )

    return StockLedgerPageOut(items=out_items, total=total)


@router.get("/delivery-challans", response_model=list[DeliveryChallanOut])
async def list_delivery_challans(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
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
    result = await db.execute(stmt.order_by(DeliveryChallan.id.desc()).offset(offset).limit(limit))
    rows = list(result.scalars().all())
    if not rows:
        return []
    challan_ids = [r.id for r in rows]
    lines_result = await db.execute(
        select(DeliveryChallanItem)
        .where(DeliveryChallanItem.challan_id.in_(challan_ids))
        .order_by(DeliveryChallanItem.challan_id, DeliveryChallanItem.id)
    )
    lines_by_challan: dict[int, list] = defaultdict(list)
    for ln in lines_result.scalars().all():
        lines_by_challan[ln.challan_id].append(ln)
    return [_delivery_challan_to_out(row, lines_by_challan.get(row.id, [])) for row in rows]


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
        challan_code = await next_tenant_code(
            db, model=DeliveryChallan, tenant_id=tenant.id, prefix="DC-", width=4
        )
    row = DeliveryChallan(
        tenant_id=tenant.id,
        challan_code=challan_code,
        customer_name=body.customer_name,
        delivery_date=body.delivery_date,
        status=body.status,
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(row)
    await flush_handling_duplicate_document_code(db)
    for line in body.items:
        db.add(DeliveryChallanItem(tenant_id=tenant.id, challan_id=row.id, **line.model_dump()))
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
    return _delivery_challan_to_out(row, list(lines_result.scalars().all()))


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
        allow_neg = await tenant_allows_negative_stock(db, tenant.id)
        for line in lines:
            available = await _on_hand_qty(db, tenant.id, line.item_id, line.warehouse_id)
            req_qty = _to_float(line.quantity)
            if not allow_neg and available + 1e-9 < req_qty:
                item_row = await db.get(Item, line.item_id)
                if item_row and item_row.tenant_id != tenant.id:
                    item_row = None
                code = item_row.item_code if item_row else str(line.item_id)
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Insufficient stock for item {code} in warehouse #{line.warehouse_id}. "
                        f"Available={round(available, 3)}, required={round(req_qty, 3)}"
                    ),
                )
            dc_mv = StockMovement(
                tenant_id=tenant.id,
                item_id=line.item_id,
                warehouse_id=line.warehouse_id,
                movement_type="OUT",
                quantity=line.quantity,
                reference_type="DELIVERY_CHALLAN",
                reference_id=row.id,
                movement_date=row.delivery_date,
                notes=f"Posted {row.challan_code}",
                created_by_user_id=user.id,
            )
            db.add(dc_mv)
            await db.flush()
            await finalize_movement_fifo(db, tenant.id, dc_mv)
        await post_delivery_challan_gl(db, tenant.id, user.id, row.id, row.delivery_date, row.challan_code, lines)

    row.status = next_status
    await db.commit()
    await db.refresh(row)
    lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
    return _delivery_challan_to_out(row, list(lines_result.scalars().all()))


@router.get("/enhanced-gate-passes", response_model=list[GatePassOut])
async def list_enhanced_gate_passes(
    status_filter: str | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
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
    result = await db.execute(stmt.order_by(EnhancedGatePass.id.desc()).offset(offset).limit(limit))
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
        code = await next_tenant_code(db, model=EnhancedGatePass, tenant_id=tenant.id, prefix="GP-", width=4)
    row = EnhancedGatePass(tenant_id=tenant.id, gate_pass_code=code, **body.model_dump(exclude={"gate_pass_code"}))
    db.add(row)
    await commit_handling_duplicate_document_code(db)
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ProcessOrder).where(ProcessOrder.tenant_id == tenant.id).order_by(ProcessOrder.id.desc()).offset(offset).limit(limit)
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
        process_number = await next_tenant_code(db, model=ProcessOrder, tenant_id=tenant.id, prefix="PRO-", width=4)
    row = ProcessOrder(tenant_id=tenant.id, process_number=process_number, **body.model_dump(exclude={"process_number"}))
    db.add(row)
    await commit_handling_duplicate_document_code(db)
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
    po_out = StockMovement(
        tenant_id=tenant.id,
        item_id=row.input_item_id,
        warehouse_id=row.warehouse_id,
        movement_type="OUT",
        quantity=row.input_quantity,
        reference_type="PROCESS_ORDER",
        reference_id=row.id,
        notes=f"Issue input for {row.process_number}",
        created_by_user_id=user.id,
    )
    db.add(po_out)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, po_out)
    await post_process_order_issue_gl(
        db,
        tenant.id,
        user.id,
        row.id,
        row.input_item_id,
        row.output_item_id,
        f"Issue input for {row.process_number}",
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
    outs = (
        await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.reference_type == "PROCESS_ORDER",
                StockMovement.reference_id == row.id,
                StockMovement.movement_type == "OUT",
                StockMovement.item_id == row.input_item_id,
            )
        )
    ).scalars().all()
    input_cost = sum(_to_float(m.movement_value or "0") for m in outs)
    proc = _to_float(body.processing_charges or "0")
    uc = (input_cost + proc) / actual_qty if actual_qty > 0 else 0.0
    po_in = StockMovement(
        tenant_id=tenant.id,
        item_id=row.output_item_id,
        warehouse_id=row.warehouse_id,
        movement_type="IN",
        quantity=str(actual_qty),
        reference_type="PROCESS_ORDER",
        reference_id=row.id,
        notes=f"Receive output for {row.process_number}",
        created_by_user_id=user.id,
    )
    db.add(po_in)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, po_in, in_unit_cost=uc)
    row.actual_output_qty = str(actual_qty)
    row.processing_charges = body.processing_charges or "0"
    row.status = "RECEIVED"
    await post_process_order_receive_gl(
        db,
        tenant.id,
        user.id,
        row.id,
        row.output_item_id,
        f"Receive output for {row.process_number}",
    )
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
    response: Response,
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    total = int(
        (
            await db.execute(
                select(func.count()).select_from(ManufacturingOrder).where(ManufacturingOrder.tenant_id == tenant.id)
            )
        ).scalar()
        or 0,
    )
    response.headers["X-Total-Count"] = str(total)
    result = await db.execute(
        select(ManufacturingOrder)
        .where(ManufacturingOrder.tenant_id == tenant.id)
        .order_by(ManufacturingOrder.id.desc())
        .offset(offset)
        .limit(limit)
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
        mo_number = await next_tenant_code(db, model=ManufacturingOrder, tenant_id=tenant.id, prefix="MO-", width=4)
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
    await flush_handling_duplicate_document_code(db)
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
    await commit_handling_duplicate_document_code(db)
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

    c_mv = StockMovement(
        tenant_id=tenant.id,
        item_id=body.item_id,
        warehouse_id=body.warehouse_id,
        movement_type="OUT",
        quantity=str(body.issue_qty),
        reference_type="CONSUMPTION_ISSUE",
        reference_id=body.order_id,
        notes=body.remarks or "Issue against finalized consumption plan",
        created_by_user_id=user.id,
    )
    db.add(c_mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, c_mv)
    await post_consumption_issue_gl(db, tenant.id, user.id, c_mv.id)
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
    stock_rows = await _stock_summary_rows(db, tenant.id)
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
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
    result = await db.execute(stmt.order_by(ConsumptionChangeRequest.id.desc()).offset(offset).limit(limit))
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
    await _require_manager_or_admin(db, user, tenant.id)
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
    await _require_manager_or_admin(db, user, tenant.id)
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


# ---------- Warehouse transfers & stock adjustments ----------


class WarehouseTransferLineBody(BaseModel):
    item_id: int
    quantity: str

    @field_validator("quantity", mode="before")
    @classmethod
    def _v_wt_line_qty(cls, v: object) -> str:
        return validate_positive_qty_str(_as_str(v), "quantity")


class WarehouseTransferCreate(BaseModel):
    from_warehouse_id: int
    to_warehouse_id: int
    transfer_date: date | None = None
    notes: str | None = None
    items: list[WarehouseTransferLineBody]


class WarehouseTransferLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    transfer_id: int
    item_id: int
    quantity: str


class WarehouseTransferOut(BaseModel):
    id: int
    tenant_id: int
    transfer_code: str
    from_warehouse_id: int
    to_warehouse_id: int
    transfer_date: date | None
    status: str
    notes: str | None
    created_by_user_id: int | None = None
    items: list[WarehouseTransferLineOut]


class StockAdjustmentCreate(BaseModel):
    warehouse_id: int
    item_id: int
    quantity: str
    reason_code: str = "OTHER"
    adjustment_date: date | None = None
    notes: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def _v_adj_qty(cls, v: object) -> str:
        return validate_signed_adjustment_qty_str(_as_str(v), "quantity")


class StockAdjustmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    tenant_id: int
    adjust_code: str
    warehouse_id: int
    item_id: int
    quantity: str
    reason_code: str
    adjustment_date: date | None
    status: str
    notes: str | None
    created_by_user_id: int | None = None


async def _warehouse_for_tenant(db: AsyncSession, tenant_id: int, warehouse_id: int) -> Warehouse:
    w = await db.get(Warehouse, warehouse_id)
    if not w or w.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    return w


async def _ensure_item_default_warehouse(
    db: AsyncSession, tenant_id: int, warehouse_id: int | None
) -> None:
    if warehouse_id is None:
        return
    w = await db.get(Warehouse, warehouse_id)
    if not w or w.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="default_warehouse_id: warehouse not found for this tenant")


def _to_transfer_out(row: WarehouseTransfer, lines: list[WarehouseTransferLine]) -> WarehouseTransferOut:
    return WarehouseTransferOut(
        id=row.id,
        tenant_id=row.tenant_id,
        transfer_code=row.transfer_code,
        from_warehouse_id=row.from_warehouse_id,
        to_warehouse_id=row.to_warehouse_id,
        transfer_date=row.transfer_date,
        status=row.status,
        notes=row.notes,
        created_by_user_id=getattr(row, "created_by_user_id", None),
        items=[
            WarehouseTransferLineOut(
                id=ln.id,
                transfer_id=ln.transfer_id,
                item_id=ln.item_id,
                quantity=ln.quantity,
            )
            for ln in lines
        ],
    )


@router.get("/warehouse-transfers", response_model=list[WarehouseTransferOut])
async def list_warehouse_transfers(
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(WarehouseTransfer).where(WarehouseTransfer.tenant_id == tenant.id).order_by(WarehouseTransfer.id.desc())
    if status_filter:
        stmt = stmt.where(WarehouseTransfer.status == status_filter.strip().upper())
    result = await db.execute(stmt.offset(offset).limit(limit))
    rows = list(result.scalars().all())
    if not rows:
        return []
    transfer_ids = [r.id for r in rows]
    lines_result = await db.execute(
        select(WarehouseTransferLine)
        .where(WarehouseTransferLine.transfer_id.in_(transfer_ids))
        .order_by(WarehouseTransferLine.transfer_id, WarehouseTransferLine.id)
    )
    lines_by_transfer: dict[int, list] = defaultdict(list)
    for ln in lines_result.scalars().all():
        lines_by_transfer[ln.transfer_id].append(ln)
    return [_to_transfer_out(row, lines_by_transfer.get(row.id, [])) for row in rows]


@router.post("/warehouse-transfers", response_model=WarehouseTransferOut)
async def create_warehouse_transfer(
    body: WarehouseTransferCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if body.from_warehouse_id == body.to_warehouse_id:
        raise HTTPException(status_code=400, detail="Source and destination warehouse must differ")
    if not body.items:
        raise HTTPException(status_code=400, detail="At least one line item is required")
    await _warehouse_for_tenant(db, tenant.id, body.from_warehouse_id)
    await _warehouse_for_tenant(db, tenant.id, body.to_warehouse_id)
    for line in body.items:
        if _to_float(line.quantity) <= 0:
            raise HTTPException(status_code=400, detail="Line quantity must be greater than 0")
        item = await db.get(Item, line.item_id)
        if not item or item.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Item not found: {line.item_id}")

    code = await next_tenant_code(db, model=WarehouseTransfer, tenant_id=tenant.id, prefix="WT-", width=4)
    row = WarehouseTransfer(
        tenant_id=tenant.id,
        transfer_code=code,
        from_warehouse_id=body.from_warehouse_id,
        to_warehouse_id=body.to_warehouse_id,
        transfer_date=body.transfer_date,
        status="DRAFT",
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(row)
    await flush_handling_duplicate_document_code(db)
    for line in body.items:
        db.add(
            WarehouseTransferLine(
                tenant_id=tenant.id,
                transfer_id=row.id,
                item_id=line.item_id,
                quantity=str(_to_float(line.quantity)),
            )
        )
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    lines_result = await db.execute(
        select(WarehouseTransferLine).where(WarehouseTransferLine.transfer_id == row.id).order_by(WarehouseTransferLine.id)
    )
    return _to_transfer_out(row, list(lines_result.scalars().all()))


@router.post("/warehouse-transfers/{transfer_id}/post", response_model=WarehouseTransferOut)
async def post_warehouse_transfer(
    transfer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(WarehouseTransfer, transfer_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if row.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft transfer can be posted")
    lines_result = await db.execute(
        select(WarehouseTransferLine).where(WarehouseTransferLine.transfer_id == row.id).order_by(WarehouseTransferLine.id)
    )
    lines = list(lines_result.scalars().all())
    if not lines:
        raise HTTPException(status_code=400, detail="Transfer has no lines")

    allow_neg = await tenant_allows_negative_stock(db, tenant.id)
    for line in lines:
        req = _to_float(line.quantity)
        available = await _on_hand_qty(db, tenant.id, line.item_id, row.from_warehouse_id)
        if not allow_neg and available + 1e-9 < req:
            item = await db.get(Item, line.item_id)
            icode = item.item_code if item else str(line.item_id)
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for {icode} at source. Available={round(available, 3)}, required={round(req, 3)}",
            )

    mv_date = row.transfer_date or date.today()
    for line in lines:
        qty_s = str(_to_float(line.quantity))
        qf = _to_float(qty_s)
        out_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.item_id,
            warehouse_id=row.from_warehouse_id,
            movement_type="OUT",
            quantity=qty_s,
            reference_type="WAREHOUSE_TRANSFER",
            reference_id=row.id,
            movement_date=mv_date,
            notes=f"Transfer {row.transfer_code} out",
            created_by_user_id=user.id,
        )
        db.add(out_mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, out_mv)
        uc = _to_float(out_mv.movement_value or "0") / qf if qf > 0 else 0.0
        in_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.item_id,
            warehouse_id=row.to_warehouse_id,
            movement_type="IN",
            quantity=qty_s,
            reference_type="WAREHOUSE_TRANSFER",
            reference_id=row.id,
            movement_date=mv_date,
            notes=f"Transfer {row.transfer_code} in",
            created_by_user_id=user.id,
        )
        db.add(in_mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, in_mv, in_unit_cost=uc)
    row.status = "POSTED"
    await db.commit()
    await db.refresh(row)
    lines_result = await db.execute(
        select(WarehouseTransferLine).where(WarehouseTransferLine.transfer_id == row.id).order_by(WarehouseTransferLine.id)
    )
    return _to_transfer_out(row, list(lines_result.scalars().all()))


@router.get("/stock-adjustments", response_model=list[StockAdjustmentOut])
async def list_stock_adjustments(
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(StockAdjustment).where(StockAdjustment.tenant_id == tenant.id).order_by(StockAdjustment.id.desc())
    if status_filter:
        stmt = stmt.where(StockAdjustment.status == status_filter.strip().upper())
    result = await db.execute(stmt.offset(offset).limit(limit))
    return list(result.scalars().all())


@router.post("/stock-adjustments", response_model=StockAdjustmentOut)
async def create_stock_adjustment(
    body: StockAdjustmentCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    qty_f = _to_float(body.quantity)
    if qty_f == 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be zero")
    await _warehouse_for_tenant(db, tenant.id, body.warehouse_id)
    item = await db.get(Item, body.item_id)
    if not item or item.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")

    rc = (body.reason_code or "OTHER").strip().upper() or "OTHER"
    code = await next_tenant_code(db, model=StockAdjustment, tenant_id=tenant.id, prefix="ADJ-", width=4)
    row = StockAdjustment(
        tenant_id=tenant.id,
        adjust_code=code,
        warehouse_id=body.warehouse_id,
        item_id=body.item_id,
        quantity=str(qty_f),
        reason_code=rc[:32],
        adjustment_date=body.adjustment_date,
        status="DRAFT",
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.post("/stock-adjustments/{adjustment_id}/post", response_model=StockAdjustmentOut)
async def post_stock_adjustment(
    adjustment_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(StockAdjustment, adjustment_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Adjustment not found")
    if row.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft adjustment can be posted")

    qty_f = _to_float(row.quantity)
    if qty_f == 0:
        raise HTTPException(status_code=400, detail="Quantity cannot be zero")
    mv_date = row.adjustment_date or date.today()
    if qty_f < 0:
        allow_neg = await tenant_allows_negative_stock(db, tenant.id)
        available = await _on_hand_qty(db, tenant.id, row.item_id, row.warehouse_id)
        if not allow_neg and available + 1e-9 < abs(qty_f):
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for negative adjustment. Available={round(available, 3)}, required={round(abs(qty_f), 3)}",
            )
        adj_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=row.item_id,
            warehouse_id=row.warehouse_id,
            movement_type="OUT",
            quantity=str(abs(qty_f)),
            reference_type="STOCK_ADJUSTMENT",
            reference_id=row.id,
            movement_date=mv_date,
            notes=f"Adjustment {row.adjust_code} ({row.reason_code})",
            created_by_user_id=user.id,
        )
        db.add(adj_mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, adj_mv)
    else:
        it_adj = await db.get(Item, row.item_id)
        uc_adj = _to_float(it_adj.default_cost) if it_adj and it_adj.tenant_id == tenant.id else 0.0
        adj_mv = StockMovement(
            tenant_id=tenant.id,
            item_id=row.item_id,
            warehouse_id=row.warehouse_id,
            movement_type="IN",
            quantity=str(qty_f),
            reference_type="STOCK_ADJUSTMENT",
            reference_id=row.id,
            movement_date=mv_date,
            notes=f"Adjustment {row.adjust_code} ({row.reason_code})",
            created_by_user_id=user.id,
        )
        db.add(adj_mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, adj_mv, in_unit_cost=uc_adj)
    await post_stock_adjustment_gl(db, tenant.id, user.id, row)
    row.status = "POSTED"
    await db.commit()
    await db.refresh(row)
    return row


# ---------- Physical inventory (cycle count) ----------


class PhysicalCountLineIn(BaseModel):
    item_id: int
    counted_qty: str

    @field_validator("counted_qty", mode="before")
    @classmethod
    def _v_counted_qty(cls, v: object) -> str:
        s = _as_str(v)
        if not s:
            s = "0"
        return validate_non_negative_qty_str(s, "counted_qty")


class PhysicalCountSessionCreate(BaseModel):
    warehouse_id: int
    count_date: date | None = None
    notes: str | None = None
    lines: list[PhysicalCountLineIn]


class PhysicalInventoryLineOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    item_id: int
    expected_qty: str
    counted_qty: str | None


class PhysicalInventorySessionOut(BaseModel):
    id: int
    tenant_id: int
    warehouse_id: int
    session_code: str
    status: str
    count_date: date | None
    notes: str | None
    lines: list[PhysicalInventoryLineOut]


def _phys_session_out(row: PhysicalInventorySession, lines: list[PhysicalInventoryLine]) -> PhysicalInventorySessionOut:
    return PhysicalInventorySessionOut(
        id=row.id,
        tenant_id=row.tenant_id,
        warehouse_id=row.warehouse_id,
        session_code=row.session_code,
        status=row.status,
        count_date=row.count_date,
        notes=row.notes,
        lines=[
            PhysicalInventoryLineOut(
                id=ln.id,
                session_id=ln.session_id,
                item_id=ln.item_id,
                expected_qty=ln.expected_qty,
                counted_qty=ln.counted_qty,
            )
            for ln in lines
        ],
    )


@router.get("/physical-inventory-sessions", response_model=list[PhysicalInventorySessionOut])
async def list_physical_inventory_sessions(
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = list(
        (
            await db.execute(
                select(PhysicalInventorySession)
                .where(PhysicalInventorySession.tenant_id == tenant.id)
                .order_by(PhysicalInventorySession.id.desc())
                .offset(offset)
                .limit(limit)
            )
        ).scalars().all()
    )
    if not rows:
        return []
    session_ids = [r.id for r in rows]
    lines_result = await db.execute(
        select(PhysicalInventoryLine)
        .where(PhysicalInventoryLine.session_id.in_(session_ids))
        .order_by(PhysicalInventoryLine.session_id, PhysicalInventoryLine.id)
    )
    lines_by_session: dict[int, list] = defaultdict(list)
    for ln in lines_result.scalars().all():
        lines_by_session[ln.session_id].append(ln)
    return [_phys_session_out(row, lines_by_session.get(row.id, [])) for row in rows]


@router.post("/physical-inventory-sessions", response_model=PhysicalInventorySessionOut)
async def create_physical_inventory_session(
    body: PhysicalCountSessionCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one line is required")
    await _warehouse_for_tenant(db, tenant.id, body.warehouse_id)
    seen: set[int] = set()
    for line in body.lines:
        if line.item_id in seen:
            raise HTTPException(status_code=400, detail=f"Duplicate item_id in session: {line.item_id}")
        seen.add(line.item_id)
        item = await db.get(Item, line.item_id)
        if not item or item.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail=f"Item not found: {line.item_id}")
        if _to_float(line.counted_qty) < 0:
            raise HTTPException(status_code=400, detail="Counted quantity cannot be negative")
    code = await next_tenant_code(db, model=PhysicalInventorySession, tenant_id=tenant.id, prefix="PIC-", width=4)
    row = PhysicalInventorySession(
        tenant_id=tenant.id,
        warehouse_id=body.warehouse_id,
        session_code=code,
        status="DRAFT",
        count_date=body.count_date,
        notes=body.notes,
    )
    db.add(row)
    await flush_handling_duplicate_document_code(db)
    for line in body.lines:
        exp = await _on_hand_qty(db, tenant.id, line.item_id, body.warehouse_id)
        db.add(
            PhysicalInventoryLine(
                tenant_id=tenant.id,
                session_id=row.id,
                item_id=line.item_id,
                expected_qty=str(round(exp, 6)),
                counted_qty=line.counted_qty.strip(),
            )
        )
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    lines_result = await db.execute(
        select(PhysicalInventoryLine).where(PhysicalInventoryLine.session_id == row.id).order_by(PhysicalInventoryLine.id)
    )
    return _phys_session_out(row, list(lines_result.scalars().all()))


@router.post("/physical-inventory-sessions/{session_id}/post", response_model=PhysicalInventorySessionOut)
async def post_physical_inventory_session(
    session_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(PhysicalInventorySession, session_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Physical count session not found")
    if row.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only draft session can be posted")
    lines_result = await db.execute(
        select(PhysicalInventoryLine).where(PhysicalInventoryLine.session_id == row.id).order_by(PhysicalInventoryLine.id)
    )
    lines = list(lines_result.scalars().all())
    if not lines:
        raise HTTPException(status_code=400, detail="Session has no lines")
    mv_date = row.count_date or date.today()
    allow_neg = await tenant_allows_negative_stock(db, tenant.id)
    for line in lines:
        expected = _to_float(line.expected_qty)
        counted = _to_float(line.counted_qty) if line.counted_qty is not None else expected
        delta = counted - expected
        if abs(delta) < 1e-9:
            continue
        if delta < 0:
            available = await _on_hand_qty(db, tenant.id, line.item_id, row.warehouse_id)
            if not allow_neg and available + 1e-9 < abs(delta):
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Insufficient stock to post variance for item #{line.item_id}. "
                        f"Available={round(available, 3)}, required OUT={round(abs(delta), 3)}"
                    ),
                )
        qty_s = abs(delta)
        if delta > 0:
            pic_mv = StockMovement(
                tenant_id=tenant.id,
                item_id=line.item_id,
                warehouse_id=row.warehouse_id,
                movement_type="IN",
                quantity=str(qty_s),
                reference_type="PHYSICAL_COUNT",
                reference_id=row.id,
                movement_date=mv_date,
                notes=f"Physical count {row.session_code}",
                created_by_user_id=user.id,
            )
            db.add(pic_mv)
            await db.flush()
            it_pic = await db.get(Item, line.item_id)
            uc_pic = _to_float(it_pic.default_cost) if it_pic and it_pic.tenant_id == tenant.id else 0.0
            await finalize_movement_fifo(db, tenant.id, pic_mv, in_unit_cost=uc_pic)
        else:
            pic_mv = StockMovement(
                tenant_id=tenant.id,
                item_id=line.item_id,
                warehouse_id=row.warehouse_id,
                movement_type="OUT",
                quantity=str(qty_s),
                reference_type="PHYSICAL_COUNT",
                reference_id=row.id,
                movement_date=mv_date,
                notes=f"Physical count {row.session_code}",
                created_by_user_id=user.id,
            )
            db.add(pic_mv)
            await db.flush()
            await finalize_movement_fifo(db, tenant.id, pic_mv)
    await post_physical_inventory_gl(db, tenant.id, user.id, row.id, row.session_code, row.count_date)
    row.status = "POSTED"
    await db.commit()
    await db.refresh(row)
    lines_result = await db.execute(
        select(PhysicalInventoryLine).where(PhysicalInventoryLine.session_id == row.id).order_by(PhysicalInventoryLine.id)
    )
    return _phys_session_out(row, list(lines_result.scalars().all()))


class BulkPoStatusBody(BaseModel):
    ids: list[int]
    status: str


class BulkIdsBody(BaseModel):
    ids: list[int]


@router.post("/purchase-orders/bulk-status", response_model=dict)
async def bulk_purchase_order_status(
    body: BulkPoStatusBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    st = (body.status or "").strip().upper()
    if st not in {"DRAFT", "APPROVED", "CLOSED", "CANCELLED"}:
        raise HTTPException(status_code=400, detail="Invalid status")
    updated = 0
    for pid in body.ids:
        row = await db.get(PurchaseOrder, pid)
        if row and row.tenant_id == tenant.id:
            row.status = st
            updated += 1
    await db.commit()
    return {"updated": updated}


@router.post("/goods-receiving/bulk-receive", response_model=list[dict])
async def bulk_receive_grn(
    body: BulkIdsBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    out: list[dict] = []
    for gid in body.ids:
        try:
            res = await _apply_grn_receive_goods(db, tenant, user, gid)
            out.append({"id": gid, "ok": True, "grn_code": res.grn_code})
        except HTTPException as e:
            out.append({"id": gid, "ok": False, "detail": e.detail})
    return out


@router.get("/orders/{order_id}/material-readiness")
async def order_material_readiness(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """BOM vs stock readiness for a sales order (production planning)."""
    _ensure_tenant(user, tenant)
    from app.modules.production.readiness_service import get_order_readiness

    return await get_order_readiness(db, tenant.id, order_id)


from app.modules.inventory.vendor_ai_router import router as _vendor_ai_router

router.include_router(_vendor_ai_router, prefix="/vendors/ai", tags=["inventory-vendors-ai"])

