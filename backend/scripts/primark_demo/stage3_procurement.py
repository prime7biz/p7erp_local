"""Stage 3 – Procurement & stores for Primark order PRM-ORD-001.

What this stage creates (every record has a fixed PRM-* code, so re-running never duplicates):

    1. Accounting periods Jun–Dec 2026 (only when missing) so GRN / issue journals can post.
    2. Three warehouses: raw-material store, cutting-floor store, finished-goods store.
    3. Three suppliers: fabric mill (Gazipur), trims (Dhaka), packing (Ashulia).
    4. Three purchase orders (fabric, trims, packing) linked to the order and its BOM,
       approved through the normal PO status workflow. Fabric lines get a colour × size grid.
    5. Import proforma invoice from the fabric mill + BTB LC against sales contract PRM-SC-001.
    6. Three GRNs that receive the full PO quantities into the raw-material store
       (stock movements, FIFO cost layers, batches/lots and the GRN inventory journal are
       created by the real GRN service), plus goods-receiving acknowledgements.
    7. Fabric quality inspection results (GSM, width, shade, defects) for the fabric GRN.
    8. Warehouse transfer RM store → cutting floor (fabric, rib, thread, main + care labels).
    9. Production material issue of fabric + rib to cutting for the order (needs stage 2's BOM).

Most documents are created by calling the same FastAPI handler functions the UI calls,
so stock, valuation, order pipeline and GL side effects match a real user's clicks.
"""
from __future__ import annotations

import importlib
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Iterator

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Voucher
from app.models.commercial import BtbLc, BtbMaturityTranche, MasterContract, ProformaInvoice
from app.models.costing import Item
from app.models.finance import AccountingPeriod
from app.models.inventory import (
    GoodsReceiving,
    GoodsReceivingAcknowledgement,
    GoodsReceivingItem,
    GrnQualityInspection,
    InventoryGlPosting,
    ProductionMaterialIssue,
    PurchaseOrder,
    PurchaseOrderItem,
    StockMovement,
    Vendor,
    Warehouse,
    WarehouseTransfer,
)
from app.models.merch import Bom, BomItem, Order
from app.models.po_matrix import PurchaseOrderColorSizeLine
from app.models.user import Role, User
from app.modules.commercial.schemas import BtbLcCreate, ProformaInvoiceCreate
from app.modules.inventory import po_color_size_router
from app.modules.inventory import router as inv_router

# The commercial package re-exports its APIRouter under the name `router`, so a plain
# `from app.modules.commercial import router` would give the APIRouter, not the module.
commercial_router = importlib.import_module("app.modules.commercial.router")

from primark_demo.common import (
    BTB_LC_REF,
    COLORS,
    CURRENCY,
    D,
    GRN_FABRIC_CODE,
    GRN_PACK_CODE,
    GRN_TRIM_CODE,
    MATERIAL_ISSUE_CODE,
    MATERIALS,
    ORDER_CODE,
    ORDER_QTY,
    PO_FABRIC_CODE,
    PO_PACK_CODE,
    PO_TRIM_CODE,
    SALES_CONTRACT_REF,
    SIZE_RATIO,
    STYLE_CODE,
    TRANSFER_CODE,
    USD_TO_BDT,
    VENDOR_FABRIC_CODE,
    VENDOR_PACK_CODE,
    VENDOR_TRIM_CODE,
    WAREHOUSE_CUTTING_NAME,
    WAREHOUSE_FG_NAME,
    WAREHOUSE_RM_NAME,
    DemoContext,
    MaterialSpec,
    find_one,
    require_one,
)

# ---------------------------------------------------------------------------
# Constants used only by this stage
# ---------------------------------------------------------------------------
IMPORT_PI_REF = "PRM-IPI-FAB-001"
FACTORY_ADDRESS = "Lakhsma Innerwear Limited, Plot 21-24, BSCIC Industrial Estate, Fatullah, Narayanganj-1400"

MAT: dict[str, MaterialSpec] = {m.code: m for m in MATERIALS}
FABRIC_CODES = ["PRM-FAB-SJ180", "PRM-FAB-RIB1X1"]
# Moved to the cutting floor: fabric + rib for cutting, thread + labels for the sewing lines.
TRANSFER_CODES = ["PRM-FAB-SJ180", "PRM-FAB-RIB1X1", "PRM-TRM-THREAD", "PRM-TRM-MLABEL", "PRM-TRM-CARELBL"]

WAREHOUSES = [
    # (code, name, address, is_production_floor)
    ("PRM-WH-RM", WAREHOUSE_RM_NAME,
     "Ground floor, Store Building B, " + FACTORY_ADDRESS + " – fabric racks R1–R12, trims room T1", False),
    ("PRM-WH-CUT", WAREHOUSE_CUTTING_NAME,
     "1st floor, Cutting Section (Production Building A), " + FACTORY_ADDRESS + " – fabric relaxation & lay area", True),
    ("PRM-WH-FG", WAREHOUSE_FG_NAME,
     "Ground floor, Finishing & Packing Building C, " + FACTORY_ADDRESS + " – export carton bay, loading dock 2", False),
]

