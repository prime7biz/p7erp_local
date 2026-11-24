"""AI assistant screen context: tenant-scoped, permission-checked record summaries + citations."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models import Inquiry, Role
from app.models.finance import OutstandingBill
from app.modules.ai_tool.schemas import AiChatRequest, AiScreenContextIn
from app.modules.ai_tool.screen_context import resolve_screen_context
from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def test_chat_request_accepts_optional_context():
    assert AiChatRequest(prompt="hi").context is None
    req = AiChatRequest(prompt="status?", context={"route": "/app/orders/5", "record_type": "order", "record_id": 5})
    assert req.context and req.context.record_type == "order"
    with pytest.raises(Exception):
        AiChatRequest(prompt="x", context={"record_type": "salary", "record_id": 1})


@pytest.mark.asyncio
async def test_resolve_order_context_scoped_and_permissioned(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    order.delivery_date = date(2026, 12, 15)
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()

    ctx = await resolve_screen_context(db, tenant=tenant, user=user, record_type="order", record_id=order.id)
    assert ctx is not None
    assert ctx.label == f"Order {order.order_code}"
    assert ctx.href == f"/app/orders/{order.id}"
    assert ctx.facts["delivery_date"] == "2026-12-15"
    assert ctx.facts["buyer"] == customer.name
    assert ctx.citation()["href"] == ctx.href
    assert order.order_code in ctx.summary_line()

    cust = await resolve_screen_context(db, tenant=tenant, user=user, record_type="customer", record_id=customer.id)
    assert cust is not None and cust.facts["open_orders"] >= 1

    # Another tenant cannot see this order.
    assert await resolve_screen_context(db, tenant=other_tenant, user=outsider, record_type="order", record_id=order.id) is None
    # Unknown type / bad id.
    assert await resolve_screen_context(db, tenant=tenant, user=user, record_type="salary", record_id=order.id) is None
    assert await resolve_screen_context(db, tenant=tenant, user=user, record_type="order", record_id=0) is None

    # RBAC enforce: a role without merch.access gets no order context.
    role = Role(
        tenant_id=tenant.id,
        name="hr_clerk_ctx",
        display_name="HR clerk",
        permissions={"merch.access": False, "hr.access": True},
    )
    db.add(role)
    await db.flush()
    user.role_id = role.id
    tenant.feature_flags = {**(tenant.feature_flags or {}), "rbac_enforcement": "enforce"}
    await db.commit()
    assert await resolve_screen_context(db, tenant=tenant, user=user, record_type="order", record_id=order.id) is None


@pytest.mark.asyncio
async def test_customer_screen_context_hides_receivables_from_merch_only(db_session_integration):
    """Merch-only users get commercial defaults + order counts, never open receivable amounts.

    Admin (may_view_mfg_finance) and a role with explicit ai.tools.finance.read do get them.
    Plain finance.access alone is not enough when the role is not admin/manager and lacks
    ai.tools.finance.read / mis_report.view.
    """
    db = db_session_integration
    tenant, admin, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    customer.preferred_currency = "USD"
    customer.default_incoterm = "FOB"
    customer.payment_terms = "LC 90 Days"
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    order.delivery_date = date.today() - timedelta(days=10)

    db.add(
        OutstandingBill(
            tenant_id=tenant.id,
            bill_no=f"AR-CTX-{customer.id}",
            party_name=customer.name,
            customer_id=customer.id,
            bill_type="RECEIVABLE",
            bill_date=date.today() - timedelta(days=30),
            due_date=date.today() + timedelta(days=30),
            amount=Decimal("1500.0000"),
            paid_amount=Decimal("500.0000"),
            currency="USD",
            status="OPEN",
        )
    )

    merch_role = Role(
        tenant_id=tenant.id,
        name="merch_clerk_ctx",
        display_name="Merch clerk",
        permissions={
            "merch.access": True,
            "finance.access": False,
            "ai.tools.finance.read": False,
            "finance.mis_report.view": False,
        },
    )
    finance_only_role = Role(
        tenant_id=tenant.id,
        name="finance_clerk_no_ai_ctx",
        display_name="Finance clerk (no money AI)",
        permissions={
            "merch.access": True,
            "finance.access": True,
            "ai.tools.finance.read": False,
            "finance.mis_report.view": False,
        },
    )
    ai_finance_role = Role(
        tenant_id=tenant.id,
        name="ai_finance_reader_ctx",
        display_name="AI finance reader",
        permissions={
            "merch.access": True,
            "finance.access": True,
            "ai.tools.finance.read": True,
            "finance.mis_report.view": False,
        },
    )
    db.add_all([merch_role, finance_only_role, ai_finance_role])
    await db.flush()

    from app.models import User

    merch_user = User(
        tenant_id=tenant.id,
        role_id=merch_role.id,
        username=f"merch_ctx_{customer.id}",
        email=f"merch_ctx_{customer.id}@example.com",
        password_hash="unused",
        is_active=True,
    )
    finance_only_user = User(
        tenant_id=tenant.id,
        role_id=finance_only_role.id,
        username=f"fin_only_ctx_{customer.id}",
        email=f"fin_only_ctx_{customer.id}@example.com",
        password_hash="unused",
        is_active=True,
    )
    ai_finance_user = User(
        tenant_id=tenant.id,
        role_id=ai_finance_role.id,
        username=f"ai_fin_ctx_{customer.id}",
        email=f"ai_fin_ctx_{customer.id}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add_all([merch_user, finance_only_user, ai_finance_user])
    tenant.feature_flags = {**(tenant.feature_flags or {}), "rbac_enforcement": "enforce"}
    await db.commit()

    admin_ctx = await resolve_screen_context(
        db, tenant=tenant, user=admin, record_type="customer", record_id=customer.id
    )
    assert admin_ctx is not None
    assert admin_ctx.facts["preferred_currency"] == "USD"
    assert admin_ctx.facts["default_incoterm"] == "FOB"
    assert admin_ctx.facts["payment_terms"] == "LC 90 Days"
    assert admin_ctx.facts["open_orders"] >= 1
    assert admin_ctx.facts["delayed_orders"] >= 1
    assert admin_ctx.facts["open_receivables"] == 1
    assert Decimal(admin_ctx.facts["open_receivable_amount"]) == Decimal("1000.0000")
    assert "active_job_work" not in admin_ctx.facts  # flag off by default

    merch_ctx = await resolve_screen_context(
        db, tenant=tenant, user=merch_user, record_type="customer", record_id=customer.id
    )
    assert merch_ctx is not None
    assert merch_ctx.facts["open_orders"] >= 1
    assert merch_ctx.facts["preferred_currency"] == "USD"
    assert "open_receivables" not in merch_ctx.facts
    assert "open_receivable_amount" not in merch_ctx.facts

    finance_only_ctx = await resolve_screen_context(
        db, tenant=tenant, user=finance_only_user, record_type="customer", record_id=customer.id
    )
    assert finance_only_ctx is not None
    assert "open_receivables" not in finance_only_ctx.facts
    assert "open_receivable_amount" not in finance_only_ctx.facts

    ai_fin_ctx = await resolve_screen_context(
        db, tenant=tenant, user=ai_finance_user, record_type="customer", record_id=customer.id
    )
    assert ai_fin_ctx is not None
    assert ai_fin_ctx.facts["open_receivables"] == 1
    assert Decimal(ai_fin_ctx.facts["open_receivable_amount"]) == Decimal("1000.0000")


@pytest.mark.asyncio
async def test_resolve_inquiry_and_quotation_screen_context(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    inquiry = Inquiry(
        tenant_id=tenant.id,
        customer_id=customer.id,
        style_id=style.id,
        inquiry_code="INQ-CTX-1",
        status="SUBMITTED",
        quantity=500,
        brand="CtxBrand",
    )
    db.add(inquiry)
    await db.flush()
    quotation, _order = await create_quotation_and_order(db, tenant, customer, style)
    quotation.inquiry_id = inquiry.id
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()

    # Schema accepts inquiry / quotation record types
    assert AiScreenContextIn(record_type="inquiry", record_id=inquiry.id).record_type == "inquiry"
    assert AiScreenContextIn(record_type="quotation", record_id=quotation.id).record_type == "quotation"

    iq = await resolve_screen_context(
        db, tenant=tenant, user=user, record_type="inquiry", record_id=inquiry.id
    )
    assert iq is not None
    assert iq.href == f"/app/inquiries/{inquiry.id}"
    assert "INQ-CTX-1" in iq.label
    assert iq.facts.get("status") == "SUBMITTED"

    qctx = await resolve_screen_context(
        db, tenant=tenant, user=user, record_type="quotation", record_id=quotation.id
    )
    assert qctx is not None
    assert qctx.href == f"/app/quotations/{quotation.id}"

    assert (
        await resolve_screen_context(
            db, tenant=other_tenant, user=outsider, record_type="inquiry", record_id=inquiry.id
        )
        is None
    )

    role = Role(
        tenant_id=tenant.id,
        name="hr_clerk_iq_ctx",
        display_name="HR clerk",
        permissions={"merch.access": False, "hr.access": True},
    )
    db.add(role)
    await db.flush()
    user.role_id = role.id
    tenant.feature_flags = {**(tenant.feature_flags or {}), "rbac_enforcement": "enforce"}
    await db.commit()
    assert (
        await resolve_screen_context(
            db, tenant=tenant, user=user, record_type="inquiry", record_id=inquiry.id
        )
        is None
    )
