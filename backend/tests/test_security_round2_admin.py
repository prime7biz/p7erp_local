"""Security round 2: impersonation sessions and platform-admin TOTP.

Run:
    docker compose exec backend pytest tests/test_security_round2_admin.py -q
"""

from __future__ import annotations

import base64
import random
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import decode_access_token, hash_password
from app.common.totp import current_totp_step, totp_code_at_step, verify_totp
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import AuditLog, PlatformAdmin, Role, Tenant, User
from app.models.tenant import TenantType

LOGIN = "/api/v1/admin/auth/login"


def _ip() -> dict[str, str]:
    return {"X-Forwarded-For": f"8.{random.randint(1, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"}


@pytest.fixture
def client_db(db_session_integration):
    async def override_db():
        yield db_session_integration

    app.dependency_overrides[get_db] = override_db
    try:
        yield db_session_integration
    finally:
        app.dependency_overrides.pop(get_db, None)


async def _admin(db, role: str = "super_admin") -> PlatformAdmin:
    slug = uuid.uuid4().hex[:10]
    a = PlatformAdmin(
        username=f"pa_{slug}",
        email=f"pa_{slug}@example.com",
        password_hash=await hash_password("AdminPass123!"),
        role=role,
        is_active=True,
    )
    db.add(a)
    await db.flush()
    return a


async def _tenant_user(db):
    slug = uuid.uuid4().hex[:10]
    t = Tenant(name=f"Imp {slug}", tenant_type=TenantType.both, is_active=True, company_code=f"IM{slug}"[:18].upper())
    db.add(t)
    await db.flush()
    r = Role(tenant_id=t.id, name="user", display_name="User", permissions={})
    db.add(r)
    await db.flush()
    u = User(
        tenant_id=t.id,
        role_id=r.id,
        email=f"u_{slug}@example.com",
        username=f"u_{slug}",
        password_hash=await hash_password("UserPass123!"),
        is_active=True,
    )
    db.add(u)
    await db.flush()
    return t, u


async def _login(ac, admin: PlatformAdmin, code: str | None = None):
    body = {"username": admin.username, "password": "AdminPass123!"}
    if code:
        body["totp_code"] = code
    return await ac.post(LOGIN, json=body, headers=_ip())


# --- TOTP primitives (RFC 6238 appendix B, SHA-1 secret "12345678901234567890") ---


def test_totp_rfc6238_vectors():
    secret = base64.b32encode(b"12345678901234567890").decode().rstrip("=")
    assert totp_code_at_step(secret, 59 // 30) == "287082"
    assert totp_code_at_step(secret, 1111111109 // 30) == "081804"
    step = current_totp_step()
    code = totp_code_at_step(secret, step)
    assert verify_totp(secret, code) == step
    assert verify_totp(secret, code, last_used_step=step) is None
    assert verify_totp(secret, "000000" if code != "000000" else "111111") is None


# --- M11: impersonation ---


@pytest.mark.asyncio
async def test_impersonation_token_bound_to_revocable_session(client_db, monkeypatch):
    db = client_db
    monkeypatch.setattr(get_settings(), "login_rate_limit_per_minute", 100)
    admin = await _admin(db, role="support_agent")
    tenant, user = await _tenant_user(db)
    await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        atok = (await _login(ac, admin)).json()["access_token"]
        ah = {"Authorization": f"Bearer {atok}"}
        r = await ac.post(f"/api/v1/admin/tenants/{tenant.id}/users/{user.id}/impersonate", headers=ah)
        assert r.status_code == 200, r.text
        itok = r.json()["access_token"]
        claims = decode_access_token(itok)
        assert claims["imp"] == admin.id and claims["isid"] and claims["tid"] == tenant.id and "sv" in claims

        uh = {"Authorization": f"Bearer {itok}", "X-Tenant-Id": str(tenant.id)}
        assert (await ac.get("/api/v1/auth/me", headers=uh)).status_code == 200

        rv = await ac.post(f"/api/v1/admin/tenants/{tenant.id}/users/{user.id}/impersonation/revoke", headers=ah)
        assert rv.status_code == 200 and rv.json()["revoked"] == 1
        assert (await ac.get("/api/v1/auth/me", headers=uh)).status_code == 401


@pytest.mark.asyncio
async def test_impersonated_actions_are_attributed_in_audit_log(db_session_integration):
    db = db_session_integration
    admin = await _admin(db)
    tenant, user = await _tenant_user(db)
    from app.common.auth import current_impersonator_admin_id
    from app.modules.audit.service import log_action

    token = current_impersonator_admin_id.set(admin.id)
    try:
        await log_action(db, tenant_id=tenant.id, action="TEST_IMP", user_id=user.id, resource="t", details="x")
    finally:
        current_impersonator_admin_id.reset(token)
    await log_action(db, tenant_id=tenant.id, action="TEST_NORMAL", user_id=user.id, resource="t", details="y")
    rows = {
        r.action: r.details
        for r in (await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id))).scalars().all()
    }
    assert rows["TEST_IMP"] == f"x [impersonated_by_platform_admin={admin.id}]"
    assert rows["TEST_NORMAL"] == "y"