VENDOR_PROFILES: dict[str, dict] = {
    VENDOR_FABRIC_CODE: dict(
        name="Sreepur Knit Dyeing & Fabrics Ltd.",
        legal_name="Sreepur Knit Dyeing & Fabrics Limited",
        trade_name="SKDF Textiles",
        contact_person="Md. Rafiqul Islam",
        designation="Senior Manager – Marketing (Knit Fabrics)",
        email="marketing@sreepurknit.com.bd",
        phone="+880-2-49271118",
        mobile="+880-1711-563204",
        website="https://www.sreepurknit.com.bd",
        address="Mulaid, Sreepur, Gazipur-1740, Bangladesh",
        address_line1="Mulaid, Sreepur",
        city="Gazipur",
        state_or_region="Dhaka Division",
        postal_code="1740",
        tax_id="TIN 419283746512",
        registration_number="BIN 000384721-0102",
        bank_name="Dutch-Bangla Bank PLC, Gazipur Chowrasta Branch",
        bank_account_title="Sreepur Knit Dyeing & Fabrics Ltd.",
        bank_account_no="1171100045821",
        swift_code="DBBLBDDH117",
        payment_terms="Local BTB L/C at 90 days sight from acceptance (USD)",
        payment_terms_days=90,
        incoterms="FCA mill gate",
        shipping_terms="Delivery by mill's covered van to buyer factory, Narayanganj",
        lead_time_notes="Knitting + dyeing 18–21 days after lab-dip approval; bulk in dye lots of ~1,300 kg.",
        compliance_status="APPROVED",
        compliance_reference_numbers="BIN 000384721-0102; TIN 419283746512; Trade licence GZP-2024-08817; "
                                     "BGMEA/BKMEA membership 4417",
        certifications_summary="GOTS 7.0 (CU 1029384), OCS, OEKO-TEX Standard 100 Class I, ZDHC MRSL L3, "
                               "Higg FEM verified 2025",
        credit_limit=Decimal("60000.00"),
        remarks="Primark-nominated organic jersey source. Test reports per dye lot (GSM, shrinkage, CF to wash).",
    ),
    VENDOR_TRIM_CODE: dict(
        name="Dhaka Label & Thread Solutions Ltd.",
        legal_name="Dhaka Label & Thread Solutions Limited",
        trade_name="DLTS",
        contact_person="Ms. Nusrat Jahan",
        designation="Key Account Manager – Primark",
        email="nusrat.jahan@dlts-bd.com",
        phone="+880-2-8870452",
        mobile="+880-1819-224071",
        website="https://www.dlts-bd.com",
        address="House 57, Road 4, Tejgaon Industrial Area, Dhaka-1208, Bangladesh",
        address_line1="House 57, Road 4, Tejgaon I/A",
        city="Dhaka",
        state_or_region="Dhaka Division",
        postal_code="1208",
        tax_id="TIN 307726154093",
        registration_number="BIN 000519364-0201",
        bank_name="BRAC Bank PLC, Tejgaon Branch",
        bank_account_title="Dhaka Label & Thread Solutions Ltd.",
        bank_account_no="1503202948576001",
        swift_code="BRAKBDDH",
        payment_terms="Local L/C at 60 days sight (USD) / TT on delivery for small lots",
        payment_terms_days=60,
        incoterms="DAP buyer factory",
        shipping_terms="Door delivery to Narayanganj, cartonised and labelled per PO",
        lead_time_notes="Woven labels 10 days, printed care labels 7 days, price tickets 7 days after Primark "
                        "barcode file release; thread ex-stock.",
        compliance_status="APPROVED",
        compliance_reference_numbers="BIN 000519364-0201; TIN 307726154093; Primark approved trim supplier "
                                     "ID PK-TRM-BD-0088",
        certifications_summary="OEKO-TEX Standard 100, FSC (price tickets), GRS (recycled polyester thread)",
        credit_limit=Decimal("15000.00"),
        remarks="Primark nominated price-ticket printer (barcode data from Primark portal).",
    ),
    VENDOR_PACK_CODE: dict(
        name="Ashulia Carton & Poly Industries Ltd.",
        legal_name="Ashulia Carton & Poly Industries Limited",
        trade_name="ACPI Packaging",
        contact_person="Mr. Shafiqul Alam",
        designation="General Manager – Sales",
        email="sales@acpi-packaging.com",
        phone="+880-2-7791563",
        mobile="+880-1713-048862",
        website="https://www.acpi-packaging.com",
        address="Zirabo, Ashulia, Savar, Dhaka-1341, Bangladesh",
        address_line1="Zirabo, Ashulia",
        city="Savar, Dhaka",
        state_or_region="Dhaka Division",
        postal_code="1341",
        tax_id="TIN 562210483377",
        registration_number="BIN 000662145-0301",
        bank_name="The City Bank PLC, Savar Branch",
        bank_account_title="Ashulia Carton & Poly Industries Ltd.",
        bank_account_no="2103776510001",
        swift_code="CIBLBDDH",
        payment_terms="Local L/C at 60 days (USD) against delivery challan + inspection",
        payment_terms_days=60,
        incoterms="DAP buyer factory",
        shipping_terms="Own truck delivery to Narayanganj; cartons on pallets, flat-packed",
        lead_time_notes="5-ply cartons 7 days after shipping-mark approval; polybags 5 days.",
        compliance_status="APPROVED",
        compliance_reference_numbers="BIN 000662145-0301; TIN 562210483377; Fire licence DHK-FS-2025-1187",
        certifications_summary="FSC Mix (cartons), GRS 4.0 (recycled LDPE polybags), ISO 9001:2015",
        credit_limit=Decimal("10000.00"),
        remarks="Carton burst strength ≥ 250 psi (5-ply), shipping marks per Primark packing manual v12.",
    ),
}

# One PO per supplier. Text shown on the PO screen / print.
PO_PLANS = [
    dict(code=PO_FABRIC_CODE, vendor=VENDOR_FABRIC_CODE, expected=D["grn_fabric"],
         notes=f"Fabric booking for Primark {ORDER_CODE} / {STYLE_CODE} (AW26). Reactive dyed Black, White, Navy "
               "to approved lab dips. 180 GSM ±5%, open width 72\" ±1\", shrinkage ≤5%. Delivery in colour-wise "
               f"dye lots with test reports. Payment by local BTB L/C {BTB_LC_REF}, 90 days."),
    dict(code=PO_TRIM_CODE, vendor=VENDOR_TRIM_CODE, expected=D["grn_trims"],
         notes=f"Trims for Primark {ORDER_CODE}: sewing thread 40/2 (shade-matched to body colours), Primark "
               "woven main label, printed care/composition label, Primark price tickets (barcode file "
               "PK-4500871236). Payment local L/C 60 days."),
    dict(code=PO_PACK_CODE, vendor=VENDOR_PACK_CODE, expected=D["grn_packing"],
         notes=f"Packing for Primark {ORDER_CODE}: recycled LDPE polybags with suffocation warning (EN/FR/DE), "
               "5-ply export cartons 60x40x30 cm, 48 pcs solid colour / assorted size per carton, shipping "
               "marks per Primark packing manual."),
]

