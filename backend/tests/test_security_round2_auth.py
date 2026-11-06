"""Security round 2: rate limiting, session tokens, lockout, suspended tenants, RBAC defaults, secrets.

Run:
    docker compose exec backend pytest tests/test_security_round2_auth.py -q
"""

from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.requests import Request

from app.common import rate_limiter
from app.common.auth import create_access_token, hash_password
from app.common.client_ip import client_ip_from_request
from app.common.permissions import assert_soft_permission_allowed
from app.common.tenant_feature_keys import get_tenant_rbac_mode, with_effective_default_flags
from app.config import Settings, get_settings
from app.database import get_db
from app.external_access.tokens import create_external_access_token
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType


def _public_ip() -> str:
    return f"8.{random.randint(1, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"


def _request(headers: dict[str, str] | None = None, client_host: str = "172.18.0.5") -> Request:
    raw = [(k.lower().encode(), v.encode()) for k, v in (headers or {}).items()]
    return Request({"type": "http", "headers": raw, "client": (client_host, 1234), "path": "/api/v1/x", "method": "GET"})


async def _seed(db, *, flags: dict | None = None, role_name: str = "user", permissions: dict | None = None, active: bool = True):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Sec2 {slug}",
        tenant_type=TenantType.both,
        is_active=active,
        company_code=f"S2{slug}"[:18].upper(),
        feature_flags=flags or {},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name=role_name, display_name=role_name.title(), permissions=permissions or {})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"{slug}@example.com",
        username=f"u_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, role, user


@pytest.fixture
def client_db(db_session_integration):
    async def override_db():
        yield db_session_integration

    app.dependency_overrides[get_db] = override_db
    try:
        yield db_session_integration
    finally:
        app.dependency_overrides.pop(get_db, None)


# --- M5: rate limit keys come from the verified token, not X-Tenant-Id ---


def test_rate_limit_bucket_ignores_tenant_header_without_token():
    key, _limit = rate_limiter.rate_limit_bucket(_request({"X-Tenant-Id": "42"}))
    assert key.startswith("rl:ip:")
    assert "42" not in key


def test_rate_limit_bucket_uses_signed_tenant_claim():
    token = create_access_token(subject=7, tenant_id=99)
    key, limit = rate_limiter.rate_limit_bucket(
        _request({"Authorization": f"Bearer {token}", "X-Tenant-Id": "5"})
    )
    assert key == "rl:min:99"
    assert limit == get_settings().tenant_rate_limit_requests_per_minute


def test_rate_limit_bucket_legacy_token_uses_user_and_forged_token_is_anonymous():
    legacy = create_access_token(subject=7)
    assert rate_limiter.rate_limit_bucket(_request({"Authorization": f"Bearer {legacy}"}))[0] == "rl:user:7"
    forged = legacy[:-4] + ("AAAA" if not legacy.endswith("AAAA") else "BBBB")
    assert rate_limiter.rate_limit_bucket(_request({"Authorization": f"Bearer {forged}"}))[0].startswith("rl:ip:")


def test_rate_limit_bucket_external_token_uses_tenant():
    token = create_external_access_token(principal_id=3, principal_type="customer", tenant_id=55)
    assert rate_limiter.rate_limit_bucket(_request({"Authorization": f"Bearer {token}"}))[0] == "rl:min:55"


class _FakeRedis:
    def __init__(self):
        self.counts: dict[str, int] = {}

    async def incr(self, key):
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    async def expire(self, key, seconds):
        return True


@pytest.mark.asyncio
async def test_anonymous_requests_cannot_exhaust_tenant_budget(client_db, monkeypatch):
    db = client_db
    tenant, _role, user = await _seed(db)
    fake = _FakeRedis()
    monkeypatch.setattr(rate_limiter, "get_redis", lambda: fake)
    settings = get_settings().model_copy(
        update={"tenant_rate_limit_requests_per_minute": 3, "anon_rate_limit_requests_per_minute": 2}
    )
    monkeypatch.setattr(rate_limiter, "get_settings", lambda: settings)
    attacker = {"X-Tenant-Id": str(tenant.id), "X-Forwarded-For": _public_ip()}
    token = create_access_token(subject=user.id, tenant_id=tenant.id, session_version=0)
    owner = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        codes = [(await ac.get("/api/v1/tenants/me", headers=attacker)).status_code for _ in range(4)]
        assert codes[-1] == 429
        assert 429 not in codes[:2]
        r = await ac.get("/api/v1/tenants/me", headers=owner)
        assert r.status_code == 200, r.text
    assert not any(k.startswith(f"rl:min:{tenant.id}:") and v > 1 for k, v in fake.counts.items())


# --- L4: client IP ---


def test_client_ip_takes_rightmost_public_hop():
    req = _request({"X-Forwarded-For": "1.2.3.4, 9.9.9.9, 172.18.0.2"}, client_host="172.18.0.3")
    assert client_ip_from_request(req) == "9.9.9.9"
    assert client_ip_from_request(_request({}, client_host="172.18.0.3")) == "172.18.0.3"


# --- L7: tokens without sv while single-session is enforced ---


