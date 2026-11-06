"""Financier portal round 2: batched SQL returns the same JSON as the old per-row code.

Covers /credit-lines, /production-tracker, /financial-visibility, /btb-liabilities and the
inventory views (/inventory-overview, /inventory-by-group, /inventory-ledger,
/inventory-reconciliation, /inventory-balance-sheet).
The `_old_*` functions are frozen copies of the pre-rewrite algorithms (reference only).
With an ``as_of_date`` the reference quantities and FIFO numbers come from the shared inventory
helpers, because as-of valuation is maintained there and is not part of this batching rewrite.

Run: docker compose exec backend pytest tests/test_perf_financier_round2_equivalence.py -q -s
"""

from __future__ import annotations

import time as time_mod
import uuid
from collections import defaultdict
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import case, cast, desc, event, func, or_, select
from sqlalchemy.types import Date as SQLDate, Numeric

from app.external_access.constants import PRINCIPAL_FINANCIER, SCOPE_FULL_FINANCIER_PORTAL
from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.financier_portal import financier_inventory_service as inv_svc
from app.external_access.financier_portal import visibility_service as vis_svc
from app.models import BtbLc, BtbLcAccounting, Customer, MasterContract, Order
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.external_access import ExternalFinancierAccess, ExternalPrincipal, ExternalPrincipalRole
from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine
from app.models.finance import AccountGroup, ChartOfAccount, CoAConfig, FxReceipt, Voucher
from app.models.inventory import (
    InventoryCostLayer,
    InventoryGlPosting,
    ProcessOrder,
    PurchaseOrder,
    PurchaseOrderItem,
    StockGroup,
    StockMovement,
    Warehouse,
)
from app.models.production import (
    CutTicket,
    HourlyProductionEntry,
    LayPlan,
    MarkerPlan,
    ProductionQcCheck,
    ProductionShift,
    SewingLine,
    SewingLineStyleConfig,
)
from app.models.trade import Shipment, TradeCase, TradeDocument
from tests.test_financier_tenant_scoping import _old_order_btb_links_for_party
from tests.query_counting import is_rls_housekeeping
from tests.test_perf_financier_equivalence import _ensure_financier_role, _json, _new_tenant, financier_client

API = "/api/external/financier"


@contextmanager
def count_queries(db):
    """Count SQL statements sent to PostgreSQL while the block runs."""
    counter = {"n": 0}
    engine = db.bind.sync_engine

    def _on_execute(_conn, _cursor, statement, *_rest):
        if not is_rls_housekeeping(statement):
            counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


def _float_qty(s) -> float:
    if not s:
        return 0.0
    try:
        return float(str(s).replace(",", ""))
    except (TypeError, ValueError):
        return 0.0


def _to_float(value) -> float:
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value or "0")
    except (TypeError, ValueError):
        return 0.0


# ---------- Old (pre-rewrite) reference algorithms: visibility ----------


async def _old_credit_lines(db, tenant_id: int, party_id: int) -> list[dict]:
    facs = await fsel.list_facilities_for_financier(db, tenant_id, party_id)
    items = []
    for f in facs:
        san = float(f.sanctioned_amount or 0)
        util = float(f.utilized_amount or 0)
        btb_ref = None
        mc_ref = None
        if f.linked_btb_lc_id:
            b = await db.get(BtbLc, int(f.linked_btb_lc_id))
            if b and b.tenant_id == tenant_id:
                btb_ref = b.reference
        if f.linked_master_contract_id:
            mc = await db.get(MasterContract, int(f.linked_master_contract_id))
            if mc and mc.tenant_id == tenant_id:
                mc_ref = mc.reference
        items.append(
            {
                "id": f.id,
                "facility_code": f.facility_code,
                "facility_type": f.facility_type,
                "sanctioned_amount": san,
                "utilized_amount": util,
                "available_amount": round(max(san - util, 0), 2),
                "currency": f.currency,
                "status": f.status,
                "linked_btb_lc_id": f.linked_btb_lc_id,
                "linked_master_contract_id": f.linked_master_contract_id,
                "btb_lc_reference": btb_ref,
                "master_contract_reference": mc_ref,
                "facility_expiry_date": f.expiry_date.isoformat() if f.expiry_date else None,
                "interest_rate": float(f.interest_rate) if f.interest_rate is not None else None,
            }
        )
    return items


