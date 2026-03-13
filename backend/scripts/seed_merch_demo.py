"""
Seed demo merchandising data (customers, inquiries, quotations, orders, styles, BOM, follow-ups)
for the Lakhsma tenant. Safe to run multiple times (idempotent by codes).

Run from backend dir (inside Docker backend container):
  python scripts/seed_merch_demo.py
"""
import asyncio
import sys
from pathlib import Path
from datetime import date

from sqlalchemy import select

# Ensure backend app is importable when run as script
backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # type: ignore  # noqa: E402
from app.models import (  # type: ignore  # noqa: E402
    Customer,
    Tenant,
    Inquiry,
    Quotation,
    Order,
    GarmentStyle,
    Bom,
    BomItem,
    Followup,
    StyleComponent,
    StyleColorway,
    StyleSizeScale,
    ConsumptionPlan,
    ConsumptionPlanItem,
    OrderAmendment,
    InquiryEvent,
    # Inventory / costing models
    Item,
    QuotationMaterial,
    QuotationManufacturing,
    QuotationOtherCost,
    QuotationSizeRatio,
)


LAKHSMA_CODE = "LAKHSMA4821"


async def get_lakhsma_tenant(db):
    result = await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise RuntimeError("Lakhsma tenant not found. Run seed_lakhsma.py first.")
    return tenant


async def ensure_customers(db, tenant_id: int) -> list[Customer]:
    existing = await db.execute(
        select(Customer).where(Customer.tenant_id == tenant_id)
    )
    rows = existing.scalars().all()
    if rows:
        return rows

    demo = [
        Customer(
            tenant_id=tenant_id,
            customer_code="CUST-001",
            name="Prime Garments Ltd.",
            country="Bangladesh",
            email="merch@primegarments.com",
            phone="+8801711000001",
        ),
        Customer(
            tenant_id=tenant_id,
            customer_code="CUST-002",
            name="Star Buying House",
            country="Bangladesh",
            email="orders@starbuying.com",
            phone="+8801711000002",
        ),
        Customer(
            tenant_id=tenant_id,
            customer_code="CUST-003",
            name="EU Retail Group",
            country="Germany",
            email="sourcing@euretail.de",
            phone="+49-30-123456",
        ),
    ]
    db.add_all(demo)
    await db.flush()
    return demo


