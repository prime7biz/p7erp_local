"""Merch wastage reporting: thresholds, transactions, exports, order detail."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from io import BytesIO

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AlertRelatedEntity,
    Bom,
    BomItem,
    Customer,
    GarmentStyle,
    Item,
    ItemCategory,
    Order,
    Quotation,
    StockMovement,
    Tenant,
    User,
    WastageOrderSummary,
    WastageReason,
    WastageSavedView,
    WastageThresholdRule,
    WastageTransaction,
)
from app.modules.merch import constants as merch_c
from app.modules.merch.bom_utils import GOVERNED_BOM_STATUSES, get_latest_governed_bom
from app.modules.merch.deps import ensure_tenant as _ensure_tenant, to_float_safe as _to_float_safe
from app.modules.merch.material_helpers import material_group_from_item

router = APIRouter(tags=["merch"])

# ---------- Phase E: Wastage reporting ----------


DEFAULT_WASTAGE_THRESHOLD_PCT = merch_c.DEFAULT_WASTAGE_THRESHOLD_PCT


class WastageReportRowOut(BaseModel):
    order_id: int
    order_code: str
    order_date: date | None
    delivery_date: date | None
    buyer_id: int
    buyer_name: str
    style_id: int
    style_code: str
    item_id: int
    item_code: str
    item_name: str
    category: str  # fabric | trim | other
    expected_qty: float
    actual_qty: float
    wastage_pct_vs_bom: float  # (actual - expected) / expected * 100 when expected > 0
    wastage_value: float  # max(0, actual - expected) * unit_cost
    allowed_threshold_pct: float
    threshold_breach: bool


def _resolve_wastage_threshold_pct(
    rules: list[WastageThresholdRule],
    customer_id: int | None,
) -> float:
    """Resolve allowed_pct from threshold rules: buyer match first, then tenant-wide. Default 15%."""
    allowed = DEFAULT_WASTAGE_THRESHOLD_PCT
    for r in rules:
        if r.scope_type == "tenant" and r.scope_id is None:
            allowed = float(r.allowed_pct)
        if r.scope_type == "buyer" and r.scope_id is not None and r.scope_id == customer_id:
            allowed = float(r.allowed_pct)
            break
    return allowed


@router.get("/reports/wastage", response_model=list[WastageReportRowOut])
async def get_wastage_report(
    order_id: int | None = Query(default=None, description="Filter by order"),
    style_id: int | None = Query(default=None, description="Filter by style"),
    buyer_id: int | None = Query(default=None, description="Filter by buyer (customer)"),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    threshold_pct: float | None = Query(default=None, description="Only rows where wastage % above this"),
    above_threshold_only: bool = Query(default=False, description="Only rows above default 15% threshold"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Report actual issued consumption vs BOM expected by order/item. Actual = CONSUMPTION_ISSUE movements; expected = order qty × BOM base × (1 + wastage%). Returns wastage value and threshold breach for profitability control."""
    _ensure_tenant(user, tenant)
    # Load threshold rules for tenant (used to resolve allowed_pct per order)
    thr_result = await db.execute(
        select(WastageThresholdRule).where(WastageThresholdRule.tenant_id == tenant.id)
    )
    threshold_rules = list(thr_result.scalars().all())
    mov_result = await db.execute(
        select(StockMovement.reference_id).where(
            StockMovement.tenant_id == tenant.id,
            StockMovement.reference_type == "CONSUMPTION_ISSUE",
            StockMovement.reference_id.isnot(None),
        ).distinct()
    )
    oids = [x for x in mov_result.scalars().all() if x is not None]
    if not oids:
        return []
    stmt = select(Order).where(Order.tenant_id == tenant.id, Order.id.in_(oids))
    if order_id is not None:
        stmt = stmt.where(Order.id == order_id)
    if buyer_id is not None:
        stmt = stmt.where(Order.customer_id == buyer_id)
    if date_from is not None:
        stmt = stmt.where(Order.order_date >= date_from)
    if date_to is not None:
        stmt = stmt.where(Order.order_date <= date_to)
    orders_result = await db.execute(stmt)
    orders = list(orders_result.scalars().all())
    if not orders:
        return []
    out: list[WastageReportRowOut] = []

    qids = {o.quotation_id for o in orders if o.quotation_id}
    quotations: dict[int, Quotation] = {}
    if qids:
        qr = await db.execute(select(Quotation).where(Quotation.id.in_(qids)))
        quotations = {q.id: q for q in qr.scalars().all()}
    style_ids = {q.style_id for q in quotations.values() if q.style_id}
    styles_map: dict[int, GarmentStyle] = {}
    if style_ids:
        sr = await db.execute(select(GarmentStyle).where(GarmentStyle.id.in_(style_ids)))
        styles_map = {s.id: s for s in sr.scalars().all()}
    cids = {o.customer_id for o in orders if o.customer_id}
    customers: dict[int, Customer] = {}
    if cids:
        cr = await db.execute(select(Customer).where(Customer.id.in_(cids)))
        customers = {c.id: c for c in cr.scalars().all()}

    bom_by_style: dict[int, Bom] = {}
    if style_ids:
        br = await db.execute(
            select(Bom).where(
                Bom.tenant_id == tenant.id,
                Bom.style_id.in_(style_ids),
                Bom.status.in_(GOVERNED_BOM_STATUSES),
            )
        )
        for b in br.scalars().all():
            cur = bom_by_style.get(b.style_id)
            if cur is None or (b.version_no or 0) > (cur.version_no or 0):
                bom_by_style[b.style_id] = b

    bom_ids = [b.id for b in bom_by_style.values()]
    bom_lines_by_bom: dict[int, list[BomItem]] = defaultdict(list)
    if bom_ids:
        blr = await db.execute(
            select(BomItem).where(
                BomItem.tenant_id == tenant.id,
                BomItem.bom_id.in_(bom_ids),
                BomItem.item_id.isnot(None),
            )
        )
        for bi in blr.scalars().all():
            bom_lines_by_bom[bi.bom_id].append(bi)

    all_item_ids = {bi.item_id for lines in bom_lines_by_bom.values() for bi in lines if bi.item_id}
    items_map: dict[int, Item] = {}
    if all_item_ids:
        ir = await db.execute(select(Item).where(Item.tenant_id == tenant.id, Item.id.in_(all_item_ids)))
        items_map = {i.id: i for i in ir.scalars().all()}
    cat_ids = {it.category_id for it in items_map.values() if it.category_id}
    categories: dict[int, ItemCategory] = {}
    if cat_ids:
        catr = await db.execute(select(ItemCategory).where(ItemCategory.id.in_(cat_ids)))
        categories = {c.id: c for c in catr.scalars().all()}

    order_id_list = [o.id for o in orders]
    mov_map: dict[tuple[int, int], list[StockMovement]] = defaultdict(list)
    if order_id_list:
        movr = await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.reference_type == "CONSUMPTION_ISSUE",
                StockMovement.reference_id.in_(order_id_list),
            )
        )
        for m in movr.scalars().all():
            if m.reference_id is not None and m.item_id is not None:
                mov_map[(m.reference_id, m.item_id)].append(m)

    for order in orders:
        allowed_pct = _resolve_wastage_threshold_pct(threshold_rules, order.customer_id)
        if not order.quotation_id:
            continue
        quotation = quotations.get(order.quotation_id)
        if not quotation or quotation.tenant_id != tenant.id or not quotation.style_id:
            continue
        sid = quotation.style_id
        if style_id is not None and sid != style_id:
            continue
        style = styles_map.get(sid)
        style_code = style.style_code if style else str(sid)
        customer = customers.get(order.customer_id) if order.customer_id else None
        buyer_name = customer.name if customer else f"Customer #{order.customer_id}"
        order_qty = _to_float_safe(str(order.quantity)) if order.quantity is not None else 0.0
        if order_qty <= 0:
            continue
        bom = bom_by_style.get(sid)
        if not bom:
            continue
        for line in bom_lines_by_bom.get(bom.id, []):
            item = items_map.get(line.item_id)
            if not item or item.tenant_id != tenant.id:
                continue
            cat = categories.get(item.category_id) if item.category_id else None
            category = material_group_from_item(item, cat)
            base = _to_float_safe(line.base_consumption)
            wastage = _to_float_safe(line.wastage_pct) / 100.0
            expected = order_qty * base * (1.0 + wastage)
            actual = sum(
                _to_float_safe(m.quantity)
                for m in mov_map.get((order.id, line.item_id), [])
                if (m.movement_type or "").upper() == "OUT"
            )
            if expected <= 0:
                wastage_pct = 0.0
            else:
                wastage_pct = round((actual - expected) / expected * 100.0, 2)
            use_threshold = threshold_pct if threshold_pct is not None else (allowed_pct if above_threshold_only else None)
            if use_threshold is not None and wastage_pct < use_threshold:
                continue
            unit_cost = _to_float_safe(item.default_cost)
            variance_qty = max(0.0, actual - expected)
            wastage_value = round(variance_qty * unit_cost, 2)
            threshold_breach = wastage_pct > allowed_pct
            out.append(
                WastageReportRowOut(
                    order_id=order.id,
                    order_code=order.order_code,
                    order_date=order.order_date,
                    delivery_date=order.delivery_date,
                    buyer_id=order.customer_id,
                    buyer_name=buyer_name,
                    style_id=sid,
                    style_code=style_code,
                    item_id=line.item_id,
                    item_code=item.item_code,
                    item_name=item.name or item.description or "",
                    category=category,
                    expected_qty=round(expected, 4),
                    actual_qty=round(actual, 4),
                    wastage_pct_vs_bom=wastage_pct,
                    wastage_value=wastage_value,
                    allowed_threshold_pct=allowed_pct,
                    threshold_breach=threshold_breach,
                )
            )
    return out


