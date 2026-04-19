"""
Interconnected demo dataset for the Lakhsma tenant (default company_code LAKH806201).

Override tenant with env: LAKHSMA_INTERCONNECTED_DEMO_COMPANY_CODE=YOURCODE

Creates (idempotent by customer_code LKH-CUST-01):
  - 2 customers (full profile fields)
  - 10 garment styles with style_image_url (public /images/*.svg)
  - 10 inquiries + inquiry_items (5 per customer)
  - 8 quotations linked to inquiries 1–8, each with full costing:
    item categories + subcategories, items, materials, CM lines, other costs, size ratios
  - 7 orders from quotations 1–7 + commercial_snapshot_json
  - 2 export proforma invoices (3 orders each: O1–O3, O4–O6)
  - 1 MasterContract SALES_CONTRACT linked to PI-1
  - 1 MasterContract EXPORT_LC + 1 BtbLc linked to PI-2 (with BtbLcAccounting)

Prerequisite: tenant row must already exist (e.g. created via Settings or seed_lakhsma.py).

Run inside Docker backend container:
  docker compose exec backend python scripts/seed_lakhsma_interconnected_demo.py
"""
from __future__ import annotations

import asyncio
import os
import secrets
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import func, select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    BtbLc,
    BtbLcAccounting,
    Currency,
    Customer,
    GarmentStyle,
    Inquiry,
    InquiryItem,
    Item,
    ItemCategory,
    ItemSubcategory,
    ItemUnit,
    MasterContract,
    Order,
    ProformaInvoice,
    ProformaInvoiceOrder,
    Quotation,
    QuotationManufacturing,
    QuotationMaterial,
    QuotationOtherCost,
    QuotationSizeRatio,
    Tenant,
)
from app.modules.orders.commercial_snapshot_service import (  # noqa: E402
    build_order_commercial_snapshot_at_conversion,
)

TARGET_COMPANY_CODE = os.environ.get(
    "LAKHSMA_INTERCONNECTED_DEMO_COMPANY_CODE", "LAKH806201"
).strip().upper()
MARKER_CUSTOMER_CODE = "LKH-CUST-01"

# Cycle public static assets (repo ships SVGs under frontend/public/images/)
STYLE_IMAGE_URLS = [
    "/images/logo.svg",
    "/images/hero-factory.svg",
    "/images/hero-bg.svg",
    "/images/tech-pattern.svg",
    "/images/ai-brain.svg",
    "/images/logo-white.svg",
    "/images/logo.svg",
    "/images/hero-factory.svg",
    "/images/hero-bg.svg",
    "/images/tech-pattern.svg",
]

MFG_HOURS_PER_DAY = 8


def _mfg_derived(
    machines: int,
    production_per_hour: float,
    production_per_day: float,
    cost_per_machine: float,
    projected_qty: int,
) -> tuple[str, str, str, str, str]:
    """Match frontend computeManufacturingLineAmounts (QuotationWorkspace)."""
    m = max(0, int(machines) or 0)
    pph = max(0.0, float(production_per_hour))
    cpm = max(0.0, float(cost_per_machine))
    prod_day = max(0.0, float(production_per_day))
    if prod_day <= 0:
        prod_day = round(pph * m * MFG_HOURS_PER_DAY)
    total_line_cost = m * cpm
    cost_per_dozen = (total_line_cost / (prod_day / 12)) if prod_day > 0 else 0.0
    cm_per_piece = cost_per_dozen / 12
    qty = max(0, int(projected_qty))
    total_order_cost = cm_per_piece * qty
    return (
        f"{total_line_cost:.2f}",
        f"{cost_per_dozen:.4f}",
        f"{cm_per_piece:.4f}",
        f"{total_order_cost:.2f}",
        f"{total_order_cost:.2f}",
    )