@pytest.mark.asyncio
async def test_token_without_sv_rejected_when_single_session(client_db, monkeypatch):
    db = client_db
    tenant, _role, user = await _seed(db, flags={"single_session_enforced": True})
    legacy = create_access_token(subject=user.id)
    headers = {"Authorization": f"Bearer {legacy}", "X-Tenant-Id": str(tenant.id)}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/api/v1/auth/me", headers=headers)
        assert r.status_code == 401, r.text
        settings = get_settings()
        future = (datetime.utcnow() + timedelta(days=1)).isoformat()
        monkeypatch.setattr(settings, "legacy_token_without_sv_grace_until", future)
        r = await ac.get("/api/v1/auth/me", headers=headers)
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_token_for_other_tenant_claim_rejected(client_db):
    db = client_db
    tenant, _role, user = await _seed(db)
    bad = create_access_token(subject=user.id, tenant_id=tenant.id + 100000, session_version=0)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {bad}", "X-Tenant-Id": str(tenant.id)})
    assert r.status_code == 401


# --- SEC-06: suspended tenants ---


@pytest.mark.asyncio
async def test_suspended_tenant_user_blocked_everywhere(client_db):
    db = client_db
    tenant, _role, user = await _seed(db)
    token = create_access_token(subject=user.id, tenant_id=tenant.id, session_version=0)
    tenant.is_active = False
    await db.flush()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/api/v1/files/user_signatures/x.png", headers={"Authorization": f"Bearer {token}"})
    assert r.status_code == 403, r.text


# --- L5: lockout per account + IP ---


@pytest.mark.asyncio
async def test_failed_logins_from_one_ip_do_not_lock_other_ips(client_db, monkeypatch):
    db = client_db
    tenant, _role, user = await _seed(db)
    await db.commit()
    settings = get_settings()
    monkeypatch.setattr(settings, "staff_login_max_attempts", 3)
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)
    attacker = {"X-Forwarded-For": _public_ip()}
    owner = {"X-Forwarded-For": _public_ip()}
    body = {"company_code": tenant.company_code, "username": user.username, "login_as": "staff"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for _ in range(3):
            r = await ac.post("/api/v1/auth/login", json={**body, "password": "WrongPass!!"}, headers=attacker)
            assert r.status_code == 401
        blocked = await ac.post("/api/v1/auth/login", json={**body, "password": "StrongPass123!"}, headers=attacker)
        assert blocked.status_code == 403
        ok = await ac.post("/api/v1/auth/login", json={**body, "password": "StrongPass123!"}, headers=owner)
        assert ok.status_code == 200, ok.text


@pytest.mark.asyncio
async def test_account_wide_lock_after_threshold(client_db, monkeypatch):
    db = client_db
    tenant, _role, user = await _seed(db)
    await db.commit()
    settings = get_settings()
    monkeypatch.setattr(settings, "staff_login_max_attempts", 100)
    monkeypatch.setattr(settings, "staff_login_account_lock_threshold", 4)
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)
    body = {"company_code": tenant.company_code, "username": user.username, "login_as": "staff"}
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for _ in range(4):
            await ac.post("/api/v1/auth/login", json={**body, "password": "Wrong!!!"}, headers={"X-Forwarded-For": _public_ip()})
        r = await ac.post(
            "/api/v1/auth/login", json={**body, "password": "StrongPass123!"}, headers={"X-Forwarded-For": _public_ip()}
        )
    assert r.status_code == 403


# --- L1: secrets outside development ---


def test_short_or_placeholder_secrets_refused_outside_dev(monkeypatch):
    import app.config as config_mod

    strong = "x" * 40
    cases = [
        {"jwt_secret": "short-secret", "ai_confirmation_token_pepper": strong},
        {"jwt_secret": "", "ai_confirmation_token_pepper": strong},
        {"jwt_secret": strong, "ai_confirmation_token_pepper": "change-me-ai-token-pepper"},
    ]
    for overrides in cases:
        fake = Settings(app_env="production", mcp_enabled=False, **overrides)
        monkeypatch.setattr(config_mod, "Settings", lambda fake=fake: fake)
        config_mod.get_settings.cache_clear()
        with pytest.raises(RuntimeError):
            config_mod.get_settings()
    ok = Settings(app_env="production", mcp_enabled=False, jwt_secret=strong, ai_confirmation_token_pepper=strong)
    monkeypatch.setattr(config_mod, "Settings", lambda: ok)
    config_mod.get_settings.cache_clear()
    assert config_mod.get_settings().jwt_secret == strong
    monkeypatch.undo()
    config_mod.get_settings.cache_clear()


# --- SEC-01: operator default RBAC mode ---


def test_rbac_default_mode_applies_only_without_tenant_flag(monkeypatch):
    settings = get_settings()
    assert get_tenant_rbac_mode({}) == "off"
    monkeypatch.setattr(settings, "rbac_default_mode", "shadow")
    assert get_tenant_rbac_mode({}) == "shadow"
    assert get_tenant_rbac_mode({"rbac_enforcement": "enforce"}) == "enforce"
    assert with_effective_default_flags({})["rbac_enforcement"] == "shadow"
    monkeypatch.setattr(settings, "rbac_default_mode", "bogus")
    assert get_tenant_rbac_mode(None) == "off"


# --- SEC-05: strict sensitive permissions per tenant ---


@pytest.mark.asyncio
async def test_strict_sensitive_permissions_fail_closed(db_session_integration):
    db = db_session_integration
    tenant, role, user = await _seed(db)
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key="finance.tds.view")
    tenant.feature_flags = {"strict_sensitive_permissions": True}
    await db.flush()
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await assert_soft_permission_allowed(db, user, tenant.id, permission_key="finance.tds.view")
    assert exc.value.status_code == 403
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key="inventory.kit.view")
    role.permissions = {"finance.tds.view": True}
    await db.flush()
    await assert_soft_permission_allowed(db, user, tenant.id, permission_key="finance.tds.view")