# GRN details: (grn_code, po_code, date key, supplier challan, supplier invoice, vehicle, notes)
GRN_PLANS = [
    dict(code=GRN_FABRIC_CODE, po=PO_FABRIC_CODE, date=D["grn_fabric"],
         challan="SKDF/DC/2607/1184", invoice="SKDF/INV/26-27/0412",
         vehicle="Covered van Dhaka Metro-Ta 14-6621 (driver: Md. Jalal, 01712-904355)",
         ack_code="PRM-GRA-FAB-001",
         notes="Fabric received in 3 colour dye lots with mill test reports. 100% roll count checked; "
               "4-point inspection on 10% of rolls."),
    dict(code=GRN_TRIM_CODE, po=PO_TRIM_CODE, date=D["grn_trims"],
         challan="DLTS/DC/26/7731", invoice="DLTS/INV/26/7731",
         vehicle="Pick-up Dhaka Metro-Na 19-2207",
         ack_code="PRM-GRA-TRM-001",
         notes="Trims counted carton-wise; label artwork and price-ticket barcodes verified against Primark "
               "approved sample."),
    dict(code=GRN_PACK_CODE, po=PO_PACK_CODE, date=D["grn_packing"],
         challan="ACPI/DC/2607/0398", invoice="ACPI/INV/2607/0398",
         vehicle="Truck Dhaka Metro-Ta 11-4587 (5 t)",
         ack_code="PRM-GRA-PCK-001",
         notes="Cartons checked for burst strength and shipping marks; polybag warning text verified."),
]

# Lot / batch numbers per material (fabric + rib are received per colour dye lot).
SINGLE_LOTS = {
    "PRM-TRM-THREAD": "TH402-2607-118",
    "PRM-TRM-MLABEL": "ML-PK-2607-0457",
    "PRM-TRM-CARELBL": "CL-PK-2607-0458",
    "PRM-TRM-PRICETKT": "PT-PK-2607-0459",
    "PRM-PCK-POLYBAG": "PB-2607-033",
    "PRM-PCK-CARTON": "CTN-2607-021",
}

TWO = Decimal("0.01")


# ---------------------------------------------------------------------------
# Small helpers
# ---------------------------------------------------------------------------
def _dt(d: date, hour: int = 10) -> datetime:
    """Business date → datetime (used for created_at so screens show the real-looking date)."""
    return datetime.combine(d, time(hour, 0))


def _bdt(usd: Decimal) -> Decimal:
    """Convert a USD price into BDT (stock and GL are kept in BDT)."""
    return (usd * USD_TO_BDT).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


def _po_value_usd(codes: list[str]) -> Decimal:
    return sum((MAT[c].required_qty * MAT[c].unit_price for c in codes), Decimal("0")).quantize(TWO)


def _codes_for_vendor(vendor_code: str) -> list[str]:
    return [m.code for m in MATERIALS if m.vendor_code == vendor_code]


def _split_by_colour(total: Decimal) -> list[tuple[str, str, Decimal]]:
    """Split a fabric quantity equally over the order colours; the last colour gets the rounding remainder."""
    share = (total / len(COLORS)).quantize(TWO, rounding=ROUND_HALF_UP)
    out, used = [], Decimal("0")
    for i, (name, code) in enumerate(COLORS):
        qty = share if i < len(COLORS) - 1 else total - used
        used += qty
        out.append((name, code, qty))
    return out


@contextmanager
def _fixed_document_code(code: str) -> Iterator[None]:
    """Make the inventory router hand out `code` as the next document number.

    Some handlers (warehouse transfer, material issue, GRN acknowledgement) always auto-number
    (WT-0001, PMI-0001...). Swapping the router's code generator for one call lets the real
    handler run unchanged while the document gets our fixed PRM-* code.
    """
    original = inv_router.next_tenant_code

    async def _fixed(*_args, **_kwargs) -> str:
        return code

    inv_router.next_tenant_code = _fixed
    try:
        yield
    finally:
        inv_router.next_tenant_code = original


async def _backdate_movements(db: AsyncSession, reference_type: str, reference_id: int, when: date) -> None:
    """Stock movements are stamped 'now' by the handlers; give them the business date instead."""
    await db.execute(
        update(StockMovement)
        .where(StockMovement.reference_type == reference_type, StockMovement.reference_id == reference_id)
        .values(created_at=_dt(when), movement_date=when)
    )


async def _admin_user(db: AsyncSession, ctx: DemoContext) -> User:
    """Active admin of the tenant – the handlers need a logged-in user."""
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
        raise RuntimeError(f"No active admin user for tenant {ctx.tenant_id}")
    return user


async def _order_bom(db: AsyncSession, ctx: DemoContext, order: Order) -> Bom | None:
    """Stage 2's order BOM (newest active one), or None when stage 2 has not run yet."""
    return (
        await db.execute(
            select(Bom)
            .where(Bom.tenant_id == ctx.tenant_id, Bom.order_id == order.id, Bom.is_active.is_(True))
            .order_by(Bom.id.desc())
            .limit(1)
        )
    ).scalars().first()


async def _bom_lines_by_item(db: AsyncSession, bom: Bom | None) -> dict[int, BomItem]:
    if bom is None:
        return {}
    rows = (await db.execute(select(BomItem).where(BomItem.bom_id == bom.id).order_by(BomItem.id))).scalars().all()
    by_item: dict[int, BomItem] = {}
    for line in rows:
        if line.item_id and line.item_id not in by_item:
            by_item[line.item_id] = line
    return by_item