async def ensure_costing_masters(db, tenant_id: int) -> dict:
    """Currencies (global), item categories, subcategories, units, items for quotation costing."""
    for code, name in [("USD", "US Dollar"), ("EUR", "Euro"), ("BDT", "Bangladeshi Taka"), ("GBP", "British Pound")]:
        ex = await db.execute(select(Currency).where(Currency.code == code))
        if ex.scalar_one_or_none() is None:
            db.add(Currency(code=code, name=name))
    await db.flush()

    cat_codes = [
        ("FABRIC", "Fabric"),
        ("TRIM", "Trim"),
        ("PACK", "Packaging"),
        ("OTHER", "Other"),
    ]
    for ccode, cname in cat_codes:
        r = await db.execute(
            select(ItemCategory).where(
                ItemCategory.tenant_id == tenant_id,
                ItemCategory.category_code == ccode,
            )
        )
        if r.scalar_one_or_none() is None:
            db.add(
                ItemCategory(
                    tenant_id=tenant_id,
                    category_code=ccode,
                    name=cname,
                    description=f"{cname} category (LKH demo)",
                )
            )
    await db.flush()

    cats = (
        await db.execute(
            select(ItemCategory).where(ItemCategory.tenant_id == tenant_id).order_by(ItemCategory.category_code)
        )
    ).scalars().all()
    by_code = {c.category_code: c for c in cats}
    fabric_cat = by_code.get("FABRIC")
    trim_cat = by_code.get("TRIM")
    if not fabric_cat or not trim_cat:
        raise RuntimeError("Item categories FABRIC/TRIM missing after ensure.")

    # Subcategories (tenant-scoped demo codes)
    sub_specs = [
        (fabric_cat.id, "LKH-JERSEY", "Jersey / single knit"),
        (trim_cat.id, "LKH-SEW-TRIM", "Sewing trims"),
    ]
    for cat_id, scode, sname in sub_specs:
        r = await db.execute(
            select(ItemSubcategory).where(
                ItemSubcategory.tenant_id == tenant_id,
                ItemSubcategory.subcategory_code == scode,
            )
        )
        if r.scalar_one_or_none() is None:
            db.add(
                ItemSubcategory(
                    tenant_id=tenant_id,
                    category_id=cat_id,
                    subcategory_code=scode,
                    name=sname,
                    description="LKH interconnected demo",
                )
            )
    await db.flush()

    subs = (
        await db.execute(
            select(ItemSubcategory).where(ItemSubcategory.tenant_id == tenant_id)
        )
    ).scalars().all()
    sub_by_code = {s.subcategory_code: s for s in subs}
    sub_jersey = sub_by_code.get("LKH-JERSEY")
    sub_trim = sub_by_code.get("LKH-SEW-TRIM")
    if not sub_jersey or not sub_trim:
        raise RuntimeError("Item subcategories missing after ensure.")

    unit_specs = [
        ("KG", "Kilogram"),
        ("Yard", "Yard"),
        ("M", "Metre"),
        ("Pcs", "Pieces"),
        ("Dz", "Dozen"),
    ]
    for ucode, uname in unit_specs:
        r = await db.execute(
            select(ItemUnit).where(ItemUnit.tenant_id == tenant_id, ItemUnit.unit_code == ucode)
        )
        if r.scalar_one_or_none() is None:
            db.add(ItemUnit(tenant_id=tenant_id, unit_code=ucode, name=uname))
    await db.flush()

    units = (
        await db.execute(select(ItemUnit).where(ItemUnit.tenant_id == tenant_id))
    ).scalars().all()
    u_by = {u.unit_code: u for u in units}
    kg_u = u_by.get("KG")
    yard_u = u_by.get("Yard")
    pcs_u = u_by.get("Pcs")
    if not kg_u or not yard_u or not pcs_u:
        raise RuntimeError("Item units KG/Yard/Pcs missing after ensure.")

    item_specs = [
        (
            "LKH-FAB-JERSEY-160",
            "160 GSM cotton jersey",
            fabric_cat.id,
            sub_jersey.id,
            kg_u.id,
            "3.55",
        ),
        (
            "LKH-TRIM-RIB-1X1",
            "1x1 cotton neck rib",
            trim_cat.id,
            sub_trim.id,
            yard_u.id,
            "0.82",
        ),
        (
            "LKH-TRIM-LABEL-WVN",
            "Woven main label",
            trim_cat.id,
            sub_trim.id,
            pcs_u.id,
            "0.06",
        ),
    ]
    for icode, iname, cat_id, sub_id, uid, cost in item_specs:
        r = await db.execute(
            select(Item).where(Item.tenant_id == tenant_id, Item.item_code == icode)
        )
        if r.scalar_one_or_none() is None:
            db.add(
                Item(
                    tenant_id=tenant_id,
                    item_code=icode,
                    name=iname,
                    category_id=cat_id,
                    subcategory_id=sub_id,
                    unit_id=uid,
                    default_cost=cost,
                )
            )
    await db.flush()

    items_r = await db.execute(select(Item).where(Item.tenant_id == tenant_id))
    items_by_code = {it.item_code: it for it in items_r.scalars().all()}
    return {
        "fabric_cat": fabric_cat,
        "trim_cat": trim_cat,
        "sub_jersey": sub_jersey,
        "sub_trim": sub_trim,
        "items": items_by_code,
    }


