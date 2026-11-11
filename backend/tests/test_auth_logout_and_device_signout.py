"""Staff logout and admin "sign out all devices" (mobile lost-device control), plus API no-store headers.

Run:
docker compose exec backend pytest tests/test_auth_logout_and_device_signout.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route

from app.common.auth import create_access_token, hash_password
from app.common.cache_headers import ApiNoStoreMiddleware
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import AuditLog, Role, Tenant, User
from app.models.tenant import TenantType


async def _seed_tenant(db, *, single_session: bool = True) -> Tenant:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Signout Test {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"so{slug}"[:18].upper(),
        feature_flags={"single_session_enforced": single_session},
    )
    db.add(tenant)
    await db.flush()
    return tenant


async def _seed_user(db, tenant: Tenant, *, role_name: str) -> User:
    slug = uuid.uuid4().hex[:10]
    role = Role(tenant_id=tenant.id, name=role_name, display_name=role_name.title(), permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"{slug}@example.com",
        username=f"user_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        auth_session_version=1,
    )
    db.add(user)
    await db.flush()
    return user


def _headers(user: User) -> dict[str, str]:
    token = create_access_token(
        subject=user.id,
        session_version=int(user.auth_session_version or 0),
        tenant_id=user.tenant_id,
    )
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(user.tenant_id)}


@pytest.fixture
async def client(db_session_integration):
    async def override_db():
        yield db_session_integration

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_logout_ends_session_and_is_audited(db_session_integration, client):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    user = await _seed_user(db, tenant, role_name="user")
    await db.commit()
    headers = _headers(user)

    assert (await client.get("/api/v1/auth/me", headers=headers)).status_code == 200

    logout = await client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204, logout.text

    after = await client.get("/api/v1/auth/me", headers=headers)
    assert after.status_code == 401, after.text
    assert (after.json().get("detail") or {}).get("code") == "session_superseded"

    audit = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.user_id == user.id, AuditLog.action == "LOGOUT")
        )
    ).scalars().all()
    assert len(audit) == 1


@pytest.mark.asyncio
async def test_logout_twice_is_refused_and_bumps_once(db_session_integration, client):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    user = await _seed_user(db, tenant, role_name="user")
    await db.commit()
    headers = _headers(user)

    assert (await client.post("/api/v1/auth/logout", headers=headers)).status_code == 204
    second = await client.post("/api/v1/auth/logout", headers=headers)
    assert second.status_code == 401, second.text

    refreshed = (await db.execute(select(User).where(User.id == user.id))).scalar_one()
    await db.refresh(refreshed)
    assert int(refreshed.auth_session_version) == 2


@pytest.mark.asyncio
async def test_logout_requires_a_token(client):
    res = await client.post("/api/v1/auth/logout")
    assert res.status_code in (401, 403), res.text


@pytest.mark.asyncio
async def test_admin_signs_out_all_devices_of_a_user(db_session_integration, client):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    admin = await _seed_user(db, tenant, role_name="admin")
    staff = await _seed_user(db, tenant, role_name="user")
    await db.commit()
    admin_headers = _headers(admin)
    staff_headers = _headers(staff)

    res = await client.post(f"/api/v1/settings/users/{staff.id}/sign-out-devices", headers=admin_headers)
    assert res.status_code == 200, res.text
    assert res.json()["id"] == staff.id
    assert res.json()["is_active"] is True

    assert (await client.get("/api/v1/auth/me", headers=staff_headers)).status_code == 401
    assert (await client.get("/api/v1/auth/me", headers=admin_headers)).status_code == 200

    audit = (
        await db.execute(
            select(AuditLog).where(
                AuditLog.tenant_id == tenant.id,
                AuditLog.user_id == admin.id,
                AuditLog.action == "SETTINGS_USER_SIGN_OUT_DEVICES",
            )
        )
    ).scalars().all()
    assert len(audit) == 1


@pytest.mark.asyncio
async def test_non_admin_cannot_sign_out_devices(db_session_integration, client):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    staff = await _seed_user(db, tenant, role_name="user")
    other = await _seed_user(db, tenant, role_name="manager")
    await db.commit()

    res = await client.post(f"/api/v1/settings/users/{other.id}/sign-out-devices", headers=_headers(staff))
    assert res.status_code == 403, res.text
    assert (await client.get("/api/v1/auth/me", headers=_headers(other))).status_code == 200


@pytest.mark.asyncio
async def test_admin_cannot_sign_out_user_of_another_tenant(db_session_integration, client):
    db = db_session_integration
    tenant_a = await _seed_tenant(db)
    tenant_b = await _seed_tenant(db)
    admin_a = await _seed_user(db, tenant_a, role_name="admin")
    user_b = await _seed_user(db, tenant_b, role_name="user")
    await db.commit()

    res = await client.post(f"/api/v1/settings/users/{user_b.id}/sign-out-devices", headers=_headers(admin_a))
    assert res.status_code == 404, res.text
    assert (await client.get("/api/v1/auth/me", headers=_headers(user_b))).status_code == 200


@pytest.mark.asyncio
async def test_sign_out_devices_refused_when_single_session_is_off(db_session_integration, client, monkeypatch):
    db = db_session_integration
    monkeypatch.setenv("SINGLE_SESSION_GLOBAL", "false")
    get_settings.cache_clear()
    try:
        tenant = await _seed_tenant(db, single_session=False)
        admin = await _seed_user(db, tenant, role_name="admin")
        staff = await _seed_user(db, tenant, role_name="user")
        await db.commit()

        res = await client.post(f"/api/v1/settings/users/{staff.id}/sign-out-devices", headers=_headers(admin))
        assert res.status_code == 409, res.text
        refreshed = (await db.execute(select(User).where(User.id == staff.id))).scalar_one()
        await db.refresh(refreshed)
        assert int(refreshed.auth_session_version) == 1
    finally:
        monkeypatch.delenv("SINGLE_SESSION_GLOBAL", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_api_responses_are_not_stored(db_session_integration, client):
    db = db_session_integration
    tenant = await _seed_tenant(db)
    user = await _seed_user(db, tenant, role_name="user")
    await db.commit()

    me = await client.get("/api/v1/auth/me", headers=_headers(user))
    assert me.headers.get("cache-control") == "private, no-store"
    unauthorized = await client.get("/api/v1/auth/me")
    assert unauthorized.headers.get("cache-control") == "private, no-store"


@pytest.mark.asyncio
async def test_no_store_middleware_keeps_route_header_and_skips_non_api_paths():
    async def own_header(_request):
        return JSONResponse({"ok": True}, headers={"Cache-Control": "public, max-age=60"})

    async def plain(_request):
        return JSONResponse({"ok": True})

    small = Starlette(routes=[Route("/api/own", own_header), Route("/api/plain", plain), Route("/health", plain)])
    wrapped = ApiNoStoreMiddleware(small)
    async with AsyncClient(transport=ASGITransport(app=wrapped), base_url="http://test") as ac:
        assert (await ac.get("/api/own")).headers.get("cache-control") == "public, max-age=60"
        assert (await ac.get("/api/plain")).headers.get("cache-control") == "private, no-store"
        assert (await ac.get("/health")).headers.get("cache-control") is None
