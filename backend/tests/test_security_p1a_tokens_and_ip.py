"""P1a security: token allow-list, spoof-resistant client IP, generic login errors.

Run:
docker compose exec backend pytest tests/test_security_p1a_tokens_and_ip.py -q
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from app.common.jwt_compat import jwt
from starlette.requests import Request

from app.common.auth import hash_password, is_internal_access_payload
from app.common.login_lockout import _client_ip, lockout_minutes
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType


def _request(headers: dict[str, str], peer: str = "172.18.0.5") -> Request:
    scope = {
        "type": "http",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (peer, 12345),
    }
    return Request(scope)


def test_internal_payload_allow_list():
    assert is_internal_access_payload({"sub": "5", "exp": 1})
    assert is_internal_access_payload({"sub": "5", "exp": 1, "sv": 2})
    assert not is_internal_access_payload({"sub": "5", "use": "password_reset"})
    assert not is_internal_access_payload({"sub": "5", "aud": "platform-admin"})
    assert not is_internal_access_payload({"sub": "5", "typ": "external"})
    assert not is_internal_access_payload({"sub": "ext:5"})
    assert not is_internal_access_payload({})


def test_client_ip_ignores_spoofed_left_hops():
    # Client forged "1.2.3.4"; host nginx appended the real 8.8.8.8; frontend nginx appended docker gw.
    req = _request({"x-forwarded-for": "1.2.3.4, 8.8.8.8, 172.18.0.1", "x-real-ip": "172.18.0.1"})
    assert _client_ip(req) == "8.8.8.8"


def test_client_ip_falls_back_to_peer_on_private_network():
    req = _request({"x-forwarded-for": "10.0.0.7"}, peer="127.0.0.1")
    assert _client_ip(req) == "127.0.0.1"


def test_lockout_minutes_respects_explicit_zero():
    assert lockout_minutes(0) == 0
    assert lockout_minutes(None) == 30
    assert lockout_minutes("bad") == 30


async def _seed_staff(db, *, password: str = "StrongPass123!"):
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"P1a {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"p1a{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"p1a_{slug}@example.com",
        username=f"p1a_{slug}",
        password_hash=await hash_password(password),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.commit()
    return tenant, user


@pytest.mark.asyncio
async def test_password_reset_token_rejected_on_internal_api(db_session_integration):
    db = db_session_integration
    tenant, user = await _seed_staff(db)
    settings = get_settings()
    reset_token = jwt.encode(
        {
            "sub": str(user.id),
            "tenant_id": tenant.id,
            "use": "password_reset",
            "jti": "x",
            "exp": datetime.utcnow() + timedelta(hours=1),
        },
        settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
    )

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {reset_token}", "X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 401, r.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_unknown_user_and_wrong_password_get_same_response(db_session_integration):
    db = db_session_integration
    tenant, user = await _seed_staff(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            wrong_pw = await ac.post(
                "/api/v1/auth/login",
                json={"company_code": tenant.company_code, "username": user.username, "password": "nope-nope"},
            )
            unknown = await ac.post(
                "/api/v1/auth/login",
                json={"company_code": tenant.company_code, "username": "ghost-user", "password": "nope-nope"},
            )
            unknown_company = await ac.post(
                "/api/v1/auth/login",
                json={"company_code": "no-such-co", "username": "ghost", "password": "nope-nope"},
            )
        for r in (wrong_pw, unknown, unknown_company):
            assert r.status_code == 401, r.text
            assert r.json()["detail"] == "Invalid credentials"
    finally:
        app.dependency_overrides.pop(get_db, None)
