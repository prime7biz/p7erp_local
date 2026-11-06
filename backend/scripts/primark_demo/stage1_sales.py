"""Stage 1 – Sales: materials master, style, inquiry, quotation (full costing), order, PI, sales contract."""
from __future__ import annotations

import secrets
from datetime import datetime, time
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import (
    Currency,
    GarmentStyle,
    Inquiry,
    InquiryItem,
    Item,
    ItemCategory,
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
)
from app.models.order_matrix import OrderColorSizeLine
from app.modules.orders.commercial_snapshot_service import (
    build_order_commercial_snapshot_at_conversion,
)

from primark_demo.common import (
    BUYER_PO_NUMBER,
    COLORS,
    CURRENCY,
    D,
    FINAL_DESTINATION,
    FINISHED_GOOD_CODE,
    FINISHED_GOOD_NAME,
    HS_CODE,
    INQUIRY_CODE,
    MATERIALS,
    ORDER_CODE,
    ORDER_QTY,
    ORDER_VALUE_USD,
    PCS_PER_CARTON,
    PI_REFERENCE,
    PORT_OF_DISCHARGE,
    PORT_OF_LOADING,
    QUOTATION_CODE,
    SALES_CONTRACT_REF,
    SEASON,
    SHIPPING_TERM,
    SIZE_RATIO,
    STYLE_CODE,
    UNIT_PRICE_USD,
    DemoContext,
    color_size_matrix,
    find_one,
)

FOUR = Decimal("0.0001")
TWO = Decimal("0.01")


def _dt(d) -> datetime:
    return datetime.combine(d, time(10, 0))


async def _ensure_masters(db: AsyncSession, ctx: DemoContext) -> dict[str, Item]:
    tid = ctx.tenant_id
    for code, name in [("USD", "US Dollar"), ("BDT", "Bangladeshi Taka"), ("GBP", "British Pound"), ("EUR", "Euro")]:
        if await find_one(db, Currency, code=code) is None:
            db.add(Currency(code=code, name=name))

    if await find_one(db, ItemCategory, tenant_id=tid, category_code="FG") is None:
        db.add(ItemCategory(tenant_id=tid, category_code="FG", name="Finished Goods",
                            description="Finished garments ready for export"))
    if await find_one(db, ItemUnit, tenant_id=tid, unit_code="Cone") is None:
        db.add(ItemUnit(tenant_id=tid, unit_code="Cone", name="Cone"))
    await db.flush()

    items: dict[str, Item] = {}
    specs = [(m.code, m.name, m.category_code, m.unit_code, m.unit_price) for m in MATERIALS]
    specs.append((FINISHED_GOOD_CODE, FINISHED_GOOD_NAME, "FG", "Pcs", UNIT_PRICE_USD))
    for code, name, cat_code, unit_code, price in specs:
        item = await find_one(db, Item, tenant_id=tid, item_code=code)
        if item is None:
            cat = await find_one(db, ItemCategory, tenant_id=tid, category_code=cat_code)
            unit = await find_one(db, ItemUnit, tenant_id=tid, unit_code=unit_code)
            item = Item(
                tenant_id=tid,
                item_code=code,
                name=name,
                description=f"Primark {STYLE_CODE} material",
                category_id=cat.id,
                unit_id=unit.id,
                base_unit=unit_code,
                default_cost=price,
                standard_price=price,
                hsn_code=HS_CODE if cat_code == "FG" else None,
            )
            db.add(item)
            await db.flush()
        items[code] = item
    ctx.log(f"Materials master ready: {len(items)} items ({', '.join(items)})")
    return items


