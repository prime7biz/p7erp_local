from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal
import json

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import Date as SQLDate
from sqlalchemy import case, cast, delete, desc, func, or_, select
from sqlalchemy.types import Numeric
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.money import format_money, line_money_from_input, parse_money
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
from app.common.permissions import (
    PERMISSION_INVENTORY_NON_PO_RECEIPT_APPROVE,
    PERMISSION_INVENTORY_OVER_ISSUE_APPROVE,
    PERMISSION_INVENTORY_OVER_RECEIPT_APPROVE,
    PERMISSION_INVENTORY_PROCESS_ORDER_APPROVE,
    assert_delegate_manager_or_permission,
    require_internal_permission,
)
from app.common.master_contract_rm_guard import (
    assert_btb_has_master_if_flag,
    assert_orders_have_master_contract,
    require_master_contract_for_rm_enabled,
)
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.modules.inventory.document_qr_service import (
    backfill_signatures_for_tenant,
    list_gl_postings_for_inventory_doc,
    sign_delivery_challan,
    sign_gate_pass,
    sign_goods_receiving,
    sign_process_order,
    sign_production_material_issue,
    sign_warehouse_transfer,
    verify_inventory_document,
)
from app.models import (
    Bom,
    BomItem,
    ChartOfAccount,
    DeliveryChallan,
    DeliveryChallanItem,
    DeliveryChallanOrder,
    EnhancedGatePass,
    ConsumptionChangeRequest,
    GoodsReceiving,
    GoodsReceivingAcknowledgement,
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
    Order,
    ProcessOrder,
    ProcessOrderCostLine,
    ProformaInvoice,
    ProductionMaterialIssue,
    ProductionMaterialIssueLine,
    QuotationMaterial,
    StockGroup,
    StockAdjustment,
    StockMovement,
    InventoryCostLayer,
    CoAConfig,
    Tenant,
    User,
    Vendor,
    VendorBill,
    Warehouse,
    WarehouseTransfer,
    WarehouseTransferLine,
    PhysicalInventorySession,
    PhysicalInventoryLine,
)

from app.modules.finance.system_coa_seeding_service import resolve_system_ledger
from app.services.fifo_inventory import finalize_movement_fifo, rebuild_fifo_layers_for_tenant, fifo_on_hand_value
from app.services.grn_inventory_gl import post_grn_receipt_gl_journal
from app.modules.inventory.material_control_variance_service import build_order_material_variance
from app.modules.inventory.stock_availability_service import compute_item_availability
from app.services.inventory_gl_service import (
    post_consumption_issue_gl,
    post_delivery_challan_gl,
    post_physical_inventory_gl,
    post_process_order_issue_gl,
    post_process_order_receive_gl,
    post_stock_adjustment_gl,
)

router = APIRouter(
    prefix="/inventory",
    tags=["inventory"],
    dependencies=[Depends(require_internal_permission("inventory.access"))],
)


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
        source_order_id=getattr(row, "source_order_id", None),
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
        vendor_id=getattr(row, "vendor_id", None),
        default_warehouse_id=getattr(row, "default_warehouse_id", None),
        source_type=getattr(row, "source_type", None),
        approval_status=getattr(row, "approval_status", None),
        supplier_delivery_challan_no=getattr(row, "supplier_delivery_challan_no", None),
        supplier_invoice_no=getattr(row, "supplier_invoice_no", None),
        vehicle_info=getattr(row, "vehicle_info", None),
        non_po_reason=getattr(row, "non_po_reason", None),
        acknowledgement_issued=bool(getattr(row, "acknowledgement_issued", False)),
        source_order_id=getattr(row, "source_order_id", None),
        source_bom_id=getattr(row, "source_bom_id", None),
        btb_lc_id=getattr(row, "btb_lc_id", None),
        master_contract_id=getattr(row, "master_contract_id", None),
        export_case_id=getattr(row, "export_case_id", None),
        items=[GoodsReceivingItemOut.model_validate(x) for x in items],
        verification_id=getattr(row, "verification_id", None),
        signature_hash=getattr(row, "signature_hash", None),
        signed_at=getattr(row, "signed_at", None),
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


def _to_float(value: str | Decimal | float | int | None) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


def _grn_line_accounting_qty_str(line: GoodsReceivingItem) -> str:
    """Stock and GRNI use accepted qty, then received, then legacy quantity."""
    a = getattr(line, "accepted_qty", None)
    if a is not None and str(a).strip() != "" and _to_float(str(a)) >= 0:
        return str(a).strip()
    r = getattr(line, "received_qty", None)
    if r is not None and str(r).strip() != "":
        return str(r).strip()
    return (line.quantity or "0").strip()


async def _sum_accepted_for_po_line_excluding_grn(
    db: AsyncSession,
    tenant_id: int,
    purchase_order_line_id: int,
    exclude_grn_id: int | None,
) -> float:
    stmt = (
        select(GoodsReceivingItem.accepted_qty, GoodsReceivingItem.received_qty, GoodsReceivingItem.quantity)
        .join(GoodsReceiving, GoodsReceiving.id == GoodsReceivingItem.goods_receiving_id)
        .where(
            GoodsReceivingItem.tenant_id == tenant_id,
            GoodsReceiving.tenant_id == tenant_id,
            GoodsReceivingItem.purchase_order_line_id == purchase_order_line_id,
            GoodsReceiving.status == "RECEIVED",
        )
    )
    if exclude_grn_id is not None:
        stmt = stmt.where(GoodsReceiving.id != exclude_grn_id)
    total = 0.0
    for acc, recv, qty in (await db.execute(stmt)).all():
        q = acc or recv or qty
        total += _to_float(str(q) if q is not None else "0")
    return total


async def _require_manager_or_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager"}:
        raise HTTPException(status_code=403, detail="Only admin or manager can review change requests")


def _scale_line_qty_for_covered(line_value: float | None, base_order_qty: float, covered: int) -> float:
    """Scale a full-order BOM quantity to a partial covered order quantity."""
    if line_value is None:
        return 0.0
    v = float(line_value)
    if v <= 0:
        return 0.0
    if base_order_qty <= 0:
        return v
    return v * (float(covered) / base_order_qty)


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


async def _stock_summary_page_sql(
    db: AsyncSession,
    tenant_id: int,
    *,
    search: str | None,
    warehouse_id: int | None,
    hide_zero: bool,
    sort_key: str,
    sort_ascending: bool,
    limit: int,
    offset: int,
) -> tuple[list[StockSummaryRow], int]:
    """
    DB-efficient stock summary: aggregate in SQL, apply filters/sort/pagination in SQL.

    Keeps parity with the legacy in-memory path used by `_stock_summary_rows` + `stock_summary`:
    - movement_type IN vs not-IN for in/out totals
    - search: substring match on item_code or name (case-insensitive)
    - hide_zero: exclude rows where round(on_hand, 3) == 0
    - sort keys match the previous Python sort_tuple ordering

    Other endpoints still use `_stock_summary_rows` (full tenant scan) until a later pass.
    """
    qty_col = cast(StockMovement.quantity, Numeric)
    in_agg = func.coalesce(
        func.sum(case((StockMovement.movement_type == "IN", qty_col), else_=0)),
        0,
    )
    out_agg = func.coalesce(
        func.sum(case((StockMovement.movement_type != "IN", qty_col), else_=0)),
        0,
    )
    agg = (
        select(
            StockMovement.item_id.label("item_id"),
            StockMovement.warehouse_id.label("warehouse_id"),
            in_agg.label("in_qty"),
            out_agg.label("out_qty"),
        )
        .where(StockMovement.tenant_id == tenant_id)
        .group_by(StockMovement.item_id, StockMovement.warehouse_id)
    ).subquery()

    on_hand_expr = cast(agg.c.in_qty - agg.c.out_qty, Numeric)
    on_hand_rounded = func.round(on_hand_expr, 3)

    wh_name_coalesced = func.coalesce(Warehouse.name, "")

    base = (
        select(
            agg.c.item_id,
            Item.item_code,
            Item.name.label("item_name"),
            agg.c.warehouse_id,
            Warehouse.name.label("warehouse_name"),
            agg.c.in_qty,
            agg.c.out_qty,
            on_hand_rounded.label("on_hand_rounded"),
        )
        .select_from(
            agg.join(Item, Item.id == agg.c.item_id).outerjoin(
                Warehouse,
                (Warehouse.id == agg.c.warehouse_id) & (Warehouse.tenant_id == tenant_id),
            )
        )
        .where(Item.tenant_id == tenant_id)
    )

    q = (search or "").strip().lower()
    if q:
        pat = f"%{q}%"
        base = base.where(
            or_(
                func.lower(Item.item_code).like(pat),
                func.lower(Item.name).like(pat),
            )
        )
    if warehouse_id is not None:
        base = base.where(agg.c.warehouse_id == warehouse_id)
    if hide_zero:
        base = base.where(on_hand_rounded != 0)

    count_stmt = select(func.count()).select_from(base.subquery())
    total = int((await db.execute(count_stmt)).scalar() or 0)

    sk = (sort_key or "item").lower()

    def _ord(col):
        return col.asc() if sort_ascending else col.desc()

    # coalesce(name, '') is never NULL; do not chain .nulls_last() before .asc() — PostgreSQL
    # requires "... ASC NULLS LAST", and SQLAlchemy emits "NULLS LAST ASC" from that pattern.
    wh_sort = wh_name_coalesced

    if sk == "warehouse":
        order_cols = (_ord(wh_sort), _ord(Item.item_code))
    elif sk == "in":
        order_cols = (_ord(agg.c.in_qty), _ord(Item.item_code), _ord(wh_sort))
    elif sk == "out":
        order_cols = (_ord(agg.c.out_qty), _ord(Item.item_code), _ord(wh_sort))
    elif sk == "on_hand":
        order_cols = (_ord(on_hand_rounded), _ord(Item.item_code), _ord(wh_sort))
    else:
        order_cols = (_ord(Item.item_code), _ord(Item.name), _ord(wh_sort))

    page_stmt = base.order_by(*order_cols).limit(limit).offset(offset)
    result = await db.execute(page_stmt)
    out: list[StockSummaryRow] = []
    for row in result.all():
        (
            item_id,
            item_code,
            item_name,
            wh_id,
            wh_name,
            in_qty_raw,
            out_qty_raw,
            on_hand_r,
        ) = row
        in_qty = round(float(in_qty_raw or 0), 3)
        out_qty = round(float(out_qty_raw or 0), 3)
        on_hand_qty = round(float(on_hand_r or 0), 3)
        out.append(
            StockSummaryRow(
                item_id=int(item_id),
                item_code=item_code or "",
                item_name=item_name or "",
                warehouse_id=int(wh_id) if wh_id is not None else None,
                warehouse_name=wh_name,
                in_qty=in_qty,
                out_qty=out_qty,
                on_hand_qty=on_hand_qty,
            )
        )
    return out, total


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