async def _old_production_row_for_order(db, *, tenant_id: int, order: Order, buyer_name=None) -> dict:
    oid = order.id
    oqty = float(order.quantity or 0) or 0.0
    ctickets = list(
        (await db.execute(select(CutTicket).where(CutTicket.tenant_id == tenant_id, CutTicket.order_id == oid)))
        .scalars()
        .all()
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
        )
        .scalars()
        .all()
    )
    hourly_sew_qty = 0.0
    if not slcf:
        hsew = (
            await db.execute(
                select(func.coalesce(func.sum(HourlyProductionEntry.good_qty), 0)).where(
                    HourlyProductionEntry.tenant_id == tenant_id,
                    HourlyProductionEntry.order_id == oid,
                    HourlyProductionEntry.department_type.ilike("%sew%"),
                )
            )
        ).scalar_one()
        hourly_sew_qty = float(hsew or 0)
    sewing_status, sewing_pct = vis_svc._sewing_stage(slcf, hourly_sew_qty, oqty)
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
    finishing_status, finishing_pct = vis_svc._stage_from_pct(fin_pct, g2 > 0)
    qc_rows = list(
        (
            await db.execute(
                select(ProductionQcCheck).where(
                    ProductionQcCheck.tenant_id == tenant_id, ProductionQcCheck.order_id == oid
                )
            )
        )
        .scalars()
        .all()
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
    ship_tgt = order.delivery_date.isoformat() if order.delivery_date else None
    ship_act = order.shipped_at.date().isoformat() if order.shipped_at else None
    if not ship_act:
        tc = (
            await db.execute(
                select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.order_id == oid).limit(1)
            )
        ).scalar_one_or_none()
        if tc:
            sh = list((await db.execute(select(Shipment).where(Shipment.trade_case_id == tc.id))).scalars().all())
            if sh and sh[0].etd:
                ship_act = str(sh[0].etd)
    return {
        "order_id": oid,
        "order_code": order.order_code,
        "buyer_name": buyer_name,
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


async def _old_production_tracker_rows(db, *, tenant_id: int, party_id: int):
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    if not order_btbs:
        return [], "No financed orders in scope."
    items = []
    for oid in sorted(order_btbs.keys()):
        o = await db.get(Order, oid)
        if not o or o.tenant_id != tenant_id:
            continue
        cust = await db.get(Customer, o.customer_id)
        # Tenant check added with the tenant-leak fix (tests/test_financier_tenant_scoping.py).
        buyer = cust.name if cust and cust.tenant_id == tenant_id else None
        items.append(await _old_production_row_for_order(db, tenant_id=tenant_id, order=o, buyer_name=buyer))
    return items, None


async def _old_financial_visibility_rows(db, *, tenant_id: int, party_id: int):
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    if not btb_rows:
        return [], "No BTB LCs in scope."
    items = []
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
            if mc and mc.tenant_id == tenant_id and mc.expiry_date:
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


async def _old_btb_liabilities_rows(db, *, tenant_id: int, party_id: int):
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    if not btb_rows:
        return [], "No BTB LCs in scope."
    utils_all = await fsel.list_utilizations_for_financier(db, tenant_id, party_id)
    util_by_btb = defaultdict(list)
    for u in utils_all:
        if u.linked_btb_lc_id:
            util_by_btb[int(u.linked_btb_lc_id)].append(u)
    items = []
    for b in btb_rows:
        ul = util_by_btb.get(b.id, [])
        util_payload = []
        all_upcoming = []
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


# ---------- Old (pre-rewrite) reference algorithms: inventory ----------


async def _old_stock_summary_rows(db, tenant_id: int) -> list:
    qty_col = cast(StockMovement.quantity, Numeric)
    in_agg = func.coalesce(func.sum(case((StockMovement.movement_type == "IN", qty_col), else_=0)), 0)
    out_agg = func.coalesce(func.sum(case((StockMovement.movement_type != "IN", qty_col), else_=0)), 0)
    agg_rows = list(
        (
            await db.execute(
                select(StockMovement.item_id, StockMovement.warehouse_id, in_agg, out_agg)
                .where(StockMovement.tenant_id == tenant_id)
                .group_by(StockMovement.item_id, StockMovement.warehouse_id)
            )
        ).all()
    )
    item_ids = {int(r[0]) for r in agg_rows}
    wh_ids = {int(r[1]) for r in agg_rows if r[1] is not None}
    item_map = {}
    if item_ids:
        res = await db.execute(select(Item).where(Item.tenant_id == tenant_id, Item.id.in_(item_ids)))
        item_map = {r.id: r for r in res.scalars().all()}
    wh_map = {}
    if wh_ids:
        res = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id, Warehouse.id.in_(wh_ids)))
        wh_map = {r.id: r for r in res.scalars().all()}
    rows = []
    for item_id, warehouse_id, in_raw, out_raw in agg_rows:
        item = item_map.get(item_id)
        if not item:
            continue
        in_qty = float(in_raw or 0)
        out_qty = float(out_raw or 0)
        wh = wh_map.get(warehouse_id) if warehouse_id is not None else None
        rows.append(
            SimpleNamespace(
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


async def _old_fifo_layer_qty_value_map(db, tenant_id: int, as_of_date=None) -> dict:
    if as_of_date is not None:
        # As-of FIFO valuation is owned by the shared inventory helper (changed separately), not this rewrite.
        from app.modules.inventory.router import _fifo_layer_qty_value_map

        return await _fifo_layer_qty_value_map(db, tenant_id, as_of_date)
    layer = InventoryCostLayer
    stmt = (
        select(layer.item_id, layer.warehouse_id, layer.qty_remaining, layer.unit_cost)
        .where(layer.tenant_id == tenant_id, layer.qty_remaining > 0)
        .order_by(layer.id)
    )
    acc = defaultdict(lambda: [0.0, 0.0])
    for item_id, warehouse_id, qty_remaining, unit_cost in (await db.execute(stmt)).all():
        qr = _to_float(qty_remaining)
        if qr <= 0:
            continue
        key = (item_id, warehouse_id)
        uc = _to_float(unit_cost)
        acc[key][0] += qr
        acc[key][1] += qr * uc
    return {k: (v[0], round(v[1], 4)) for k, v in acc.items()}


def _old_line_from_summary(s, item_map, fifo_map):
    item = item_map.get(s.item_id)
    fq, fv = fifo_map.get((s.item_id, s.warehouse_id), (0.0, 0.0))
    if fq > 1e-9 and fv > 0:
        uc = fv / fq
        lv = round(fv, 2)
    else:
        uc = _to_float(item.default_cost if item else "0")
        lv = round(s.on_hand_qty * uc, 2)
    return SimpleNamespace(
        item_id=s.item_id,
        item_code=s.item_code,
        item_name=s.item_name,
        warehouse_id=s.warehouse_id,
        warehouse_name=s.warehouse_name,
        on_hand_qty=s.on_hand_qty,
        unit_cost=round(uc, 4),
        line_value=lv,
    )


async def _old_fifo_on_hand_value(db, tenant_id: int, *, as_of_date=None) -> float:
    if as_of_date is not None:
        from app.services.fifo_inventory import fifo_on_hand_value

        return await fifo_on_hand_value(db, tenant_id, as_of_date=as_of_date)
    stmt = select(InventoryCostLayer).where(InventoryCostLayer.tenant_id == tenant_id)
    total = 0.0
    for layer in (await db.execute(stmt)).scalars().all():
        total += _to_float(layer.qty_remaining) * _to_float(layer.unit_cost)
    return round(total, 4)


async def _old_wip_total_value(db, tenant_id: int) -> float:
    pos = (
        await db.execute(select(ProcessOrder).where(ProcessOrder.tenant_id == tenant_id, ProcessOrder.status == "ISSUED"))
    ).scalars().all()
    total = 0.0
    for po in pos:
        mvs = (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == "PROCESS_ORDER",
                    StockMovement.reference_id == po.id,
                    StockMovement.movement_type == "OUT",
                    StockMovement.item_id == po.input_item_id,
                )
            )
        ).scalars().all()
        total += sum(_to_float(m.movement_value or "0") for m in mvs)
    return round(total, 2)


async def _summary_rows(db, tenant_id: int, as_of_date=None):
    """Old summary rows for today; with an as-of date the shared as-of balances (quantities on that date)."""
    if as_of_date is None:
        return await _old_stock_summary_rows(db, tenant_id)
    from app.modules.inventory import stock_report_queries

    return await stock_report_queries.load_stock_balance_lines(db, tenant_id, None, as_of_date=as_of_date)


async def _old_inventory_overview(db, *, tenant_id: int, as_of_date=None) -> dict:
    stock_v = await _old_fifo_on_hand_value(db, tenant_id, as_of_date=as_of_date)
    wip = await _old_wip_total_value(db, tenant_id)
    summary = await _summary_rows(db, tenant_id, as_of_date)
    pos_count = sum(1 for r in summary if r.on_hand_qty > 0)
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars().all()}
    gids = set()
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        it = item_map.get(s.item_id)
        gids.add(it.stock_group_id if it else None)
    return {
        "as_of_date": as_of_date.isoformat() if as_of_date else None,
        "total_inventory_value": round(stock_v, 2),
        "total_wip_value": wip,
        "grand_total": round(stock_v + wip, 2),
        "item_position_count": pos_count,
        "item_count": pos_count,
        "category_count": len(gids),
    }


async def _old_inventory_by_group(db, *, tenant_id: int, party_id, as_of_date=None, btb_scope: bool = False) -> dict:
    fifo_map = await _old_fifo_layer_qty_value_map(db, tenant_id, as_of_date)
    summary = await _summary_rows(db, tenant_id, as_of_date)
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars().all()}
    sg_map = {
        r.id: r for r in (await db.execute(select(StockGroup).where(StockGroup.tenant_id == tenant_id))).scalars().all()
    }
    allowed = None
    if btb_scope:
        if not party_id:
            return {"as_of_date": as_of_date.isoformat() if as_of_date else None, "groups": [], "note": "No party link."}
        allowed = await inv_svc._party_btb_item_ids(db, tenant_id, party_id)
        if not allowed:
            return {
                "as_of_date": as_of_date.isoformat() if as_of_date else None,
                "groups": [],
                "note": "No PO lines under linked BTB LCs.",
            }
    by_gid = defaultdict(list)
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        if allowed is not None and s.item_id not in allowed:
            continue
        it = item_map.get(s.item_id)
        gid = it.stock_group_id if it else None
        by_gid[gid].append(_old_line_from_summary(s, item_map, fifo_map))
    blocks = []
    for gid, lines in sorted(by_gid.items(), key=lambda x: (x[0] is None, x[0] or 0)):
        lines.sort(key=lambda r: (r.item_code, r.warehouse_name or ""))
        tq = sum(r.on_hand_qty for r in lines)
        tv = sum(r.line_value for r in lines)
        sg = sg_map.get(gid) if gid is not None else None
        blocks.append(
            {
                "stock_group_id": gid,
                "stock_group_code": sg.group_code if sg else None,
                "stock_group_name": sg.name if sg else "Uncategorized",
                "total_qty": round(tq, 4),
                "total_value": round(tv, 2),
                "lines": [
                    {
                        "item_id": r.item_id,
                        "item_code": r.item_code,
                        "item_name": r.item_name,
                        "warehouse_id": r.warehouse_id,
                        "warehouse_name": r.warehouse_name,
                        "on_hand_qty": r.on_hand_qty,
                        "unit_cost": r.unit_cost,
                        "line_value": r.line_value,
                    }
                    for r in lines
                ],
            }
        )
    return {"as_of_date": as_of_date.isoformat() if as_of_date else None, "groups": blocks}


