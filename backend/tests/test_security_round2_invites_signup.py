"""Security round 2: staff invitation tokens and public company sign-up.

Run:
    docker compose exec backend pytest tests/test_security_round2_invites_signup.py -q
"""

from __future__ import annotations

import random
import secrets
import uuid

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import hash_password
from app.common.db_datetime import utc_naive_plus
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import Role, StaffInvitation, Tenant, User
from app.models.tenant import TenantType
from app.modules.staff_invite.service import accept_staff_invitation, create_staff_invitation


def _public_ip() -> str:
    return f"8.{random.randint(1, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"


async def _seed_tenant_admin(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(name=f"Inv {slug}", tenant_type=TenantType.both, is_active=True, company_code=f"IV{slug}"[:18].upper())
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()
    admin = User(
        tenant_id=tenant.id,
        role_id=admin_role.id,
        email=f"adm_{slug}@example.com",
        username=f"adm_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(admin)
    await db.flush()
    return tenant, admin, user_role


@pytest.fixture
def client_db(db_session_integration):
    async def override_db():
        yield db_session_integration

    app.dependency_overrides[get_db] = override_db
    try:
        yield db_session_integration
    finally:
        app.dependency_overrides.pop(get_db, None)


# --- M6: selector.verifier invitation tokens ---


@pytest.mark.asyncio
async def test_new_invite_token_has_selector_and_accepts(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await _seed_tenant_admin(db)
    inv, plain = await create_staff_invitation(
        db, tenant=tenant, invited_by=admin, email=f"new_{uuid.uuid4().hex[:6]}@example.com",
        first_name="A", last_name="B", role_id=role.id,
    )
    selector, verifier = plain.split(".", 1)
    assert inv.token_selector == selector
    assert verifier not in inv.token_hash

    with pytest.raises(HTTPException):
        await accept_staff_invitation(db, token=f"{selector}.{'x' * len(verifier)}", password="StrongPass123!", first_name=None, last_name=None)

    user, t = await accept_staff_invitation(db, token=plain, password="StrongPass123!", first_name=None, last_name=None)
    assert t.id == tenant.id and user.email == inv.email
    with pytest.raises(HTTPException):
        await accept_staff_invitation(db, token=plain, password="StrongPass123!", first_name=None, last_name=None)


@pytest.mark.asyncio
async def test_legacy_invite_without_selector_still_accepts(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await _seed_tenant_admin(db)
    legacy_plain = secrets.token_urlsafe(48)
    inv = StaffInvitation(
        tenant_id=tenant.id,
        email=f"legacy_{uuid.uuid4().hex[:6]}@example.com",
        role_id=role.id,
        token_hash=await hash_password(legacy_plain),
        token_selector=None,
        invited_by_user_id=admin.id,
        status="pending",
        expires_at=utc_naive_plus(days=7),
    )
    db.add(inv)
    await db.flush()
    user, _t = await accept_staff_invitation(db, token=legacy_plain, password="StrongPass123!", first_name=None, last_name=None)
    assert user.email == inv.email


@pytest.mark.asyncio
async def test_accept_invite_endpoint_is_rate_limited(client_db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 2)
    headers = {"X-Forwarded-For": _public_ip()}
    body = {"token": "abcdefghijklmnop.qrstuvwxyz", "password": "StrongPass123!"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        codes = [(await ac.post("/api/v1/auth/accept-staff-invite", json=body, headers=headers)).status_code for _ in range(3)]
    assert codes == [400, 400, 429]


# --- M7: public sign-up ---


@pytest.mark.asyncio
async def test_signup_returns_bootstrap_token_bound_to_first_user(client_db, monkeypatch):
    db = client_db
    settings = get_settings()
    monkeypatch.setattr(settings, "tenant_signup_rate_limit_per_hour", 100)
    headers = {"X-Forwarded-For": _public_ip()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.post("/api/v1/tenants", json={"name": f"Signup {uuid.uuid4().hex[:6]}"}, headers=headers)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data["bootstrap_token"]
        reg = {
            "tenant_id": data["id"],
            "email": f"owner_{uuid.uuid4().hex[:6]}@example.com",
            "password": "StrongPass123!",
            "accepted_legal_terms": True,
        }
        denied = await ac.post("/api/v1/auth/register", json=reg, headers=headers)
        assert denied.status_code == 403, denied.text
        ok = await ac.post("/api/v1/auth/register", json={**reg, "bootstrap_key": data["bootstrap_token"]}, headers=headers)
        assert ok.status_code == 201, ok.text
    tenant = (await db.execute(select(Tenant).where(Tenant.id == data["id"]))).scalar_one()
    assert tenant.bootstrap_token_hash is None


@pytest.mark.asyncio
async def test_signup_rate_limited_per_ip(client_db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "tenant_signup_rate_limit_per_hour", 1)
    headers = {"X-Forwarded-For": _public_ip()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        first = await ac.post("/api/v1/tenants", json={"name": "Rate One"}, headers=headers)
        second = await ac.post("/api/v1/tenants", json={"name": "Rate Two"}, headers=headers)
    assert first.status_code == 201, first.text
    assert second.status_code == 429


@pytest.mark.asyncio
async def test_signup_closed_requires_bootstrap_key(client_db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "tenant_signup_rate_limit_per_hour", 100)
    monkeypatch.setattr(settings, "public_tenant_signup_enabled", False)
    monkeypatch.setattr(settings, "bootstrap_registration_key", "operator-signup-key-123")
    headers = {"X-Forwarded-For": _public_ip()}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        closed = await ac.post("/api/v1/tenants", json={"name": "Closed"}, headers=headers)
        wrong = await ac.post("/api/v1/tenants", json={"name": "Closed"}, headers={**headers, "X-Bootstrap-Key": "nope"})
        ok = await ac.post(
            "/api/v1/tenants", json={"name": "Closed OK"}, headers={**headers, "X-Bootstrap-Key": "operator-signup-key-123"}
        )
    assert closed.status_code == 403
    assert wrong.status_code == 403
    assert ok.status_code == 201, ok.text


@pytest.mark.asyncio
async def test_new_user_password_minimum_eight(client_db):
    db = client_db
    tenant, admin, role = await _seed_tenant_admin(db)
    await db.commit()
    login = {"company_code": tenant.company_code, "username": admin.username, "password": "StrongPass123!", "login_as": "admin"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        tok = (await ac.post("/api/v1/auth/login", json=login, headers={"X-Forwarded-For": _public_ip()})).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}", "X-Tenant-Id": str(tenant.id)}
        body = {"role_id": role.id, "email": f"short_{uuid.uuid4().hex[:6]}@example.com", "password": "Ab1234"}
        r = await ac.post("/api/v1/settings/users", json=body, headers=h)
    assert r.status_code == 422, r.text