async def _ensure_style(db: AsyncSession, ctx: DemoContext) -> GarmentStyle:
    style = await find_one(db, GarmentStyle, tenant_id=ctx.tenant_id, style_code=STYLE_CODE)
    if style:
        return style
    style = GarmentStyle(
        tenant_id=ctx.tenant_id,
        style_code=STYLE_CODE,
        name="Men's organic cotton crew-neck T-shirt with chest print",
        buyer_customer_id=ctx.customer.id,
        season=SEASON,
        department="Menswear – Basics",
        product_type="Knit T-shirt",
        fabric_type="100% organic cotton single jersey",
        gsm="180",
        fit_type="Regular",
        wash_type="Softener wash",
        brand="Primark Cares",
        buyer_style_ref="PK-MTEE-AW26-0417",
        hs_code=HS_CODE,
        uom="PCS",
        target_fob=Decimal("1.55"),
        currency=CURRENCY,
        sample_lead_days=21,
        production_lead_days=75,
        is_active_for_new_orders=True,
        lifecycle_stage="PRODUCTION",
        priority="P1",
        risk_level="LOW",
        style_image_url="/images/hero-factory.svg",
        status="ACTIVE",
        notes="Short-sleeve crew neck, 1x1 rib neckband, single-colour water-based chest print "
              "(job work). Colours Black / White / Navy, sizes S–XXL.",
    )
    db.add(style)
    await db.flush()
    ctx.log(f"Style {STYLE_CODE} created")
    return style


async def _ensure_inquiry(db: AsyncSession, ctx: DemoContext, style: GarmentStyle) -> Inquiry:
    inq = await find_one(db, Inquiry, tenant_id=ctx.tenant_id, inquiry_code=INQUIRY_CODE)
    if inq:
        return inq
    inq = Inquiry(
        tenant_id=ctx.tenant_id,
        customer_id=ctx.customer.id,
        inquiry_code=INQUIRY_CODE,
        style_ref=STYLE_CODE,
        style_id=style.id,
        season=SEASON,
        department=style.department,
        quantity=ORDER_QTY,
        target_price=Decimal("1.55"),
        target_price_currency=CURRENCY,
        currency=CURRENCY,
        exchange_rate=Decimal("1"),
        expected_delivery_date=D["buyer_delivery"],
        shipping_term=SHIPPING_TERM,
        status="WON",
        notes=f"Received {D['inquiry_received']:%d %b %Y} by e-mail from Primark Menswear buying team. "
              "24,000 pcs men's organic crew-neck tee, 3 colours, S–XXL, target USD 1.55 FOB.",
        created_at=_dt(D["inquiry_received"]),
    )
    db.add(inq)
    await db.flush()
    db.add_all([
        InquiryItem(tenant_id=ctx.tenant_id, inquiry_id=inq.id, sort_order=1,
                    item_name="Body fabric – 180 GSM organic cotton single jersey",
                    description="GOTS / OCS certified, reactive dyed Black, White, Navy", quantity=ORDER_QTY),
        InquiryItem(tenant_id=ctx.tenant_id, inquiry_id=inq.id, sort_order=2,
                    item_name="Chest print", description="1-colour water-based screen print, 22 x 8 cm",
                    quantity=ORDER_QTY),
        InquiryItem(tenant_id=ctx.tenant_id, inquiry_id=inq.id, sort_order=3,
                    item_name="Trims & packing", description="Main label, care label, price ticket, polybag, "
                    f"export carton {PCS_PER_CARTON} pcs", quantity=ORDER_QTY),
    ])
    await db.flush()
    ctx.log(f"Inquiry {INQUIRY_CODE} created")
    return inq


def _mfg_line(machines: int, prod_day: int, cost_per_machine: Decimal) -> tuple[Decimal, Decimal, Decimal, Decimal]:
    total_line = Decimal(machines) * cost_per_machine
    per_dozen = total_line / (Decimal(prod_day) / 12)
    per_pc = per_dozen / 12
    return total_line.quantize(TWO), per_dozen.quantize(FOUR), per_pc.quantize(FOUR), (per_pc * ORDER_QTY).quantize(TWO)