def _optional_master_code(v: object | None) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s if s else None


async def _ensure_item_category_for_tenant(db: AsyncSession, tenant_id: int, category_id: int) -> ItemCategory:
    c = await db.get(ItemCategory, category_id)
    if not c or c.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Invalid category for this tenant")
    return c


async def _ensure_item_subcategory_for_category(
    db: AsyncSession, tenant_id: int, category_id: int, subcategory_id: int | None
) -> None:
    if subcategory_id is None:
        return
    sc = await db.get(ItemSubcategory, subcategory_id)
    if not sc or sc.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Invalid subcategory for this tenant")
    if sc.category_id != category_id:
        raise HTTPException(status_code=400, detail="Subcategory does not belong to the selected category")


async def _ensure_item_unit_for_tenant(db: AsyncSession, tenant_id: int, unit_id: int) -> None:
    u = await db.get(ItemUnit, unit_id)
    if not u or u.tenant_id != tenant_id:
        raise HTTPException(status_code=400, detail="Invalid unit for this tenant")


class ItemCategoryBody(BaseModel):
    category_code: str | None = None
    name: str
    description: str | None = None
    is_active: bool = True

    @field_validator("category_code", mode="before")
    @classmethod
    def _strip_blank_category_code(cls, v: object) -> str | None:
        return _optional_master_code(v)


class ItemCategoryOut(BaseModel):
    id: int
    tenant_id: int
    category_code: str
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ItemCategoryUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ItemSubcategoryBody(BaseModel):
    category_id: int
    subcategory_code: str | None = None
    name: str
    description: str | None = None
    is_active: bool = True

    @field_validator("subcategory_code", mode="before")
    @classmethod
    def _strip_blank_subcat_code(cls, v: object) -> str | None:
        return _optional_master_code(v)


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


class ItemSubcategoryUpdateBody(BaseModel):
    category_id: int | None = None
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ItemUnitBody(BaseModel):
    unit_code: str | None = None
    name: str
    description: str | None = None
    is_active: bool = True

    @field_validator("unit_code", mode="before")
    @classmethod
    def _strip_blank_unit_code(cls, v: object) -> str | None:
        return _optional_master_code(v)


class ItemUnitOut(BaseModel):
    id: int
    tenant_id: int
    unit_code: str
    name: str
    description: str | None
    is_active: bool

    class Config:
        from_attributes = True


class ItemUnitUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


class ItemBody(BaseModel):
    item_code: str | None = None
    name: str
    description: str | None = None
    category_id: int
    subcategory_id: int | None = None
    unit_id: int
    default_warehouse_id: int | None = None
    stock_group_id: int | None = None
    default_cost: str = "0"
    is_active: bool = True

    @field_validator("item_code", mode="before")
    @classmethod
    def _strip_blank_item_code(cls, v: object) -> str | None:
        return _optional_master_code(v)


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
        if v is None:
            return "0"
        p = parse_money(v)
        return format_money(p) if p is not None else "0"

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


class ItemAvailabilityOut(BaseModel):
    item_id: int
    on_hand: float
    in_transit: float
    reserved: float
    available: float


class ItemUpdateBody(BaseModel):
    name: str | None = None
    description: str | None = None
    category_id: int | None = None
    subcategory_id: int | None = None
    unit_id: int | None = None
    default_warehouse_id: int | None = None
    stock_group_id: int | None = None
    default_cost: str | None = None
    is_active: bool | None = None


class WarehouseCreateBody(BaseModel):
    warehouse_code: str | None = None
    name: str
    address: str | None = None
    is_active: bool = True

    @field_validator("warehouse_code", mode="before")
    @classmethod
    def _strip_wh_code(cls, v: object) -> str | None:
        return _optional_master_code(v)


class WarehouseUpdateBody(BaseModel):
    name: str | None = None
    address: str | None = None
    is_active: bool | None = None


class WarehouseOut(BaseModel):
    id: int
    tenant_id: int
    warehouse_code: str
    name: str
    address: str | None
    is_active: bool

    class Config:
        from_attributes = True


class StockGroupMutableFields(BaseModel):
    name: str
    parent_id: int | None = None
    is_active: bool = True
    inventory_account_id: int | None = None
    wip_account_id: int | None = None
    cogs_account_id: int | None = None
    adjustment_account_id: int | None = None
    grni_account_id: int | None = None


class StockGroupCreateBody(StockGroupMutableFields):
    group_code: str | None = None

    @field_validator("group_code", mode="before")
    @classmethod
    def _strip_blank_group_code(cls, v: object) -> str | None:
        return _optional_master_code(v)


class StockGroupUpdateBody(StockGroupMutableFields):
    """PATCH body; codes are immutable (see group row, not editable)."""


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
    source_order_id: int | None = None

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
    source_order_id: int | None = None
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
    source_bom_line_id: int | None = None
    source_order_id: int | None = None
    source_quotation_line_id: int | None = None

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
    source_order_id: int | None = None
    status: str
    notes: str | None
    items: list[PurchaseOrderItemOut]


class GoodsReceivingItemBody(BaseModel):
    item_id: int
    warehouse_id: int
    quantity: str
    lot_number: str | None = None
    purchase_order_line_id: int | None = None
    received_qty: str | None = None
    accepted_qty: str | None = None
    rejected_qty: str | None = None
    rejection_reason: str | None = None
    unit_price: str | None = None

    @field_validator("quantity", mode="before")
    @classmethod
    def _v_grn_line_qty(cls, v: object) -> str:
        return validate_positive_qty_str(_as_str(v), "quantity")


class GoodsReceivingBody(BaseModel):
    grn_code: str | None = None
    purchase_order_id: int | None = None
    vendor_id: int | None = None
    default_warehouse_id: int | None = None
    source_type: str | None = None  # PO | NON_PO
    non_po_reason: str | None = None
    supplier_delivery_challan_no: str | None = None
    supplier_invoice_no: str | None = None
    vehicle_info: str | None = None
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
    purchase_order_line_id: int | None = None
    ordered_qty: str | None = None
    previously_received_qty: str | None = None
    received_qty: str | None = None
    accepted_qty: str | None = None
    rejected_qty: str | None = None
    pending_qty: str | None = None
    unit_price: str | None = None
    accepted_value: str | None = None
    rejection_reason: str | None = None
    source_order_id: int | None = None
    source_bom_id: int | None = None
    source_bom_line_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class GoodsReceivingOut(BaseModel):
    id: int
    tenant_id: int
    grn_code: str
    purchase_order_id: int | None
    received_date: date | None
    status: str
    notes: str | None
    created_by_user_id: int | None = None
    vendor_id: int | None = None
    default_warehouse_id: int | None = None
    source_type: str | None = None
    approval_status: str | None = None
    supplier_delivery_challan_no: str | None = None
    supplier_invoice_no: str | None = None
    vehicle_info: str | None = None
    non_po_reason: str | None = None
    acknowledgement_issued: bool = False
    source_order_id: int | None = None
    source_bom_id: int | None = None
    btb_lc_id: int | None = None
    master_contract_id: int | None = None
    export_case_id: int | None = None
    items: list[GoodsReceivingItemOut]
    verification_id: str | None = None
    signature_hash: str | None = None
    signed_at: datetime | None = None


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
    order_ids: list[int] = Field(default_factory=list, description="Sales orders linked for pipeline / shipping milestone")


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
    order_ids: list[int] = Field(default_factory=list)
    verification_id: str | None = None
    signature_hash: str | None = None
    signed_at: datetime | None = None


def _delivery_challan_to_out(
    row: DeliveryChallan,
    items: list[DeliveryChallanItem],
    *,
    order_ids: list[int] | None = None,
) -> DeliveryChallanOut:
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
        order_ids=list(order_ids or []),
        verification_id=getattr(row, "verification_id", None),
        signature_hash=getattr(row, "signature_hash", None),
        signed_at=getattr(row, "signed_at", None),
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
    verification_id: str | None = None
    signature_hash: str | None = None
    signed_at: datetime | None = None

    class Config:
        from_attributes = True


@router.get("/item-categories", response_model=list[ItemCategoryOut])
async def list_item_categories(
    search: str | None = Query(
        default=None,
        description="Case-insensitive substring match on category code or name",
    ),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ItemCategory).where(ItemCategory.tenant_id == tenant.id)
    if search and search.strip():
        pat = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(ItemCategory.category_code).like(pat),
                func.lower(ItemCategory.name).like(pat),
            )
        )
    result = await db.execute(stmt.order_by(ItemCategory.category_code).limit(limit))
    return list(result.scalars().all())


@router.post("/item-categories", response_model=ItemCategoryOut)
async def create_item_category(
    body: ItemCategoryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    data = body.model_dump()
    code = data.pop("category_code", None)
    if not code:
        code = await next_tenant_code(
            db, model=ItemCategory, tenant_id=tenant.id, prefix="CAT-", width=4
        )
    row = ItemCategory(tenant_id=tenant.id, category_code=code, **data)
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.patch("/item-categories/{category_id}", response_model=ItemCategoryOut)
async def update_item_category(
    category_id: int,
    body: ItemCategoryUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemCategory, category_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Category not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    for key, value in updates.items():
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
    search: str | None = Query(
        default=None,
        description="Case-insensitive substring match on subcategory code or name",
    ),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ItemSubcategory).where(ItemSubcategory.tenant_id == tenant.id)
    if category_id is not None:
        stmt = stmt.where(ItemSubcategory.category_id == category_id)
    if search and search.strip():
        pat = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(ItemSubcategory.subcategory_code).like(pat),
                func.lower(ItemSubcategory.name).like(pat),
            )
        )
    result = await db.execute(stmt.order_by(ItemSubcategory.subcategory_code).limit(limit))
    return list(result.scalars().all())


