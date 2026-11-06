"""Stage 5 – Export: trade case, packing list + cartons, delivery challan, gate pass,
container / B/L, commercial invoice, export case (EXP), shipping documents,
bank submission and export proceeds realisation for order PRM-ORD-001.

Packing method (documented for the user)
----------------------------------------
* Solid colour + solid size cartons of 48 pcs (PCS_PER_CARTON).
  Per colour: S 25 ctns, M 50, L 50, XL 25, XXL 16 (= 166 ctns, 7,968 pcs).
* The XXL pieces that do not fill a carton (32 per colour) go into assorted
  "remnant" cartons at the end of the list: carton 499 = Black XXL 32 + White XXL 16,
  carton 500 = White XXL 16 + Navy XXL 32.  Total 500 cartons × 48 pcs = 24,000 pcs.
* Carton 60 × 40 × 30 cm (0.072 CBM), net 0.19 kg/pc, carton + polybags 1.45 kg.

Services used (same code paths as the UI)
-----------------------------------------
* Delivery challan + gate pass: inventory router functions (stock OUT from the FG store,
  QR signature, COGS GL hook, order pipeline auto-advance, TNA event sync).
* Packing list, cartons, container: logistics router functions.
* Trade case / shipment / stage transitions: trade-case + logistics router functions.
* Export case: commercial router function.
* Commercial invoice: `create_invoices_from_delivery_challan` + `issue_commercial_invoice`
  (ISSUE creates a DRAFT AR journal voucher), realisation via
  `create_receipt_from_commercial_invoice` (DRAFT receipt voucher + PENDING allocation).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import Decimal
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.document_signature import verify_payload_against_hash
from app.common.storage import get_media_root
from app.models import (
    BtbLc,
    ChartOfAccount,
    DeliveryChallan,
    DeliveryChallanItem,
    DeliveryChallanOrder,
    EnhancedGatePass,
    ExportCase,
    Item,
    MasterContract,
    Order,
    PackingList,
    ProformaInvoice,
    Quotation,
    Role,
    Shipment,
    ShipmentContainer,
    StockMovement,
    TradeCase,
    TradeCaseStageLog,
    TradeDocument,
    User,
    Voucher,
    Warehouse,
)
from app.models.commercial import CommercialInvoice, CommercialInvoiceReceiptAllocation
from app.models.compliance import BondedWarehouseEntry, UdEntitlement, UtilizationDeclaration
from app.models.merch import OrderFollowupAction
from app.models.packing_cartons import PackingListCartonLine
from app.modules.commercial.commercial_invoice_service import (
    create_invoices_from_delivery_challan,
    create_receipt_from_commercial_invoice,
    issue_commercial_invoice,
    load_commercial_invoice,
)
from app.modules.commercial.router import create_export_case
from app.modules.commercial.schemas import ExportCaseCreate
from app.modules.finance.system_coa_seeding_service import resolve_system_ledger
from app.modules.inventory.document_qr_service import delivery_challan_payload, sign_delivery_challan
from app.modules.inventory.router import (
    DeliveryChallanBody,
    DeliveryChallanItemBody,
    GatePassBody,
    _on_hand_qty,
    create_delivery_challan,
    create_enhanced_gate_pass,
    update_delivery_challan_status,
    update_enhanced_gate_pass_status,
)
from app.modules.logistics.carton_router import CartonLine, CartonsBody, put_cartons
from app.modules.logistics.router import (
    add_container_to_packing_list,
    create_packing_list,
    create_shipment,
    finalize_packing_list,
    update_container,
)
from app.modules.logistics.schemas import (
    PackingListContainerCreate,
    PackingListCreate,
    ShipmentContainerUpdate,
    ShipmentCreate,
)
from app.modules.orders.pipeline_service import auto_advance_order_pipeline
from app.modules.trade_case.router import create_trade_case, transition_trade_case
from app.modules.trade_case.schemas import TradeCaseCreate, TradeCaseTransition

from primark_demo.common import (
    BL_NUMBER,
    BTB_LC_REF,
    BUYER_PO_NUMBER,
    COLORS,
    COMMERCIAL_INVOICE_NO,
    CURRENCY,
    D,
    DELIVERY_CHALLAN_CODE,
    EXP_NUMBER,
    FINAL_DESTINATION,
    FINISHED_GOOD_CODE,
    GATE_PASS_CODE,
    HS_CODE,
    MATERIALS,
    ORDER_CODE,
    ORDER_QTY,
    PCS_PER_CARTON,
    PI_REFERENCE,
    PORT_OF_DISCHARGE,
    PORT_OF_LOADING,
    SALES_CONTRACT_REF,
    SHIPPING_TERM,
    STYLE_CODE,
    UNIT_PRICE_USD,
    USD_TO_BDT,
    WAREHOUSE_FG_NAME,
    DemoContext,
    color_size_matrix,
    find_one,
    require_one,
)

# ---------------------------------------------------------------------------
# Stage-5 constants (codes are PRM-* so every re-run finds the same rows)
# ---------------------------------------------------------------------------
TRADE_CASE_REF = "PRM-TC-EXP-001"
SHIPMENT_REF = "PRM-SHP-001"
PACKING_LIST_NO = "PRM-PL-001"
EXPORT_CASE_REF = "PRM-EXC-001"
REALISATION_KEY = "PRM-REAL-001"

BOOKING_DATE = date(2026, 8, 28)          # Maersk booking confirmed
BILL_OF_EXPORT_DATE = date(2026, 9, 6)    # customs assessment at Chattogram Custom House
ETA_DESTINATION = date(2026, 10, 6)       # vessel arrival Felixstowe

CARRIER = "Maersk Line (A.P. Moller-Maersk A/S)"
BOOKING_NO = "263871540"
FEEDER_VESSEL = "MAERSK KOLKATA V.2635W"
MOTHER_VESSEL = "MAERSK EDMONTON V.238W (T/S Tanjung Pelepas)"
CONTAINER_NO = "MSKU7182936"              # ISO 6346 check digit 6
CONTAINER_TYPE = "40HC"
CONTAINER_TARE_KG = Decimal("3900")
CONTAINER_MAX_GROSS_KG = Decimal("30480")
LINER_SEAL_NO = "ML-BD4471829"
CUSTOMS_SEAL_NO = "CCH-0926-55710"
BILL_OF_EXPORT_NO = "C-418273"
REX_NUMBER = "BDREXBD0412345678"
FDBC_NUMBER = "EBL/FDBC/2026/0917"
PRC_NUMBER = "EBL/PRC/2026/1023-118"

PRIME_MOVER_NO = "Dhaka Metro-Ta 22-1745"
DRIVER = "Md. Rafiqul Islam (licence DK0123456L00023)"
CF_AGENT = "Seacom Shipping & Clearing Ltd., Agrabad C/A, Chattogram (C&F licence 0471)"
OFF_DOCK = "Summit Alliance Port Ltd. (off-dock ICD), Chattogram"

CARTON_L_CM, CARTON_W_CM, CARTON_H_CM = Decimal("60"), Decimal("40"), Decimal("30")
NET_KG_PER_PC = Decimal("0.19")
CARTON_TARE_KG = Decimal("1.45")          # 5-ply carton + polybags + tissue

BANK_CHARGES_USD = Decimal("45.00")
ERQ_RETENTION_PCT = Decimal("7.5")        # FC retention quota kept in USD (ERQ account)

# Set to False if stage 6 should create the realisation receipt itself.
CREATE_REALISATION_RECEIPT = True

TRADE_STAGE_ORDER = ["DRAFT", "COMMERCIAL", "LC_OPEN", "BOOKING", "DOCS", "SHIPPED", "SETTLED"]

TWO = Decimal("0.01")


def _dt(d: date, hour: int = 10, minute: int = 0) -> datetime:
    """Business date at a fixed clock time (used for created_at / *_at columns)."""
    return datetime.combine(d, time(hour, minute))


# ---------------------------------------------------------------------------
# Small data helpers (pure Python – no database)
# ---------------------------------------------------------------------------
def _ship_matrix(ship_qty: int) -> list[tuple[str, str, int]]:
    """Colour × size quantities actually shipped.

    Normally the full order (24,000 pcs). If the finished-goods store holds less, the
    short pieces are taken one at a time from the biggest cells (M / L), spread over colours.
    """
    cells = [[name, size, qty] for name, _code, size, qty in color_size_matrix()]
    shortfall = max(sum(c[2] for c in cells) - ship_qty, 0)
    while shortfall > 0:
        for cell in sorted(cells, key=lambda c: -c[2]):
            if shortfall == 0:
                break
            if cell[2] > 0:
                cell[2] -= 1
                shortfall -= 1
    return [(c[0], c[1], c[2]) for c in cells if c[2] > 0]


@dataclass
class CartonPlanLine:
    carton_from: int
    carton_to: int
    color_name: str
    size: str
    pcs_per_carton: int


def _carton_plan(cells: list[tuple[str, str, int]]) -> list[CartonPlanLine]:
    """Solid colour/size cartons first, then assorted cartons for the left-over pieces."""
    plan: list[CartonPlanLine] = []
    next_no = 1
    leftovers: list[list] = []
    for color, size, qty in cells:
        full, rest = divmod(qty, PCS_PER_CARTON)
        if full:
            plan.append(CartonPlanLine(next_no, next_no + full - 1, color, size, PCS_PER_CARTON))
            next_no += full
        if rest:
            leftovers.append([color, size, rest])
    while leftovers:
        space = PCS_PER_CARTON
        while leftovers and space:
            color, size, rest = leftovers[0]
            take = min(rest, space)
            plan.append(CartonPlanLine(next_no, next_no, color, size, take))
            space -= take
            leftovers[0][2] -= take
            if leftovers[0][2] == 0:
                leftovers.pop(0)
        next_no += 1
    return plan


def _carton_lines_for_api(plan: list[CartonPlanLine]) -> list[CartonLine]:
    """Carton lines with per-carton weights/dimensions (same values on every line of a range)."""
    pcs_per_range: dict[tuple[int, int], int] = {}
    for p in plan:
        key = (p.carton_from, p.carton_to)
        pcs_per_range[key] = pcs_per_range.get(key, 0) + p.pcs_per_carton
    lines = []
    for p in plan:
        pcs = pcs_per_range[(p.carton_from, p.carton_to)]
        net = (NET_KG_PER_PC * pcs).quantize(Decimal("0.001"))
        lines.append(CartonLine(
            carton_from=p.carton_from, carton_to=p.carton_to, color_name=p.color_name, size=p.size,
            pcs_per_carton=p.pcs_per_carton, net_kg_per_carton=net, gross_kg_per_carton=net + CARTON_TARE_KG,
            length_cm=CARTON_L_CM, width_cm=CARTON_W_CM, height_cm=CARTON_H_CM,
        ))
    return lines


def _carton_ranges_text(plan: list[CartonPlanLine]) -> str:
    """Human-readable 'carton no. range per colour' text for notes and documents."""
    rows = []
    for color, _code in COLORS:
        mine = [p for p in plan if p.color_name == color and p.carton_from != p.carton_to]
        if mine:
            sizes = ", ".join(f"{p.size} {p.carton_from}-{p.carton_to}" for p in mine)
            rows.append(f"{color}: {sizes}")
    assorted = sorted({p.carton_from for p in plan if p.carton_from == p.carton_to})
    for no in assorted:
        parts = " + ".join(f"{p.color_name} {p.size} {p.pcs_per_carton}" for p in plan if p.carton_from == no)
        rows.append(f"Carton {no} (assorted): {parts}")
    return "; ".join(rows)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------
async def _admin_user(db: AsyncSession, ctx: DemoContext) -> User:
    """First active admin user of the tenant (routers need a real User)."""
    user = (
        await db.execute(
            select(User)
            .join(Role, Role.id == User.role_id)
            .where(User.tenant_id == ctx.tenant_id, User.is_active.is_(True), Role.name == "admin")
            .order_by(User.id)
            .limit(1)
        )
    ).scalars().first()
    if user is None:
        raise RuntimeError("No active admin user for this tenant – cannot call the app services.")
    return user


async def _stage_log_date(db: AsyncSession, trade_case_id: int, to_stage: str, when: datetime) -> None:
    """Back-date the newest stage-log row of a transition to the business date."""
    log = (
        await db.execute(
            select(TradeCaseStageLog)
            .where(TradeCaseStageLog.trade_case_id == trade_case_id, TradeCaseStageLog.to_stage == to_stage)
            .order_by(TradeCaseStageLog.id.desc())
            .limit(1)
        )
    ).scalars().first()
    if log is not None:
        log.created_at = when


# ---------------------------------------------------------------------------
# 1. Trade case + shipment
# ---------------------------------------------------------------------------
async def _ensure_trade_case(db, ctx, user, order: Order, pi: ProformaInvoice, mc: MasterContract,
                             ship_value: Decimal) -> TradeCase:
    tc = await find_one(db, TradeCase, tenant_id=ctx.tenant_id, reference=TRADE_CASE_REF)
    if tc is None:
        btb = await find_one(db, BtbLc, tenant_id=ctx.tenant_id, reference=BTB_LC_REF)
        out = await create_trade_case(
            TradeCaseCreate(
                direction="EXPORT", reference=TRADE_CASE_REF, order_id=order.id, customer_id=ctx.customer.id,
                proforma_invoice_id=pi.id, master_contract_id=mc.id, btb_lc_id=btb.id if btb else None,
                etd=D["vessel_departure"], eta=ETA_DESTINATION, amount=float(ship_value), currency=CURRENCY,
            ),
            tenant=ctx.tenant, user=user, db=db, _=None,
        )
        tc = await db.get(TradeCase, out.id)
        tc.created_at = _dt(D["sales_contract"])
        ctx.log(f"Trade case {TRADE_CASE_REF} (export, linked to order / PI / sales contract"
                f"{' / BTB LC' if btb else ''})")
    quotation = await db.get(Quotation, order.quotation_id) if order.quotation_id else None
    if quotation and quotation.cost_per_piece and tc.cost_amount is None:
        cost = (Decimal(str(quotation.cost_per_piece)) * (ship_value / UNIT_PRICE_USD)).quantize(TWO)
        margin = ship_value - cost
        tc.cost_amount = float(cost)
        tc.margin_amount = float(margin)
        tc.margin_pct = float((margin / ship_value * 100).quantize(TWO))
        tc.base_currency = "BDT"
        tc.base_currency_margin = float((margin * USD_TO_BDT).quantize(TWO))
    await db.flush()
    return tc


async def _ensure_shipment(db, ctx, user, tc: TradeCase) -> Shipment:
    ship = await find_one(db, Shipment, tenant_id=ctx.tenant_id, reference=SHIPMENT_REF)
    if ship is not None:
        return ship
    notes = (
        f"FCL 1 x {CONTAINER_TYPE} {CONTAINER_NO}, liner seal {LINER_SEAL_NO}, customs seal {CUSTOMS_SEAL_NO}. "
        f"Feeder {FEEDER_VESSEL} sailed Chattogram {D['vessel_departure']:%d %b %Y}; "
        f"mother vessel {MOTHER_VESSEL}. B/L {BL_NUMBER} (shipped on board, freight collect – FOB). "
        f"EXP {EXP_NUMBER}; bill of export {BILL_OF_EXPORT_NO} dated {BILL_OF_EXPORT_DATE:%d %b %Y}. "
        f"C&F agent: {CF_AGENT}. Final destination: {FINAL_DESTINATION}."
    )
    out = await create_shipment(
        ShipmentCreate(
            trade_case_id=tc.id, reference=SHIPMENT_REF, status="DELIVERED", carrier=CARRIER,
            booking_ref=BOOKING_NO, bl_awb=BL_NUMBER, etd=D["vessel_departure"], eta=ETA_DESTINATION,
            origin_port=PORT_OF_LOADING, dest_port=PORT_OF_DISCHARGE, notes=notes,
        ),
        tenant=ctx.tenant, user=user, db=db,
    )
    ship = await db.get(Shipment, out.id)
    ship.created_at = _dt(BOOKING_DATE)
    await db.flush()
    ctx.log(f"Shipment {SHIPMENT_REF}: {CARRIER}, B/L {BL_NUMBER}, ETD {D['vessel_departure']}, "
            f"ETA {ETA_DESTINATION} (DELIVERED)")
    return ship


# ---------------------------------------------------------------------------
# 2. Delivery challan + gate pass (real inventory router → stock OUT, QR, pipeline)
# ---------------------------------------------------------------------------
async def _ensure_delivery_challan(db, ctx, user, order: Order, fg: Item, wh: Warehouse,
                                   ship_qty: int) -> DeliveryChallan:
    dc = await find_one(db, DeliveryChallan, tenant_id=ctx.tenant_id, challan_code=DELIVERY_CHALLAN_CODE)
    if dc is None:
        notes = (
            f"Export shipment of {ORDER_CODE} (Primark PO {BUYER_PO_NUMBER}), {ship_qty:,} pcs in "
            f"{-(-ship_qty // PCS_PER_CARTON)} cartons. Factory-stuffed FCL {CONTAINER_TYPE} {CONTAINER_NO}, "
            f"liner seal {LINER_SEAL_NO}. Prime mover {PRIME_MOVER_NO}, driver {DRIVER}. "
            f"To {OFF_DOCK} for customs, then Chattogram port (vessel {FEEDER_VESSEL})."
        )
        out = await create_delivery_challan(
            DeliveryChallanBody(
                challan_code=DELIVERY_CHALLAN_CODE, customer_name=ctx.customer.name,
                delivery_date=D["ex_factory"], notes=notes,
                items=[DeliveryChallanItemBody(item_id=fg.id, warehouse_id=wh.id, quantity=str(ship_qty))],
                order_ids=[order.id],
            ),
            tenant=ctx.tenant, user=user, db=db,
        )
        dc = await db.get(DeliveryChallan, out.id)
        ctx.log(f"Delivery challan {DELIVERY_CHALLAN_CODE} created: {ship_qty:,} pcs {FINISHED_GOOD_CODE} "
                f"from '{wh.name}'")
    if (dc.status or "").upper() != "POSTED":
        if (dc.status or "").upper() not in ("APPROVED",):
            await update_delivery_challan_status(dc.id, {"status": "APPROVED"}, tenant=ctx.tenant, user=user, db=db)
        await update_delivery_challan_status(dc.id, {"status": "POSTED"}, tenant=ctx.tenant, user=user, db=db)
        dc = await db.get(DeliveryChallan, dc.id)
        ctx.log(f"Delivery challan {DELIVERY_CHALLAN_CODE} POSTED (FG stock out, pipeline auto-advanced)")
    await _fix_challan_signature(db, ctx, dc)
    dc.created_at = _dt(D["ex_factory"], 9)
    dc.signed_at = _dt(D["ex_factory"], 15)
    for mv in (await db.execute(
        select(StockMovement).where(
            StockMovement.tenant_id == ctx.tenant_id,
            StockMovement.reference_type == "DELIVERY_CHALLAN",
            StockMovement.reference_id == dc.id,
        )
    )).scalars():
        mv.order_id = order.id
        mv.created_at = _dt(D["ex_factory"], 15)
    await db.flush()
    return dc


async def _fix_challan_signature(db, ctx, dc: DeliveryChallan) -> None:
    """The POST endpoint signs the QR payload *before* it switches status to POSTED,
    so the stored hash no longer matches. Re-sign so the QR verification page shows 'valid'."""
    lines = list((await db.execute(
        select(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == dc.id)
    )).scalars())
    oids = [r[0] for r in (await db.execute(
        select(DeliveryChallanOrder.order_id).where(DeliveryChallanOrder.delivery_challan_id == dc.id)
    )).all()]
    ok, _ = verify_payload_against_hash(dc.signature_hash, delivery_challan_payload(dc, lines, oids))
    if not ok:
        sign_delivery_challan(dc, lines, oids)
        await db.flush()
        ctx.log(f"Re-signed {DELIVERY_CHALLAN_CODE} QR payload (app signs before status change – see report)")


async def _ensure_gate_pass(db, ctx, user, dc: DeliveryChallan, ship_qty: int) -> EnhancedGatePass:
    gp = await find_one(db, EnhancedGatePass, tenant_id=ctx.tenant_id, gate_pass_code=GATE_PASS_CODE)
    if gp is None:
        out = await create_enhanced_gate_pass(
            GatePassBody(
                gate_pass_code=GATE_PASS_CODE, challan_id=dc.id,
                purpose=f"Outgoing – export shipment {ORDER_CODE} against challan {DELIVERY_CHALLAN_CODE}",
                destination=OFF_DOCK, vehicle_no=PRIME_MOVER_NO,
                notes=(f"{ship_qty:,} pcs / {-(-ship_qty // PCS_PER_CARTON)} cartons in {CONTAINER_TYPE} "
                       f"{CONTAINER_NO}, liner seal {LINER_SEAL_NO}. Driver {DRIVER}. Left main gate "
                       f"{D['ex_factory']:%d %b %Y} 16:30."),
            ),
            tenant=ctx.tenant, user=user, db=db,
        )
        gp = await db.get(EnhancedGatePass, out.id)
        ctx.log(f"Gate pass {GATE_PASS_CODE} created (outgoing, vehicle {PRIME_MOVER_NO})")
    if (gp.status or "").upper() != "RELEASED":
        await update_enhanced_gate_pass_status(gp.id, {"status": "APPROVED"}, tenant=ctx.tenant, user=user, db=db)
        # Guard acknowledgement before RELEASED, so the QR signature includes it.
        await update_enhanced_gate_pass_status(gp.id, {"guard_acknowledged": True}, tenant=ctx.tenant, user=user, db=db)
        await update_enhanced_gate_pass_status(gp.id, {"status": "RELEASED"}, tenant=ctx.tenant, user=user, db=db)
        gp = await db.get(EnhancedGatePass, gp.id)
        ctx.log(f"Gate pass {GATE_PASS_CODE} APPROVED → guard acknowledged → RELEASED")
    gp.created_at = _dt(D["ex_factory"], 14)
    gp.signed_at = _dt(D["ex_factory"], 16, 30)
    await db.flush()
    return gp


# ---------------------------------------------------------------------------
# 3. Packing list, cartons, container (logistics routers)
# ---------------------------------------------------------------------------
async def _ensure_packing_list(db, ctx, user, order: Order, dc: DeliveryChallan, ship: Shipment,
                               plan: list[CartonPlanLine]) -> PackingList:
    pl = await find_one(db, PackingList, tenant_id=ctx.tenant_id, packing_list_number=PACKING_LIST_NO)
    if pl is None:
        out = await create_packing_list(
            PackingListCreate(
                packing_list_number=PACKING_LIST_NO, shipment_id=ship.id, order_id=order.id,
                delivery_challan_id=dc.id, packing_date=D["finishing_end"], status="DRAFT",
                notes=(f"Solid colour / solid size cartons of {PCS_PER_CARTON} pcs, assorted remnant cartons at "
                       f"the end. Carton {CARTON_L_CM:.0f}x{CARTON_W_CM:.0f}x{CARTON_H_CM:.0f} cm. "
                       f"Shipping marks: PRIMARK / PO {BUYER_PO_NUMBER} / STYLE {STYLE_CODE} / "
                       f"CTN NO. x OF {plan[-1].carton_to} / MADE IN BANGLADESH. "
                       f"Carton ranges – {_carton_ranges_text(plan)}"),
            ),
            tenant=ctx.tenant, user=user, db=db,
        )
        pl = await db.get(PackingList, out.id)
        ctx.log(f"Packing list {PACKING_LIST_NO} created (order {ORDER_CODE}, challan {DELIVERY_CHALLAN_CODE}, "
                f"shipment {SHIPMENT_REF})")
    if (pl.status or "").upper() == "FINALIZED":
        return pl

    if await find_one(db, PackingListCartonLine, packing_list_id=pl.id) is None:
        res = await put_cartons(pl.id, CartonsBody(lines=_carton_lines_for_api(plan), sync_header=True),
                                tenant=ctx.tenant, user=user, db=db)
        s = res.summary
        ctx.log(f"Cartons: {s.total_cartons} ctns, {s.total_pcs:,} pcs, net {s.net_kg} kg, "
                f"gross {s.gross_kg} kg, {s.cbm} CBM ({len(res.lines)} carton lines)")

    cont = await find_one(db, ShipmentContainer, tenant_id=ctx.tenant_id, packing_list_id=pl.id,
                          container_number=CONTAINER_NO)
    if cont is None:
        out = await add_container_to_packing_list(
            pl.id,
            PackingListContainerCreate(
                container_number=CONTAINER_NO, container_type=CONTAINER_TYPE, seal_number=LINER_SEAL_NO,
                tare_weight_kg=float(CONTAINER_TARE_KG), max_weight_kg=float(CONTAINER_MAX_GROSS_KG),
                loading_status="EMPTY",
                notes=f"Factory stuffing {D['ex_factory']:%d %b %Y}; customs seal {CUSTOMS_SEAL_NO}.",
            ),
            tenant=ctx.tenant, user=user, db=db,
        )
        await update_container(out.id, ShipmentContainerUpdate(loading_status="CLOSED"),
                               tenant=ctx.tenant, user=user, db=db)
        cont = await db.get(ShipmentContainer, out.id)
        cont.loaded_at = _dt(D["ex_factory"], 13)
        cont.created_at = _dt(D["ex_factory"], 8)
        ctx.log(f"Container {CONTAINER_NO} ({CONTAINER_TYPE}) seal {LINER_SEAL_NO} – stuffed and sealed")

    await finalize_packing_list(pl.id, tenant=ctx.tenant, user=user, db=db)
    pl = await db.get(PackingList, pl.id)
    pl.created_at = _dt(D["finishing_end"])
    await db.flush()
    ctx.log(f"Packing list {PACKING_LIST_NO} FINALIZED")
    return pl


# ---------------------------------------------------------------------------
# 4. Commercial invoice (service: from POSTED challan → ISSUE → draft AR voucher)
# ---------------------------------------------------------------------------
async def _ensure_commercial_invoice(db, ctx, user, dc: DeliveryChallan, plan: list[CartonPlanLine],
                                     ship_qty: int) -> CommercialInvoice:
    ci = await find_one(db, CommercialInvoice, tenant_id=ctx.tenant_id, invoice_code=COMMERCIAL_INVOICE_NO)
    if ci is None:
        invoices, _created = await create_invoices_from_delivery_challan(
            db, tenant_id=ctx.tenant_id, user_id=user.id, challan_id=dc.id,
            idempotency_key=COMMERCIAL_INVOICE_NO, exchange_rate_to_base=USD_TO_BDT,
            invoice_date=D["ex_factory"],
        )
        ci = invoices[0]
        auto_code = ci.invoice_code
        ci.invoice_code = COMMERCIAL_INVOICE_NO
        ci.notes = (
            f"From delivery challan {DELIVERY_CHALLAN_CODE}. Primark PO {BUYER_PO_NUMBER}, PI {PI_REFERENCE}, "
            f"sales contract {SALES_CONTRACT_REF}. {ship_qty:,} pcs men's organic cotton crew-neck T-shirt, "
            f"HS {HS_CODE}, USD {UNIT_PRICE_USD}/pc {SHIPPING_TERM}. {-(-ship_qty // PCS_PER_CARTON)} cartons, "
            f"packing list {PACKING_LIST_NO}. Vessel {FEEDER_VESSEL}, B/L {BL_NUMBER}, EXP {EXP_NUMBER}, "
            f"container {CONTAINER_NO}. Port of loading {PORT_OF_LOADING}, discharge {PORT_OF_DISCHARGE}. "
            f"Payment T/T 45 days from B/L via Eastern Bank PLC. Origin statement (UK DCTS, REX {REX_NUMBER}): "
            f"'The exporter of the products covered by this document declares that, except where otherwise "
            f"clearly indicated, these products are of Bangladesh preferential origin.'"
        )
        ci.created_at = _dt(D["ex_factory"], 11)
        await db.flush()
        ctx.log(f"Commercial invoice {COMMERCIAL_INVOICE_NO} created from challan (service code {auto_code} renamed)")
    if (ci.status or "").upper() == "DRAFT":
        full = await load_commercial_invoice(db, tenant_id=ctx.tenant_id, invoice_id=ci.id)
        await issue_commercial_invoice(db, tenant_id=ctx.tenant_id, user_id=user.id, invoice=full)
        ci = full
        ci.issued_at = _dt(D["ex_factory"], 16)
        voucher = await db.get(Voucher, ci.ar_voucher_id)
        voucher.description = f"{voucher.description} – order {ORDER_CODE}, Primark PO {BUYER_PO_NUMBER}"
        await db.flush()
        ctx.log(f"Commercial invoice {COMMERCIAL_INVOICE_NO} ISSUED: USD {ci.total_amount} "
                f"(BDT {ci.base_total_amount} @ {USD_TO_BDT}); draft AR journal {voucher.voucher_number} "
                f"(Dr Export Receivable / Cr Sales Revenue – Export, status {voucher.status})")
    return ci


# ---------------------------------------------------------------------------
# 5. Export case (commercial router)
# ---------------------------------------------------------------------------
async def _ensure_export_case(db, ctx, user, order: Order, tc: TradeCase, ci: CommercialInvoice,
                              dc: DeliveryChallan) -> ExportCase:
    ec = await find_one(db, ExportCase, tenant_id=ctx.tenant_id, reference=EXPORT_CASE_REF)
    if ec is None:
        out = await create_export_case(
            ExportCaseCreate(
                reference=EXPORT_CASE_REF, status="APPROVED", case_date=BOOKING_DATE,
                amount=float(ci.total_amount), trade_case_id=tc.id, order_id=order.id,
                export_license_number=EXP_NUMBER, destination_country="United Kingdom", shipping_mode="SEA",
                incoterms="FOB", expected_shipment_date=D["vessel_departure"],
                actual_shipment_date=D["vessel_departure"], customs_agent=CF_AGENT,
            ),
            tenant=ctx.tenant, user=user, db=db,
        )
        ec = await db.get(ExportCase, out.id)
        ec.created_at = _dt(BOOKING_DATE)
        ctx.log(f"Export case {EXPORT_CASE_REF}: EXP {EXP_NUMBER}, FOB / SEA → United Kingdom, "
                f"shipped {D['vessel_departure']}, C&F {CF_AGENT.split(',')[0]}")
    for mv in (await db.execute(
        select(StockMovement).where(
            StockMovement.tenant_id == ctx.tenant_id,
            StockMovement.reference_type == "DELIVERY_CHALLAN",
            StockMovement.reference_id == dc.id,
        )
    )).scalars():
        mv.export_case_id = ec.id
    await db.flush()
    return ec


# ---------------------------------------------------------------------------
# 6. Shipping documents on the trade case + stage transitions
# ---------------------------------------------------------------------------
def _documents(ship_qty: int, ci: CommercialInvoice, pl: PackingList, plan: list[CartonPlanLine]) -> list[dict]:
    """Trade documents: type, business date, linked record and plain-text body."""
    ctns = plan[-1].carton_to
    net_usd = (Decimal(str(ci.total_amount)) - BANK_CHARGES_USD).quantize(TWO)
    erq = (net_usd * ERQ_RETENTION_PCT / 100).quantize(TWO)
    return [
        {"type": "PI", "date": D["pi_issued"], "entity": "order",
         "text": f"Proforma invoice {PI_REFERENCE} for {ORDER_CODE}, {ORDER_QTY:,} pcs @ USD {UNIT_PRICE_USD} "
                 f"{SHIPPING_TERM}; sales contract {SALES_CONTRACT_REF}."},
        {"type": "BOOKING_CONFIRM", "date": BOOKING_DATE, "entity": "shipment",
         "text": f"{CARRIER} booking {BOOKING_NO}: 1 x {CONTAINER_TYPE}, {PORT_OF_LOADING} → {PORT_OF_DISCHARGE}, "
                 f"feeder {FEEDER_VESSEL}, ETD {D['vessel_departure']}, cut-off {D['ex_factory']}."},
        {"type": "INSPECTION_CERTIFICATE", "date": D["final_inspection"], "entity": "order",
         "text": f"Final AQL 2.5 inspection PASSED on {D['final_inspection']} for {ORDER_CODE} "
                 f"({ship_qty:,} pcs). Shipment released by Primark QA."},
        {"type": "INVOICE", "date": D["ex_factory"], "entity": "order",
         "text": f"Commercial invoice {COMMERCIAL_INVOICE_NO} dated {D['ex_factory']}: {ship_qty:,} pcs x USD "
                 f"{UNIT_PRICE_USD} = USD {ci.total_amount} {SHIPPING_TERM}. HS {HS_CODE}. B/L {BL_NUMBER}."},
        {"type": "PACKING_LIST", "date": D["ex_factory"], "entity": "order",
         "text": f"Packing list {PACKING_LIST_NO}: {ctns} cartons, {ship_qty:,} pcs, net {pl.net_weight} kg, "
                 f"gross {pl.gross_weight} kg. {_carton_ranges_text(plan)}"},
        {"type": "EXP_FORM", "date": D["ex_factory"], "entity": "order",
         "text": f"EXP form {EXP_NUMBER} certified by Eastern Bank PLC (AD branch) for USD {ci.total_amount}, "
                 f"buyer Primark Limited, destination United Kingdom."},
        {"type": "SHIPPING_BILL", "date": BILL_OF_EXPORT_DATE, "entity": "shipment",
         "text": f"Bill of export {BILL_OF_EXPORT_NO} (ASYCUDA World) assessed at Chattogram Custom House on "
                 f"{BILL_OF_EXPORT_DATE}, EXP {EXP_NUMBER}, C&F agent {CF_AGENT}."},
        {"type": "BL", "date": D["vessel_departure"], "entity": "shipment",
         "text": f"Bill of lading {BL_NUMBER}, shipped on board {D['vessel_departure']}, vessel {FEEDER_VESSEL}, "
                 f"container {CONTAINER_NO} / seal {LINER_SEAL_NO}, {ctns} cartons, gross {pl.gross_weight} kg, "
                 f"freight collect. Consignee Primark Stores Limited, notify Primark Limited."},
        {"type": "CERTIFICATE_OF_ORIGIN", "date": D["vessel_departure"], "entity": "shipment",
         "text": f"Statement on origin under UK DCTS (replaces GSP Form A) on invoice {COMMERCIAL_INVOICE_NO}, "
                 f"REX {REX_NUMBER}: products of Bangladesh preferential origin."},
        {"type": "BANK_SUBMISSION", "date": D["docs_submitted"], "entity": "order",
         "text": f"Export documents submitted to Eastern Bank PLC, Principal Branch on {D['docs_submitted']} "
                 f"for collection (FDBC {FDBC_NUMBER}): invoice, packing list, B/L, EXP, origin statement, "
                 f"inspection certificate. Amount USD {ci.total_amount}."},
        {"type": "PRC", "date": D["payment_received"], "entity": "order",
         "text": f"Proceeds realisation certificate {PRC_NUMBER}: USD {ci.total_amount} realised on "
                 f"{D['payment_received']} less bank charges USD {BANK_CHARGES_USD} = USD {net_usd} credited. "
                 f"ERQ {ERQ_RETENTION_PCT}% USD {erq} retained in FC account, balance converted at BDT {USD_TO_BDT}."},
    ]


async def _ensure_trade_documents(db, ctx, user, tc: TradeCase, ship: Shipment, order: Order,
                                  docs: list[dict]) -> None:
    """Write each document as a small text file under media/<tenant>/trade_docs and register it."""
    folder = get_media_root() / str(ctx.tenant_id) / "trade_docs"
    folder.mkdir(parents=True, exist_ok=True)
    added = []
    for doc in docs:
        file_name = f"{TRADE_CASE_REF}_{doc['type']}.txt"
        if await find_one(db, TradeDocument, trade_case_id=tc.id, file_name=file_name):
            continue
        path: Path = folder / f"prm-tc-exp-001-{doc['type'].lower().replace('_', '-')}.txt"
        path.write_text(f"{doc['type']} – {TRADE_CASE_REF} – {doc['date']}\n\n{doc['text']}\n", encoding="utf-8")
        linked_id = ship.id if doc["entity"] == "shipment" else order.id
        db.add(TradeDocument(
            tenant_id=ctx.tenant_id, trade_case_id=tc.id,
            shipment_id=ship.id if doc["entity"] == "shipment" else None,
            document_type=doc["type"], file_name=file_name, storage_path=str(path.resolve()), version=1,
            linked_entity_type=doc["entity"], linked_entity_id=linked_id, uploaded_by_id=user.id,
            created_at=_dt(doc["date"], 12),
        ))
        added.append(doc["type"])
    await db.flush()
    if added:
        ctx.log(f"Trade documents on {TRADE_CASE_REF}: {', '.join(added)}")


async def _advance_trade_case(db, ctx, user, tc: TradeCase) -> None:
    """Walk the trade case through its stages with the real transition endpoint."""
    steps = [
        ("COMMERCIAL", _dt(D["pi_issued"]), f"PI {PI_REFERENCE} issued"),
        ("BOOKING", _dt(BOOKING_DATE), f"Maersk booking {BOOKING_NO} confirmed"),
        ("DOCS", _dt(D["vessel_departure"], 11), f"B/L {BL_NUMBER}, invoice and packing list complete"),
        ("SHIPPED", _dt(D["vessel_departure"], 18), f"Sailed on {FEEDER_VESSEL}"),
        ("SETTLED", _dt(D["payment_received"], 15), f"Proceeds realised, PRC {PRC_NUMBER}"),
    ]
    for stage, when, note in steps:
        if TRADE_STAGE_ORDER.index(tc.current_stage or "DRAFT") >= TRADE_STAGE_ORDER.index(stage):
            continue
        await transition_trade_case(tc.id, TradeCaseTransition(to_stage=stage, notes=note),
                                    tenant=ctx.tenant, user=user, db=db, _=None)
        await _stage_log_date(db, tc.id, stage, when)
        ctx.log(f"Trade case → {stage} ({when:%d %b %Y})")
    tc = await db.get(TradeCase, tc.id)
    if tc.current_stage == "SETTLED":
        tc.closed_at = _dt(D["payment_received"], 15)
        for action in (await db.execute(
            select(OrderFollowupAction).where(
                OrderFollowupAction.tenant_id == ctx.tenant_id,
                OrderFollowupAction.external_id == tc.id,
                OrderFollowupAction.phase == "TRADE",
            )
        )).scalars():
            if action.status != "completed":
                action.status = "completed"
                action.actual_completion_date = D["payment_received"]
                action.completed_at = _dt(D["payment_received"], 15)
                action.completed_by_id = user.id
                action.created_at = _dt(D["vessel_departure"], 11)
    await db.flush()


# ---------------------------------------------------------------------------
# 7. Optional: bond register EXPORT entries (only when a UD exists for this contract)
# ---------------------------------------------------------------------------
async def _maybe_bond_export_entries(db, ctx, tc: TradeCase, ship_qty: int) -> None:
    ud = (await db.execute(
        select(UtilizationDeclaration).where(
            UtilizationDeclaration.tenant_id == ctx.tenant_id,
            (UtilizationDeclaration.export_lc_no == SALES_CONTRACT_REF) | (UtilizationDeclaration.trade_case_id == tc.id),
        ).limit(1)
    )).scalars().first()
    if ud is None:
        ctx.log("Bond register: no UD for this sales contract – EXPORT bond entries skipped")
        return
    if ud.trade_case_id is None:
        ud.trade_case_id = tc.id
    added = 0
    for ent in (await db.execute(select(UdEntitlement).where(UdEntitlement.ud_id == ud.id))).scalars():
        desc = (ent.item_description or "").lower()
        spec = next((m for m in MATERIALS if m.code.lower() in desc or m.name.lower() in desc), None)
        if spec is None:
            continue
        ref = f"{EXP_NUMBER}/{spec.code}"
        if await find_one(db, BondedWarehouseEntry, tenant_id=ctx.tenant_id, reference_no=ref):
            continue
        qty = (spec.consumption_per_pc * ship_qty * (1 + spec.wastage_pct / 100)).quantize(Decimal("0.0001"))
        db.add(BondedWarehouseEntry(
            tenant_id=ctx.tenant_id, reference_no=ref, entry_type="EXPORT", ud_no=ud.ud_no,
            ud_entitlement_id=ent.id, trade_case_id=tc.id, item_description=ent.item_description, quantity=qty,
            value_bdt=(qty * spec.unit_price * USD_TO_BDT).quantize(TWO), status="OPEN",
            entry_date=D["ex_factory"], notes=f"Consumed in {ship_qty:,} pcs shipped under {EXP_NUMBER}",
            created_at=_dt(D["ex_factory"]),
        ))
        added += 1
    await db.flush()
    ctx.log(f"Bond register: {added} EXPORT consumption entries against UD {ud.ud_no}")


# ---------------------------------------------------------------------------
# 8. Realisation: receipt allocation on the commercial invoice (draft voucher)
# ---------------------------------------------------------------------------
async def _bank_ledger(db, ctx) -> ChartOfAccount | None:
    """Eastern Bank ledger if one exists, otherwise the first bank ledger of the tenant."""
    banks = list((await db.execute(
        select(ChartOfAccount)
        .where(ChartOfAccount.tenant_id == ctx.tenant_id, ChartOfAccount.is_bank_account.is_(True),
               ChartOfAccount.is_active.is_(True))
        .order_by(ChartOfAccount.id)
    )).scalars())
    eastern = [b for b in banks if "eastern" in (b.name or "").lower()]
    return (eastern or banks or [None])[0]


async def _ensure_realisation(db, ctx, user, ci: CommercialInvoice) -> None:
    if not CREATE_REALISATION_RECEIPT:
        ctx.log("Realisation receipt skipped (CREATE_REALISATION_RECEIPT = False)")
        return
    if await find_one(db, CommercialInvoiceReceiptAllocation, commercial_invoice_id=ci.id,
                      idempotency_key=REALISATION_KEY):
        return
    bank = await _bank_ledger(db, ctx)
    if bank is None:
        ctx.log("Realisation skipped: no bank ledger in chart of accounts")
        return
    receivable_id = await resolve_system_ledger(db, ctx.tenant_id, "EXPORT_RECEIVABLE")
    async with db.begin_nested():
        alloc, voucher, outstanding, _created = await create_receipt_from_commercial_invoice(
            db, tenant_id=ctx.tenant_id, user_id=user.id, invoice=ci, amount=Decimal(str(ci.total_amount)),
            receipt_date=D["payment_received"], bank_ledger_id=bank.id, receivable_ledger_id=receivable_id,
            currency=CURRENCY, exchange_rate_to_base=USD_TO_BDT, idempotency_key=REALISATION_KEY,
        )
        voucher.description = (
            f"Export proceeds {ORDER_CODE} – CI {COMMERCIAL_INVOICE_NO}, FDBC {FDBC_NUMBER}, PRC {PRC_NUMBER}. "
            f"Gross USD {ci.total_amount}; bank charges USD {BANK_CHARGES_USD} to be booked separately."
        )
    ctx.log(f"Realisation {D['payment_received']}: draft receipt {voucher.voucher_number} USD {alloc.allocated_amount} "
            f"(Dr {bank.name} / Cr Export Receivable), allocation {alloc.status}; outstanding after posting "
            f"USD {outstanding.outstanding_posted}")


# ---------------------------------------------------------------------------
# 9. Order pipeline + TNA dates
# ---------------------------------------------------------------------------
MILESTONE_DATES = {
    "pi_issued_at": D["pi_issued"],
    "lc_received_at": D["sales_contract"],
    "bom_created_at": D["bom_approved"],
    "po_issued_at": D["po_issued"],
    "rm_received_at": D["grn_packing"],
    "production_started_at": D["cutting_start"],
    "shipped_at": D["ex_factory"],
    "payment_received_at": D["payment_received"],
    "completed_at": D["payment_received"],
}


async def _sync_order_pipeline(db, ctx, order: Order) -> None:
    """Recompute the pipeline with the real service, then replace 'stamped today' milestone
    times with the demo business dates (the service always stamps utcnow)."""
    stage = await auto_advance_order_pipeline(db, tenant_id=ctx.tenant_id, order_id=order.id)
    order = await db.get(Order, order.id)
    last_demo_day = max(D.values())
    for field, business_day in MILESTONE_DATES.items():
        value = getattr(order, field)
        if value is not None and value.date() > last_demo_day:
            setattr(order, field, _dt(business_day, 17))
    for action in (await db.execute(
        select(OrderFollowupAction).where(
            OrderFollowupAction.tenant_id == ctx.tenant_id,
            OrderFollowupAction.order_id == order.id,
            OrderFollowupAction.remarks.ilike(f"%Delivery challan {DELIVERY_CHALLAN_CODE} posted%"),
        )
    )).scalars():
        if action.actual_completion_date and action.actual_completion_date > last_demo_day:
            action.actual_completion_date = D["ex_factory"]
            action.completed_at = _dt(D["ex_factory"], 17)
    await db.flush()
    ctx.log(f"Order {ORDER_CODE} pipeline: {stage}; shipped_at {order.shipped_at:%Y-%m-%d}"
            + (f", payment_received_at {order.payment_received_at:%Y-%m-%d}" if order.payment_received_at
               else " (PAYMENT_RECEIVED completes once the receipt voucher is POSTED)"))


# ---------------------------------------------------------------------------
# Stage entry point
# ---------------------------------------------------------------------------
async def run(db: AsyncSession, ctx: DemoContext) -> None:
    tid = ctx.tenant_id
    user = await _admin_user(db, ctx)
    order = await require_one(db, Order, tenant_id=tid, order_code=ORDER_CODE)
    pi = await require_one(db, ProformaInvoice, tenant_id=tid, reference=PI_REFERENCE)
    mc = await require_one(db, MasterContract, tenant_id=tid, reference=SALES_CONTRACT_REF)
    fg = await require_one(db, Item, tenant_id=tid, item_code=FINISHED_GOOD_CODE)
    wh = await require_one(db, Warehouse, tenant_id=tid, name=WAREHOUSE_FG_NAME)

    # Quantity to ship = what the FG store holds (max the order qty), or the posted challan qty on re-runs.
    dc = await find_one(db, DeliveryChallan, tenant_id=tid, challan_code=DELIVERY_CHALLAN_CODE)
    dc_line = await find_one(db, DeliveryChallanItem, challan_id=dc.id) if dc else None
    if dc_line is not None:
        ship_qty = int(Decimal(str(dc_line.quantity)))
    else:
        on_hand = int(await _on_hand_qty(db, tid, fg.id, wh.id))
        if on_hand <= 0:
            raise RuntimeError(f"No {FINISHED_GOOD_CODE} stock in '{WAREHOUSE_FG_NAME}'. Run stage 4 first.")
        ship_qty = min(on_hand, ORDER_QTY)
        ctx.log(f"FG on hand {on_hand:,} pcs in '{WAREHOUSE_FG_NAME}' → shipping {ship_qty:,} pcs")
    ship_value = (Decimal(ship_qty) * UNIT_PRICE_USD).quantize(TWO)
    plan = _carton_plan(_ship_matrix(ship_qty))

    tc = await _ensure_trade_case(db, ctx, user, order, pi, mc, ship_value)
    ship = await _ensure_shipment(db, ctx, user, tc)
    dc = await _ensure_delivery_challan(db, ctx, user, order, fg, wh, ship_qty)
    await _ensure_gate_pass(db, ctx, user, dc, ship_qty)
    pl = await _ensure_packing_list(db, ctx, user, order, dc, ship, plan)
    ci = await _ensure_commercial_invoice(db, ctx, user, dc, plan, ship_qty)
    await _ensure_export_case(db, ctx, user, order, tc, ci, dc)
    await _ensure_trade_documents(db, ctx, user, tc, ship, order, _documents(ship_qty, ci, pl, plan))
    await _advance_trade_case(db, ctx, user, tc)
    async with db.begin_nested():
        await _maybe_bond_export_entries(db, ctx, tc, ship_qty)
    await _ensure_realisation(db, ctx, user, ci)
    await _sync_order_pipeline(db, ctx, order)

    total_usd = Decimal(str(ci.total_amount)).quantize(TWO)
    net_usd = total_usd - BANK_CHARGES_USD
    ctx.log(f"For stage 6: CI {COMMERCIAL_INVOICE_NO} {D['ex_factory']} USD {total_usd} "
            f"(rate {USD_TO_BDT}); realised {D['payment_received']} USD {total_usd}, bank charges "
            f"USD {BANK_CHARGES_USD}, net credit USD {net_usd}; ERQ {ERQ_RETENTION_PCT}%")