async def attach_full_quotation_costing(
    db,
    tenant: Tenant,
    q: Quotation,
    masters: dict,
) -> None:
    """Materials, CM, other costs, size ratios; syncs quotation header rollups."""
    chk = await db.execute(
        select(QuotationMaterial).where(QuotationMaterial.quotation_id == q.id).limit(1)
    )
    if chk.scalar_one_or_none() is not None:
        return

    tid = tenant.id
    qty = int(q.projected_quantity or 0)
    dozens = qty / 12.0 if qty else 0.0
    items: dict[str, Item] = masters["items"]
    fab_cat = masters["fabric_cat"]
    trim_cat = masters["trim_cat"]

    fab = items["LKH-FAB-JERSEY-160"]
    rib = items["LKH-TRIM-RIB-1X1"]
    lbl = items["LKH-TRIM-LABEL-WVN"]

    # --- Materials (3 lines, linked to category + item) ---
    fab_cons_pc = 0.22
    fab_cons_dz = fab_cons_pc * 12
    f_up = float(fab.default_cost)
    fab_amt_dz = fab_cons_dz * f_up
    fab_total = fab_amt_dz * dozens if dozens else fab_amt_dz

    db.add(
        QuotationMaterial(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=1,
            category_id=fab_cat.id,
            item_id=fab.id,
            description="Main body – 160 GSM combed cotton jersey",
            unit="KG",
            consumption_per_dozen=f"{fab_cons_dz:.4f}",
            unit_price=f"{f_up:.4f}",
            amount_per_dozen=f"{fab_amt_dz:.4f}",
            total_amount=f"{fab_total:.2f}",
            currency="USD",
            exchange_rate="1",
            base_amount=f"{fab_total:.2f}",
            local_amount=f"{fab_total:.2f}",
        )
    )

    rib_cons_pc = 0.055
    rib_cons_dz = rib_cons_pc * 12
    r_up = float(rib.default_cost)
    rib_amt_dz = rib_cons_dz * r_up
    rib_total = rib_amt_dz * dozens if dozens else rib_amt_dz

    db.add(
        QuotationMaterial(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=2,
            category_id=trim_cat.id,
            item_id=rib.id,
            description="Neck opening – 1x1 rib",
            unit="Yard",
            consumption_per_dozen=f"{rib_cons_dz:.4f}",
            unit_price=f"{r_up:.4f}",
            amount_per_dozen=f"{rib_amt_dz:.4f}",
            total_amount=f"{rib_total:.2f}",
            currency="USD",
            exchange_rate="1",
            base_amount=f"{rib_total:.2f}",
            local_amount=f"{rib_total:.2f}",
        )
    )

    lbl_cons_pc = 1.0
    lbl_cons_dz = lbl_cons_pc * 12
    l_up = float(lbl.default_cost)
    lbl_amt_dz = lbl_cons_dz * l_up
    lbl_total = lbl_amt_dz * dozens if dozens else lbl_amt_dz

    db.add(
        QuotationMaterial(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=3,
            category_id=trim_cat.id,
            item_id=lbl.id,
            description="Woven main label (per piece)",
            unit="Pcs",
            consumption_per_dozen=f"{lbl_cons_dz:.4f}",
            unit_price=f"{l_up:.4f}",
            amount_per_dozen=f"{lbl_amt_dz:.4f}",
            total_amount=f"{lbl_total:.2f}",
            currency="USD",
            exchange_rate="1",
            base_amount=f"{lbl_total:.2f}",
            local_amount=f"{lbl_total:.2f}",
        )
    )

    material_total = fab_total + rib_total + lbl_total

    # --- Manufacturing (2 lines) ---
    tlc1, cpd1, cpp1, toc1, ba1 = _mfg_derived(18, 600, 4800, 2.5, qty)
    db.add(
        QuotationManufacturing(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=1,
            style_part="Cutting & main assembly line",
            machines_required=18,
            production_per_hour="600",
            production_per_day="4800",
            cost_per_machine="2.50",
            total_line_cost=tlc1,
            cost_per_dozen=cpd1,
            cm_per_piece=cpp1,
            total_order_cost=toc1,
            currency="USD",
            exchange_rate="1",
            base_amount=ba1,
            local_amount=ba1,
        )
    )
    tlc2, cpd2, cpp2, toc2, ba2 = _mfg_derived(8, 420, 0, 1.85, qty)
    db.add(
        QuotationManufacturing(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=2,
            style_part="Finishing, QC & flat packing",
            machines_required=8,
            production_per_hour="420",
            production_per_day="0",
            cost_per_machine="1.85",
            total_line_cost=tlc2,
            cost_per_dozen=cpd2,
            cm_per_piece=cpp2,
            total_order_cost=toc2,
            currency="USD",
            exchange_rate="1",
            base_amount=ba2,
            local_amount=ba2,
        )
    )

    mfg_total = float(toc1) + float(toc2)
    subtotal_mat_mfg = material_total + mfg_total

    # --- Other commercial costs (4 lines) ---
    oh_pct = 5.5
    oh_amt = subtotal_mat_mfg * oh_pct / 100.0
    db.add(
        QuotationOtherCost(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=1,
            cost_head="Factory overhead & utilities",
            percentage=f"{oh_pct:.2f}",
            total_amount=f"{oh_amt:.2f}",
            cost_type="percentage",
            value=f"{oh_pct:.2f}",
            based_on="subtotal",
            calculated_amount=f"{oh_amt:.2f}",
            notes="Applied on materials + CM subtotal",
            currency="USD",
            exchange_rate="1",
            base_amount=f"{oh_amt:.2f}",
            local_amount=f"{oh_amt:.2f}",
        )
    )

    wash_fixed = 380.0
    db.add(
        QuotationOtherCost(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=2,
            cost_head="Washing / finishing (lot charge)",
            percentage="0",
            total_amount=f"{wash_fixed:.2f}",
            cost_type="fixed",
            value=f"{wash_fixed:.2f}",
            based_on="subtotal",
            calculated_amount=f"{wash_fixed:.2f}",
            notes="Per-style wash trial + bulk finishing",
            currency="USD",
            exchange_rate="1",
            base_amount=f"{wash_fixed:.2f}",
            local_amount=f"{wash_fixed:.2f}",
        )
    )

    log_pct = 2.25
    log_amt = material_total * log_pct / 100.0
    db.add(
        QuotationOtherCost(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=3,
            cost_head="Inbound logistics & handling (fabric)",
            percentage=f"{log_pct:.2f}",
            total_amount=f"{log_amt:.2f}",
            cost_type="percentage",
            value=f"{log_pct:.2f}",
            based_on="subtotal",
            calculated_amount=f"{log_amt:.2f}",
            notes="% of material subtotal",
            currency="USD",
            exchange_rate="1",
            base_amount=f"{log_amt:.2f}",
            local_amount=f"{log_amt:.2f}",
        )
    )

    bank_fixed = 165.0
    db.add(
        QuotationOtherCost(
            tenant_id=tid,
            quotation_id=q.id,
            serial_no=4,
            cost_head="Bank / documentation charges",
            percentage="0",
            total_amount=f"{bank_fixed:.2f}",
            cost_type="fixed",
            value=f"{bank_fixed:.2f}",
            based_on="subtotal",
            calculated_amount=f"{bank_fixed:.2f}",
            notes="LC amendment + export docs",
            currency="USD",
            exchange_rate="1",
            base_amount=f"{bank_fixed:.2f}",
            local_amount=f"{bank_fixed:.2f}",
        )
    )

    other_total = oh_amt + wash_fixed + log_amt + bank_fixed

    # --- Size ratios ---
    sizes = [("XS", 10), ("S", 25), ("M", 35), ("L", 22), ("XL", 8)]
    for idx, (size_code, pct) in enumerate(sizes, start=1):
        db.add(
            QuotationSizeRatio(
                tenant_id=tid,
                quotation_id=q.id,
                serial_no=idx,
                size=size_code,
                ratio_percentage=f"{pct:.2f}",
                fabric_factor="1.0" if size_code in ("S", "M") else "1.02",
                quantity=int(qty * pct / 100.0),
            )
        )

    grand_total = material_total + mfg_total + other_total
    cost_per_piece = grand_total / qty if qty else grand_total
    profit_pct = 12.0
    quoted_per_pc = cost_per_piece * (1 + profit_pct / 100.0)

    q.material_cost = f"{material_total:.2f}"
    q.manufacturing_cost = f"{mfg_total:.2f}"
    q.other_cost = f"{other_total:.2f}"
    q.total_cost = f"{grand_total:.2f}"
    q.cost_per_piece = f"{cost_per_piece:.4f}"
    q.profit_percentage = f"{profit_pct:.1f}"
    q.quoted_price = f"{quoted_per_pc:.4f}"
    q.total_amount = f"{(quoted_per_pc * qty):.2f}" if qty else f"{quoted_per_pc:.2f}"
    q.size_ratio_enabled = True
    q.pack_ratio = "10 / 25 / 35 / 22 / 8"
    q.pcs_per_carton = 24
    q.commission_mode = q.commission_mode or "PERCENT"
    q.commission_type = q.commission_type or "ON_NET"
    if q.commission_value is None:
        q.commission_value = 5.0

    await db.flush()