# ---------------------------------------------------------------------------
# 1. Accounting periods (needed for the automatic GRN / issue journals)
# ---------------------------------------------------------------------------
async def _ensure_open_periods(db: AsyncSession, ctx: DemoContext) -> None:
    """Create monthly periods Jun–Dec 2026 when no period covers that month yet."""
    created = []
    for month in range(6, 13):
        first = date(2026, month, 1)
        last = (date(2026, month + 1, 1) if month < 12 else date(2027, 1, 1)) - timedelta(days=1)
        covering = (
            await db.execute(
                select(AccountingPeriod.id).where(
                    AccountingPeriod.tenant_id == ctx.tenant_id,
                    AccountingPeriod.start_date <= first,
                    AccountingPeriod.end_date >= last,
                ).limit(1)
            )
        ).scalar_one_or_none()
        if covering is None:
            db.add(AccountingPeriod(tenant_id=ctx.tenant_id, period_name=f"FY26-M{month:02d}",
                                    start_date=first, end_date=last, is_closed=False))
            created.append(f"FY26-M{month:02d}")
    if created:
        await db.flush()
        ctx.log(f"Accounting periods opened: {', '.join(created)}")


# ---------------------------------------------------------------------------
# 2. Warehouses + 3. Vendors
# ---------------------------------------------------------------------------
async def _ensure_warehouses(db: AsyncSession, ctx: DemoContext) -> dict[str, Warehouse]:
    """Returns {"RM": ..., "CUT": ..., "FG": ...}; looked up by name (the shared contract)."""
    out: dict[str, Warehouse] = {}
    for code, name, address, is_floor in WAREHOUSES:
        wh = await find_one(db, Warehouse, tenant_id=ctx.tenant_id, name=name)
        if wh is None:
            wh = Warehouse(tenant_id=ctx.tenant_id, warehouse_code=code, name=name, address=address,
                           is_active=True, is_production_floor=is_floor, is_store=True,
                           is_rejected=False, is_quarantine=False, created_at=_dt(D["order_confirmed"]))
            db.add(wh)
            await db.flush()
            ctx.log(f"Warehouse {code} '{name}' created (id {wh.id})")
        out[code.rsplit("-", 1)[-1]] = wh
    return out


async def _ensure_vendors(db: AsyncSession, ctx: DemoContext) -> dict[str, Vendor]:
    out: dict[str, Vendor] = {}
    for code, profile in VENDOR_PROFILES.items():
        vendor = await find_one(db, Vendor, tenant_id=ctx.tenant_id, vendor_code=code)
        if vendor is None:
            vendor = Vendor(tenant_id=ctx.tenant_id, vendor_code=code, is_active=True, default_currency=CURRENCY,
                            vendor_type="local", country="Bangladesh", onboarding_status="ACTIVE",
                            internal_notes=f"Created for Primark demo order {ORDER_CODE}.",
                            created_at=_dt(D["order_confirmed"]), **profile)
            db.add(vendor)
            await db.flush()
            ctx.log(f"Vendor {code} – {vendor.name} (id {vendor.id})")
        out[code] = vendor
    return out


# ---------------------------------------------------------------------------
# 4. Purchase orders
# ---------------------------------------------------------------------------
async def _link_po_to_bom(db: AsyncSession, po: PurchaseOrder, bom: Bom | None,
                          bom_lines: dict[int, BomItem], vendor: Vendor) -> int:
    """Fill the BOM links the merch 'BOM → PO' tool would set (header + each line)."""
    if bom is None:
        return 0
    po.source_bom_id = bom.id
    linked = 0
    lines = (await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))).scalars().all()
    for line in lines:
        bl = bom_lines.get(line.item_id)
        if bl is None:
            continue
        line.source_bom_id = bom.id
        line.source_bom_line_id = bl.id
        line.source_quotation_line_id = bl.quotation_line_id
        if bl.preferred_vendor_id is None:
            bl.preferred_vendor_id = vendor.id  # merchandiser nominates the supplier on the BOM line
        linked += 1
    await db.flush()
    return linked


def _grid_body(total: Decimal) -> po_color_size_router.GridBody:
    """Colour × size breakdown of a fabric quantity (equal per colour, order size ratio per size)."""
    cells = []
    for color_name, _code, colour_qty in _split_by_colour(total):
        used = Decimal("0")
        for i, (size, pct) in enumerate(SIZE_RATIO):
            qty = (colour_qty * pct / 100).quantize(TWO, rounding=ROUND_HALF_UP)
            if i == len(SIZE_RATIO) - 1:
                qty = colour_qty - used
            used += qty
            cells.append(po_color_size_router.GridCell(color=color_name, size=size, quantity=qty))
    return po_color_size_router.GridBody(
        colors=[po_color_size_router.GridColor(name=n, code=c) for n, c in COLORS],
        sizes=[s for s, _ in SIZE_RATIO],
        cells=cells,
    )


async def _ensure_fabric_grid(db, ctx, user, po: PurchaseOrder, items: dict[str, Item]) -> None:
    """Fabric is booked by colour: save the PO colour × size grid on fabric + rib lines."""
    fabric_item_ids = {items[c].id for c in FABRIC_CODES}
    lines = (await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))).scalars().all()
    for line in lines:
        if line.item_id not in fabric_item_ids:
            continue
        if await find_one(db, PurchaseOrderColorSizeLine, po_item_id=line.id):
            continue
        await po_color_size_router.put_po_item_color_size(
            po_id=po.id, po_item_id=line.id, body=_grid_body(Decimal(line.quantity)),
            tenant=ctx.tenant, user=user, db=db,
        )
        ctx.log(f"  {po.po_code}: colour × size grid saved for item {line.item_id} ({line.quantity} kg)")


