"""Comprehensive Lakhsma + financier portal demo data (idempotent by stable codes).

Prerequisites: ``scripts/seed_lakhsma_interconnected_demo.py`` for tenant (default ``LAKH806201``).

Uses marker vendor ``LKH-VEND-FABRIC-01``; safe to re-run (upserts by codes).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.common.orm_numeric import api_money_to_decimal, decimal_to_money_response
from app.models import (
    BtbLc,
    BtbLcAccounting,
    ExportCase,
    MasterContract,
    Order,
    ProformaInvoice,
    Shipment,
    Tenant,
    TradeCase,
    TradeDocument,
    User,
)
from app.models.costing import Item
from app.models.facility import (
    Facility,
    FacilitySnapshot,
    FacilityUtilization,
    RepaymentScheduleLine,
)
from app.models.finance import BankAccount, ChartOfAccount, OutstandingBill, Voucher, VoucherLine
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingItem,
    PurchaseOrder,
    PurchaseOrderItem,
    StockMovement,
    Vendor,
    Warehouse,
)
from app.models.external_access import ExternalFinancierAccess, ExternalPrincipal
from app.models.merch import GarmentStyle
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
from app.external_access.constants import PRINCIPAL_FINANCIER
from app.seeds.financier_portal_demo import run_financier_portal_demo_seed

MARKER_VENDOR_CODE = "LKH-VEND-FABRIC-01"
BTB01_REF = "LKH-BTB-LC-DEMO-01"
BTB02_REF = "LKH-BTB-LC-DEMO-02"
MC_EXPORT_REF = "LKH-MASTER-EXPORT-LC-DEMO-01"
PI2_REF = "LKH-PI-DEMO-02"
SEED_NOTE_PREFIX = "seed_financier_full_demo"


def _merge_flags(tenant: Tenant, updates: dict[str, bool]) -> None:
    raw = tenant.feature_flags
    base: dict[str, Any] = dict(raw) if isinstance(raw, dict) else {}
    base.update(updates)
    tenant.feature_flags = base


async def _get_tenant(db: AsyncSession, company_code: str) -> Tenant:
    code = (company_code or "").strip().upper()
    if not code:
        raise ValueError("company_code is required")
    row = await db.execute(select(Tenant).where(Tenant.company_code == code))
    tenant = row.scalar_one_or_none()
    if not tenant:
        raise ValueError(f"Tenant not found for company_code={code!r}")
    return tenant


async def _orders_map(db: AsyncSession, tenant_id: int) -> dict[str, Order]:
    r = await db.execute(
        select(Order).where(Order.tenant_id == tenant_id, Order.order_code.like("LKH-ORD-%"))
    )
    return {o.order_code: o for o in r.scalars().all()}


async def _item_map(db: AsyncSession, tenant_id: int) -> dict[str, Item]:
    r = await db.execute(select(Item).where(Item.tenant_id == tenant_id))
    return {i.item_code: i for i in r.scalars().all()}


async def _two_gl_accounts(db: AsyncSession, tenant_id: int) -> tuple[int, int] | None:
    r = await db.execute(
        select(ChartOfAccount.id).where(ChartOfAccount.tenant_id == tenant_id).order_by(ChartOfAccount.id.asc()).limit(2)
    )
    ids = [row[0] for row in r.all()]
    if len(ids) < 2:
        return None
    return int(ids[0]), int(ids[1])


def _dt_at(d: date) -> datetime:
    return datetime.combine(d, time.min)


async def _enrich_orders_for_visibility(
    db: AsyncSession,
    tenant_id: int,
    orders: dict[str, Order],
    mc_export: MasterContract,
) -> int:
    """Set master_contract_id, FOB snapshot, RM %, and milestone dates for financier portal visibility + risk alerts."""
    today = date.today()
    fob_by_code: dict[str, tuple[float, str]] = {
        "LKH-ORD-01": (12.5, "USD"),
        "LKH-ORD-02": (12.75, "USD"),
        "LKH-ORD-03": (13.0, "USD"),
        "LKH-ORD-04": (11.95, "USD"),
        "LKH-ORD-05": (12.2, "USD"),
    }
    base_early = today - timedelta(days=120)

    # ORD-01: full lifecycle, shipped 95d ago, no payment → DELAYED_COLLECTION
    o1 = orders["LKH-ORD-01"]
    o1.master_contract_id = mc_export.id
    s1 = dict(o1.commercial_snapshot_json or {})
    s1["target_fob"], s1["fob_currency"] = fob_by_code["LKH-ORD-01"]
    o1.commercial_snapshot_json = s1
    o1.rm_received_pct = 100
    o1.order_date = base_early
    o1.delivery_date = today - timedelta(days=30)
    o1.pi_issued_at = _dt_at(base_early + timedelta(days=5))
    o1.lc_received_at = _dt_at(base_early + timedelta(days=12))
    o1.bom_created_at = _dt_at(base_early + timedelta(days=18))
    o1.po_issued_at = _dt_at(base_early + timedelta(days=22))
    o1.rm_received_at = _dt_at(base_early + timedelta(days=35))
    o1.production_started_at = _dt_at(base_early + timedelta(days=42))
    o1.shipped_at = _dt_at(today - timedelta(days=95))
    o1.payment_received_at = None

    # ORD-02: production started, delivery passed, not shipped → DELAYED_SHIPMENT (+ possible DELAYED_SHIPMENT_WINDOW path)
    o2 = orders["LKH-ORD-02"]
    o2.master_contract_id = mc_export.id
    s2 = dict(o2.commercial_snapshot_json or {})
    s2["target_fob"], s2["fob_currency"] = fob_by_code["LKH-ORD-02"]
    o2.commercial_snapshot_json = s2
    o2.rm_received_pct = 75
    o2.order_date = today - timedelta(days=90)
    o2.delivery_date = today - timedelta(days=7)
    o2.pi_issued_at = _dt_at(today - timedelta(days=85))
    o2.lc_received_at = _dt_at(today - timedelta(days=78))
    o2.bom_created_at = _dt_at(today - timedelta(days=72))
    o2.po_issued_at = _dt_at(today - timedelta(days=68))
    o2.rm_received_at = _dt_at(today - timedelta(days=55))
    o2.production_started_at = _dt_at(today - timedelta(days=20))
    o2.shipped_at = None
    o2.payment_received_at = None

    # ORD-03: RM in 10d ago, production not started → DELAYED_PRODUCTION
    o3 = orders["LKH-ORD-03"]
    o3.master_contract_id = mc_export.id
    s3 = dict(o3.commercial_snapshot_json or {})
    s3["target_fob"], s3["fob_currency"] = fob_by_code["LKH-ORD-03"]
    o3.commercial_snapshot_json = s3
    o3.rm_received_pct = 50
    o3.order_date = today - timedelta(days=70)
    o3.delivery_date = today + timedelta(days=21)
    o3.pi_issued_at = _dt_at(today - timedelta(days=65))
    o3.lc_received_at = _dt_at(today - timedelta(days=60))
    o3.bom_created_at = _dt_at(today - timedelta(days=52))
    o3.po_issued_at = _dt_at(today - timedelta(days=48))
    o3.rm_received_at = _dt_at(today - timedelta(days=10))
    o3.production_started_at = None
    o3.shipped_at = None
    o3.payment_received_at = None

    # ORD-04: PI/LC ok, low RM %, delivery soon → DELAYED_MATERIAL_INHOUSE; old GRN for FINANCED_STOCK_AGING
    o4 = orders["LKH-ORD-04"]
    o4.master_contract_id = mc_export.id
    s4 = dict(o4.commercial_snapshot_json or {})
    s4["target_fob"], s4["fob_currency"] = fob_by_code["LKH-ORD-04"]
    o4.commercial_snapshot_json = s4
    o4.rm_received_pct = 30
    o4.order_date = today - timedelta(days=40)
    o4.delivery_date = today + timedelta(days=7)
    o4.pi_issued_at = _dt_at(today - timedelta(days=35))
    o4.lc_received_at = _dt_at(today - timedelta(days=28))
    o4.bom_created_at = _dt_at(today - timedelta(days=22))
    o4.po_issued_at = _dt_at(today - timedelta(days=18))
    o4.rm_received_at = None
    o4.production_started_at = None
    o4.shipped_at = None
    o4.payment_received_at = None

    # ORD-05: old order, no PI/LC → DELAYED_APPROVAL
    o5 = orders["LKH-ORD-05"]
    o5.master_contract_id = mc_export.id
    s5 = dict(o5.commercial_snapshot_json or {})
    s5["target_fob"], s5["fob_currency"] = fob_by_code["LKH-ORD-05"]
    o5.commercial_snapshot_json = s5
    o5.rm_received_pct = 0
    o5.order_date = today - timedelta(days=45)
    o5.delivery_date = today + timedelta(days=90)
    o5.pi_issued_at = None
    o5.lc_received_at = None
    o5.bom_created_at = None
    o5.po_issued_at = None
    o5.rm_received_at = None
    o5.production_started_at = None
    o5.shipped_at = None
    o5.payment_received_at = None

    grn4_r = await db.execute(
        select(GoodsReceiving).where(GoodsReceiving.tenant_id == tenant_id, GoodsReceiving.grn_code == "LKH-GRN-004")
    )
    g4 = grn4_r.scalar_one_or_none()
    if g4:
        g4.received_date = today - timedelta(days=100)

    await db.flush()
    return 5


async def run_financier_full_demo_seed(db: AsyncSession, company_code: str) -> dict[str, Any]:
    """Populate extended demo rows. Caller commits when appropriate."""
    summary: dict[str, Any] = {"counts": {}}
    counts: dict[str, int] = {
        "vendors": 0,
        "warehouses": 0,
        "purchase_orders": 0,
        "purchase_order_lines": 0,
        "grns": 0,
        "grn_lines": 0,
        "stock_movements": 0,
        "btb_lc_02": 0,
        "trade_cases": 0,
        "trade_documents": 0,
        "export_cases": 0,
        "facilities": 0,
        "utilizations": 0,
        "repayment_lines": 0,
        "bank_accounts": 0,
        "vouchers": 0,
        "voucher_lines": 0,
        "outstanding_bills": 0,
        "production_shifts": 0,
        "sewing_lines": 0,
        "marker_plans": 0,
        "lay_plans": 0,
        "cut_tickets": 0,
        "sewing_configs": 0,
        "hourly_entries": 0,
        "qc_checks": 0,
        "shipments": 0,
        "snapshots": 0,
        "orders_visibility_enriched": 0,
    }

    tenant = await _get_tenant(db, company_code)
    tid = tenant.id

    btb1_row = await db.execute(select(BtbLc).where(BtbLc.tenant_id == tid, BtbLc.reference == BTB01_REF))
    btb1 = btb1_row.scalar_one_or_none()
    if not btb1:
        summary["warning"] = f"Missing BTB LC {BTB01_REF!r} — run seed_lakhsma_interconnected_demo.py first."
        summary["counts"] = counts
        return summary

    items = await _item_map(db, tid)
    fab = items.get("LKH-FAB-JERSEY-160")
    rib = items.get("LKH-TRIM-RIB-1X1")
    lbl = items.get("LKH-TRIM-LABEL-WVN")
    if not fab or not rib or not lbl:
        summary["warning"] = "Missing Lakhsma items (fabric/trim) — run Lakhsma interconnected seed first."
        summary["counts"] = counts
        return summary

    orders = await _orders_map(db, tid)
    for need in ("LKH-ORD-01", "LKH-ORD-02", "LKH-ORD-03", "LKH-ORD-04", "LKH-ORD-05"):
        if need not in orders:
            summary["warning"] = f"Missing order {need} — run Lakhsma interconnected seed first."
            summary["counts"] = counts
            return summary

    mc_row = await db.execute(
        select(MasterContract).where(MasterContract.tenant_id == tid, MasterContract.reference == MC_EXPORT_REF)
    )
    mc_export = mc_row.scalar_one_or_none()
    if not mc_export:
        summary["warning"] = f"Missing master contract {MC_EXPORT_REF!r}."
        summary["counts"] = counts
        return summary

    pi2_row = await db.execute(
        select(ProformaInvoice).where(ProformaInvoice.tenant_id == tid, ProformaInvoice.reference == PI2_REF)
    )
    pi2 = pi2_row.scalar_one_or_none()

    user_id = (
        await db.execute(select(User.id).where(User.tenant_id == tid).order_by(User.id.asc()))
    ).scalar_one_or_none()

    # --- Vendors (marker + 2 more) ---
    vendor_specs = [
        (MARKER_VENDOR_CODE, "Lakhsma Fabric Suppliers Ltd"),
        ("LKH-VEND-TRIM-01", "Premium Trims Bangladesh"),
        ("LKH-VEND-PACK-01", "EcoPack Packaging Ltd"),
    ]
    vendors: dict[str, Vendor] = {}
    for vcode, vname in vendor_specs:
        vr = await db.execute(select(Vendor).where(Vendor.tenant_id == tid, Vendor.vendor_code == vcode))
        v = vr.scalar_one_or_none()
        if not v:
            v = Vendor(tenant_id=tid, vendor_code=vcode, name=vname, is_active=True, default_currency="BDT")
            db.add(v)
            await db.flush()
            counts["vendors"] += 1
        vendors[vcode] = v

    v_fab = vendors[MARKER_VENDOR_CODE]
    v_trim = vendors["LKH-VEND-TRIM-01"]
    v_pack = vendors["LKH-VEND-PACK-01"]

    # --- Warehouses ---
    wh_specs = [
        ("WH-LKH-MAIN", "Lakhsma Main RM Warehouse"),
        ("WH-LKH-FINISH", "Lakhsma Finished Goods"),
    ]
    wh_map: dict[str, Warehouse] = {}
    for code, name in wh_specs:
        wr = await db.execute(select(Warehouse).where(Warehouse.tenant_id == tid, Warehouse.warehouse_code == code))
        w = wr.scalar_one_or_none()
        if not w:
            w = Warehouse(tenant_id=tid, warehouse_code=code, name=name, is_active=True)
            db.add(w)
            await db.flush()
            counts["warehouses"] += 1
        wh_map[code] = w
    wh_main = wh_map["WH-LKH-MAIN"]
    wh_finish = wh_map["WH-LKH-FINISH"]

    # Base financier principal + first facility + flags (needs vendor + item + btb)
    base = await run_financier_portal_demo_seed(db, company_code)
    if base.get("warning"):
        summary["warning"] = base["warning"]
        summary["counts"] = counts
        summary["base_seed"] = base
        return summary
    summary["base_seed"] = {"counts": base.get("counts"), "principal_id": base.get("principal_id")}

    principal_id = int(base["principal_id"])
    ccy = (btb1.currency or tenant.base_currency or "BDT").strip() or "BDT"
    today = date.today()

    util_fp_row = await db.execute(
        select(FacilityUtilization).where(
            FacilityUtilization.tenant_id == tid,
            FacilityUtilization.utilization_code == "UTIL-FP-001",
        )
    )
    util_fp_u = util_fp_row.scalar_one_or_none()
    if util_fp_u:
        util_fp_u.linked_btb_lc_id = btb1.id
    po_fp_row = await db.execute(
        select(PurchaseOrder).where(PurchaseOrder.tenant_id == tid, PurchaseOrder.po_code == "PO-FP-SEED-001")
    )
    po_fp_u = po_fp_row.scalar_one_or_none()
    if po_fp_u:
        po_fp_u.btb_lc_id = btb1.id
    await db.flush()

    async def _ensure_po(
        po_code: str,
        vendor: Vendor,
        btb: BtbLc,
        order: Order | None,
        lines: list[tuple[Item, Warehouse, str, str]],
        status: str = "CONFIRMED",
    ) -> PurchaseOrder:
        pr = await db.execute(select(PurchaseOrder).where(PurchaseOrder.tenant_id == tid, PurchaseOrder.po_code == po_code))
        po = pr.scalar_one_or_none()
        if not po:
            po = PurchaseOrder(
                tenant_id=tid,
                po_code=po_code,
                vendor_id=vendor.id,
                supplier_name=vendor.name,
                order_date=today - timedelta(days=40),
                expected_date=today + timedelta(days=20),
                status=status,
                currency=ccy,
                exchange_rate_to_base=1.0,
                btb_lc_id=btb.id,
                source_order_id=order.id if order else None,
                notes=f"{SEED_NOTE_PREFIX} purchase order",
            )
            db.add(po)
            await db.flush()
            counts["purchase_orders"] += 1
        else:
            po.vendor_id = vendor.id
            po.btb_lc_id = btb.id
            po.source_order_id = order.id if order else None
            po.status = status
        existing_lines = (
            await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))
        ).scalars().all()
        if not existing_lines:
            for it, wh, qty, price in lines:
                db.add(
                    PurchaseOrderItem(
                        tenant_id=tid,
                        purchase_order_id=po.id,
                        item_id=it.id,
                        warehouse_id=wh.id,
                        quantity=qty,
                        unit_price=price,
                        source_order_id=order.id if order else None,
                    )
                )
                counts["purchase_order_lines"] += 1
            await db.flush()
        return po

    # --- BTB 02 ---
    btb2_row = await db.execute(select(BtbLc).where(BtbLc.tenant_id == tid, BtbLc.reference == BTB02_REF))
    btb2 = btb2_row.scalar_one_or_none()
    if not btb2:
        amt2 = float(btb1.amount or 400_000) * 0.65
        btb2 = BtbLc(
            tenant_id=tid,
            reference=BTB02_REF,
            status="ISSUED",
            lc_date=today - timedelta(days=20),
            amount=amt2,
            master_contract_id=mc_export.id,
            proforma_invoice_id=pi2.id if pi2 else None,
            currency=btb1.currency or "USD",
            open_date=today - timedelta(days=20),
            expiry_date=today.replace(year=today.year + 1),
            maturity_date=today + timedelta(days=270),
            maturity_amount=amt2,
            exchange_rate_to_base=btb1.exchange_rate_to_base or 110.0,
            base_currency_amount=(amt2 * float(btb1.exchange_rate_to_base or 110.0)),
        )
        db.add(btb2)
        await db.flush()
        db.add(
            BtbLcAccounting(
                tenant_id=tid,
                btb_lc_id=btb2.id,
                status="OPEN",
                maturity_date=btb2.maturity_date,
            )
        )
        counts["btb_lc_02"] = 1

    # Recompute export MC utilization
    util_sum = (
        await db.execute(
            select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
                BtbLc.master_contract_id == mc_export.id,
                BtbLc.tenant_id == tid,
            )
        )
    ).scalar()
    mc_export.btb_utilized_amount = float(util_sum or 0)

    # --- Purchase orders ---
    po1 = await _ensure_po(
        "LKH-PO-001",
        v_fab,
        btb1,
        orders["LKH-ORD-01"],
        [(fab, wh_main, "12000", "3.55"), (fab, wh_main, "5000", "3.60")],
    )
    po2 = await _ensure_po(
        "LKH-PO-002",
        v_fab,
        btb1,
        orders["LKH-ORD-02"],
        [(fab, wh_main, "8000", "3.52")],
    )
    po3 = await _ensure_po(
        "LKH-PO-003",
        v_trim,
        btb1,
        orders["LKH-ORD-03"],
        [(rib, wh_main, "15000", "0.82"), (lbl, wh_main, "50000", "0.06")],
    )
    po4 = await _ensure_po(
        "LKH-PO-004",
        v_fab,
        btb2,
        orders["LKH-ORD-04"],
        [(fab, wh_main, "9500", "3.58"), (rib, wh_main, "8000", "0.84")],
    )
    po5 = await _ensure_po(
        "LKH-PO-005",
        v_pack,
        btb2,
        orders["LKH-ORD-05"],
        [(lbl, wh_finish, "60000", "0.065")],
    )

    async def _po_lines(po: PurchaseOrder) -> list[PurchaseOrderItem]:
        r = await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))
        return list(r.scalars().all())

    async def _ensure_grn(
        grn_code: str,
        po: PurchaseOrder,
        vendor: Vendor,
        btb: BtbLc,
        order: Order | None,
        line_receipts: list[tuple[PurchaseOrderItem, str, str, str, str]],
        status: str = "RECEIVED",
    ) -> GoodsReceiving:
        gr = await db.execute(select(GoodsReceiving).where(GoodsReceiving.tenant_id == tid, GoodsReceiving.grn_code == grn_code))
        g = gr.scalar_one_or_none()
        if not g:
            g = GoodsReceiving(
                tenant_id=tid,
                grn_code=grn_code,
                purchase_order_id=po.id,
                received_date=today - timedelta(days=10),
                status=status,
                vendor_id=vendor.id,
                default_warehouse_id=wh_main.id,
                source_type="PO",
                source_order_id=order.id if order else None,
                btb_lc_id=btb.id,
                notes=f"{SEED_NOTE_PREFIX} GRN",
                created_by_user_id=user_id,
            )
            db.add(g)
            await db.flush()
            counts["grns"] += 1
        else:
            g.status = status
            g.btb_lc_id = btb.id
            g.source_order_id = order.id if order else None
        existing = (
            await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == g.id))
        ).scalars().first()
        if not existing:
            for poli, ordered, accepted, rejected, pending in line_receipts:
                db.add(
                    GoodsReceivingItem(
                        tenant_id=tid,
                        goods_receiving_id=g.id,
                        item_id=poli.item_id,
                        warehouse_id=poli.warehouse_id or wh_main.id,
                        quantity=api_money_to_decimal(accepted),
                        purchase_order_line_id=poli.id,
                        ordered_qty=ordered,
                        received_qty=accepted,
                        accepted_qty=accepted,
                        rejected_qty=rejected,
                        pending_qty=pending,
                        unit_price=decimal_to_money_response(poli.unit_price),
                        source_order_id=order.id if order else None,
                        btb_lc_id=btb.id,
                        vendor_id=vendor.id,
                    )
                )
                counts["grn_lines"] += 1
            await db.flush()
        return g

    pl1 = await _po_lines(po1)
    pl2 = await _po_lines(po2)
    pl3 = await _po_lines(po3)
    pl4 = await _po_lines(po4)
    if len(pl1) >= 2:
        grn1 = await _ensure_grn(
            "LKH-GRN-001",
            po1,
            v_fab,
            btb1,
            orders["LKH-ORD-01"],
            [
                (pl1[0], decimal_to_money_response(pl1[0].quantity), decimal_to_money_response(pl1[0].quantity), "0", "0"),
                (pl1[1], decimal_to_money_response(pl1[1].quantity), decimal_to_money_response(pl1[1].quantity), "0", "0"),
            ],
        )
    else:
        grn1 = None
    grn2 = await _ensure_grn(
        "LKH-GRN-002",
        po2,
        v_fab,
        btb1,
        orders["LKH-ORD-02"],
        [(pl2[0], decimal_to_money_response(pl2[0].quantity), decimal_to_money_response(pl2[0].quantity), "0", "0")] if pl2 else [],
    )
    grn3_lines: list[tuple[PurchaseOrderItem, str, str, str, str]] = []
    if len(pl3) >= 2:
        grn3_lines = [
            (pl3[0], decimal_to_money_response(pl3[0].quantity), str(float(pl3[0].quantity) * 0.6), "0", str(float(pl3[0].quantity) * 0.4)),
            (pl3[1], decimal_to_money_response(pl3[1].quantity), str(float(pl3[1].quantity) * 0.5), "10", str(float(pl3[1].quantity) * 0.5 - 10)),
        ]
    grn3 = await _ensure_grn("LKH-GRN-003", po3, v_trim, btb1, orders["LKH-ORD-03"], grn3_lines, status="RECEIVED")
    grn4 = await _ensure_grn(
        "LKH-GRN-004",
        po4,
        v_fab,
        btb2,
        orders["LKH-ORD-04"],
        [(pl4[0], decimal_to_money_response(pl4[0].quantity), decimal_to_money_response(pl4[0].quantity), "0", "0")] if pl4 else [],
    )

    async def _ensure_stock_in_from_grn_item(
        gri: GoodsReceivingItem,
        grn: GoodsReceiving,
        po: PurchaseOrder,
        btb: BtbLc,
        order: Order | None,
        note_suffix: str,
    ) -> None:
        if float(gri.accepted_qty or gri.quantity or "0") <= 0:
            return
        note = f"{SEED_NOTE_PREFIX}:IN:{note_suffix}"
        chk = await db.execute(select(StockMovement).where(StockMovement.tenant_id == tid, StockMovement.notes == note))
        if chk.scalar_one_or_none():
            return
        qty = gri.accepted_qty or gri.quantity
        db.add(
            StockMovement(
                tenant_id=tid,
                item_id=gri.item_id,
                warehouse_id=gri.warehouse_id,
                movement_type="IN",
                quantity=str(qty),
                reference_type="GRN",
                reference_id=grn.id,
                movement_date=grn.received_date or today,
                notes=note,
                created_by_user_id=user_id,
                unit_cost=gri.unit_price,
                movement_kind="grn_receipt",
                order_id=order.id if order else None,
                purchase_order_id=po.id,
                purchase_order_line_id=gri.purchase_order_line_id,
                goods_receiving_id=grn.id,
                goods_receiving_item_id=gri.id,
                vendor_id=grn.vendor_id,
                btb_lc_id=btb.id,
            )
        )
        counts["stock_movements"] += 1

    # IN from GRN lines
    for grn, po, btb, order, suffix_base in [
        (grn1, po1, btb1, orders["LKH-ORD-01"], "grn1"),
        (grn2, po2, btb1, orders["LKH-ORD-02"], "grn2"),
        (grn3, po3, btb1, orders["LKH-ORD-03"], "grn3"),
        (grn4, po4, btb2, orders["LKH-ORD-04"], "grn4"),
    ]:
        if not grn:
            continue
        items_r = await db.execute(select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == grn.id))
        for i, gri in enumerate(items_r.scalars().all()):
            await _ensure_stock_in_from_grn_item(gri, grn, po, btb, order, f"{suffix_base}-{i}")

    async def _ensure_stock_out(order: Order, po: PurchaseOrder, btb: BtbLc, item: Item, wh: Warehouse, qty: str, suffix: str) -> None:
        note = f"{SEED_NOTE_PREFIX}:OUT:{suffix}"
        chk = await db.execute(select(StockMovement).where(StockMovement.tenant_id == tid, StockMovement.notes == note))
        if chk.scalar_one_or_none():
            return
        db.add(
            StockMovement(
                tenant_id=tid,
                item_id=item.id,
                warehouse_id=wh.id,
                movement_type="OUT",
                quantity=qty,
                reference_type="PRODUCTION",
                reference_id=order.id,
                movement_date=today - timedelta(days=3),
                notes=note,
                created_by_user_id=user_id,
                movement_kind="production_issue",
                order_id=order.id,
                purchase_order_id=po.id,
                btb_lc_id=btb.id,
            )
        )
        counts["stock_movements"] += 1

    async def _ensure_adjust(wh: Warehouse, item: Item, qty: str, suffix: str, oid: int | None = None) -> None:
        note = f"{SEED_NOTE_PREFIX}:ADJ:{suffix}"
        chk = await db.execute(select(StockMovement).where(StockMovement.tenant_id == tid, StockMovement.notes == note))
        if chk.scalar_one_or_none():
            return
        db.add(
            StockMovement(
                tenant_id=tid,
                item_id=item.id,
                warehouse_id=wh.id,
                movement_type="ADJUST",
                quantity=qty,
                reference_type="ADJUSTMENT",
                reference_id=None,
                movement_date=today - timedelta(days=1),
                notes=note,
                created_by_user_id=user_id,
                movement_kind="adjustment",
                order_id=oid,
            )
        )
        counts["stock_movements"] += 1

    await _ensure_stock_out(orders["LKH-ORD-01"], po1, btb1, fab, wh_main, "1200", "o1")
    await _ensure_stock_out(orders["LKH-ORD-01"], po1, btb1, fab, wh_main, "800", "o1b")
    await _ensure_stock_out(orders["LKH-ORD-02"], po2, btb1, fab, wh_main, "900", "o2")
    await _ensure_stock_out(orders["LKH-ORD-03"], po3, btb1, rib, wh_main, "2000", "o3a")
    await _ensure_stock_out(orders["LKH-ORD-03"], po3, btb1, lbl, wh_main, "8000", "o3b")
    await _ensure_stock_out(orders["LKH-ORD-04"], po4, btb2, fab, wh_main, "700", "o4")
    await db.flush()
    await _ensure_adjust(wh_main, fab, "150", "fab-main", orders["LKH-ORD-01"].id)
    await _ensure_adjust(wh_main, rib, "-120", "rib-corr")
    await _ensure_adjust(wh_finish, lbl, "500", "lbl-fg", orders["LKH-ORD-05"].id)
    await _ensure_adjust(wh_main, fab, "-75", "cycle-count")
    await db.flush()

    # --- Trade cases + export cases + documents ---
    async def _ensure_trade_case(ref: str, order: Order, btb: BtbLc, stage: str = "IN_PROGRESS") -> TradeCase:
        tr = await db.execute(select(TradeCase).where(TradeCase.tenant_id == tid, TradeCase.reference == ref))
        tc = tr.scalar_one_or_none()
        if not tc:
            tc = TradeCase(
                tenant_id=tid,
                direction="EXPORT",
                reference=ref,
                status="OPEN",
                current_stage=stage,
                order_id=order.id,
                customer_id=order.customer_id,
                master_contract_id=mc_export.id,
                btb_lc_id=btb.id,
                etd=today + timedelta(days=14 if ref.endswith("001") else 40),
                amount=float(order.quantity or 0) * 12.5,
                currency="USD",
            )
            db.add(tc)
            await db.flush()
            counts["trade_cases"] += 1
        else:
            tc.btb_lc_id = btb.id
            tc.order_id = order.id
        # Export case row (optional linkage)
        exr = await db.execute(select(ExportCase).where(ExportCase.tenant_id == tid, ExportCase.reference == ref))
        ex = exr.scalar_one_or_none()
        if not ex:
            db.add(
                ExportCase(
                    tenant_id=tid,
                    reference=ref,
                    status="OPEN",
                    trade_case_id=tc.id,
                    order_id=order.id,
                    amount=tc.amount,
                )
            )
            counts["export_cases"] += 1
        return tc

    tc1 = await _ensure_trade_case("LKH-TC-001", orders["LKH-ORD-01"], btb1)
    tc2 = await _ensure_trade_case("LKH-TC-002", orders["LKH-ORD-04"], btb2)

    doc_specs = [
        ("LKH-TD-CI-01", tc1.id, "COMMERCIAL_INVOICE"),
        ("LKH-TD-PL-01", tc1.id, "PACKING_LIST"),
        ("LKH-TD-BL-01", tc2.id, "BILL_OF_LADING"),
        ("LKH-TD-COO-01", tc2.id, "CERTIFICATE_OF_ORIGIN"),
    ]
    for fname, tc_id, dtype in doc_specs:
        dr = await db.execute(
            select(TradeDocument).where(
                TradeDocument.tenant_id == tid,
                TradeDocument.file_name == fname,
            )
        )
        if dr.scalar_one_or_none():
            continue
        db.add(
            TradeDocument(
                tenant_id=tid,
                trade_case_id=tc_id,
                document_type=dtype,
                file_name=fname,
                storage_path=f"seeds/financier_full_demo/{fname}.pdf",
                version=1,
                linked_entity_type="trade_case",
                linked_entity_id=tc_id,
                uploaded_by_id=user_id,
            )
        )
        counts["trade_documents"] += 1
    await db.flush()

    # --- Facilities 2 & 3 + align facility 1 party ---
    fac1_row = await db.execute(select(Facility).where(Facility.tenant_id == tid, Facility.facility_code == "FAC-FP-TRUST-01"))
    fac1 = fac1_row.scalar_one_or_none()
    if fac1:
        fac1.financier_party_id = principal_id
        # Align with Lakhsma LKH-BTB-LC-DEMO-01 so LKH-PO-* and seed PO share financier BTB scope.
        fac1.linked_btb_lc_id = btb1.id

    async def _ensure_facility(
        code: str,
        ftype: str,
        sanctioned: float,
        utilized: float,
        *,
        linked_btb: BtbLc | None = None,
        linked_mc: MasterContract | None = None,
    ) -> Facility:
        fr = await db.execute(select(Facility).where(Facility.tenant_id == tid, Facility.facility_code == code))
        f = fr.scalar_one_or_none()
        cur = tenant.base_currency or "BDT"
        if not f:
            f = Facility(
                tenant_id=tid,
                facility_code=code,
                facility_type=ftype,
                financier_party_id=principal_id,
                financier_name="Demo financier (full seed)",
                linked_master_contract_id=linked_mc.id if linked_mc else None,
                linked_btb_lc_id=linked_btb.id if linked_btb else None,
                sanctioned_amount=sanctioned,
                currency=cur,
                utilized_amount=utilized,
                available_amount=max(0.0, sanctioned - utilized),
                sanction_date=today - timedelta(days=300),
                expiry_date=today + timedelta(days=400),
                interest_rate=10.25,
                interest_type="reducing_balance",
                status="active",
                notes=f"{SEED_NOTE_PREFIX} facility",
            )
            db.add(f)
            await db.flush()
            counts["facilities"] += 1
        else:
            f.financier_party_id = principal_id
            f.linked_btb_lc_id = linked_btb.id if linked_btb else f.linked_btb_lc_id
            f.linked_master_contract_id = linked_mc.id if linked_mc else f.linked_master_contract_id
            f.sanctioned_amount = sanctioned
            f.utilized_amount = utilized
            f.status = "active"
        return f

    fac_wc = await _ensure_facility("FAC-LKH-WC-01", "working_capital", 5_000_000.0, 3_200_000.0, linked_btb=btb2)
    fac_exp = await _ensure_facility(
        "FAC-LKH-EXPORT-01",
        "term_loan",
        8_000_000.0,
        4_500_000.0,
        linked_btb=btb1,
        linked_mc=mc_export,
    )

    async def _ensure_util(
        code: str,
        facility: Facility,
        *,
        linked_btb: BtbLc | None = None,
        linked_po: PurchaseOrder | None = None,
        principal_amt: float = 400_000.0,
    ) -> FacilityUtilization:
        ur = await db.execute(
            select(FacilityUtilization).where(FacilityUtilization.tenant_id == tid, FacilityUtilization.utilization_code == code)
        )
        u = ur.scalar_one_or_none()
        cur = facility.currency or tenant.base_currency or "BDT"
        if not u:
            u = FacilityUtilization(
                tenant_id=tid,
                facility_id=facility.id,
                utilization_code=code,
                utilization_type="drawdown",
                principal_amount=principal_amt,
                currency=cur,
                disbursement_date=today - timedelta(days=90),
                first_repayment_date=today - timedelta(days=60),
                maturity_date=today + timedelta(days=540),
                interest_rate=10.0,
                interest_type="reducing_balance",
                repayment_policy="emi_reducing",
                installment_frequency="monthly",
                num_installments=6,
                emi_amount=principal_amt / 6 + 2500,
                outstanding_principal=principal_amt * 0.72,
                status="active",
                linked_btb_lc_id=linked_btb.id if linked_btb else None,
                linked_purchase_order_id=linked_po.id if linked_po else None,
                notes=f"{SEED_NOTE_PREFIX} utilization",
            )
            db.add(u)
            await db.flush()
            counts["utilizations"] += 1
        else:
            u.facility_id = facility.id
            u.linked_btb_lc_id = linked_btb.id if linked_btb else u.linked_btb_lc_id
            u.linked_purchase_order_id = linked_po.id if linked_po else u.linked_purchase_order_id
            u.status = "active"
        return u

    util_wc1 = await _ensure_util("UTIL-LKH-WC-001", fac_wc, linked_btb=btb2, principal_amt=520_000.0)
    util_wc2 = await _ensure_util("UTIL-LKH-WC-002", fac_wc, linked_po=po4, principal_amt=410_000.0)
    util_exp1 = await _ensure_util("UTIL-LKH-EXP-001", fac_exp, principal_amt=680_000.0)

    async def _ensure_schedule(u: FacilityUtilization, _seed_key: str) -> None:
        n_existing = (
            await db.execute(
                select(func.count())
                .select_from(RepaymentScheduleLine)
                .where(
                    RepaymentScheduleLine.tenant_id == tid,
                    RepaymentScheduleLine.facility_utilization_id == u.id,
                )
            )
        ).scalar()
        if int(n_existing or 0) >= 6:
            return
        base_due = today - timedelta(days=75)
        patterns = [
            ("paid", 42_000.0, base_due, 42_000.0, base_due),
            ("paid", 42_000.0, base_due + timedelta(days=30), 42_000.0, base_due + timedelta(days=30)),
            ("overdue", 42_000.0, base_due + timedelta(days=60), None, None),
            ("overdue", 42_000.0, base_due + timedelta(days=75), None, None),
            ("upcoming", 42_000.0, base_due + timedelta(days=105), None, None),
            ("due", 42_000.0, base_due + timedelta(days=120), None, None),
        ]
        for i, (st, emi, due, paid_amt, paid_dt) in enumerate(patterns, start=1):
            db.add(
                RepaymentScheduleLine(
                    tenant_id=tid,
                    facility_utilization_id=u.id,
                    installment_number=i,
                    due_date=due,
                    principal_component=30000.0,
                    interest_component=12000.0,
                    emi_amount=emi,
                    outstanding_after_payment=max(0.0, float(u.outstanding_principal or 0) - i * 8000),
                    status=st,
                    paid_amount=paid_amt,
                    paid_date=paid_dt,
                )
            )
            counts["repayment_lines"] += 1
        await db.flush()

    await _ensure_schedule(util_wc1, "wc1")
    await _ensure_schedule(util_wc2, "wc2")
    await _ensure_schedule(util_exp1, "exp1")

    # --- Bank accounts ---
    for acc_name, bank, num, cur, bal in [
        ("Lakhsma SCB Operating", "Standard Chartered Bank", "LKH-BANK-SCB-01", "BDT", "2450000"),
        ("Lakhsma HSBC FC", "HSBC", "LKH-BANK-HSBC-01", "USD", "185000"),
    ]:
        br = await db.execute(
            select(BankAccount).where(BankAccount.tenant_id == tid, BankAccount.account_number == num)
        )
        if br.scalar_one_or_none():
            continue
        db.add(
            BankAccount(
                tenant_id=tid,
                account_name=acc_name,
                bank_name=bank,
                account_number=num,
                currency=cur,
                opening_balance=bal,
                current_balance=bal,
                is_active=True,
            )
        )
        counts["bank_accounts"] += 1
    await db.flush()

    gl_pair = await _two_gl_accounts(db, tid)
    if gl_pair:
        dr_id, cr_id = gl_pair
        vtypes = ["JOURNAL", "RECEIPT", "PAYMENT", "JOURNAL", "RECEIPT", "PAYMENT", "JOURNAL", "JOURNAL", "RECEIPT", "PAYMENT"]
        for i, vt in enumerate(vtypes, start=1):
            vnum = f"LKH-FP-VCH-{i:03d}"
            vr = await db.execute(select(Voucher).where(Voucher.tenant_id == tid, Voucher.voucher_number == vnum))
            if vr.scalar_one_or_none():
                continue
            vdt = today - timedelta(days=7 * i)
            v = Voucher(
                tenant_id=tid,
                voucher_number=vnum,
                voucher_type=vt,
                voucher_date=vdt,
                status="POSTED",
                description=f"{SEED_NOTE_PREFIX} voucher {i}",
                currency="BDT",
                base_currency="BDT",
                facility_utilization_id=util_wc1.id if i % 3 == 0 else None,
                btb_lc_id=btb1.id if i % 4 == 0 else None,
                order_id=orders["LKH-ORD-01"].id if i % 5 == 0 else None,
                source_module="SEED",
                source_module_ref=SEED_NOTE_PREFIX,
            )
            db.add(v)
            await db.flush()
            amt = f"{1000 * i}.00"
            db.add(
                VoucherLine(
                    tenant_id=tid,
                    voucher_id=v.id,
                    account_id=dr_id,
                    entry_type="DEBIT",
                    amount=amt,
                    base_amount=amt,
                )
            )
            db.add(
                VoucherLine(
                    tenant_id=tid,
                    voucher_id=v.id,
                    account_id=cr_id,
                    entry_type="CREDIT",
                    amount=amt,
                    base_amount=amt,
                )
            )
            counts["vouchers"] += 1
            counts["voucher_lines"] += 2
        await db.flush()

    # --- Outstanding bills (AR/AP) ---
    bill_specs = [
        ("LKH-OBL-AR-01", "RECEIVABLE", "Buyer Alpha Co", today - timedelta(days=10), today + timedelta(days=20), "125000", "0"),
        ("LKH-OBL-AR-02", "RECEIVABLE", "Buyer Beta LLC", today - timedelta(days=40), today + timedelta(days=5), "88000", "10000"),
        ("LKH-OBL-AR-03", "RECEIVABLE", "Buyer Beta LLC", today - timedelta(days=70), today - timedelta(days=10), "62000", "0"),
        ("LKH-OBL-AP-01", "PAYABLE", v_fab.name, today - timedelta(days=15), today + timedelta(days=15), "95000", "0"),
        ("LKH-OBL-AP-02", "PAYABLE", v_trim.name, today - timedelta(days=35), today + timedelta(days=7), "41000", "5000"),
        ("LKH-OBL-AP-03", "PAYABLE", v_pack.name, today - timedelta(days=65), today - timedelta(days=5), "22000", "0"),
    ]
    for bno, btype, party, bd, dd, amt, paid in bill_specs:
        br = await db.execute(select(OutstandingBill).where(OutstandingBill.tenant_id == tid, OutstandingBill.bill_no == bno))
        if br.scalar_one_or_none():
            continue
        db.add(
            OutstandingBill(
                tenant_id=tid,
                bill_no=bno,
                party_name=party,
                bill_type=btype,
                bill_date=bd,
                due_date=dd,
                amount=amt,
                paid_amount=paid,
                currency="BDT",
                status="OPEN",
                notes=SEED_NOTE_PREFIX,
            )
        )
        counts["outstanding_bills"] += 1
    await db.flush()

    # --- Production: shift, sewing line, marker → lay → cut, sewing config, hourly, QC ---
    shr = await db.execute(
        select(ProductionShift).where(ProductionShift.tenant_id == tid, ProductionShift.shift_code == "LKH-S1")
    )
    shift = shr.scalar_one_or_none()
    if not shift:
        shift = ProductionShift(
            tenant_id=tid,
            shift_code="LKH-S1",
            name="Lakhsma Day Shift",
            start_time=time(8, 0),
            end_time=time(17, 0),
            break_minutes=60,
        )
        db.add(shift)
        await db.flush()
        counts["production_shifts"] += 1

    slr = await db.execute(select(SewingLine).where(SewingLine.tenant_id == tid, SewingLine.line_code == "LKH-L01"))
    sew_line = slr.scalar_one_or_none()
    if not sew_line:
        sew_line = SewingLine(
            tenant_id=tid,
            line_code="LKH-L01",
            name="Lakhsma Line 01",
            default_machine_count=45,
            running_machine_count=42,
            default_operator_count=40,
            default_helper_count=6,
        )
        db.add(sew_line)
        await db.flush()
        counts["sewing_lines"] += 1

    async def _style_for_order(o: Order) -> GarmentStyle | None:
        if not o.style_ref:
            return None
        sr = await db.execute(
            select(GarmentStyle).where(GarmentStyle.tenant_id == tid, GarmentStyle.style_code == o.style_ref)
        )
        return sr.scalar_one_or_none()

    cut_specs = [
        ("LKH-CT-ORD01", orders["LKH-ORD-01"], "completed"),
        ("LKH-CT-ORD02", orders["LKH-ORD-02"], "in_progress"),
        ("LKH-CT-ORD03", orders["LKH-ORD-03"], "planned"),
    ]
    for ticket_code, ord_row, ct_status in cut_specs:
        ctr = await db.execute(select(CutTicket).where(CutTicket.tenant_id == tid, CutTicket.ticket_code == ticket_code))
        if ctr.scalar_one_or_none():
            continue
        st = await _style_for_order(ord_row)
        mp_code = f"LKH-MP-{ticket_code}"
        mpr = await db.execute(select(MarkerPlan).where(MarkerPlan.tenant_id == tid, MarkerPlan.marker_code == mp_code))
        mp = mpr.scalar_one_or_none()
        if not mp:
            mp = MarkerPlan(
                tenant_id=tid,
                order_id=ord_row.id,
                style_id=st.id if st else None,
                marker_code=mp_code,
                status="approved",
                pcs_per_marker=120,
            )
            db.add(mp)
            await db.flush()
            counts["marker_plans"] += 1
        lay_code = f"LKH-LAY-{ticket_code}"
        lyr = await db.execute(select(LayPlan).where(LayPlan.tenant_id == tid, LayPlan.lay_code == lay_code))
        lay = lyr.scalar_one_or_none()
        if not lay:
            lay = LayPlan(
                tenant_id=tid,
                order_id=ord_row.id,
                marker_plan_id=mp.id,
                lay_code=lay_code,
                fabric_item_id=fab.id,
                num_plies=80,
                planned_pcs=int(ord_row.quantity or 1000),
                status="completed" if ct_status == "completed" else "planned",
            )
            db.add(lay)
            await db.flush()
            counts["lay_plans"] += 1
        db.add(
            CutTicket(
                tenant_id=tid,
                order_id=ord_row.id,
                lay_plan_id=lay.id,
                ticket_code=ticket_code,
                cut_date=today - timedelta(days=5) if ct_status != "planned" else None,
                total_pcs_cut=int(ord_row.quantity or 0) if ct_status == "completed" else None,
                status=ct_status,
            )
        )
        counts["cut_tickets"] += 1
    await db.flush()

    sew_cfgs = [
        (orders["LKH-ORD-01"], "completed", 5000.0, 4200.0),
        (orders["LKH-ORD-02"], "in_progress", 4800.0, 2100.0),
        (orders["LKH-ORD-03"], "planned", 6000.0, 0.0),
    ]
    for ord_row, st_cfg, planned, completed in sew_cfgs:
        cr = await db.execute(
            select(SewingLineStyleConfig).where(
                SewingLineStyleConfig.tenant_id == tid,
                SewingLineStyleConfig.line_id == sew_line.id,
                SewingLineStyleConfig.order_id == ord_row.id,
            )
        )
        if cr.scalar_one_or_none():
            continue
        st = await _style_for_order(ord_row)
        db.add(
            SewingLineStyleConfig(
                tenant_id=tid,
                line_id=sew_line.id,
                order_id=ord_row.id,
                style_id=st.id if st else None,
                start_date=today - timedelta(days=20),
                planned_end_date=today + timedelta(days=30),
                status=st_cfg,
                planned_qty=planned,
                completed_qty=completed,
                machine_count=42,
                operator_count=38,
                helper_count=6,
            )
        )
        counts["sewing_configs"] += 1
    await db.flush()

    cfg_rows = (
        await db.execute(
            select(SewingLineStyleConfig).where(
                SewingLineStyleConfig.tenant_id == tid,
                SewingLineStyleConfig.line_id == sew_line.id,
            )
        )
    ).scalars().all()
    cfg_by_order = {c.order_id: c for c in cfg_rows if c.order_id}

    for ord_key, h in [("LKH-ORD-01", 1), ("LKH-ORD-01", 2), ("LKH-ORD-02", 1), ("LKH-ORD-02", 2), ("LKH-ORD-03", 1), ("LKH-ORD-03", 2)]:
        o = orders[ord_key]
        cfg = cfg_by_order.get(o.id)
        note = f"{SEED_NOTE_PREFIX}:hourly:{ord_key}:{h}"
        hr_chk = await db.execute(select(HourlyProductionEntry).where(HourlyProductionEntry.tenant_id == tid, HourlyProductionEntry.remarks == note))
        if hr_chk.scalar_one_or_none():
            continue
        st = await _style_for_order(o)
        db.add(
            HourlyProductionEntry(
                tenant_id=tid,
                department_type="sewing",
                line_id=sew_line.id,
                line_style_config_id=cfg.id if cfg else None,
                order_id=o.id,
                style_id=st.id if st else None,
                shift_id=shift.id,
                production_date=today - timedelta(days=h),
                hour_slot=9 + h,
                target_qty=400.0,
                good_qty=320.0 + 10 * h,
                reject_qty=5.0,
                uom="pcs",
                remarks=note,
                entered_by_user_id=user_id,
            )
        )
        counts["hourly_entries"] += 1
    await db.flush()

    for slot, pass_qty, fail_qty, defects in [(10, 200, 0, None), (11, 180, 12, [{"code": "STITCH", "qty": 12}])]:
        qchk = await db.execute(
            select(ProductionQcCheck).where(
                ProductionQcCheck.tenant_id == tid,
                ProductionQcCheck.sewing_line_id == sew_line.id,
                ProductionQcCheck.shift_id == shift.id,
                ProductionQcCheck.production_date == today - timedelta(days=2),
                ProductionQcCheck.hour_slot == slot,
                ProductionQcCheck.check_type == "inline",
            )
        )
        if qchk.scalar_one_or_none():
            continue
        db.add(
            ProductionQcCheck(
                tenant_id=tid,
                order_id=orders["LKH-ORD-01"].id,
                sewing_line_id=sew_line.id,
                shift_id=shift.id,
                production_date=today - timedelta(days=2),
                hour_slot=slot,
                check_type="inline",
                total_checked=pass_qty + fail_qty,
                pass_qty=pass_qty,
                fail_qty=fail_qty,
                defect_codes=defects,
                notes=SEED_NOTE_PREFIX,
                entered_by_user_id=user_id,
            )
        )
        counts["qc_checks"] += 1
    await db.flush()

    # --- Shipments (require trade case) ---
    ship_specs = [
        ("LKH-SHIP-001", tc1, "SHIPPED", today - timedelta(days=20), today - timedelta(days=10)),
        ("LKH-SHIP-002", tc1, "BOOKED", today + timedelta(days=12), today + timedelta(days=28)),
        ("LKH-SHIP-003", tc2, "PLANNED", today + timedelta(days=35), today + timedelta(days=50)),
    ]
    for ref, tc, st, etd, eta in ship_specs:
        sr = await db.execute(select(Shipment).where(Shipment.tenant_id == tid, Shipment.reference == ref))
        if sr.scalar_one_or_none():
            continue
        db.add(
            Shipment(
                tenant_id=tid,
                trade_case_id=tc.id,
                reference=ref,
                status=st,
                carrier="Maersk Demo",
                booking_ref=f"BK-{ref}",
                etd=etd,
                eta=eta,
                origin_port="Chittagong",
                dest_port="Los Angeles",
                notes=SEED_NOTE_PREFIX,
            )
        )
        counts["shipments"] += 1
    await db.flush()

    # --- Facility snapshots (3 months) ---
    fac_snap_targets = [
        ("fp-full-demo-2026-01", "2026-01", fac1 or fac_wc, util_wc1, date(2026, 1, 28)),
        ("fp-full-demo-2026-02", "2026-02", fac_wc, util_wc2, date(2026, 2, 26)),
        ("fp-full-demo-2026-03", "2026-03", fac_exp, util_exp1, date(2026, 3, 30)),
    ]
    for scope, month, fac, util, snap_d in fac_snap_targets:
        if not fac:
            continue
        snr = await db.execute(
            select(FacilitySnapshot).where(FacilitySnapshot.tenant_id == tid, FacilitySnapshot.snapshot_scope_key == scope)
        )
        if snr.scalar_one_or_none():
            continue
        db.add(
            FacilitySnapshot(
                tenant_id=tid,
                facility_id=fac.id,
                facility_utilization_id=util.id,
                snapshot_type="monthly_lender_pack",
                snapshot_date=snap_d,
                snapshot_month=month,
                snapshot_scope_key=scope,
                data_json={
                    "facility_code": fac.facility_code,
                    "utilization_code": util.utilization_code,
                    "outstanding_principal": float(util.outstanding_principal or 0),
                    "sanctioned": float(fac.sanctioned_amount or 0),
                    "utilized": float(fac.utilized_amount or 0),
                    "utilization_pct": round(
                        100.0 * float(fac.utilized_amount or 0) / max(float(fac.sanctioned_amount or 1), 1.0),
                        2,
                    ),
                    "repayment_mix": {"paid": 2, "overdue": 2, "upcoming": 1, "due": 1},
                    "collateral_value_bdt": 12_500_000.0,
                    "seed": SEED_NOTE_PREFIX,
                },
                generated_by_user_id=user_id,
            )
        )
        counts["snapshots"] += 1
    await db.flush()

    # --- Order rows: MC link, FOB snapshot, milestones (financier portal visibility + alerts) ---
    counts["orders_visibility_enriched"] = await _enrich_orders_for_visibility(db, tid, orders, mc_export)

    # --- Tenant feature flags (financier) ---
    from app.external_access.constants import (
        FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED,
        FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED,
        FF_FINANCIER_PORTAL_ENABLED,
        FF_FINANCIER_PROJECTION_ENABLED,
    )

    _merge_flags(
        tenant,
        {
            FF_FINANCIER_PORTAL_ENABLED: True,
            FF_FINANCIER_FINANCIAL_SUMMARY_ENABLED: True,
            FF_FINANCIER_PROJECTION_ENABLED: True,
            FF_EXTERNAL_PORTAL_DOCUMENT_DOWNLOADS_ENABLED: True,
        },
    )

    # Single demo financier party: all tenant financier principals share scope with seeded facilities (procurement, BTB).
    mvr = await db.execute(select(Vendor.id).where(Vendor.tenant_id == tid, Vendor.vendor_code == MARKER_VENDOR_CODE))
    if mvr.scalar_one_or_none():
        acc_scope = await db.execute(
            select(ExternalFinancierAccess)
            .join(ExternalPrincipal, ExternalPrincipal.id == ExternalFinancierAccess.external_principal_id)
            .where(
                ExternalFinancierAccess.tenant_id == tid,
                ExternalPrincipal.principal_type == PRINCIPAL_FINANCIER,
            )
        )
        aligned = 0
        for access in acc_scope.scalars().all():
            if access.financier_party_id != principal_id:
                access.financier_party_id = principal_id
                aligned += 1
        counts["financier_access_party_aligned"] = aligned
        await db.flush()

    summary["counts"] = counts
    summary["principal_id"] = principal_id
    summary["btb_lc_ids"] = [btb1.id, btb2.id]
    return summary


async def seed_financier_full_demo(company_code: str) -> dict[str, Any]:
    """CLI / Docker entry: one commit on success."""
    async with AsyncSessionLocal() as db:
        summary = await run_financier_full_demo_seed(db, company_code)
        if summary.get("warning"):
            await db.commit()
            return summary
        await db.commit()
    return summary