async def _ensure_quotation(db, ctx, inq: Inquiry, style: GarmentStyle, items: dict[str, Item]) -> Quotation:
    q = await find_one(db, Quotation, tenant_id=ctx.tenant_id, quotation_code=QUOTATION_CODE)
    if q:
        return q
    tid = ctx.tenant_id
    q = Quotation(
        tenant_id=tid,
        customer_id=ctx.customer.id,
        inquiry_id=inq.id,
        quotation_code=QUOTATION_CODE,
        style_ref=STYLE_CODE,
        style_id=style.id,
        department=style.department,
        projected_quantity=ORDER_QTY,
        projected_delivery_date=D["buyer_delivery"],
        quotation_date=D["quotation_sent"],
        target_price=Decimal("1.55"),
        target_price_currency=CURRENCY,
        exchange_rate=Decimal("1"),
        shipping_term=SHIPPING_TERM,
        currency=CURRENCY,
        status="APPROVED",
        version_no=1,
        valid_until=D["quotation_sent"].replace(month=D["quotation_sent"].month + 2),
        size_ratio_enabled=True,
        pack_ratio=" / ".join(str(p) for _, p in SIZE_RATIO),
        pcs_per_carton=PCS_PER_CARTON,
        notes=f"Approved by Primark on {D['quotation_approved']:%d %b %Y}. Price USD {UNIT_PRICE_USD}/pc FOB.",
        created_at=_dt(D["quotation_sent"]),
    )
    db.add(q)
    await db.flush()

    cats = {c: await find_one(db, ItemCategory, tenant_id=tid, category_code=c) for c in ("FABRIC", "TRIM", "PACK")}
    material_total = Decimal("0")
    for serial, m in enumerate(MATERIALS, start=1):
        cons_dz = (m.consumption_per_pc * 12 * (1 + m.wastage_pct / 100)).quantize(FOUR)
        amt_dz = (cons_dz * m.unit_price).quantize(FOUR)
        total = (amt_dz * ORDER_QTY / 12).quantize(TWO)
        material_total += total
        db.add(QuotationMaterial(
            tenant_id=tid, quotation_id=q.id, serial_no=serial,
            category_id=cats[m.category_code].id, item_id=items[m.code].id,
            description=f"{m.name} (incl. {m.wastage_pct}% wastage)", unit=m.unit_code,
            consumption_per_dozen=cons_dz, unit_price=m.unit_price, amount_per_dozen=amt_dz,
            total_amount=total, currency=CURRENCY, exchange_rate=Decimal("1"),
            base_amount=total, local_amount=total,
        ))

    mfg_total = Decimal("0")
    for serial, (part, machines, prod_day, cpm) in enumerate([
        ("Cutting, sewing (32-machine line, 1,600 pcs/day)", 32, 1600, Decimal("25.00")),
        ("Finishing, ironing, QC & packing", 10, 1600, Decimal("8.00")),
    ], start=1):
        line_cost, per_dz, per_pc, order_cost = _mfg_line(machines, prod_day, cpm)
        mfg_total += order_cost
        db.add(QuotationManufacturing(
            tenant_id=tid, quotation_id=q.id, serial_no=serial, style_part=part,
            machines_required=machines, production_per_hour=Decimal(prod_day) / 8,
            production_per_day=Decimal(prod_day), cost_per_machine=cpm, total_line_cost=line_cost,
            cost_per_dozen=per_dz, cm_per_piece=per_pc, total_order_cost=order_cost,
            currency=CURRENCY, exchange_rate=Decimal("1"), base_amount=order_cost, local_amount=order_cost,
        ))

    subtotal = material_total + mfg_total
    others = [
        ("Chest screen print – job work (USD 0.12/pc)", "fixed", Decimal("2880.00")),
        ("Lab testing & third-party inspection", "fixed", Decimal("450.00")),
        ("Inland transport to Chattogram port", "fixed", Decimal("600.00")),
        ("Bank & export documentation (1%)", "percentage", Decimal("1.00")),
    ]
    other_total = Decimal("0")
    for serial, (head, ctype, value) in enumerate(others, start=1):
        amount = (subtotal * value / 100).quantize(TWO) if ctype == "percentage" else value
        other_total += amount
        db.add(QuotationOtherCost(
            tenant_id=tid, quotation_id=q.id, serial_no=serial, cost_head=head,
            percentage=value if ctype == "percentage" else Decimal("0"), total_amount=amount,
            cost_type=ctype, value=value, based_on="subtotal", calculated_amount=amount,
            currency=CURRENCY, exchange_rate=Decimal("1"), base_amount=amount, local_amount=amount,
        ))

    for serial, (size, pct) in enumerate(SIZE_RATIO, start=1):
        db.add(QuotationSizeRatio(
            tenant_id=tid, quotation_id=q.id, serial_no=serial, size=size,
            ratio_percentage=Decimal(pct), fabric_factor=Decimal("1.05") if size in ("XL", "XXL") else Decimal("1.0"),
            quantity=ORDER_QTY * pct // 100,
        ))

    total_cost = material_total + mfg_total + other_total
    cost_pc = (total_cost / ORDER_QTY).quantize(FOUR)
    q.material_cost = material_total
    q.manufacturing_cost = mfg_total
    q.other_cost = other_total
    q.total_cost = total_cost
    q.cost_per_piece = cost_pc
    q.profit_percentage = ((UNIT_PRICE_USD - cost_pc) / cost_pc * 100).quantize(TWO)
    q.quoted_price = UNIT_PRICE_USD
    q.total_amount = ORDER_VALUE_USD
    await db.flush()
    ctx.log(f"Quotation {QUOTATION_CODE}: cost/pc {cost_pc}, price {UNIT_PRICE_USD}, margin {q.profit_percentage}%")
    return q