# --- SEC-09: TOTP enrolment and login ---


@pytest.mark.asyncio
async def test_totp_enrolment_then_login_requires_code(client_db, monkeypatch):
    db = client_db
    monkeypatch.setattr(get_settings(), "login_rate_limit_per_minute", 100)
    monkeypatch.setattr(get_settings(), "platform_admin_login_max_attempts", 100)
    admin = await _admin(db)
    await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        tok = (await _login(ac, admin)).json()["access_token"]
        h = {"Authorization": f"Bearer {tok}"}
        setup = await ac.post("/api/v1/admin/auth/mfa/totp/setup", headers=h)
        assert setup.status_code == 200, setup.text
        secret = setup.json()["secret"]
        assert setup.json()["otpauth_uri"].startswith("otpauth://totp/")
        bad = await ac.post("/api/v1/admin/auth/mfa/totp/enable", json={"code": "000000"}, headers=h)
        if bad.status_code == 200:  # astronomically unlikely real match; regenerate path not needed
            pytest.skip("random code matched")
        assert bad.status_code == 400
        step = current_totp_step()
        en = await ac.post("/api/v1/admin/auth/mfa/totp/enable", json={"code": totp_code_at_step(secret, step)}, headers=h)
        assert en.status_code == 200, en.text

        no_code = await _login(ac, admin)
        assert no_code.status_code == 401
        assert no_code.json()["detail"]["code"] == "mfa_required"
        # Same step was used at enrolment, so the same code is refused (replay).
        replay = await _login(ac, admin, totp_code_at_step(secret, step))
        assert replay.status_code == 401
        ok = await _login(ac, admin, totp_code_at_step(secret, step + 1))
        assert ok.status_code == 200, ok.text
        me = await ac.get("/api/v1/admin/auth/me", headers={"Authorization": f"Bearer {ok.json()['access_token']}"})
        assert me.json()["totp_enabled"] is True


@pytest.mark.asyncio
async def test_mfa_required_limits_unenrolled_admin_to_enrolment(client_db, monkeypatch):
    db = client_db
    settings = get_settings()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)
    monkeypatch.setattr(settings, "platform_admin_mfa_required", True)
    admin = await _admin(db)
    await db.commit()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await _login(ac, admin)
        assert r.status_code == 200 and r.json()["mfa_enrolment_required"] is True
        h = {"Authorization": f"Bearer {r.json()['access_token']}"}
        assert (await ac.get("/api/v1/admin/security/admins", headers=h)).status_code == 403
        me = await ac.get("/api/v1/admin/auth/me", headers=h)
        assert me.status_code == 200 and me.json()["mfa_enrolment_required"] is True
        assert (await ac.post("/api/v1/admin/auth/mfa/totp/setup", headers=h)).status_code == 200
