"""Commercial governance timeline API (Phase 4)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Customer, Order, Quotation, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role

from tests.merch_fixtures import create_customer, create_merch_tenant_with_user


async def _locked_order_setup(db):
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"QT-TL-{slug}"[:16],
        style_ref="S1",
        currency="USD",
        status="NEW",
    )
    db.add(quotation)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_id=quotation.id,
        order_code=f"TL-{slug}"[:16],
        style_ref="S1",
        status="CONFIRMED",
        quantity=100,
        delivery_date=date.today() + timedelta(days=30),
        shipping_term="FOB",
    )
    db.add(order)
    await db.flush()
    await db.commit()
    return tenant, user, order


@pytest.mark.asyncio
async def test_order_commercial_timeline_includes_propose_audit(db_session_integration):
    db = db_session_integration
    tenant, user, order = await _locked_order_setup(db)

    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            cr = await ac.post(
                "/api/v1/change-requests",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "entity_type": "order",
                    "entity_id": order.id,
                    "field_key": "quantity",
                    "new_value": 150,
                    "reason": "Timeline test propose",
                },
            )
            assert cr.status_code == 201, cr.text

            tl = await ac.get(
                f"/api/v1/orders/{order.id}/commercial-timeline",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert tl.status_code == 200, tl.text
            body = tl.json()
            assert body["entity_type"] == "order"
            assert body["entity_id"] == order.id
            events = body["events"]
            assert len(events) >= 1
            actions = {e["action"] for e in events}
            assert "COMMERCIAL_CHANGE_PROPOSED" in actions
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_order_commercial_timeline_cross_tenant_404(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, order = await _locked_order_setup(db)

    slug_b = uuid.uuid4().hex[:8]
    tenant_b = Tenant(
        name=f"TL-B-{slug_b}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"tlb{slug_b}"[:18],
    )
    db.add(tenant_b)
    await db.flush()
    role_b = Role(
        tenant_id=tenant_b.id,
        name="admin",
        display_name="Admin",
        permissions={"*": True},
    )
    db.add(role_b)
    await db.flush()
    user_b = User(
        tenant_id=tenant_b.id,
        role_id=role_b.id,
        username=f"tlbu{slug_b}",
        email=f"tlbu{slug_b}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user_b)
    await db.flush()
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return user_b

    async def override_tenant():
        return tenant_b

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                f"/api/v1/orders/{order.id}/commercial-timeline",
                headers={"X-Tenant-Id": str(tenant_b.id)},
            )
            assert r.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