async def _ensure_sales_contract(db, ctx) -> MasterContract:
    mc = await find_one(db, MasterContract, tenant_id=ctx.tenant_id, reference=SALES_CONTRACT_REF)
    if mc:
        # "ADVISED" (bank has advised the contract) is what lets the order pipeline pass LC_RECEIVED.
        if mc.status != "ADVISED":
            mc.status = "ADVISED"
            mc.advised_at = _dt(D["sales_contract"])
            await db.flush()
            ctx.log(f"Sales contract {SALES_CONTRACT_REF} status set to ADVISED")
        return mc
    mc = MasterContract(
        tenant_id=ctx.tenant_id,
        contract_type="SALES_CONTRACT",
        reference=SALES_CONTRACT_REF,
        status="ADVISED",
        advised_at=_dt(D["sales_contract"]),
        contract_date=D["sales_contract"],
        amount=ORDER_VALUE_USD,
        currency=CURRENCY,
        buyer_name="Primark Limited",
        bank_name="Eastern Bank PLC, Principal Branch, Dhaka",
        advising_bank="Eastern Bank PLC",
        expiry_date=D["payment_received"].replace(month=12, day=31),
        btb_utilized_amount=0,
    )
    db.add(mc)
    await db.flush()
    ctx.log(f"Export sales contract {SALES_CONTRACT_REF} (USD {ORDER_VALUE_USD})")
    return mc


async def _ensure_order(db, ctx, q: Quotation, style: GarmentStyle, mc: MasterContract) -> Order:
    order = await find_one(db, Order, tenant_id=ctx.tenant_id, order_code=ORDER_CODE)
    if order is None:
        order = Order(
            tenant_id=ctx.tenant_id,
            customer_id=ctx.customer.id,
            quotation_id=q.id,
            style_id=style.id,
            order_code=ORDER_CODE,
            style_ref=STYLE_CODE,
            shipping_term=SHIPPING_TERM,
            order_date=D["order_confirmed"],
            delivery_date=D["buyer_delivery"],
            quantity=ORDER_QTY,
            status="CONFIRMED",
            order_type="export",
            master_contract_id=mc.id,
            pi_issued_at=_dt(D["pi_issued"]),
            lc_received_at=_dt(D["sales_contract"]),
            remarks=f"Primark purchase order {BUYER_PO_NUMBER}. {SHIPPING_TERM} → {FINAL_DESTINATION}. "
                    f"Price USD {UNIT_PRICE_USD}/pc, total USD {ORDER_VALUE_USD}.",
            commercial_snapshot_json=build_order_commercial_snapshot_at_conversion(q, tenant=ctx.tenant),
            created_at=_dt(D["order_confirmed"]),
        )
        db.add(order)
        await db.flush()
        ctx.log(f"Order {ORDER_CODE} confirmed ({ORDER_QTY:,} pcs)")

    if await find_one(db, OrderColorSizeLine, order_id=order.id) is None:
        color_sort = {name: i for i, (name, _) in enumerate(COLORS)}
        size_sort = {size: i for i, (size, _) in enumerate(SIZE_RATIO)}
        for color_name, color_code, size, qty in color_size_matrix():
            db.add(OrderColorSizeLine(
                tenant_id=ctx.tenant_id, order_id=order.id, color_name=color_name, color_code=color_code,
                size=size, quantity=qty, color_sort=color_sort[color_name], size_sort=size_sort[size],
            ))
        await db.flush()
        ctx.log("Order colour × size matrix: 3 colours × 5 sizes")
    return order