async def seed_merch(db) -> None:
    tenant = await get_lakhsma_tenant(db)
    customers = await ensure_customers(db, tenant.id)
    cust1 = customers[0]
    cust2 = customers[1]

    # Inquiries
    existing_inq = await db.execute(
        select(Inquiry).where(Inquiry.tenant_id == tenant.id)
    )
    inquiries = existing_inq.scalars().all()
    if not inquiries:
        inq1 = Inquiry(
            tenant_id=tenant.id,
            customer_id=cust1.id,
            inquiry_code="INQ-0001",
            style_ref="STYLE-TEES-001",
            season="SS26",
            department="Knit",
            quantity=10000,
            target_price="4.50",
            status="SUBMITTED",
            notes="Basic crew neck tee, 160 GSM.",
        )
        inq2 = Inquiry(
            tenant_id=tenant.id,
            customer_id=cust2.id,
            inquiry_code="INQ-0002",
            style_ref="STYLE-HOOD-001",
            season="AW26",
            department="Fleece",
            quantity=5000,
            target_price="12.00",
            status="DRAFT",
            notes="Brushed fleece hoodie.",
        )
        inq3 = Inquiry(
            tenant_id=tenant.id,
            customer_id=customers[2].id if len(customers) > 2 else cust1.id,
            inquiry_code="INQ-0003",
            style_ref="STYLE-LADIES-001",
            season="SS26",
            department="Ladies",
            quantity=8000,
            target_price="6.20",
            status="WON",
            notes="Ladies basic tee, multiple colors.",
        )
        db.add_all([inq1, inq2, inq3])
        await db.flush()
        inquiries = [inq1, inq2, inq3]

    inq1 = inquiries[0]

    # Quotations
    existing_q = await db.execute(
        select(Quotation).where(Quotation.tenant_id == tenant.id)
    )
    quotations = existing_q.scalars().all()
    inq2 = inquiries[1] if len(inquiries) > 1 else inq1
    if not quotations:
        # Basic tee quotation – we also treat this as our costing demo quotation
        q1 = Quotation(
            tenant_id=tenant.id,
            customer_id=inq1.customer_id,
            inquiry_id=inq1.id,
            quotation_code="QT-0001",
            style_ref=inq1.style_ref,
            department=inq1.department,
            projected_quantity=inq1.quantity,
            projected_delivery_date=date.today().replace(month=min(12, date.today().month + 4)),
            quotation_date=date.today(),
            target_price=inq1.target_price,
            target_price_currency="USD",
            exchange_rate="1",
            currency="USD",
            total_amount="45000",
            status="NEW",
            version_no=1,
            valid_until=date.today().replace(year=date.today().year + 1),
            notes="Quoted based on current yarn prices.",
        )
        # Hoodie quotation – header only, no detailed costing yet
        q2 = Quotation(
            tenant_id=tenant.id,
            customer_id=inq2.customer_id,
            inquiry_id=inq2.id,
            quotation_code="QT-0002",
            style_ref=inq2.style_ref,
            department=inq2.department,
            projected_quantity=inq2.quantity,
            projected_delivery_date=date.today().replace(month=min(12, date.today().month + 5)),
            quotation_date=date.today(),
            target_price=inq2.target_price,
            target_price_currency="USD",
            exchange_rate="1",
            currency="USD",
            total_amount="69000",
            status="APPROVED",
            version_no=1,
            valid_until=date.today().replace(year=date.today().year + 1),
            notes="Hoodie quotation, approved by buyer.",
        )
        db.add_all([q1, q2])
        await db.flush()
        quotations = [q1, q2]

    q1 = quotations[0]

    # Orders
    existing_o = await db.execute(
        select(Order).where(Order.tenant_id == tenant.id)
    )
    orders = existing_o.scalars().all()
    q2 = quotations[1] if len(quotations) > 1 else q1
    if not orders:
        o1 = Order(
            tenant_id=tenant.id,
            customer_id=q1.customer_id,
            quotation_id=q1.id,
            order_code="ORD-0001",
            style_ref=q1.style_ref,
            order_date=date.today(),
            delivery_date=date.today().replace(month=min(12, date.today().month + 4)),
            quantity=inq1.quantity,
            status="NEW",
            remarks="First bulk order for STYLE-TEES-001.",
        )
        o2 = Order(
            tenant_id=tenant.id,
            customer_id=q2.customer_id,
            quotation_id=q2.id,
            order_code="ORD-0002",
            style_ref=q2.style_ref,
            order_date=date.today(),
            delivery_date=date.today().replace(month=min(12, date.today().month + 3)),
            quantity=inq2.quantity,
            status="IN_PROGRESS",
            remarks="Order created from QT-0002 (hoodie).",
        )
        db.add_all([o1, o2])
        await db.flush()
        orders = [o1, o2]

    order = orders[0]

    # Styles and BOM
    existing_styles = await db.execute(
        select(GarmentStyle).where(GarmentStyle.tenant_id == tenant.id)
    )
    styles = existing_styles.scalars().all()
    if not styles:
        style = GarmentStyle(
            tenant_id=tenant.id,
            style_code="STYLE-TEES-001",
            name="Basic Crew Neck Tee",
            buyer_customer_id=cust1.id,
            season="SS26",
            department="Knit",
            status="ACTIVE",
            notes="Reference style for demo data.",
        )
        db.add(style)
        await db.flush()
        styles = [style]

    style = styles[0]

    # Style linked tables (components, colorways, size scales)
    existing_component = await db.execute(
        select(StyleComponent).where(StyleComponent.tenant_id == tenant.id, StyleComponent.style_id == style.id)
    )
    if not existing_component.scalars().first():
        db.add_all(
            [
                StyleComponent(tenant_id=tenant.id, style_id=style.id, component_name="Body", sequence_no=1),
                StyleComponent(tenant_id=tenant.id, style_id=style.id, component_name="Neck Rib", sequence_no=2),
            ]
        )
    existing_colorway = await db.execute(
        select(StyleColorway).where(StyleColorway.tenant_id == tenant.id, StyleColorway.style_id == style.id)
    )
    if not existing_colorway.scalars().first():
        db.add_all(
            [
                StyleColorway(tenant_id=tenant.id, style_id=style.id, color_name="Black", color_code="#111111"),
                StyleColorway(tenant_id=tenant.id, style_id=style.id, color_name="White", color_code="#FFFFFF"),
            ]
        )
    existing_scale = await db.execute(
        select(StyleSizeScale).where(StyleSizeScale.tenant_id == tenant.id, StyleSizeScale.style_id == style.id)
    )
    if not existing_scale.scalars().first():
        db.add(
            StyleSizeScale(
                tenant_id=tenant.id,
                style_id=style.id,
                scale_name="Core",
                sizes_csv="S,M,L,XL",
                notes="Default core size scale",
            )
        )

    existing_bom = await db.execute(
        select(Bom).where(Bom.tenant_id == tenant.id, Bom.style_id == style.id)
    )
    bom = existing_bom.scalar_one_or_none()
    if not bom:
        bom = Bom(
            tenant_id=tenant.id,
            style_id=style.id,
            version_no=1,
            status="APPROVED",
            notes="Demo BOM for basic tee.",
        )
        db.add(bom)
        await db.flush()

        fabric = BomItem(
            tenant_id=tenant.id,
            bom_id=bom.id,
            category="FABRIC",
            item_code="FAB-160GSM-COTTON",
            description="160 GSM combed cotton jersey",
            uom="KG",
            base_consumption="0.22",
            wastage_pct="5",
        )
        trim = BomItem(
            tenant_id=tenant.id,
            bom_id=bom.id,
            category="TRIM",
            item_code="TRIM-NECK-RIB",
            description="1x1 cotton rib for neck",
            uom="M",
            base_consumption="0.05",
            wastage_pct="3",
        )
        db.add_all([fabric, trim])

    # --- Costing details for quotation QT-0001 (basic tee) ---
    # We populate quotation_materials, quotation_manufacturing,
    # quotation_other_costs and quotation_size_ratios using inventory items.

    # Inventory items (from seed_costing_demo)
    items_result = await db.execute(
        select(Item).where(Item.tenant_id == tenant.id)
    )
    inv_items = {it.item_code: it for it in items_result.scalars().all()}

    # Only seed costing once per quotation
    existing_qm = await db.execute(
        select(QuotationMaterial).where(
            QuotationMaterial.tenant_id == tenant.id,
            QuotationMaterial.quotation_id == q1.id,
        )
    )
    if not existing_qm.scalars().first():
        qty = q1.projected_quantity or inq1.quantity or 0
        dozens = qty / 12 if qty else 0

        # Fabric – 160 GSM cotton jersey
        fab_item = inv_items.get("FAB-160GSM")
        fabric_cons_per_pc = 0.22  # kg per piece
        fabric_cons_per_dz = fabric_cons_per_pc * 12
        fabric_unit_price = float(fab_item.default_cost) if fab_item else 3.5
        fabric_amt_per_dz = fabric_cons_per_dz * fabric_unit_price
        fabric_total = fabric_amt_per_dz * dozens if dozens else fabric_amt_per_dz

        db.add(
            QuotationMaterial(
                tenant_id=tenant.id,
                quotation_id=q1.id,
                serial_no=1,
                category_id=None,
                item_id=fab_item.id if fab_item else None,
                description="Body fabric – 160 GSM cotton jersey",
                unit="KG",
                consumption_per_dozen=f"{fabric_cons_per_dz:.4f}",
                unit_price=f"{fabric_unit_price:.4f}",
                amount_per_dozen=f"{fabric_amt_per_dz:.4f}",
                total_amount=f"{fabric_total:.2f}",
                currency="USD",
                exchange_rate="1",
                base_amount=f"{fabric_total:.2f}",
                local_amount=f"{fabric_total:.2f}",
            )
        )

        # Neck rib trim
        rib_item = inv_items.get("TRIM-RIB")
        rib_cons_per_pc = 0.05  # yard per piece
        rib_cons_per_dz = rib_cons_per_pc * 12
        rib_unit_price = float(rib_item.default_cost) if rib_item else 0.8
        rib_amt_per_dz = rib_cons_per_dz * rib_unit_price
        rib_total = rib_amt_per_dz * dozens if dozens else rib_amt_per_dz

        db.add(
            QuotationMaterial(
                tenant_id=tenant.id,
                quotation_id=q1.id,
                serial_no=2,
                category_id=None,
                item_id=rib_item.id if rib_item else None,
                description="Neck rib",
                unit="Yard",
                consumption_per_dozen=f"{rib_cons_per_dz:.4f}",
                unit_price=f"{rib_unit_price:.4f}",
                amount_per_dozen=f"{rib_amt_per_dz:.4f}",
                total_amount=f"{rib_total:.2f}",
                currency="USD",
                exchange_rate="1",
                base_amount=f"{rib_total:.2f}",
                local_amount=f"{rib_total:.2f}",
            )
        )

        # Simple manufacturing line
        cm_per_pc = 0.35
        total_cm = cm_per_pc * qty if qty else 0.0
        db.add(
            QuotationManufacturing(
                tenant_id=tenant.id,
                quotation_id=q1.id,
                serial_no=1,
                style_part="Main sewing line",
                machines_required=18,
                production_per_hour="600",
                production_per_day="4800",
                cost_per_machine="2.50",
                total_line_cost=f"{total_cm:.2f}",
                cost_per_dozen=f"{cm_per_pc * 12:.4f}",
                cm_per_piece=f"{cm_per_pc:.4f}",
                total_order_cost=f"{total_cm:.2f}",
                currency="USD",
                exchange_rate="1",
                base_amount=f"{total_cm:.2f}",
                local_amount=f"{total_cm:.2f}",
            )
        )

        # Commercial / other cost – 5% on subtotal (fabric + cm)
        material_total = fabric_total + rib_total
        mfg_total = total_cm
        subtotal = material_total + mfg_total
        comm_pct = 5.0
        comm_amount = subtotal * comm_pct / 100.0

        db.add(
            QuotationOtherCost(
                tenant_id=tenant.id,
                quotation_id=q1.id,
                serial_no=1,
                cost_head="Commercial / overhead",
                percentage=f"{comm_pct:.2f}",
                total_amount=f"{comm_amount:.2f}",
                cost_type="percentage",
                value=f"{comm_pct:.2f}",
                based_on="subtotal",
                calculated_amount=f"{comm_amount:.2f}",
                notes="Approx. commercial overheads at 5% of subtotal",
                currency="USD",
                exchange_rate="1",
                base_amount=f"{comm_amount:.2f}",
                local_amount=f"{comm_amount:.2f}",
            )
        )

        # Simple size ratio S/M/L/XL
        sizes = [("S", 25), ("M", 35), ("L", 25), ("XL", 15)]
        for idx, (size_code, pct) in enumerate(sizes, start=1):
            db.add(
                QuotationSizeRatio(
                    tenant_id=tenant.id,
                    quotation_id=q1.id,
                    serial_no=idx,
                    size=size_code,
                    ratio_percentage=f"{pct:.2f}",
                    fabric_factor="1.0",
                    quantity=int((qty or 0) * pct / 100.0),
                )
            )

        # Update quotation totals based on seeded lines
        total_material = material_total
        total_mfg = mfg_total
        total_other = comm_amount
        grand_total = total_material + total_mfg + total_other
        cost_per_piece = grand_total / (qty or 1) if qty else grand_total

        q1.material_cost = f"{total_material:.2f}"
        q1.manufacturing_cost = f"{total_mfg:.2f}"
        q1.other_cost = f"{total_other:.2f}"
        q1.total_cost = f"{grand_total:.2f}"
        q1.cost_per_piece = f"{cost_per_piece:.4f}"
        q1.profit_percentage = "15.0"
        q1.quoted_price = f"{grand_total * 1.15:.2f}"
        q1.total_amount = q1.quoted_price

    # Follow-up task
    existing_followup = await db.execute(
        select(Followup).where(Followup.tenant_id == tenant.id, Followup.order_id == order.id)
    )
    follow = existing_followup.scalar_one_or_none()
    if not follow:
        follow = Followup(
            tenant_id=tenant.id,
            order_id=order.id,
            title="Confirm lab dips with buyer",
            due_date=date.today().replace(month=min(12, date.today().month + 1)),
            status="OPEN",
            severity="HIGH",
            notes="Send lab dips for main body and rib.",
        )
        db.add(follow)

    # Consumption plan + items
    existing_plan = await db.execute(
        select(ConsumptionPlan).where(ConsumptionPlan.tenant_id == tenant.id, ConsumptionPlan.order_id == order.id)
    )
    plan = existing_plan.scalar_one_or_none()
    if not plan:
        plan = ConsumptionPlan(tenant_id=tenant.id, order_id=order.id, status="PLANNED")
        db.add(plan)
        await db.flush()
    existing_plan_items = await db.execute(
        select(ConsumptionPlanItem).where(ConsumptionPlanItem.tenant_id == tenant.id, ConsumptionPlanItem.plan_id == plan.id)
    )
    if not existing_plan_items.scalars().first():
        db.add_all(
            [
                ConsumptionPlanItem(tenant_id=tenant.id, plan_id=plan.id, item_code="FAB-160GSM", required_qty="2200", uom="KG"),
                ConsumptionPlanItem(tenant_id=tenant.id, plan_id=plan.id, item_code="TRIM-RIB", required_qty="500", uom="Yard"),
            ]
        )

    # Order amendment snapshot
    existing_amendment = await db.execute(
        select(OrderAmendment).where(OrderAmendment.tenant_id == tenant.id, OrderAmendment.order_id == order.id)
    )
    if not existing_amendment.scalars().first():
        db.add(
            OrderAmendment(
                tenant_id=tenant.id,
                order_id=order.id,
                amendment_no=1,
                field_changed="delivery_date",
                old_value=str(order.delivery_date) if order.delivery_date else None,
                new_value=str(order.delivery_date) if order.delivery_date else None,
                reason="Initial alignment with buyer plan",
                status="APPROVED",
            )
        )

    # Inquiry status event trace
    existing_event = await db.execute(
        select(InquiryEvent).where(InquiryEvent.tenant_id == tenant.id, InquiryEvent.inquiry_id == inq1.id)
    )
    if not existing_event.scalars().first():
        db.add_all(
            [
                InquiryEvent(
                    tenant_id=tenant.id,
                    inquiry_id=inq1.id,
                    event_type="status_change",
                    from_status="DRAFT",
                    to_status="SUBMITTED",
                    notes="Seed workflow event",
                ),
                InquiryEvent(
                    tenant_id=tenant.id,
                    inquiry_id=inq1.id,
                    event_type="converted_to_quotation",
                    from_status="SUBMITTED",
                    to_status="CONVERTED",
                    notes=f"Converted to {q1.quotation_code}",
                ),
            ]
        )

    await db.commit()
    print("Demo merchandising data seeded for Lakhsma tenant.")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await seed_merch(db)


if __name__ == "__main__":
    asyncio.run(main())

