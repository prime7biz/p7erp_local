"""PATCH guards on commercially locked quotations (complements change-request tests).

Run: docker compose exec backend pytest tests/test_commercial_lock_enforcement.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Order, Quotation

from tests.merch_fixtures import create_customer, create_merch_tenant_with_user


@pytest.mark.asyncio
async def test_patch_total_amount_blocked_when_quotation_commercially_locked(db_session_integration):
    """QuotationUpdate PATCH only exposes some fields; total_amount is protected when status is APPROVED."""
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"LQ-{slug}"[:16],
        status="APPROVED",
        currency="USD",
        total_amount="100.00",
    )
    db.add(q)
    await db.flush()
    await db.commit()

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
            r = await ac.patch(
                f"/api/v1/quotations/{q.id}",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"total_amount": "999.00"},
            )
        assert r.status_code == 409, r.text
        assert "change" in r.text.lower() or "commercial" in r.text.lower()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_patch_quantity_blocked_when_order_commercially_locked(db_session_integration):
    """Protected commercial field on locked order must require change request (409)."""
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"LO-{slug}"[:16],
        status="NEW",
        currency="USD",
    )
    db.add(q)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_id=q.id,
        order_code=f"LO-{slug}"[:16],
        style_ref="S1",
        status="CONFIRMED",
        quantity=50,
        delivery_date=date.today() + timedelta(days=20),
        shipping_term="FOB",
    )
    db.add(order)
    await db.flush()
    await db.commit()

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
            r = await ac.patch(
                f"/api/v1/orders/{order.id}",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"quantity": 999},
            )
        assert r.status_code == 409, r.text
        assert "change" in r.text.lower() or "commercial" in r.text.lower()
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