def _old_gl_lookup_keys(m) -> list:
    rt = (m.reference_type or "").upper()
    rid = m.reference_id
    if rid is None:
        return []
    mt = (m.movement_type or "").upper()
    if rt == "GRN":
        return [("GRN", "RECEIPT", int(rid))]
    if rt == "DELIVERY_CHALLAN":
        return [("DELIVERY_CHALLAN", "POSTED", int(rid))]
    if rt == "PROCESS_ORDER":
        if mt == "OUT":
            return [("PROCESS_ORDER", "ISSUE", int(rid))]
        if mt == "IN":
            return [("PROCESS_ORDER", "RECEIVE", int(rid))]
    if rt == "STOCK_ADJUSTMENT":
        return [("STOCK_ADJUSTMENT", "POST", int(rid))]
    if rt == "PHYSICAL_COUNT":
        return [("PHYSICAL_COUNT", "POST", int(rid))]
    return []


async def _old_inventory_ledger(
    db, *, tenant_id, item_id, warehouse_id, date_from, date_to, limit, offset, include_gl=True
) -> dict:
    sm = StockMovement
    eff = func.coalesce(sm.movement_date, cast(sm.created_at, SQLDate))
    qty_n = cast(sm.quantity, Numeric)
    signed_qty = case((sm.movement_type == "IN", qty_n), else_=-qty_n)
    wh_key = func.coalesce(sm.warehouse_id, -1)
    running_bal = func.sum(signed_qty).over(partition_by=(sm.item_id, wh_key), order_by=(eff.asc(), sm.id.asc()))
    inner = select(
        sm.id, sm.movement_date, sm.movement_type, sm.item_id, sm.warehouse_id, sm.quantity, sm.reference_type,
        sm.reference_id, sm.notes, sm.created_by_user_id, sm.created_at, eff.label("eff_date"),
        running_bal.label("running_balance"),
    ).where(sm.tenant_id == tenant_id)
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
    page_stmt = page_stmt.order_by(desc(sq.c.eff_date).nulls_last(), desc(sq.c.id)).limit(limit).offset(offset)
    raw_rows = list((await db.execute(page_stmt)).mappings())
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars().all()}
    wh_map = {r.id: r for r in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant_id))).scalars().all()}
    gl_keys = []
    by_mid = {}
    if include_gl and raw_rows:
        mids = [int(r["id"]) for r in raw_rows]
        mrows = (await db.execute(select(StockMovement).where(StockMovement.id.in_(mids)))).scalars().all()
        by_mid = {m.id: m for m in mrows}
        for m in mrows:
            gl_keys.extend(_old_gl_lookup_keys(m))
    posting_map = {}
    if include_gl and gl_keys:
        conds = [
            (InventoryGlPosting.source_system == s) & (InventoryGlPosting.action == a) & (InventoryGlPosting.source_id == sid)
            for s, a, sid in list(set(gl_keys))
        ]
        pr = await db.execute(select(InventoryGlPosting).where(InventoryGlPosting.tenant_id == tenant_id, or_(*conds)))
        for p in pr.scalars().all():
            posting_map[(p.source_system, p.action, int(p.source_id))] = p
    voucher_ids = {p.voucher_id for p in posting_map.values()}
    vch_map = {}
    if voucher_ids:
        vr = await db.execute(select(Voucher).where(Voucher.tenant_id == tenant_id, Voucher.id.in_(voucher_ids)))
        vch_map = {v.id: v for v in vr.scalars().all()}
    current_stock = 0.0
    current_value = 0.0
    if item_id is not None:
        fifo_map = await _old_fifo_layer_qty_value_map(db, tenant_id, None)
        for s in await _old_stock_summary_rows(db, tenant_id):
            if s.item_id != item_id:
                continue
            if warehouse_id is not None and s.warehouse_id != warehouse_id:
                continue
            current_stock += s.on_hand_qty
            current_value += _old_line_from_summary(s, item_map, fifo_map).line_value
    out_items = []
    for row in raw_rows:
        iid = row["item_id"]
        wid = row["warehouse_id"]
        rb = row["running_balance"]
        gl_posted = False
        voucher_id = None
        voucher_code = None
        m = by_mid.get(int(row["id"]))
        if m and include_gl:
            for key in _old_gl_lookup_keys(m):
                pst = posting_map.get(key)
                if pst:
                    gl_posted = True
                    voucher_id = pst.voucher_id
                    v = vch_map.get(pst.voucher_id)
                    if v:
                        voucher_code = getattr(v, "voucher_number", None) or getattr(v, "reference", None) or str(v.id)
                    break
        out_items.append(
            {
                "id": row["id"],
                "movement_date": str(row["movement_date"]) if row["movement_date"] else None,
                "movement_type": row["movement_type"],
                "item_id": iid,
                "item_code": item_map[iid].item_code if iid in item_map else f"#{iid}",
                "item_name": item_map[iid].name if iid in item_map else "Unknown",
                "warehouse_id": wid,
                "warehouse_name": wh_map[wid].name if wid is not None and wid in wh_map else None,
                "quantity": str(row["quantity"]),
                "reference_type": row["reference_type"],
                "reference_id": row["reference_id"],
                "notes": row["notes"],
                "running_balance": float(rb) if rb is not None else 0.0,
                "gl_posted": gl_posted,
                "voucher_id": voucher_id,
                "voucher_code": voucher_code,
            }
        )
    return {
        "items": out_items,
        "total": total,
        "current_stock": round(current_stock, 4),
        "current_value": round(current_value, 2),
    }


async def _old_sum_chart_balances(db, tenant_id: int, account_ids: list) -> float:
    if not account_ids:
        return 0.0
    accs = (
        await db.execute(select(ChartOfAccount).where(ChartOfAccount.tenant_id == tenant_id, ChartOfAccount.id.in_(account_ids)))
    ).scalars().all()
    return round(sum(_to_float(a.balance) for a in accs), 4)


async def _old_inventory_reconciliation(db, *, tenant_id: int) -> dict:
    fifo_total = await _old_fifo_on_hand_value(db, tenant_id, as_of_date=None)
    cfg = (await db.execute(select(CoAConfig).where(CoAConfig.tenant_id == tenant_id))).scalars().first()
    global_ids = set()
    if cfg and cfg.inventory_stock_account_id:
        global_ids.add(cfg.inventory_stock_account_id)
    sgs = (
        await db.execute(
            select(StockGroup).where(StockGroup.tenant_id == tenant_id, StockGroup.inventory_account_id.is_not(None))
        )
    ).scalars().all()
    for sg in sgs:
        if sg.inventory_account_id:
            global_ids.add(sg.inventory_account_id)
    for key in ("RAW_MATERIAL_INVENTORY", "FINISHED_GOODS", "PACKING_MATERIAL_INVENTORY"):
        lid = await inv_svc._maybe_resolve_system_ledger_id(db, tenant_id, key)
        if lid:
            global_ids.add(lid)
    gl_bal_total = await _old_sum_chart_balances(db, tenant_id, list(global_ids))
    fifo_map = await _old_fifo_layer_qty_value_map(db, tenant_id, None)
    summary = await _old_stock_summary_rows(db, tenant_id)
    item_map = {r.id: r for r in (await db.execute(select(Item).where(Item.tenant_id == tenant_id))).scalars().all()}
    by_gid = defaultdict(float)
    for s in summary:
        if s.on_hand_qty <= 0:
            continue
        line = _old_line_from_summary(s, item_map, fifo_map)
        it = item_map.get(s.item_id)
        by_gid[it.stock_group_id if it else None] += line.line_value
    sg_map = {r.id: r for r in sgs}
    group_rows = []
    for gid, fifo_val in sorted(by_gid.items(), key=lambda x: (x[0] is None, x[0] or 0)):
        sg = sg_map.get(gid) if gid is not None else None
        acc_id = sg.inventory_account_id if sg else None
        gl_part = await _old_sum_chart_balances(db, tenant_id, [acc_id] if acc_id else [])
        group_rows.append(
            {
                "stock_group_id": gid,
                "stock_group_code": sg.group_code if sg else None,
                "stock_group_name": sg.name if sg else "Uncategorized",
                "fifo_value": round(fifo_val, 2),
                "gl_balance": gl_part if acc_id else None,
                "variance": round(fifo_val - gl_part, 4) if acc_id else None,
            }
        )
    grni_ids = {sg.grni_account_id for sg in sgs if sg.grni_account_id}
    grni_bal = await _old_sum_chart_balances(db, tenant_id, list(grni_ids))
    return {
        "fifo_stock_value_total": round(fifo_total, 2),
        "gl_inventory_balance_total": gl_bal_total,
        "variance_total": round(fifo_total - gl_bal_total, 4),
        "groups": group_rows,
        "grni_liability_balance": grni_bal,
    }


