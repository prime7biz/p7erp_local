"""Stage 2 – Merchandising: style tech details, order BOM (approved + frozen), samples, TNA follow-up.

What this stage creates for order PRM-ORD-001 (all idempotent, all dated on the fixed timeline `D`):

1. Style tech details on PRM-STY-001: components, colourways (Pantone refs) and the S–XXL size scale.
2. The order-driven BOM (one line per MATERIALS entry) using the same services as the BOM screen:
   create from order -> edit lines -> submit -> approve -> freeze. The order pipeline is then
   auto-advanced so `orders.bom_created_at` / `pipeline_status` update like in the UI.
3. A BOM-driven consumption plan (material requirement per item).
4. Merch samples: lab dip, fit sample (2 rounds) and PP sample – each with tasks, buyer comments,
   sample costing and sample material lines – walked through requested -> ... -> approved.
5. The TNA (order follow-up actions) generated from the tenant's templates, with planned and actual
   dates for every milestone, all completed.

Downstream: stage 3 finds the BOM with `Bom.order_id == order.id and Bom.is_active` (same lookup as
GET /api/v1/merch/order-boms/by-order/{order_id}) and can raise POs from its lines.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.codegen import next_tenant_code
from app.models import (
    Bom,
    BomItem,
    ConsumptionPlan,
    ConsumptionPlanItem,
    FollowupActionComment,
    FollowupActionRejectionLog,
    FollowupActionTemplate,
    GarmentStyle,
    Inquiry,
    Item,
    MerchSampleComment,
    MerchSampleCostLine,
    MerchSampleMaterialLine,
    MerchSampleRequest,
    MerchSampleTask,
    Order,
    OrderFollowupAction,
    Quotation,
    Role,
    StyleColorway,
    StyleComponent,
    StyleSizeScale,
    User,
    Vendor,
)
from app.modules.merch import bom_workflow_service as wf_svc
from app.modules.merch.bom_line_sync import apply_calculations_to_line
from app.modules.merch.bom_prefill_service import create_bom_from_order_prefill
from app.modules.merch.constants import TNA_DEFAULT_TEMPLATE_SEED
from app.modules.merch.routers.samples import _ALLOWED_TRANSITIONS, SAMPLE_TYPES
from app.modules.orders.pipeline_service import auto_advance_order_pipeline

from primark_demo.common import (
    BL_NUMBER,
    BUYER_PO_NUMBER,
    COLORS,
    COMMERCIAL_INVOICE_NO,
    CURRENCY,
    D,
    DELIVERY_CHALLAN_CODE,
    EXP_NUMBER,
    GATE_PASS_CODE,
    GRN_FABRIC_CODE,
    GRN_PACK_CODE,
    GRN_TRIM_CODE,
    INQUIRY_CODE,
    MATERIALS,
    ORDER_CODE,
    QUOTATION_CODE,
    SALES_CONTRACT_REF,
    SIZE_RATIO,
    STYLE_CODE,
    DemoContext,
    MaterialSpec,
    find_one,
    require_one,
)

FOUR = Decimal("0.0001")

# BOM workflow dates (order confirmed 15 Jun -> BOM drafted 16 Jun -> submitted 17 Jun -> approved/frozen 18 Jun)
BOM_DRAFTED = date(2026, 6, 16)
BOM_SUBMITTED = date(2026, 6, 17)

# Style tech details shown on the style detail page
STYLE_COMPONENTS = [
    ("Body (front & back)", "180 GSM organic cotton single jersey, reactive dyed, softener wash"),
    ("Short sleeves", "Set-in sleeves, 2.5 cm twin-needle cover-stitch hem"),
    ("Neckband", "1x1 organic cotton rib, 2 cm finished width, self-fabric back-neck tape"),
    ("Chest print", "1-colour water-based screen print 22 x 8 cm, 7 cm below HPS (job work)"),
]
PANTONE = {
    "BLK": "Pantone 19-4005 TCX Jet Black – lab dip option C approved",
    "WHT": "Pantone 11-0601 TCX Bright White (OBA-free) – lab dip option A approved",
    "NVY": "Pantone 19-4024 TCX Dress Blues – lab dip option B approved",
}


def _dt(d: date, hour: int = 10, minute: int = 0) -> datetime:
    """Business date -> datetime at a fixed office time (keeps created_at on the demo timeline)."""
    return datetime.combine(d, time(hour, minute))


def _dec(value) -> Decimal:
    return Decimal(str(value or 0))


# ---------------------------------------------------------------------------
# People (who submits / approves)
# ---------------------------------------------------------------------------
@dataclass
class People:
    admin: User
    merchandiser: User


async def _load_people(db: AsyncSession, ctx: DemoContext) -> People:
    """Active admin of the tenant (approver) and a merchandiser (falls back to the admin)."""
    rows = (
        await db.execute(
            select(User, Role.name)
            .join(Role, Role.id == User.role_id)
            .where(User.tenant_id == ctx.tenant_id, User.is_active.is_(True))
            .order_by(User.id)
        )
    ).all()
    first_by_role: dict[str, User] = {}
    for user, role_name in rows:
        first_by_role.setdefault((role_name or "").lower(), user)
    admin = first_by_role.get("admin")
    if admin is None:
        raise RuntimeError(f"No active admin user found in tenant {ctx.tenant_id}")
    return People(admin=admin, merchandiser=first_by_role.get("merchandiser", admin))


# ---------------------------------------------------------------------------
# 1. Style tech details
# ---------------------------------------------------------------------------
async def _ensure_style_details(db: AsyncSession, ctx: DemoContext, style: GarmentStyle) -> None:
    """Components, colourways and size scale for the style (created once)."""
    tid = ctx.tenant_id
    created = 0
    if await find_one(db, StyleComponent, tenant_id=tid, style_id=style.id) is None:
        for seq, (name, notes) in enumerate(STYLE_COMPONENTS, start=1):
            db.add(StyleComponent(tenant_id=tid, style_id=style.id, component_name=name,
                                  sequence_no=seq, notes=notes, created_at=_dt(D["order_confirmed"])))
        created += len(STYLE_COMPONENTS)
    if await find_one(db, StyleColorway, tenant_id=tid, style_id=style.id) is None:
        for color_name, color_code in COLORS:
            db.add(StyleColorway(tenant_id=tid, style_id=style.id, color_name=color_name,
                                 color_code=color_code, notes=PANTONE.get(color_code),
                                 created_at=_dt(D["lab_dip_approved"])))
        created += len(COLORS)
    if await find_one(db, StyleSizeScale, tenant_id=tid, style_id=style.id) is None:
        ratio = " / ".join(f"{size} {pct}%" for size, pct in SIZE_RATIO)
        db.add(StyleSizeScale(tenant_id=tid, style_id=style.id, scale_name="Primark menswear tops S–XXL",
                              sizes_csv=",".join(size for size, _ in SIZE_RATIO),
                              notes=f"Order size ratio: {ratio}", created_at=_dt(D["order_confirmed"])))
        created += 1
    await db.flush()
    if created:
        ctx.log(f"Style {STYLE_CODE} tech details: {len(STYLE_COMPONENTS)} components, "
                f"{len(COLORS)} colourways, 1 size scale")


# ---------------------------------------------------------------------------
# 2. Order BOM
# ---------------------------------------------------------------------------
async def _find_active_order_bom(db: AsyncSession, ctx: DemoContext, order: Order) -> Bom | None:
    """Same lookup as GET /merch/order-boms/by-order/{order_id}."""
    stmt = (
        select(Bom)
        .where(Bom.tenant_id == ctx.tenant_id, Bom.order_id == order.id, Bom.is_active.is_(True))
        .order_by(Bom.id.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalars().first()


async def _bom_lines(db: AsyncSession, bom: Bom) -> list[BomItem]:
    stmt = (
        select(BomItem)
        .where(BomItem.tenant_id == bom.tenant_id, BomItem.bom_id == bom.id)
        .order_by(BomItem.sort_order, BomItem.id)
    )
    return list((await db.execute(stmt)).scalars().all())


async def _vendor_for(db: AsyncSession, ctx: DemoContext, vendor_code: str) -> Vendor | None:
    """Vendors are created in stage 3; until then the BOM line keeps only the vendor code in remarks."""
    return await find_one(db, Vendor, tenant_id=ctx.tenant_id, vendor_code=vendor_code)


def _line_remarks(m: MaterialSpec) -> str:
    return (f"{m.category_code} · nominated supplier {m.vendor_code} · "
            f"{m.consumption_per_pc} {m.unit_code}/pc + {m.wastage_pct}% wastage")


async def _apply_material_specs(db: AsyncSession, ctx: DemoContext, bom: Bom, lines: list[BomItem]) -> None:
    """Edit DRAFT BOM lines exactly like the BOM screen's line PATCH: net consumption, wastage %, price.

    Lines missing for a MATERIALS code are added the same way as POST /order-boms/{id}/lines.
    """
    order_qty = int(bom.order_qty_snapshot or 0)
    by_item = {ln.item_id: ln for ln in lines if ln.item_id}
    next_sort = max((ln.sort_order or 0 for ln in lines), default=0) + 1
    for m in MATERIALS:
        item = await require_one(db, Item, tenant_id=ctx.tenant_id, item_code=m.code)
        line = by_item.get(item.id)
        if line is None:
            line = BomItem(
                tenant_id=ctx.tenant_id, bom_id=bom.id, item_id=item.id, category="MATERIAL",
                material_type="MATERIAL", item_code=item.item_code, item_code_snapshot=item.item_code,
                description=item.name, description_snapshot=item.name[:255], uom=m.unit_code,
                base_consumption=m.consumption_per_pc, sort_order=next_sort,
            )
            next_sort += 1
            db.add(line)
            lines.append(line)
        line.bom_net_consumption_per_unit = float(m.consumption_per_pc)
        line.wastage_pct = m.wastage_pct.quantize(FOUR, rounding=ROUND_HALF_UP)
        line.process_loss_pct = 0
        line.bom_expected_unit_price = float(m.unit_price)
        line.quoted_currency = line.quoted_currency or CURRENCY
        line.remarks = _line_remarks(m)
        vendor = await _vendor_for(db, ctx, m.vendor_code)
        if vendor is not None:
            line.preferred_vendor_id = vendor.id
        apply_calculations_to_line(line, order_qty)
    await db.flush()


async def _finalise_bom_lines(db: AsyncSession, ctx: DemoContext, bom: Bom) -> list[BomItem]:
    """After freeze: round required qty to whole purchase units and link vendors once stage 3 made them."""
    spec_by_code = {m.code: m for m in MATERIALS}
    lines = await _bom_lines(db, bom)
    for line in lines:
        m = spec_by_code.get(line.item_code or "")
        if m is None:
            continue
        target = Decimal(m.required_qty)
        current = _dec(line.required_gross_qty)
        if current != target and abs(current - target) < 1:
            # e.g. cartons: 24,000 / 48 x 1.02 = 509.99 -> buy 510 whole cartons
            line.required_gross_qty = target
            line.wastage_qty = (target - _dec(line.required_net_qty) - _dec(line.process_loss_qty)).quantize(FOUR)
            line.bom_expected_total_cost = (target * m.unit_price).quantize(FOUR)
        if line.preferred_vendor_id is None:
            vendor = await _vendor_for(db, ctx, m.vendor_code)
            if vendor is not None:
                line.preferred_vendor_id = vendor.id
        line.created_at = _dt(BOM_DRAFTED)
    await db.flush()
    return lines


def _backdate_bom(bom: Bom, people: People) -> None:
    """Move workflow timestamps onto the demo timeline (services stamp utcnow)."""
    bom.created_at = _dt(BOM_DRAFTED, 11)
    bom.submitted_at = _dt(BOM_SUBMITTED, 16)
    bom.submitted_by = bom.submitted_by or people.merchandiser.id
    bom.approved_at = _dt(D["bom_approved"], 11)
    bom.approved_by = bom.approved_by or people.admin.id
    bom.frozen_at = _dt(D["bom_approved"], 16)
    bom.frozen_by = bom.frozen_by or people.admin.id
    bom.updated_at = bom.frozen_at


async def _ensure_order_bom(db: AsyncSession, ctx: DemoContext, order: Order, people: People) -> Bom:
    """Create (or reuse) the active order BOM and move it DRAFT -> SUBMITTED -> APPROVED -> FROZEN."""
    bom = await _find_active_order_bom(db, ctx, order)
    if bom is None:
        quotation = await require_one(db, Quotation, tenant_id=ctx.tenant_id, id=order.quotation_id)
        bom, _ = await create_bom_from_order_prefill(db, tenant_id=ctx.tenant_id, order=order, quotation=quotation)
        ctx.log(f"Order BOM {bom.bom_code} drafted from quotation {QUOTATION_CODE}")

    status = (bom.status or "").upper()
    if status == "CANCELLED":
        raise RuntimeError(f"BOM {bom.bom_code} for {ORDER_CODE} is CANCELLED – deactivate it and re-run")
    if status == "DRAFT":
        await _apply_material_specs(db, ctx, bom, await _bom_lines(db, bom))
        bom.notes = (f"Bulk BOM for Primark PO {BUYER_PO_NUMBER} – {order.quantity:,} pcs, 3 colours x 5 sizes. "
                     "Consumption from approved fit sample marker (body 0.150 kg/pc incl. rib 0.010 kg/pc).")
        await wf_svc.submit_bom(db, bom, people.merchandiser.id)
    if (bom.status or "").upper() == "SUBMITTED":
        await wf_svc.approve_bom(db, bom, people.admin.id)
    if (bom.status or "").upper() == "APPROVED":
        await wf_svc.freeze_bom(db, bom, people.admin.id)
    await db.flush()

    lines = await _finalise_bom_lines(db, ctx, bom)
    _backdate_bom(bom, people)
    await db.flush()
    total = sum(_dec(ln.bom_expected_total_cost) for ln in lines)
    ctx.log(f"Order BOM {bom.bom_code} (id {bom.id}) {bom.status}: {len(lines)} lines, "
            f"material cost USD {total.quantize(Decimal('0.01')):,}, approved {D['bom_approved']:%d %b %Y}")
    return bom


async def _advance_pipeline(db: AsyncSession, ctx: DemoContext, order: Order) -> str | None:
    """Run the same pipeline auto-advance the BOM approve/freeze endpoints call (isolated in a savepoint)."""
    try:
        async with db.begin_nested():
            return await auto_advance_order_pipeline(db, tenant_id=ctx.tenant_id, order_id=order.id)
    except Exception as exc:  # noqa: BLE001 – optional side effect, never fail the stage
        ctx.log(f"Pipeline auto-advance skipped: {exc!r}")
        return None


# ---------------------------------------------------------------------------
# 3. Consumption plan (material requirement per item, BOM-driven)
# ---------------------------------------------------------------------------
async def _ensure_consumption_plan(db: AsyncSession, ctx: DemoContext, order: Order, bom: Bom) -> None:
    """Mirror of POST /merch/consumption-plans: one item per BOM line, qty = order qty x net x (1 + wastage)."""
    if await find_one(db, ConsumptionPlan, tenant_id=ctx.tenant_id, order_id=order.id):
        return
    plan = ConsumptionPlan(tenant_id=ctx.tenant_id, order_id=order.id, status="PLANNED",
                           created_at=_dt(D["bom_approved"], 17))
    db.add(plan)
    await db.flush()
    lines = await _bom_lines(db, bom)
    for line in lines:
        db.add(ConsumptionPlanItem(
            tenant_id=ctx.tenant_id, plan_id=plan.id, item_code=line.item_code,
            required_qty=_dec(line.required_gross_qty).quantize(FOUR), uom=line.uom,
        ))
    await db.flush()
    ctx.log(f"Consumption plan #{plan.id} for {ORDER_CODE}: {len(lines)} material lines")


# ---------------------------------------------------------------------------
# 4. Samples (lab dip, fit, PP)
# ---------------------------------------------------------------------------
# Each sample: type/subtype, dates, tasks (step, planned start/end, actual start/end),
# buyer comments (date, text), cost lines (type, label, qty, unit, rate), material lines (item code, qty, uom, note)
SAMPLES: list[dict] = [
    {
        "key": "lab_dip",
        "sample_type": "development",
        "subtype": "Lab dip",
        "requested": date(2026, 6, 15),
        "target": date(2026, 6, 23),
        "approved": D["lab_dip_approved"],
        "revision_no": 1,
        "remarks": "Lab dips for Black / White / Navy on 180 GSM organic single jersey. "
                   "3 options per colour submitted under D65 light.",
        "tasks": [
            ("Receive Pantone references from Primark colour team", date(2026, 6, 15), date(2026, 6, 15),
             date(2026, 6, 15), date(2026, 6, 15)),
            ("Dye lab dips – 3 options per colour", date(2026, 6, 16), date(2026, 6, 19),
             date(2026, 6, 16), date(2026, 6, 19)),
            ("Courier lab dips to Primark Dhaka office", date(2026, 6, 20), date(2026, 6, 20),
             date(2026, 6, 20), date(2026, 6, 20)),
            ("Buyer shade evaluation (D65 / TL84)", date(2026, 6, 21), date(2026, 6, 23),
             date(2026, 6, 21), D["lab_dip_approved"]),
        ],
        "comments": [
            (date(2026, 6, 22), "Primark colour team: Navy option A too red – option B preferred. "
                                "Black option C approved (no green cast)."),
            (D["lab_dip_approved"], "All colours approved: Black opt C, White opt A (OBA-free), Navy opt B. "
                                    "Proceed to bulk dyeing within ±0.8 ΔE."),
        ],
        "costs": [
            ("material", "Lab dip fabric swatches", "1.5", "KG", "3.40"),
            ("labor", "Lab technician – dyeing & matching", "12", "Hours", "2.50"),
            ("other", "Courier to Primark Dhaka office", "1", "Lot", "15.00"),
        ],
        "materials": [("PRM-FAB-SJ180", "1.5", "KG", "Greige for 9 lab dip swatches")],
    },
    {
        "key": "fit",
        "sample_type": "fit",
        "subtype": "Fit sample (size M)",
        "requested": date(2026, 6, 16),
        "target": date(2026, 6, 30),
        "approved": D["fit_sample_approved"],
        "revision_no": 2,
        "remarks": "Fit sample size M on live model. Rev 1 had body length +1 cm; rev 2 approved.",
        "tasks": [
            ("Pattern making from Primark spec sheet", date(2026, 6, 16), date(2026, 6, 18),
             date(2026, 6, 16), date(2026, 6, 18)),
            ("Cut & sew fit sample rev 1 (size M)", date(2026, 6, 19), date(2026, 6, 23),
             date(2026, 6, 19), date(2026, 6, 23)),
            ("Submit rev 1 to Primark technologist", date(2026, 6, 24), date(2026, 6, 24),
             date(2026, 6, 24), date(2026, 6, 24)),
            ("Pattern correction + rev 2 resubmission", date(2026, 6, 27), date(2026, 6, 29),
             date(2026, 6, 27), date(2026, 6, 29)),
            ("Buyer fit approval", date(2026, 6, 30), date(2026, 6, 30),
             date(2026, 7, 1), D["fit_sample_approved"]),
        ],
        "comments": [
            (date(2026, 6, 26), "Primark technologist (rev 1): body length +1 cm vs spec, sleeve opening tight "
                                "by 0.5 cm, neck rib width OK. Please correct and resubmit."),
            (D["fit_sample_approved"], "Rev 2 fit approved on live model. Proceed with size set and PP sample "
                                       "in bulk-approved fabric."),
        ],
        "costs": [
            ("material", "Fit sample fabric (2 rounds)", "2", "KG", "3.40"),
            ("labor", "Pattern master", "16", "Hours", "3.00"),
            ("labor", "Sample machinist", "10", "Hours", "2.00"),
            ("other", "Courier to Primark Dhaka office (2 rounds)", "2", "Lot", "15.00"),
        ],
        "materials": [
            ("PRM-FAB-SJ180", "2", "KG", "Body fabric for 2 fit rounds"),
            ("PRM-FAB-RIB1X1", "0.2", "KG", "Neck rib"),
            ("PRM-TRM-THREAD", "1", "Cone", "Sewing thread"),
        ],
    },
    {
        "key": "pp",
        "sample_type": "pp",
        "subtype": "Pre-production (sealed)",
        "requested": date(2026, 7, 3),
        "target": date(2026, 7, 10),
        "approved": D["pp_sample_approved"],
        "revision_no": 1,
        "remarks": "PP samples in bulk fabric, 2 pcs per colour (size M) with chest print and full Primark trims.",
        "tasks": [
            ("Cut PP samples in bulk fabric (2 pcs x 3 colours)", date(2026, 7, 3), date(2026, 7, 4),
             date(2026, 7, 3), date(2026, 7, 4)),
            ("Sew + chest print strike-off at print subcontractor", date(2026, 7, 5), date(2026, 7, 7),
             date(2026, 7, 5), date(2026, 7, 7)),
            ("Wash, press, attach labels & price tickets", date(2026, 7, 7), date(2026, 7, 7),
             date(2026, 7, 7), date(2026, 7, 7)),
            ("Submit to Primark QA + Intertek PP test", date(2026, 7, 8), date(2026, 7, 8),
             date(2026, 7, 8), date(2026, 7, 8)),
            ("PP meeting with production & QA", date(2026, 7, 12), date(2026, 7, 12),
             D["pp_sample_approved"], D["pp_sample_approved"]),
        ],
        "comments": [
            (date(2026, 7, 10), "Primark QA: PP samples conform. Print position 7 cm below HPS confirmed; "
                                "care label wording correct; Intertek test passed."),
            (D["pp_sample_approved"], "PP approved – red seal issued. Bulk cutting may start; keep sealed sample "
                                      "on the sewing line."),
        ],
        "costs": [
            ("material", "Bulk fabric for PP samples", "3", "KG", "3.40"),
            ("material", "Primark trims set (labels, ticket, polybag)", "6", "Set", "0.06"),
            ("labor", "Sample room – cut, sew, finish", "18", "Hours", "2.00"),
            ("other", "Intertek PP test (fibre, colour fastness, pH)", "1", "Test", "120.00"),
        ],
        "materials": [
            ("PRM-FAB-SJ180", "3", "KG", "Bulk fabric lot 1"),
            ("PRM-TRM-MLABEL", "6", "Pcs", None),
            ("PRM-TRM-CARELBL", "6", "Pcs", None),
            ("PRM-TRM-PRICETKT", "6", "Pcs", None),
            ("PRM-PCK-POLYBAG", "6", "Pcs", None),
        ],
    },
]

SAMPLE_STATUS_PATH = ["requested", "in_progress", "submitted", "approved"]


def _walk_sample_to_approved(row: MerchSampleRequest) -> None:
    """Move status step by step using the same transition rules as PATCH /merch/samples/{id}."""
    if row.status not in SAMPLE_STATUS_PATH:
        raise RuntimeError(f"Sample {row.sample_code} is {row.status!r}; cannot approve it")
    for nxt in SAMPLE_STATUS_PATH[SAMPLE_STATUS_PATH.index(row.status) + 1:]:
        if nxt not in _ALLOWED_TRANSITIONS.get(row.status, frozenset()):
            raise RuntimeError(f"Sample transition {row.status} -> {nxt} not allowed")
        row.status = nxt


async def _ensure_sample(db: AsyncSession, ctx: DemoContext, spec: dict, order: Order, style: GarmentStyle,
                         inquiry_id: int | None, people: People) -> MerchSampleRequest:
    """One merch sample request (plus tasks, comments, costing, materials), approved on its demo date."""
    if spec["sample_type"] not in SAMPLE_TYPES:
        raise RuntimeError(f"Unknown sample type {spec['sample_type']}")
    tid = ctx.tenant_id
    row = await find_one(db, MerchSampleRequest, tenant_id=tid, order_id=order.id, sample_type=spec["sample_type"])
    if row is None:
        row = MerchSampleRequest(
            tenant_id=tid, style_id=style.id, inquiry_id=inquiry_id, order_id=order.id,
            sample_code=await next_tenant_code(db, model=MerchSampleRequest, tenant_id=tid, prefix="SMP-", width=4),
            sample_type=spec["sample_type"], sample_subtype=spec["subtype"], status="requested", revision_no=1,
            created_at=_dt(spec["requested"], 9, 30),
        )
        db.add(row)
        await db.flush()
        created = True
    else:
        created = False

    if row.status != "approved":
        _walk_sample_to_approved(row)
    row.sample_subtype = spec["subtype"]
    row.revision_no = spec["revision_no"]
    row.target_date = spec["target"]
    row.actual_date = spec["approved"]
    row.assigned_to_id = people.merchandiser.id
    row.remarks = spec["remarks"]
    row.updated_at = _dt(spec["approved"], 17)

    if await find_one(db, MerchSampleTask, tenant_id=tid, sample_request_id=row.id) is None:
        for sort, (step, p_start, p_end, a_start, a_end) in enumerate(spec["tasks"], start=1):
            db.add(MerchSampleTask(
                tenant_id=tid, sample_request_id=row.id, sort_order=sort, step_name=step,
                planned_start=p_start, planned_end=p_end, actual_start=a_start, actual_end=a_end,
                assigned_to_id=people.merchandiser.id, pct_complete=Decimal("100"),
                created_at=_dt(spec["requested"], 10), updated_at=_dt(a_end, 17),
            ))
    if await find_one(db, MerchSampleComment, tenant_id=tid, sample_request_id=row.id) is None:
        for when, text in spec["comments"]:
            db.add(MerchSampleComment(tenant_id=tid, sample_request_id=row.id, comment=text,
                                      created_by_id=people.merchandiser.id, created_at=_dt(when, 15)))
    if await find_one(db, MerchSampleCostLine, tenant_id=tid, sample_request_id=row.id) is None:
        for line_type, label, qty, unit, rate in spec["costs"]:
            q, r = Decimal(qty), Decimal(rate)
            db.add(MerchSampleCostLine(
                tenant_id=tid, sample_request_id=row.id, line_type=line_type, label=label, qty=q, unit=unit,
                rate=r, amount=(q * r).quantize(FOUR), currency_code=CURRENCY,
                created_at=_dt(spec["requested"], 11), updated_at=_dt(spec["approved"], 17),
            ))
    if await find_one(db, MerchSampleMaterialLine, tenant_id=tid, sample_request_id=row.id) is None:
        for item_code, qty, uom, note in spec["materials"]:
            item = await require_one(db, Item, tenant_id=tid, item_code=item_code)
            db.add(MerchSampleMaterialLine(
                tenant_id=tid, sample_request_id=row.id, item_id=item.id, qty=Decimal(qty), uom=uom, notes=note,
                created_at=_dt(spec["requested"], 11), updated_at=_dt(spec["requested"], 11),
            ))
    await db.flush()
    if created:
        cost = sum(Decimal(q) * Decimal(r) for _, _, q, _, r in spec["costs"])
        ctx.log(f"Sample {row.sample_code} {spec['subtype']} ({spec['sample_type']}) approved "
                f"{spec['approved']:%d %b %Y}, rev {spec['revision_no']}, cost USD {cost:.2f}")
    return row


async def _ensure_samples(db: AsyncSession, ctx: DemoContext, order: Order, style: GarmentStyle,
                          people: People) -> dict[str, MerchSampleRequest]:
    """Lab dip, fit and PP sample for the order, linked to the original inquiry."""
    inquiry = await find_one(db, Inquiry, tenant_id=ctx.tenant_id, inquiry_code=INQUIRY_CODE)
    samples = {}
    for spec in SAMPLES:
        samples[spec["key"]] = await _ensure_sample(
            db, ctx, spec, order, style, inquiry.id if inquiry else None, people
        )
    return samples


# ---------------------------------------------------------------------------
# 5. TNA / order follow-up
# ---------------------------------------------------------------------------
@dataclass(frozen=True)
class Milestone:
    planned: date
    done: date
    submitted: date | None = None
    is_approval: bool = False
    sample_key: str | None = None
    remark: str = ""
    delay_reason: str | None = None


# Template code -> planned / actual dates for this order (codes from TNA_DEFAULT_TEMPLATE_SEED)
TNA_PLAN: dict[str, Milestone] = {
    "order_confirmed": Milestone(D["order_confirmed"], D["order_confirmed"],
                                 remark=f"Primark PO {BUYER_PO_NUMBER} received and confirmed as {ORDER_CODE}"),
    "lc_received": Milestone(date(2026, 6, 22), D["sales_contract"],
                             remark=f"Export sales contract {SALES_CONTRACT_REF} received via Eastern Bank PLC"),
    "proto_sample_submit": Milestone(D["quotation_sent"], D["quotation_sent"], submitted=D["quotation_sent"],
                                     remark=f"Proto sample sent with quotation {QUOTATION_CODE}"),
    "fit_sample_submit": Milestone(date(2026, 6, 24), date(2026, 6, 29), submitted=date(2026, 6, 24),
                                   sample_key="fit", remark="Rev 1 sent 24 Jun; rev 2 resubmitted 29 Jun",
                                   delay_reason="Rev 2 resubmission after buyer fit comments"),
    "fit_sample_approval": Milestone(date(2026, 6, 30), D["fit_sample_approved"], submitted=date(2026, 6, 29),
                                     is_approval=True, sample_key="fit", remark="Rev 2 approved on live model",
                                     delay_reason="Extra fit round – body length +1 cm on rev 1"),
    "size_set_submit": Milestone(date(2026, 7, 6), date(2026, 7, 5), submitted=date(2026, 7, 5),
                                 remark="Size set S–XXL (Black) submitted, no comments"),
    "pp_sample_submit": Milestone(date(2026, 7, 8), date(2026, 7, 8), submitted=date(2026, 7, 8),
                                  sample_key="pp", remark="2 pcs per colour in bulk fabric"),
    "pp_approval": Milestone(D["pp_sample_approved"], D["pp_sample_approved"], submitted=date(2026, 7, 8),
                             is_approval=True, sample_key="pp", remark="Red seal PP issued by Primark QA"),
    "lab_dip_approval": Milestone(date(2026, 6, 25), D["lab_dip_approved"], submitted=date(2026, 6, 20),
                                  is_approval=True, sample_key="lab_dip",
                                  remark="Black opt C, White opt A, Navy opt B approved"),
    "bulk_fabric_approval": Milestone(date(2026, 7, 17), date(2026, 7, 16), submitted=D["grn_fabric"],
                                      is_approval=True,
                                      remark="Bulk shade band & GSM (182 g/m²) approved against lab dips"),
    "accessories_approval": Milestone(date(2026, 7, 5), date(2026, 7, 4), submitted=date(2026, 7, 1),
                                      is_approval=True,
                                      remark="Trim card (labels, price ticket, polybag, carton marks) approved"),
    "fabric_in_house": Milestone(D["grn_fabric"], D["grn_fabric"],
                                 remark=f"{GRN_FABRIC_CODE}: body fabric + rib received"),
    "accessories_in_house": Milestone(D["grn_packing"], D["grn_packing"],
                                      remark=f"Trims {GRN_TRIM_CODE} ({D['grn_trims']:%d %b}) and packing "
                                             f"{GRN_PACK_CODE} ({D['grn_packing']:%d %b}) received"),
    "cutting_start": Milestone(D["cutting_start"], D["cutting_start"], remark="Bulk cutting started, 3 colours"),
    "sewing_start": Milestone(D["sewing_start"], D["sewing_start"], remark="Sewing input on line 4 (32 machines)"),
    "inline_inspection": Milestone(date(2026, 8, 10), date(2026, 8, 11),
                                   remark="Primark QA inline audit at ~40% sewing – passed",
                                   delay_reason="QA auditor visit moved by one day"),
    "final_inspection": Milestone(D["final_inspection"], D["final_inspection"],
                                  remark="Final AQL 2.5 inspection by Primark QA – passed"),
    "ex_factory": Milestone(D["ex_factory"], D["ex_factory"],
                            remark=f"Delivery challan {DELIVERY_CHALLAN_CODE}, gate pass {GATE_PASS_CODE}"),
    "shipment_docs": Milestone(D["docs_submitted"], D["docs_submitted"],
                               remark=f"B/L {BL_NUMBER}, invoice {COMMERCIAL_INVOICE_NO}, EXP {EXP_NUMBER}"),
    "shipment_confirmation": Milestone(D["buyer_delivery"], D["buyer_delivery"],
                                       remark=f"Vessel sailed {D['vessel_departure']:%d %b} from Chattogram; "
                                              "shipment advice sent to Primark"),
}

# Extra history on a few actions: (template code, date, comment)
TNA_COMMENTS = [
    ("lab_dip_approval", date(2026, 6, 20), "Lab dips couriered to Primark Dhaka office (DHL AWB 7781 2045 63)."),
    ("fit_sample_approval", date(2026, 6, 26), "Rev 1 rejected – see rejection history; rev 2 due 29 Jun."),
    ("pp_approval", D["pp_sample_approved"], "Red seal PP sample handed to line 4 supervisor."),
    ("final_inspection", D["final_inspection"], "AQL 2.5: 315 pcs checked, 2 minor, 0 major – passed."),
]
FIT_REJECTION = (date(2026, 6, 26), "Rev 1: body length 1 cm longer than spec; sleeve opening 0.5 cm tight",
                 date(2026, 6, 29))


async def _active_templates(db: AsyncSession, ctx: DemoContext) -> list[FollowupActionTemplate]:
    """Tenant TNA templates; seeds the default set when empty (same as GET /merch/followup-templates)."""
    stmt = (
        select(FollowupActionTemplate)
        .where(FollowupActionTemplate.tenant_id == ctx.tenant_id, FollowupActionTemplate.is_active.is_(True))
        .order_by(FollowupActionTemplate.sequence_no)
    )
    rows = list((await db.execute(stmt)).scalars().all())
    if rows:
        return rows
    for code, name, phase, days, seq in TNA_DEFAULT_TEMPLATE_SEED:
        db.add(FollowupActionTemplate(tenant_id=ctx.tenant_id, code=code, name=name, phase=phase,
                                      sequence_no=seq, default_days_before_delivery=days,
                                      is_mandatory=False, is_active=True))
    await db.flush()
    ctx.log(f"Seeded {len(TNA_DEFAULT_TEMPLATE_SEED)} default TNA templates")
    return list((await db.execute(stmt)).scalars().all())


async def _generate_tna(db: AsyncSession, ctx: DemoContext, order: Order) -> list[OrderFollowupAction]:
    """Same logic as POST /merch/followup-actions/generate: one action per active template."""
    created = []
    for seq, t in enumerate(await _active_templates(db, ctx), start=1):
        planned = None
        if t.default_days_before_delivery is not None and order.delivery_date:
            planned = date.fromordinal(order.delivery_date.toordinal() - t.default_days_before_delivery)
        action = OrderFollowupAction(
            tenant_id=ctx.tenant_id, order_id=order.id, template_id=t.id, sequence_no=seq, phase=t.phase,
            action_group=t.action_group, title=t.name, is_template_generated=True, is_mandatory=t.is_mandatory,
            is_active=True, planned_date=planned, status="pending", milestone_type=t.code,
            created_at=_dt(D["order_confirmed"], 15),
        )
        db.add(action)
        created.append(action)
    await db.flush()
    ctx.log(f"TNA generated for {ORDER_CODE}: {len(created)} actions from templates")
    return created


async def _ensure_tna(db: AsyncSession, ctx: DemoContext, order: Order, people: People,
                      samples: dict[str, MerchSampleRequest]) -> None:
    """Generate the TNA once, then set planned/actual dates and completion for every milestone."""
    tid = ctx.tenant_id
    stmt = (
        select(OrderFollowupAction)
        .where(OrderFollowupAction.tenant_id == tid, OrderFollowupAction.order_id == order.id)
        .order_by(OrderFollowupAction.sequence_no, OrderFollowupAction.id)
    )
    actions = list((await db.execute(stmt)).scalars().all()) or await _generate_tna(db, ctx, order)
    template_codes = dict(
        (await db.execute(select(FollowupActionTemplate.id, FollowupActionTemplate.code)
                          .where(FollowupActionTemplate.tenant_id == tid))).all()
    )

    by_code: dict[str, OrderFollowupAction] = {}
    unmapped = []
    for a in actions:
        code = (a.milestone_type or template_codes.get(a.template_id) or "").lower()
        m = TNA_PLAN.get(code)
        if m is None:
            unmapped.append(a.title)
            continue
        by_code[code] = a
        a.milestone_type = code
        a.planned_date = m.planned
        a.actual_submission_date = m.submitted
        a.approval_received_date = m.done if m.is_approval else None
        a.actual_completion_date = m.done
        a.status = "completed"
        a.approval_status = "approved"
        a.is_rejected = False
        a.delay_reason = m.delay_reason
        a.remarks = m.remark
        a.assigned_to_id = people.merchandiser.id
        a.completed_at = _dt(m.done, 17)
        a.completed_by_id = people.merchandiser.id
        if m.sample_key and m.sample_key in samples:
            a.merch_sample_request_id = samples[m.sample_key].id
        a.updated_at = a.completed_at
    await db.flush()

    fit = by_code.get("fit_sample_approval")
    if fit is not None:
        fit.resubmission_date = FIT_REJECTION[2]
        fit.rejection_reason = FIT_REJECTION[1]
        if await find_one(db, FollowupActionRejectionLog, tenant_id=tid, action_id=fit.id) is None:
            db.add(FollowupActionRejectionLog(
                tenant_id=tid, action_id=fit.id, rejected_at=_dt(FIT_REJECTION[0], 15),
                rejection_reason=FIT_REJECTION[1], resubmission_date=FIT_REJECTION[2],
                created_by_id=people.merchandiser.id, created_at=_dt(FIT_REJECTION[0], 15),
            ))
    for code, when, text in TNA_COMMENTS:
        action = by_code.get(code)
        if action and await find_one(db, FollowupActionComment, tenant_id=tid, action_id=action.id) is None:
            db.add(FollowupActionComment(tenant_id=tid, action_id=action.id, user_id=people.merchandiser.id,
                                         comment_text=text, created_at=_dt(when, 16)))
    await db.flush()

    late = sum(1 for c in by_code if TNA_PLAN[c].done > TNA_PLAN[c].planned)
    ctx.log(f"TNA {ORDER_CODE}: {len(by_code)}/{len(actions)} milestones completed "
            f"({D['order_confirmed']:%d %b} → {D['buyer_delivery']:%d %b}), {late} finished after plan date"
            + (f"; left untouched: {', '.join(unmapped)}" if unmapped else ""))


# ---------------------------------------------------------------------------
# Stage entry point
# ---------------------------------------------------------------------------
async def run(db: AsyncSession, ctx: DemoContext) -> None:
    people = await _load_people(db, ctx)
    order = await require_one(db, Order, tenant_id=ctx.tenant_id, order_code=ORDER_CODE)
    style = await require_one(db, GarmentStyle, tenant_id=ctx.tenant_id, style_code=STYLE_CODE)

    await _ensure_style_details(db, ctx, style)
    bom = await _ensure_order_bom(db, ctx, order, people)
    await _ensure_consumption_plan(db, ctx, order, bom)
    samples = await _ensure_samples(db, ctx, order, style, people)
    await _ensure_tna(db, ctx, order, people, samples)

    stage = await _advance_pipeline(db, ctx, order)
    order.bom_created_at = bom.approved_at  # pipeline stamps "now"; keep the business date
    await db.flush()
    ctx.log(f"Order {ORDER_CODE} pipeline_status={stage or order.pipeline_status}, "
            f"bom_created_at={order.bom_created_at:%d %b %Y}")