async def _ensure_purchase_order(db, ctx, user, plan: dict, order: Order, bom: Bom | None,
                                 bom_lines: dict[int, BomItem], vendors: dict[str, Vendor],
                                 rm: Warehouse, items: dict[str, Item]) -> PurchaseOrder:
    vendor = vendors[plan["vendor"]]
    codes = _codes_for_vendor(plan["vendor"])
    po = await find_one(db, PurchaseOrder, tenant_id=ctx.tenant_id, po_code=plan["code"])
    if po is None:
        body = inv_router.PurchaseOrderBody(
            po_code=plan["code"],
            vendor_id=vendor.id,
            order_date=D["po_issued"],
            expected_date=plan["expected"],
            currency=CURRENCY,
            exchange_rate_to_base=float(USD_TO_BDT),
            source_bom_id=bom.id if bom else None,
            source_order_id=order.id,
            notes=plan["notes"],
            status="DRAFT",
            items=[
                inv_router.PurchaseOrderItemBody(
                    item_id=items[c].id, warehouse_id=rm.id, quantity=str(MAT[c].required_qty),
                    unit_price=str(MAT[c].unit_price), source_order_id=order.id,
                )
                for c in codes
            ],
        )
        await inv_router.create_purchase_order(body=body, tenant=ctx.tenant, user=user, db=db)
        po = await require_one(db, PurchaseOrder, tenant_id=ctx.tenant_id, po_code=plan["code"])
        po.created_at = _dt(D["po_issued"])
        ctx.log(f"Purchase order {po.po_code} → {vendor.name}: {len(codes)} lines, "
                f"USD {_po_value_usd(codes)} (BDT {po.base_total_amount})")

    linked = await _link_po_to_bom(db, po, bom, bom_lines, vendor)
    if plan["code"] == PO_FABRIC_CODE and (po.status or "").upper() == "DRAFT":
        await _ensure_fabric_grid(db, ctx, user, po, items)

    if (po.status or "").upper() == "DRAFT":
        await inv_router.update_purchase_order_status(
            po_id=po.id, status_body={"status": "APPROVED", "reason": "Approved by merchandising manager"},
            tenant=ctx.tenant, user=user, db=db,
        )
        po = await require_one(db, PurchaseOrder, id=po.id)
        ctx.log(f"  {po.po_code} approved (BOM lines linked: {linked if bom else 'no BOM yet'})")
    return po


# ---------------------------------------------------------------------------
# 5. Import PI + BTB LC
# ---------------------------------------------------------------------------
async def _ensure_import_pi(db, ctx, user, po: PurchaseOrder, vendor: Vendor, mc: MasterContract) -> ProformaInvoice:
    pi = await find_one(db, ProformaInvoice, tenant_id=ctx.tenant_id, reference=IMPORT_PI_REF)
    if pi:
        return pi
    amount = _po_value_usd(FABRIC_CODES)
    body = ProformaInvoiceCreate(
        direction="IMPORT",
        vendor_id=vendor.id,
        master_contract_id=mc.id,
        purchase_order_id=po.id,
        reference=IMPORT_PI_REF,
        status="ISSUED",
        invoice_date=D["po_issued"] + timedelta(days=1),
        amount=float(amount),
        buyer_name=ctx.tenant.name,
        buyer_address=FACTORY_ADDRESS,
        beneficiary_name=vendor.name,
        beneficiary_address=vendor.address,
        terms_of_shipping="FCA mill gate, Sreepur, Gazipur",
        terms_of_payment="Local BTB L/C 90 days from acceptance",
        currency=CURRENCY,
        shipping_country="Bangladesh",
        destination_port_or_airport="Buyer factory, Fatullah, Narayanganj",
        shipment_port="Sreepur, Gazipur",
        documents_to_provide=["Delivery challan", "Commercial invoice", "Packing list (roll-wise)",
                              "Mill test certificate per dye lot", "GOTS transaction certificate",
                              "Beneficiary certificate"],
        terms_and_conditions=[
            f"Against our purchase order {po.po_code} for Primark order {ORDER_CODE}.",
            f"180 GSM organic cotton single jersey {MAT['PRM-FAB-SJ180'].required_qty} kg @ USD "
            f"{MAT['PRM-FAB-SJ180'].unit_price}/kg; 1x1 rib {MAT['PRM-FAB-RIB1X1'].required_qty} kg @ USD "
            f"{MAT['PRM-FAB-RIB1X1'].unit_price}/kg.",
            f"Delivery on or before {D['grn_fabric']:%d %b %Y}. Tolerance ±3% in quantity.",
            f"Back-to-back L/C to be opened under export sales contract {SALES_CONTRACT_REF}.",
        ],
        shipper_bank_name=vendor.bank_name,
        shipper_bank_account_number=vendor.bank_account_no,
        shipper_bank_account_name=vendor.bank_account_title,
        shipper_bank_swift=vendor.swift_code,
    )
    await commercial_router.create_proforma_invoice(body=body, tenant=ctx.tenant, user=user, db=db)
    pi = await require_one(db, ProformaInvoice, tenant_id=ctx.tenant_id, reference=IMPORT_PI_REF)
    pi.created_at = _dt(D["po_issued"] + timedelta(days=1))
    await db.flush()
    ctx.log(f"Import proforma invoice {IMPORT_PI_REF} from {vendor.name}: USD {amount}")
    return pi