async def backfill_lkh_quotation_costing(db, tenant: Tenant) -> int:
    """For existing LKH-QUO-* rows missing material lines, add full costing and refresh order snapshots."""
    masters = await ensure_costing_masters(db, tenant.id)
    r = await db.execute(
        select(Quotation)
        .where(
            Quotation.tenant_id == tenant.id,
            Quotation.quotation_code.like("LKH-QUO-%"),
        )
        .order_by(Quotation.id)
    )
    quotes = list(r.scalars().all())
    n = 0
    for q in quotes:
        chk = await db.execute(
            select(QuotationMaterial).where(QuotationMaterial.quotation_id == q.id).limit(1)
        )
        if chk.scalar_one_or_none() is None:
            await attach_full_quotation_costing(db, tenant, q, masters)
            n += 1

    if n:
        oq = await db.execute(
            select(Order).where(Order.tenant_id == tenant.id, Order.quotation_id.isnot(None))
        )
        for o in oq.scalars().all():
            qq = await db.get(Quotation, o.quotation_id)
            if qq and (qq.quotation_code or "").startswith("LKH-QUO"):
                o.commercial_snapshot_json = build_order_commercial_snapshot_at_conversion(
                    qq, tenant=tenant
                )
        await db.flush()
    return n


async def get_target_tenant(db) -> Tenant:
    result = await db.execute(select(Tenant).where(Tenant.company_code == TARGET_COMPANY_CODE))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise RuntimeError(
            f"Tenant with company_code {TARGET_COMPANY_CODE!r} not found. "
            "Create the tenant first or set LAKHSMA_INTERCONNECTED_DEMO_COMPANY_CODE."
        )
    return tenant


