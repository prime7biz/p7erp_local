"""Orders list API: financial_status and sewing_line_summary on paginated response.

Run: docker compose exec backend pytest tests/test_orders_list_summary_integration.py -q
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
from app.models import (
    Facility,
    MasterContract,
    Order,
    ProformaInvoice,
    ProformaInvoiceOrder,
    SewingLine,
    SewingLineStyleConfig,
)

from tests.merch_fixtures import create_customer, create_merch_tenant_with_user


@pytest.mark.asyncio
async def test_orders_paginated_financial_and_sewing_defaults(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"OLS-{slug}"[:16],
        style_ref="S1",
        status="NEW",
        quantity=10,
        delivery_date=date.today() + timedelta(days=30),
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
            r = await ac.get(
                "/api/v1/orders/paginated",
                headers={"X-Tenant-Id": str(tenant.id)},
                params={"page": 1, "page_size": 20},
            )
        assert r.status_code == 200, r.text
        data = r.json()
        row = next((x for x in data["items"] if x["id"] == order.id), None)
        assert row is not None
        fs = row.get("financial_status") or {}
        assert fs.get("pi_issued") is False
        assert fs.get("buyer_document_received") is False
        assert fs.get("bank_facility_linked") is False
        sl = row.get("sewing_line_summary") or {}
        assert sl.get("delivery_on_track") == "unknown"
        assert (sl.get("allocations") or []) == []
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_orders_paginated_financial_pi_mc_facility(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]

    mc = MasterContract(
        tenant_id=tenant.id,
        contract_type="EXPORT_LC",
        reference=f"MC-{slug}"[:32],
        status="ADVISED",
        amount=100_000.0,
        currency="USD",
    )
    db.add(mc)
    await db.flush()

    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"OLF-{slug}"[:16],
        style_ref="S2",
        status="CONFIRMED",
        quantity=20,
        master_contract_id=mc.id,
        delivery_date=date.today() + timedelta(days=40),
    )
    db.add(order)
    await db.flush()

    pi = ProformaInvoice(
        tenant_id=tenant.id,
        reference=f"PI-{slug}"[:32],
        status="SENT",
        direction="EXPORT",
    )
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id, sort_order=0))

    fac = Facility(
        tenant_id=tenant.id,
        facility_code=f"FC-{slug}"[:12],
        facility_type="btb_lc_facility",
        linked_master_contract_id=mc.id,
        status="active",
    )
    db.add(fac)
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
            r = await ac.get(
                "/api/v1/orders/paginated",
                headers={"X-Tenant-Id": str(tenant.id)},
                params={"page": 1, "page_size": 50},
            )
        assert r.status_code == 200, r.text
        row = next((x for x in r.json()["items"] if x["id"] == order.id), None)
        assert row is not None
        fs = row["financial_status"]
        assert fs["pi_issued"] is True
        assert fs["buyer_document_received"] is True
        assert fs["master_contract_type"] == "EXPORT_LC"
        assert fs["bank_facility_linked"] is True
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_orders_paginated_sewing_line_delivery_on_track(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]

    line = SewingLine(
        tenant_id=tenant.id,
        line_code=f"L-{slug}"[:8],
        name="Line A",
    )
    db.add(line)
    await db.flush()

    delivery = date.today() + timedelta(days=60)
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"OLS2-{slug}"[:16],
        style_ref="S3",
        status="IN_PROGRESS",
        quantity=100,
        delivery_date=delivery,
        production_started_at=None,
    )
    db.add(order)
    await db.flush()

    cfg = SewingLineStyleConfig(
        tenant_id=tenant.id,
        line_id=line.id,
        order_id=order.id,
        start_date=date.today(),
        planned_end_date=delivery - timedelta(days=5),
        reservation_status="FIRM_BOOKED",
        firm_booked_at=None,
        soft_booked_at=None,
    )
    db.add(cfg)
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
            r = await ac.get(
                "/api/v1/orders/paginated",
                headers={"X-Tenant-Id": str(tenant.id)},
                params={"page": 1, "page_size": 50},
            )
        assert r.status_code == 200, r.text
        row = next((x for x in r.json()["items"] if x["id"] == order.id), None)
        assert row is not None
        sl = row["sewing_line_summary"]
        assert sl["delivery_on_track"] == "yes"
        assert sl["primary_line_code"] == f"L-{slug}"[:8]
        assert len(sl["allocations"]) == 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