async def _ensure_btb_lc(db, ctx, user, po: PurchaseOrder, vendor: Vendor, mc: MasterContract,
                         pi: ProformaInvoice) -> BtbLc:
    lc = await find_one(db, BtbLc, tenant_id=ctx.tenant_id, reference=BTB_LC_REF)
    amount = _po_value_usd(FABRIC_CODES)
    if lc is None:
        body = BtbLcCreate(
            reference=BTB_LC_REF,
            status="OPEN",
            lc_date=D["btb_lc_opened"],
            amount=float(amount),
            master_contract_id=mc.id,
            vendor_proforma_invoice_id=pi.id,
            purchase_order_id=po.id,
            vendor_id=vendor.id,
            currency=CURRENCY,
            exchange_rate_to_base=float(USD_TO_BDT),
            base_currency_amount=float((amount * USD_TO_BDT).quantize(TWO)),
            open_date=D["btb_lc_opened"],
            expiry_date=D["grn_fabric"] + timedelta(days=31),
            maturity_date=D["btb_maturity"],
            maturity_amount=float(amount),
        )
        await commercial_router.create_btb_lc(body=body, tenant=ctx.tenant, user=user, db=db)
        lc = await require_one(db, BtbLc, tenant_id=ctx.tenant_id, reference=BTB_LC_REF)
        lc.created_at = _dt(D["btb_lc_opened"])
        await db.flush()
        await db.refresh(mc)
        ctx.log(f"BTB LC {BTB_LC_REF} opened {D['btb_lc_opened']} for USD {amount}, maturity {D['btb_maturity']} "
                f"(sales contract {SALES_CONTRACT_REF} BTB utilised USD {mc.btb_utilized_amount})")

    if po.btb_lc_id != lc.id:
        po.btb_lc_id = lc.id
        await db.flush()
        ctx.log(f"  {po.po_code} linked to {BTB_LC_REF}")

    if await find_one(db, BtbMaturityTranche, btb_lc_id=lc.id) is None:
        async with db.begin_nested():
            db.add(BtbMaturityTranche(tenant_id=ctx.tenant_id, btb_lc_id=lc.id, tranche_no=1,
                                      maturity_date=D["btb_maturity"], amount=amount, currency=CURRENCY,
                                      status="UPCOMING", created_at=_dt(D["btb_lc_opened"])))
        ctx.log(f"  {BTB_LC_REF} maturity tranche 1: USD {amount} due {D['btb_maturity']}")
    return lc


# ---------------------------------------------------------------------------
# 6. GRNs (+ 7. fabric QC)
# ---------------------------------------------------------------------------
def _grn_lines(po_lines: list[PurchaseOrderItem], items_by_id: dict[int, Item], rm: Warehouse,
               when: date) -> list[inv_router.GoodsReceivingItemBody]:
    """One GRN line per PO line – except fabric and rib, which arrive as one dye lot per colour."""
    out = []
    for pl in po_lines:
        code = items_by_id[pl.item_id].item_code
        spec = MAT[code]
        price_bdt = str(_bdt(spec.unit_price))
        if code in FABRIC_CODES:
            prefix = "SJ" if code == "PRM-FAB-SJ180" else "RIB"
            parts = [(f"DL-{prefix}-{c_code}-{when:%y%m}-0{i}", qty)
                     for i, (_n, c_code, qty) in enumerate(_split_by_colour(spec.required_qty), start=1)]
        else:
            parts = [(SINGLE_LOTS[code], spec.required_qty)]
        for lot, qty in parts:
            out.append(inv_router.GoodsReceivingItemBody(
                item_id=pl.item_id, warehouse_id=rm.id, quantity=str(qty), lot_number=lot,
                purchase_order_line_id=pl.id, received_qty=str(qty), accepted_qty=str(qty),
                unit_price=price_bdt,
            ))
    return out


async def _ensure_grn(db, ctx, user, plan: dict, po: PurchaseOrder, rm: Warehouse,
                      items_by_id: dict[int, Item]) -> GoodsReceiving:
    grn = await find_one(db, GoodsReceiving, tenant_id=ctx.tenant_id, grn_code=plan["code"])
    if grn is None:
        po_lines = list((await db.execute(
            select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id).order_by(PurchaseOrderItem.id)
        )).scalars().all())
        body = inv_router.GoodsReceivingBody(
            grn_code=plan["code"],
            purchase_order_id=po.id,
            default_warehouse_id=rm.id,
            source_type="PO",
            supplier_delivery_challan_no=plan["challan"],
            supplier_invoice_no=plan["invoice"],
            vehicle_info=plan["vehicle"],
            received_date=plan["date"],
            notes=plan["notes"] + f" Valued in BDT at USD {USD_TO_BDT} per USD 1.",
            items=_grn_lines(po_lines, items_by_id, rm, plan["date"]),
        )
        await inv_router.create_goods_receiving(body=body, tenant=ctx.tenant, user=user, db=db)
        grn = await require_one(db, GoodsReceiving, tenant_id=ctx.tenant_id, grn_code=plan["code"])
        grn.created_at = _dt(plan["date"], 9)
        await db.flush()

    if (grn.status or "").upper() != "RECEIVED":
        await inv_router._apply_grn_receive_goods(db, ctx.tenant, user, grn.id)
        grn = await require_one(db, GoodsReceiving, id=grn.id)
        grn.approved_by_user_id = user.id
        grn.approved_at = _dt(plan["date"], 15)
        grn.signed_at = _dt(plan["date"], 15)
        await _backdate_movements(db, "GRN", grn.id, plan["date"])
        await db.flush()
        po = await require_one(db, PurchaseOrder, id=po.id)
        value = sum(float(gi.accepted_value or 0) for gi in (await db.execute(
            select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == grn.id))).scalars().all())
        ctx.log(f"GRN {grn.grn_code} received {plan['date']} into {rm.name}: BDT {value:,.2f}; "
                f"{po.po_code} is now {po.status}")

    if not grn.acknowledgement_issued:
        with _fixed_document_code(plan["ack_code"]):
            await inv_router.acknowledge_goods_receiving(grn_id=grn.id, tenant=ctx.tenant, user=user, db=db)
        grn = await require_one(db, GoodsReceiving, id=grn.id)
        grn.acknowledgement_at = _dt(plan["date"], 16)
        ack = await require_one(db, GoodsReceivingAcknowledgement, goods_receiving_id=grn.id)
        ack.created_at = _dt(plan["date"], 16)
        await db.flush()
        ctx.log(f"  Goods receiving acknowledgement {plan['ack_code']} issued to supplier")
    return grn