async def _old_balance_sheet_inventory(db, *, tenant_id: int) -> dict:
    ov = await _old_inventory_overview(db, tenant_id=tenant_id, as_of_date=None)
    rec = await _old_inventory_reconciliation(db, tenant_id=tenant_id)
    inv_asset = float(ov["total_inventory_value"])
    wip = float(ov["total_wip_value"])
    grni = float(rec.get("grni_liability_balance") or 0)
    return {
        "inventory_asset_value": inv_asset,
        "wip_value": wip,
        "grni_liability": grni,
        "net_inventory_position": round(inv_asset + wip - grni, 2),
        "fifo_vs_gl_variance": rec.get("variance_total"),
    }


# ---------- Seed ----------


async def _voucher(db, tenant_id: int, code: str) -> Voucher:
    v = Voucher(tenant_id=tenant_id, voucher_number=code, voucher_type="JOURNAL", voucher_date=date.today(), status="DRAFT")
    db.add(v)
    await db.flush()
    return v


async def _account(db, tenant_id: int, slug: str, n: int, balance: str) -> ChartOfAccount:
    grp = AccountGroup(
        tenant_id=tenant_id, name=f"G{n}-{slug}", code=f"G{n}{slug}"[:12], nature="Asset",
        default_normal_balance="debit", allow_posting=True,
    )
    db.add(grp)
    await db.flush()
    acct = ChartOfAccount(
        tenant_id=tenant_id, account_number=f"A{n}-{slug}", name=f"Acc {n}", group_id=grp.id,
        normal_balance="debit", balance=Decimal(balance), is_active=True,
    )
    db.add(acct)
    await db.flush()
    return acct


async def _seed_inventory(db, tenant_id: int, slug: str, extra: int) -> dict:
    """Stock groups with/without GL accounts, NULL warehouse, exhausted + undated FIFO layers, WIP."""
    acc_inv1 = await _account(db, tenant_id, slug, 1, "1500.1234")
    acc_grni1 = await _account(db, tenant_id, slug, 2, "-300.5000")
    acc_inv2 = await _account(db, tenant_id, slug, 3, "0")
    acc_cfg = await _account(db, tenant_id, slug, 4, "50.0001")
    db.add(CoAConfig(tenant_id=tenant_id, inventory_stock_account_id=acc_cfg.id))
    g1 = StockGroup(tenant_id=tenant_id, group_code=f"GF{slug}", name="Fabric",
                    inventory_account_id=acc_inv1.id, grni_account_id=acc_grni1.id)
    g2 = StockGroup(tenant_id=tenant_id, group_code=f"GA{slug}", name="Accessories", inventory_account_id=acc_inv2.id)
    g3 = StockGroup(tenant_id=tenant_id, group_code=f"GN{slug}", name="No GL")
    cat = ItemCategory(tenant_id=tenant_id, category_code=f"IC{slug}", name="Cat")
    unit = ItemUnit(tenant_id=tenant_id, unit_code=f"IU{slug}", name="Pcs")
    w1 = Warehouse(tenant_id=tenant_id, warehouse_code=f"IW1{slug}", name="Main store")
    w2 = Warehouse(tenant_id=tenant_id, warehouse_code=f"IW2{slug}", name="annex")
    db.add_all([g1, g2, g3, cat, unit, w1, w2])
    await db.flush()

    def _item(code, name, group, cost):
        return Item(tenant_id=tenant_id, item_code=f"{code}-{slug}", name=name, category_id=cat.id, unit_id=unit.id,
                    stock_group_id=group.id if group else None, default_cost=Decimal(cost))

    i1 = _item("A-100", "Twill", g1, "2.5")
    i2 = _item("a-050", "button", g2, "0")
    i3 = _item("B_200", "Zipper", None, "1.25")
    i4 = _item("C-300", "Label", g3, "3")
    i5 = _item("D-400", "No movement", g1, "9")
    db.add_all([i1, i2, i3, i4, i5])
    await db.flush()

    pa = ProcessOrder(tenant_id=tenant_id, process_number=f"PA-{slug}", process_type="DYEING",
                      input_item_id=i1.id, output_item_id=i4.id, status="ISSUED")
    pb = ProcessOrder(tenant_id=tenant_id, process_number=f"PB-{slug}", process_type="DYEING",
                      input_item_id=i1.id, output_item_id=i4.id, status="DRAFT")
    pc = ProcessOrder(tenant_id=tenant_id, process_number=f"PC-{slug}", process_type="WASHING",
                      input_item_id=i2.id, output_item_id=i4.id, status="ISSUED")
    db.add_all([pa, pb, pc])
    await db.flush()

    base = date(2026, 1, 1)
    plan = [
        # (item, warehouse, type, qty, day offset or None, reference_type, reference_id, movement_value)
        (i1, w1, "IN", "100", 0, "GRN", 9001, None),
        (i1, w1, "OUT", "30.5", 2, "PROCESS_ORDER", pa.id, "12.50"),
        (i1, w1, "IN", "10", 2, "STOCK_ADJUSTMENT", 9002, None),
        (i1, w1, "ADJUST", "1.25", 5, None, None, None),
        (i1, w2, "IN", "40", 1, "GRN", 9003, None),
        (i1, w2, "OUT", "40", 3, "PROCESS_ORDER", pa.id, "abc"),
        (i1, None, "IN", "7", 4, "PHYSICAL_COUNT", 9004, None),
        (i1, w1, "OUT", "2", 6, "PROCESS_ORDER", pb.id, "99"),
        (i1, w1, "IN", "1", 6, "PROCESS_ORDER", pa.id, "5"),
        (i2, w1, "IN", "5", 0, "GRN", 9005, None),
        (i2, w1, "OUT", "2", 6, "PROCESS_ORDER", pa.id, "7.25"),
        (i2, w2, "IN", "3.3333", 6, None, None, None),
        (i2, w2, "IN", "0.0004", 7, "DELIVERY_CHALLAN", 9006, None),
        (i3, w2, "IN", "12", 3, None, None, None),
        (i3, w2, "OUT", "4", 8, "PROCESS_ORDER", pa.id, None),
        (i3, w1, "IN", "8", None, None, None, None),
        (i3, w1, "OUT", "8", 9, None, None, None),
        (i4, w1, "IN", "6", 1, None, None, None),
    ]
    moves = []
    for item, wh, mtype, qty, day, rtype, rid, mval in plan:
        mv = StockMovement(
            tenant_id=tenant_id, item_id=item.id, warehouse_id=wh.id if wh is not None else None, movement_type=mtype,
            quantity=Decimal(qty), movement_date=(base + timedelta(days=day)) if day is not None else None,
            created_at=datetime(2026, 1, 4, 12, 0, 0), reference_type=rtype, reference_id=rid,
            movement_value=mval, notes=f"{mtype} {qty}",
        )
        db.add(mv)
        moves.append(mv)
    extra_items = []
    for n in range(extra):
        it = _item(f"X{n:02d}", f"Extra {n}", g1 if n % 2 else g2, "1.5")
        db.add(it)
        await db.flush()
        extra_items.append(it)
        mv = StockMovement(tenant_id=tenant_id, item_id=it.id, warehouse_id=w1.id, movement_type="IN",
                           quantity=Decimal(n + 1), movement_date=base + timedelta(days=n % 5),
                           created_at=datetime(2026, 1, 4), reference_type="GRN", reference_id=9100 + n)
        db.add(mv)
        moves.append(mv)
        po = ProcessOrder(tenant_id=tenant_id, process_number=f"PX{n}-{slug}", process_type="DYEING",
                          input_item_id=it.id, output_item_id=i4.id, status="ISSUED")
        db.add(po)
        await db.flush()
        db.add(StockMovement(tenant_id=tenant_id, item_id=it.id, warehouse_id=w1.id, movement_type="OUT",
                             quantity=Decimal("0.5"), movement_date=base + timedelta(days=6),
                             created_at=datetime(2026, 1, 4), reference_type="PROCESS_ORDER",
                             reference_id=po.id, movement_value=f"{n}.25"))
    await db.flush()

    layers = [
        (moves[0], "69.5", "3.1000", base),
        (moves[2], "10", "3.3000", base + timedelta(days=2)),
        (moves[4], "0", "2.0000", base + timedelta(days=1)),
        (moves[6], "7", "1.1000", None),
        (moves[9], "3", "0.4000", base),
        (moves[13], "8", "5.0000", base + timedelta(days=3)),
        (moves[15], "0", "4.0000", None),
    ]
    layers += [(mv, str(idx + 1), "1.7500", base + timedelta(days=idx % 4)) for idx, mv in enumerate(moves[len(plan):])]
    for mv, qty_rem, uc, layer_date in layers:
        db.add(
            InventoryCostLayer(
                tenant_id=tenant_id, item_id=mv.item_id, warehouse_id=mv.warehouse_id, source_movement_id=mv.id,
                qty_original=Decimal(qty_rem) + Decimal("1"), qty_remaining=Decimal(qty_rem), unit_cost=Decimal(uc),
                layer_date=layer_date,
            )
        )
    v_grn = await _voucher(db, tenant_id, f"JV-GRN-{slug}")
    v_pa = await _voucher(db, tenant_id, f"JV-PA-{slug}")
    db.add_all(
        [
            InventoryGlPosting(tenant_id=tenant_id, source_system="GRN", source_id=9001, action="RECEIPT", voucher_id=v_grn.id),
            InventoryGlPosting(tenant_id=tenant_id, source_system="PROCESS_ORDER", source_id=pa.id, action="ISSUE",
                               voucher_id=v_pa.id),
        ]
    )
    await db.flush()
    return {"items": [i1, i2, i3, i4, i5], "warehouses": [w1, w2], "base": base}


