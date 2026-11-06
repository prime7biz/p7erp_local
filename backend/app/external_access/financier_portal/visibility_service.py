"""Financier ERP visibility: order finance, raw materials, production, financial signals (read-only DTOs)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import tenant_today
from app.external_access.financier_portal import facility_selectors as fsel
from app.models import BtbLc, BtbLcAccounting, Customer, Order, Quotation
from app.models.commercial import MasterContract
from app.models.costing import Item, ItemCategory
from app.models.merch import GarmentStyle
from app.models.facility import FacilityUtilization, RepaymentScheduleLine
from app.models.finance import FxReceipt
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingItem,
    ProcessOrder,
    PurchaseOrder,
    PurchaseOrderItem,
    Warehouse,
)
from app.models.production import CutTicket, HourlyProductionEntry, ProductionQcCheck, SewingLineStyleConfig
from app.models.trade import Shipment, TradeCase, TradeDocument


def _float_qty(s: str | None) -> float:
    if not s:
        return 0.0
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


async def load_rows_by_id(db: AsyncSession, model: Any, ids: set[int]) -> dict[int, Any]:
    """Load many rows of `model` in one query, keyed by id. Callers still apply their own tenant checks."""
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    rows = (await db.execute(select(model).where(model.id.in_(ids)))).scalars().all()
    return {r.id: r for r in rows}


def _fob_from_order(order: Order, quotation: Quotation | None, style: GarmentStyle | None) -> tuple[float | None, str | None]:
    snap = order.commercial_snapshot_json or {}
    if isinstance(snap, dict):
        for k in ("target_fob", "fob", "fob_value", "unit_fob", "quoted_fob"):
            v = snap.get(k)
            if v is not None and str(v).strip():
                try:
                    return float(str(v).replace(",", "")), snap.get("currency") or snap.get("fob_currency")
                except (TypeError, ValueError):
                    pass
    if style and style.target_fob:
        try:
            return float(str(style.target_fob).replace(",", "")), style.currency
        except (TypeError, ValueError):
            pass
    return None, None


async def build_order_finance_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    if not btb_rows:
        return [], "No BTB LCs linked to your facilities for this tenant."
    btb_by_id = {b.id: b for b in btb_rows}
    btb_ids = list(btb_by_id.keys())
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    utils = await fsel.utilizations_for_party_btbs(db, tenant_id, party_id, btb_ids)
    util_by_btb: dict[int, list[FacilityUtilization]] = defaultdict(list)
    for u in utils:
        if u.linked_btb_lc_id:
            util_by_btb[int(u.linked_btb_lc_id)].append(u)

    items: list[dict[str, Any]] = []
    for oid, bset in sorted(order_btbs.items(), key=lambda x: x[0]):
        orow = await db.get(Order, oid)
        if not orow or orow.tenant_id != tenant_id:
            continue
        cust = await db.get(Customer, orow.customer_id)
        buyer = cust.name if cust else None
        q = await db.get(Quotation, orow.quotation_id) if orow.quotation_id else None
        st = await db.get(GarmentStyle, q.style_id) if q and q.style_id else None
        fob_val, fob_ccy = _fob_from_order(orow, q, st)

        ulist: list[FacilityUtilization] = []
        for bid in bset:
            ulist.extend(util_by_btb.get(bid, []))
        if not ulist:
            continue
        appr = sum(float(u.principal_amount or 0) for u in ulist)
        outst = sum(float(u.outstanding_principal or 0) for u in ulist)
        util_amt = max(appr - outst, 0.0)
        cur = next((u.currency for u in ulist if u.currency), None)
        items.append(
            {
                "order_id": oid,
                "order_code": orow.order_code,
                "buyer_name": buyer,
                "fob_value": round(fob_val, 4) if fob_val is not None else None,
                "fob_currency": fob_ccy,
                "approved_finance_amount": round(appr, 2),
                "utilized_finance_amount": round(util_amt, 2),
                "outstanding_finance_amount": round(outst, 2),
                "finance_currency": cur,
                "order_status": orow.status,
            }
        )
    return items, None if items else "No orders matched to your linked utilizations."


async def build_raw_material_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    if not btb_ids:
        return [], "No BTB LCs in scope."
    pos = await fsel.purchase_orders_for_btb_ids(db, tenant_id, btb_ids)
    if not pos:
        return [], "No purchase orders under linked BTB LCs."
    btb_map = {
        b.id: b
        for b in (
            await db.execute(select(BtbLc).where(BtbLc.tenant_id == tenant_id, BtbLc.id.in_(btb_ids)))
        ).scalars().all()
    }
    po_ids = [p.id for p in pos]
    poi_rows = list(
        (
            await db.execute(
                select(PurchaseOrderItem, PurchaseOrder)
                .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
                .where(PurchaseOrderItem.purchase_order_id.in_(po_ids))
            )
        ).all()
    )
    poi_rows = poi_rows[:800]
    items_by_id = await load_rows_by_id(db, Item, {poi.item_id for poi, _ in poi_rows})
    tenant_items = {i.id: i for i in items_by_id.values() if i.tenant_id == tenant_id}
    categories_by_id = await load_rows_by_id(db, ItemCategory, {i.category_id for i in tenant_items.values()})
    warehouse_ids = {poi.warehouse_id for poi, _ in poi_rows if poi.warehouse_id}
    warehouse_ids |= {i.default_warehouse_id for i in tenant_items.values() if i.default_warehouse_id}
    warehouses_by_id = await load_rows_by_id(db, Warehouse, warehouse_ids)
    source_order_ids = {poi.source_order_id for poi, _ in poi_rows if poi.source_order_id}
    order_codes: dict[int, str] = {}
    if source_order_ids:
        order_codes = dict(
            (
                await db.execute(
                    select(Order.id, Order.order_code).where(Order.id.in_(source_order_ids), Order.tenant_id == tenant_id)
                )
            ).all()
        )
    # Quantities are free-text strings (may contain commas), so they are parsed and summed in Python.
    received_by_line: dict[int, float] = defaultdict(float)
    if poi_rows:
        gri_rows = await db.execute(
            select(
                GoodsReceivingItem.purchase_order_line_id,
                GoodsReceivingItem.accepted_qty,
                GoodsReceivingItem.received_qty,
            ).where(
                GoodsReceivingItem.tenant_id == tenant_id,
                GoodsReceivingItem.purchase_order_line_id.in_([poi.id for poi, _ in poi_rows]),
            )
        )
        for line_id, accepted_qty, received_qty in gri_rows.all():
            received_by_line[line_id] += _float_qty(accepted_qty) or _float_qty(received_qty)

    out: list[dict[str, Any]] = []
    for poi, po in poi_rows:
        btb_id = po.btb_lc_id
        btb = btb_map.get(int(btb_id)) if btb_id else None
        item = tenant_items.get(poi.item_id)
        cat_name = None
        if item:
            cat = categories_by_id.get(item.category_id)
            cat_name = cat.name if cat and cat.tenant_id == tenant_id else None
        wh = warehouses_by_id.get(poi.warehouse_id) if poi.warehouse_id else None
        if not wh and item and item.default_warehouse_id:
            wh = warehouses_by_id.get(item.default_warehouse_id)
        if wh is not None and wh.tenant_id != tenant_id:
            wh = None
        ordered = _float_qty(poi.quantity)
        received = received_by_line.get(poi.id, 0.0)
        pending = max(ordered - received, 0.0)
        if pending <= 0.001 and ordered > 0:
            in_house = "fully_received"
        elif received > 0:
            in_house = "partial"
        else:
            in_house = "pending"
        order_code = order_codes.get(poi.source_order_id) if poi.source_order_id else None
        lc_open = bool(btb and (btb.status or "").upper() not in ("DRAFT", "CANCELLED"))
        out.append(
            {
                "purchase_order_id": po.id,
                "po_code": po.po_code,
                "order_code": order_code,
                "btb_lc_id": btb.id if btb else None,
                "btb_lc_reference": btb.reference if btb else None,
                "btb_lc_status": btb.status if btb else None,
                "btb_lc_opened": lc_open,
                "supplier_name": po.supplier_name,
                "material_category": cat_name,
                "item_code": item.item_code if item else str(poi.item_id),
                "item_name": item.name if item else None,
                "qty_ordered": round(ordered, 4),
                "qty_received": round(received, 4),
                "qty_pending": round(pending, 4),
                "warehouse_name": wh.name if wh else None,
                "in_house_status": in_house,
            }
        )
    return out, None


def _stage_from_pct(pct: float, has_activity: bool) -> tuple[str, float]:
    if not has_activity:
        return "not_started", 0.0
    if pct >= 99:
        return "completed", min(pct, 100.0)
    if pct > 0:
        return "in_progress", pct
    return "in_progress", pct


def _sewing_stage(line_configs: list[Any], hourly_sew_qty: float, order_qty: float) -> tuple[str, float]:
    """Sewing (status, pct) from line bookings; orders without bookings use hourly sewing output instead."""
    if line_configs:
        sew_good = 0.0
        sew_plan = 0.0
        for c in line_configs:
            sew_good += float(c.completed_qty or 0)
            sew_plan += float(c.planned_qty or 0)
        denom = sew_plan or order_qty or 1.0
        sew_pct = round(100 * sew_good / denom, 1)
        statuses = {c.status for c in line_configs}
        if all((s or "").lower() in ("completed", "closed", "done") for s in statuses):
            return "completed", min(sew_pct, 100.0)
        if sew_good > 0:
            return "in_progress", sew_pct
        return "in_progress", 0.0
    sew_pct = round(100 * hourly_sew_qty / order_qty, 1) if order_qty > 0 else 0.0
    return _stage_from_pct(sew_pct, hourly_sew_qty > 0)


async def _sewing_pct_by_order(db: AsyncSession, *, tenant_id: int, orders: list[Order]) -> dict[int, float]:
    """Same sewing_pct as build_production_row_for_order, for many orders in two queries."""
    order_ids = [o.id for o in orders]
    if not order_ids:
        return {}
    configs_by_order: dict[int, list[Any]] = defaultdict(list)
    config_rows = await db.execute(
        select(
            SewingLineStyleConfig.order_id,
            SewingLineStyleConfig.status,
            SewingLineStyleConfig.completed_qty,
            SewingLineStyleConfig.planned_qty,
        ).where(SewingLineStyleConfig.tenant_id == tenant_id, SewingLineStyleConfig.order_id.in_(order_ids))
    )
    for row in config_rows.all():
        configs_by_order[row.order_id].append(row)
    hourly_by_order: dict[int, float] = {}
    ids_without_configs = [oid for oid in order_ids if oid not in configs_by_order]
    if ids_without_configs:
        hourly_rows = await db.execute(
            select(HourlyProductionEntry.order_id, func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0))
            .where(
                HourlyProductionEntry.tenant_id == tenant_id,
                HourlyProductionEntry.order_id.in_(ids_without_configs),
                HourlyProductionEntry.department_type.ilike("%sew%"),
            )
            .group_by(HourlyProductionEntry.order_id)
        )
        hourly_by_order = {oid: float(qty or 0) for oid, qty in hourly_rows.all()}
    out: dict[int, float] = {}
    for o in orders:
        order_qty = float(o.quantity or 0) or 0.0
        _, pct = _sewing_stage(configs_by_order.get(o.id, []), hourly_by_order.get(o.id, 0.0), order_qty)
        out[o.id] = pct
    return out


async def build_production_rows_for_orders(
    db: AsyncSession, *, tenant_id: int, orders: list[Order], buyer_names: dict[int, str | None] | None = None
) -> list[dict[str, Any]]:
    """Production milestone blocks (cutting → shipment) for many orders in a fixed number of queries."""
    buyer_names = buyer_names or {}
    order_ids = [o.id for o in orders]
    if not order_ids:
        return []

    tickets_by_order: dict[int, list[Any]] = defaultdict(list)
    ticket_rows = await db.execute(
        select(CutTicket.order_id, CutTicket.status, CutTicket.total_pcs_cut).where(
            CutTicket.tenant_id == tenant_id, CutTicket.order_id.in_(order_ids)
        )
    )
    for row in ticket_rows.all():
        tickets_by_order[row.order_id].append(row)

    configs_by_order: dict[int, list[Any]] = defaultdict(list)
    config_rows = await db.execute(
        select(
            SewingLineStyleConfig.order_id,
            SewingLineStyleConfig.status,
            SewingLineStyleConfig.completed_qty,
            SewingLineStyleConfig.planned_qty,
        ).where(SewingLineStyleConfig.tenant_id == tenant_id, SewingLineStyleConfig.order_id.in_(order_ids))
    )
    for row in config_rows.all():
        configs_by_order[row.order_id].append(row)

    is_sew = HourlyProductionEntry.department_type.ilike("%sew%")
    is_finish = HourlyProductionEntry.department_type.ilike("%finish%")
    hourly_rows = await db.execute(
        select(
            HourlyProductionEntry.order_id,
            func.coalesce(func.sum(HourlyProductionEntry.good_qty).filter(is_sew), 0),
            func.coalesce(func.sum(HourlyProductionEntry.good_qty).filter(is_finish), 0),
        )
        .where(
            HourlyProductionEntry.tenant_id == tenant_id,
            HourlyProductionEntry.order_id.in_(order_ids),
            or_(is_sew, is_finish),
        )
        .group_by(HourlyProductionEntry.order_id)
    )
    hourly_by_order = {oid: (float(sew or 0), float(fin or 0)) for oid, sew, fin in hourly_rows.all()}

    # Latest QC check per order (first by id when several share the latest date).
    qc_rows = await db.execute(
        select(
            ProductionQcCheck.order_id,
            ProductionQcCheck.check_type,
            ProductionQcCheck.total_checked,
            ProductionQcCheck.pass_qty,
        )
        .where(ProductionQcCheck.tenant_id == tenant_id, ProductionQcCheck.order_id.in_(order_ids))
        .distinct(ProductionQcCheck.order_id)
        .order_by(ProductionQcCheck.order_id, ProductionQcCheck.production_date.desc(), ProductionQcCheck.id)
    )
    latest_qc_by_order = {row.order_id: row for row in qc_rows.all()}

    # Orders not yet shipped fall back to the first shipment ETD of their first trade case.
    etd_by_order: dict[int, Any] = {}
    unshipped_ids = [o.id for o in orders if not o.shipped_at]
    if unshipped_ids:
        tc_rows = await db.execute(
            select(TradeCase.order_id, TradeCase.id)
            .where(TradeCase.tenant_id == tenant_id, TradeCase.order_id.in_(unshipped_ids))
            .distinct(TradeCase.order_id)
            .order_by(TradeCase.order_id, TradeCase.id)
        )
        tc_by_order = dict(tc_rows.all())
        if tc_by_order:
            sh_rows = await db.execute(
                select(Shipment.trade_case_id, Shipment.etd)
                .where(Shipment.trade_case_id.in_(list(tc_by_order.values())))
                .distinct(Shipment.trade_case_id)
                .order_by(Shipment.trade_case_id, Shipment.id)
            )
            etd_by_tc = dict(sh_rows.all())
            etd_by_order = {oid: etd_by_tc.get(tc_id) for oid, tc_id in tc_by_order.items()}

    out: list[dict[str, Any]] = []
    for order in orders:
        oid = order.id
        oqty = float(order.quantity or 0) or 0.0

        ctickets = tickets_by_order.get(oid, [])
        cut_pcs = sum(int(t.total_pcs_cut or 0) for t in ctickets)
        cut_pct = round(100 * cut_pcs / oqty, 1) if oqty > 0 else 0.0
        if not ctickets:
            cutting_status, cutting_pct = "not_started", 0.0
        elif all((t.status or "").lower() in ("completed", "closed", "posted") for t in ctickets):
            cutting_status, cutting_pct = "completed", min(cut_pct, 100.0) if oqty else 100.0
        else:
            cutting_status = "in_progress"
            cutting_pct = cut_pct

        hourly_sew_qty, g2 = hourly_by_order.get(oid, (0.0, 0.0))
        sewing_status, sewing_pct = _sewing_stage(configs_by_order.get(oid, []), hourly_sew_qty, oqty)

        fin_pct = round(100 * g2 / oqty, 1) if oqty > 0 else 0.0
        finishing_status, finishing_pct = _stage_from_pct(fin_pct, g2 > 0)

        chk = latest_qc_by_order.get(oid)
        if chk is not None:
            tot = int(chk.total_checked or 0)
            passed = int(chk.pass_qty or 0)
            rate = round(100 * passed / tot, 1) if tot > 0 else None
            inspection_status = (chk.check_type or "qc") + (" ok" if (rate or 0) >= 95 else " review")
        else:
            rate = None
            inspection_status = "not_started"

        ship_tgt = order.delivery_date.isoformat() if order.delivery_date else None
        ship_act = order.shipped_at.date().isoformat() if order.shipped_at else None
        if not ship_act and etd_by_order.get(oid):
            ship_act = str(etd_by_order[oid])

        out.append(
            {
                "order_id": oid,
                "order_code": order.order_code,
                "buyer_name": buyer_names.get(oid),
                "order_qty": int(order.quantity or 0),
                "cutting_status": cutting_status,
                "cutting_pct": cutting_pct,
                "sewing_status": sewing_status,
                "sewing_pct": sewing_pct,
                "finishing_status": finishing_status,
                "finishing_pct": finishing_pct,
                "inspection_status": inspection_status,
                "inspection_pass_rate": rate,
                "shipment_target_date": ship_tgt,
                "actual_shipment_date": ship_act,
            }
        )
    return out


async def build_production_row_for_order(
    db: AsyncSession, *, tenant_id: int, order: Order, buyer_name: str | None = None
) -> dict[str, Any]:
    """Single-order production milestone block (cutting → shipment)."""
    rows = await build_production_rows_for_orders(
        db, tenant_id=tenant_id, orders=[order], buyer_names={order.id: buyer_name}
    )
    return rows[0]


async def _order_btb_links_batched(db: AsyncSession, tenant_id: int, btb_rows: list[BtbLc]) -> dict[int, set[int]]:
    """Same result as ``fsel.order_btb_links_for_party`` in two queries instead of one per BTB LC."""
    out: dict[int, set[int]] = defaultdict(set)
    if not btb_rows:
        return dict(out)
    btb_ids_by_mc: dict[int, list[int]] = defaultdict(list)
    for b in btb_rows:
        if b.master_contract_id:
            btb_ids_by_mc[int(b.master_contract_id)].append(int(b.id))
    if btb_ids_by_mc:
        mc_rows = await db.execute(
            select(Order.id, Order.master_contract_id).where(
                Order.tenant_id == tenant_id, Order.master_contract_id.in_(list(btb_ids_by_mc))
            )
        )
        for oid, mc_id in mc_rows.all():
            out[int(oid)].update(btb_ids_by_mc[int(mc_id)])
    po_rows = await db.execute(
        select(PurchaseOrder.source_order_id, PurchaseOrder.btb_lc_id).where(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.btb_lc_id.in_([b.id for b in btb_rows]),
            PurchaseOrder.source_order_id.isnot(None),
        )
    )
    for soid, bid in po_rows.all():
        if soid and bid:
            out[int(soid)].add(int(bid))
    return dict(out)


async def build_production_tracker_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await _order_btb_links_batched(db, tenant_id, btb_rows)
    if not order_btbs:
        return [], "No financed orders in scope."
    order_rows = await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.id.in_(list(order_btbs))))
    orders_by_id = {o.id: o for o in order_rows.scalars().all()}
    orders = [orders_by_id[oid] for oid in sorted(order_btbs.keys()) if oid in orders_by_id]
    customers_by_id = await load_rows_by_id(db, Customer, {o.customer_id for o in orders})
    buyer_names = {
        o.id: customers_by_id[o.customer_id].name if o.customer_id in customers_by_id else None for o in orders
    }
    items = await build_production_rows_for_orders(db, tenant_id=tenant_id, orders=orders, buyer_names=buyer_names)
    return items, None


async def build_financial_visibility_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    if not btb_rows:
        return [], "No BTB LCs in scope."
    btb_ids = [b.id for b in btb_rows]

    acc_by_btb: dict[int, BtbLcAccounting] = {}
    acc_rows = await db.execute(
        select(BtbLcAccounting)
        .where(BtbLcAccounting.tenant_id == tenant_id, BtbLcAccounting.btb_lc_id.in_(btb_ids))
        .order_by(BtbLcAccounting.id)
    )
    for a in acc_rows.scalars().all():
        acc_by_btb.setdefault(a.btb_lc_id, a)

    doc_rows = await db.execute(
        select(TradeCase.btb_lc_id, func.count(TradeDocument.id))
        .join(TradeDocument, TradeDocument.trade_case_id == TradeCase.id)
        .where(TradeCase.tenant_id == tenant_id, TradeCase.btb_lc_id.in_(btb_ids))
        .group_by(TradeCase.btb_lc_id)
    )
    doc_count_by_btb = {int(bid): int(n or 0) for bid, n in doc_rows.all()}

    mcs_by_id = await load_rows_by_id(db, MasterContract, {b.master_contract_id for b in btb_rows if b.master_contract_id})

    utils = await fsel.utilizations_for_party_btbs(db, tenant_id, party_id, btb_ids)
    util_ids_by_btb: dict[int, list[int]] = defaultdict(list)
    for u in utils:
        util_ids_by_btb[int(u.linked_btb_lc_id)].append(u.id)
    draft_util_ids: set[int] = set()
    if utils:
        draft_rows = await db.execute(
            select(RepaymentScheduleLine.facility_utilization_id)
            .where(
                RepaymentScheduleLine.tenant_id == tenant_id,
                RepaymentScheduleLine.facility_utilization_id.in_([u.id for u in utils]),
                RepaymentScheduleLine.status.in_(("upcoming", "due", "partially_paid")),
                RepaymentScheduleLine.draft_voucher_id.isnot(None),
            )
            .distinct()
        )
        draft_util_ids = {int(x) for x in draft_rows.scalars().all()}

    fx_rows = (
        await db.execute(
            select(FxReceipt.source_ref, FxReceipt.status, FxReceipt.settled_amount, FxReceipt.fc_amount)
            .where(FxReceipt.tenant_id == tenant_id)
            .order_by(FxReceipt.id)
        )
    ).all()

    items: list[dict[str, Any]] = []
    for b in btb_rows:
        acc = acc_by_btb.get(b.id)
        bank_charges_note = "not_posted"
        if acc and acc.lc_open_voucher_id:
            bank_charges_note = "lc_open_voucher_posted"
        if acc and acc.import_bill_voucher_id:
            bank_charges_note = "import_bill_posted"
        if acc and acc.realization_voucher_id:
            bank_charges_note = "realized"
        doc_count = doc_count_by_btb.get(b.id, 0)
        export_docs_submitted = doc_count > 0
        mc_exp = None
        if b.master_contract_id:
            mc = mcs_by_id.get(b.master_contract_id)
            if mc and mc.expiry_date:
                mc_exp = mc.expiry_date.isoformat()
        exp_coll = None
        if b.maturity_date:
            exp_coll = b.maturity_date.isoformat()
        elif mc_exp:
            exp_coll = mc_exp

        draft_reserve = any(uid in draft_util_ids for uid in util_ids_by_btb.get(b.id, []))

        claim_status = "not_tracked"
        for fr in fx_rows:
            ref = (fr.source_ref or "").upper()
            if b.reference.upper() in ref or str(b.id) in ref:
                st = (fr.status or "").upper()
                if st == "SETTLED" or _float_qty(fr.settled_amount) >= _float_qty(fr.fc_amount) * 0.99:
                    claim_status = "settled"
                elif _float_qty(fr.settled_amount) > 0:
                    claim_status = "partially_settled"
                else:
                    claim_status = "open_receipt"
                break

        items.append(
            {
                "btb_lc_id": b.id,
                "btb_lc_reference": b.reference,
                "btb_lc_status": b.status,
                "bank_charges_status": bank_charges_note,
                "ait_status": "not_tracked",
                "export_document_count": doc_count,
                "export_docs_submitted": export_docs_submitted,
                "invoice_claim_status": claim_status,
                "expected_collection_date": exp_coll,
                "repayment_reserve_draft": draft_reserve,
                "saving_reserve_status": "not_tracked",
                "accounting_lc_status": acc.status if acc else None,
            }
        )
    return items, None


async def build_btb_liabilities_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    """Per BTB LC: amounts, maturity, linked utilizations, next repayment installments."""
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    if not btb_rows:
        return [], "No BTB LCs in scope."
    utils_all = await fsel.list_utilizations_for_financier(db, tenant_id, party_id)
    util_by_btb: dict[int, list[FacilityUtilization]] = defaultdict(list)
    for u in utils_all:
        if u.linked_btb_lc_id:
            util_by_btb[int(u.linked_btb_lc_id)].append(u)
    scoped_util_ids = [u.id for b in btb_rows for u in util_by_btb.get(b.id, [])]
    sched_by_util: dict[int, list[RepaymentScheduleLine]] = defaultdict(list)
    if scoped_util_ids:
        sched_rows = await db.execute(
            select(RepaymentScheduleLine)
            .where(
                RepaymentScheduleLine.tenant_id == tenant_id,
                RepaymentScheduleLine.facility_utilization_id.in_(scoped_util_ids),
            )
            .order_by(RepaymentScheduleLine.installment_number, RepaymentScheduleLine.id)
        )
        for ln in sched_rows.scalars().all():
            sched_by_util[ln.facility_utilization_id].append(ln)
    items: list[dict[str, Any]] = []
    for b in btb_rows:
        ul = util_by_btb.get(b.id, [])
        util_payload: list[dict[str, Any]] = []
        all_upcoming: list[dict[str, Any]] = []
        for u in ul:
            sched = sched_by_util.get(u.id, [])
            pend = [ln for ln in sched if (ln.status or "").lower() not in ("paid", "closed", "settled")]
            pend.sort(key=lambda x: (x.due_date or date.min))
            for ln in pend[:3]:
                all_upcoming.append(
                    {
                        "utilization_id": u.id,
                        "utilization_code": u.utilization_code,
                        "installment_number": ln.installment_number,
                        "due_date": str(ln.due_date) if ln.due_date else None,
                        "emi_amount": float(ln.emi_amount or 0),
                        "status": ln.status,
                    }
                )
            util_payload.append(
                {
                    "id": u.id,
                    "utilization_code": u.utilization_code,
                    "outstanding_principal": float(u.outstanding_principal or 0),
                    "principal_amount": float(u.principal_amount or 0),
                    "currency": u.currency,
                    "maturity_date": str(u.maturity_date) if u.maturity_date else None,
                    "status": u.status,
                }
            )
        all_upcoming.sort(key=lambda x: x.get("due_date") or "")
        items.append(
            {
                "btb_lc_id": b.id,
                "reference": b.reference,
                "status": b.status,
                "amount": float(b.amount or 0),
                "currency": b.currency,
                "open_date": str(b.open_date) if b.open_date else None,
                "expiry_date": str(b.expiry_date) if b.expiry_date else None,
                "maturity_date": str(b.maturity_date) if b.maturity_date else None,
                "maturity_amount": float(b.maturity_amount or 0) if b.maturity_amount is not None else None,
                "utilizations": util_payload,
                "upcoming_installments": all_upcoming[:12],
            }
        )
    return items, None


async def build_order_finance_for_order(
    db: AsyncSession, *, tenant_id: int, party_id: int, order_id: int, order_btbs: dict[int, set[int]] | None = None
) -> dict[str, Any] | None:
    """Finance block for a single financed order."""
    if order_btbs is None:
        btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
        order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    bset = order_btbs.get(order_id)
    if not bset:
        return None
    orow = await db.get(Order, order_id)
    if not orow or orow.tenant_id != tenant_id:
        return None
    q = await db.get(Quotation, orow.quotation_id) if orow.quotation_id else None
    st = await db.get(GarmentStyle, q.style_id) if q and q.style_id else None
    fob_val, fob_ccy = _fob_from_order(orow, q, st)
    utils = await fsel.utilizations_for_party_btbs(db, tenant_id, party_id, list(bset))
    if not utils:
        return None
    return {
        "fob_value": round(fob_val, 4) if fob_val is not None else None,
        "fob_currency": fob_ccy,
        **_utilization_totals(utils),
    }


def _utilization_totals(utils: list[FacilityUtilization]) -> dict[str, Any]:
    appr = sum(float(u.principal_amount or 0) for u in utils)
    outst = sum(float(u.outstanding_principal or 0) for u in utils)
    util_amt = max(appr - outst, 0.0)
    cur = next((u.currency for u in utils if u.currency), None)
    return {
        "approved_finance_amount": round(appr, 2),
        "utilized_finance_amount": round(util_amt, 2),
        "outstanding_finance_amount": round(outst, 2),
        "finance_currency": cur,
    }


async def build_raw_material_rows_for_order(
    db: AsyncSession, *, tenant_id: int, party_id: int, order_id: int
) -> list[dict[str, Any]]:
    """RM lines scoped to one order (party BTB chain)."""
    all_rows, _ = await build_raw_material_rows(db, tenant_id=tenant_id, party_id=party_id)
    orow = await db.get(Order, order_id)
    if orow is not None and orow.tenant_id != tenant_id:
        return []
    code = orow.order_code if orow else None
    out = [r for r in all_rows if r.get("order_code") == code]
    if out:
        return out
    po_ids = set()
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    pos = await fsel.purchase_orders_for_btb_ids(db, tenant_id, btb_ids)
    for po in pos:
        if po.source_order_id == order_id:
            po_ids.add(po.id)
    return [r for r in all_rows if r.get("purchase_order_id") in po_ids]


async def build_commercial_links_for_order(
    db: AsyncSession, *, tenant_id: int, party_id: int, order_id: int, order_btbs: dict[int, set[int]] | None = None
) -> dict[str, Any]:
    """BTB LC and master contract refs linked to this financed order."""
    if order_btbs is None:
        btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
        order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    bset = order_btbs.get(order_id, set())
    btb_refs: list[dict[str, Any]] = []
    mc_ref: dict[str, Any] | None = None
    for bid in bset:
        b = await db.get(BtbLc, bid)
        if not b or b.tenant_id != tenant_id:
            continue
        btb_refs.append(
            {
                "btb_lc_id": b.id,
                "reference": b.reference,
                "status": b.status,
                "amount": float(b.amount or 0),
                "currency": b.currency,
            }
        )
        if b.master_contract_id and not mc_ref:
            mc = await db.get(MasterContract, b.master_contract_id)
            if mc and mc.tenant_id == tenant_id:
                mc_ref = {
                    "master_contract_id": mc.id,
                    "reference": mc.reference,
                    "status": mc.status,
                    "amount": float(mc.amount or 0) if mc.amount is not None else None,
                    "currency": mc.currency,
                    "expiry_date": mc.expiry_date.isoformat() if mc.expiry_date else None,
                }
    orow = await db.get(Order, order_id)
    if orow is not None and orow.tenant_id != tenant_id:
        orow = None
    return {
        "btb_lcs": btb_refs,
        "master_contract": mc_ref,
        "pi_issued_at": orow.pi_issued_at.isoformat() if orow and orow.pi_issued_at else None,
        "lc_received_at": orow.lc_received_at.isoformat() if orow and orow.lc_received_at else None,
        "rm_received_pct": float(orow.rm_received_pct or 0) if orow else None,
    }


async def build_trade_summary_for_order(db: AsyncSession, *, tenant_id: int, order_id: int) -> dict[str, Any] | None:
    """Export / trade case stage for an order."""
    tc = (
        await db.execute(
            select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.order_id == order_id).limit(1)
        )
    ).scalar_one_or_none()
    if not tc:
        return None
    doc_count = int(
        (await db.execute(select(func.count()).select_from(TradeDocument).where(TradeDocument.trade_case_id == tc.id)))
        .scalar()
        or 0
    )
    shipments = list((await db.execute(select(Shipment).where(Shipment.trade_case_id == tc.id))).scalars().all())
    etd = str(shipments[0].etd) if shipments and shipments[0].etd else None
    eta = str(shipments[0].eta) if shipments and shipments[0].eta else None
    fx_status = None
    if tc.btb_lc_id:
        btb = await db.get(BtbLc, tc.btb_lc_id)
        ref = btb.reference if btb else None
        if ref:
            fx = (
                await db.execute(
                    select(FxReceipt)
                    .where(FxReceipt.tenant_id == tenant_id, FxReceipt.source_ref.ilike(f"%{ref}%"))
                    .limit(1)
                )
            ).scalar_one_or_none()
            if fx:
                fx_status = fx.status
    return {
        "trade_case_id": tc.id,
        "current_stage": tc.current_stage,
        "status": tc.status,
        "document_count": doc_count,
        "shipment_etd": etd,
        "shipment_eta": eta,
        "fx_receipt_status": fx_status,
    }


async def build_order_detail_enriched(
    db: AsyncSession, *, tenant_id: int, party_id: int, order_id: int
) -> dict[str, Any] | None:
    """Full financed-order detail payload for external financier portal."""
    from app.modules.orders.pipeline_service import build_milestone_payload

    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if order_id not in order_btbs:
        return None
    row = await db.execute(
        select(Order, Customer.name)
        .outerjoin(Customer, Order.customer_id == Customer.id)
        .where(Order.tenant_id == tenant_id, Order.id == order_id)
    )
    fetched = row.first()
    if not fetched:
        return None
    o, buyer_name = fetched[0], fetched[1]
    pipeline = await build_milestone_payload(db, tenant_id=tenant_id, order_id=order_id)
    production = await build_production_row_for_order(db, tenant_id=tenant_id, order=o, buyer_name=buyer_name)
    finance = await build_order_finance_for_order(
        db, tenant_id=tenant_id, party_id=party_id, order_id=order_id, order_btbs=order_btbs
    )
    raw_materials = await build_raw_material_rows_for_order(db, tenant_id=tenant_id, party_id=party_id, order_id=order_id)
    commercial = await build_commercial_links_for_order(
        db, tenant_id=tenant_id, party_id=party_id, order_id=order_id, order_btbs=order_btbs
    )
    trade = await build_trade_summary_for_order(db, tenant_id=tenant_id, order_id=order_id)
    rm_summary = {"line_count": len(raw_materials), "in_house_status": "pending"}
    if raw_materials:
        statuses = {r.get("in_house_status") for r in raw_materials}
        if statuses == {"fully_received"}:
            rm_summary["in_house_status"] = "fully_received"
        elif "partial" in statuses or "fully_received" in statuses:
            rm_summary["in_house_status"] = "partial"
    return {
        "id": o.id,
        "order_code": o.order_code,
        "buyer_name": buyer_name,
        "status": o.status,
        "quantity": o.quantity,
        "order_date": o.order_date,
        "delivery_date": o.delivery_date,
        "updated_at": o.updated_at,
        "pipeline": pipeline,
        "production": production,
        "finance": finance,
        "raw_materials": raw_materials,
        "raw_material_summary": rm_summary,
        "commercial": commercial,
        "trade": trade,
    }


async def build_financed_order_book_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int, limit: int, offset: int
) -> tuple[list[dict[str, Any]], int]:
    """Paginated order book limited to party-financed orders with summary columns."""
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    oids = sorted(order_btbs.keys(), reverse=True)
    total = len(oids)
    page_ids = oids[offset : offset + limit]
    if not page_ids:
        return [], total
    fetched = await db.execute(
        select(Order, Customer.name)
        .outerjoin(Customer, Order.customer_id == Customer.id)
        .where(Order.tenant_id == tenant_id, Order.id.in_(page_ids))
    )
    order_rows = {o.id: (o, name) for o, name in fetched.all()}
    sewing_pct_by_order = await _sewing_pct_by_order(
        db, tenant_id=tenant_id, orders=[o for o, _ in order_rows.values()]
    )
    page_btb_ids = sorted({bid for oid in page_ids for bid in order_btbs[oid]})
    page_utils = await fsel.utilizations_for_party_btbs(db, tenant_id, party_id, page_btb_ids)
    items: list[dict[str, Any]] = []
    for oid in page_ids:
        if oid not in order_rows:
            continue
        o, name = order_rows[oid]
        bset = order_btbs[oid]
        order_utils = [u for u in page_utils if u.linked_btb_lc_id in bset]
        fin = _utilization_totals(order_utils) if order_utils else None
        items.append(
            {
                "id": o.id,
                "order_code": o.order_code,
                "buyer_name": name,
                "status": o.status,
                "quantity": o.quantity,
                "planned_shipment": None,
                "expected_delivery": o.delivery_date,
                "execution_status": o.status,
                "pipeline_status": o.pipeline_status,
                "sewing_pct": sewing_pct_by_order.get(oid),
                "outstanding_finance": fin.get("outstanding_finance_amount") if fin else None,
                "finance_currency": fin.get("finance_currency") if fin else None,
            }
        )
    return items, total


async def build_production_detail_for_order(
    db: AsyncSession, *, tenant_id: int, party_id: int, order_id: int
) -> dict[str, Any] | None:
    """Deeper production drill-down: daily trend, line bookings, QC history, process orders."""
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if order_id not in order_btbs:
        return None
    o = await db.get(Order, order_id)
    if not o or o.tenant_id != tenant_id:
        return None
    today = await tenant_today(db, tenant_id)
    d0 = today - timedelta(days=13)
    daily_rows = await db.execute(
        select(HourlyProductionEntry.production_date, func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0))
        .where(
            HourlyProductionEntry.tenant_id == tenant_id,
            HourlyProductionEntry.order_id == order_id,
            HourlyProductionEntry.production_date >= d0,
            HourlyProductionEntry.department_type.ilike("%sew%"),
        )
        .group_by(HourlyProductionEntry.production_date)
        .order_by(HourlyProductionEntry.production_date.asc())
    )
    sewing_daily = [{"date": str(r[0]), "good_qty": float(r[1] or 0)} for r in daily_rows.all()]
    line_bookings = list(
        (
            await db.execute(
                select(SewingLineStyleConfig).where(
                    SewingLineStyleConfig.tenant_id == tenant_id, SewingLineStyleConfig.order_id == order_id
                )
            )
        )
        .scalars()
        .all()
    )
    lines = [
        {
            "line_code": lb.line_code,
            "reservation_status": lb.reservation_status,
            "planned_qty": float(lb.planned_qty or 0),
            "completed_qty": float(lb.completed_qty or 0),
            "start_date": lb.start_date.isoformat() if lb.start_date else None,
            "planned_end_date": lb.planned_end_date.isoformat() if lb.planned_end_date else None,
            "actual_end_date": lb.actual_end_date.isoformat() if lb.actual_end_date else None,
        }
        for lb in line_bookings
    ]
    qc_rows = list(
        (
            await db.execute(
                select(ProductionQcCheck)
                .where(ProductionQcCheck.tenant_id == tenant_id, ProductionQcCheck.order_id == order_id)
                .order_by(ProductionQcCheck.production_date.desc())
                .limit(5)
            )
        )
        .scalars()
        .all()
    )
    qc_history = []
    for chk in qc_rows:
        tot = int(chk.total_checked or 0)
        passed = int(chk.pass_qty or 0)
        rate = round(100 * passed / tot, 1) if tot > 0 else None
        qc_history.append(
            {
                "production_date": str(chk.production_date) if chk.production_date else None,
                "check_type": chk.check_type,
                "pass_rate": rate,
                "total_checked": tot,
                "pass_qty": passed,
            }
        )
    process_orders = list(
        (
            await db.execute(
                select(ProcessOrder).where(ProcessOrder.tenant_id == tenant_id, ProcessOrder.source_order_id == order_id)
            )
        )
        .scalars()
        .all()
    )
    po_payload = [
        {
            "id": p.id,
            "process_number": p.process_number,
            "status": p.status,
            "process_stage": p.process_stage,
            "process_type": p.process_type,
            "qty_in": float(p.input_quantity or 0),
            "qty_out": _float_qty(p.actual_output_qty),
        }
        for p in process_orders
    ]
    return {
        "order_id": order_id,
        "sewing_daily_last_14d": sewing_daily,
        "line_bookings": lines,
        "qc_history": qc_history,
        "process_orders": po_payload,
    }


async def build_order_documents_for_party(
    db: AsyncSession, *, tenant_id: int, party_id: int, order_id: int
) -> list[dict[str, Any]]:
    """Trade document metadata for a financed order (no file bytes; downloads gated by tenant flag)."""
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if order_id not in order_btbs:
        return []
    tc = (
        await db.execute(
            select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.order_id == order_id).limit(1)
        )
    ).scalar_one_or_none()
    if not tc:
        return []
    docs = list(
        (await db.execute(select(TradeDocument).where(TradeDocument.trade_case_id == tc.id).limit(50))).scalars().all()
    )
    return [
        {
            "id": d.id,
            "document_type": d.document_type,
            "file_name": d.file_name,
            "version": d.version,
            "linked_entity_type": d.linked_entity_type,
        }
        for d in docs
    ]