async def _ensure_fabric_qc(db, ctx, user, grn: GoodsReceiving, rm: Warehouse, items_by_id: dict[int, Item]) -> None:
    """Inbound fabric inspection results (one row per dye-lot GRN line), all passed."""
    lines = (await db.execute(
        select(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == grn.id).order_by(GoodsReceivingItem.id)
    )).scalars().all()
    created = 0
    async with db.begin_nested():
        for line in lines:
            if await find_one(db, GrnQualityInspection, grn_item_id=line.id):
                continue
            is_rib = items_by_id[line.item_id].item_code == "PRM-FAB-RIB1X1"
            qty = Decimal(line.received_qty or line.quantity)
            colour = next((n for n, c in COLORS if f"-{c}-" in (line.lot_number or "")), "")
            params = {
                "color": f"{colour} – matches approved lab dip (Primark ref AW26-{colour[:3].upper()})",
                "shade": "Delta E 0.6 (CMC 2:1) vs lab dip under D65 – PASS; shade band A",
                "weight": "GSM 220 spec / 223 actual" if is_rib else "GSM 180 spec / 182 actual (±5% allowed)",
                "width": "Tubular 36\" – OK" if is_rib else "Open width 72\" spec / 71.5\" cuttable – OK",
                "defects": "4-point system: 14 pts/100 yd² (limit 28) – PASS; shrinkage L -3.5% W -2.0%",
            }
            db.add(GrnQualityInspection(
                tenant_id=ctx.tenant_id, grn_id=grn.id, grn_item_id=line.id,
                inspection_date=grn.received_date, inspected_by=user.id,
                received_qty=qty, accepted_qty=qty, rejected_qty=Decimal("0"), hold_qty=Decimal("0"),
                parameters=params, result="PASS", status="COMPLETED",
                notes=f"Lot {line.lot_number}: 10% rolls inspected on 4-point table, mill test report attached.",
                target_warehouse_id=rm.id, debit_note_suggested=False,
                created_at=_dt(grn.received_date, 13), updated_at=_dt(grn.received_date, 13),
            ))
            created += 1
    if created:
        ctx.log(f"Fabric quality inspection for {grn.grn_code}: {created} dye lots PASSED (GSM/width/shade/defects)")


# ---------------------------------------------------------------------------
# 8. Transfer RM store → cutting floor
# ---------------------------------------------------------------------------
async def _ensure_transfer(db, ctx, user, rm: Warehouse, cut: Warehouse, items: dict[str, Item]) -> WarehouseTransfer:
    tr = await find_one(db, WarehouseTransfer, tenant_id=ctx.tenant_id, transfer_code=TRANSFER_CODE)
    if tr is None:
        body = inv_router.WarehouseTransferCreate(
            from_warehouse_id=rm.id,
            to_warehouse_id=cut.id,
            transfer_date=D["transfer_to_cutting"],
            notes=f"Issue to cutting floor for Primark {ORDER_CODE}: full fabric + rib (all dye lots), sewing "
                  "thread, main and care labels for the sewing lines. Price tickets and packing stay in RM store.",
            items=[inv_router.WarehouseTransferLineBody(item_id=items[c].id, quantity=str(MAT[c].required_qty))
                   for c in TRANSFER_CODES],
        )
        with _fixed_document_code(TRANSFER_CODE):
            await inv_router.create_warehouse_transfer(body=body, tenant=ctx.tenant, user=user, db=db)
        tr = await require_one(db, WarehouseTransfer, tenant_id=ctx.tenant_id, transfer_code=TRANSFER_CODE)
        tr.created_at = _dt(D["transfer_to_cutting"], 9)
        await db.flush()
    if (tr.status or "").upper() == "DRAFT":
        await inv_router.post_warehouse_transfer(transfer_id=tr.id, tenant=ctx.tenant, user=user, db=db)
        tr = await require_one(db, WarehouseTransfer, id=tr.id)
        tr.signed_at = _dt(D["transfer_to_cutting"], 11)
        await _backdate_movements(db, "WAREHOUSE_TRANSFER", tr.id, D["transfer_to_cutting"])
        await db.flush()
        ctx.log(f"Warehouse transfer {TRANSFER_CODE} posted {D['transfer_to_cutting']}: {len(TRANSFER_CODES)} items "
                f"{rm.name} → {cut.name}")
    return tr


# ---------------------------------------------------------------------------
# 9. Production material issue (fabric + rib to cutting)
# ---------------------------------------------------------------------------
async def _ensure_material_issue(db, ctx, user, order: Order, bom: Bom | None, bom_lines: dict[int, BomItem],
                                 cut: Warehouse, items: dict[str, Item]) -> ProductionMaterialIssue | None:
    pmi = await find_one(db, ProductionMaterialIssue, tenant_id=ctx.tenant_id, issue_code=MATERIAL_ISSUE_CODE)
    if pmi:
        return pmi
    if bom is None:
        ctx.log(f"SKIPPED material issue {MATERIAL_ISSUE_CODE}: order {ORDER_CODE} has no BOM yet (stage 2)")
        return None
    if (bom.status or "").upper() not in {"APPROVED", "FROZEN"}:
        ctx.log(f"SKIPPED material issue {MATERIAL_ISSUE_CODE}: BOM #{bom.id} status is {bom.status}, "
                "needs APPROVED or FROZEN")
        return None
    lines = []
    for code in FABRIC_CODES:
        bl = bom_lines.get(items[code].id)
        if bl is None:
            ctx.log(f"SKIPPED material issue {MATERIAL_ISSUE_CODE}: BOM #{bom.id} has no line for {code}")
            return None
        lines.append(inv_router.ProductionMaterialIssueLineIn(bom_line_id=bl.id,
                                                              actual_issue_qty=str(MAT[code].required_qty)))
    body = inv_router.ProductionMaterialIssueCreateBody(
        order_id=order.id,
        bom_id=bom.id,
        production_stage="CUTTING",
        covered_order_qty=ORDER_QTY,
        warehouse_id=cut.id,
        issue_date=D["material_issue"],
        notes=f"Bulk fabric + rib issued to cutting for {ORDER_CODE} (3 colours × S–XXL, {ORDER_QTY:,} pcs). "
              "Marker efficiency 84%, all dye lots shade-banded A.",
        lines=lines,
    )
    with _fixed_document_code(MATERIAL_ISSUE_CODE):
        await inv_router.create_and_post_production_material_issue(body=body, tenant=ctx.tenant, user=user, db=db)
    pmi = await require_one(db, ProductionMaterialIssue, tenant_id=ctx.tenant_id, issue_code=MATERIAL_ISSUE_CODE)
    pmi.created_at = _dt(D["material_issue"], 9)
    pmi.signed_at = _dt(D["material_issue"], 10)
    await _backdate_movements(db, "PRODUCTION_MATERIAL_ISSUE", pmi.id, D["material_issue"])
    await db.flush()
    ctx.log(f"Production material issue {MATERIAL_ISSUE_CODE} posted {D['material_issue']} from {cut.name}: "
            f"fabric {MAT['PRM-FAB-SJ180'].required_qty} kg + rib {MAT['PRM-FAB-RIB1X1'].required_qty} kg "
            f"(approval {pmi.approval_status})")
    return pmi