async def _seed(db, *, extra: int = 0) -> dict:
    """Tenant A with a financier principal; tenant B shares the party id and must never leak into A."""
    slug = uuid.uuid4().hex[:8]
    today = date.today()
    role = await _ensure_financier_role(db)
    ta = await _new_tenant(db, slug, "A")
    tb = await _new_tenant(db, slug, "B")
    principal = ExternalPrincipal(
        tenant_id=ta.id, principal_type=PRINCIPAL_FINANCIER, email=f"fin2.{slug}@test.local", password_hash="x",
        full_name="Perf Financier 2", is_active=True, accepted_at=datetime.utcnow(),
    )
    db.add(principal)
    await db.flush()
    party_id = principal.id
    db.add(ExternalPrincipalRole(external_principal_id=principal.id, role_id=role.id))
    db.add(ExternalFinancierAccess(tenant_id=ta.id, external_principal_id=principal.id, financier_party_id=party_id,
                                   access_scope=SCOPE_FULL_FINANCIER_PORTAL))

    # Tenant B rows (some point at tenant A ids on purpose).
    cust_b = Customer(tenant_id=tb.id, customer_code=f"CB{slug}", name="B buyer", status="active")
    mc_b = MasterContract(tenant_id=tb.id, reference=f"MCB-{slug}", status="OPEN", contract_type="EXPORT_LC",
                          amount=1, currency="USD", expiry_date=today + timedelta(days=5))
    db.add_all([cust_b, mc_b])
    await db.flush()
    btb_b = BtbLc(tenant_id=tb.id, reference=f"BTBB-{slug}", status="OPEN", amount=1, currency="USD", master_contract_id=mc_b.id)
    db.add(btb_b)
    await db.flush()
    fac_b = Facility(tenant_id=tb.id, facility_code=f"FB{slug}", facility_type="btb_finance", financier_party_id=party_id,
                     linked_btb_lc_id=btb_b.id, status="active")
    db.add(fac_b)
    await db.flush()
    util_b = FacilityUtilization(tenant_id=tb.id, facility_id=fac_b.id, utilization_code=f"UB{slug}",
                                 linked_btb_lc_id=btb_b.id, principal_amount=5, outstanding_principal=5)
    db.add(util_b)
    await db.flush()

    # Tenant A commercial chain.
    cust = Customer(tenant_id=ta.id, customer_code=f"CU{slug}", name="Buyer One", status="active")
    mc1 = MasterContract(tenant_id=ta.id, reference=f"MC1-{slug}", status="OPEN", contract_type="EXPORT_LC", amount=1000,
                         currency="USD", expiry_date=today + timedelta(days=120))
    mc2 = MasterContract(tenant_id=ta.id, reference=f"MC2-{slug}", status="OPEN", contract_type="EXPORT_LC", amount=10,
                         currency="USD")
    db.add_all([cust, mc1, mc2])
    await db.flush()
    btb1 = BtbLc(tenant_id=ta.id, reference=f"BTB1-{slug}", status="OPEN", amount=500, currency="USD",
                 master_contract_id=mc1.id, open_date=today, expiry_date=today + timedelta(days=90))
    btb2 = BtbLc(tenant_id=ta.id, reference=f"btb2-{slug}", status="draft", amount=None, currency=None,
                 master_contract_id=mc2.id, maturity_date=today + timedelta(days=45), maturity_amount=Decimal("300.25"))
    btb3 = BtbLc(tenant_id=ta.id, reference=f"BTB3-{slug}", status="OPEN", amount=100, currency="EUR", maturity_amount=0)
    db.add_all([btb1, btb2, btb3])
    await db.flush()
    extra_btbs = []
    for n in range(extra):
        b = BtbLc(tenant_id=ta.id, reference=f"BX{n}-{slug}", status="OPEN", amount=10 * (n + 1), currency="USD",
                  master_contract_id=mc1.id if n % 2 else None, maturity_date=today + timedelta(days=n) if n % 3 else None)
        db.add(b)
        extra_btbs.append(b)
    await db.flush()

    fac1 = Facility(tenant_id=ta.id, facility_code=f"F1{slug}", facility_type="btb_finance", financier_party_id=party_id,
                    linked_btb_lc_id=btb1.id, linked_master_contract_id=mc1.id, sanctioned_amount=Decimal("1000.00"),
                    utilized_amount=Decimal("250.50"), currency="USD", status="active",
                    expiry_date=today + timedelta(days=200), interest_rate=Decimal("9.5"))
    fac2 = Facility(tenant_id=ta.id, facility_code=f"F2{slug}", facility_type="working_capital",
                    financier_party_id=party_id, linked_btb_lc_id=btb_b.id, linked_master_contract_id=mc_b.id,
                    sanctioned_amount=None, utilized_amount=None, status="draft")
    fac3 = Facility(tenant_id=ta.id, facility_code=f"F3{slug}", facility_type="btb_finance", financier_party_id=party_id,
                    linked_btb_lc_id=btb3.id, sanctioned_amount=Decimal("10"), utilized_amount=Decimal("25"),
                    currency="EUR", status="active")
    fac_other = Facility(tenant_id=ta.id, facility_code=f"FO{slug}", facility_type="btb_finance", financier_party_id=None,
                         linked_btb_lc_id=btb2.id, status="active")
    db.add_all([fac1, fac2, fac3, fac_other])
    await db.flush()
    extra_facs = []
    for n, b in enumerate(extra_btbs):
        f = Facility(tenant_id=ta.id, facility_code=f"FX{n}{slug}", facility_type="btb_finance",
                     financier_party_id=party_id, linked_btb_lc_id=b.id,
                     linked_master_contract_id=mc2.id if n % 2 else None, sanctioned_amount=Decimal(100 + n),
                     utilized_amount=Decimal(n), currency="USD", status="active")
        db.add(f)
        extra_facs.append(f)
    await db.flush()

    u1 = FacilityUtilization(tenant_id=ta.id, facility_id=fac1.id, utilization_code=f"U1{slug}", linked_btb_lc_id=btb2.id,
                             principal_amount=1000, outstanding_principal=400, currency="USD",
                             maturity_date=today + timedelta(days=100), status="active")
    u2 = FacilityUtilization(tenant_id=ta.id, facility_id=fac1.id, utilization_code=f"U2{slug}", linked_btb_lc_id=btb1.id,
                             principal_amount=500, outstanding_principal=500, currency=None)
    u3 = FacilityUtilization(tenant_id=ta.id, facility_id=fac3.id, utilization_code=f"U3{slug}", linked_btb_lc_id=btb1.id,
                             principal_amount=Decimal("250.50"), outstanding_principal=None, currency="EUR")
    u4 = FacilityUtilization(tenant_id=ta.id, facility_id=fac3.id, utilization_code=f"U4{slug}", linked_btb_lc_id=None,
                             principal_amount=1, outstanding_principal=1)
    db.add_all([u1, u2, u3, u4])
    await db.flush()
    extra_utils = []
    for n, f in enumerate(extra_facs):
        u = FacilityUtilization(tenant_id=ta.id, facility_id=f.id, utilization_code=f"UX{n}{slug}",
                                linked_btb_lc_id=extra_btbs[n].id, principal_amount=50 + n, outstanding_principal=n)
        db.add(u)
        extra_utils.append(u)
    await db.flush()

    v1 = await _voucher(db, ta.id, f"V1-{slug}")
    v2 = await _voucher(db, ta.id, f"V2-{slug}")
    v3 = await _voucher(db, ta.id, f"V3-{slug}")

    def _line(u, n, days, status, draft=None, emi="10", tenant=ta):
        return RepaymentScheduleLine(tenant_id=tenant.id, facility_utilization_id=u.id, installment_number=n,
                                     due_date=today + timedelta(days=days), status=status,
                                     draft_voucher_id=draft.id if draft else None,
                                     emi_amount=Decimal(emi) if emi is not None else None)

    db.add_all(
        [
            _line(u1, 1, 30, "upcoming"),
            _line(u1, 2, 60, "paid", draft=v1),
            _line(u1, 3, 10, "due", emi=None),
            _line(u1, 4, 90, "partially_paid", emi="12.3456"),
            _line(u1, 5, 5, "Closed"),
            _line(u2, 1, 20, "upcoming"),
            _line(u2, 2, 20, "upcoming", emi="11"),
            _line(u2, 3, 40, "upcoming"),
            _line(u2, 4, 50, "upcoming"),
            _line(u3, 1, 15, "due", draft=v2),
            _line(u1, 9, 1, "upcoming", draft=None, tenant=tb),
        ]
    )
    for n, u in enumerate(extra_utils):
        db.add_all([_line(u, 1, 7 + n, "upcoming", draft=v3 if n % 2 else None), _line(u, 2, 37 + n, "due")])

    db.add_all(
        [
            BtbLcAccounting(tenant_id=ta.id, btb_lc_id=btb1.id, lc_open_voucher_id=v1.id, import_bill_voucher_id=v2.id,
                            status="DOCUMENTS_ACCEPTED"),
            BtbLcAccounting(tenant_id=ta.id, btb_lc_id=btb2.id, realization_voucher_id=v3.id, status="REALIZED"),
            BtbLcAccounting(tenant_id=tb.id, btb_lc_id=btb3.id, lc_open_voucher_id=None, status="OPEN"),
        ]
    )
    for n, b in enumerate(extra_btbs):
        if n % 2 == 0:
            db.add(BtbLcAccounting(tenant_id=ta.id, btb_lc_id=b.id, lc_open_voucher_id=v1.id, status="OPEN"))

    # Orders: o1/o2 via mc1 (btb1), o3 via a PO source order on btb2, o4 not financed.
    orders = []
    for n, (qty, mc, shipped) in enumerate([(1000, mc1, None), (0, mc1, datetime(2026, 2, 3, 15, 0)), (500, None, None),
                                            (100, None, None)]):
        o = Order(tenant_id=ta.id, customer_id=cust.id if n != 2 else cust_b.id, order_code=f"ORD{n}-{slug}",
                  status="CONFIRMED", pipeline_status="ORDER_CONFIRMED", master_contract_id=mc.id if mc else None,
                  order_date=today, delivery_date=today + timedelta(days=30 + n) if n != 1 else None, quantity=qty,
                  shipped_at=shipped)
        db.add(o)
        orders.append(o)
    await db.flush()
    o1, o2, o3, o4 = orders
    po_btb2 = PurchaseOrder(tenant_id=ta.id, po_code=f"PO2-{slug}", supplier_name="S2", status="APPROVED",
                            btb_lc_id=btb2.id, source_order_id=o3.id)
    po_btb1 = PurchaseOrder(tenant_id=ta.id, po_code=f"PO1-{slug}", supplier_name="S1", status="APPROVED",
                            btb_lc_id=btb1.id)
    db.add_all([po_btb2, po_btb1])
    await db.flush()
    extra_orders = []
    for n in range(extra):
        o = Order(tenant_id=ta.id, customer_id=cust.id, order_code=f"OX{n}-{slug}", status="CONFIRMED",
                  master_contract_id=mc1.id, quantity=100 * (n + 1), delivery_date=today + timedelta(days=n))
        db.add(o)
        extra_orders.append(o)
    await db.flush()

    # Production data.
    line = SewingLine(tenant_id=ta.id, line_code=f"L{slug}", name="Line 1")
    shift = ProductionShift(tenant_id=ta.id, shift_code=f"S{slug}"[:16], name="Day", start_time=time(8, 0),
                            end_time=time(17, 0))
    marker = MarkerPlan(tenant_id=ta.id, marker_code=f"MK-{slug}")
    db.add_all([line, shift, marker])
    await db.flush()
    lay = LayPlan(tenant_id=ta.id, marker_plan_id=marker.id, lay_code=f"LAY-{slug}")
    db.add(lay)
    await db.flush()

    def _ticket(o, code, status, pcs):
        return CutTicket(tenant_id=ta.id, order_id=o.id, lay_plan_id=lay.id, ticket_code=f"{code}-{slug}",
                         status=status, total_pcs_cut=pcs)

    def _qc(o, days_ago, hour, ctype, total, passed):
        return ProductionQcCheck(tenant_id=ta.id, order_id=o.id, sewing_line_id=line.id, shift_id=shift.id,
                                 production_date=today - timedelta(days=days_ago), hour_slot=hour, check_type=ctype,
                                 total_checked=total, pass_qty=passed)

    def _hourly(o, dept, hour, qty, tenant=ta):
        return HourlyProductionEntry(tenant_id=tenant.id, department_type=dept, order_id=o.id, production_date=today,
                                     hour_slot=hour, good_qty=qty)

    db.add_all(
        [
            _ticket(o1, "CT1", "Completed", 600),
            _ticket(o1, "CT2", "closed", None),
            _ticket(o3, "CT3", "pending", 100),
            SewingLineStyleConfig(tenant_id=ta.id, line_id=line.id, order_id=o1.id, start_date=today, status="running",
                                  planned_qty=1000, completed_qty=250),
            SewingLineStyleConfig(tenant_id=ta.id, line_id=line.id, order_id=o1.id, start_date=today,
                                  status="completed", planned_qty=0, completed_qty=0),
            _hourly(o1, "finishing", 1, 100),
            _hourly(o1, "sewing", 1, 77),
            _hourly(o1, "Finishing", 2, None),
            _hourly(o2, "sewing", 1, 120),
            _hourly(o2, "SEW", 2, 180),
            _hourly(o3, "cutting", 1, 999),
            _hourly(o1, "finishing", 3, 9999, tenant=tb),
            _qc(o1, 2, 1, "inline", 100, 99),
            _qc(o1, 0, 1, "inline", 50, 40),
            _qc(o1, 0, 2, "endline", 10, 10),
            _qc(o3, 1, 1, "final", 0, 0),
        ]
    )
    for n, o in enumerate(extra_orders):
        db.add_all(
            [
                _ticket(o, f"CX{n}", "posted" if n % 2 else "open", 10 * n),
                SewingLineStyleConfig(tenant_id=ta.id, line_id=line.id, order_id=o.id, start_date=today,
                                      status="done" if n % 3 == 0 else "running", planned_qty=100, completed_qty=10 * n),
                _hourly(o, "finishing", 1, 5 * n),
                _qc(o, n % 3, 10 + n, "inline", 20, 20 - n % 4),
            ]
        )

    # Trade cases, documents, shipments, FX receipts.
    tc1 = TradeCase(tenant_id=ta.id, reference=f"TC1-{slug}", order_id=o1.id, btb_lc_id=btb1.id)
    tc2 = TradeCase(tenant_id=ta.id, reference=f"TC2-{slug}", btb_lc_id=btb1.id)
    tc3 = TradeCase(tenant_id=ta.id, reference=f"TC3-{slug}", order_id=o3.id, btb_lc_id=btb2.id)
    tc3b = TradeCase(tenant_id=ta.id, reference=f"TC3B-{slug}", order_id=o3.id)
    tc_b = TradeCase(tenant_id=tb.id, reference=f"TCB-{slug}", order_id=o1.id, btb_lc_id=btb1.id)
    db.add_all([tc1, tc2, tc3, tc3b, tc_b])
    await db.flush()
    extra_tcs = []
    for n, b in enumerate(extra_btbs):
        tc = TradeCase(tenant_id=ta.id, reference=f"TCX{n}-{slug}", btb_lc_id=b.id, order_id=extra_orders[n].id)
        db.add(tc)
        extra_tcs.append(tc)
    await db.flush()

    def _doc(tc, n):
        return TradeDocument(tenant_id=tc.tenant_id, trade_case_id=tc.id, document_type="INVOICE",
                             file_name=f"d{n}.pdf", storage_path=f"/x/{slug}/{tc.id}/{n}")

    def _ship(tc, n, etd):
        return Shipment(tenant_id=tc.tenant_id, trade_case_id=tc.id, reference=f"SH{n}-{slug}", etd=etd)

    db.add_all([_doc(tc1, 1), _doc(tc1, 2), _doc(tc2, 1), _doc(tc_b, 1)])
    db.add_all([_ship(tc1, 1, today + timedelta(days=3)), _ship(tc1, 2, today + timedelta(days=1)),
                _ship(tc3b, 3, today + timedelta(days=9))])
    for n, tc in enumerate(extra_tcs):
        db.add(_doc(tc, n))
        if n % 2:
            db.add(_ship(tc, 100 + n, today + timedelta(days=n)))

    def _fx(n, ref, status, fc, settled, tenant=ta):
        return FxReceipt(tenant_id=tenant.id, receipt_no=f"FX{n}-{slug}", receipt_date=today, source_ref=ref,
                         status=status, fc_amount=Decimal(fc), settled_amount=Decimal(settled))

    db.add_all(
        [
            _fx(1, None, "OPEN", "10", "0"),
            _fx(2, f"{btb2.reference}-inv", "open", "100", "0"),
            _fx(3, f"pay {btb3.reference.lower()}", "OPEN", "100", "99.5"),
            _fx(4, f"{btb1.reference} part", "OPEN", "100", "10"),
            _fx(5, f"{btb1.reference} late", "SETTLED", "100", "0"),
            _fx(6, f"{btb2.reference}", "SETTLED", "1", "1", tenant=tb),
        ]
    )
    await db.flush()

    inv_a = await _seed_inventory(db, ta.id, slug, extra)
    await _seed_inventory(db, tb.id, slug + "b", extra)
    i1, _i2, i3, _i4, _i5 = inv_a["items"]
    db.add_all(
        [
            PurchaseOrderItem(tenant_id=ta.id, purchase_order_id=po_btb1.id, item_id=i1.id, quantity=Decimal("5")),
            PurchaseOrderItem(tenant_id=ta.id, purchase_order_id=po_btb2.id, item_id=i3.id, quantity=Decimal("2")),
        ]
    )
    await db.flush()
    await db.commit()
    return {"tenant": ta, "principal": principal, "party_id": party_id, "orders": orders, "inventory": inv_a,
            "btbs": [btb1, btb2, btb3]}


