"""AI assistant screen context: tenant-scoped, permission-checked record summaries + citations."""

from __future__ import annotations

from datetime import date

import pytest

from app.models import Role
from app.modules.ai_tool.schemas import AiChatRequest
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
