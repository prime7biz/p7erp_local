"""Financier ERP visibility: order finance, raw materials, production, financial signals (read-only DTOs)."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.external_access.financier_portal import facility_selectors as fsel
from app.models import BtbLc, BtbLcAccounting, Customer, Order, Quotation
from app.models.commercial import MasterContract
from app.models.costing import Item, ItemCategory
from app.models.merch import GarmentStyle
from app.models.facility import FacilityUtilization, RepaymentScheduleLine
from app.models.finance import FxReceipt
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, PurchaseOrder, PurchaseOrderItem, Warehouse
from app.models.production import CutTicket, HourlyProductionEntry, ProductionQcCheck, SewingLineStyleConfig
from app.models.trade import Shipment, TradeCase, TradeDocument


def _float_qty(s: str | None) -> float:
    if not s:
        return 0.0
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


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
    out: list[dict[str, Any]] = []
    for poi, po in poi_rows[:800]:
        btb_id = po.btb_lc_id
        btb = btb_map.get(int(btb_id)) if btb_id else None
        item = await db.get(Item, poi.item_id)
        cat_name = None
        if item:
            cat = await db.get(ItemCategory, item.category_id)
            cat_name = cat.name if cat else None
        wh = await db.get(Warehouse, poi.warehouse_id) if poi.warehouse_id else None
        if not wh and item and item.default_warehouse_id:
            wh = await db.get(Warehouse, item.default_warehouse_id)
        ordered = _float_qty(poi.quantity)
        received = 0.0
        gri_rows = list(
            (
                await db.execute(
                    select(GoodsReceivingItem).where(
                        GoodsReceivingItem.tenant_id == tenant_id,
                        GoodsReceivingItem.purchase_order_line_id == poi.id,
                    )
                )
            ).scalars().all()
        )
        for gri in gri_rows:
            received += _float_qty(gri.accepted_qty) or _float_qty(gri.received_qty)
        pending = max(ordered - received, 0.0)
        if pending <= 0.001 and ordered > 0:
            in_house = "fully_received"
        elif received > 0:
            in_house = "partial"
        else:
            in_house = "pending"
        order_code = None
        if poi.source_order_id:
            o = await db.get(Order, poi.source_order_id)
            order_code = o.order_code if o else None
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


async def build_production_tracker_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if not order_btbs:
        return [], "No financed orders in scope."
    items: list[dict[str, Any]] = []
    for oid in sorted(order_btbs.keys()):
        o = await db.get(Order, oid)
        if not o or o.tenant_id != tenant_id:
            continue
        cust = await db.get(Customer, o.customer_id)
        buyer = cust.name if cust else None
        oqty = float(o.quantity or 0) or 0.0

        ctickets = list(
            (
                await db.execute(select(CutTicket).where(CutTicket.tenant_id == tenant_id, CutTicket.order_id == oid))
            ).scalars().all()
        )
        cut_pcs = sum(int(t.total_pcs_cut or 0) for t in ctickets)
        cut_pct = round(100 * cut_pcs / oqty, 1) if oqty > 0 else 0.0
        if not ctickets:
            cutting_status, cutting_pct = "not_started", 0.0
        elif all((t.status or "").lower() in ("completed", "closed", "posted") for t in ctickets):
            cutting_status, cutting_pct = "completed", min(cut_pct, 100.0) if oqty else 100.0
        else:
            cutting_status = "in_progress"
            cutting_pct = cut_pct

        slcf = list(
            (
                await db.execute(
                    select(SewingLineStyleConfig).where(
                        SewingLineStyleConfig.tenant_id == tenant_id, SewingLineStyleConfig.order_id == oid
                    )
                )
            ).scalars().all()
        )
        sew_good = 0.0
        sew_plan = 0.0
        for c in slcf:
            sew_good += float(c.completed_qty or 0)
            sew_plan += float(c.planned_qty or 0)
        if slcf:
            denom = sew_plan or oqty or 1.0
            sew_pct = round(100 * sew_good / denom, 1)
            st = {x.status for x in slcf}
            if all((s or "").lower() in ("completed", "closed", "done") for s in st):
                sewing_status, sewing_pct = "completed", min(sew_pct, 100.0)
            elif sew_good > 0:
                sewing_status, sewing_pct = "in_progress", sew_pct
            else:
                sewing_status, sewing_pct = "in_progress", 0.0
        else:
            hsew = (
                await db.execute(
                    select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                        HourlyProductionEntry.tenant_id == tenant_id,
                        HourlyProductionEntry.order_id == oid,
                        HourlyProductionEntry.department_type.ilike("%sew%"),
                    )
                )
            ).scalar_one()
            g = float(hsew or 0)
            sew_pct = round(100 * g / oqty, 1) if oqty > 0 else 0.0
            sewing_status, sewing_pct = _stage_from_pct(sew_pct, g > 0)

        hfin = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant_id,
                    HourlyProductionEntry.order_id == oid,
                    HourlyProductionEntry.department_type.ilike("%finish%"),
                )
            )
        ).scalar_one()
        g2 = float(hfin or 0)
        fin_pct = round(100 * g2 / oqty, 1) if oqty > 0 else 0.0
        finishing_status, finishing_pct = _stage_from_pct(fin_pct, g2 > 0)

        qc_rows = list(
            (
                await db.execute(
                    select(ProductionQcCheck).where(
                        ProductionQcCheck.tenant_id == tenant_id, ProductionQcCheck.order_id == oid
                    )
                )
            ).scalars().all()
        )
        if qc_rows:
            chk = max(qc_rows, key=lambda x: x.production_date)
            tot = int(chk.total_checked or 0)
            passed = int(chk.pass_qty or 0)
            rate = round(100 * passed / tot, 1) if tot > 0 else None
            inspection_status = (chk.check_type or "qc") + (" ok" if (rate or 0) >= 95 else " review")
        else:
            rate = None
            inspection_status = "not_started"

        ship_tgt = o.delivery_date.isoformat() if o.delivery_date else None
        ship_act = o.shipped_at.date().isoformat() if o.shipped_at else None
        if not ship_act:
            tc = (
                await db.execute(
                    select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.order_id == oid).limit(1)
                )
            ).scalar_one_or_none()
            if tc:
                sh = list(
                    (
                        await db.execute(select(Shipment).where(Shipment.trade_case_id == tc.id))
                    ).scalars().all()
                )
                if sh and sh[0].etd:
                    ship_act = str(sh[0].etd)

        items.append(
            {
                "order_id": oid,
                "order_code": o.order_code,
                "buyer_name": buyer,
                "order_qty": int(o.quantity or 0),
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
    return items, None


async def build_financial_visibility_rows(
    db: AsyncSession, *, tenant_id: int, party_id: int
) -> tuple[list[dict[str, Any]], str | None]:
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    if not btb_rows:
        return [], "No BTB LCs in scope."
    items: list[dict[str, Any]] = []
    for b in btb_rows:
        acc = (
            await db.execute(select(BtbLcAccounting).where(BtbLcAccounting.tenant_id == tenant_id, BtbLcAccounting.btb_lc_id == b.id))
        ).scalar_one_or_none()
        bank_charges_note = "not_posted"
        if acc and acc.lc_open_voucher_id:
            bank_charges_note = "lc_open_voucher_posted"
        if acc and acc.import_bill_voucher_id:
            bank_charges_note = "import_bill_posted"
        if acc and acc.realization_voucher_id:
            bank_charges_note = "realized"
        doc_count = 0
        tcs = list(
            (await db.execute(select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.btb_lc_id == b.id))).scalars().all()
        )
        for tc in tcs:
            doc_count += int(
                (await db.execute(select(func.count()).select_from(TradeDocument).where(TradeDocument.trade_case_id == tc.id))).scalar()
                or 0
            )
        export_docs_submitted = doc_count > 0
        mc_exp = None
        if b.master_contract_id:
            mc = await db.get(MasterContract, b.master_contract_id)
            if mc and mc.expiry_date:
                mc_exp = mc.expiry_date.isoformat()
        exp_coll = None
        if b.maturity_date:
            exp_coll = b.maturity_date.isoformat()
        elif mc_exp:
            exp_coll = mc_exp

        utils = await fsel.utilizations_for_party_btbs(db, tenant_id, party_id, [b.id])
        draft_reserve = False
        for u in utils:
            lines = list(
                (
                    await db.execute(
                        select(RepaymentScheduleLine).where(
                            RepaymentScheduleLine.tenant_id == tenant_id,
                            RepaymentScheduleLine.facility_utilization_id == u.id,
                            RepaymentScheduleLine.status.in_(("upcoming", "due", "partially_paid")),
                        )
                    )
                ).scalars().all()
            )
            if any(ln.draft_voucher_id for ln in lines):
                draft_reserve = True
                break

        fx_rows = list((await db.execute(select(FxReceipt).where(FxReceipt.tenant_id == tenant_id))).scalars().all())
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
    items: list[dict[str, Any]] = []
    for b in btb_rows:
        ul = util_by_btb.get(b.id, [])
        util_payload: list[dict[str, Any]] = []
        all_upcoming: list[dict[str, Any]] = []
        for u in ul:
            sched = await fsel.schedule_for_utilization(db, tenant_id, u.id)
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