# ---------- Helpers ----------


async def _get(ac, db, path, params=None):
    db.expunge_all()
    with count_queries(db) as c:
        started = time_mod.perf_counter()
        r = await ac.get(f"{API}/{path}", params=params or {})
        elapsed_ms = (time_mod.perf_counter() - started) * 1000
    assert r.status_code == 200, r.text
    return r, c["n"], elapsed_ms


VISIBILITY_CASES = [
    ("production-tracker", vis_svc, "build_production_tracker_rows", _old_production_tracker_rows),
    ("financial-visibility", vis_svc, "build_financial_visibility_rows", _old_financial_visibility_rows),
    ("btb-liabilities", vis_svc, "build_btb_liabilities_rows", _old_btb_liabilities_rows),
]

INVENTORY_CASES = [
    ("inventory-overview", "build_financier_inventory_overview", _old_inventory_overview, [{}, {"as_of_date": "2026-01-03"}]),
    ("inventory-by-group", "build_financier_inventory_by_group", _old_inventory_by_group,
     [{}, {"as_of_date": "2026-01-02"}, {"btb_scope": "true"}]),
    ("inventory-reconciliation", "build_financier_inventory_reconciliation", _old_inventory_reconciliation, [{}]),
    ("inventory-balance-sheet", "build_financier_balance_sheet_inventory", _old_balance_sheet_inventory, [{}]),
]


