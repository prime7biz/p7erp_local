"""Stage 4 – Production & job work for order PRM-ORD-001.

What this stage creates (all dates come from common.D so the order looks fully executed):

  1. Job-work vendor PRM-VEND-JW (screen-print subcontractor in Ashulia).
  2. Semi-finished items: cut front panel and chest-printed front panel.
  3. Operation bulletin + sewing line plan (2 lines) + factory QC defect codes.
  4. Cutting: marker, 18 lay plans, 18 cut tickets, 720 bundles (colour x size, +2% extra).
     Cut front panels go into the cutting store as stock (valued at the fabric issued in stage 3).
  5. Job work PRM-JW-001: real process-order service (create -> cost line -> issue -> receive -> approve)
     plus an outgoing gate pass for the panels sent to the printer.
  6. Trims & packing issued to production (real production-material-issue service).
  7. Hourly production (cutting / sewing / finishing) and inline + end-line QC checks.
  8. Sewing & finishing process order -> finished goods into the FG store (real service, stock IN).
  9. Manufacturing work order with operations and quality checks incl. the final AQL 2.5 inspection,
     an inventory manufacturing order with stages, and wastage records.
 10. Order pipeline auto-advance (production_started_at = cutting start date).

Quantity story (per colour, 3 colours):
  order 8,000 -> cut 8,160 (+2%) -> print reject 24 -> sewing reject 38 -> finishing reject 44 -> FG 8,054
  Total: cut 24,480, printed 24,408, sewn 24,294, finished goods 24,162 pcs.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, Role, Tenant, User
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.inventory import (
    EnhancedGatePass,
    InventoryCostLayer,
    InventoryGlPosting,
    ManufacturingOrder,
    ManufacturingStage,
    ProcessOrder,
    ProcessOrderCostLine,
    ProductionMaterialIssue,
    ProductionMaterialIssueLine,
    StockBatch,
    StockMovement,
    Vendor,
    Warehouse,
)
from app.models.manufacturing import (
    ManufacturingOperation,
    ManufacturingQualityCheck,
    ManufacturingRoutingStep,
    ManufacturingRoutingTemplate,
    ManufacturingWorkCenter,
    ManufacturingWorkOrder,
    ManufacturingWorkOrderOperation,
)
from app.models.merch import Bom, BomItem, GarmentStyle
from app.models.production import (
    CutTicket,
    CuttingBundle,
    HourlyProductionEntry,
    LayPlan,
    MarkerPlan,
    OperationBulletin,
    OperationBulletinOp,
    ProductionDefectCode,
    ProductionQcCheck,
    ProductionShift,
    SewingLine,
    SewingLineStyleConfig,
)
from app.models.traceability import CutTicketFabricLot
from app.models.wastage import WastageReason, WastageTransaction

from primark_demo.common import (
    COLORS,
    D,
    FINISHED_GOOD_CODE,
    JOBWORK_CODE,
    MATERIAL_ISSUE_CODE,
    MATERIALS,
    ORDER_CODE,
    ORDER_QTY,
    SIZE_RATIO,
    STYLE_CODE,
    USD_TO_BDT,
    VENDOR_JOBWORK_CODE,
    WAREHOUSE_CUTTING_NAME,
    WAREHOUSE_FG_NAME,
    WAREHOUSE_RM_NAME,
    DemoContext,
    color_size_matrix,
    find_one,
    require_one,
)

# ---------------------------------------------------------------------------
# Stage 4 constants (codes are fixed so the stage can be re-run safely)
# ---------------------------------------------------------------------------
SFG_CATEGORY_CODE = "SFG"
CUT_PANEL_ITEM_CODE = "PRM-SFG-CUTPNL"
PRINTED_PANEL_ITEM_CODE = "PRM-SFG-PRTPNL"
FABRIC_CODE = "PRM-FAB-SJ180"
RIB_CODE = "PRM-FAB-RIB1X1"

OB_CODE = "PRM-OB-001"
MARKER_CODE = "PRM-MKR-001"
SEWING_PROCESS_CODE = "PRM-PRO-SEW-001"
JOBWORK_GATE_PASS_CODE = "PRM-GP-JW-001"
TRIMS_ISSUE_CODES = ["PRM-MI-002", "PRM-MI-003"]
MFG_WORK_ORDER_CODE = "PRM-MWO-001"
MFG_ROUTING_CODE = "PRM-RT-MTEE01"
INV_MO_CODE = "PRM-MO-001"

CUT_EXTRA_PCT = 2              # cut 2% over order qty
PLIES_PER_LAY = 68
LAYS_PER_COLOR = 6
MARKER_RATIO = {"S": 3, "M": 6, "L": 6, "XL": 3, "XXL": 2}   # 20 garments per marker
BUNDLE_SIZE = 34
CUTTING_WASTE_PCT = Decimal("4")   # end bits / lay ends of the issued fabric

PRINT_RATE_USD = Decimal("0.12")
CM_SEWING_USD = Decimal("0.50")      # from quotation PRM-QUO-001 manufacturing lines
CM_FINISHING_USD = Decimal("0.05")
JOBWORK_TRANSPORT_BDT = Decimal("6000")
PACKING_ISSUE_DATE = date(2026, 8, 10)
OB_SMV = Decimal("6.20")

# Line allocation: which colours each sewing line sews and its working window.
LINE_PLAN = [
    # line_code, fallback name, factory unit, colours, start, end, machines, operators, helpers
    ("LKH-L01", "Lakhsma Line 01", "Unit 1 - Gazipur", ("BLK", "NVY"), D["sewing_start"], date(2026, 8, 20), 32, 30, 6),
    ("L-U2-01", "Sewing line 1 (Ashulia)", "Unit 2 - Ashulia", ("WHT",), date(2026, 8, 3), D["sewing_end"], 18, 16, 4),
]
CUTTING_DAYS = [date(2026, 7, 23), date(2026, 7, 25), date(2026, 7, 26), date(2026, 7, 27), date(2026, 7, 28)]
LAYS_PER_CUTTING_DAY = [4, 4, 4, 3, 3]
RIB_CUTTING_DAYS = [date(2026, 7, 29), D["cutting_end"]]
HOUR_WEIGHTS = [0.85, 1.05, 1.1, 1.05, 0.8, 1.05, 1.05, 1.05]   # 8 working hours, dip after lunch

DEFECT_CODES = [
    ("BRK-STITCH", "Broken / skipped stitch", "sewing", "major"),
    ("OPEN-SEAM", "Open seam / raw edge", "sewing", "major"),
    ("UNEVEN-HEM", "Uneven or twisted hem", "sewing", "minor"),
    ("NECK-PUCKER", "Neck rib puckering", "sewing", "minor"),
    ("PRINT-SMEAR", "Print smear / misregistration", "printing", "major"),
    ("OIL-SPOT", "Oil or dirt spot", "finishing", "minor"),
    ("SHADE-VAR", "Shade variation between panels", "fabric", "major"),
    ("MEASURE", "Measurement out of tolerance", "measurement", "major"),
]

TWO = Decimal("0.01")
FOUR = Decimal("0.0001")


# ---------------------------------------------------------------------------
# Quantity plan (pure Python – no database)
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class CellQty:
    """Quantities for one colour x size cell as it moves through the factory."""

    color_name: str
    color_code: str
    size: str
    order_qty: int
    cut: int
    print_reject: int
    sew_reject: int
    finish_reject: int

    @property
    def printed(self) -> int:
        return self.cut - self.print_reject

    @property
    def sewn(self) -> int:
        return self.printed - self.sew_reject

    @property
    def finished(self) -> int:
        return self.sewn - self.finish_reject


def _pct(qty: int, pct: str) -> int:
    return int((Decimal(qty) * Decimal(pct) / 100).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def quantity_plan() -> list[CellQty]:
    """Colour x size quantities: cut +2%, then small, realistic rejects at print, sewing and finishing."""
    cells = []
    for color_name, color_code, size, qty in color_size_matrix():
        cut = qty * (100 + CUT_EXTRA_PCT) // 100
        cells.append(CellQty(color_name, color_code, size, qty, cut,
                             _pct(cut, "0.3"), _pct(cut, "0.45"), _pct(cut, "0.55")))
    return cells


def _total(cells: list[CellQty], attr: str, color_codes: tuple[str, ...] | None = None) -> int:
    return sum(getattr(c, attr) for c in cells if color_codes is None or c.color_code in color_codes)


def _spread(total: int, weights: list[float]) -> list[int]:
    """Split an integer total over weights (largest-remainder rounding, sums exactly to total)."""
    s = sum(weights)
    raw = [total * w / s for w in weights]
    ints = [int(r) for r in raw]
    for i in sorted(range(len(raw)), key=lambda i: raw[i] - ints[i], reverse=True)[: total - sum(ints)]:
        ints[i] += 1
    return ints


def _working_days(start: date, end: date) -> list[date]:
    """Factory days between start and end (Friday is the weekly holiday in Bangladesh RMG)."""
    days, d = [], start
    while d <= end:
        if d.weekday() != 4:
            days.append(d)
        d += timedelta(days=1)
    return days


def _ramp(n: int) -> list[float]:
    """Learning curve for a new style: slow first days, then steady output."""
    base = [0.4, 0.65, 0.85]
    return (base + [1.0] * max(0, n - len(base)))[:n]


def _dt(d: date, hour: int = 10) -> datetime:
    return datetime.combine(d, time(hour, 0))


def _money(v: Decimal) -> Decimal:
    return v.quantize(TWO, rounding=ROUND_HALF_UP)


# ---------------------------------------------------------------------------
# Lookups
# ---------------------------------------------------------------------------
async def _admin_user(db: AsyncSession, ctx: DemoContext) -> User:
    """Active admin user of the tenant – the services need a `User` to sign / audit documents."""
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
        raise RuntimeError("Prerequisite missing: an active admin user for the tenant")
    return user


async def _warehouse(db: AsyncSession, ctx: DemoContext, name: str) -> Warehouse:
    return await require_one(db, Warehouse, tenant_id=ctx.tenant_id, name=name)


async def _item(db: AsyncSession, ctx: DemoContext, code: str) -> Item:
    return await require_one(db, Item, tenant_id=ctx.tenant_id, item_code=code)


async def _order_bom(db: AsyncSession, ctx: DemoContext, order: Order) -> Bom:
    """Approved / frozen order BOM made in stage 2 (needed by the production material issue service)."""
    bom = (
        await db.execute(
            select(Bom)
            .where(Bom.tenant_id == ctx.tenant_id, Bom.order_id == order.id, Bom.is_active.is_(True),
                   Bom.status.in_(("APPROVED", "FROZEN")))
            .order_by(Bom.id.desc())
            .limit(1)
        )
    ).scalars().first()
    if bom is None:
        raise RuntimeError(f"Prerequisite missing: approved/frozen BOM for {ORDER_CODE}. Run stage 2 first.")
    return bom


async def _value_per_usd(db: AsyncSession, ctx: DemoContext, fabric: Item) -> Decimal:
    """Stock values are kept in the currency stage 3 used for GRN costs (USD or BDT).

    Charges we add to a process order must use the same unit, so detect it from the fabric receipt cost.
    """
    mv = (
        await db.execute(
            select(StockMovement)
            .where(StockMovement.tenant_id == ctx.tenant_id, StockMovement.item_id == fabric.id,
                   StockMovement.movement_type == "IN", StockMovement.unit_cost.is_not(None))
            .order_by(StockMovement.id)
            .limit(1)
        )
    ).scalars().first()
    spec_price = next(m.unit_price for m in MATERIALS if m.code == FABRIC_CODE)
    if mv is not None and Decimal(str(mv.unit_cost)) < spec_price * 10:
        return Decimal("1")
    return USD_TO_BDT


async def _on_hand(db: AsyncSession, ctx: DemoContext, item_id: int, warehouse_id: int) -> Decimal:
    from app.modules.inventory.router import _on_hand_qty

    return Decimal(str(await _on_hand_qty(db, ctx.tenant_id, item_id, warehouse_id)))


# ---------------------------------------------------------------------------
# Masters: vendor, semi-finished items, defect codes, operation bulletin
# ---------------------------------------------------------------------------
async def _ensure_jobwork_vendor(db: AsyncSession, ctx: DemoContext) -> Vendor:
    vendor = await find_one(db, Vendor, tenant_id=ctx.tenant_id, vendor_code=VENDOR_JOBWORK_CODE)
    if vendor:
        return vendor
    vendor = Vendor(
        tenant_id=ctx.tenant_id,
        vendor_code=VENDOR_JOBWORK_CODE,
        name="Ashulia Screen Print & Embellishment Ltd.",
        legal_name="Ashulia Screen Print & Embellishment Limited",
        trade_name="ASPE Printing",
        vendor_type="local",
        contact_person="Md. Rafiqul Islam",
        designation="General Manager – Production",
        email="production@aspe-print.com.bd",
        phone="+880 2 7791 4456",
        mobile="+880 1713 045 882",
        website="https://www.aspe-print.com.bd",
        address="Plot 27, Zirabo-Bishmile Road, Ashulia, Savar, Dhaka 1341, Bangladesh",
        address_line1="Plot 27, Zirabo-Bishmile Road, Ashulia",
        city="Savar, Dhaka",
        state_or_region="Dhaka Division",
        postal_code="1341",
        country="Bangladesh",
        tax_id="BIN 004587126-0401",
        registration_number="TRAD/DNCC/045871/2019",
        default_currency="BDT",
        payment_terms_days=30,
        payment_terms="30 days after receipt of printed panels and job-work bill",
        bank_name="Dutch-Bangla Bank PLC, Ashulia Branch",
        bank_account_title="Ashulia Screen Print & Embellishment Ltd.",
        bank_account_no="1171100045879",
        swift_code="DBBLBDDH",
        credit_limit=Decimal("1500000"),
        lead_time_notes="Chest print turnaround 6–8 days for 25k pcs; collects and returns cut panels by covered van.",
        compliance_status="APPROVED",
        compliance_reference_numbers="BGMEA subcontract permission SC-2026-0412; Primark ethical audit (Amfori BSCI) grade B",
        certifications_summary="GOTS scope certificate (printing), OEKO-TEX approved water-based inks, ZDHC MRSL conformant",
        onboarding_status="ACTIVE",
        remarks="Subcontract screen printer for chest prints – Primark nominated / approved.",
        internal_notes=f"Job work for {ORDER_CODE}: 1-colour water-based chest print @ USD {PRINT_RATE_USD}/pc, billed in BDT.",
        created_at=_dt(D["cutting_start"] - timedelta(days=20)),
    )
    db.add(vendor)
    await db.flush()
    ctx.log(f"Job-work vendor {VENDOR_JOBWORK_CODE}: {vendor.name} (Ashulia, Savar)")
    return vendor


async def _ensure_sfg_items(db: AsyncSession, ctx: DemoContext) -> tuple[Item, Item]:
    """Semi-finished (WIP) items so cut and printed panels can be tracked as stock."""
    tid = ctx.tenant_id
    cat = await find_one(db, ItemCategory, tenant_id=tid, category_code=SFG_CATEGORY_CODE)
    if cat is None:
        cat = ItemCategory(tenant_id=tid, category_code=SFG_CATEGORY_CODE, name="Semi-finished goods (WIP)",
                           description="Cut / printed / embellished panels moving between departments")
        db.add(cat)
        await db.flush()
    unit = await require_one(db, ItemUnit, tenant_id=tid, unit_code="Pcs")
    out = []
    for code, name in [
        (CUT_PANEL_ITEM_CODE, f"Cut front body panel – {STYLE_CODE} (ready for chest print)"),
        (PRINTED_PANEL_ITEM_CODE, f"Chest-printed front body panel – {STYLE_CODE}"),
    ]:
        item = await find_one(db, Item, tenant_id=tid, item_code=code)
        if item is None:
            item = Item(tenant_id=tid, item_code=code, name=name, category_id=cat.id, unit_id=unit.id,
                        base_unit="Pcs", description=f"Primark {STYLE_CODE} semi-finished panel (order {ORDER_CODE})",
                        default_cost=Decimal("0"), standard_price=Decimal("0"))
            db.add(item)
            await db.flush()
            ctx.log(f"Semi-finished item {code} created")
        out.append(item)
    return out[0], out[1]


async def _ensure_defect_codes(db: AsyncSession, ctx: DemoContext) -> None:
    created = 0
    for code, name, category, severity in DEFECT_CODES:
        if await find_one(db, ProductionDefectCode, tenant_id=ctx.tenant_id, code=code) is None:
            db.add(ProductionDefectCode(tenant_id=ctx.tenant_id, code=code, name=name, category=category,
                                        severity=severity))
            created += 1
    await db.flush()
    if created:
        ctx.log(f"QC defect codes: {created} created")


async def _ensure_operation_bulletin(db, ctx, order: Order, style: GarmentStyle, user: User) -> OperationBulletin:
    ob = await find_one(db, OperationBulletin, tenant_id=ctx.tenant_id, ob_code=OB_CODE)
    if ob:
        return ob
    ops = [
        ("Shoulder join with tape", "0.42", "4T overlock", False),
        ("Neck rib tack & join", "0.55", "4T overlock", True),
        ("Neck top-stitch & back-neck tape", "0.60", "Flatlock", True),
        ("Main label & care label attach", "0.35", "SNLS", False),
        ("Sleeve join", "0.80", "4T overlock", False),
        ("Side seam close", "0.95", "4T overlock", True),
        ("Sleeve hem", "0.70", "Flatlock", False),
        ("Bottom hem", "0.55", "Flatlock", False),
        ("Sleeve tack", "0.30", "SNLS", False),
        ("Thread trimming", "0.48", "Manual", False),
        ("In-line quality check", "0.50", "Manual", False),
    ]
    ob = OperationBulletin(
        tenant_id=ctx.tenant_id, order_id=order.id, style_id=style.id, ob_code=OB_CODE, version_no=1,
        total_smv=OB_SMV, status="approved", approved_by_user_id=user.id,
        approved_at=_dt(D["pp_sample_approved"]),
        notes="IE bulletin from PP sample. SMV 6.20 min/pc (sewing 5.70 + in-line QC 0.50).",
        created_at=_dt(D["pp_sample_approved"]),
    )
    db.add(ob)
    await db.flush()
    for seq, (name, smv, machine, critical) in enumerate(ops, start=1):
        db.add(OperationBulletinOp(tenant_id=ctx.tenant_id, ob_id=ob.id, sequence_no=seq, operation_name=name,
                                   smv=Decimal(smv), machine_type=machine, is_critical=critical))
    await db.flush()
    ctx.log(f"Operation bulletin {OB_CODE}: {len(ops)} operations, SMV {OB_SMV}")
    return ob


# ---------------------------------------------------------------------------
# Sewing line plan
# ---------------------------------------------------------------------------
async def _ensure_line(db, ctx, code: str, name: str, unit: str, machines: int, operators: int) -> SewingLine:
    line = await find_one(db, SewingLine, tenant_id=ctx.tenant_id, line_code=code)
    if line is None:
        line = SewingLine(tenant_id=ctx.tenant_id, line_code=code, name=name, factory_unit=unit,
                          default_machine_count=machines + 4, running_machine_count=machines,
                          default_operator_count=operators, default_helper_count=6)
        db.add(line)
        await db.flush()
        ctx.log(f"Sewing line {code} created")
    return line


async def _ensure_shift(db: AsyncSession, ctx: DemoContext) -> ProductionShift:
    shift = (
        await db.execute(
            select(ProductionShift)
            .where(ProductionShift.tenant_id == ctx.tenant_id, ProductionShift.is_active.is_(True))
            .order_by(ProductionShift.id)
            .limit(1)
        )
    ).scalars().first()
    if shift is None:
        shift = ProductionShift(tenant_id=ctx.tenant_id, shift_code="PRM-S1", name="Day shift",
                                start_time=time(8, 0), end_time=time(17, 0), break_minutes=60)
        db.add(shift)
        await db.flush()
    return shift


async def _ensure_line_plan(db, ctx, order: Order, style: GarmentStyle, ob: OperationBulletin,
                            shift: ProductionShift, cells: list[CellQty], user: User) -> list[tuple]:
    """One line reservation per sewing line. Re-uses the DRAFT booking the app may have auto-proposed."""
    from app.modules.production.line_reservation_service import confirm_reservation_firm, confirm_reservation_soft

    plans = []
    for sort, (code, name, unit, colors, start, end, machines, operators, helpers) in enumerate(LINE_PLAN):
        line = await _ensure_line(db, ctx, code, name, unit, machines, operators)
        planned = _total(cells, "printed", colors)
        cfg = (
            await db.execute(
                select(SewingLineStyleConfig).where(
                    SewingLineStyleConfig.tenant_id == ctx.tenant_id,
                    SewingLineStyleConfig.order_id == order.id,
                    SewingLineStyleConfig.line_id == line.id,
                ).limit(1)
            )
        ).scalars().first()
        if cfg is None and sort == 0:
            cfg = (
                await db.execute(
                    select(SewingLineStyleConfig).where(
                        SewingLineStyleConfig.tenant_id == ctx.tenant_id,
                        SewingLineStyleConfig.order_id == order.id,
                        SewingLineStyleConfig.reservation_status == "DRAFT",
                    ).limit(1)
                )
            ).scalars().first()
        is_new = cfg is None or cfg.reservation_status in ("DRAFT", "CANCELLED")
        if cfg is None:
            cfg = SewingLineStyleConfig(tenant_id=ctx.tenant_id, order_id=order.id, reservation_status="DRAFT")
            db.add(cfg)
        if is_new:
            cfg.line_id = line.id
            cfg.style_id = style.id
            cfg.ob_id = ob.id
            cfg.machine_count = machines
            cfg.operator_count = operators
            cfg.helper_count = helpers
            cfg.target_efficiency_pct = Decimal("60")
            cfg.shift_id = shift.id
            cfg.start_date = start
            cfg.planned_end_date = end
            cfg.status = "planned"
            cfg.reservation_status = "DRAFT"
            cfg.smv_per_piece = OB_SMV
            cfg.total_smv_minutes = _money(OB_SMV * planned)
            cfg.planned_qty = Decimal(planned)
            cfg.completed_qty = Decimal("0")
            cfg.sort_order = sort
            cfg.created_at = _dt(D["pp_sample_approved"] + timedelta(days=3))
            await db.flush()
            await confirm_reservation_soft(db, tenant_id=ctx.tenant_id, config_id=cfg.id, user_id=user.id)
            try:
                await confirm_reservation_firm(db, tenant_id=ctx.tenant_id, config_id=cfg.id, user_id=user.id)
            except Exception as exc:  # readiness gate (HTTP 409) – book firm the way a planner would override
                ctx.log(f"  firm booking gate for {code}: {getattr(exc, 'detail', exc)} – set FIRM_BOOKED directly")
                cfg.reservation_status = "FIRM_BOOKED"
            cfg.soft_booked_at = _dt(D["pp_sample_approved"] + timedelta(days=3))
            cfg.firm_booked_at = _dt(D["grn_trims"])
            await db.flush()
            ctx.log(f"Line plan {code}: {'/'.join(colors)} {planned:,} pcs, {start:%d %b}–{end:%d %b}, FIRM_BOOKED")
        plans.append((line, cfg, colors, start, end))
    return plans


# ---------------------------------------------------------------------------
# Cutting: marker, lays, cut tickets, bundles, fabric lot links, cut-panel stock
# ---------------------------------------------------------------------------
async def _fabric_issue_facts(db: AsyncSession, ctx: DemoContext, fabric: Item, rib: Item) -> tuple[Decimal, Decimal]:
    """(fabric kg issued, fabric+rib value) from the stage-3 production material issue PRM-MI-001."""
    pmi = await require_one(db, ProductionMaterialIssue, tenant_id=ctx.tenant_id, issue_code=MATERIAL_ISSUE_CODE)
    mvs = (
        await db.execute(
            select(StockMovement).where(StockMovement.production_material_issue_id == pmi.id,
                                        StockMovement.movement_type == "OUT")
        )
    ).scalars().all()
    fabric_kg = sum((Decimal(str(m.quantity)) for m in mvs if m.item_id == fabric.id), Decimal("0"))
    value = Decimal("0")
    for m in mvs:
        if m.item_id not in (fabric.id, rib.id):
            continue
        if m.movement_value:
            value += Decimal(str(m.movement_value))
        else:
            item = fabric if m.item_id == fabric.id else rib
            value += Decimal(str(m.quantity)) * Decimal(str(item.avg_cost or item.default_cost or 0))
    if fabric_kg <= 0:
        raise RuntimeError(f"{MATERIAL_ISSUE_CODE} has no fabric ({FABRIC_CODE}) line – check stage 3")
    return fabric_kg, value


async def _ensure_cutting(db, ctx, order: Order, style: GarmentStyle, fabric: Item, fabric_kg: Decimal,
                          plans: list[tuple], user: User) -> list[CutTicket]:
    tid = ctx.tenant_id
    cut_total = ORDER_QTY * (100 + CUT_EXTRA_PCT) // 100
    kg_per_pc = (fabric_kg * (100 - CUTTING_WASTE_PCT) / 100 / cut_total).quantize(Decimal("0.000001"))

    marker = await find_one(db, MarkerPlan, tenant_id=tid, marker_code=MARKER_CODE)
    if marker is None:
        marker = MarkerPlan(
            tenant_id=tid, order_id=order.id, style_id=style.id, marker_code=MARKER_CODE,
            cad_reference="Gerber AccuMark PRM-MTEE01-AW26-R2",
            marker_length=Decimal("9.1500"), marker_width=Decimal("1.8300"),
            marker_efficiency_pct=Decimal("84.50"), fabric_consumption_per_pcs=kg_per_pc,
            sizes_included=[s for s, _ in SIZE_RATIO], size_ratio=MARKER_RATIO,
            pcs_per_marker=sum(MARKER_RATIO.values()), status="approved",
            notes="Open-width 72\" single jersey, 1 marker for all colours (S3 M6 L6 XL3 XXL2). "
                  "Front, back and sleeves in one marker; rib cut separately.",
            created_at=_dt(D["material_issue"]),
        )
        db.add(marker)
        await db.flush()
        ctx.log(f"Marker {MARKER_CODE}: 20 pcs/marker, {kg_per_pc} kg/pc, efficiency 84.5%")

    color_line = {}
    for line, _cfg, colors, _s, _e in plans:
        for c in colors:
            color_line[c] = line
    lay_dates = [d for d, n in zip(CUTTING_DAYS, LAYS_PER_CUTTING_DAY) for _ in range(n)]
    batches = list(
        (
            await db.execute(
                select(StockBatch).where(StockBatch.tenant_id == tid, StockBatch.stock_item_id == fabric.id)
                .order_by(StockBatch.id)
            )
        ).scalars().all()
    )

    tickets: list[CutTicket] = []
    new_tickets = 0
    lay_no = 0
    for color_name, color_code in COLORS:
        for n in range(1, LAYS_PER_COLOR + 1):
            cut_date = lay_dates[lay_no]
            lay_no += 1
            ticket_code = f"PRM-CT-{color_code}-{n:02d}"
            ticket = await find_one(db, CutTicket, tenant_id=tid, ticket_code=ticket_code)
            if ticket:
                tickets.append(ticket)
                continue
            pcs = PLIES_PER_LAY * sum(MARKER_RATIO.values())
            lay = LayPlan(
                tenant_id=tid, order_id=order.id, marker_plan_id=marker.id,
                lay_code=f"PRM-LAY-{color_code}-{n:02d}", fabric_item_id=fabric.id,
                fabric_lot_no=f"DL-{color_code}-2607-{n:02d}", num_plies=PLIES_PER_LAY,
                lay_length=Decimal("9.1500"), total_fabric_used=(kg_per_pc * pcs).quantize(FOUR),
                planned_pcs=pcs, status="completed", created_at=_dt(cut_date, 8),
            )
            db.add(lay)
            await db.flush()
            ticket = CutTicket(
                tenant_id=tid, order_id=order.id, lay_plan_id=lay.id, ticket_code=ticket_code,
                cut_date=cut_date, cutter_user_id=user.id, total_pcs_cut=pcs, status="completed",
                created_at=_dt(cut_date, 9),
            )
            db.add(ticket)
            await db.flush()
            await _add_bundles(db, ctx, order, style, ticket, color_name, color_line[color_code], cut_date)
            if batches:
                batch = batches[(lay_no - 1) % len(batches)]
                try:
                    async with db.begin_nested():
                        db.add(CutTicketFabricLot(
                            tenant_id=tid, cut_ticket_id=ticket.id, stock_batch_id=batch.id,
                            qty_used=lay.total_fabric_used,
                            roll_numbers=", ".join(f"R{color_code}{lay_no:02d}-{r:02d}" for r in range(1, 9)),
                            created_by=user.id, created_at=_dt(cut_date, 9),
                        ))
                        await db.flush()
                except Exception as exc:
                    ctx.log(f"  fabric lot link for {ticket_code} skipped: {exc}")
            tickets.append(ticket)
            new_tickets += 1
    if new_tickets:
        ctx.log(f"Cutting: {new_tickets} lay plans + cut tickets (PRM-CT-BLK-01 … PRM-CT-NVY-06), "
                f"{new_tickets * PLIES_PER_LAY * 20:,} pcs cut, {new_tickets * 40} bundles"
                + (" , fabric lots linked" if batches else " (no fabric batches to link)"))
    return tickets


async def _add_bundles(db, ctx, order, style, ticket: CutTicket, color_name: str, line: SewingLine,
                       cut_date: date) -> None:
    """Bundles of 34 pcs per size; each bundle went to the colour's sewing line and was completed."""
    n = 0
    for size, ratio in MARKER_RATIO.items():
        size_qty = ratio * PLIES_PER_LAY
        for _ in range(size_qty // BUNDLE_SIZE):
            n += 1
            db.add(CuttingBundle(
                tenant_id=ctx.tenant_id, cut_ticket_id=ticket.id, order_id=order.id, style_id=style.id,
                bundle_no=f"B-{n:03d}", barcode=f"{ticket.ticket_code}-{n:03d}", size=size, color=color_name,
                qty_in_bundle=BUNDLE_SIZE, status="completed", issued_to_line_id=line.id,
                issued_at=_dt(max(cut_date, D["sewing_start"]) + timedelta(days=1), 8),
                completed_at=_dt(D["sewing_end"], 17), created_at=_dt(cut_date, 15),
            ))
    await db.flush()


async def _ensure_cut_panel_stock(db, ctx, order: Order, bom: Bom, tickets: list[CutTicket], cut_item: Item,
                                  cutting_wh: Warehouse, fabric_value: Decimal, user: User) -> None:
    """Cut front panels enter the cutting store as stock, valued at the fabric + rib issued to the order.

    No inventory service turns cut tickets into stock, so we add the IN movements ourselves and run
    the real FIFO costing helper. A balancing WIP -> inventory journal is posted via the inventory GL helper.
    """
    from app.modules.inventory.stock_valuation_service import refresh_item_stock_caches
    from app.services.fifo_inventory import finalize_movement_fifo

    existing = (
        await db.execute(
            select(StockMovement.id).where(StockMovement.tenant_id == ctx.tenant_id,
                                           StockMovement.item_id == cut_item.id,
                                           StockMovement.reference_type == "CUT_TICKET").limit(1)
        )
    ).first()
    if existing:
        return
    cut_total = sum(t.total_pcs_cut or 0 for t in tickets)
    unit_cost = (fabric_value / cut_total).quantize(Decimal("0.000001")) if cut_total else Decimal("0")
    for t in tickets:
        mv = StockMovement(
            tenant_id=ctx.tenant_id, item_id=cut_item.id, warehouse_id=cutting_wh.id, movement_type="IN",
            quantity=Decimal(t.total_pcs_cut), reference_type="CUT_TICKET", reference_id=t.id,
            movement_date=t.cut_date, notes=f"Cut front panels from {t.ticket_code} ({ORDER_CODE})",
            movement_kind="CUTTING_OUTPUT", order_id=order.id, bom_id=bom.id,
            created_by_user_id=user.id, created_at=_dt(t.cut_date, 17),
        )
        db.add(mv)
        await db.flush()
        await finalize_movement_fifo(db, ctx.tenant_id, mv, in_unit_cost=float(unit_cost))
    await refresh_item_stock_caches(db, ctx.tenant_id, cut_item.id)
    await db.flush()
    ctx.log(f"Cut-panel stock: {cut_total:,} pcs into '{cutting_wh.name}' @ {unit_cost} "
            f"(fabric + rib value {_money(fabric_value)})")

    try:
        async with db.begin_nested():
            from app.services.inventory_account_resolver import resolve_inventory_accounts
            from app.services.inventory_gl_service import _post_balanced_voucher

            acc = await resolve_inventory_accounts(db, ctx.tenant_id, cut_item.id)
            if acc.get("inventory") and acc.get("wip") and acc["inventory"] != acc["wip"]:
                amount = float(_money(fabric_value))
                note = f"{ORDER_CODE}: cut panels to cutting store"
                await _post_balanced_voucher(
                    db, ctx.tenant_id, user.id, max(t.cut_date for t in tickets), f"Cutting output {ORDER_CODE}",
                    f"CUT-{ORDER_CODE}", [(acc["inventory"], "DEBIT", amount, note), (acc["wip"], "CREDIT", amount, note)],
                    source_system="CUTTING", source_id=order.id, action="RECEIVE",
                )
                await db.flush()
    except Exception as exc:
        ctx.log(f"  cutting WIP journal skipped: {exc}")


# ---------------------------------------------------------------------------
# Back-dating helpers (services stamp "today"; the demo order happened in Jul–Sep 2026)
# ---------------------------------------------------------------------------
async def _backdate_movements(db: AsyncSession, movements: list[StockMovement], on: date, hour: int = 11) -> None:
    ids = [m.id for m in movements]
    for m in movements:
        m.movement_date = on
        m.created_at = _dt(on, hour)
    if ids:
        await db.execute(update(InventoryCostLayer).where(InventoryCostLayer.source_movement_id.in_(ids))
                         .values(layer_date=on))
    await db.flush()


async def _backdate_gl(db: AsyncSession, ctx: DemoContext, system: str, source_id: int, action: str, on: date) -> None:
    from app.models import Voucher

    posting = (
        await db.execute(
            select(InventoryGlPosting).where(InventoryGlPosting.tenant_id == ctx.tenant_id,
                                             InventoryGlPosting.source_system == system,
                                             InventoryGlPosting.source_id == source_id,
                                             InventoryGlPosting.action == action)
        )
    ).scalars().first()
    if posting and posting.voucher_id:
        v = await db.get(Voucher, posting.voucher_id)
        if v is not None:
            v.voucher_date = on
            await db.flush()


async def _process_order_movements(db, po: ProcessOrder, movement_type: str) -> list[StockMovement]:
    return list(
        (
            await db.execute(
                select(StockMovement).where(StockMovement.process_order_id == po.id,
                                            StockMovement.movement_type == movement_type)
            )
        ).scalars().all()
    )


async def _run_process_order(db, ctx, user: User, *, body_kwargs: dict, cost_lines: list[dict],
                             processing_charges: Decimal, actual_output: int,
                             created_on: date, issued_on: date, received_on: date, approved_on: date) -> ProcessOrder:
    """Create -> add cost lines -> issue -> receive -> approve, exactly like the Process Orders screen."""
    from app.modules.inventory.router import (
        ProcessOrderBody,
        ProcessOrderCostLineBody,
        ProcessReceiveBody,
        add_process_order_cost_line,
        approve_process_order,
        create_process_order,
        issue_process_order,
        receive_process_order,
    )

    tenant: Tenant = ctx.tenant
    po = await create_process_order(body=ProcessOrderBody(**body_kwargs), tenant=tenant, user=user, db=db)
    for cl in cost_lines:
        await add_process_order_cost_line(process_order_id=po.id, body=ProcessOrderCostLineBody(**cl),
                                          tenant=tenant, user=user, db=db)
    po = await issue_process_order(process_order_id=po.id, tenant=tenant, user=user, db=db)
    await _backdate_movements(db, await _process_order_movements(db, po, "OUT"), issued_on)
    await _backdate_gl(db, ctx, "PROCESS_ORDER", po.id, "ISSUE", issued_on)
    po = await receive_process_order(
        process_order_id=po.id,
        body=ProcessReceiveBody(actual_output_qty=str(actual_output), processing_charges=str(processing_charges)),
        tenant=tenant, user=user, db=db,
    )
    await _backdate_movements(db, await _process_order_movements(db, po, "IN"), received_on, 16)
    await _backdate_gl(db, ctx, "PROCESS_ORDER", po.id, "RECEIVE", received_on)
    po = await approve_process_order(process_order_id=po.id, tenant=tenant, user=user, db=db)
    po.created_at = _dt(created_on, 9)
    po.signed_at = _dt(approved_on, 17)
    po.updated_at = _dt(approved_on, 17)
    await db.flush()
    return po


# ---------------------------------------------------------------------------
# Job work: print subcontract (process order + gate pass)
# ---------------------------------------------------------------------------
async def _ensure_jobwork(db, ctx, user, order: Order, bom: Bom, vendor: Vendor, cut_item: Item,
                          printed_item: Item, cutting_wh: Warehouse, cells: list[CellQty],
                          rate: Decimal) -> ProcessOrder:
    po = await find_one(db, ProcessOrder, tenant_id=ctx.tenant_id, process_number=JOBWORK_CODE)
    cut = _total(cells, "cut")
    printed = _total(cells, "printed")
    bill_usd = _money(PRINT_RATE_USD * printed)
    bill_bdt = _money(bill_usd * USD_TO_BDT)
    if po is None:
        await _ensure_jobwork_gate_pass(db, ctx, user, vendor, cut)
        po = await _run_process_order(
            db, ctx, user,
            body_kwargs=dict(
                process_number=JOBWORK_CODE, process_type="PRINTING", process_method="subcontract",
                linked_order_id=order.id, source_order_id=order.id, source_bom_id=bom.id,
                master_contract_id=order.master_contract_id, customer_id=ctx.customer.id,
                warehouse_id=cutting_wh.id, output_warehouse_id=cutting_wh.id,
                input_item_id=cut_item.id, output_item_id=printed_item.id,
                input_quantity=str(cut), expected_output_qty=str(cut), vendor_id=vendor.id,
                process_stage="Chest screen print (subcontract)", planned_loss_pct="0.50",
                output_same_as_input=False, output_grade="A", output_lot_number="PRM-PRT-LOT-0805",
                remarks=(f"Job work for {ORDER_CODE}: 1-colour water-based chest print 22 x 8 cm on cut front panels. "
                         f"Rate USD {PRINT_RATE_USD}/pc x {printed:,} good pcs = USD {bill_usd} "
                         f"(BDT {bill_bdt:,} @ {USD_TO_BDT}). Sent {D['jobwork_sent']:%d %b} with gate pass "
                         f"{JOBWORK_GATE_PASS_CODE}; first lot (Black) back 30 Jul, balance received "
                         f"{D['jobwork_received']:%d %b}. Print rejects {cut - printed} pcs (smear / misregistration)."),
            ),
            cost_lines=[dict(
                cost_type="ADD_ON", amount=str(_money(JOBWORK_TRANSPORT_BDT * rate / USD_TO_BDT)),
                description="Covered van Gazipur ⇄ Ashulia (panels out + printed panels back, 4 trips)",
                currency="BDT" if rate == USD_TO_BDT else "USD",
                remarks=f"BDT {JOBWORK_TRANSPORT_BDT:,.0f} paid to Sundarban Transport (cash)",
            )],
            processing_charges=_money(bill_usd * rate),
            actual_output=printed,
            created_on=D["jobwork_sent"] - timedelta(days=1), issued_on=D["jobwork_sent"],
            received_on=D["jobwork_received"], approved_on=D["jobwork_received"],
        )
        ctx.log(f"Job work {JOBWORK_CODE} (PRINTING, subcontract): {cut:,} panels sent {D['jobwork_sent']:%d %b}, "
                f"{printed:,} received {D['jobwork_received']:%d %b} ({cut - printed} rejects), "
                f"bill USD {bill_usd} = BDT {bill_bdt:,} – {po.status}")
    return po


async def _ensure_jobwork_gate_pass(db, ctx, user, vendor: Vendor, qty: int) -> None:
    from app.modules.inventory.router import GatePassBody, create_enhanced_gate_pass, update_enhanced_gate_pass_status

    if await find_one(db, EnhancedGatePass, tenant_id=ctx.tenant_id, gate_pass_code=JOBWORK_GATE_PASS_CODE):
        return
    gp = await create_enhanced_gate_pass(
        body=GatePassBody(
            gate_pass_code=JOBWORK_GATE_PASS_CODE,
            purpose=f"Job work – cut front panels to print subcontractor ({JOBWORK_CODE})",
            destination=f"{vendor.name}, {vendor.address}",
            vehicle_no="Dhaka Metro-Ta 11-4587 (covered van)",
            notes=f"{qty:,} cut front panels in 360 bundles (Black / White / Navy) for {ORDER_CODE}. "
                  f"Returnable after chest print. Driver: Abdul Karim, 01711-562341.",
        ),
        tenant=ctx.tenant, user=user, db=db,
    )
    for status in ("APPROVED", "RELEASED"):
        gp = await update_enhanced_gate_pass_status(gate_pass_id=gp.id, body={"status": status}, tenant=ctx.tenant,
                                                    user=user, db=db)
    gp = await update_enhanced_gate_pass_status(gate_pass_id=gp.id, body={"guard_acknowledged": True},
                                                tenant=ctx.tenant, user=user, db=db)
    gp.created_at = _dt(D["jobwork_sent"], 9)
    gp.signed_at = _dt(D["jobwork_sent"], 10)
    gp.updated_at = _dt(D["jobwork_sent"], 10)
    await db.flush()
    ctx.log(f"Gate pass {JOBWORK_GATE_PASS_CODE}: {qty:,} cut panels out to {VENDOR_JOBWORK_CODE} – RELEASED")


# ---------------------------------------------------------------------------
# Trims & packing issue (production material issue service)
# ---------------------------------------------------------------------------
async def _ensure_trims_issue(db, ctx, user, order: Order, bom: Bom, cutting_wh: Warehouse,
                              rm_wh: Warehouse) -> Decimal:
    """Issue thread, labels, price tickets, polybags and cartons; returns their total stock value."""
    from app.modules.inventory.document_qr_service import sign_production_material_issue
    from app.modules.inventory.router import (
        ProductionMaterialIssueCreateBody,
        ProductionMaterialIssueLineIn,
        create_and_post_production_material_issue,
    )

    existing = (
        await db.execute(
            select(ProductionMaterialIssue).where(ProductionMaterialIssue.tenant_id == ctx.tenant_id,
                                                  ProductionMaterialIssue.issue_code.in_(TRIMS_ISSUE_CODES))
        )
    ).scalars().all()
    if not existing:
        groups: dict[int, list[ProductionMaterialIssueLineIn]] = {cutting_wh.id: [], rm_wh.id: []}
        for spec in [m for m in MATERIALS if m.category_code in ("TRIM", "PACK")]:
            item = await _item(db, ctx, spec.code)
            bl = (
                await db.execute(
                    select(BomItem).where(BomItem.bom_id == bom.id, BomItem.item_id == item.id).limit(1)
                )
            ).scalars().first()
            if bl is None:
                ctx.log(f"  {spec.code} not in order BOM – not issued")
                continue
            need = (Decimal(str(bl.required_gross_qty or 0)) or spec.required_qty).quantize(Decimal("1"))
            stock = {w: await _on_hand(db, ctx, item.id, w) for w in (cutting_wh.id, rm_wh.id)}
            # Prefer the cutting store (sewing trims are moved there); otherwise the store with most stock.
            wh_id = next((w for w in stock if stock[w] >= need), max(stock, key=lambda w: stock[w]))
            need = min(need, stock[wh_id].quantize(Decimal("1"), rounding=ROUND_DOWN))
            if need <= 0:
                ctx.log(f"  {spec.code}: no stock in cutting / RM store – not issued")
                continue
            groups[wh_id].append(ProductionMaterialIssueLineIn(bom_line_id=bl.id, actual_issue_qty=str(need)))

        codes = iter(TRIMS_ISSUE_CODES)
        for wh, stage, on in [(cutting_wh, "SEWING", D["sewing_start"]), (rm_wh, "FINISHING_PACKING", PACKING_ISSUE_DATE)]:
            lines = groups[wh.id]
            if not lines:
                continue
            code = next(codes)
            pmi = await create_and_post_production_material_issue(
                body=ProductionMaterialIssueCreateBody(
                    order_id=order.id, bom_id=bom.id, production_stage=stage, covered_order_qty=ORDER_QTY,
                    warehouse_id=wh.id, issue_date=on, lines=lines,
                    notes=f"{code}: {stage.replace('_', ' & ').lower()} materials for {ORDER_CODE} "
                          f"({len(lines)} items from {wh.name})",
                ),
                tenant=ctx.tenant, user=user, db=db,
            )
            old_code = pmi.issue_code
            pmi.issue_code = code
            pmi.created_at = _dt(on, 9)
            pmi_lines = list((await db.execute(select(ProductionMaterialIssueLine)
                                                .where(ProductionMaterialIssueLine.issue_id == pmi.id))).scalars().all())
            sign_production_material_issue(pmi, pmi_lines)
            pmi.signed_at = _dt(on, 10)
            pmi.updated_at = _dt(on, 10)
            mvs = list((await db.execute(select(StockMovement).where(
                StockMovement.production_material_issue_id == pmi.id))).scalars().all())
            for m in mvs:
                m.notes = (m.notes or "").replace(old_code, code)
            await _backdate_movements(db, mvs, on)
            await db.flush()
            ctx.log(f"Material issue {code} ({stage}): {len(lines)} trims/packing items from '{wh.name}'")
        existing = (
            await db.execute(
                select(ProductionMaterialIssue).where(ProductionMaterialIssue.tenant_id == ctx.tenant_id,
                                                      ProductionMaterialIssue.issue_code.in_(TRIMS_ISSUE_CODES))
            )
        ).scalars().all()
    value = Decimal("0")
    for pmi in existing:
        for m in (await db.execute(select(StockMovement).where(
                StockMovement.production_material_issue_id == pmi.id))).scalars().all():
            value += Decimal(str(m.movement_value or 0))
    return value


# ---------------------------------------------------------------------------
# Hourly production + QC checks
# ---------------------------------------------------------------------------
@dataclass
class DayOutput:
    dept: str
    line: SewingLine | None
    cfg: SewingLineStyleConfig | None
    day: date
    good: int
    reject: int
    remarks: str


def _daily_outputs(cells: list[CellQty], plans: list[tuple]) -> list[DayOutput]:
    """Turn the quantity plan into per-day output for cutting, each sewing line and finishing."""
    out: list[DayOutput] = []
    lays = [n for n in LAYS_PER_CUTTING_DAY]
    for d, n in zip(CUTTING_DAYS, lays):
        out.append(DayOutput("cutting", None, None, d, n * PLIES_PER_LAY * 20, 0,
                             f"{ORDER_CODE}: {n} lays cut (body, sleeves) – {n * 40} bundles numbered"))
    for d, qty in zip(RIB_CUTTING_DAYS, _spread(_total(cells, "cut"), [1, 1])):
        out.append(DayOutput("cutting", None, None, d, qty, 0, f"{ORDER_CODE}: 1x1 rib neckband cutting"))
    for line, cfg, colors, start, end in plans:
        days = _working_days(start, end)
        weights = _ramp(len(days))
        goods = _spread(_total(cells, "sewn", colors), weights)
        rejects = _spread(_total(cells, "sew_reject", colors), weights)
        for d, g, r in zip(days, goods, rejects):
            out.append(DayOutput("sewing", line, cfg, d, g, r, f"{ORDER_CODE} {'/'.join(colors)} – {line.line_code}"))
    fin_days = _working_days(date(2026, 8, 1), D["finishing_end"])
    fin_w = _ramp(len(fin_days))
    for d, g, r in zip(fin_days, _spread(_total(cells, "finished"), fin_w), _spread(_total(cells, "finish_reject"), fin_w)):
        out.append(DayOutput("finishing", None, None, d, g, r, f"{ORDER_CODE}: ironing, final check, tagging, poly-packing"))
    return out


async def _ensure_hourly(db, ctx, user, order: Order, style: GarmentStyle, shift: ProductionShift,
                         days: list[DayOutput]) -> None:
    """First entry of each department goes through the real hourly upsert (pipeline + TNA sync);
    the rest are bulk inserted with the same fields to keep the seed fast."""
    from app.modules.production.hourly_router import upsert_hourly
    from app.modules.production.schemas import HourlyEntryUpsert

    dates = sorted({d.day for d in days})
    existing = {
        (r.department_type, r.production_date, r.hour_slot, r.line_id)
        for r in (await db.execute(select(HourlyProductionEntry).where(
            HourlyProductionEntry.tenant_id == ctx.tenant_id,
            HourlyProductionEntry.production_date.between(dates[0], dates[-1]),
            HourlyProductionEntry.department_type.in_(("cutting", "sewing", "finishing")),
        ))).scalars().all()
    }
    via_service: set[tuple] = set()
    created = 0
    for day in days:
        line_id = day.line.id if day.line else None
        goods = _spread(day.good, HOUR_WEIGHTS)
        rejects = _spread(day.reject, HOUR_WEIGHTS)
        for slot, (g, r) in enumerate(zip(goods, rejects), start=1):
            key = (day.dept, day.day, slot, line_id)
            if key in existing:
                continue
            rework = int(g * 0.03) if day.dept == "sewing" else 0
            target = round(day.good * 1.06 / 8)
            fields = dict(
                department_type=day.dept, line_id=line_id, line_style_config_id=day.cfg.id if day.cfg else None,
                order_id=order.id, style_id=style.id, shift_id=shift.id, target_qty=float(target),
                good_qty=float(g), reject_qty=float(r), rework_qty=float(rework), input_qty=float(g + r),
                output_qty=float(g), uom="pcs", remarks=day.remarks,
            )
            service_key = (day.dept, line_id)
            if service_key not in via_service:
                via_service.add(service_key)
                res = await upsert_hourly(
                    body=HourlyEntryUpsert(production_date=day.day.isoformat(), hour_slot=slot, **fields),
                    tenant=ctx.tenant, user=user, db=db,
                )
                row = await db.get(HourlyProductionEntry, res["id"])
                row.entered_at = _dt(day.day, 8 + slot)
                row.updated_at = _dt(day.day, 8 + slot)
            else:
                db.add(HourlyProductionEntry(
                    tenant_id=ctx.tenant_id, production_date=day.day, hour_slot=slot,
                    entered_by_user_id=user.id, entered_at=_dt(day.day, 8 + slot), updated_at=_dt(day.day, 8 + slot),
                    **fields,
                ))
            created += 1
    await db.flush()
    if created:
        by_dept = {k: sum(d.good for d in days if d.dept == k) for k in ("cutting", "sewing", "finishing")}
        rib = sum(d.good for d in days if d.dept == "cutting" and d.day in RIB_CUTTING_DAYS)
        ctx.log(f"Hourly production: {created} hourly entries – cutting {by_dept['cutting'] - rib:,} body + "
                f"{rib:,} rib, sewing {by_dept['sewing']:,}, finishing {by_dept['finishing']:,} pcs")


async def _ensure_qc_checks(db, ctx, user, order: Order, shift: ProductionShift, days: list[DayOutput]) -> None:
    """Inline checks (hours 3 and 6) and an end-line check (hour 8) for every sewing line-day."""
    sewing = [d for d in days if d.dept == "sewing"]
    existing = {
        (r.sewing_line_id, r.production_date, r.hour_slot, r.check_type)
        for r in (await db.execute(select(ProductionQcCheck).where(
            ProductionQcCheck.tenant_id == ctx.tenant_id, ProductionQcCheck.shift_id == shift.id,
            ProductionQcCheck.production_date.between(D["sewing_start"], D["sewing_end"]),
        ))).scalars().all()
    }
    sew_codes = ["BRK-STITCH", "OPEN-SEAM", "UNEVEN-HEM", "NECK-PUCKER", "PRINT-SMEAR", "OIL-SPOT"]
    created = 0
    for i, day in enumerate(sewing):
        rework = int(day.good * 0.03)
        endline_fail = day.reject + rework
        split = _spread(endline_fail, [5, 3, 3, 2, 1, 1])
        for slot, ctype, checked, fail, codes in [
            (3, "inline", 140, i % 3, [{"code": sew_codes[i % 4], "count": i % 3}] if i % 3 else []),
            (6, "inline", 140, (i + 1) % 2, [{"code": sew_codes[(i + 1) % 4], "count": 1}] if (i + 1) % 2 else []),
            (8, "endline", day.good + endline_fail, endline_fail,
             [{"code": c, "count": n} for c, n in zip(sew_codes, split) if n]),
        ]:
            if (day.line.id, day.day, slot, ctype) in existing:
                continue
            db.add(ProductionQcCheck(
                tenant_id=ctx.tenant_id, order_id=order.id, sewing_line_id=day.line.id, shift_id=shift.id,
                production_date=day.day, hour_slot=slot, check_type=ctype, total_checked=checked,
                pass_qty=checked - fail, fail_qty=fail, defect_codes=codes,
                notes=f"{ORDER_CODE} {ctype} QC – {day.line.line_code}" + (
                    f" (rework {rework}, reject {day.reject})" if ctype == "endline" else " – 7 operations x 20 pcs"),
                entered_by_user_id=user.id, created_at=_dt(day.day, 8 + slot), updated_at=_dt(day.day, 8 + slot),
            ))
            created += 1
    await db.flush()
    if created:
        ctx.log(f"Production QC: {created} inline / end-line checks on {len(sewing)} line-days")


# ---------------------------------------------------------------------------
# Sewing & finishing -> finished goods
# ---------------------------------------------------------------------------
async def _ensure_finished_goods(db, ctx, user, order: Order, bom: Bom, jobwork: ProcessOrder, printed_item: Item,
                                 fg_item: Item, cutting_wh: Warehouse, fg_wh: Warehouse, cells: list[CellQty],
                                 trims_value: Decimal, rate: Decimal) -> ProcessOrder:
    po = await find_one(db, ProcessOrder, tenant_id=ctx.tenant_id, process_number=SEWING_PROCESS_CODE)
    if po:
        return po
    printed = _total(cells, "printed")
    finished = _total(cells, "finished")
    cur = "BDT" if rate == USD_TO_BDT else "USD"
    breakdown = "; ".join(
        f"{name} " + " ".join(f"{c.size} {c.finished}" for c in cells if c.color_name == name)
        for name, _ in COLORS
    )
    cost_lines = [
        dict(cost_type="ADD_ON", amount=str(_money(CM_SEWING_USD * finished * rate)), currency=cur,
             description=f"CM – cutting & sewing (USD {CM_SEWING_USD}/pc x {finished:,})",
             remarks="Per quotation PRM-QUO-001 manufacturing line 1"),
        dict(cost_type="ADD_ON", amount=str(_money(CM_FINISHING_USD * finished * rate)), currency=cur,
             description=f"Finishing, ironing, QC & packing (USD {CM_FINISHING_USD}/pc x {finished:,})",
             remarks="Per quotation PRM-QUO-001 manufacturing line 2"),
    ]
    if trims_value > 0:
        cost_lines.append(dict(cost_type="MATERIAL", amount=str(_money(trims_value)), currency=cur,
                               description=f"Trims & packing issued ({', '.join(TRIMS_ISSUE_CODES)})"))
    po = await _run_process_order(
        db, ctx, user,
        body_kwargs=dict(
            process_number=SEWING_PROCESS_CODE, process_type="FINISHING", process_method="in_house",
            linked_order_id=order.id, source_order_id=order.id, source_bom_id=bom.id,
            master_contract_id=order.master_contract_id, customer_id=ctx.customer.id,
            warehouse_id=cutting_wh.id, output_warehouse_id=fg_wh.id,
            input_item_id=printed_item.id, output_item_id=fg_item.id,
            input_quantity=str(printed), expected_output_qty=str(int(printed * 0.99)),
            prior_process_order_id=jobwork.id, process_stage="Sewing → finishing → packing",
            planned_loss_pct="1.00", output_same_as_input=False, output_grade="A",
            output_lot_number="PRM-FG-LOT-0830",
            remarks=(f"{ORDER_CODE}: printed panels sewn on LKH-L01 (Black, Navy) and L-U2-01 (White), "
                     f"{D['sewing_start']:%d %b}–{D['sewing_end']:%d %b}; finished & packed by "
                     f"{D['finishing_end']:%d %b}. Good A-grade pcs by colour/size: {breakdown}."),
        ),
        cost_lines=cost_lines, processing_charges=Decimal("0"), actual_output=finished,
        created_on=D["sewing_start"] - timedelta(days=1), issued_on=D["jobwork_received"],
        received_on=D["finishing_end"], approved_on=D["final_inspection"],
    )
    ctx.log(f"Sewing/finishing {SEWING_PROCESS_CODE}: {printed:,} printed panels in → {finished:,} pcs "
            f"{FINISHED_GOOD_CODE} into '{fg_wh.name}' on {D['finishing_end']:%d %b} – {po.status}")
    return po


# ---------------------------------------------------------------------------
# Manufacturing work order (routing, operations, quality checks incl. final AQL)
# ---------------------------------------------------------------------------
MFG_STEPS = [
    # code, name, area, work-centre code, work-centre name, std min, start, end, qty_in attr, qty_out attr
    ("CUT", "Cutting & bundling", "cutting", "PRM-WC-CUT", "Cutting section – Unit 1 Gazipur", "0.45",
     D["cutting_start"], D["cutting_end"], "cut", "cut"),
    ("PRINT", "Chest screen print (subcontract)", "printing", "PRM-WC-PRINT", "Subcontract print – Ashulia", "0.00",
     D["jobwork_sent"], D["jobwork_received"], "cut", "printed"),
    ("SEW", "Sewing", "sewing", "PRM-WC-SEW", "Sewing floor (LKH-L01 / L-U2-01)", "6.20",
     D["sewing_start"], D["sewing_end"], "printed", "sewn"),
    ("FIN", "Finishing & ironing", "finishing", "PRM-WC-FIN", "Finishing section", "0.90",
     date(2026, 8, 1), D["finishing_end"], "sewn", "finished"),
    ("PACK", "Packing (polybag + export carton)", "packing", "PRM-WC-PACK", "Packing section", "0.35",
     PACKING_ISSUE_DATE, D["finishing_end"], "finished", "finished"),
    ("FQC", "Final inspection AQL 2.5", "quality", "PRM-WC-QA", "Quality assurance", "0.00",
     D["final_inspection"], D["final_inspection"], "finished", "finished"),
]


async def _ensure_mfg_work_order(db, ctx, user, order: Order, fg_item: Item, cells: list[CellQty]) -> None:
    from app.modules.manufacturing.execution_router import create_work_order
    from app.modules.manufacturing.schemas import WorkOrderCreate

    tid = ctx.tenant_id
    if await find_one(db, ManufacturingWorkOrder, tenant_id=tid, mo_number=MFG_WORK_ORDER_CODE):
        return
    routing = await find_one(db, ManufacturingRoutingTemplate, tenant_id=tid, routing_code=MFG_ROUTING_CODE)
    op_rows = []
    for step_no, (code, name, area, wc_code, wc_name, std, *_rest) in enumerate(MFG_STEPS, start=1):
        wc = await find_one(db, ManufacturingWorkCenter, tenant_id=tid, code=wc_code)
        if wc is None:
            wc = ManufacturingWorkCenter(tenant_id=tid, code=wc_code, name=wc_name, capacity_minutes_per_day=480)
            db.add(wc)
            await db.flush()
        op = await find_one(db, ManufacturingOperation, tenant_id=tid, code=f"PRM-OP-{code}")
        if op is None:
            op = ManufacturingOperation(tenant_id=tid, code=f"PRM-OP-{code}", name=name, default_work_center_id=wc.id,
                                        process_area=area, std_cycle_minutes=Decimal(std), std_setup_minutes=Decimal("30"))
            db.add(op)
            await db.flush()
        op_rows.append((step_no, op, wc))
    if routing is None:
        routing = ManufacturingRoutingTemplate(tenant_id=tid, routing_code=MFG_ROUTING_CODE, item_id=fg_item.id,
                                               version_no=1, notes=f"Routing for {STYLE_CODE} crew-neck tee with chest print")
        db.add(routing)
        await db.flush()
        for step_no, op, wc in op_rows:
            db.add(ManufacturingRoutingStep(tenant_id=tid, routing_id=routing.id, step_no=step_no, operation_id=op.id,
                                            work_center_id=wc.id, std_minutes=op.std_cycle_minutes,
                                            qc_required=op.process_area in ("printing", "sewing", "quality")))
        await db.flush()

    finished = _total(cells, "finished")
    res = await create_work_order(
        body=WorkOrderCreate(mo_number=MFG_WORK_ORDER_CODE, item_id=fg_item.id, routing_id=routing.id,
                             qty_planned=float(ORDER_QTY), order_id=order.id,
                             notes=f"{ORDER_CODE} Primark men's crew-neck tee – 24,000 pcs, cut +2%."),
        tenant=ctx.tenant, user=user, db=db,
    )
    wo = await db.get(ManufacturingWorkOrder, res.id)
    wo.status = "completed"
    wo.qty_completed = Decimal(finished)
    wo.created_at = _dt(D["material_issue"], 9)
    wo.updated_at = _dt(D["final_inspection"], 17)
    wo_ops = {}
    for (step_no, op, wc), step in zip(op_rows, MFG_STEPS):
        start, end, in_attr, out_attr = step[6], step[7], step[8], step[9]
        q_in, q_out = _total(cells, in_attr), _total(cells, out_attr)
        row = ManufacturingWorkOrderOperation(
            tenant_id=tid, work_order_id=wo.id, step_no=step_no, operation_id=op.id, work_center_id=wc.id,
            status="completed", start_at=_dt(start, 8), end_at=_dt(end, 17), qty_in=Decimal(q_in),
            qty_out=Decimal(q_out), scrap_qty=Decimal(q_in - q_out), order_id=order.id,
            created_at=_dt(D["material_issue"], 9), updated_at=_dt(end, 17),
        )
        db.add(row)
        await db.flush()
        wo_ops[step[0]] = row

    checks = [
        ("PRINT", "in_process", "pass", "PRINT-SMEAR", D["jobwork_received"],
         f"Incoming print inspection at receipt: {_total(cells, 'print_reject')} panels rejected "
         f"(smear / misregistration) out of {_total(cells, 'cut'):,}; print rub & wash fastness OK."),
        ("SEW", "in_process", "pass", None, date(2026, 8, 10),
         "Traffic-light inline audit, both lines GREEN; DHU 2.1% (LKH-L01), 2.6% (L-U2-01)."),
        ("FIN", "in_process", "pass", "OIL-SPOT", date(2026, 8, 27),
         f"Pre-final internal audit 200 pcs: 2 minor (oil spot) – cleaned. "
         f"{_total(cells, 'finish_reject')} pcs downgraded to B-grade during finishing."),
        ("FQC", "final", "pass", None, D["final_inspection"],
         f"FINAL AQL 2.5 (General Level II) by Intertek Bangladesh for Primark: lot {finished:,} pcs, "
         f"code letter M, sample 315 pcs, Ac 14 / Re 15 major – found 3 major, 7 minor (AQL 4.0 Ac 21). "
         f"Measurements, shade, print, labelling, carton marking & metal detection OK. RESULT: PASSED."),
    ]
    for step_code, ctype, result, defect, on, remarks in checks:
        db.add(ManufacturingQualityCheck(
            tenant_id=tid, work_order_id=wo.id, work_order_operation_id=wo_ops[step_code].id, order_id=order.id,
            check_type=ctype, result=result, defect_code=defect, remarks=remarks, checked_by_user_id=user.id,
            created_at=_dt(on, 15),
        ))
    await db.flush()
    ctx.log(f"Manufacturing work order {MFG_WORK_ORDER_CODE}: 6 operations completed, {finished:,} pcs; "
            f"final AQL 2.5 inspection PASSED on {D['final_inspection']:%d %b}")


async def _ensure_inventory_mo(db, ctx, user, fg_item: Item, cells: list[CellQty]) -> None:
    """Stage-wise manufacturing order on the Production → Manufacturing orders screen."""
    from app.modules.inventory.router import (
        ManufacturingOrderBody,
        ManufacturingStageUpdate,
        complete_manufacturing_stage,
        create_manufacturing_order,
        skip_manufacturing_stage,
        start_manufacturing_order,
        start_manufacturing_stage,
        update_manufacturing_stage,
    )

    if await find_one(db, ManufacturingOrder, tenant_id=ctx.tenant_id, mo_number=INV_MO_CODE):
        return
    t = ctx.tenant
    mo = await create_manufacturing_order(
        body=ManufacturingOrderBody(mo_number=INV_MO_CODE, finished_item_id=fg_item.id, planned_quantity=str(ORDER_QTY),
                                    notes=f"{ORDER_CODE} / {STYLE_CODE} – Primark crew-neck tee with chest print"),
        tenant=t, user=user, db=db,
    )
    await start_manufacturing_order(mo_id=mo.id, tenant=t, user=user, db=db)
    stages = list((await db.execute(select(ManufacturingStage).where(ManufacturingStage.manufacturing_order_id == mo.id)
                                    .order_by(ManufacturingStage.stage_order))).scalars().all())
    plan = {
        "printing": ("cut", "printed", "Chest print by Ashulia Screen Print (job work PRM-JW-001)"),
        "cutting": ("cut", "cut", "18 lays / 720 bundles, cut +2%"),
        "sewing": ("printed", "sewn", "LKH-L01 + L-U2-01"),
        "finishing": ("sewn", "finished", "Ironing, final check, poly-packing"),
        "quality_check": ("finished", "finished", "Final AQL 2.5 passed (Intertek)"),
    }
    skip_notes = {"yarn_sourcing": "Finished fabric bought", "knitting": "Finished fabric bought",
                  "dyeing": "Finished fabric bought", "washing": "Softener applied at fabric finishing"}
    for st in stages:
        if st.stage_name in plan:
            in_attr, out_attr, note = plan[st.stage_name]
            q_in, q_out = _total(cells, in_attr), _total(cells, out_attr)
            await start_manufacturing_stage(stage_id=st.id, tenant=t, user=user, db=db)
            await update_manufacturing_stage(
                stage_id=st.id, tenant=t, user=user, db=db,
                body=ManufacturingStageUpdate(input_quantity=str(q_in), output_quantity=str(q_out),
                                              process_loss_percentage=f"{(q_in - q_out) * 100 / q_in:.2f}", notes=note),
            )
            await complete_manufacturing_stage(stage_id=st.id, tenant=t, user=user, db=db)
        else:
            await skip_manufacturing_stage(stage_id=st.id, tenant=t, user=user, db=db)
            st.notes = skip_notes.get(st.stage_name)
    mo = await db.get(ManufacturingOrder, mo.id)
    mo.status = "completed"
    mo.completed_quantity = Decimal(_total(cells, "finished"))
    mo.created_at = _dt(D["material_issue"], 9)
    mo.updated_at = _dt(D["final_inspection"], 17)
    await db.flush()
    ctx.log(f"Manufacturing order {INV_MO_CODE}: stages cutting → printing → sewing → finishing → QC completed")


# ---------------------------------------------------------------------------
# Wastage records, line plan completion, pipeline
# ---------------------------------------------------------------------------
async def _ensure_wastage(db, ctx, user, order: Order, fabric: Item, cut_item: Item, printed_item: Item,
                          fg_item: Item, fabric_kg: Decimal, fabric_value: Decimal, jobwork: ProcessOrder,
                          sewing_po: ProcessOrder, cells: list[CellQty]) -> None:
    reasons = [
        ("PRM-CUT-ENDBIT", "Cutting end bits & lay ends", "fabric", False, True),
        ("PRM-PRINT-REJ", "Print reject (smear / misregistration)", "process", False, False),
        ("PRM-SEW-REJ", "Sewing reject (unrepairable)", "process", False, False),
        ("PRM-FIN-BGRADE", "Finishing downgrade – sold as B-grade stock lot", "process", True, False),
    ]
    reason_rows = {}
    for code, name, cat, recoverable, recyclable in reasons:
        r = await find_one(db, WastageReason, tenant_id=ctx.tenant_id, code=code)
        if r is None:
            r = WastageReason(tenant_id=ctx.tenant_id, code=code, name=name, category=cat, recoverable=recoverable,
                              recyclable=recyclable)
            db.add(r)
            await db.flush()
        reason_rows[code] = r
    if await find_one(db, WastageTransaction, tenant_id=ctx.tenant_id, order_id=order.id,
                      reason_id=reason_rows["PRM-CUT-ENDBIT"].id):
        return
    kg_cost = (fabric_value / fabric_kg).quantize(FOUR) if fabric_kg else Decimal("0")
    endbit_kg = (fabric_kg * CUTTING_WASTE_PCT / 100).quantize(Decimal("0.01"))
    pc_cost = (fabric_value / _total(cells, "cut")).quantize(FOUR)
    rows = [
        ("PRM-CUT-ENDBIT", fabric.id, "cutting", endbit_kg, kg_cost, Decimal("0"), "MARKER_PLAN", None, D["cutting_end"]),
        ("PRM-PRINT-REJ", cut_item.id, "printing", Decimal(_total(cells, "print_reject")), pc_cost, Decimal("0"),
         "PROCESS_ORDER", jobwork.id, D["jobwork_received"]),
        ("PRM-SEW-REJ", printed_item.id, "sewing", Decimal(_total(cells, "sew_reject")), pc_cost, Decimal("0"),
         "PROCESS_ORDER", sewing_po.id, D["sewing_end"]),
        ("PRM-FIN-BGRADE", fg_item.id, "finishing", Decimal(_total(cells, "finish_reject")), pc_cost,
         Decimal("0.40"), "PROCESS_ORDER", sewing_po.id, D["finishing_end"]),
    ]
    for code, item_id, stage, qty, uc, recover_pct, ref_type, ref_id, on in rows:
        value = (qty * uc).quantize(TWO)
        db.add(WastageTransaction(
            tenant_id=ctx.tenant_id, order_id=order.id, item_id=item_id, process_stage=stage,
            reason_id=reason_rows[code].id, quantity=qty, unit_cost=uc, value=value,
            recoverable_value=(value * recover_pct).quantize(TWO), reference_type=ref_type, reference_id=ref_id,
            created_at=_dt(on, 16), created_by_id=user.id,
        ))
    await db.flush()
    ctx.log(f"Wastage: cutting end bits {endbit_kg} kg, print {_total(cells, 'print_reject')}, "
            f"sewing {_total(cells, 'sew_reject')}, finishing B-grade {_total(cells, 'finish_reject')} pcs")


async def _complete_line_plan(db, ctx, plans: list[tuple], cells: list[CellQty], user: User, order: Order) -> None:
    from app.modules.production.line_reservation_service import release_reservation

    for line, cfg, colors, _start, end in plans:
        if cfg.reservation_status != "COMPLETED":
            cfg.status = "completed"
            cfg.reservation_status = "COMPLETED"
            cfg.completed_qty = Decimal(_total(cells, "sewn", colors))
            cfg.actual_end_date = end
            cfg.updated_at = _dt(end, 18)
    await db.flush()
    my_ids = [cfg.id for _l, cfg, *_ in plans]
    stray = (
        await db.execute(
            select(SewingLineStyleConfig).where(SewingLineStyleConfig.tenant_id == ctx.tenant_id,
                                                SewingLineStyleConfig.order_id == order.id,
                                                SewingLineStyleConfig.reservation_status == "DRAFT",
                                                SewingLineStyleConfig.id.not_in(my_ids))
        )
    ).scalars().all()
    for row in stray:
        await release_reservation(db, tenant_id=ctx.tenant_id, config_id=row.id, user_id=user.id)
    await db.flush()


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
async def run(db: AsyncSession, ctx: DemoContext) -> None:
    from app.modules.orders.pipeline_service import auto_advance_order_pipeline

    tid = ctx.tenant_id
    user = await _admin_user(db, ctx)
    order = await require_one(db, Order, tenant_id=tid, order_code=ORDER_CODE)
    style = await require_one(db, GarmentStyle, tenant_id=tid, style_code=STYLE_CODE)
    bom = await _order_bom(db, ctx, order)
    rm_wh = await _warehouse(db, ctx, WAREHOUSE_RM_NAME)
    cutting_wh = await _warehouse(db, ctx, WAREHOUSE_CUTTING_NAME)
    fg_wh = await _warehouse(db, ctx, WAREHOUSE_FG_NAME)
    fabric = await _item(db, ctx, FABRIC_CODE)
    rib = await _item(db, ctx, RIB_CODE)
    fg_item = await _item(db, ctx, FINISHED_GOOD_CODE)
    cells = quantity_plan()

    # Production started on the first cutting day (services only stamp it when empty).
    if order.production_started_at is None:
        order.production_started_at = _dt(D["cutting_start"], 8)
        await db.flush()

    vendor = await _ensure_jobwork_vendor(db, ctx)
    cut_item, printed_item = await _ensure_sfg_items(db, ctx)
    await _ensure_defect_codes(db, ctx)
    ob = await _ensure_operation_bulletin(db, ctx, order, style, user)
    shift = await _ensure_shift(db, ctx)
    plans = await _ensure_line_plan(db, ctx, order, style, ob, shift, cells, user)

    rate = await _value_per_usd(db, ctx, fabric)
    fabric_kg, fabric_value = await _fabric_issue_facts(db, ctx, fabric, rib)
    tickets = await _ensure_cutting(db, ctx, order, style, fabric, fabric_kg, plans, user)
    await _ensure_cut_panel_stock(db, ctx, order, bom, tickets, cut_item, cutting_wh, fabric_value, user)

    jobwork = await _ensure_jobwork(db, ctx, user, order, bom, vendor, cut_item, printed_item, cutting_wh, cells, rate)
    trims_value = await _ensure_trims_issue(db, ctx, user, order, bom, cutting_wh, rm_wh)

    days = _daily_outputs(cells, plans)
    await _ensure_hourly(db, ctx, user, order, style, shift, days)
    await _ensure_qc_checks(db, ctx, user, order, shift, days)

    sewing_po = await _ensure_finished_goods(db, ctx, user, order, bom, jobwork, printed_item, fg_item, cutting_wh,
                                             fg_wh, cells, trims_value, rate)
    await _ensure_mfg_work_order(db, ctx, user, order, fg_item, cells)
    try:
        await _ensure_inventory_mo(db, ctx, user, fg_item, cells)
    except Exception as exc:  # optional screen data – keep going
        ctx.log(f"  manufacturing order {INV_MO_CODE} skipped: {exc}")
    try:
        async with db.begin_nested():
            await _ensure_wastage(db, ctx, user, order, fabric, cut_item, printed_item, fg_item, fabric_kg,
                                  fabric_value, jobwork, sewing_po, cells)
    except Exception as exc:
        ctx.log(f"  wastage records skipped: {exc}")
    await _complete_line_plan(db, ctx, plans, cells, user, order)

    status = await auto_advance_order_pipeline(db, tenant_id=tid, order_id=order.id)
    await db.flush()
    fg_on_hand = await _on_hand(db, ctx, fg_item.id, fg_wh.id)
    ctx.log(f"Order {ORDER_CODE} pipeline: {status}; production started {order.production_started_at:%d %b %Y}; "
            f"FG on hand in '{fg_wh.name}': {fg_on_hand:,.0f} pcs (value unit: {'BDT' if rate == USD_TO_BDT else 'USD'})")