@router.post("/item-subcategories", response_model=ItemSubcategoryOut)
async def create_item_subcategory(
    body: ItemSubcategoryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _ensure_item_category_for_tenant(db, tenant.id, body.category_id)
    data = body.model_dump()
    code = data.pop("subcategory_code", None)
    if not code:
        code = await next_tenant_code(
            db, model=ItemSubcategory, tenant_id=tenant.id, prefix="SUBCAT-", width=4
        )
    row = ItemSubcategory(tenant_id=tenant.id, subcategory_code=code, **data)
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.patch("/item-subcategories/{subcategory_id}", response_model=ItemSubcategoryOut)
async def update_item_subcategory(
    subcategory_id: int,
    body: ItemSubcategoryUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemSubcategory, subcategory_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Subcategory not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    if "category_id" in updates:
        await _ensure_item_category_for_tenant(db, tenant.id, updates["category_id"])
    for key, value in updates.items():
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
    search: str | None = Query(
        default=None,
        description="Case-insensitive substring match on unit code or name",
    ),
    limit: int = Query(DEFAULT_PAGE_SIZE, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ItemUnit).where(ItemUnit.tenant_id == tenant.id)
    if search and search.strip():
        pat = f"%{search.strip().lower()}%"
        stmt = stmt.where(
            or_(
                func.lower(ItemUnit.unit_code).like(pat),
                func.lower(ItemUnit.name).like(pat),
            )
        )
    result = await db.execute(stmt.order_by(ItemUnit.unit_code).limit(limit))
    return list(result.scalars().all())


@router.post("/item-units", response_model=ItemUnitOut)
async def create_item_unit(
    body: ItemUnitBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    data = body.model_dump()
    code = data.pop("unit_code", None)
    if not code:
        code = await next_tenant_code(
            db, model=ItemUnit, tenant_id=tenant.id, prefix="UOM-", width=4
        )
    row = ItemUnit(tenant_id=tenant.id, unit_code=code, **data)
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.patch("/item-units/{unit_id}", response_model=ItemUnitOut)
async def update_item_unit(
    unit_id: int,
    body: ItemUnitUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ItemUnit, unit_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Unit not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    for key, value in updates.items():
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
    search: str | None = Query(
        default=None,
        description="Case-insensitive substring match on item code or name (for typeahead selectors)",
    ),
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
    if search and search.strip():
        pat = f"%{search.strip().lower()}%"
        filters.append(
            or_(
                func.lower(Item.item_code).like(pat),
                func.lower(Item.name).like(pat),
            )
        )
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


@router.get("/items/{item_id}", response_model=ItemOut)
async def get_item(
    item_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Item, item_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    return row


@router.get("/items/{item_id}/availability", response_model=ItemAvailabilityOut)
async def get_item_availability(
    item_id: int,
    warehouse_id: int | None = Query(default=None, description="Scope to one warehouse (optional)"),
    include_in_transit_po: bool = Query(default=True),
    exclude_reserved: bool = Query(default=True),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Item, item_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    slot = await compute_item_availability(
        db,
        tenant.id,
        item_id,
        warehouse_id=warehouse_id,
        include_in_transit_po=include_in_transit_po,
        exclude_reserved=exclude_reserved,
    )
    return ItemAvailabilityOut(
        item_id=slot.item_id,
        on_hand=slot.on_hand,
        in_transit=slot.in_transit,
        reserved=slot.reserved,
        available=slot.available,
    )


@router.post("/items", response_model=ItemOut)
async def create_item(
    body: ItemBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _ensure_item_category_for_tenant(db, tenant.id, body.category_id)
    await _ensure_item_subcategory_for_category(db, tenant.id, body.category_id, body.subcategory_id)
    await _ensure_item_unit_for_tenant(db, tenant.id, body.unit_id)
    await _ensure_item_default_warehouse(db, tenant.id, body.default_warehouse_id)
    await _ensure_stock_group_for_item(db, tenant.id, body.stock_group_id)
    data = body.model_dump()
    code = data.pop("item_code", None)
    if not code:
        code = await next_tenant_code(
            db, model=Item, tenant_id=tenant.id, prefix="ITEM-", width=6
        )
    if "default_cost" in data:
        data["default_cost"] = line_money_from_input(data.get("default_cost"))
    row = Item(tenant_id=tenant.id, item_code=code, **data)
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.patch("/items/{item_id}", response_model=ItemOut)
async def update_item(
    item_id: int,
    body: ItemUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Item, item_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Item not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    cat_id = updates.get("category_id", row.category_id)
    if "category_id" in updates:
        await _ensure_item_category_for_tenant(db, tenant.id, cat_id)
    sub_id = updates.get("subcategory_id", row.subcategory_id)
    if "subcategory_id" in updates or "category_id" in updates:
        await _ensure_item_subcategory_for_category(db, tenant.id, cat_id, sub_id)
    if "unit_id" in updates:
        await _ensure_item_unit_for_tenant(db, tenant.id, updates["unit_id"])
    wh = updates.get("default_warehouse_id", row.default_warehouse_id)
    if "default_warehouse_id" in updates:
        await _ensure_item_default_warehouse(db, tenant.id, wh)
    sg = updates.get("stock_group_id", row.stock_group_id)
    if "stock_group_id" in updates:
        await _ensure_stock_group_for_item(db, tenant.id, sg)
    if "default_cost" in updates:
        updates["default_cost"] = line_money_from_input(updates["default_cost"])
    for key, value in updates.items():
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
    body: WarehouseCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    data = body.model_dump()
    code = data.pop("warehouse_code", None)
    if not code:
        code = await next_tenant_code(
            db, model=Warehouse, tenant_id=tenant.id, prefix="WH-", width=4
        )
    row = Warehouse(tenant_id=tenant.id, warehouse_code=code, **data)
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.patch("/warehouses/{warehouse_id}", response_model=WarehouseOut)
async def update_warehouse(
    warehouse_id: int,
    body: WarehouseUpdateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(Warehouse, warehouse_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Warehouse not found")
    updates = body.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    for key, value in updates.items():
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


async def _validate_stock_group_body(db: AsyncSession, tenant: Tenant, body: StockGroupMutableFields) -> None:
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
    body: StockGroupCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _validate_stock_group_body(db, tenant, body)
    data = body.model_dump()
    code = data.pop("group_code", None)
    if not code:
        code = await next_tenant_code(
            db, model=StockGroup, tenant_id=tenant.id, prefix="GRP-", width=4
        )
    row = StockGroup(tenant_id=tenant.id, group_code=code, **data)
    db.add(row)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    return row


@router.patch("/stock-groups/{group_id}", response_model=StockGroupOut)
async def update_stock_group(
    group_id: int,
    body: StockGroupUpdateBody,
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
    vendor_id: int | None = Query(default=None),
    exclude_po_linked_to_proforma: int = Query(
        0,
        ge=0,
        le=1,
        description="When 1, omit POs already linked to a proforma invoice (IMPORT PI picker).",
    ),
    exclude_linked_to_proforma_invoice_id: int | None = Query(
        default=None,
        description="When excluding, keep the PO linked to this proforma invoice visible (edit draft).",
    ),
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
    if vendor_id is not None:
        stmt = stmt.where(PurchaseOrder.vendor_id == vendor_id)
    if exclude_po_linked_to_proforma:
        blocked = select(ProformaInvoice.purchase_order_id).where(
            ProformaInvoice.tenant_id == tenant.id,
            ProformaInvoice.purchase_order_id.isnot(None),
        )
        if exclude_linked_to_proforma_invoice_id is not None:
            blocked = blocked.where(ProformaInvoice.id != exclude_linked_to_proforma_invoice_id)
        blocked_r = await db.execute(blocked)
        blocked_ids = [r[0] for r in blocked_r.all() if r[0] is not None]
        if blocked_ids:
            stmt = stmt.where(PurchaseOrder.id.notin_(blocked_ids))
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
    if require_master_contract_for_rm_enabled(tenant):
        await assert_btb_has_master_if_flag(db, tenant=tenant, btb_lc_id=body.btb_lc_id)
        oids: set[int] = set()
        if body.source_order_id:
            oids.add(int(body.source_order_id))
        for line in body.items:
            if line.source_order_id:
                oids.add(int(line.source_order_id))
        await assert_orders_have_master_contract(db, tenant_id=tenant.id, order_ids=oids)
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
        source_order_id=body.source_order_id,
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
        source_order_id=getattr(row, "source_order_id", None),
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
        source_order_id=getattr(row, "source_order_id", None),
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
    purchase_order_id: int | None = Query(default=None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ps = clamp_page_size(page_size)
    stmt = select(GoodsReceiving).where(GoodsReceiving.tenant_id == tenant.id)
    if purchase_order_id is not None:
        stmt = stmt.where(GoodsReceiving.purchase_order_id == purchase_order_id)
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
    src_type = (body.source_type or "").strip().upper() or ("PO" if body.purchase_order_id else "NON_PO")
    po: PurchaseOrder | None = None
    if body.purchase_order_id:
        po = await db.get(PurchaseOrder, body.purchase_order_id)
        if not po or po.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Purchase order not found")
        pst = (po.status or "").upper()
        if pst in {"CANCELLED", "CLOSED"}:
            raise HTTPException(status_code=400, detail="Cannot receive against cancelled or closed PO")
        if require_master_contract_for_rm_enabled(tenant):
            await assert_btb_has_master_if_flag(db, tenant=tenant, btb_lc_id=po.btb_lc_id)
            oids: set[int] = set()
            if po.source_order_id:
                oids.add(int(po.source_order_id))
            pls = (
                await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))
            ).scalars().all()
            for pl in pls:
                if pl.source_order_id:
                    oids.add(int(pl.source_order_id))
            await assert_orders_have_master_contract(db, tenant_id=tenant.id, order_ids=oids)

    row = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code=grn_code,
        purchase_order_id=body.purchase_order_id,
        received_date=body.received_date,
        status=body.status,
        notes=body.notes,
        created_by_user_id=user.id,
        vendor_id=body.vendor_id or (po.vendor_id if po else None),
        default_warehouse_id=body.default_warehouse_id,
        source_type=src_type,
        approval_status="PENDING",
        non_po_reason=body.non_po_reason,
        supplier_delivery_challan_no=body.supplier_delivery_challan_no,
        supplier_invoice_no=body.supplier_invoice_no,
        vehicle_info=body.vehicle_info,
        acknowledgement_issued=False,
        source_order_id=po.source_order_id if po else None,
        source_bom_id=po.source_bom_id if po else None,
        btb_lc_id=po.btb_lc_id if po else None,
    )
    db.add(row)
    await flush_handling_duplicate_document_code(db)

    if body.items:
        lines = body.items
    elif body.purchase_order_id and po:
        po_items_result = await db.execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == body.purchase_order_id)
        )
        lines = []
        for p in po_items_result.scalars().all():
            wh_id = p.warehouse_id or body.default_warehouse_id
            if not wh_id:
                continue
            prev = await _sum_accepted_for_po_line_excluding_grn(db, tenant.id, p.id, None)
            ord_q = _to_float(p.quantity)
            pending = max(0.0, ord_q - prev)
            base_qty = f"{pending:.4g}" if pending > 0 else p.quantity
            lines.append(
                GoodsReceivingItemBody(
                    item_id=p.item_id,
                    warehouse_id=int(wh_id),
                    quantity=base_qty,
                    lot_number=None,
                    purchase_order_line_id=p.id,
                    received_qty=base_qty,
                    accepted_qty=base_qty,
                    unit_price=p.unit_price,
                )
            )
    else:
        lines = []

    for lb in lines:
        d = lb.model_dump()
        wh = int(d["warehouse_id"] or body.default_warehouse_id or 0)
        if wh <= 0:
            raise HTTPException(status_code=400, detail="Each line needs a warehouse_id or default_warehouse_id on GRN")
        recv = validate_positive_qty_str(_as_str(d.get("received_qty") or d["quantity"]), "received_qty")
        acc_raw = d.get("accepted_qty")
        acc = _as_str(acc_raw) if acc_raw is not None else recv
        acc = validate_non_negative_qty_str(acc, "accepted_qty")
        if _to_float(acc) - _to_float(recv) > 1e-6:
            raise HTTPException(status_code=400, detail="accepted_qty cannot exceed received_qty")
        rej = f"{max(0.0, _to_float(recv) - _to_float(acc)):.4g}"
        up = d.get("unit_price")
        acc_val = None
        if up is not None and str(up).strip():
            acc_val = f"{round(_to_float(acc) * _to_float(str(up)), 4):.4f}"
        poi_id = d.get("purchase_order_line_id")
        poi = await db.get(PurchaseOrderItem, int(poi_id)) if poi_id else None
        ord_snap = str(poi.quantity) if poi else None
        prev_snap = None
        pend_snap = None
        if poi:
            prev_snap = f"{await _sum_accepted_for_po_line_excluding_grn(db, tenant.id, poi.id, None):.4g}"
            pend_snap = f"{max(0.0, _to_float(poi.quantity) - _to_float(prev_snap)):.4g}"
        db.add(
            GoodsReceivingItem(
                tenant_id=tenant.id,
                goods_receiving_id=row.id,
                item_id=int(d["item_id"]),
                warehouse_id=wh,
                quantity=acc,
                lot_number=d.get("lot_number"),
                purchase_order_line_id=int(poi_id) if poi_id else None,
                ordered_qty=ord_snap,
                previously_received_qty=prev_snap,
                received_qty=recv,
                accepted_qty=acc,
                rejected_qty=rej,
                pending_qty=pend_snap,
                unit_price=str(up) if up is not None else None,
                accepted_value=acc_val,
                rejection_reason=d.get("rejection_reason"),
                source_order_id=poi.source_order_id if poi else None,
                source_bom_id=poi.source_bom_id if poi else None,
                source_bom_line_id=poi.source_bom_line_id if poi else None,
                vendor_id=row.vendor_id,
            )
        )
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
    st_src = (getattr(row, "source_type", None) or "").upper()
    if st_src == "NON_PO" and not (getattr(row, "non_po_reason", None) or "").strip():
        raise HTTPException(status_code=400, detail="NON_PO receipt requires non_po_reason before receive")
    if st_src == "NON_PO":
        await assert_delegate_manager_or_permission(
            db, user, tenant.id, permission_key=PERMISSION_INVENTORY_NON_PO_RECEIPT_APPROVE
        )

    po_lines_map: dict[tuple[int, int | None], PurchaseOrderItem] = {}
    po_lines_by_id: dict[int, PurchaseOrderItem] = {}
    if row.purchase_order_id:
        pls = (
            await db.execute(
                select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == row.purchase_order_id)
            )
        ).scalars().all()
        for pl in pls:
            po_lines_map[(pl.item_id, pl.warehouse_id)] = pl
            po_lines_by_id[pl.id] = pl

    for line in items:
        recv_s = _as_str(getattr(line, "received_qty", None) or line.quantity)
        acc_s = _grn_line_accounting_qty_str(line)
        if _to_float(recv_s) + 1e-9 < _to_float(acc_s):
            raise HTTPException(status_code=400, detail="accepted_qty cannot exceed received_qty")
        line.rejected_qty = f"{max(0.0, _to_float(recv_s) - _to_float(acc_s)):.4g}"
        line.received_qty = recv_s
        line.accepted_qty = acc_s
        line.quantity = acc_s
        if _to_float(acc_s) <= 0:
            continue

        pl: PurchaseOrderItem | None = None
        plid = getattr(line, "purchase_order_line_id", None)
        if plid:
            pl = po_lines_by_id.get(int(plid)) or await db.get(PurchaseOrderItem, int(plid))
        if pl is None and row.purchase_order_id:
            pl = po_lines_map.get((line.item_id, line.warehouse_id)) or po_lines_map.get((line.item_id, None))

        if pl is not None and row.purchase_order_id:
            prev = await _sum_accepted_for_po_line_excluding_grn(db, tenant.id, pl.id, row.id)
            ord_q = _to_float(pl.quantity)
            if prev + _to_float(acc_s) - ord_q > 1e-6:
                await assert_delegate_manager_or_permission(
                    db, user, tenant.id, permission_key=PERMISSION_INVENTORY_OVER_RECEIPT_APPROVE
                )

        uc = _to_float(getattr(line, "unit_price", None) or "0")
        if uc <= 0 and pl is not None:
            uc = _to_float(pl.unit_price)
        if uc <= 0:
            it_row = await db.get(Item, line.item_id)
            uc = _to_float(it_row.default_cost) if it_row and it_row.tenant_id == tenant.id else 0.0

        if getattr(line, "unit_price", None) is None and pl is not None:
            line.unit_price = pl.unit_price
        line.accepted_value = f"{round(_to_float(acc_s) * uc, 4):.4f}"

        mv = StockMovement(
            tenant_id=tenant.id,
            item_id=line.item_id,
            warehouse_id=line.warehouse_id,
            movement_type="IN",
            quantity=acc_s,
            reference_type="GRN",
            reference_id=row.id,
            movement_date=row.received_date,
            notes=f"Received via {row.grn_code}",
            lot_number=getattr(line, "lot_number", None),
            created_by_user_id=user.id,
            movement_kind="GRN_RECEIPT",
            goods_receiving_id=row.id,
            goods_receiving_item_id=line.id,
            purchase_order_id=row.purchase_order_id,
            purchase_order_line_id=pl.id if pl else None,
            order_id=getattr(line, "source_order_id", None) or getattr(row, "source_order_id", None),
            bom_id=getattr(line, "source_bom_id", None),
            bom_line_id=getattr(line, "source_bom_line_id", None),
            vendor_id=getattr(line, "vendor_id", None) or getattr(row, "vendor_id", None),
            btb_lc_id=getattr(row, "btb_lc_id", None),
            master_contract_id=getattr(line, "master_contract_id", None),
            export_case_id=getattr(line, "export_case_id", None),
        )
        db.add(mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=uc)

    row.status = "RECEIVED"
    row.approval_status = "APPROVED"
    if row.purchase_order_id:
        po = await db.get(PurchaseOrder, row.purchase_order_id)
        if po and po.tenant_id == tenant.id and (po.status or "").upper() != "CANCELLED":
            po_lines_result = await db.execute(
                select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id)
            )
            po_lines_list = list(po_lines_result.scalars().all())

            def _accepted_this_grn_for_pl(pl_id: int) -> float:
                t = 0.0
                for gi in items:
                    if getattr(gi, "purchase_order_line_id", None) == pl_id:
                        t += _to_float(_grn_line_accounting_qty_str(gi))
                return t

            line_fully = True
            any_ordered = False
            for pl in po_lines_list:
                ord_q = _to_float(pl.quantity)
                if ord_q <= 0:
                    continue
                any_ordered = True
                prev_other = await _sum_accepted_for_po_line_excluding_grn(db, tenant.id, pl.id, row.id)
                got = prev_other + _accepted_this_grn_for_pl(pl.id)
                if got + 1e-9 < ord_q:
                    line_fully = False
            pst = (po.status or "").upper()
            if any_ordered and line_fully:
                po.status = "FULLY_RECEIVED"
            elif any_ordered and not line_fully:
                if pst in ("DRAFT", "APPROVED", "PARTIALLY_RECEIVED"):
                    po.status = "PARTIALLY_RECEIVED"
    await post_grn_receipt_gl_journal(db, tenant.id, user.id, row, items)
    sign_goods_receiving(row, items)
    await db.commit()
    await db.refresh(row)
    order_ids: set[int] = set()
    if row.source_order_id:
        order_ids.add(int(row.source_order_id))
    if row.purchase_order_id:
        po_row = await db.get(PurchaseOrder, row.purchase_order_id)
        if po_row and po_row.tenant_id == tenant.id and po_row.source_order_id:
            order_ids.add(int(po_row.source_order_id))
    if order_ids:
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        for oid in order_ids:
            await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=oid)
        await db.commit()
    return _goods_receiving_to_out(row, items)


@router.post("/goods-receiving/{grn_id}/receive", response_model=GoodsReceivingOut)
async def receive_goods(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await _apply_grn_receive_goods(db, tenant, user, grn_id)


@router.get("/purchase-orders/{po_id}/receipt-progress")
async def purchase_order_receipt_progress(
    po_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    po = await db.get(PurchaseOrder, po_id)
    if not po or po.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Purchase order not found")
    pls = (
        await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))
    ).scalars().all()
    lines_out: list[dict] = []
    for pl in pls:
        prev = await _sum_accepted_for_po_line_excluding_grn(db, tenant.id, pl.id, None)
        ord_q = _to_float(pl.quantity)
        lines_out.append(
            {
                "purchase_order_line_id": pl.id,
                "item_id": pl.item_id,
                "ordered_qty": ord_q,
                "accepted_received_qty": round(prev, 4),
                "pending_qty": round(max(0.0, ord_q - prev), 4),
                "unit_price": pl.unit_price,
            }
        )
    return {
        "purchase_order_id": po.id,
        "po_code": po.po_code,
        "status": po.status,
        "lines": lines_out,
    }


@router.get("/material-control/order/{order_id}/variance")
async def order_material_variance(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await build_order_material_variance(db, tenant_id=tenant.id, order_id=order_id)


@router.get("/stock-movements")
async def list_stock_movements_ledger(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    order_id: int | None = Query(default=None),
    movement_kind: str | None = Query(default=None),
    limit: int = Query(200, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
):
    _ensure_tenant(user, tenant)
    stmt = select(StockMovement).where(StockMovement.tenant_id == tenant.id)
    if order_id is not None:
        stmt = stmt.where(StockMovement.order_id == order_id)
    if movement_kind:
        stmt = stmt.where(StockMovement.movement_kind == movement_kind)
    stmt = stmt.order_by(StockMovement.id.desc()).offset(offset).limit(limit)
    rows = list((await db.execute(stmt)).scalars().all())
    return [
        {
            "id": m.id,
            "movement_type": m.movement_type,
            "movement_kind": getattr(m, "movement_kind", None),
            "item_id": m.item_id,
            "warehouse_id": m.warehouse_id,
            "quantity": m.quantity,
            "reference_type": m.reference_type,
            "reference_id": m.reference_id,
            "order_id": getattr(m, "order_id", None),
            "bom_id": getattr(m, "bom_id", None),
            "bom_line_id": getattr(m, "bom_line_id", None),
            "purchase_order_id": getattr(m, "purchase_order_id", None),
            "goods_receiving_id": getattr(m, "goods_receiving_id", None),
            "process_order_id": getattr(m, "process_order_id", None),
            "movement_value": m.movement_value,
            "movement_date": m.movement_date.isoformat() if m.movement_date else None,
        }
        for m in rows
    ]


@router.post("/goods-receiving/{grn_id}/acknowledge")
async def acknowledge_goods_receiving(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GoodsReceiving, grn_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    if (row.status or "").upper() != "RECEIVED":
        raise HTTPException(status_code=400, detail="Only received GRN can be acknowledged")
    gra_code = await next_tenant_code(
        db, model=GoodsReceivingAcknowledgement, tenant_id=tenant.id, prefix="GRA-", width=4
    )
    ack = GoodsReceivingAcknowledgement(
        tenant_id=tenant.id,
        goods_receiving_id=row.id,
        gra_code=gra_code,
        issue_date=row.received_date or date.today(),
        status="ISSUED",
        issued_by_user_id=user.id,
    )
    db.add(ack)
    row.acknowledgement_issued = True
    row.acknowledgement_at = datetime.utcnow()
    row.acknowledged_by_user_id = user.id
    await db.commit()
    await db.refresh(row)
    items_result = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id))
    return _goods_receiving_to_out(row, list(items_result.scalars().all()))


@router.get("/goods-receiving/{grn_id}/print-data")
async def goods_receiving_print_data(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Payload for internal GRN print and vendor acknowledgement."""
    _ensure_tenant(user, tenant)
    row = await db.get(GoodsReceiving, grn_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    v = await db.get(Vendor, row.vendor_id) if getattr(row, "vendor_id", None) else None
    po = await db.get(PurchaseOrder, row.purchase_order_id) if row.purchase_order_id else None
    items_result = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == row.id))
    items = list(items_result.scalars().all())
    wh_ids = {i.warehouse_id for i in items}
    wh_names: dict[int, str] = {}
    for wid in wh_ids:
        w = await db.get(Warehouse, wid)
        if w:
            wh_names[wid] = w.name
    vid = getattr(row, "verification_id", None) or ""
    verification_path = f"{get_settings().api_v1_prefix}/inventory/documents/verify/{vid}" if vid else None
    return {
        "tenant": {
            "name": tenant.name,
            "company_code": tenant.company_code,
            "domain": tenant.domain,
            "address": getattr(tenant, "address", None),
        },
        "grn": {
            "id": row.id,
            "grn_code": row.grn_code,
            "status": row.status,
            "verification_id": getattr(row, "verification_id", None),
            "signature_hash": getattr(row, "signature_hash", None),
            "signed_at": row.signed_at.isoformat() if getattr(row, "signed_at", None) else None,
        },
        "grn_code": row.grn_code,
        "received_date": row.received_date.isoformat() if row.received_date else None,
        "vendor_name": v.name if v else None,
        "po_code": po.po_code if po else None,
        "source_type": getattr(row, "source_type", None),
        "lines": [
            {
                "item_id": i.item_id,
                "warehouse": wh_names.get(i.warehouse_id, str(i.warehouse_id)),
                "received_qty": getattr(i, "received_qty", None) or i.quantity,
                "accepted_qty": _grn_line_accounting_qty_str(i),
                "rejected_qty": getattr(i, "rejected_qty", None),
                "rejection_reason": getattr(i, "rejection_reason", None),
                "unit_price": getattr(i, "unit_price", None),
            }
            for i in items
        ],
        "notes": row.notes,
        "acknowledgement_issued": bool(getattr(row, "acknowledgement_issued", False)),
        "verification_path": verification_path,
        "print_meta": {
            "generated_at": datetime.utcnow().isoformat(),
            "copy_labels": ["Original", "Duplicate", "Triplicate"],
        },
    }


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
    sort_key = (sort or "item").lower()
    ascending = (sort_dir or "asc").lower() != "desc"
    rows, total = await _stock_summary_page_sql(
        db,
        tenant.id,
        search=search,
        warehouse_id=warehouse_id,
        hide_zero=hide_zero,
        sort_key=sort_key,
        sort_ascending=ascending,
        limit=limit,
        offset=offset,
    )
    response.headers["X-Total-Count"] = str(total)
    return rows


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


async def _maybe_resolve_system_ledger_id(db: AsyncSession, tenant_id: int, mapping_key: str) -> int | None:
    try:
        return await resolve_system_ledger(db, tenant_id, mapping_key)
    except ValueError:
        return None


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
    for key in ("RAW_MATERIAL_INVENTORY", "FINISHED_GOODS", "PACKING_MATERIAL_INVENTORY"):
        lid = await _maybe_resolve_system_ledger_id(db, tenant.id, key)
        if lid:
            ids.add(lid)
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
    wip_sys = await _maybe_resolve_system_ledger_id(db, tenant.id, "WORK_IN_PROGRESS")
    if wip_sys:
        ids.add(wip_sys)
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
    linked_order_ids: list[int] = []
    seen_oid: set[int] = set()
    for oid in body.order_ids or []:
        if oid in seen_oid:
            continue
        seen_oid.add(oid)
        ord_row = await db.get(Order, oid)
        if not ord_row or ord_row.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail=f"Order {oid} not found")
        db.add(
            DeliveryChallanOrder(
                tenant_id=tenant.id,
                delivery_challan_id=row.id,
                order_id=oid,
            )
        )
        linked_order_ids.append(oid)
    await db.flush()
    lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
    item_lines = list(lines_result.scalars().all())
    # Sign at creation so print / QR work before POSTED (re-signed on POST with updated status in payload).
    sign_delivery_challan(row, item_lines, linked_order_ids)
    await commit_handling_duplicate_document_code(db)
    await db.refresh(row)
    lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
    return _delivery_challan_to_out(row, list(lines_result.scalars().all()), order_ids=linked_order_ids)


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
    posting_now = next_status == "POSTED" and row.status != "POSTED"

    # Safe stock posting: only create OUT stock movements once.
    if posting_now:
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
        oids_for_sign = list(
            dict.fromkeys(
                r[0]
                for r in (
                    await db.execute(
                        select(DeliveryChallanOrder.order_id).where(
                            DeliveryChallanOrder.tenant_id == tenant.id,
                            DeliveryChallanOrder.delivery_challan_id == row.id,
                        )
                    )
                ).all()
            )
        )
        sign_delivery_challan(row, lines, oids_for_sign)

    row.status = next_status
    await db.commit()
    await db.refresh(row)
    if posting_now:
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        br = await db.execute(
            select(DeliveryChallanOrder.order_id).where(
                DeliveryChallanOrder.tenant_id == tenant.id,
                DeliveryChallanOrder.delivery_challan_id == row.id,
            )
        )
        for (oid,) in br.all():
            await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=oid)
        await db.commit()
    oids_result = await db.execute(
        select(DeliveryChallanOrder.order_id).where(
            DeliveryChallanOrder.tenant_id == tenant.id,
            DeliveryChallanOrder.delivery_challan_id == row.id,
        )
    )
    linked_oids = list(dict.fromkeys(r[0] for r in oids_result.all()))
    lines_result = await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id))
    return _delivery_challan_to_out(row, list(lines_result.scalars().all()), order_ids=linked_oids)


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
    await flush_handling_duplicate_document_code(db)
    # Sign at creation so print / QR work before RELEASED (re-signed on RELEASED with updated status in payload).
    sign_gate_pass(row)
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
        prev_status = (row.status or "").upper()
        row.status = next_status
        if next_status == "RELEASED" and prev_status != "RELEASED":
            sign_gate_pass(row)
    if "guard_acknowledged" in body:
        row.guard_acknowledged = bool(body["guard_acknowledged"])
    await db.commit()
    await db.refresh(row)
    return row


CONSUMPTION_TOLERANCE_PCT = 2.0


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
    process_stage: str | None = None
    prior_process_order_id: int | None = None
    vendor_id: int | None = None
    customer_id: int | None = None
    output_warehouse_id: int | None = None
    source_bom_id: int | None = None
    source_order_id: int | None = None
    btb_lc_id: int | None = None
    master_contract_id: int | None = None
    export_case_id: int | None = None
    planned_loss_pct: str | None = None
    output_same_as_input: bool | None = None
    output_grade: str | None = None
    output_lot_number: str | None = None


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
    process_stage: str | None = None
    prior_process_order_id: int | None = None
    vendor_id: int | None = None
    customer_id: int | None = None
    output_warehouse_id: int | None = None
    source_bom_id: int | None = None
    source_order_id: int | None = None
    btb_lc_id: int | None = None
    master_contract_id: int | None = None
    export_case_id: int | None = None
    planned_loss_pct: str | None = None
    actual_loss_qty: str | None = None
    output_grade: str | None = None
    output_lot_number: str | None = None
    output_same_as_input: bool | None = None
    verification_id: str | None = None
    signature_hash: str | None = None
    signed_at: datetime | None = None
    knitting_service_voucher_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class ProcessReceiveBody(BaseModel):
    actual_output_qty: str
    processing_charges: str | None = "0"


class ProductionMaterialIssueLineIn(BaseModel):
    bom_line_id: int
    actual_issue_qty: str


class ProductionMaterialIssueCreateBody(BaseModel):
    order_id: int
    bom_id: int
    production_stage: str
    covered_order_qty: int = Field(..., ge=1)
    warehouse_id: int
    issue_date: date | None = None
    notes: str | None = None
    lines: list[ProductionMaterialIssueLineIn]


class ProductionMaterialIssueOut(BaseModel):
    id: int
    tenant_id: int
    issue_code: str
    order_id: int
    bom_id: int
    production_stage: str
    covered_order_qty: int
    warehouse_id: int
    status: str
    issue_date: date | None = None
    verification_id: str | None = None
    signature_hash: str | None = None
    signed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)


class ProductionMaterialIssueLineOut(BaseModel):
    id: int
    issue_id: int
    bom_line_id: int
    item_id: int
    standard_qty_for_covered: str | None = None
    actual_issue_qty: str
    variance_qty: str | None = None
    variance_pct: str | None = None
    variance_type: str | None = None
    approval_required: bool = False
    stock_movement_id: int | None = None

    model_config = ConfigDict(from_attributes=True)


class ProductionMaterialIssueDetailOut(ProductionMaterialIssueOut):
    lines: list[ProductionMaterialIssueLineOut] = Field(default_factory=list)


class ProcessOrderCostLineBody(BaseModel):
    cost_type: str = "ADD_ON"
    description: str | None = None
    amount: str
    vendor_id: int | None = None
    currency: str | None = None
    remarks: str | None = None


@router.get("/production-material-issues", response_model=list[ProductionMaterialIssueOut])
async def list_production_material_issues(
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(ProductionMaterialIssue)
        .where(ProductionMaterialIssue.tenant_id == tenant.id)
        .order_by(ProductionMaterialIssue.id.desc())
        .offset(offset)
        .limit(limit)
    )
    return list(result.scalars().all())


@router.post("/production-material-issues", response_model=ProductionMaterialIssueOut, status_code=status.HTTP_201_CREATED)
async def create_and_post_production_material_issue(
    body: ProductionMaterialIssueCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one line is required")

    bom = await db.get(Bom, body.bom_id)
    if not bom or bom.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="BOM not found")
    if bom.order_id != body.order_id:
        raise HTTPException(status_code=400, detail="BOM does not belong to the given order")
    st = (bom.status or "").upper()
    if st not in {"APPROVED", "FROZEN"}:
        raise HTTPException(status_code=400, detail="BOM must be approved or frozen before production material issue")

    ord_row = await db.get(Order, body.order_id)
    if not ord_row or ord_row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")

    wh = await db.get(Warehouse, body.warehouse_id)
    if not wh or wh.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Warehouse not found")

    base_qty = float(bom.order_qty_snapshot or ord_row.quantity or 0) or float(body.covered_order_qty)
    if base_qty <= 0:
        base_qty = float(body.covered_order_qty)

    line_payloads: list[dict] = []
    any_over = False
    for ln in body.lines:
        bl = await db.get(BomItem, ln.bom_line_id)
        if not bl or bl.tenant_id != tenant.id or bl.bom_id != bom.id:
            raise HTTPException(status_code=400, detail=f"Invalid BOM line {ln.bom_line_id}")
        if bl.item_id is None:
            raise HTTPException(status_code=400, detail=f"BOM line {bl.id} has no item")
        actual = _to_float(ln.actual_issue_qty)
        if actual <= 0:
            raise HTTPException(status_code=400, detail="actual_issue_qty must be greater than 0")

        std_gross = _scale_line_qty_for_covered(
            float(bl.required_gross_qty) if bl.required_gross_qty is not None else None,
            base_qty,
            body.covered_order_qty,
        )
        if std_gross <= 0 and bl.bom_gross_consumption_per_unit is not None:
            std_gross = float(bl.bom_gross_consumption_per_unit) * float(body.covered_order_qty)

        planned_w = _scale_line_qty_for_covered(
            float(bl.wastage_qty) if bl.wastage_qty is not None else None,
            base_qty,
            body.covered_order_qty,
        )
        planned_l = _scale_line_qty_for_covered(
            float(bl.process_loss_qty) if bl.process_loss_qty is not None else None,
            base_qty,
            body.covered_order_qty,
        )

        tol_limit = std_gross * (1.0 + CONSUMPTION_TOLERANCE_PCT / 100.0) if std_gross > 0 else None
        need_mgr = tol_limit is not None and actual > tol_limit + 1e-9
        if need_mgr:
            any_over = True

        var = actual - std_gross
        var_pct = (var / std_gross * 100.0) if std_gross > 1e-9 else None
        line_payloads.append(
            {
                "bl": bl,
                "actual": actual,
                "std": std_gross,
                "planned_w": planned_w,
                "planned_l": planned_l,
                "need_mgr": need_mgr,
                "var": var,
                "var_pct": var_pct,
                "raw_qty_str": ln.actual_issue_qty,
            }
        )

    if any_over:
        await assert_delegate_manager_or_permission(
            db, user, tenant.id, permission_key=PERMISSION_INVENTORY_OVER_ISSUE_APPROVE
        )

    issue_code = await next_tenant_code(
        db, model=ProductionMaterialIssue, tenant_id=tenant.id, prefix="PMI-", width=4
    )
    pmi = ProductionMaterialIssue(
        tenant_id=tenant.id,
        issue_code=issue_code,
        order_id=body.order_id,
        bom_id=body.bom_id,
        production_stage=body.production_stage,
        covered_order_qty=body.covered_order_qty,
        warehouse_id=body.warehouse_id,
        issue_date=body.issue_date or date.today(),
        status="POSTED",
        approval_status="MANAGER_OK" if any_over else "AUTO",
        notes=body.notes,
        created_by_user_id=user.id,
    )
    db.add(pmi)
    await db.flush()

    for p in line_payloads:
        bl = p["bl"]
        item_id = int(bl.item_id)
        avail = await _on_hand_qty(db, tenant.id, item_id, body.warehouse_id)
        if avail + 1e-9 < p["actual"]:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient stock for item {item_id}. Available={avail}, required={p['actual']}",
            )
        mv = StockMovement(
            tenant_id=tenant.id,
            item_id=item_id,
            warehouse_id=body.warehouse_id,
            movement_type="OUT",
            quantity=str(p["actual"]),
            reference_type="PRODUCTION_MATERIAL_ISSUE",
            reference_id=pmi.id,
            notes=f"PMI {issue_code} ({body.production_stage})",
            created_by_user_id=user.id,
            movement_kind="PROD_ISSUE",
            order_id=body.order_id,
            bom_id=bom.id,
            bom_line_id=bl.id,
            production_material_issue_id=pmi.id,
        )
        db.add(mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, mv)
        await post_consumption_issue_gl(db, tenant.id, user.id, mv.id)

        def _fmt_qty(x: float) -> str:
            s = f"{x:.6f}".rstrip("0").rstrip(".")
            return s or "0"

        pmil = ProductionMaterialIssueLine(
            tenant_id=tenant.id,
            issue_id=pmi.id,
            bom_line_id=bl.id,
            item_id=item_id,
            standard_qty_for_covered=_fmt_qty(p["std"]),
            planned_wastage_qty=_fmt_qty(p["planned_w"]) if p["planned_w"] else None,
            planned_process_loss_qty=_fmt_qty(p["planned_l"]) if p["planned_l"] else None,
            actual_issue_qty=p["raw_qty_str"],
            variance_qty=_fmt_qty(p["var"]),
            variance_pct=f"{p['var_pct']:.4f}" if p["var_pct"] is not None else None,
            variance_type="OVER_STANDARD" if p["var"] > 0 else ("UNDER_STANDARD" if p["var"] < 0 else None),
            approval_required=bool(p["need_mgr"]),
            stock_movement_id=mv.id,
        )
        db.add(pmil)

    pm_lines = list(
        (
            await db.execute(
                select(ProductionMaterialIssueLine).where(ProductionMaterialIssueLine.issue_id == pmi.id)
            )
        )
        .scalars()
        .all()
    )
    sign_production_material_issue(pmi, pm_lines)
    await db.commit()
    await db.refresh(pmi)
    return pmi


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
    oid = body.source_order_id or body.linked_order_id
    if oid:
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=int(oid))
        await db.commit()
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
    oid = row.source_order_id or row.linked_order_id
    if oid:
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=int(oid))
        await db.commit()
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
        movement_kind="PROCESS_INPUT",
        process_order_id=row.id,
        order_id=row.source_order_id or row.linked_order_id,
        bom_id=row.source_bom_id,
        vendor_id=row.vendor_id,
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
    cost_lines = list(
        (
            await db.execute(
                select(ProcessOrderCostLine).where(ProcessOrderCostLine.process_order_id == row.id)
            )
        )
        .scalars()
        .all()
    )
    sign_process_order(row, cost_lines)
    await db.commit()
    await db.refresh(row)
    oid = row.source_order_id or row.linked_order_id
    if oid:
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=int(oid))
        await db.commit()
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
    proc_total = _to_float(body.processing_charges or "0")
    cost_line_rows = (
        await db.execute(
            select(ProcessOrderCostLine).where(
                ProcessOrderCostLine.tenant_id == tenant.id,
                ProcessOrderCostLine.process_order_id == row.id,
            )
        )
    ).scalars().all()
    add_on = sum(_to_float(cl.amount) for cl in cost_line_rows)
    knitting_family = (row.process_type or "").strip().lower() == "knitting"
    knitting_method = (row.process_method or "in_house").strip().lower()
    proc_in_inventory_cost = (
        0.0 if (knitting_family and knitting_method == "jobwork_customer") else proc_total
    )
    uc = (input_cost + proc_in_inventory_cost + add_on) / actual_qty if actual_qty > 0 else 0.0
    out_wh = row.output_warehouse_id or row.warehouse_id
    if out_wh is None:
        raise HTTPException(status_code=400, detail="Output warehouse is required before receiving process output")
    inp_qty = _to_float(row.input_quantity)
    row.actual_loss_qty = str(max(0.0, round(inp_qty - actual_qty, 6)))
    po_in = StockMovement(
        tenant_id=tenant.id,
        item_id=row.output_item_id,
        warehouse_id=out_wh,
        movement_type="IN",
        quantity=str(actual_qty),
        reference_type="PROCESS_ORDER",
        reference_id=row.id,
        notes=f"Receive output for {row.process_number}",
        created_by_user_id=user.id,
        movement_kind="PROCESS_OUTPUT",
        process_order_id=row.id,
        order_id=row.source_order_id or row.linked_order_id,
        bom_id=row.source_bom_id,
        vendor_id=row.vendor_id,
    )
    db.add(po_in)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, po_in, in_unit_cost=uc)
    row.actual_output_qty = str(actual_qty)
    row.processing_charges = body.processing_charges or "0"
    recv_date = date.today()

    from app.modules.production.knitting_finance_service import (
        maybe_post_knitting_subcontract_accrual_before_receive_gl,
    )

    if knitting_family:
        await maybe_post_knitting_subcontract_accrual_before_receive_gl(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            po=row,
            knitting_charge_amount=proc_total,
            movement_date=recv_date,
        )

    row.status = "RECEIVED"
    await post_process_order_receive_gl(
        db,
        tenant.id,
        user.id,
        row.id,
        row.output_item_id,
        f"Receive output for {row.process_number}",
    )

    from app.modules.production.knitting_finance_service import maybe_post_knitting_jobwork_revenue_after_receive_gl

    if knitting_family:
        await maybe_post_knitting_jobwork_revenue_after_receive_gl(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            po=row,
            knitting_charge_amount=proc_total,
            movement_date=recv_date,
        )

    cost_lines = list(
        (
            await db.execute(
                select(ProcessOrderCostLine).where(ProcessOrderCostLine.process_order_id == row.id)
            )
        )
        .scalars()
        .all()
    )
    sign_process_order(row, cost_lines)
    await db.commit()
    await db.refresh(row)
    oid = row.source_order_id or row.linked_order_id
    if oid:
        from app.modules.orders.pipeline_service import auto_advance_order_pipeline

        await auto_advance_order_pipeline(db, tenant_id=tenant.id, order_id=int(oid))
        await db.commit()
    return row


@router.post("/process-orders/{process_order_id}/cost-lines")
async def add_process_order_cost_line(
    process_order_id: int,
    body: ProcessOrderCostLineBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    if row.status not in {"DRAFT", "ISSUED"}:
        raise HTTPException(status_code=400, detail="Cost lines can only be added while process order is draft or issued")
    amt = _to_float(body.amount)
    if amt < 0:
        raise HTTPException(status_code=400, detail="amount must be non-negative")
    ln = ProcessOrderCostLine(
        tenant_id=tenant.id,
        process_order_id=row.id,
        cost_type=(body.cost_type or "ADD_ON").strip() or "ADD_ON",
        description=body.description,
        amount=str(amt),
        vendor_id=body.vendor_id,
        currency=body.currency,
        remarks=body.remarks,
    )
    db.add(ln)
    await db.commit()
    await db.refresh(ln)
    return {"id": ln.id, "process_order_id": row.id, "amount": ln.amount, "cost_type": ln.cost_type}


@router.post("/process-orders/{process_order_id}/approve", response_model=ProcessOrderOut)
async def approve_process_order(
    process_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_delegate_manager_or_permission(
        db, user, tenant.id, permission_key=PERMISSION_INVENTORY_PROCESS_ORDER_APPROVE
    )
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    if row.status != "RECEIVED":
        raise HTTPException(status_code=400, detail="Only received process order can be approved")
    row.status = "APPROVED"
    cost_lines = list(
        (
            await db.execute(
                select(ProcessOrderCostLine).where(ProcessOrderCostLine.process_order_id == row.id)
            )
        )
        .scalars()
        .all()
    )
    sign_process_order(row, cost_lines)
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
    bom_line_id: int | None = None


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
    production_material_issues_total: int = 0
    vendor_bills_draft: int = 0
    vendor_bills_posted: int = 0
    stock_movements_total: int = 0


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

    bom_row = (
        await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant.id,
                Bom.order_id == body.order_id,
                Bom.is_active.is_(True),
            )
        )
    ).scalars().first()
    bom_id: int | None = bom_row.id if bom_row else None
    bom_line_id: int | None = body.bom_line_id
    if body.bom_line_id is not None:
        bl = await db.get(BomItem, body.bom_line_id)
        if not bl or bl.tenant_id != tenant.id:
            raise HTTPException(status_code=400, detail="Invalid bom_line_id")
        if bom_row is not None and bl.bom_id != bom_row.id:
            raise HTTPException(status_code=400, detail="BOM line does not belong to the active order BOM")
        bom_id = bl.bom_id

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
        movement_kind="CONSUMPTION_ISSUE",
        order_id=body.order_id,
        bom_id=bom_id,
        bom_line_id=bom_line_id,
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
    pmi_n = (
        await db.execute(
            select(func.count()).select_from(ProductionMaterialIssue).where(ProductionMaterialIssue.tenant_id == tenant.id)
        )
    ).scalar() or 0
    vb_rows = list((await db.execute(select(VendorBill).where(VendorBill.tenant_id == tenant.id))).scalars().all())
    sm_n = (
        await db.execute(select(func.count()).select_from(StockMovement).where(StockMovement.tenant_id == tenant.id))
    ).scalar() or 0
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
        production_material_issues_total=int(pmi_n),
        vendor_bills_draft=len([b for b in vb_rows if (b.status or "").upper() == "DRAFT"]),
        vendor_bills_posted=len([b for b in vb_rows if (b.status or "").upper() == "POSTED"]),
        stock_movements_total=int(sm_n),
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
    from decimal import Decimal

    from app.common.money import parse_money
    from app.models import ConsumptionPlanItem

    row = await db.get(ConsumptionChangeRequest, request_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Change request not found")
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending request can be approved")

    items = json.loads(row.items_json or "[]")
    for item in items:
        plan_item_id = int(item.get("plan_item_id") or 0)
        new_dec = parse_money(str(item.get("new_qty") or "0"))
        cpi = await db.get(ConsumptionPlanItem, plan_item_id)
        if cpi and cpi.tenant_id == tenant.id:
            cpi.required_qty = new_dec if new_dec is not None else Decimal("0")

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
    verification_id: str | None = None
    signature_hash: str | None = None
    signed_at: datetime | None = None


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
        verification_id=getattr(row, "verification_id", None),
        signature_hash=getattr(row, "signature_hash", None),
        signed_at=getattr(row, "signed_at", None),
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
    sign_warehouse_transfer(row, lines)
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


def _print_tenant_dict(t: Tenant) -> dict:
    return {
        "name": t.name,
        "company_code": t.company_code,
        "domain": t.domain,
        "address": getattr(t, "address", None),
    }


@router.get("/documents/verify/{verification_id}")
async def verify_inventory_document_by_verification_id(
    verification_id: str,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    result = await verify_inventory_document(db, tenant.id, verification_id)
    if not result:
        raise HTTPException(status_code=404, detail="Verification record not found")
    return result


@router.post("/documents/backfill-signatures")
async def inventory_documents_backfill_signatures(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    counts = await backfill_signatures_for_tenant(db, tenant.id)
    return {"ok": True, "signed": counts}


@router.get("/delivery-challans/{challan_id}", response_model=DeliveryChallanOut)
async def get_delivery_challan(
    challan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(DeliveryChallan, challan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Delivery challan not found")
    lines = list(
        (await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id)))
        .scalars()
        .all()
    )
    oids = list(
        dict.fromkeys(
            r[0]
            for r in (
                await db.execute(
                    select(DeliveryChallanOrder.order_id).where(
                        DeliveryChallanOrder.tenant_id == tenant.id,
                        DeliveryChallanOrder.delivery_challan_id == row.id,
                    )
                )
            ).all()
        )
    )
    return _delivery_challan_to_out(row, lines, order_ids=oids)


@router.get("/delivery-challans/{challan_id}/gl-postings")
async def delivery_challan_gl_postings(
    challan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(DeliveryChallan, challan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Delivery challan not found")
    return await list_gl_postings_for_inventory_doc(db, tenant.id, "DELIVERY_CHALLAN", challan_id)


@router.get("/delivery-challans/{challan_id}/print-data")
async def delivery_challan_print_data(
    challan_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(DeliveryChallan, challan_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Delivery challan not found")
    lines = list(
        (await db.execute(select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == row.id)))
        .scalars()
        .all()
    )
    if not getattr(row, "verification_id", None):
        oids = list(
            (
                await db.execute(
                    select(DeliveryChallanOrder.order_id).where(
                        DeliveryChallanOrder.tenant_id == tenant.id,
                        DeliveryChallanOrder.delivery_challan_id == row.id,
                    )
                )
            )
            .scalars()
            .all()
        )
        sign_delivery_challan(row, lines, oids)
        await db.commit()
        await db.refresh(row)
    item_ids = {ln.item_id for ln in lines}
    items_map: dict[int, Item] = {}
    for iid in item_ids:
        it = await db.get(Item, iid)
        if it and it.tenant_id == tenant.id:
            items_map[iid] = it
    wh_ids = {ln.warehouse_id for ln in lines}
    wh_map: dict[int, str] = {}
    for wid in wh_ids:
        w = await db.get(Warehouse, wid)
        if w:
            wh_map[wid] = w.name
    vid = getattr(row, "verification_id", None) or ""
    verification_path = f"{get_settings().api_v1_prefix}/inventory/documents/verify/{vid}" if vid else None
    return {
        "tenant": _print_tenant_dict(tenant),
        "document_type": "DELIVERY_CHALLAN",
        "document": {
            "id": row.id,
            "challan_code": row.challan_code,
            "customer_name": row.customer_name,
            "delivery_date": row.delivery_date.isoformat() if row.delivery_date else None,
            "status": row.status,
            "notes": row.notes,
            "verification_id": getattr(row, "verification_id", None),
            "signature_hash": getattr(row, "signature_hash", None),
            "signed_at": row.signed_at.isoformat() if getattr(row, "signed_at", None) else None,
        },
        "lines": [
            {
                "item_code": items_map.get(ln.item_id).item_code if items_map.get(ln.item_id) else str(ln.item_id),
                "item_name": items_map.get(ln.item_id).name if items_map.get(ln.item_id) else "",
                "warehouse": wh_map.get(ln.warehouse_id, str(ln.warehouse_id)),
                "quantity": str(ln.quantity),
            }
            for ln in lines
        ],
        "verification_path": verification_path,
        "print_meta": {
            "generated_at": datetime.utcnow().isoformat(),
            "title": "Delivery Challan",
            "copy_labels": ["Original", "Duplicate", "Triplicate"],
        },
    }


@router.get("/enhanced-gate-passes/{gate_pass_id}", response_model=GatePassOut)
async def get_enhanced_gate_pass(
    gate_pass_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(EnhancedGatePass, gate_pass_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    return row


@router.get("/enhanced-gate-passes/{gate_pass_id}/gl-postings")
async def gate_pass_gl_postings(
    gate_pass_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(EnhancedGatePass, gate_pass_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    return await list_gl_postings_for_inventory_doc(db, tenant.id, "ENHANCED_GATE_PASS", gate_pass_id)


@router.get("/enhanced-gate-passes/{gate_pass_id}/print-data")
async def gate_pass_print_data(
    gate_pass_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(EnhancedGatePass, gate_pass_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Gate pass not found")
    challan_code = None
    if row.challan_id:
        dc = await db.get(DeliveryChallan, row.challan_id)
        if dc and dc.tenant_id == tenant.id:
            challan_code = dc.challan_code
    if not getattr(row, "verification_id", None):
        sign_gate_pass(row)
        await db.commit()
        await db.refresh(row)
    vid = getattr(row, "verification_id", None) or ""
    verification_path = f"{get_settings().api_v1_prefix}/inventory/documents/verify/{vid}" if vid else None
    return {
        "tenant": _print_tenant_dict(tenant),
        "document_type": "GATE_PASS",
        "document": {
            "id": row.id,
            "gate_pass_code": row.gate_pass_code,
            "challan_id": row.challan_id,
            "linked_challan_code": challan_code,
            "purpose": row.purpose,
            "destination": row.destination,
            "vehicle_no": row.vehicle_no,
            "status": row.status,
            "guard_acknowledged": row.guard_acknowledged,
            "notes": row.notes,
            "verification_id": getattr(row, "verification_id", None),
            "signature_hash": getattr(row, "signature_hash", None),
            "signed_at": row.signed_at.isoformat() if getattr(row, "signed_at", None) else None,
        },
        "lines": [],
        "verification_path": verification_path,
        "print_meta": {
            "generated_at": datetime.utcnow().isoformat(),
            "title": "Gate Pass",
            "copy_labels": ["Original", "Duplicate", "Triplicate"],
        },
    }


@router.get("/goods-receiving/{grn_id}/gl-postings")
async def grn_gl_postings(
    grn_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(GoodsReceiving, grn_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="GRN not found")
    return await list_gl_postings_for_inventory_doc(db, tenant.id, "GOODS_RECEIVING", grn_id)


@router.get("/production-material-issues/{issue_id}", response_model=ProductionMaterialIssueDetailOut)
async def get_production_material_issue(
    issue_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProductionMaterialIssue, issue_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Production material issue not found")
    lines = list(
        (
            await db.execute(
                select(ProductionMaterialIssueLine).where(ProductionMaterialIssueLine.issue_id == row.id)
            )
        )
        .scalars()
        .all()
    )
    base = ProductionMaterialIssueOut.model_validate(row)
    return ProductionMaterialIssueDetailOut(
        **base.model_dump(),
        lines=[ProductionMaterialIssueLineOut.model_validate(x) for x in lines],
    )


@router.get("/production-material-issues/{issue_id}/gl-postings")
async def pmi_gl_postings(
    issue_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProductionMaterialIssue, issue_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Production material issue not found")
    return await list_gl_postings_for_inventory_doc(db, tenant.id, "PRODUCTION_MATERIAL_ISSUE", issue_id)


@router.get("/production-material-issues/{issue_id}/print-data")
async def pmi_print_data(
    issue_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProductionMaterialIssue, issue_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Production material issue not found")
    lines = list(
        (
            await db.execute(
                select(ProductionMaterialIssueLine).where(ProductionMaterialIssueLine.issue_id == row.id)
            )
        )
        .scalars()
        .all()
    )
    item_map: dict[int, Item] = {}
    for ln in lines:
        if ln.item_id not in item_map:
            it = await db.get(Item, ln.item_id)
            if it and it.tenant_id == tenant.id:
                item_map[ln.item_id] = it
    wh = await db.get(Warehouse, row.warehouse_id)
    vid = getattr(row, "verification_id", None) or ""
    verification_path = f"{get_settings().api_v1_prefix}/inventory/documents/verify/{vid}" if vid else None
    return {
        "tenant": _print_tenant_dict(tenant),
        "document_type": "PRODUCTION_MATERIAL_ISSUE",
        "document": {
            "id": row.id,
            "issue_code": row.issue_code,
            "order_id": row.order_id,
            "bom_id": row.bom_id,
            "production_stage": row.production_stage,
            "covered_order_qty": row.covered_order_qty,
            "warehouse_name": wh.name if wh else str(row.warehouse_id),
            "issue_date": row.issue_date.isoformat() if row.issue_date else None,
            "status": row.status,
            "notes": row.notes,
            "verification_id": getattr(row, "verification_id", None),
            "signature_hash": getattr(row, "signature_hash", None),
            "signed_at": row.signed_at.isoformat() if getattr(row, "signed_at", None) else None,
        },
        "lines": [
            {
                "item_code": item_map.get(ln.item_id).item_code if item_map.get(ln.item_id) else str(ln.item_id),
                "item_name": item_map.get(ln.item_id).name if item_map.get(ln.item_id) else "",
                "bom_line_id": ln.bom_line_id,
                "actual_issue_qty": str(ln.actual_issue_qty),
                "variance_qty": ln.variance_qty,
            }
            for ln in lines
        ],
        "verification_path": verification_path,
        "print_meta": {
            "generated_at": datetime.utcnow().isoformat(),
            "title": "Production Material Issue",
            "copy_labels": ["Original", "Duplicate", "Triplicate"],
        },
    }


@router.get("/process-orders/{process_order_id}/gl-postings")
async def process_order_gl_postings(
    process_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    return await list_gl_postings_for_inventory_doc(db, tenant.id, "PROCESS_ORDER", process_order_id)


@router.get("/process-orders/{process_order_id}/print-data")
async def process_order_print_data(
    process_order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ProcessOrder, process_order_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Process order not found")
    inp = await db.get(Item, row.input_item_id)
    outp = await db.get(Item, row.output_item_id)
    cost_lines = list(
        (
            await db.execute(
                select(ProcessOrderCostLine).where(ProcessOrderCostLine.process_order_id == row.id)
            )
        )
        .scalars()
        .all()
    )
    vid = getattr(row, "verification_id", None) or ""
    verification_path = f"{get_settings().api_v1_prefix}/inventory/documents/verify/{vid}" if vid else None
    return {
        "tenant": _print_tenant_dict(tenant),
        "document_type": "PROCESS_ORDER",
        "document": {
            "id": row.id,
            "process_number": row.process_number,
            "process_type": row.process_type,
            "status": row.status,
            "input_item_code": inp.item_code if inp else str(row.input_item_id),
            "input_item_name": inp.name if inp else "",
            "output_item_code": outp.item_code if outp else str(row.output_item_id),
            "output_item_name": outp.name if outp else "",
            "input_quantity": str(row.input_quantity),
            "expected_output_qty": str(row.expected_output_qty),
            "actual_output_qty": str(row.actual_output_qty) if row.actual_output_qty else None,
            "processing_charges": str(row.processing_charges),
            "remarks": row.remarks,
            "verification_id": getattr(row, "verification_id", None),
            "signature_hash": getattr(row, "signature_hash", None),
            "signed_at": row.signed_at.isoformat() if getattr(row, "signed_at", None) else None,
        },
        "lines": [
            {
                "cost_type": cl.cost_type,
                "description": cl.description,
                "amount": str(cl.amount),
            }
            for cl in cost_lines
        ],
        "verification_path": verification_path,
        "print_meta": {
            "generated_at": datetime.utcnow().isoformat(),
            "title": "Process Order",
            "copy_labels": ["Original", "Duplicate", "Triplicate"],
        },
    }


@router.get("/warehouse-transfers/{transfer_id}/gl-postings")
async def warehouse_transfer_gl_postings(
    transfer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(WarehouseTransfer, transfer_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Transfer not found")
    return await list_gl_postings_for_inventory_doc(db, tenant.id, "WAREHOUSE_TRANSFER", transfer_id)


@router.get("/warehouse-transfers/{transfer_id}/print-data")
async def warehouse_transfer_print_data(
    transfer_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(WarehouseTransfer, transfer_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Transfer not found")
    lines = list(
        (
            await db.execute(
                select(WarehouseTransferLine).where(WarehouseTransferLine.transfer_id == row.id)
            )
        )
        .scalars()
        .all()
    )
    wf = await db.get(Warehouse, row.from_warehouse_id)
    wt = await db.get(Warehouse, row.to_warehouse_id)
    item_map: dict[int, Item] = {}
    for ln in lines:
        if ln.item_id not in item_map:
            it = await db.get(Item, ln.item_id)
            if it and it.tenant_id == tenant.id:
                item_map[ln.item_id] = it
    vid = getattr(row, "verification_id", None) or ""
    verification_path = f"{get_settings().api_v1_prefix}/inventory/documents/verify/{vid}" if vid else None
    return {
        "tenant": _print_tenant_dict(tenant),
        "document_type": "WAREHOUSE_TRANSFER",
        "document": {
            "id": row.id,
            "transfer_code": row.transfer_code,
            "from_warehouse": wf.name if wf else str(row.from_warehouse_id),
            "to_warehouse": wt.name if wt else str(row.to_warehouse_id),
            "transfer_date": row.transfer_date.isoformat() if row.transfer_date else None,
            "status": row.status,
            "notes": row.notes,
            "verification_id": getattr(row, "verification_id", None),
            "signature_hash": getattr(row, "signature_hash", None),
            "signed_at": row.signed_at.isoformat() if getattr(row, "signed_at", None) else None,
        },
        "lines": [
            {
                "item_code": item_map.get(ln.item_id).item_code if item_map.get(ln.item_id) else str(ln.item_id),
                "item_name": item_map.get(ln.item_id).name if item_map.get(ln.item_id) else "",
                "quantity": str(ln.quantity),
            }
            for ln in lines
        ],
        "verification_path": verification_path,
        "print_meta": {
            "generated_at": datetime.utcnow().isoformat(),
            "title": "Warehouse Transfer",
            "copy_labels": ["Original", "Duplicate", "Triplicate"],
        },
    }


from app.modules.inventory.vendor_ai_router import router as _vendor_ai_router

router.include_router(_vendor_ai_router, prefix="/vendors/ai", tags=["inventory-vendors-ai"])