def _ledger_param_sets(inv: dict) -> list[dict]:
    i1, _i2, i3, i4, i5 = inv["items"]
    w1, _w2 = inv["warehouses"]
    return [
        {},
        {"include_gl": "true"},
        {"include_gl": "true", "limit": 3, "offset": 2},
        {"item_id": i1.id},
        {"item_id": i1.id, "warehouse_id": w1.id, "include_gl": "true"},
        {"item_id": i3.id, "date_from": "2026-01-03", "date_to": "2026-01-09"},
        {"item_id": i4.id},
        {"item_id": i5.id},
        {"date_from": "2026-01-05"},
    ]


async def _compare_patched(ac, db, monkeypatch, module, attr, old_fn, path, params):
    """Return (old_response, new_response, old_count, new_count, old_ms, new_ms) through HTTP."""
    new_r, new_n, new_ms = await _get(ac, db, path, params)
    with monkeypatch.context() as m:
        m.setattr(module, attr, old_fn)
        old_r, old_n, old_ms = await _get(ac, db, path, params)
    return old_r, new_r, old_n, new_n, old_ms, new_ms


# ---------- Tests ----------


@pytest.mark.asyncio
async def test_financier_round2_matches_old_algorithm(db_session_integration, monkeypatch):
    db = db_session_integration
    s = await _seed(db, extra=2)
    tid, party_id = s["tenant"].id, s["party_id"]
    o1, o2, o3, o4 = s["orders"]
    btb1, btb2, btb3 = s["btbs"]

    btb_rows = await fsel.party_btb_lc_rows(db, tid, party_id)
    assert await fsel.order_btb_links_for_party(db, tid, btb_rows) == await _old_order_btb_links_for_party(
        db, tid, btb_rows
    )

    async with financier_client(db, s["principal"]) as ac:
        r, _n, _ms = await _get(ac, db, "credit-lines")
        db.expunge_all()
        old_items = await _old_credit_lines(db, tid, party_id)
        assert r.json()["items"] == _json(old_items)
        by_code = {x["facility_code"]: x for x in r.json()["items"]}
        assert len(by_code) == 5
        f1 = next(x for x in by_code.values() if x["btb_lc_reference"] == btb1.reference)
        assert f1["master_contract_reference"] and f1["available_amount"] == 749.5
        f2 = next(x for x in by_code.values() if x["facility_type"] == "working_capital")
        assert f2["btb_lc_reference"] is None and f2["master_contract_reference"] is None
        assert f2["sanctioned_amount"] == 0.0 and f2["interest_rate"] is None

        for path, module, attr, old_fn in VISIBILITY_CASES:
            old_r, new_r, *_ = await _compare_patched(ac, db, monkeypatch, module, attr, old_fn, path, None)
            assert new_r.json() == old_r.json(), path
            assert new_r.content == old_r.content, path

        prod = {row["order_code"]: row for row in (await _get(ac, db, "production-tracker"))[0].json()["items"]}
        assert set(prod) >= {o1.order_code, o2.order_code, o3.order_code}
        assert o4.order_code not in prod
        assert (prod[o1.order_code]["cutting_status"], prod[o1.order_code]["cutting_pct"]) == ("completed", 60.0)
        assert prod[o1.order_code]["sewing_pct"] == 25.0
        assert prod[o1.order_code]["finishing_pct"] == 10.0
        assert (prod[o1.order_code]["inspection_status"], prod[o1.order_code]["inspection_pass_rate"]) == ("inline review", 80.0)
        assert prod[o1.order_code]["actual_shipment_date"] == str(date.today() + timedelta(days=3))
        assert prod[o2.order_code]["actual_shipment_date"] == "2026-02-03"
        assert prod[o2.order_code]["sewing_status"] == "in_progress"
        assert prod[o3.order_code]["inspection_pass_rate"] is None
        assert prod[o3.order_code]["actual_shipment_date"] is None
        assert prod[o3.order_code]["buyer_name"] is None  # its customer belongs to tenant B

        fin = {row["btb_lc_id"]: row for row in (await _get(ac, db, "financial-visibility"))[0].json()["items"]}
        assert fin[btb1.id]["bank_charges_status"] == "import_bill_posted"
        assert fin[btb1.id]["export_document_count"] == 3
        assert fin[btb1.id]["repayment_reserve_draft"] is True
        assert fin[btb2.id]["bank_charges_status"] == "realized"
        assert fin[btb2.id]["repayment_reserve_draft"] is False
        assert fin[btb2.id]["invoice_claim_status"] == "open_receipt"
        assert fin[btb3.id]["accounting_lc_status"] is None
        assert fin[btb3.id]["invoice_claim_status"] == "settled"

        liab = {row["btb_lc_id"]: row for row in (await _get(ac, db, "btb-liabilities"))[0].json()["items"]}
        assert [x["installment_number"] for x in liab[btb2.id]["upcoming_installments"]] == [3, 1, 4]
        assert len(liab[btb1.id]["utilizations"]) == 2
        assert liab[btb3.id]["utilizations"] == [] and liab[btb3.id]["maturity_amount"] == 0.0

        for path, attr, old_fn, param_sets in INVENTORY_CASES:
            for params in param_sets:
                old_r, new_r, *_ = await _compare_patched(ac, db, monkeypatch, inv_svc, attr, old_fn, path, params)
                assert new_r.json() == old_r.json(), (path, params)
                assert new_r.content == old_r.content, (path, params)
        for params in _ledger_param_sets(s["inventory"]):
            old_r, new_r, *_ = await _compare_patched(
                ac, db, monkeypatch, inv_svc, "build_financier_inventory_ledger", _old_inventory_ledger,
                "inventory-ledger", params,
            )
            assert new_r.json() == old_r.json(), params
            assert new_r.content == old_r.content, params

        ov = (await _get(ac, db, "inventory-overview"))[0].json()
        assert ov["total_wip_value"] == 14.0
        groups = (await _get(ac, db, "inventory-by-group", {"btb_scope": "true"}))[0].json()["groups"]
        assert {line["item_id"] for g in groups for line in g["lines"]} <= {s["inventory"]["items"][0].id, s["inventory"]["items"][2].id}
        ledger = (await _get(ac, db, "inventory-ledger", {"include_gl": "true"}))[0].json()
        assert any(x["gl_posted"] and x["voucher_code"] for x in ledger["items"])


