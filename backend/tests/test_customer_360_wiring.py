"""Phase 3 FK wiring + Phase 4 Customer 360/timeline tests.

Run: docker compose exec backend pytest tests/test_customer_360_wiring.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.delete_guards import ensure_customer_deletable
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Customer, MasterContract, Order, Tenant, User, Vendor
from app.models.tenant import TenantType
from app.models.user import Role
from fastapi import HTTPException


async def _seed(db, *, slug: str | None = None, role_name: str = "admin", permissions: dict | None = None):
    slug = slug or uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"C360 {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"c3{slug}"[:18],
        feature_flags={"rbac_enforcement": "enforce", "customer_portal_enabled": True},
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name=role_name,
        display_name=role_name.title(),
        permissions=permissions if permissions is not None else {},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"u{slug}",
        email=f"u{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user, role


def _override(app_obj, db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app_obj.dependency_overrides[get_db] = override_db
    app_obj.dependency_overrides[get_current_user] = override_user
    app_obj.dependency_overrides[require_tenant] = override_tenant


def _clear(app_obj):
    app_obj.dependency_overrides.pop(get_db, None)
    app_obj.dependency_overrides.pop(get_current_user, None)
    app_obj.dependency_overrides.pop(require_tenant, None)


async def _customer(db, tenant, name="Buyer Co"):
    c = Customer(
        tenant_id=tenant.id,
        customer_code=f"CUST-{uuid.uuid4().hex[:6].upper()}",
        name=name,
        status="active",
    )
    db.add(c)
    await db.flush()
    return c


@pytest.mark.asyncio
async def test_360_and_timeline_cross_tenant_404(db_session_integration):
    db = db_session_integration
    t1, u1, _ = await _seed(db, slug="a1")
    t2, _, _ = await _seed(db, slug="a2")
    c2 = await _customer(db, t2)
    await db.commit()

    _override(app, db, u1, t1)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r360 = await client.get(f"/api/v1/customers/{c2.id}/360")
            r_tl = await client.get(f"/api/v1/customers/{c2.id}/timeline")
            assert r360.status_code == 404
            assert r_tl.status_code == 404
    finally:
        _clear(app)


@pytest.mark.asyncio
async def test_360_finance_denied_returns_allowed_false(db_session_integration):
    db = db_session_integration
    # Merch-only role: merch.access true, finance.access explicit false
    t, user, _ = await _seed(
        db,
        slug="m1",
        role_name="merchandiser",
        permissions={"merch.access": True, "finance.access": False, "settings.access": False},
    )
    c = await _customer(db, t)
    await db.commit()

    _override(app, db, user, t)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(
                f"/api/v1/customers/{c.id}/360",
                params={"sections": "summary,finance,portal,operations"},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["sections"]["summary"]["allowed"] is True
            assert body["sections"]["finance"] == {"allowed": False}
            assert body["sections"]["portal"] == {"allowed": False}
            # inventory.access missing under enforce → operations denied
            assert body["sections"]["operations"] == {"allowed": False}
            # No leaked money keys
            assert "ar_aging_rows" not in body["sections"]["finance"]
            # Summary health must not expose AR open-count without finance.access
            health = (body["sections"]["summary"] or {}).get("health") or {}
            assert health.get("outstanding_receivable_count", 0) == 0
    finally:
        _clear(app)


@pytest.mark.asyncio
async def test_export_pi_auto_derive_and_import_reject(db_session_integration):
    db = db_session_integration
    t, user, _ = await _seed(db, slug="pi1")
    c = await _customer(db, t, name="PI Buyer")
    c2 = await _customer(db, t, name="Other Buyer")
    o1 = Order(
        tenant_id=t.id,
        order_code=f"ORD-{uuid.uuid4().hex[:5].upper()}",
        customer_id=c.id,
        status="CONFIRMED",
        quantity=100,
    )
    o2 = Order(
        tenant_id=t.id,
        order_code=f"ORD-{uuid.uuid4().hex[:5].upper()}",
        customer_id=c2.id,
        status="CONFIRMED",
        quantity=50,
    )
    db.add_all([o1, o2])
    await db.commit()

    _override(app, db, user, t)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            vendor = Vendor(
                tenant_id=t.id,
                vendor_code=f"V-{uuid.uuid4().hex[:5].upper()}",
                name="Import Vendor",
            )
            db.add(vendor)
            await db.flush()
            # IMPORT rejects customer_id (after vendor present)
            bad = await client.post(
                "/api/v1/commercial/proforma-invoices",
                json={
                    "reference": f"PI-IMP-{uuid.uuid4().hex[:4]}",
                    "direction": "IMPORT",
                    "customer_id": c.id,
                    "order_ids": [],
                    "vendor_id": vendor.id,
                    "master_contract_id": None,
                },
            )
            assert bad.status_code == 400, bad.text
            assert "customer_id" in bad.text.lower()

            # Single-customer EXPORT auto-derives
            ok = await client.post(
                "/api/v1/commercial/proforma-invoices",
                json={
                    "reference": f"PI-EX-{uuid.uuid4().hex[:4]}",
                    "direction": "EXPORT",
                    "order_ids": [o1.id],
                    "amount": 10,
                },
            )
            assert ok.status_code == 201, ok.text
            assert ok.json()["customer_id"] == c.id

            # Multi-customer EXPORT leaves null when no explicit pick
            multi = await client.post(
                "/api/v1/commercial/proforma-invoices",
                json={
                    "reference": f"PI-MX-{uuid.uuid4().hex[:4]}",
                    "direction": "EXPORT",
                    "order_ids": [o1.id, o2.id],
                    "amount": 10,
                },
            )
            assert multi.status_code == 201, multi.text
            assert multi.json()["customer_id"] is None
    finally:
        _clear(app)


@pytest.mark.asyncio
async def test_payable_bill_rejects_customer_id_and_aging_ownership(db_session_integration):
    db = db_session_integration
    t, user, _ = await _seed(db, slug="b1")
    t2, _, _ = await _seed(db, slug="b2")
    c = await _customer(db, t, name="AR Buyer")
    foreign = await _customer(db, t2, name="Foreign")
    await db.commit()

    _override(app, db, user, t)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            pay = await client.post(
                "/api/v1/finance/bills",
                json={
                    "party_name": "Vendor X",
                    "customer_id": c.id,
                    "bill_type": "PAYABLE",
                    "bill_date": str(date.today()),
                    "due_date": str(date.today() + timedelta(days=7)),
                    "amount": "100.00",
                },
            )
            assert pay.status_code == 400, pay.text

            ar = await client.post(
                "/api/v1/finance/bills",
                json={
                    "party_name": "AR Buyer",
                    "customer_id": c.id,
                    "bill_type": "RECEIVABLE",
                    "bill_date": str(date.today()),
                    "due_date": str(date.today() + timedelta(days=7)),
                    "amount": "200.00",
                },
            )
            assert ar.status_code == 200, ar.text
            assert ar.json().get("customer_id") == c.id

            aging_ok = await client.get(
                "/api/v1/finance/bills/aging",
                params={"customer_id": c.id, "bill_type": "RECEIVABLE"},
            )
            assert aging_ok.status_code == 200, aging_ok.text

            aging_bad = await client.get(
                "/api/v1/finance/bills/aging",
                params={"customer_id": foreign.id, "bill_type": "RECEIVABLE"},
            )
            assert aging_bad.status_code == 404
    finally:
        _clear(app)


@pytest.mark.asyncio
async def test_delete_guard_blocks_new_customer_fks(db_session_integration):
    db = db_session_integration
    t, _, _ = await _seed(db, slug="d1")
    c = await _customer(db, t)
    mc = MasterContract(
        tenant_id=t.id,
        reference=f"MC-{uuid.uuid4().hex[:4]}",
        status="DRAFT",
        customer_id=c.id,
    )
    db.add(mc)
    await db.commit()

    with pytest.raises(HTTPException) as ei:
        await ensure_customer_deletable(db, t.id, c.id)
    assert ei.value.status_code == 409
    assert "master contracts" in str(ei.value.detail).lower()


@pytest.mark.asyncio
async def test_master_contract_and_export_case_customer_id(db_session_integration):
    db = db_session_integration
    t, user, _ = await _seed(db, slug="e1")
    c = await _customer(db, t)
    o = Order(
        tenant_id=t.id,
        order_code=f"ORD-{uuid.uuid4().hex[:5].upper()}",
        customer_id=c.id,
        status="CONFIRMED",
        quantity=10,
    )
    db.add(o)
    await db.commit()

    _override(app, db, user, t)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            mc = await client.post(
                "/api/v1/commercial/master-contracts",
                json={
                    "reference": f"MC-{uuid.uuid4().hex[:4]}",
                    "customer_id": c.id,
                    "buyer_name": c.name,
                },
            )
            assert mc.status_code == 201, mc.text
            assert mc.json()["customer_id"] == c.id

            ec = await client.post(
                "/api/v1/commercial/export-cases",
                json={
                    "reference": f"EC-{uuid.uuid4().hex[:4]}",
                    "order_id": o.id,
                },
            )
            assert ec.status_code == 201, ec.text
            assert ec.json()["customer_id"] == c.id
    finally:
        _clear(app)
