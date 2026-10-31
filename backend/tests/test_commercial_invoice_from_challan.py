"""Phase 1.2: commercial invoice from delivery challan + qty cap + ISSUE AR."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import (
    ChartOfAccount,
    Customer,
    DeliveryChallan,
    DeliveryChallanItem,
    DeliveryChallanOrder,
    Item,
    ItemCategory,
    ItemUnit,
    Order,
    Tenant,
    User,
    Voucher,
    Warehouse,
)
from app.models.commercial import CommercialInvoiceLine
from app.models.finance import AccountGroup, AccountingSystemMapping
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.commercial.commercial_invoice_service import (
    cancel_commercial_invoice,
    create_invoices_from_delivery_challan,
    create_receipt_from_commercial_invoice,
    issue_commercial_invoice,
    order_has_fully_paid_commercial_invoice,
    resolve_selling_unit_price,
)
from app.modules.orders.pipeline_service import _has_payment


async def _seed_challan_world(db, *, quoted_price: str = "10.00", qty: str = "100"):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"CI {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ci{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"ci{slug}",
        email=f"ci{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(tenant_id=tenant.id, customer_code=f"C{slug}"[:10], name="Buyer")
    db.add(customer)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"OR{slug}"[:14],
        status="CONFIRMED",
        pipeline_status="SHIPPED",
        quantity=100,
        commercial_snapshot_json={
            "quoted_price": quoted_price,
            "document_currency": "USD",
        },
    )
    db.add(order)
    await db.flush()

    cat = ItemCategory(tenant_id=tenant.id, name=f"Cat{slug}"[:32], category_code=f"c{slug}"[:8])
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, name="PCS", unit_code=f"u{slug}"[:8])
    db.add(unit)
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"I{slug}"[:12],
        name="FG Tee",
        category_id=cat.id,
        unit_id=unit.id,
    )
    db.add(item)
    await db.flush()
    wh = Warehouse(tenant_id=tenant.id, name=f"WH{slug}"[:32], warehouse_code=f"w{slug}"[:8])
    db.add(wh)
    await db.flush()

    challan = DeliveryChallan(
        tenant_id=tenant.id,
        challan_code=f"DC{slug}"[:14],
        customer_name="Buyer",
        delivery_date=date.today(),
        status="POSTED",
        created_by_user_id=user.id,
    )
    db.add(challan)
    await db.flush()
    line = DeliveryChallanItem(
        tenant_id=tenant.id,
        challan_id=challan.id,
        item_id=item.id,
        warehouse_id=wh.id,
        quantity=Decimal(qty),
    )
    db.add(line)
    db.add(
        DeliveryChallanOrder(
            tenant_id=tenant.id,
            delivery_challan_id=challan.id,
            order_id=order.id,
        )
    )
    await db.flush()

    group = AccountGroup(
        tenant_id=tenant.id,
        name=f"AG-{slug}"[:32],
        code=f"G{slug}"[:8],
        nature="Assets",
    )
    db.add(group)
    await db.flush()
    bank = ChartOfAccount(
        tenant_id=tenant.id,
        group_id=group.id,
        account_number=f"1{slug[:6]}",
        name="Bank",
        normal_balance="debit",
        is_active=True,
        account_type="posting",
    )
    ar = ChartOfAccount(
        tenant_id=tenant.id,
        group_id=group.id,
        account_number=f"2{slug[:6]}",
        name="Export Receivable",
        normal_balance="debit",
        is_active=True,
        account_type="posting",
        system_code="EXPORT_RECEIVABLE",
    )
    rev = ChartOfAccount(
        tenant_id=tenant.id,
        group_id=group.id,
        account_number=f"3{slug[:6]}",
        name="Export Sales",
        normal_balance="credit",
        is_active=True,
        account_type="posting",
        system_code="SALES_REVENUE_EXPORT",
    )
    db.add_all([bank, ar, rev])
    await db.flush()
    db.add(
        AccountingSystemMapping(
            tenant_id=tenant.id,
            mapping_key="EXPORT_RECEIVABLE",
            ledger_id=ar.id,
            module="COMMERCIAL",
        )
    )
    db.add(
        AccountingSystemMapping(
            tenant_id=tenant.id,
            mapping_key="SALES_REVENUE_EXPORT",
            ledger_id=rev.id,
            module="COMMERCIAL",
        )
    )
    await db.flush()
    return tenant, user, order, challan, item, bank, ar


@pytest.mark.asyncio
async def test_create_ci_from_challan_uses_snapshot_price(db_session_integration):
    db = db_session_integration
    tenant, user, order, challan, item, _bank, _ar = await _seed_challan_world(
        db, quoted_price="12.50", qty="40"
    )
    invoices, created = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="ci-1",
        exchange_rate_to_base=Decimal("110"),
    )
    assert created is True
    assert len(invoices) == 1
    inv = invoices[0]
    assert inv.status == "DRAFT"
    assert float(inv.total_amount) == 500.0  # 40 * 12.50
    assert float(inv.base_total_amount) == 55000.0
    assert inv.price_review_required is False
    lines = list(
        (
            await db.execute(
                select(CommercialInvoiceLine).where(
                    CommercialInvoiceLine.commercial_invoice_id == inv.id
                )
            )
        ).scalars().all()
    )
    assert len(lines) == 1
    assert lines[0].price_source == "SNAPSHOT_QUOTED"
    assert lines[0].order_id == order.id
    assert lines[0].item_id == item.id


@pytest.mark.asyncio
async def test_qty_cap_rejects_second_invoice(db_session_integration):
    db = db_session_integration
    tenant, user, _order, challan, _item, _bank, _ar = await _seed_challan_world(db, qty="50")
    await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="cap-1",
    )
    with pytest.raises(Exception) as exc:
        await create_invoices_from_delivery_challan(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            challan_id=challan.id,
            idempotency_key="cap-2",
        )
    assert "exceed shipped" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_idempotent_from_challan(db_session_integration):
    db = db_session_integration
    tenant, user, _order, challan, _item, _bank, _ar = await _seed_challan_world(db)
    a, c1 = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="same",
    )
    b, c2 = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="same",
    )
    assert c1 is True and c2 is False
    assert a[0].id == b[0].id


@pytest.mark.asyncio
async def test_issue_creates_draft_ar_and_blocks_without_price(db_session_integration):
    db = db_session_integration
    tenant, user, order, challan, _item, _bank, _ar = await _seed_challan_world(
        db, quoted_price="0", qty="10"
    )
    # Force missing price
    order.commercial_snapshot_json = {"document_currency": "USD"}
    await db.flush()
    invoices, _ = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="noprice",
    )
    inv = invoices[0]
    assert inv.price_review_required is True
    with pytest.raises(Exception) as exc:
        await issue_commercial_invoice(db, tenant_id=tenant.id, user_id=user.id, invoice=inv)
    assert "price review" in str(exc.value.detail).lower()

    # Fix price via snapshot and recreate (use new challan qty available - same challan already drafted)
    # Cancel path: mark cancelled then new key would still hit qty cap. Update lines instead.
    inv.price_review_required = False
    lines = list(
        (
            await db.execute(
                select(CommercialInvoiceLine).where(
                    CommercialInvoiceLine.commercial_invoice_id == inv.id
                )
            )
        ).scalars().all()
    )
    for ln in lines:
        ln.unit_price = Decimal("5")
        ln.line_amount = Decimal("50")
        ln.price_source = "MANUAL"
    inv.total_amount = Decimal("50")
    inv.base_total_amount = Decimal("50")
    await db.flush()

    await issue_commercial_invoice(db, tenant_id=tenant.id, user_id=user.id, invoice=inv)
    assert inv.status == "ISSUED"
    assert inv.ar_voucher_id is not None
    voucher = await db.get(Voucher, inv.ar_voucher_id)
    assert voucher is not None
    assert voucher.status == "DRAFT"
    assert (voucher.source_module or "") == "COMMERCIAL_INVOICE"
    assert voucher.voucher_type == "JOURNAL"


@pytest.mark.asyncio
async def test_pipeline_prefers_ci_outstanding(db_session_integration):
    db = db_session_integration
    tenant, user, order, challan, _item, bank, ar = await _seed_challan_world(
        db, quoted_price="2.00", qty="10"
    )
    invoices, _ = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="pay-ci",
    )
    inv = invoices[0]
    await issue_commercial_invoice(db, tenant_id=tenant.id, user_id=user.id, invoice=inv)

    assert await order_has_fully_paid_commercial_invoice(db, tenant_id=tenant.id, order_id=order.id) is False
    assert await _has_payment(db, tenant.id, order.id) is False

    alloc, voucher, _, _ = await create_receipt_from_commercial_invoice(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        invoice=inv,
        amount=Decimal("20.00"),
        receipt_date=date.today(),
        bank_ledger_id=bank.id,
        receivable_ledger_id=ar.id,
        currency="USD",
        exchange_rate_to_base=Decimal("1"),
        idempotency_key="full",
    )
    assert await _has_payment(db, tenant.id, order.id) is False
    voucher.status = "POSTED"
    alloc.status = "POSTED"
    alloc.updated_at = datetime.utcnow()
    await db.flush()
    assert await order_has_fully_paid_commercial_invoice(db, tenant_id=tenant.id, order_id=order.id) is True
    assert await _has_payment(db, tenant.id, order.id) is True


@pytest.mark.asyncio
async def test_no_linked_order_rejects(db_session_integration):
    db = db_session_integration
    tenant, user, _order, challan, _item, _bank, _ar = await _seed_challan_world(db)
    # Unlink orders
    from app.models import DeliveryChallanOrder
    from sqlalchemy import delete

    await db.execute(
        delete(DeliveryChallanOrder).where(DeliveryChallanOrder.delivery_challan_id == challan.id)
    )
    await db.flush()
    with pytest.raises(Exception) as exc:
        await create_invoices_from_delivery_challan(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            challan_id=challan.id,
            idempotency_key="no-order",
        )
    assert "link at least one" in str(exc.value.detail).lower()


@pytest.mark.asyncio
async def test_split_required_for_mixed_customers(db_session_integration):
    db = db_session_integration
    tenant, user, order, challan, item, _bank, _ar = await _seed_challan_world(db)
    other = Customer(tenant_id=tenant.id, customer_code=f"C2{uuid.uuid4().hex[:6]}", name="Buyer 2")
    db.add(other)
    await db.flush()
    order2 = Order(
        tenant_id=tenant.id,
        customer_id=other.id,
        order_code=f"OR2{uuid.uuid4().hex[:8]}"[:14],
        status="CONFIRMED",
        pipeline_status="SHIPPED",
        quantity=50,
        commercial_snapshot_json={"quoted_price": "8.00", "document_currency": "USD"},
    )
    db.add(order2)
    await db.flush()
    db.add(
        DeliveryChallanOrder(
            tenant_id=tenant.id,
            delivery_challan_id=challan.id,
            order_id=order2.id,
        )
    )
    await db.flush()

    with pytest.raises(Exception) as exc:
        await create_invoices_from_delivery_challan(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            challan_id=challan.id,
            idempotency_key="split-1",
        )
    detail = exc.value.detail
    assert isinstance(detail, dict)
    assert detail.get("code") == "split_required"

    invoices, created = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="split-1",
        allow_split=True,
    )
    assert created is True
    assert len(invoices) == 2
    customer_ids = {inv.customer_id for inv in invoices}
    assert customer_ids == {order.customer_id, other.id}


@pytest.mark.asyncio
async def test_price_resolution_pi_then_quotation(db_session_integration):
    db = db_session_integration
    from app.models.commercial import ProformaInvoice, ProformaInvoiceOrder
    from app.models.merch import Quotation

    tenant, user, order, challan, _item, _bank, _ar = await _seed_challan_world(
        db, quoted_price="0", qty="10"
    )
    order.commercial_snapshot_json = {"document_currency": "USD"}
    await db.flush()

    # No PI / no quotation → MISSING
    invoices, _ = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="miss",
    )
    assert invoices[0].price_review_required is True
    lines = list(
        (
            await db.execute(
                select(CommercialInvoiceLine).where(
                    CommercialInvoiceLine.commercial_invoice_id == invoices[0].id
                )
            )
        ).scalars().all()
    )
    assert lines[0].price_source == "MISSING"

    # Fresh challan world for PI path
    tenant2, user2, order2, challan2, _item2, _bank2, _ar2 = await _seed_challan_world(
        db, quoted_price="0", qty="20"
    )
    order2.commercial_snapshot_json = {"document_currency": "USD"}
    order2.quantity = 20
    await db.flush()
    pi = ProformaInvoice(
        tenant_id=tenant2.id,
        direction="EXPORT",
        reference=f"PI-{uuid.uuid4().hex[:8]}",
        status="ISSUED",
        amount=200.0,  # 200 / 20 = 10 unit
        currency="USD",
        invoice_date=date.today(),
    )
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order2.id))
    await db.flush()

    invoices2, _ = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant2.id,
        user_id=user2.id,
        challan_id=challan2.id,
        idempotency_key="pi-price",
    )
    assert invoices2[0].price_review_required is False
    assert float(invoices2[0].total_amount) == 200.0  # 20 * 10
    lines2 = list(
        (
            await db.execute(
                select(CommercialInvoiceLine).where(
                    CommercialInvoiceLine.commercial_invoice_id == invoices2[0].id
                )
            )
        ).scalars().all()
    )
    assert lines2[0].price_source == "PI_DERIVED"

    # Quotation confirmed fallback (unit helper)
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=order.customer_id,
        quotation_code=f"Q{uuid.uuid4().hex[:8]}"[:16],
        quoted_price=Decimal("15.00"),
        status="SENT",
    )
    unit, source, _ref, review = resolve_selling_unit_price(
        order=order,
        pi=None,
        live_quotation=q,
        confirm_quotation_fallback=True,
    )
    assert review is False
    assert source == "QUOTATION_CONFIRMED"
    assert float(unit or 0) == 15.0

    unit2, source2, _ref2, review2 = resolve_selling_unit_price(
        order=order,
        pi=None,
        live_quotation=q,
        confirm_quotation_fallback=False,
    )
    assert review2 is True
    assert source2 == "MISSING"
    assert unit2 is None


@pytest.mark.asyncio
async def test_cancel_issued_invoice_and_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, user, _order, challan, _item, _bank, _ar = await _seed_challan_world(
        db, quoted_price="5.00", qty="10"
    )
    invoices, _ = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="cancel-1",
    )
    inv = invoices[0]
    await issue_commercial_invoice(db, tenant_id=tenant.id, user_id=user.id, invoice=inv)
    assert inv.issued_at is not None
    await cancel_commercial_invoice(db, tenant_id=tenant.id, invoice=inv)
    assert inv.status == "CANCELLED"
    assert inv.cancelled_at is not None

    # After cancel, qty is freed — can invoice again with new key
    invoices2, created2 = await create_invoices_from_delivery_challan(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        challan_id=challan.id,
        idempotency_key="cancel-2",
    )
    assert created2 is True
    assert len(invoices2) == 1

    other_tenant, other_user, _o2, other_challan, _i2, _b2, _a2 = await _seed_challan_world(db)
    with pytest.raises(Exception) as exc:
        await create_invoices_from_delivery_challan(
            db,
            tenant_id=other_tenant.id,
            user_id=other_user.id,
            challan_id=challan.id,  # wrong tenant's challan
            idempotency_key="iso",
        )
    assert exc.value.status_code == 404