async def _ensure_pi(db, ctx, order: Order, mc: MasterContract) -> ProformaInvoice:
    pi = await find_one(db, ProformaInvoice, tenant_id=ctx.tenant_id, reference=PI_REFERENCE)
    if pi:
        return pi
    c = ctx.customer
    pi = ProformaInvoice(
        tenant_id=ctx.tenant_id,
        direction="EXPORT",
        master_contract_id=mc.id,
        reference=PI_REFERENCE,
        status="ISSUED",
        invoice_date=D["pi_issued"],
        amount=ORDER_VALUE_USD,
        buyer_name=c.legal_entity_name,
        buyer_address=f"{c.billing_address_line1}, {c.billing_city} {c.billing_postal_code}, {c.billing_country}",
        buyer_bank_details="Payment by T/T, open account – 45 days from B/L date",
        consignee_name="Primark Stores Limited",
        consignee_address=FINAL_DESTINATION,
        notify_party_name="Primark Limited",
        notify_party_address=f"{c.billing_address_line1}, {c.billing_city}, {c.billing_country}",
        beneficiary_name=ctx.tenant.name,
        beneficiary_address="Factory Road, Narayanganj, Bangladesh",
        terms_of_shipping=SHIPPING_TERM,
        terms_of_payment="T/T 45 days from B/L",
        currency=CURRENCY,
        shipping_country="Bangladesh",
        destination_port_or_airport=PORT_OF_DISCHARGE,
        shipment_port=PORT_OF_LOADING,
        documents_to_provide=["Commercial Invoice", "Packing List", "Bill of Lading", "Certificate of Origin (GSP Form A)",
                              "Final Inspection Certificate", "GOTS Transaction Certificate"],
        terms_and_conditions=[
            f"Goods as per Primark purchase order {BUYER_PO_NUMBER} and approved PP sample.",
            f"Shipment on or before {D['buyer_delivery']:%d %b %Y}.",
            f"Sales contract {SALES_CONTRACT_REF} applies.",
        ],
        shipper_bank_name="Eastern Bank PLC",
        shipper_bank_branch="Principal Branch",
        shipper_bank_account_number="1011060123456",
        shipper_bank_account_name=ctx.tenant.name,
        shipper_bank_address="Gulshan Avenue, Dhaka, Bangladesh",
        shipper_bank_swift="EBLDBDDH",
        verification_token=secrets.token_urlsafe(32),
    )
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id, sort_order=0))
    await db.flush()
    ctx.log(f"Proforma invoice {PI_REFERENCE} linked to {ORDER_CODE}")
    return pi


async def run(db: AsyncSession, ctx: DemoContext) -> None:
    items = await _ensure_masters(db, ctx)
    style = await _ensure_style(db, ctx)
    inq = await _ensure_inquiry(db, ctx, style)
    q = await _ensure_quotation(db, ctx, inq, style, items)
    mc = await _ensure_sales_contract(db, ctx)
    order = await _ensure_order(db, ctx, q, style, mc)
    await _ensure_pi(db, ctx, order, mc)
