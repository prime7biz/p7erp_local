"""Phase 1.5 end-to-end demo seed (idempotent).

Marker key on ``tenants.feature_flags``: ``demo_seed_phase1_v1``.
Business markers: ``DEMO-CUST-01``, ``DEMO-001`` (order), etc.

Safe by default for company codes starting with ``DEMO`` (or explicit force).
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import hash_password
from app.common.demo_credentials import seed_password
from app.models import (
    AttendanceEntry,
    Bom,
    BomItem,
    CommercialInvoice,
    Customer,
    DeliveryChallan,
    DeliveryChallanItem,
    DeliveryChallanOrder,
    Employee,
    GarmentStyle,
    GoodsReceiving,
    GoodsReceivingItem,
    Inquiry,
    InquiryItem,
    Item,
    ItemCategory,
    ItemUnit,
    Order,
    PackingList,
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollStructure,
    PayrollStructureLine,
    ProformaInvoice,
    ProformaInvoiceOrder,
    PurchaseOrder,
    PurchaseOrderItem,
    Quotation,
    QuotationManufacturing,
    QuotationMaterial,
    QuotationOtherCost,
    Role,
    SewingLine,
    SewingLineStyleConfig,
    Shipment,
    ShipmentContainer,
    Tenant,
    TradeCase,
    User,
    Vendor,
    Warehouse,
)
from app.models.tenant import TenantType
from app.modules.commercial.commercial_invoice_service import (
    create_invoices_from_delivery_challan,
    issue_commercial_invoice,
)
from app.modules.commercial.proforma_receipt_service import create_receipt_from_proforma
from app.modules.finance.system_coa_seeding_service import (
    resolve_system_ledger,
    seed_tenant_system_coa,
)
from app.modules.hr_payroll import service as payroll_service
from app.modules.orders.commercial_snapshot_service import (
    build_order_commercial_snapshot_at_conversion,
)

MARKER_KEY = "demo_seed_phase1_v1"
DEMO_MODE_FLAG = "demo_mode_enabled"

MARKER_CUSTOMER = "DEMO-CUST-01"
MARKER_ORDER = "DEMO-001"
MARKER_STYLE = "DEMO-STY-01"
MARKER_INQ = "DEMO-INQ-01"
MARKER_QUO = "DEMO-QUO-01"
MARKER_BOM = "DEMO-BOM-01"
MARKER_CHALLAN = "DEMO-DC-01"
MARKER_PL = "DEMO-PL-01"
MARKER_PI = "DEMO-PI-01"
MARKER_SHIP = "DEMO-SH-01"
MARKER_TRADE = "DEMO-TC-01"
MARKER_PERIOD = "DEMO-PAY-M"

DEMO_LOGIN_USER = "demoadmin"
DEMO_LOGIN_PASSWORD = "Demo123!"

ALLOWED_TENANT_PREFIXES = ("DEMO",)


def _is_demo_tenant_code(company_code: str) -> bool:
    code = (company_code or "").strip().upper()
    return any(code.startswith(p) for p in ALLOWED_TENANT_PREFIXES)


def _merge_flags(tenant: Tenant, updates: dict[str, Any]) -> None:
    base: dict[str, Any] = dict(tenant.feature_flags) if isinstance(tenant.feature_flags, dict) else {}
    base.update(updates)
    tenant.feature_flags = base


def _marker_payload(tenant: Tenant) -> dict[str, Any] | None:
    flags = tenant.feature_flags if isinstance(tenant.feature_flags, dict) else {}
    raw = flags.get(MARKER_KEY)
    return raw if isinstance(raw, dict) else None


async def ensure_demo_tenant(
    db: AsyncSession,
    *,
    company_code: str = "DEMO",
    create_if_missing: bool = True,
) -> tuple[Tenant, User | None, dict[str, str]]:
    """Resolve or create DEMO tenant + admin user. Returns (tenant, user, credentials)."""
    code = (company_code or "DEMO").strip().upper()
    row = (await db.execute(select(Tenant).where(Tenant.company_code == code))).scalar_one_or_none()
    creds = {
        "company_code": code,
        "username": DEMO_LOGIN_USER,
        "password": DEMO_LOGIN_PASSWORD,
    }
    if row is not None:
        user = (
            await db.execute(
                select(User).where(User.tenant_id == row.id, User.username == DEMO_LOGIN_USER)
            )
        ).scalar_one_or_none()
        return row, user, creds

    if not create_if_missing:
        raise ValueError(f"Tenant company_code={code!r} not found")

    password = seed_password("SEED_DEMO_PASSWORD", DEMO_LOGIN_PASSWORD)
    creds["password"] = password
    tenant = Tenant(
        name="Phase 1 Demo Tenant",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=code,
        base_currency="USD",
        feature_flags={DEMO_MODE_FLAG: True, "payroll_auto_calculate_enabled": True, "trade_enabled": True},
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(admin_role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=admin_role.id,
        username=DEMO_LOGIN_USER,
        email="demoadmin@demo.local",
        password_hash=await hash_password(password),
        first_name="Demo",
        last_name="Admin",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user, creds


async def _count_demo_records(db: AsyncSession, tenant_id: int) -> dict[str, int]:
    async def _c(model, *extra):
        stmt = select(func.count()).select_from(model).where(model.tenant_id == tenant_id, *extra)
        return int((await db.execute(stmt)).scalar_one())

    return {
        "customers": await _c(Customer, Customer.customer_code == MARKER_CUSTOMER),
        "orders": await _c(Order, Order.order_code == MARKER_ORDER),
        "challans": await _c(DeliveryChallan, DeliveryChallan.challan_code == MARKER_CHALLAN),
        "packing_lists": await _c(PackingList, PackingList.packing_list_number == MARKER_PL),
        "proformas": await _c(ProformaInvoice, ProformaInvoice.reference == MARKER_PI),
        "employees": await _c(Employee, Employee.employee_code.like("DEMO-EMP-%")),
    }


async def _purge_demo_records(db: AsyncSession, tenant_id: int) -> None:
    """Best-effort delete of DEMO-* rows for --reset (tenant-scoped only)."""
    order = (
        await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.order_code == MARKER_ORDER))
    ).scalar_one_or_none()
    pl = (
        await db.execute(
            select(PackingList).where(
                PackingList.tenant_id == tenant_id, PackingList.packing_list_number == MARKER_PL
            )
        )
    ).scalar_one_or_none()
    if pl:
        await db.execute(
            delete(ShipmentContainer).where(
                ShipmentContainer.tenant_id == tenant_id,
                ShipmentContainer.packing_list_id == pl.id,
            )
        )
        await db.delete(pl)
        await db.flush()

    challan = (
        await db.execute(
            select(DeliveryChallan).where(
                DeliveryChallan.tenant_id == tenant_id, DeliveryChallan.challan_code == MARKER_CHALLAN
            )
        )
    ).scalar_one_or_none()
    if challan:
        await db.execute(
            delete(DeliveryChallanItem).where(DeliveryChallanItem.challan_id == challan.id)
        )
        await db.execute(
            delete(DeliveryChallanOrder).where(
                DeliveryChallanOrder.delivery_challan_id == challan.id
            )
        )
        cis = (
            await db.execute(
                select(CommercialInvoice).where(
                    CommercialInvoice.tenant_id == tenant_id,
                    CommercialInvoice.source_delivery_challan_id == challan.id,
                )
            )
        ).scalars().all()
        for ci in cis:
            await db.delete(ci)
        await db.delete(challan)
        await db.flush()

    pi = (
        await db.execute(
            select(ProformaInvoice).where(
                ProformaInvoice.tenant_id == tenant_id, ProformaInvoice.reference == MARKER_PI
            )
        )
    ).scalar_one_or_none()
    if pi:
        await db.execute(
            delete(ProformaInvoiceOrder).where(ProformaInvoiceOrder.proforma_invoice_id == pi.id)
        )
        await db.delete(pi)
        await db.flush()

    for po in (
        await db.execute(
            select(PurchaseOrder).where(
                PurchaseOrder.tenant_id == tenant_id, PurchaseOrder.po_code.like("DEMO-PO-%")
            )
        )
    ).scalars().all():
        await db.execute(delete(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id))
        grns = (
            await db.execute(
                select(GoodsReceiving).where(
                    GoodsReceiving.tenant_id == tenant_id, GoodsReceiving.purchase_order_id == po.id
                )
            )
        ).scalars().all()
        for g in grns:
            await db.execute(delete(GoodsReceivingItem).where(GoodsReceivingItem.goods_receiving_id == g.id))
            await db.delete(g)
        await db.delete(po)
    await db.flush()

    bom = (
        await db.execute(select(Bom).where(Bom.tenant_id == tenant_id, Bom.bom_code == MARKER_BOM))
    ).scalar_one_or_none()
    if bom:
        await db.execute(delete(BomItem).where(BomItem.bom_id == bom.id))
        await db.delete(bom)
        await db.flush()

    if order:
        await db.execute(
            delete(SewingLineStyleConfig).where(
                SewingLineStyleConfig.tenant_id == tenant_id,
                SewingLineStyleConfig.order_id == order.id,
            )
        )
        await db.delete(order)
        await db.flush()

    quo = (
        await db.execute(
            select(Quotation).where(Quotation.tenant_id == tenant_id, Quotation.quotation_code == MARKER_QUO)
        )
    ).scalar_one_or_none()
    if quo:
        await db.execute(delete(QuotationMaterial).where(QuotationMaterial.quotation_id == quo.id))
        await db.execute(delete(QuotationManufacturing).where(QuotationManufacturing.quotation_id == quo.id))
        await db.execute(delete(QuotationOtherCost).where(QuotationOtherCost.quotation_id == quo.id))
        await db.delete(quo)
        await db.flush()

    inq = (
        await db.execute(
            select(Inquiry).where(Inquiry.tenant_id == tenant_id, Inquiry.inquiry_code == MARKER_INQ)
        )
    ).scalar_one_or_none()
    if inq:
        await db.execute(delete(InquiryItem).where(InquiryItem.inquiry_id == inq.id))
        await db.delete(inq)
        await db.flush()

    style = (
        await db.execute(
            select(GarmentStyle).where(
                GarmentStyle.tenant_id == tenant_id, GarmentStyle.style_code == MARKER_STYLE
            )
        )
    ).scalar_one_or_none()
    if style:
        await db.delete(style)
        await db.flush()

    cust = (
        await db.execute(
            select(Customer).where(
                Customer.tenant_id == tenant_id, Customer.customer_code == MARKER_CUSTOMER
            )
        )
    ).scalar_one_or_none()
    if cust:
        await db.delete(cust)
        await db.flush()

    ship = (
        await db.execute(
            select(Shipment).where(Shipment.tenant_id == tenant_id, Shipment.reference == MARKER_SHIP)
        )
    ).scalar_one_or_none()
    if ship:
        await db.delete(ship)
        await db.flush()
    tc = (
        await db.execute(
            select(TradeCase).where(TradeCase.tenant_id == tenant_id, TradeCase.reference == MARKER_TRADE)
        )
    ).scalar_one_or_none()
    if tc:
        await db.delete(tc)
        await db.flush()

    # Clear marker so reseed runs fully
    tenant = await db.get(Tenant, tenant_id)
    if tenant:
        flags = dict(tenant.feature_flags or {})
        flags.pop(MARKER_KEY, None)
        tenant.feature_flags = flags
        await db.flush()


async def run_phase1_demo_seed(
    db: AsyncSession,
    *,
    company_code: str = "DEMO",
    reset: bool = False,
    force: bool = False,
    create_tenant: bool = True,
) -> dict[str, Any]:
    """Create full Phase 1 demo spine. Idempotent via ``demo_seed_phase1_v1`` marker."""
    code = (company_code or "DEMO").strip().upper()
    if not force and not _is_demo_tenant_code(code):
        raise ValueError(
            f"Refusing to seed non-demo tenant {code!r}. "
            "Use a DEMO* company code, or pass force=True for tests."
        )

    tenant, user, creds = await ensure_demo_tenant(
        db, company_code=code, create_if_missing=create_tenant
    )
    tid = tenant.id
    user_id = user.id if user else None

    if reset:
        await _purge_demo_records(db, tid)

    existing_marker = _marker_payload(tenant)
    existing_order = (
        await db.execute(select(Order).where(Order.tenant_id == tid, Order.order_code == MARKER_ORDER))
    ).scalar_one_or_none()

    if existing_marker and existing_order and not reset:
        counts = await _count_demo_records(db, tid)
        return {
            "status": "idempotent",
            "tenant_id": tid,
            "company_code": code,
            "marker": MARKER_KEY,
            "order_id": existing_order.id,
            "order_code": MARKER_ORDER,
            "counts": counts,
            "credentials": creds,
            "narrative": _narrative(MARKER_ORDER),
            "summary": existing_marker.get("summary") or {},
        }

    # --- Masters ---
    await seed_tenant_system_coa(db, tid)

    cat = (
        await db.execute(
            select(ItemCategory).where(ItemCategory.tenant_id == tid, ItemCategory.category_code == "DEMO-FAB")
        )
    ).scalar_one_or_none()
    if not cat:
        cat = ItemCategory(tenant_id=tid, category_code="DEMO-FAB", name="Demo Fabric", is_active=True)
        db.add(cat)
        await db.flush()
    unit = (
        await db.execute(select(ItemUnit).where(ItemUnit.tenant_id == tid, ItemUnit.unit_code == "PCS"))
    ).scalar_one_or_none()
    if not unit:
        unit = ItemUnit(tenant_id=tid, unit_code="PCS", name="Pieces", is_active=True)
        db.add(unit)
        await db.flush()

    items: list[Item] = []
    for icode, iname, price in (
        ("DEMO-FAB-01", "Jersey 160gsm", Decimal("3.50")),
        ("DEMO-TRIM-01", "Rib 1x1", Decimal("1.20")),
        ("DEMO-TRIM-02", "Woven label", Decimal("0.15")),
        ("DEMO-PACK-01", "Polybag", Decimal("0.08")),
        ("DEMO-FG-01", "Finished tee", Decimal("0")),
    ):
        it = (
            await db.execute(select(Item).where(Item.tenant_id == tid, Item.item_code == icode))
        ).scalar_one_or_none()
        if not it:
            it = Item(
                tenant_id=tid,
                item_code=icode,
                name=iname,
                category_id=cat.id,
                unit_id=unit.id,
                is_active=True,
                default_cost=price,
            )
            db.add(it)
            await db.flush()
        items.append(it)

    wh = (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tid).limit(1))).scalar_one_or_none()
    if not wh:
        wh = Warehouse(tenant_id=tid, warehouse_code="DEMO-WH-01", name="Demo Warehouse", is_active=True)
        db.add(wh)
        await db.flush()

    vendors: list[Vendor] = []
    for vcode, vname in (("DEMO-VEND-01", "Fabric Co"), ("DEMO-VEND-02", "Trim Hub"), ("DEMO-VEND-03", "Pack Supply")):
        v = (await db.execute(select(Vendor).where(Vendor.tenant_id == tid, Vendor.vendor_code == vcode))).scalar_one_or_none()
        if not v:
            v = Vendor(tenant_id=tid, vendor_code=vcode, name=vname, is_active=True)
            db.add(v)
            await db.flush()
        vendors.append(v)

    # a. Customer
    customer = (
        await db.execute(
            select(Customer).where(Customer.tenant_id == tid, Customer.customer_code == MARKER_CUSTOMER)
        )
    ).scalar_one_or_none()
    if not customer:
        customer = Customer(
            tenant_id=tid,
            customer_code=MARKER_CUSTOMER,
            name="Demo Garments Ltd",
            customer_type="Export Buyer",
            preferred_currency="USD",
            status="active",
            country="USA",
        )
        db.add(customer)
        await db.flush()

    # Style
    style = (
        await db.execute(
            select(GarmentStyle).where(GarmentStyle.tenant_id == tid, GarmentStyle.style_code == MARKER_STYLE)
        )
    ).scalar_one_or_none()
    if not style:
        style = GarmentStyle(
            tenant_id=tid,
            style_code=MARKER_STYLE,
            name="Demo Crew Tee",
            buyer_customer_id=customer.id,
            currency="USD",
            lifecycle_stage="ORDER",
            is_active_for_new_orders=True,
        )
        db.add(style)
        await db.flush()

    today = date.today()
    delivery = today + timedelta(days=45)
    qty = 5000

    # b. Inquiry CONVERTED
    inquiry = (
        await db.execute(select(Inquiry).where(Inquiry.tenant_id == tid, Inquiry.inquiry_code == MARKER_INQ))
    ).scalar_one_or_none()
    if not inquiry:
        inquiry = Inquiry(
            tenant_id=tid,
            customer_id=customer.id,
            inquiry_code=MARKER_INQ,
            style_ref=MARKER_STYLE,
            style_id=style.id,
            quantity=qty,
            currency="USD",
            target_price=Decimal("12.00"),
            status="CONVERTED",
            notes="Phase 1.5 demo inquiry (mock PDF)",
            expected_delivery_date=delivery,
        )
        db.add(inquiry)
        await db.flush()
        db.add(
            InquiryItem(
                tenant_id=tid,
                inquiry_id=inquiry.id,
                item_name="Crew Tee",
                quantity=qty,
                sort_order=1,
            )
        )
        await db.flush()

    # c. Quotation with costing, margin ~18%, CONFIRMED/APPROVED
    quotation = (
        await db.execute(
            select(Quotation).where(Quotation.tenant_id == tid, Quotation.quotation_code == MARKER_QUO)
        )
    ).scalar_one_or_none()
    if not quotation:
        material_cost = Decimal("4.50")
        mfg_cost = Decimal("3.20")
        freight = Decimal("0.80")
        other = Decimal("0.50")
        total_cost = material_cost + mfg_cost + freight + other
        # 18% margin on cost → price = cost / (1 - 0.18)
        quoted_price = (total_cost / Decimal("0.82")).quantize(Decimal("0.0001"))
        quotation = Quotation(
            tenant_id=tid,
            customer_id=customer.id,
            inquiry_id=inquiry.id,
            quotation_code=MARKER_QUO,
            style_ref=MARKER_STYLE,
            style_id=style.id,
            projected_quantity=qty,
            projected_delivery_date=delivery,
            quotation_date=today,
            currency="USD",
            material_cost=material_cost * qty,
            manufacturing_cost=mfg_cost * qty,
            other_cost=(freight + other) * qty,
            total_cost=total_cost * qty,
            quoted_price=quoted_price,
            profit_percentage=Decimal("18.00"),
            total_amount=quoted_price * qty,
            status="CONFIRMED",
            shipping_term="FOB",
        )
        db.add(quotation)
        await db.flush()
        for idx, (it, cons, up) in enumerate(
            (
                (items[0], Decimal("2.64"), Decimal("3.50")),  # per dozen
                (items[1], Decimal("0.60"), Decimal("1.20")),
                (items[2], Decimal("12"), Decimal("0.15")),
                (items[3], Decimal("12"), Decimal("0.08")),
            ),
            start=1,
        ):
            amt_dz = cons * up
            dozens = Decimal(qty) / Decimal("12")
            total = amt_dz * dozens
            db.add(
                QuotationMaterial(
                    tenant_id=tid,
                    quotation_id=quotation.id,
                    serial_no=idx,
                    category_id=cat.id,
                    item_id=it.id,
                    description=it.name,
                    unit="PCS",
                    consumption_per_dozen=cons,
                    unit_price=up,
                    amount_per_dozen=amt_dz,
                    total_amount=total,
                    currency="USD",
                    exchange_rate=Decimal("1"),
                    base_amount=total,
                    local_amount=total,
                )
            )
        db.add(
            QuotationManufacturing(
                tenant_id=tid,
                quotation_id=quotation.id,
                serial_no=1,
                style_part="CM Sewing",
                machines_required=20,
                production_per_hour=Decimal("40"),
                production_per_day=Decimal("320"),
                cost_per_machine=Decimal("120"),
                total_line_cost=Decimal("2400"),
                cost_per_dozen=Decimal("90"),
                cm_per_piece=Decimal("7.5"),
                total_order_cost=mfg_cost * qty,
                currency="USD",
                exchange_rate=Decimal("1"),
                base_amount=mfg_cost * qty,
                local_amount=mfg_cost * qty,
            )
        )
        db.add(
            QuotationOtherCost(
                tenant_id=tid,
                quotation_id=quotation.id,
                serial_no=1,
                cost_head="Freight",
                percentage=Decimal("0"),
                total_amount=freight * qty,
                cost_type="fixed",
                value=freight * qty,
                based_on="subtotal",
                calculated_amount=freight * qty,
                currency="USD",
                exchange_rate=Decimal("1"),
                base_amount=freight * qty,
                local_amount=freight * qty,
            )
        )
        await db.flush()

    # d. Order DEMO-001
    order = (
        await db.execute(select(Order).where(Order.tenant_id == tid, Order.order_code == MARKER_ORDER))
    ).scalar_one_or_none()
    if not order:
        snap = build_order_commercial_snapshot_at_conversion(quotation, tenant=tenant)
        if not isinstance(snap, dict):
            snap = {}
        snap.setdefault("quoted_price", str(quotation.quoted_price or "10"))
        snap.setdefault("document_currency", "USD")
        snap.setdefault("profit_percentage", "18")
        order = Order(
            tenant_id=tid,
            customer_id=customer.id,
            quotation_id=quotation.id,
            style_id=style.id,
            order_code=MARKER_ORDER,
            style_ref=MARKER_STYLE,
            order_date=today,
            delivery_date=delivery,
            quantity=qty,
            status="CONFIRMED",
            shipping_term="FOB",
            commercial_snapshot_json=snap,
            remarks="Phase 1.5 demo order",
        )
        db.add(order)
        await db.flush()

    # e. BOM APPROVED
    bom = (await db.execute(select(Bom).where(Bom.tenant_id == tid, Bom.bom_code == MARKER_BOM))).scalar_one_or_none()
    if not bom:
        bom = Bom(
            tenant_id=tid,
            style_id=style.id,
            order_id=order.id,
            quotation_id=quotation.id,
            bom_code=MARKER_BOM,
            status="APPROVED",
            order_code_snapshot=MARKER_ORDER,
            order_qty_snapshot=qty,
            currency_snapshot="USD",
            customer_id=customer.id,
            approved_at=datetime.utcnow(),
            approved_by=user_id,
        )
        db.add(bom)
        await db.flush()
        for idx, (it, cons, vendor) in enumerate(
            (
                (items[0], Decimal("0.22"), vendors[0]),
                (items[1], Decimal("0.05"), vendors[1]),
                (items[2], Decimal("1"), vendors[1]),
                (items[3], Decimal("1"), vendors[2]),
            )
        ):
            db.add(
                BomItem(
                    tenant_id=tid,
                    bom_id=bom.id,
                    item_id=it.id,
                    category="MATERIAL",
                    item_code=it.item_code,
                    description=it.name,
                    base_consumption=cons,
                    wastage_pct=Decimal("3"),
                    preferred_vendor_id=vendor.id,
                    sort_order=idx,
                    order_qty_snapshot=qty,
                    required_gross_qty=float(cons * qty * Decimal("1.03")),
                )
            )
        await db.flush()

    # f. POs ISSUED (APPROVED/ISSUED)
    pos: list[PurchaseOrder] = []
    for i, vendor in enumerate(vendors[:3], start=1):
        po_code = f"DEMO-PO-0{i}"
        po = (
            await db.execute(
                select(PurchaseOrder).where(PurchaseOrder.tenant_id == tid, PurchaseOrder.po_code == po_code)
            )
        ).scalar_one_or_none()
        if not po:
            it = items[i - 1]
            po = PurchaseOrder(
                tenant_id=tid,
                po_code=po_code,
                vendor_id=vendor.id,
                supplier_name=vendor.name,
                order_date=today,
                expected_date=today + timedelta(days=14),
                status="ISSUED",
                currency="USD",
                source_bom_id=bom.id,
                source_order_id=order.id,
                notes="Phase 1.5 demo PO",
            )
            db.add(po)
            await db.flush()
            db.add(
                PurchaseOrderItem(
                    tenant_id=tid,
                    purchase_order_id=po.id,
                    item_id=it.id,
                    warehouse_id=wh.id,
                    quantity=Decimal("1000"),
                    unit_price=Decimal("2.50"),
                    source_bom_id=bom.id,
                    source_order_id=order.id,
                )
            )
            await db.flush()
        pos.append(po)

    # g. Partial GRN RECEIVED (posted)
    grns: list[GoodsReceiving] = []
    for i, po in enumerate(pos[:2], start=1):
        grn_code = f"DEMO-GRN-0{i}"
        grn = (
            await db.execute(
                select(GoodsReceiving).where(GoodsReceiving.tenant_id == tid, GoodsReceiving.grn_code == grn_code)
            )
        ).scalar_one_or_none()
        if not grn:
            poi = (
                await db.execute(
                    select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po.id).limit(1)
                )
            ).scalar_one()
            grn = GoodsReceiving(
                tenant_id=tid,
                grn_code=grn_code,
                purchase_order_id=po.id,
                received_date=today,
                status="RECEIVED",
                vendor_id=po.vendor_id,
                default_warehouse_id=wh.id,
                notes="Phase 1.5 partial receipt",
                created_by_user_id=user_id,
            )
            db.add(grn)
            await db.flush()
            db.add(
                GoodsReceivingItem(
                    tenant_id=tid,
                    goods_receiving_id=grn.id,
                    item_id=poi.item_id,
                    warehouse_id=wh.id,
                    quantity=Decimal("400"),
                    unit_price=str(poi.unit_price),
                    received_qty="400",
                    accepted_qty="400",
                )
            )
            await db.flush()
        grns.append(grn)

    # h. Production plan / line allocation APPROVED (FIRM_BOOKED)
    line = (
        await db.execute(
            select(SewingLine).where(SewingLine.tenant_id == tid, SewingLine.line_code == "DEMO-L1")
        )
    ).scalar_one_or_none()
    if not line:
        line = SewingLine(tenant_id=tid, line_code="DEMO-L1", name="Demo Line 1", is_active=True)
        db.add(line)
        await db.flush()
    alloc = (
        await db.execute(
            select(SewingLineStyleConfig).where(
                SewingLineStyleConfig.tenant_id == tid,
                SewingLineStyleConfig.order_id == order.id,
                SewingLineStyleConfig.line_id == line.id,
            )
        )
    ).scalar_one_or_none()
    if not alloc:
        alloc = SewingLineStyleConfig(
            tenant_id=tid,
            line_id=line.id,
            style_id=style.id,
            order_id=order.id,
            status="planned",
            reservation_status="FIRM_BOOKED",
            planned_qty=qty,
            start_date=today,
            planned_end_date=delivery,
            firm_booked_at=datetime.utcnow(),
        )
        db.add(alloc)
        await db.flush()

    # Trade + shipment for packing containers
    trade = (
        await db.execute(
            select(TradeCase).where(TradeCase.tenant_id == tid, TradeCase.reference == MARKER_TRADE)
        )
    ).scalar_one_or_none()
    if not trade:
        trade = TradeCase(
            tenant_id=tid,
            reference=MARKER_TRADE,
            direction="EXPORT",
            status="OPEN",
            order_id=order.id,
            customer_id=customer.id,
        )
        db.add(trade)
        await db.flush()
    ship = (
        await db.execute(
            select(Shipment).where(Shipment.tenant_id == tid, Shipment.reference == MARKER_SHIP)
        )
    ).scalar_one_or_none()
    if not ship:
        ship = Shipment(
            tenant_id=tid,
            trade_case_id=trade.id,
            reference=MARKER_SHIP,
            status="PLANNED",
            dest_port="NYC",
            origin_port="CTG",
        )
        db.add(ship)
        await db.flush()

    # i. Delivery challan POSTED
    challan = (
        await db.execute(
            select(DeliveryChallan).where(
                DeliveryChallan.tenant_id == tid, DeliveryChallan.challan_code == MARKER_CHALLAN
            )
        )
    ).scalar_one_or_none()
    if not challan:
        challan = DeliveryChallan(
            tenant_id=tid,
            challan_code=MARKER_CHALLAN,
            customer_name=customer.name,
            delivery_date=today,
            status="POSTED",
            notes="Phase 1.5 demo challan",
        )
        db.add(challan)
        await db.flush()
        db.add(
            DeliveryChallanItem(
                tenant_id=tid,
                challan_id=challan.id,
                item_id=items[-1].id,
                warehouse_id=wh.id,
                quantity=Decimal("1000"),
            )
        )
        db.add(
            DeliveryChallanOrder(
                tenant_id=tid,
                delivery_challan_id=challan.id,
                order_id=order.id,
            )
        )
        await db.flush()

    # j. Packing list + 2×40HQ containers FINALIZED
    pl = (
        await db.execute(
            select(PackingList).where(
                PackingList.tenant_id == tid, PackingList.packing_list_number == MARKER_PL
            )
        )
    ).scalar_one_or_none()
    if not pl:
        pl = PackingList(
            tenant_id=tid,
            packing_list_number=MARKER_PL,
            shipment_id=ship.id,
            order_id=order.id,
            delivery_challan_id=challan.id,
            packing_date=today,
            total_cartons=40,
            gross_weight=Decimal("18000"),
            net_weight=Decimal("16500"),
            status="FINALIZED",
            notes="Phase 1.5 demo packing",
            created_by=user_id,
        )
        db.add(pl)
        await db.flush()
        for n, cnum in enumerate(("DEMO-CONT-40HQ-01", "DEMO-CONT-40HQ-02"), start=1):
            db.add(
                ShipmentContainer(
                    tenant_id=tid,
                    shipment_id=ship.id,
                    packing_list_id=pl.id,
                    container_number=cnum,
                    container_type="40HQ",
                    loading_status="LOADED",
                    tare_weight_kg=Decimal("3800"),
                    max_weight_kg=Decimal("28000"),
                )
            )
        await db.flush()

    # k. Commercial invoice ISSUED + AR voucher
    invoices, _created = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tid,
        user_id=user_id,
        challan_id=challan.id,
        idempotency_key="demo-phase1-ci-v1",
        exchange_rate_to_base=Decimal("1"),
    )
    ci = invoices[0] if invoices else None
    if ci and (ci.status or "").upper() == "DRAFT":
        # Ensure positive prices from snapshot
        if ci.price_review_required:
            ci.price_review_required = False
        try:
            ci = await issue_commercial_invoice(db, tenant_id=tid, user_id=user_id, invoice=ci)
        except Exception as exc:  # noqa: BLE001 — demo continues with draft if COA incomplete
            ci.notes = ((ci.notes or "") + f" | ISSUE_SKIPPED:{exc}")[:500]

    # l. Proforma 50% advance ISSUED
    order_total = Decimal(str((order.commercial_snapshot_json or {}).get("total_amount") or quotation.total_amount or 0))
    if order_total <= 0 and quotation.quoted_price:
        order_total = Decimal(str(quotation.quoted_price)) * qty
    pi_amount = (order_total * Decimal("0.50")).quantize(Decimal("0.01"))
    pi = (
        await db.execute(
            select(ProformaInvoice).where(
                ProformaInvoice.tenant_id == tid, ProformaInvoice.reference == MARKER_PI
            )
        )
    ).scalar_one_or_none()
    if not pi:
        pi = ProformaInvoice(
            tenant_id=tid,
            direction="EXPORT",
            reference=MARKER_PI,
            status="ISSUED",
            invoice_date=today,
            amount=float(pi_amount),
            currency="USD",
            buyer_name=customer.name,
            terms_of_payment="50% advance",
        )
        db.add(pi)
        await db.flush()
        db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id, sort_order=0))
        await db.flush()

    # m. Receipt voucher + allocation (50% of PI = full PI amount here)
    receipt_info: dict[str, Any] = {}
    try:
        bank_id = await resolve_system_ledger(db, tid, "CASH_IN_HAND")
        recv_id = await resolve_system_ledger(db, tid, "EXPORT_RECEIVABLE")
        alloc, voucher, outstanding, created = await create_receipt_from_proforma(
            db,
            tenant_id=tid,
            user_id=user_id,
            pi=pi,
            amount=pi_amount,
            receipt_date=today,
            bank_ledger_id=bank_id,
            receivable_ledger_id=recv_id,
            currency="USD",
            exchange_rate_to_base=Decimal("1"),
            idempotency_key="demo-phase1-pi-receipt-v1",
        )
        receipt_info = {
            "allocation_id": alloc.id,
            "voucher_id": voucher.id,
            "created": created,
            "outstanding": float(outstanding.outstanding_for_new),
        }
    except Exception as exc:  # noqa: BLE001
        receipt_info = {"skipped": str(exc)}

    # n. 5 employees + structure assignment + attendance
    basic = (
        await db.execute(
            select(PayrollComponent).where(
                PayrollComponent.tenant_id == tid, PayrollComponent.code == "DEMO-BASIC"
            )
        )
    ).scalar_one_or_none()
    if not basic:
        basic = PayrollComponent(
            tenant_id=tid,
            code="DEMO-BASIC",
            name="Basic",
            component_type="EARNING",
            calculation_type="FIXED",
            default_amount=Decimal("15000"),
            is_active=True,
        )
        db.add(basic)
        await db.flush()
    structure = (
        await db.execute(
            select(PayrollStructure).where(
                PayrollStructure.tenant_id == tid, PayrollStructure.code == "DEMO-STD"
            )
        )
    ).scalar_one_or_none()
    if not structure:
        structure = PayrollStructure(tenant_id=tid, code="DEMO-STD", name="Demo Standard", is_active=True)
        db.add(structure)
        await db.flush()
        db.add(
            PayrollStructureLine(
                tenant_id=tid,
                structure_id=structure.id,
                component_id=basic.id,
                amount=Decimal("15000"),
                sort_order=0,
            )
        )
        await db.flush()

    employees: list[Employee] = []
    month_start = today.replace(day=1)
    for i in range(1, 6):
        ecode = f"DEMO-EMP-0{i}"
        emp = (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tid, Employee.employee_code == ecode)
            )
        ).scalar_one_or_none()
        if not emp:
            emp = Employee(
                tenant_id=tid,
                employee_code=ecode,
                first_name=f"Demo{i}",
                last_name="Worker",
                is_active=True,
            )
            db.add(emp)
            await db.flush()
        employees.append(emp)
        asgn = (
            await db.execute(
                select(PayrollEmployeeStructureAssignment).where(
                    PayrollEmployeeStructureAssignment.tenant_id == tid,
                    PayrollEmployeeStructureAssignment.employee_id == emp.id,
                )
            )
        ).scalar_one_or_none()
        if not asgn:
            db.add(
                PayrollEmployeeStructureAssignment(
                    tenant_id=tid,
                    employee_id=emp.id,
                    structure_id=structure.id,
                    effective_from=month_start,
                    base_salary=Decimal("15000") + Decimal(i * 500),
                    created_by=user_id,
                )
            )
        # Attendance for a few days
        for d in range(min(5, today.day)):
            ad = month_start + timedelta(days=d)
            if ad > today:
                break
            exists = (
                await db.execute(
                    select(AttendanceEntry).where(
                        AttendanceEntry.tenant_id == tid,
                        AttendanceEntry.employee_id == emp.id,
                        AttendanceEntry.attendance_date == ad,
                    )
                )
            ).scalar_one_or_none()
            if not exists:
                db.add(
                    AttendanceEntry(
                        tenant_id=tid,
                        employee_id=emp.id,
                        attendance_date=ad,
                        status="PRESENT",
                    )
                )
    await db.flush()

    # o. Payroll run + auto-calc preview
    period = (
        await db.execute(
            select(PayrollPeriod).where(
                PayrollPeriod.tenant_id == tid, PayrollPeriod.period_code == MARKER_PERIOD
            )
        )
    ).scalar_one_or_none()
    if not period:
        period = PayrollPeriod(
            tenant_id=tid,
            period_code=MARKER_PERIOD,
            start_date=month_start,
            end_date=today,
            payment_date=today,
            status="OPEN",
            is_locked=False,
        )
        db.add(period)
        await db.flush()
    run = (
        await db.execute(
            select(PayrollRun).where(
                PayrollRun.tenant_id == tid, PayrollRun.run_code == "DEMO-PR-01"
            )
        )
    ).scalar_one_or_none()
    if not run:
        run = PayrollRun(
            tenant_id=tid,
            period_id=period.id,
            status="DRAFT",
            run_code="DEMO-PR-01",
            run_date=today,
            created_by=user_id,
        )
        db.add(run)
        await db.flush()

    _merge_flags(
        tenant,
        {
            DEMO_MODE_FLAG: True,
            "payroll_auto_calculate_enabled": True,
            "trade_enabled": True,
        },
    )
    await db.flush()

    preview_summary: dict[str, Any] = {}
    try:
        preview = await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
        preview_summary = {
            "employees": len(preview.employees),
            "missing_assignments": len(preview.missing_assignment_employee_ids),
            "ready": sum(1 for e in preview.employees if not e.skipped),
        }
    except Exception as exc:  # noqa: BLE001
        preview_summary = {"error": str(exc)}

    summary = {
        "customer_id": customer.id,
        "inquiry_id": inquiry.id,
        "quotation_id": quotation.id,
        "order_id": order.id,
        "order_code": MARKER_ORDER,
        "bom_id": bom.id,
        "po_ids": [p.id for p in pos],
        "grn_ids": [g.id for g in grns],
        "line_allocation_id": alloc.id,
        "challan_id": challan.id,
        "packing_list_id": pl.id,
        "commercial_invoice_id": ci.id if ci else None,
        "commercial_invoice_status": ci.status if ci else None,
        "proforma_id": pi.id,
        "receipt": receipt_info,
        "employee_ids": [e.id for e in employees],
        "payroll_run_id": run.id,
        "payroll_preview": preview_summary,
    }
    _merge_flags(
        tenant,
        {
            MARKER_KEY: {
                "seeded_at": datetime.utcnow().isoformat(),
                "version": 1,
                "summary": summary,
            },
            DEMO_MODE_FLAG: True,
        },
    )
    await db.commit()

    counts = await _count_demo_records(db, tid)
    return {
        "status": "seeded",
        "tenant_id": tid,
        "company_code": code,
        "marker": MARKER_KEY,
        "summary": summary,
        "counts": counts,
        "credentials": creds,
        "narrative": _narrative(MARKER_ORDER),
    }


def _narrative(order_code: str) -> str:
    return (
        f"Start here: Order #{order_code} → view cost breakdown → see margin at 18% → "
        "check packing list → issue commercial invoice → record partial payment → "
        "auto-calculate payroll"
    )


def print_seed_report(result: dict[str, Any]) -> None:
    print("=" * 64)
    print("Phase 1.5 demo seed")
    print("=" * 64)
    print(f"Status: {result.get('status')}")
    print(f"Tenant: {result.get('company_code')} (id={result.get('tenant_id')})")
    print(f"Marker: {result.get('marker')}")
    summary = result.get("summary") or {}
    if summary:
        print("\nCreated / linked records:")
        for k, v in summary.items():
            print(f"  - {k}: {v}")
    counts = result.get("counts") or {}
    if counts:
        print("\nCounts:")
        for k, v in counts.items():
            print(f"  - {k}: {v}")
    creds = result.get("credentials") or {}
    if creds:
        print("\nDemo login:")
        print(f"  Company code: {creds.get('company_code')}")
        print(f"  Username:     {creds.get('username')}")
        print(f"  Password:     {creds.get('password')}")
    print("\nSuggested demo narrative:")
    print(f"  {result.get('narrative')}")
    print("=" * 64)