@router.get("/reports/wastage/summary")
async def get_wastage_summary(
    style_id: int | None = Query(default=None),
    buyer_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate wastage: KPIs (total value, fabric/trim avg %, above-threshold count) and by_style."""
    _ensure_tenant(user, tenant)
    rows = await get_wastage_report(
        order_id=None,
        style_id=style_id,
        buyer_id=buyer_id,
        date_from=date_from,
        date_to=date_to,
        threshold_pct=None,
        above_threshold_only=False,
        tenant=tenant,
        user=user,
        db=db,
    )
    total_wastage_value = sum(r.wastage_value for r in rows)
    fabric_pcts = [r.wastage_pct_vs_bom for r in rows if r.category == "fabric"]
    trim_pcts = [r.wastage_pct_vs_bom for r in rows if r.category == "trim"]
    fabric_wastage_pct_avg = round(sum(fabric_pcts) / len(fabric_pcts), 2) if fabric_pcts else 0.0
    trim_wastage_pct_avg = round(sum(trim_pcts) / len(trim_pcts), 2) if trim_pcts else 0.0
    above_threshold_orders_count = len({r.order_id for r in rows if r.threshold_breach})
    by_style: dict[int, list[float]] = {}
    for r in rows:
        by_style.setdefault(r.style_id, []).append(r.wastage_pct_vs_bom)
    by_style_list = [
        {
            "style_id": sid,
            "order_item_count": len(pcts),
            "avg_wastage_pct": round(sum(pcts) / len(pcts), 2) if pcts else 0,
            "max_wastage_pct": round(max(pcts), 2) if pcts else 0,
        }
        for sid, pcts in by_style.items()
    ]
    return {
        "total_wastage_value": round(total_wastage_value, 2),
        "fabric_wastage_pct_avg": fabric_wastage_pct_avg,
        "trim_wastage_pct_avg": trim_wastage_pct_avg,
        "above_threshold_orders_count": above_threshold_orders_count,
        "by_style": by_style_list,
        "total_rows": len(rows),
    }


class WastageReasonOut(BaseModel):
    id: int
    code: str
    name: str
    category: str
    recoverable: bool


# Default wastage reason taxonomy (seed when tenant has none). Same as migration 059.
WASTAGE_REASON_SEED: list[tuple[str, str, str, bool]] = [
    ("marker_cutting", "Marker / cutting wastage", "fabric", False),
    ("spreading", "Spreading wastage", "fabric", False),
    ("end_bit_remnant", "End-bit / remnant wastage", "fabric", True),
    ("thread_overconsumption", "Thread overconsumption", "trim", False),
    ("rework_loss", "Rework loss", "process", False),
    ("rejection_loss", "Rejection loss", "process", False),
    ("excess_issue_vs_standard", "Excess issue vs standard", "store", False),
]


@router.get("/reports/wastage/reasons", response_model=list[WastageReasonOut])
async def get_wastage_reasons(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List wastage reason codes for the tenant (for filters and reason breakdown). Seeds from default taxonomy if empty."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(WastageReason).where(WastageReason.tenant_id == tenant.id).order_by(WastageReason.category, WastageReason.code)
    )
    rows = result.scalars().all()
    if not rows:
        for code, name, category, recoverable in WASTAGE_REASON_SEED:
            r = WastageReason(tenant_id=tenant.id, code=code, name=name, category=category, recoverable=recoverable)
            db.add(r)
        await db.commit()
        result = await db.execute(
            select(WastageReason).where(WastageReason.tenant_id == tenant.id).order_by(WastageReason.category, WastageReason.code)
        )
        rows = result.scalars().all()
    return [
        WastageReasonOut(id=r.id, code=r.code, name=r.name, category=r.category, recoverable=r.recoverable)
        for r in rows
    ]


class WastageTrendSeriesItem(BaseModel):
    label: str
    value: float


class WastageTrendsOut(BaseModel):
    series: list[WastageTrendSeriesItem] | None = None
    by_buyer: list[dict] | None = None  # [{ buyer_id, buyer_name, value }]
    by_material_group: list[dict] | None = None  # [{ category, value }]


@router.get("/reports/wastage/trends", response_model=WastageTrendsOut)
async def get_wastage_trends(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    group_by: str = Query(default="month", description="month | buyer | material_group"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Trends: wastage value grouped by month, buyer, or material group (category)."""
    _ensure_tenant(user, tenant)
    rows = await get_wastage_report(
        order_id=None,
        style_id=None,
        buyer_id=None,
        date_from=date_from,
        date_to=date_to,
        threshold_pct=None,
        above_threshold_only=False,
        tenant=tenant,
        user=user,
        db=db,
    )
    if group_by == "month":
        by_month: dict[str, float] = defaultdict(float)
        for r in rows:
            d = r.order_date
            key = d.strftime("%Y-%m") if d else "unknown"
            by_month[key] += r.wastage_value
        series = [WastageTrendSeriesItem(label=k, value=round(v, 2)) for k, v in sorted(by_month.items())]
        return WastageTrendsOut(series=series)
    if group_by == "buyer":
        by_buyer: dict[int, tuple[str, float]] = {}
        for r in rows:
            if r.buyer_id not in by_buyer:
                by_buyer[r.buyer_id] = (r.buyer_name, 0.0)
            by_buyer[r.buyer_id] = (r.buyer_name, by_buyer[r.buyer_id][1] + r.wastage_value)
        by_buyer_list = [
            {"buyer_id": bid, "buyer_name": name, "value": round(v, 2)}
            for bid, (name, v) in by_buyer.items()
        ]
        return WastageTrendsOut(by_buyer=by_buyer_list)
    if group_by == "material_group":
        by_cat: dict[str, float] = defaultdict(float)
        for r in rows:
            by_cat[r.category] += r.wastage_value
        by_material = [{"category": k, "value": round(v, 2)} for k, v in sorted(by_cat.items())]
        return WastageTrendsOut(by_material_group=by_material)
    return WastageTrendsOut()


class WastageTransactionCreate(BaseModel):
    order_id: int
    item_id: int | None = None
    process_stage: str
    reason_id: int | None = None
    quantity: str = "0"
    unit_cost: str = "0"
    recoverable_value: str = "0"


@router.post("/reports/wastage/transactions")
async def create_wastage_transaction(
    body: WastageTransactionCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Record a wastage transaction for an order (process stage and optional reason)."""
    _ensure_tenant(user, tenant)
    order = await db.get(Order, body.order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    qty = _to_float_safe(body.quantity)
    cost = _to_float_safe(body.unit_cost)
    rec = _to_float_safe(body.recoverable_value)
    value = max(0.0, qty * cost)
    tx = WastageTransaction(
        tenant_id=tenant.id,
        order_id=body.order_id,
        item_id=body.item_id,
        process_stage=body.process_stage,
        reason_id=body.reason_id,
        quantity=body.quantity,
        unit_cost=body.unit_cost,
        value=str(round(value, 2)),
        recoverable_value=body.recoverable_value,
        created_by_id=user.id,
    )
    db.add(tx)
    await db.commit()
    await db.refresh(tx)
    return {"id": tx.id, "order_id": tx.order_id, "value": value}


@router.get("/reports/wastage/export")
async def export_wastage_report(
    order_id: int | None = Query(default=None),
    style_id: int | None = Query(default=None),
    buyer_id: int | None = Query(default=None),
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    format: str = Query(default="xlsx", description="xlsx"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Export wastage report as Excel (same filters as report)."""
    _ensure_tenant(user, tenant)
    rows = await get_wastage_report(
        order_id=order_id,
        style_id=style_id,
        buyer_id=buyer_id,
        date_from=date_from,
        date_to=date_to,
        threshold_pct=None,
        above_threshold_only=False,
        tenant=tenant,
        user=user,
        db=db,
    )
    try:
        from openpyxl import Workbook
    except ImportError:
        raise HTTPException(status_code=500, detail="Excel export not available (openpyxl missing)")
    wb = Workbook()
    ws = wb.active
    if ws is None:
        raise HTTPException(status_code=500, detail="Workbook error")
    ws.title = "Wastage detail"
    headers = [
        "Order ID", "Order Code", "Order Date", "Delivery Date", "Buyer", "Style", "Item Code", "Item Name",
        "Category", "Expected Qty", "Actual Qty", "Wastage %", "Wastage Value", "Threshold Breach",
    ]
    ws.append(headers)
    for r in rows:
        ws.append([
            r.order_id, r.order_code, r.order_date.isoformat() if r.order_date else "", r.delivery_date.isoformat() if r.delivery_date else "",
            r.buyer_name, r.style_code, r.item_code, r.item_name, r.category,
            r.expected_qty, r.actual_qty, r.wastage_pct_vs_bom, r.wastage_value, "Yes" if r.threshold_breach else "No",
        ])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="wastage_report.xlsx"'},
    )


# ---------- Phase 3: thresholds, saved views, management summary ----------


class WastageThresholdRuleOut(BaseModel):
    id: int
    scope_type: str
    scope_id: int | None
    allowed_pct: float
    critical_pct: float


class WastageThresholdRuleCreate(BaseModel):
    scope_type: str  # tenant | buyer | order_type | material_type
    scope_id: int | None = None
    allowed_pct: float
    critical_pct: float


@router.get("/reports/wastage/thresholds", response_model=list[WastageThresholdRuleOut])
async def list_wastage_thresholds(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List wastage threshold rules for the tenant (for badge and config)."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(WastageThresholdRule).where(WastageThresholdRule.tenant_id == tenant.id)
    )
    rows = result.scalars().all()
    return [
        WastageThresholdRuleOut(
            id=r.id,
            scope_type=r.scope_type,
            scope_id=r.scope_id,
            allowed_pct=float(r.allowed_pct),
            critical_pct=float(r.critical_pct),
        )
        for r in rows
    ]


@router.post("/reports/wastage/thresholds", status_code=201, response_model=WastageThresholdRuleOut)
async def create_wastage_threshold(
    body: WastageThresholdRuleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a wastage threshold rule (tenant, buyer, order_type, or material_type scope)."""
    _ensure_tenant(user, tenant)
    row = WastageThresholdRule(
        tenant_id=tenant.id,
        scope_type=body.scope_type,
        scope_id=body.scope_id,
        allowed_pct=body.allowed_pct,
        critical_pct=body.critical_pct,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return WastageThresholdRuleOut(
        id=row.id,
        scope_type=row.scope_type,
        scope_id=row.scope_id,
        allowed_pct=float(row.allowed_pct),
        critical_pct=float(row.critical_pct),
    )


class WastageSavedViewOut(BaseModel):
    id: int
    name: str
    description: str | None
    filter_json: dict
    is_default: bool
    created_at: datetime | None


class WastageSavedViewBody(BaseModel):
    name: str
    description: str | None = None
    filter_json: dict
    is_default: bool = False


@router.get("/reports/wastage/views", response_model=list[WastageSavedViewOut])
async def list_wastage_views(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List saved filter views for wastage report (current user)."""
    _ensure_tenant(user, tenant)
    result = await db.execute(
        select(WastageSavedView).where(
            WastageSavedView.tenant_id == tenant.id,
            WastageSavedView.user_id == user.id,
        ).order_by(WastageSavedView.name.asc())
    )
    rows = result.scalars().all()
    return [
        WastageSavedViewOut(
            id=r.id,
            name=r.name,
            description=r.description,
            filter_json=r.filter_json or {},
            is_default=r.is_default,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.post("/reports/wastage/views", status_code=201, response_model=WastageSavedViewOut)
async def create_wastage_view(
    body: WastageSavedViewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save current filter state as a named wastage report view."""
    _ensure_tenant(user, tenant)
    if body.is_default:
        default_rows = (await db.execute(
            select(WastageSavedView).where(
                WastageSavedView.tenant_id == tenant.id,
                WastageSavedView.user_id == user.id,
                WastageSavedView.is_default == True,
            )
        )).scalars().all()
        for r in default_rows:
            r.is_default = False
    row = WastageSavedView(
        tenant_id=tenant.id,
        user_id=user.id,
        name=body.name,
        description=body.description,
        filter_json=body.filter_json,
        is_default=body.is_default,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return WastageSavedViewOut(
        id=row.id,
        name=row.name,
        description=row.description,
        filter_json=row.filter_json or {},
        is_default=row.is_default,
        created_at=row.created_at,
    )


@router.delete("/reports/wastage/views/{view_id}", status_code=204)
async def delete_wastage_view(
    view_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete a saved wastage report view."""
    _ensure_tenant(user, tenant)
    row = await db.get(WastageSavedView, view_id)
    if not row or row.tenant_id != tenant.id or row.user_id != user.id:
        raise HTTPException(status_code=404, detail="Saved view not found")
    await db.delete(row)
    await db.commit()


class WastageManagementSummaryOut(BaseModel):
    top_orders: list[dict]  # [{ order_id, order_code, buyer_name, total_wastage_value }]
    top_materials: list[dict]  # [{ item_id, item_code, item_name, total_wastage_value }]
    top_reasons: list[dict]  # [{ reason_code, reason_name, value, count }] from wastage_transaction
    mom_change: dict  # { current_total, previous_total, current_above_threshold, previous_above_threshold }
    suggested_actions: list[str]


@router.get("/reports/wastage/management-summary", response_model=WastageManagementSummaryOut)
async def get_wastage_management_summary(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Management summary: top 10 orders, top 10 materials, top reasons, month-over-month, suggested actions."""
    _ensure_tenant(user, tenant)
    rows = await get_wastage_report(
        order_id=None,
        style_id=None,
        buyer_id=None,
        date_from=date_from,
        date_to=date_to,
        threshold_pct=None,
        above_threshold_only=False,
        tenant=tenant,
        user=user,
        db=db,
    )
    # Top 10 orders by total wastage value
    order_totals: dict[int, tuple[str, str, float]] = {}
    for r in rows:
        if r.order_id not in order_totals:
            order_totals[r.order_id] = (r.order_code, r.buyer_name, 0.0)
        order_totals[r.order_id] = (r.order_code, r.buyer_name, order_totals[r.order_id][2] + r.wastage_value)
    top_orders = [
        {"order_id": oid, "order_code": code, "buyer_name": name, "total_wastage_value": round(v, 2)}
        for oid, (code, name, v) in sorted(order_totals.items(), key=lambda x: -x[1][2])[:10]
    ]
    # Top 10 materials (items) by total wastage value
    item_totals: dict[int, tuple[str, str, float]] = {}
    for r in rows:
        if r.item_id not in item_totals:
            item_totals[r.item_id] = (r.item_code, r.item_name, 0.0)
        item_totals[r.item_id] = (r.item_code, r.item_name, item_totals[r.item_id][2] + r.wastage_value)
    top_materials = [
        {"item_id": iid, "item_code": code, "item_name": name, "total_wastage_value": round(v, 2)}
        for iid, (code, name, v) in sorted(item_totals.items(), key=lambda x: -x[1][2])[:10]
    ]
    # Top reasons from wastage_transaction (aggregate by reason; left join for null reason_id)
    reason_result = await db.execute(
        select(
            WastageTransaction.reason_id,
            WastageReason.code,
            WastageReason.name,
            WastageTransaction.value,
        )
        .select_from(WastageTransaction)
        .outerjoin(WastageReason, WastageTransaction.reason_id == WastageReason.id)
        .where(WastageTransaction.tenant_id == tenant.id)
    )
    reason_agg: dict[str, tuple[str, float, int]] = {}
    for r in reason_result.scalars().all():
        code = (r.code or "") if r.code else ""
        name = (r.name or "Unknown") if r.name else "Unknown"
        val = _to_float_safe(r.value)
        key = code or f"reason_{r.reason_id or 0}"
        if key not in reason_agg:
            reason_agg[key] = (name, 0.0, 0)
        reason_agg[key] = (reason_agg[key][0], reason_agg[key][1] + val, reason_agg[key][2] + 1)
    top_reasons = [
        {"reason_code": k, "reason_name": v[0], "value": round(v[1], 2), "count": v[2]}
        for k, v in sorted(reason_agg.items(), key=lambda x: -x[1][1])[:10]
    ]
    # Month-over-month: current period vs previous period (same length)
    current_total = sum(r.wastage_value for r in rows)
    current_above = len({r.order_id for r in rows if r.threshold_breach})
    period_start = date_from
    period_end = date_to
    if period_start and period_end:
        delta = (period_end - period_start).days + 1
        prev_end = period_start - timedelta(days=1)
        prev_start = prev_end - timedelta(days=delta - 1)
        prev_rows = await get_wastage_report(
            order_id=None, style_id=None, buyer_id=None,
            date_from=prev_start, date_to=prev_end,
            threshold_pct=None, above_threshold_only=False,
            tenant=tenant, user=user, db=db,
        )
        previous_total = sum(r.wastage_value for r in prev_rows)
        previous_above = len({r.order_id for r in prev_rows if r.threshold_breach})
    else:
        previous_total = 0.0
        previous_above = 0
    mom_change = {
        "current_total": round(current_total, 2),
        "previous_total": round(previous_total, 2),
        "current_above_threshold": current_above,
        "previous_above_threshold": previous_above,
    }
    # Suggested actions
    suggested_actions: list[str] = []
    if current_above > 0:
        suggested_actions.append(f"Review {current_above} order(s) with wastage above threshold.")
    if top_orders and float(top_orders[0].get("total_wastage_value", 0)) > 0:
        suggested_actions.append(f"Highest loss order: {top_orders[0].get('order_code', '')} – consider process review.")
    if top_reasons:
        suggested_actions.append(f"Top wastage reason: {top_reasons[0].get('reason_name', '')} – target corrective action.")
    if not suggested_actions:
        suggested_actions.append("No high-wastage areas identified for the selected period.")
    return WastageManagementSummaryOut(
        top_orders=top_orders,
        top_materials=top_materials,
        top_reasons=top_reasons,
        mom_change=mom_change,
        suggested_actions=suggested_actions,
    )


@router.post("/reports/wastage/refresh-summary")
async def refresh_wastage_order_summary(
    date_from: date | None = Query(default=None),
    date_to: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recompute and store wastage order summaries for the tenant (optional date range). Used for management view and KPIs."""
    _ensure_tenant(user, tenant)
    rows = await get_wastage_report(
        order_id=None,
        style_id=None,
        buyer_id=None,
        date_from=date_from,
        date_to=date_to,
        threshold_pct=None,
        above_threshold_only=False,
        tenant=tenant,
        user=user,
        db=db,
    )
    order_agg: dict[int, tuple[float, float, float, float, float, bool]] = {}
    for r in rows:
        if r.order_id not in order_agg:
            order_agg[r.order_id] = (0.0, 0.0, 0.0, 0.0, False)
        exp, act, trim_val, total_val, breach = order_agg[r.order_id]
        exp += r.expected_qty
        act += r.actual_qty
        if r.category == "trim":
            trim_val += r.wastage_value
        total_val += r.wastage_value
        breach = breach or r.threshold_breach
        order_agg[r.order_id] = (exp, act, trim_val, total_val, breach)
    for oid, (exp, act, trim_val, total_val, breach) in order_agg.items():
        await db.execute(delete(WastageOrderSummary).where(
            WastageOrderSummary.tenant_id == tenant.id,
            WastageOrderSummary.order_id == oid,
        ))
        var_pct = (act - exp) / exp * 100.0 if exp > 0 else 0.0
        summary = WastageOrderSummary(
            tenant_id=tenant.id,
            order_id=oid,
            period_start=date_from,
            period_end=date_to,
            planned_fabric_cons=str(round(exp, 4)),
            actual_fabric_cons=str(round(act, 4)),
            fabric_variance_pct=str(round(var_pct, 2)),
            trim_wastage_value=str(round(trim_val, 2)),
            total_wastage_value=str(round(total_val, 2)),
            above_threshold=breach,
        )
        db.add(summary)
    await db.commit()
    return {"updated_orders": len(order_agg)}


class WastageOrderDetailBomLine(BaseModel):
    item_id: int
    item_code: str
    item_name: str
    category: str
    base_consumption: float
    wastage_pct: float
    expected_qty: float
    actual_qty: float
    variance_qty: float
    wastage_pct_vs_bom: float
    wastage_value: float
    threshold_breach: bool


class WastageReasonBreakdownItem(BaseModel):
    reason_id: int | None
    reason_code: str
    reason_name: str
    value: float
    quantity: float


class WastageProcessStageBreakdownItem(BaseModel):
    process_stage: str
    value: float
    quantity: float


class WastageOrderDetailOut(BaseModel):
    order_id: int
    order_code: str
    order_date: date | None
    delivery_date: date | None
    buyer_id: int
    buyer_name: str
    style_id: int
    style_code: str
    quantity: int | None
    bom_lines: list[WastageOrderDetailBomLine]
    total_expected_value: float
    total_actual_value: float
    total_wastage_value: float
    linked_alert_ids: list[int]
    reason_breakdown: list[WastageReasonBreakdownItem] = []
    process_stage_breakdown: list[WastageProcessStageBreakdownItem] = []


@router.get("/reports/wastage/order/{order_id}", response_model=WastageOrderDetailOut)
async def get_wastage_order_detail(
    order_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Detail for one order: BOM lines with planned/actual/variance and linked alert IDs."""
    _ensure_tenant(user, tenant)
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Order not found")
    customer = await db.get(Customer, order.customer_id)
    buyer_name = customer.name if customer else f"Customer #{order.customer_id}"
    if not order.quotation_id:
        raise HTTPException(status_code=404, detail="Order has no quotation")
    quotation = await db.get(Quotation, order.quotation_id)
    if not quotation or quotation.tenant_id != tenant.id or not quotation.style_id:
        raise HTTPException(status_code=404, detail="Quotation or style not found")
    sid = quotation.style_id
    style = await db.get(GarmentStyle, sid)
    style_code = style.style_code if style else str(sid)
    order_qty = _to_float_safe(str(order.quantity)) if order.quantity is not None else 0.0
    bom = await get_latest_governed_bom(
        db,
        tenant_id=tenant.id,
        style_id=sid,
    )
    if not bom:
        raise HTTPException(status_code=400, detail="No APPROVED/FROZEN BOM for style")
    lines_result = await db.execute(
        select(BomItem).where(
            BomItem.tenant_id == tenant.id,
            BomItem.bom_id == bom.id,
            BomItem.item_id.isnot(None),
        )
    )
    total_expected_value = 0.0
    total_actual_value = 0.0
    bom_lines: list[WastageOrderDetailBomLine] = []
    for line in lines_result.scalars().all():
        item = await db.get(Item, line.item_id)
        if not item or item.tenant_id != tenant.id:
            continue
        cat = await db.get(ItemCategory, item.category_id) if item.category_id else None
        category = material_group_from_item(item, cat)
        base = _to_float_safe(line.base_consumption)
        wastage_pct_val = _to_float_safe(line.wastage_pct)
        expected = order_qty * base * (1.0 + wastage_pct_val / 100.0)
        act_result = await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.reference_type == "CONSUMPTION_ISSUE",
                StockMovement.reference_id == order.id,
                StockMovement.item_id == line.item_id,
            )
        )
        actual = sum(
            _to_float_safe(m.quantity) for m in act_result.scalars().all() if (m.movement_type or "").upper() == "OUT"
        )
        variance_qty = actual - expected
        wastage_pct_vs_bom = round((variance_qty / expected * 100.0), 2) if expected > 0 else 0.0
        unit_cost = _to_float_safe(item.default_cost)
        wastage_value = round(max(0.0, variance_qty) * unit_cost, 2)
        total_expected_value += expected * unit_cost
        total_actual_value += actual * unit_cost
        bom_lines.append(
            WastageOrderDetailBomLine(
                item_id=line.item_id,
                item_code=item.item_code,
                item_name=item.name or item.description or "",
                category=category,
                base_consumption=base,
                wastage_pct=wastage_pct_val,
                expected_qty=round(expected, 4),
                actual_qty=round(actual, 4),
                variance_qty=round(variance_qty, 4),
                wastage_pct_vs_bom=wastage_pct_vs_bom,
                wastage_value=wastage_value,
                threshold_breach=wastage_pct_vs_bom > DEFAULT_WASTAGE_THRESHOLD_PCT,
            )
        )
    total_wastage_value = round(total_actual_value - total_expected_value, 2)
    if total_wastage_value < 0:
        total_wastage_value = 0.0
    alert_ids_result = await db.execute(
        select(AlertRelatedEntity.alert_id).where(
            AlertRelatedEntity.tenant_id == tenant.id,
            AlertRelatedEntity.entity_type == "order",
            AlertRelatedEntity.entity_id == order_id,
        )
    )
    linked_alert_ids = list({r[0] for r in alert_ids_result.scalars().all()})

    # Reason and process-stage breakdown from wastage_transaction
    tx_result = await db.execute(
        select(WastageTransaction, WastageReason).outerjoin(
            WastageReason, WastageTransaction.reason_id == WastageReason.id
        ).where(
            WastageTransaction.tenant_id == tenant.id,
            WastageTransaction.order_id == order_id,
        )
    )
    tx_rows = tx_result.all()
    reason_agg: dict[int | None, tuple[str, str, float, float]] = {}
    stage_agg: dict[str, tuple[float, float]] = {}
    for tx, reason in tx_rows:
        val = _to_float_safe(tx.value)
        qty = _to_float_safe(tx.quantity)
        code = reason.code if reason else ""
        name = reason.name if reason else "Unknown"
        rid = tx.reason_id
        if rid not in reason_agg:
            reason_agg[rid] = (code, name, 0.0, 0.0)
        reason_agg[rid] = (code, name, reason_agg[rid][2] + val, reason_agg[rid][3] + qty)
        stage = tx.process_stage or "unknown"
        if stage not in stage_agg:
            stage_agg[stage] = (0.0, 0.0)
        stage_agg[stage] = (stage_agg[stage][0] + val, stage_agg[stage][1] + qty)
    reason_breakdown = [
        WastageReasonBreakdownItem(reason_id=rid, reason_code=c, reason_name=n, value=round(v, 2), quantity=round(q, 4))
        for rid, (c, n, v, q) in reason_agg.items()
    ]
    process_stage_breakdown = [
        WastageProcessStageBreakdownItem(process_stage=st, value=round(v, 2), quantity=round(q, 4))
        for st, (v, q) in stage_agg.items()
    ]

    return WastageOrderDetailOut(
        order_id=order.id,
        order_code=order.order_code,
        order_date=order.order_date,
        delivery_date=order.delivery_date,
        buyer_id=order.customer_id,
        buyer_name=buyer_name,
        style_id=sid,
        style_code=style_code,
        quantity=order.quantity,
        bom_lines=bom_lines,
        total_expected_value=round(total_expected_value, 2),
        total_actual_value=round(total_actual_value, 2),
        total_wastage_value=total_wastage_value,
        linked_alert_ids=linked_alert_ids,
        reason_breakdown=reason_breakdown,
        process_stage_breakdown=process_stage_breakdown,
    )

