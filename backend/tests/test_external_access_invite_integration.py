"""External access invite endpoints (integration).

Run:
docker compose exec backend pytest tests/test_external_access_invite_integration.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.external_access.admin.service import create_invitation
from app.external_access.constants import (
    FF_CUSTOMER_PORTAL_ENABLED,
    FF_FINANCIER_PORTAL_ENABLED,
    PRINCIPAL_CUSTOMER,
)
from app.main import app
from app.models import Customer, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role


async def _seed_admin_tenant_with_customer(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"ExtInv {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ei{slug}"[:18],
        feature_flags={
            FF_CUSTOMER_PORTAL_ENABLED: True,
            FF_FINANCIER_PORTAL_ENABLED: True,
        },
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"ei{slug}",
        email=f"ei{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"EI{slug}"[:12],
        name="Invite Test Co",
        status="active",
    )
    db.add(customer)
    await db.flush()
    return tenant, user, customer


@pytest.mark.asyncio
async def test_invite_customer_principal_ok(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_admin_tenant_with_customer(db)
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
            r = await ac.post(
                "/api/v1/settings/external-access/customers/invite",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "email": "buyer@example.com",
                    "full_name": "Buyer One",
                    "role_codes": ["customer_viewer"],
                    "customer_ids": [customer.id],
                },
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "invite_email_sent" in data
        if data["invite_email_sent"]:
            assert not data.get("invite_token")
        else:
            assert isinstance(data.get("invite_token"), str) and len(data["invite_token"]) > 20
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_customer_accept_invite_returns_tokens(db_session_integration):
    db = db_session_integration
    tenant, user, customer = await _seed_admin_tenant_with_customer(db)
    await db.commit()

    inv, plain = await create_invitation(
        db,
        tenant=tenant,
        invited_by=user,
        principal_type=PRINCIPAL_CUSTOMER,
        email="portal.buyer@example.com",
        full_name="Portal Buyer",
        payload={"role_codes": ["customer_viewer"], "customer_ids": [customer.id]},
    )
    await db.flush()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/external/auth/accept-invite",
                json={
                    "token": plain,
                    "full_name": "Portal Buyer",
                    "password": "longpass1",
                    "phone": None,
                },
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("access_token")
        assert data.get("refresh_token")
        assert data.get("tenant_id") == tenant.id
        assert data.get("principal_type") == "customer"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_invite_financier_principal_ok(db_session_integration):
    db = db_session_integration
    tenant, user, _customer = await _seed_admin_tenant_with_customer(db)
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
            r = await ac.post(
                "/api/v1/settings/external-access/financiers/invite",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "email": "bank@example.com",
                    "full_name": "Bank Contact",
                    "role_codes": ["financier_viewer"],
                    "access_scope": "orders_and_pipeline",
                    "financier_party_id": None,
                },
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "invite_email_sent" in data
        if data["invite_email_sent"]:
            assert not data.get("invite_token")
        else:
            assert isinstance(data.get("invite_token"), str) and len(data["invite_token"]) > 20
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