@pytest.mark.asyncio
async def test_financier_round2_query_counts(db_session_integration, monkeypatch):
    """New statement counts must not grow with the number of facilities / orders / LCs / process orders."""
    db = db_session_integration
    new_counts: dict[str, list[int]] = defaultdict(list)
    old_counts: dict[str, list[int]] = defaultdict(list)
    timings: dict[str, list[tuple[float, float]]] = defaultdict(list)
    for extra in (3, 10):
        s = await _seed(db, extra=extra)
        tid, party_id = s["tenant"].id, s["party_id"]
        async with financier_client(db, s["principal"]) as ac:
            _r, n, ms = await _get(ac, db, "credit-lines")
            new_counts["credit-lines"].append(n)
            db.expunge_all()
            with count_queries(db) as c:
                started = time_mod.perf_counter()
                await _old_credit_lines(db, tid, party_id)
                old_ms = (time_mod.perf_counter() - started) * 1000
            old_counts["credit-lines"].append(c["n"])
            timings["credit-lines"].append((old_ms, ms))

            cases = [(p, m, a, f, None) for p, m, a, f in VISIBILITY_CASES]
            cases += [(p, inv_svc, a, f, params) for p, a, f, sets in INVENTORY_CASES for params in sets[:1]]
            cases += [
                ("inventory-ledger", inv_svc, "build_financier_inventory_ledger", _old_inventory_ledger, params)
                for params in ({"include_gl": "true"}, {"item_id": s["inventory"]["items"][0].id})
            ]
            for path, module, attr, old_fn, params in cases:
                key = path if not params else f"{path}?{'&'.join(f'{k}' for k in params)}"
                _o, _nr, old_n, new_n, old_ms, new_ms = await _compare_patched(
                    ac, db, monkeypatch, module, attr, old_fn, path, params
                )
                old_counts[key].append(old_n)
                new_counts[key].append(new_n)
                timings[key].append((old_ms, new_ms))

    for key in new_counts:
        print(
            f"QUERY_COUNT {key} old={old_counts[key][0]}->{old_counts[key][1]} "
            f"new={new_counts[key][0]}->{new_counts[key][1]} (extra rows 3 -> 10) "
            f"ms old={timings[key][1][0]:.1f} new={timings[key][1][1]:.1f}"
        )
    for key, (small, large) in new_counts.items():
        assert large == small, f"{key}: new query count grew {small} -> {large}"
    for key in ("credit-lines", "production-tracker", "financial-visibility", "btb-liabilities", "inventory-overview"):
        assert old_counts[key][1] > old_counts[key][0], f"{key}: old count expected to grow"
