"""Customer commercial profile + contacts + duplicate-check (Phase 1/2).

Run: docker compose exec backend pytest tests/test_customer_crud_and_contacts.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Customer, CustomerContact, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.customers import service as customer_service
from app.modules.customers.schemas import CustomerCreate, CustomerUpdate
from app.modules.data_migration.importers import import_customers


async def _seed_tenant_user(db, *, slug: str | None = None):
    slug = slug or uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"CustProf {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"cp{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"cp{slug}",
        email=f"cp{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user


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


def _clear_overrides(app_obj):
    app_obj.dependency_overrides.pop(get_db, None)
    app_obj.dependency_overrides.pop(get_current_user, None)
    app_obj.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_create_update_new_profile_fields(db_session_integration):
    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)
    await db.commit()

    created = await customer_service.create_customer(
        db,
        tenant,
        CustomerCreate(
            name="Acme Knit Buyer",
            preferred_currency="USD",
            payment_terms="LC 90 Days",
            default_incoterm="FOB",
            typical_lead_time_days=45,
            industry_segment="Knit",
            compliance_level="BSCI",
            credit_limit="100000.5",
            notes="VIP buyer",
        ),
        user_id=user.id,
    )
    assert created.preferred_currency == "USD"
    assert created.payment_terms == "LC 90 Days"
    assert created.default_incoterm == "FOB"
    assert created.typical_lead_time_days == 45
    assert created.industry_segment == "Knit"
    assert created.compliance_level == "BSCI"
    assert created.credit_limit == "100000.5000"
    assert created.notes == "VIP buyer"

    updated = await customer_service.update_customer(
        db,
        tenant,
        created.id,
        CustomerUpdate(payment_terms="TT 30 Days", credit_limit="25000"),
        user_id=user.id,
    )
    assert updated is not None
    assert updated.payment_terms == "TT 30 Days"
    assert updated.credit_limit == "25000.0000"


@pytest.mark.asyncio
async def test_credit_limit_rejects_negative_and_nan(db_session_integration):
    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)
    await db.commit()

    with pytest.raises(Exception) as neg:
        await customer_service.create_customer(
            db,
            tenant,
            CustomerCreate(name="Bad Credit", credit_limit="-1"),
            user_id=user.id,
        )
    assert neg.value.status_code == 400

    with pytest.raises(Exception) as nan:
        await customer_service.create_customer(
            db,
            tenant,
            CustomerCreate(name="NaN Credit", credit_limit="NaN"),
            user_id=user.id,
        )
    assert nan.value.status_code == 400

    with pytest.raises(Exception) as inf:
        await customer_service.create_customer(
            db,
            tenant,
            CustomerCreate(name="Inf Credit", credit_limit="Infinity"),
            user_id=user.id,
        )
    assert inf.value.status_code == 400


@pytest.mark.asyncio
async def test_duplicate_check_tenant_isolation(db_session_integration):
    db = db_session_integration
    t_a, u_a = await _seed_tenant_user(db, slug=uuid.uuid4().hex[:8])
    t_b, u_b = await _seed_tenant_user(db, slug=uuid.uuid4().hex[:8])
    c_a = Customer(
        tenant_id=t_a.id,
        customer_code="DUP-A",
        name="Nordic Fashion AB",
        email="buyer@nordic.example",
        contact_email="buyer@nordic.example",
        status="active",
    )
    c_b = Customer(
        tenant_id=t_b.id,
        customer_code="DUP-B",
        name="Nordic Fashion AB",
        email="buyer@nordic.example",
        contact_email="buyer@nordic.example",
        status="active",
    )
    db.add_all([c_a, c_b])
    await db.commit()

    _override(app, db, u_a, t_a)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/customers/duplicate-check",
                params={"name": "Nordic Fashion", "email": "buyer@nordic.example"},
                headers={"X-Tenant-Id": str(t_a.id)},
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert len(body["matches"]) == 1
        assert body["matches"][0]["id"] == c_a.id
        assert body["matches"][0]["customer_code"] == "DUP-A"
    finally:
        _clear_overrides(app)

    # Other tenant sees only its own row.
    matches_b = await customer_service.duplicate_check(
        db, tenant_id=t_b.id, name="Nordic Fashion", email="buyer@nordic.example"
    )
    assert len(matches_b.matches) == 1
    assert matches_b.matches[0].id == c_b.id


@pytest.mark.asyncio
async def test_contacts_primary_sync_and_cross_tenant_404(db_session_integration):
    db = db_session_integration
    t_a, u_a = await _seed_tenant_user(db)
    t_b, u_b = await _seed_tenant_user(db)
    customer = Customer(
        tenant_id=t_a.id,
        customer_code="CONT-1",
        name="Contact Buyer",
        status="active",
    )
    db.add(customer)
    await db.flush()
    await db.commit()

    _override(app, db, u_a, t_a)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r1 = await ac.post(
                f"/api/v1/customers/{customer.id}/contacts",
                json={
                    "name": "Alice Merch",
                    "designation": "Merchandiser",
                    "email": "alice@buyer.com",
                    "phone": "+880111",
                    "is_primary": True,
                },
                headers={"X-Tenant-Id": str(t_a.id)},
            )
            assert r1.status_code == 201, r1.text
            c1 = r1.json()
            assert c1["is_primary"] is True

            r2 = await ac.post(
                f"/api/v1/customers/{customer.id}/contacts",
                json={
                    "name": "Bob Accounts",
                    "designation": "Accountant",
                    "email": "bob@buyer.com",
                    "phone": "+880222",
                    "is_primary": True,
                },
                headers={"X-Tenant-Id": str(t_a.id)},
            )
            assert r2.status_code == 201, r2.text
            c2 = r2.json()
            assert c2["is_primary"] is True

            listed = await ac.get(
                f"/api/v1/customers/{customer.id}/contacts",
                headers={"X-Tenant-Id": str(t_a.id)},
            )
            assert listed.status_code == 200
            rows = listed.json()
            primaries = [x for x in rows if x["is_primary"]]
            assert len(primaries) == 1
            assert primaries[0]["id"] == c2["id"]
    finally:
        _clear_overrides(app)

    await db.refresh(customer)
    assert customer.primary_contact_name == "Bob Accounts"
    assert customer.designation == "Accountant"
    assert customer.contact_email == "bob@buyer.com"
    assert customer.contact_phone == "+880222"

    _override(app, db, u_b, t_b)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                f"/api/v1/customers/{customer.id}/contacts",
                headers={"X-Tenant-Id": str(t_b.id)},
            )
        assert r.status_code == 404, r.text
    finally:
        _clear_overrides(app)


@pytest.mark.asyncio
async def test_profile_completeness_sql_python_alignment(db_session_integration):
    db = db_session_integration
    tenant, _user = await _seed_tenant_user(db)
    customer = Customer(
        tenant_id=tenant.id,
        customer_code="COMP-1",
        name="Complete-ish Co",
        legal_entity_name="Complete-ish Co Ltd",
        trade_name="Complete",
        tax_id_vat_number="VAT-1",
        contact_email="a@b.com",
        contact_phone="123456",
        website="https://example.com",
        billing_address_line1="Line 1",
        billing_city="Dhaka",
        billing_country="Bangladesh",
        same_as_billing=True,
        primary_contact_name="Pat",
        designation="Buyer",
        company_logo_url="https://example.com/logo.png",
        preferred_currency="USD",
        payment_terms="LC at Sight",
        status="active",
    )
    db.add(customer)
    await db.commit()
    await db.refresh(customer)

    py_score = customer_service.profile_completeness_score(customer)
    assert py_score == 100
    assert customer_service.PROFILE_COMPLETENESS_FIELD_COUNT == 15

    page = await customer_service.list_customers_paginated(
        db,
        tenant_id=tenant.id,
        q=None,
        status_filter=None,
        country=None,
        customer_type=None,
        page=1,
        page_size=20,
        incomplete_only=True,
    )
    # Fully complete customer must not appear in incomplete_only.
    assert all(item.id != customer.id for item in page.items)

    # Drop enough fields so SQL incomplete_only (< 70%) and Python agree.
    customer.payment_terms = None
    customer.preferred_currency = None
    customer.website = None
    customer.company_logo_url = None
    customer.designation = None
    customer.trade_name = None
    await db.flush()
    await db.refresh(customer)
    py_partial = customer_service.profile_completeness_score(customer)
    assert py_partial == int(round(100 * 9 / 15))
    assert py_partial < 70

    page2 = await customer_service.list_customers_paginated(
        db,
        tenant_id=tenant.id,
        q=None,
        status_filter=None,
        country=None,
        customer_type=None,
        page=1,
        page_size=20,
        incomplete_only=True,
    )
    assert any(item.id == customer.id for item in page2.items)


@pytest.mark.asyncio
async def test_import_customers_legacy_and_profile_csv(db_session_integration):
    db = db_session_integration
    tenant, _user = await _seed_tenant_user(db)
    await db.commit()

    legacy = await import_customers(
        db,
        tenant,
        [{"code": "IMP-1", "name": "Legacy Buyer", "email": "legacy@ex.com"}],
        dry_run=False,
    )
    assert legacy.ok_count == 1
    assert legacy.error_count == 0

    rich = await import_customers(
        db,
        tenant,
        [
            {
                "code": "IMP-2",
                "name": "Rich Buyer",
                "email": "rich@ex.com",
                "payment_terms": "TT 30 Days",
                "default_incoterm": "CIF",
                "typical_lead_time_days": "60",
                "industry_segment": "Woven",
                "compliance_level": "WRAP",
                "credit_limit": "12,500.25",
                "preferred_currency": "EUR",
                "notes": "Imported",
            }
        ],
        dry_run=False,
    )
    assert rich.ok_count == 1, rich.rows

    row = (
        await db.execute(
            select(Customer).where(Customer.tenant_id == tenant.id, Customer.customer_code == "IMP-2")
        )
    ).scalar_one()
    assert row.payment_terms == "TT 30 Days"
    assert row.default_incoterm == "CIF"
    assert row.typical_lead_time_days == 60
    assert row.credit_limit == Decimal("12500.25")
    assert row.preferred_currency == "EUR"

    # Contacts table exists and is empty for this import path.
    cnt = (
        await db.execute(
            select(CustomerContact).where(
                CustomerContact.tenant_id == tenant.id, CustomerContact.customer_id == row.id
            )
        )
    ).scalars().all()
    assert cnt == []