async def _backdate_order_milestones(db: AsyncSession, order: Order) -> None:
    """The order pipeline stamps 'PO issued' / 'RM received' with today's time; use the business dates."""
    order = await require_one(db, Order, id=order.id)
    if order.po_issued_at and order.po_issued_at.date() > D["po_issued"]:
        order.po_issued_at = _dt(D["po_issued"], 11)
    if order.rm_received_at and order.rm_received_at.date() > D["grn_fabric"]:
        order.rm_received_at = _dt(D["grn_fabric"], 15)
    await db.flush()


# ---------------------------------------------------------------------------
# Summary for downstream stages
# ---------------------------------------------------------------------------
async def _log_stock(db, ctx, warehouses: dict[str, Warehouse], items: dict[str, Item]) -> None:
    for key, wh in warehouses.items():
        parts = []
        for m in MATERIALS:
            qty = await inv_router._on_hand_qty(db, ctx.tenant_id, items[m.code].id, wh.id)
            if abs(qty) > 1e-9:
                parts.append(f"{m.code} {qty:g} {m.unit_code}")
        ctx.log(f"Stock in {wh.name} (id {wh.id}): {', '.join(parts) if parts else 'empty'}")


async def _log_gl(db, ctx, grns: list[GoodsReceiving], pmi: ProductionMaterialIssue | None) -> None:
    """Report which journals the services posted automatically (so stage 6 does not double-post)."""
    for grn in grns:
        row = (await db.execute(
            select(Voucher.voucher_number, Voucher.voucher_date, Voucher.description)
            .join(InventoryGlPosting, InventoryGlPosting.voucher_id == Voucher.id)
            .where(InventoryGlPosting.tenant_id == ctx.tenant_id, InventoryGlPosting.source_system == "GRN",
                   InventoryGlPosting.source_id == grn.id)
        )).first()
        ctx.log(f"GL for {grn.grn_code}: " + (f"journal {row[0]} on {row[1]} ('{row[2]}', Dr inventory / Cr GRNI)"
                                              if row else "no journal posted"))
    if pmi is not None:
        row = (await db.execute(
            select(Voucher.voucher_number, Voucher.voucher_date, Voucher.status)
            .where(Voucher.tenant_id == ctx.tenant_id, Voucher.source_module == "WIP_GL",
                   Voucher.source_module_ref == f"pmi_wip:{pmi.id}")
        )).first()
        ctx.log(f"GL for {pmi.issue_code}: " + (f"journal {row[0]} on {row[1]} ({row[2]}, Dr WIP / Cr inventory)"
                                                if row else "no WIP journal posted"))


# ---------------------------------------------------------------------------
# Stage entry point
# ---------------------------------------------------------------------------
async def run(db: AsyncSession, ctx: DemoContext) -> None:
    tid = ctx.tenant_id
    user = await _admin_user(db, ctx)
    order = await require_one(db, Order, tenant_id=tid, order_code=ORDER_CODE)
    mc = await require_one(db, MasterContract, tenant_id=tid, reference=SALES_CONTRACT_REF)
    items = {m.code: await require_one(db, Item, tenant_id=tid, item_code=m.code) for m in MATERIALS}
    items_by_id = {it.id: it for it in items.values()}
    bom = await _order_bom(db, ctx, order)
    bom_lines = await _bom_lines_by_item(db, bom)
    ctx.log(f"Using user {user.username or user.email} (id {user.id}); "
            + (f"order BOM #{bom.id} ({bom.status}, {len(bom_lines)} item lines)" if bom else "no order BOM yet"))

    await _ensure_open_periods(db, ctx)
    warehouses = await _ensure_warehouses(db, ctx)
    rm, cut = warehouses["RM"], warehouses["CUT"]
    vendors = await _ensure_vendors(db, ctx)

    pos = {}
    for plan in PO_PLANS:
        pos[plan["code"]] = await _ensure_purchase_order(db, ctx, user, plan, order, bom, bom_lines,
                                                         vendors, rm, items)

    fabric_vendor = vendors[VENDOR_FABRIC_CODE]
    pi = await _ensure_import_pi(db, ctx, user, pos[PO_FABRIC_CODE], fabric_vendor, mc)
    await _ensure_btb_lc(db, ctx, user, pos[PO_FABRIC_CODE], fabric_vendor, mc, pi)

    grns = []
    for plan in GRN_PLANS:
        po = await require_one(db, PurchaseOrder, id=pos[plan["po"]].id)
        grns.append(await _ensure_grn(db, ctx, user, plan, po, rm, items_by_id))
    await _ensure_fabric_qc(db, ctx, user, grns[0], rm, items_by_id)

    await _ensure_transfer(db, ctx, user, rm, cut, items)
    pmi = await _ensure_material_issue(db, ctx, user, order, bom, bom_lines, cut, items)
    await _backdate_order_milestones(db, order)

    await _log_stock(db, ctx, warehouses, items)
    await _log_gl(db, ctx, grns, pmi)