def _today() -> date:
    return date.today()


def _delivery() -> date:
    t = _today()
    m = t.month + 4
    y = t.year
    while m > 12:
        m -= 12
        y += 1
    return t.replace(year=y, month=m, day=min(t.day, 28))


async def seed_interconnected_demo(db) -> None:
    tenant = await get_target_tenant(db)

    existing = await db.execute(
        select(Customer).where(
            Customer.tenant_id == tenant.id,
            Customer.customer_code == MARKER_CUSTOMER_CODE,
        )
    )
    if existing.scalar_one_or_none():
        filled = await backfill_lkh_quotation_costing(db, tenant)
        await db.commit()
        print(
            f"Lakhsma interconnected demo already present ({MARKER_CUSTOMER_CODE}). "
            f"Quotation costing backfill: {filled} quotation(s) updated."
        )
        return

    today = _today()
    deliv = _delivery()

    # --- 2 Customers (full fields) ---
    cust_a = Customer(
        tenant_id=tenant.id,
        customer_code="LKH-CUST-01",
        name="Atlantic Retail GmbH",
        legal_entity_name="Atlantic Retail GmbH",
        trade_name="Atlantic Retail",
        address="Industriestrasse 42, 60314 Frankfurt, Germany",
        country="Germany",
        email="buying@atlantic-retail.de",
        phone="+49-69-11223344",
        website="https://atlantic-retail.example.com",
        tax_id_vat_number="DE123456789",
        customer_type="Export Buyer",
        status="active",
        primary_contact_name="Anna Mueller",
        designation="Head of Sourcing",
        contact_email="a.mueller@atlantic-retail.de",
        contact_phone="+49-69-11223345",
        phone_country_code="+49",
        subscribe_newsletter=False,
        billing_address_line1="Industriestrasse 42",
        billing_city="Frankfurt",
        billing_postal_code="60314",
        billing_country="Germany",
        shipping_address_line1="Logistikweg 7",
        shipping_city="Hamburg",
        shipping_postal_code="20457",
        shipping_country="Germany",
        same_as_billing=False,
        preferred_currency="USD",
    )
    cust_b = Customer(
        tenant_id=tenant.id,
        customer_code="LKH-CUST-02",
        name="Pacific Apparel Inc.",
        legal_entity_name="Pacific Apparel Incorporated",
        trade_name="Pacific Apparel",
        address="450 Fashion Ave, New York, NY 10018, USA",
        country="United States",
        email="merchandising@pacific-apparel.example.com",
        phone="+1-212-555-0199",
        website="https://pacific-apparel.example.com",
        tax_id_vat_number="US-12-3456789",
        customer_type="Export Buyer",
        status="active",
        primary_contact_name="James Chen",
        designation="VP Merchandising",
        contact_email="j.chen@pacific-apparel.example.com",
        contact_phone="+1-212-555-0200",
        phone_country_code="+1",
        subscribe_newsletter=True,
        billing_address_line1="450 Fashion Ave",
        billing_city="New York",
        billing_postal_code="10018",
        billing_country="United States",
        shipping_address_line1="220 Harbor Blvd",
        shipping_city="Los Angeles",
        shipping_postal_code="90031",
        shipping_country="United States",
        same_as_billing=False,
        preferred_currency="USD",
    )
    db.add_all([cust_a, cust_b])
    await db.flush()

    # --- 10 Styles ---
    departments = ["Knit", "Woven", "Fleece", "Intimate", "Denim"] * 2
    styles: list[GarmentStyle] = []
    for i in range(10):
        n = i + 1
        code = f"LKH-STY-{n:02d}"
        styles.append(
            GarmentStyle(
                tenant_id=tenant.id,
                style_code=code,
                name=f"Demo Style {n} – {departments[i]} collection",
                buyer_customer_id=cust_a.id if n <= 5 else cust_b.id,
                season="SS26" if n % 2 else "AW26",
                department=departments[i],
                product_type="Underwear" if i % 3 == 0 else "Active Tee",
                fabric_type="Single jersey 160 GSM cotton" if i % 2 == 0 else "CVC fleece 280 GSM",
                gsm="160" if i % 2 == 0 else "280",
                fit_type="Regular",
                wash_type="Enzyme wash",
                brand="Lakhsma Demo",
                buyer_style_ref=f"BYR-REF-{n:04d}",
                hs_code="6109.10.00",
                uom="PCS",
                target_fob=f"{4.2 + i * 0.15:.2f}",
                currency="USD",
                sample_lead_days=14,
                production_lead_days=90,
                is_active_for_new_orders=True,
                lifecycle_stage="DEVELOPMENT",
                priority="P1",
                risk_level="LOW",
                style_image_url=STYLE_IMAGE_URLS[i],
                status="ACTIVE",
                notes=f"Seeded interconnected demo style {n}.",
            )
        )
    db.add_all(styles)
    await db.flush()

    # --- 10 Inquiries + items ---
    customer_for_inq = [cust_a] * 5 + [cust_b] * 5
    base_qty = 8000
    inquiries: list[Inquiry] = []
    for i in range(10):
        n = i + 1
        st = styles[i]
        c = customer_for_inq[i]
        qty = base_qty + i * 500
        tp = f"{4.5 + i * 0.2:.2f}"
        status = "WON" if n <= 7 else ("WON" if n == 8 else "SUBMITTED")
        inq = Inquiry(
            tenant_id=tenant.id,
            customer_id=c.id,
            inquiry_code=f"LKH-INQ-{n:02d}",
            style_ref=st.style_code,
            style_id=st.id,
            season=st.season,
            department=st.department,
            quantity=qty,
            target_price=tp,
            target_price_currency="USD",
            currency="USD",
            exchange_rate="1.00",
            expected_delivery_date=deliv,
            shipping_term="FOB",
            commission_mode="PERCENT",
            commission_type="ON_NET",
            commission_value=5.0,
            status=status,
            notes=f"Full-field demo inquiry {n}. Buyer target {tp} USD FOB Chittagong.",
        )
        inquiries.append(inq)
    db.add_all(inquiries)
    await db.flush()

    for inq in inquiries:
        db.add_all(
            [
                InquiryItem(
                    tenant_id=tenant.id,
                    inquiry_id=inq.id,
                    item_name="Main body fabric",
                    description="As per approved quality and GSM.",
                    quantity=inq.quantity,
                    sort_order=1,
                ),
                InquiryItem(
                    tenant_id=tenant.id,
                    inquiry_id=inq.id,
                    item_name="Trims & accessories",
                    description="Zippers, labels, threads per BOM.",
                    quantity=inq.quantity,
                    sort_order=2,
                ),
            ]
        )
    await db.flush()

    # --- 8 Quotations (inquiries 1–8) ---
    quotations: list[Quotation] = []
    for i in range(8):
        n = i + 1
        inq = inquiries[i]
        st = styles[i]
        q_qty = inq.quantity or 0
        unit = float(inq.target_price) if inq.target_price is not None else 5.0
        total_amt = f"{q_qty * unit:.2f}"
        q = Quotation(
            tenant_id=tenant.id,
            customer_id=inq.customer_id,
            inquiry_id=inq.id,
            quotation_code=f"LKH-QUO-{n:02d}",
            style_ref=st.style_code,
            style_id=st.id,
            department=st.department,
            projected_quantity=q_qty,
            projected_delivery_date=deliv,
            quotation_date=today,
            target_price=inq.target_price,
            target_price_currency="USD",
            exchange_rate="1.00",
            material_cost=f"{unit * 0.55 * q_qty:.2f}",
            manufacturing_cost=f"{unit * 0.25 * q_qty:.2f}",
            other_cost=f"{unit * 0.05 * q_qty:.2f}",
            total_cost=f"{unit * 0.85 * q_qty:.2f}",
            cost_per_piece=f"{unit * 0.85:.2f}",
            profit_percentage="12",
            quoted_price=f"{unit:.2f}",
            shipping_term="FOB Chittagong",
            commission_mode="PERCENT",
            commission_type="ON_NET",
            commission_value=5.0,
            currency="USD",
            total_amount=total_amt,
            status="APPROVED",
            version_no=1,
            valid_until=today.replace(year=today.year + 1),
            notes=f"Approved quotation for {inq.inquiry_code}. Linked style {st.style_code}.",
        )
        quotations.append(q)
    db.add_all(quotations)
    await db.flush()

    # --- Costing masters + full quotation lines (materials, CM, other, size ratios) ---
    masters = await ensure_costing_masters(db, tenant.id)
    for q in quotations:
        await attach_full_quotation_costing(db, tenant, q, masters)

    # --- 7 Orders (quotations 1–7) ---
    orders: list[Order] = []
    for i in range(7):
        n = i + 1
        q = quotations[i]
        inq = inquiries[i]
        st = styles[i]
        snap = build_order_commercial_snapshot_at_conversion(q, tenant=tenant)
        o = Order(
            tenant_id=tenant.id,
            customer_id=q.customer_id,
            quotation_id=q.id,
            order_code=f"LKH-ORD-{n:02d}",
            style_ref=st.style_code,
            shipping_term=q.shipping_term,
            commission_mode=q.commission_mode,
            commission_type=q.commission_type,
            commission_value=q.commission_value,
            order_date=today,
            delivery_date=deliv,
            quantity=inq.quantity,
            status="CONFIRMED",
            remarks=f"Converted from {q.quotation_code} for interconnected demo.",
            commercial_snapshot_json=snap,
        )
        orders.append(o)
    db.add_all(orders)
    await db.flush()

    # --- Master contracts ---
    mc_sales = MasterContract(
        tenant_id=tenant.id,
        contract_type="SALES_CONTRACT",
        reference="LKH-SALES-CONTRACT-DEMO-01",
        status="ISSUED",
        contract_date=today,
        amount=500000.00,
        currency="USD",
        buyer_name=cust_a.name,
        bank_name="Standard Chartered Bank",
        expiry_date=today.replace(year=today.year + 1),
    )
    mc_export = MasterContract(
        tenant_id=tenant.id,
        contract_type="EXPORT_LC",
        reference="LKH-MASTER-EXPORT-LC-DEMO-01",
        status="OPEN",
        contract_date=today,
        amount=1000000.00,
        currency="USD",
        buyer_name=cust_b.name,
        bank_name="Citibank N.A.",
        expiry_date=today.replace(year=today.year + 1),
        btb_utilized_amount=0,
    )
    db.add_all([mc_sales, mc_export])
    await db.flush()

    token1 = secrets.token_urlsafe(32)
    token2 = secrets.token_urlsafe(32)

    amt1 = sum(float(orders[i].quantity or 0) * float(quotations[i].quoted_price or "0") for i in range(3))
    amt2 = sum(float(orders[i].quantity or 0) * float(quotations[i + 3].quoted_price or "0") for i in range(3))

    pi1 = ProformaInvoice(
        tenant_id=tenant.id,
        direction="EXPORT",
        master_contract_id=mc_sales.id,
        reference="LKH-PI-DEMO-01",
        status="ISSUED",
        invoice_date=today,
        amount=amt1,
        buyer_name=cust_a.name,
        buyer_address=cust_a.address or "",
        buyer_bank_details="Deutsche Bank AG, Frankfurt. IBAN DE89 3704 0044 0532 0130 00",
        consignee_name=cust_a.trade_name or cust_a.name,
        consignee_address=cust_a.shipping_address_line1 or cust_a.address,
        notify_party_name="Lakhsma Innerwear Limited",
        notify_party_address="Dhaka Export Processing Zone, Bangladesh",
        beneficiary_name="Lakhsma Innerwear Limited",
        beneficiary_address="Factory Road, Narayanganj, Bangladesh",
        terms_of_shipping="FOB",
        terms_of_payment="TT against documents",
        currency="USD",
        shipping_country="Bangladesh",
        destination_port_or_airport="Hamburg Port",
        shipment_port="Chittagong Port",
        documents_to_provide=[
            "Commercial Invoice",
            "Packing List",
            "Bill of Lading",
            "Certificate of Origin",
        ],
        terms_and_conditions=[
            "Goods as per confirmed order and approved samples.",
            "Sales contract LKH-SALES-CONTRACT-DEMO-01 applies.",
        ],
        shipper_bank_name="Eastern Bank PLC",
        shipper_bank_branch="EPZ Branch",
        shipper_bank_account_number="110099887766",
        shipper_bank_account_name="Lakhsma Innerwear Limited",
        shipper_bank_address="Dhaka, Bangladesh",
        shipper_bank_swift="EBLDBDDH",
        verification_token=token1,
    )
    pi2 = ProformaInvoice(
        tenant_id=tenant.id,
        direction="EXPORT",
        reference="LKH-PI-DEMO-02",
        status="ISSUED",
        invoice_date=today,
        amount=amt2,
        buyer_name=cust_b.name,
        buyer_address=cust_b.address or "",
        buyer_bank_details="JPMorgan Chase Bank, New York. A/C 9988776655",
        consignee_name=cust_b.trade_name or cust_b.name,
        consignee_address=cust_b.shipping_address_line1 or cust_b.address,
        notify_party_name="Lakhsma Innerwear Limited",
        notify_party_address="Dhaka, Bangladesh",
        beneficiary_name="Lakhsma Innerwear Limited",
        beneficiary_address="Factory Road, Narayanganj, Bangladesh",
        terms_of_shipping="FOB",
        terms_of_payment="LC at sight",
        currency="USD",
        shipping_country="Bangladesh",
        destination_port_or_airport="Los Angeles Port",
        shipment_port="Chittagong Port",
        documents_to_provide=[
            "Commercial Invoice",
            "Packing List",
            "Bill of Lading",
            "Certificate of Origin",
            "Inspection Certificate",
        ],
        terms_and_conditions=[
            "Shipment schedule as per PI.",
            "BTB LC to follow master export LC.",
        ],
        shipper_bank_name="BRAC Bank PLC",
        shipper_bank_branch="Gulshan",
        shipper_bank_account_number="445566778899",
        shipper_bank_account_name="Lakhsma Innerwear Limited",
        shipper_bank_address="Gulshan, Dhaka",
        shipper_bank_swift="BRAKBDDH",
        verification_token=token2,
    )
    db.add_all([pi1, pi2])
    await db.flush()

    # Link PI to orders (3 + 3)
    db.add_all(
        [
            ProformaInvoiceOrder(proforma_invoice_id=pi1.id, order_id=orders[0].id, sort_order=0),
            ProformaInvoiceOrder(proforma_invoice_id=pi1.id, order_id=orders[1].id, sort_order=1),
            ProformaInvoiceOrder(proforma_invoice_id=pi1.id, order_id=orders[2].id, sort_order=2),
            ProformaInvoiceOrder(proforma_invoice_id=pi2.id, order_id=orders[3].id, sort_order=0),
            ProformaInvoiceOrder(proforma_invoice_id=pi2.id, order_id=orders[4].id, sort_order=1),
            ProformaInvoiceOrder(proforma_invoice_id=pi2.id, order_id=orders[5].id, sort_order=2),
        ]
    )

    btb_amount = float(amt2)
    btb = BtbLc(
        tenant_id=tenant.id,
        reference="LKH-BTB-LC-DEMO-01",
        status="ISSUED",
        lc_date=today,
        amount=btb_amount,
        master_contract_id=mc_export.id,
        proforma_invoice_id=pi2.id,
        currency="USD",
        open_date=today,
        expiry_date=today.replace(year=today.year + 1),
        maturity_date=today.replace(year=today.year + 1, month=6, day=30),
        maturity_amount=btb_amount,
        exchange_rate_to_base=110.0,
        base_currency_amount=btb_amount * 110.0,
    )
    db.add(btb)
    await db.flush()

    acc = BtbLcAccounting(
        tenant_id=tenant.id,
        btb_lc_id=btb.id,
        status="OPEN",
        maturity_date=btb.maturity_date,
    )
    db.add(acc)

    # Recompute utilization on export master contract
    result = await db.execute(
        select(func.coalesce(func.sum(BtbLc.amount), 0)).where(
            BtbLc.master_contract_id == mc_export.id,
            BtbLc.tenant_id == tenant.id,
        )
    )
    mc_export.btb_utilized_amount = result.scalar() or 0

    await db.commit()

    print("Lakhsma interconnected demo seeded successfully.")
    print(f"  Tenant: {tenant.name} ({TARGET_COMPANY_CODE}) id={tenant.id}")
    print(f"  Customers: {cust_a.customer_code}, {cust_b.customer_code}")
    print(f"  Styles: LKH-STY-01 .. LKH-STY-10 (with images)")
    print(f"  Inquiries: LKH-INQ-01 .. LKH-INQ-10")
    print(f"  Quotations: LKH-QUO-01 .. LKH-QUO-08 (full costing + size ratios; QUO-08 has no order)")
    print(f"  Orders: LKH-ORD-01 .. LKH-ORD-07 (ORD-07 not on PI)")
    print(f"  PI: {pi1.reference} (sales contract {mc_sales.reference}), {pi2.reference} (BTB LC {btb.reference})")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await seed_interconnected_demo(db)


if __name__ == "__main__":
    asyncio.run(main())
