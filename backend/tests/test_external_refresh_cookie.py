"""Portal refresh token in an HttpOnly cookie (AUTH_REFRESH_COOKIE_ENABLED).

Flag off: nothing changes (refresh token only in the JSON body, no cookie).
Flag on: login/refresh set the cookie, /refresh accepts the cookie or the body token, cookie-based
refresh/logout need the X-Requested-With: p7 header, logout clears the cookie and revokes tokens.

Run: docker compose exec backend pytest tests/test_external_refresh_cookie.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import datetime

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import hash_password
from app.common.auth_cookies import (
    CSRF_HEADER_NAME,
    CSRF_HEADER_VALUE,
    EXTERNAL_REFRESH_COOKIE_NAME,
    EXTERNAL_REFRESH_COOKIE_PATH,
)
from app.config import get_settings
from app.database import get_db
from app.external_access.constants import FF_CUSTOMER_PORTAL_ENABLED, PRINCIPAL_CUSTOMER
from app.main import app
from app.models import Tenant
from app.models.external_access import ExternalPrincipal
from app.models.tenant import TenantType

AUTH = "/api/external/auth"
PASSWORD = "Cookie-Test-123!"
CSRF = {CSRF_HEADER_NAME: CSRF_HEADER_VALUE}


async def _seed(db) -> dict:
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Cookie test {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"CK{slug}".upper(),
        feature_flags={FF_CUSTOMER_PORTAL_ENABLED: True},
    )
    db.add(tenant)
    await db.flush()
    principal = ExternalPrincipal(
        tenant_id=tenant.id,
        principal_type=PRINCIPAL_CUSTOMER,
        email=f"cookie.{slug}@example.com",
        password_hash=await hash_password(PASSWORD),
        full_name="Cookie User",
        is_active=True,
        accepted_at=datetime.utcnow(),
    )
    db.add(principal)
    await db.flush()
    await db.commit()
    return {"tenant": tenant, "principal": principal}


@asynccontextmanager
async def _client(db):
    async def override_db():
        # Like app.database.get_db: a finished request commits, a failed one rolls back.
        try:
            yield db
            await db.commit()
        except Exception:
            await db.rollback()
            raise

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)


async def _post(ac, path: str, *, json=None, headers=None, cookie: str | None = None):
    """POST with an explicit Cookie header only (the client's own cookie jar is not used)."""
    ac.cookies.clear()
    h = dict(headers or {})
    if cookie is not None:
        h["Cookie"] = f"{EXTERNAL_REFRESH_COOKIE_NAME}={cookie}"
    return await ac.post(f"{AUTH}{path}", json=json, headers=h)


def _refresh_set_cookie(response) -> str | None:
    for header in response.headers.get_list("set-cookie"):
        if header.startswith(f"{EXTERNAL_REFRESH_COOKIE_NAME}="):
            return header
    return None


def _cookie_value(set_cookie: str) -> str:
    return set_cookie.split(";", 1)[0].split("=", 1)[1].strip('"')


def _is_clearing(set_cookie: str | None) -> bool:
    return set_cookie is not None and "max-age=0" in set_cookie.lower()


async def _login(ac, s: dict, *, csrf: bool):
    body = {
        "company_code": s["tenant"].company_code,
        "email": s["principal"].email,
        "password": PASSWORD,
        "principal_type": PRINCIPAL_CUSTOMER,
    }
    r = await _post(ac, "/login", json=body, headers=CSRF if csrf else None)
    assert r.status_code == 200, r.text
    return r


@pytest.fixture
def cookie_mode(monkeypatch):
    monkeypatch.setattr(get_settings(), "auth_refresh_cookie_enabled", True)


@pytest.mark.asyncio
async def test_flag_off_behaviour_unchanged(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    async with _client(db) as ac:
        r = await _login(ac, s, csrf=True)
        data = r.json()
        assert len(data["refresh_token"]) > 10 and data["refresh_cookie"] is False
        assert _refresh_set_cookie(r) is None

        r = await _post(ac, "/refresh", json={"refresh_token": data["refresh_token"]})
        assert r.status_code == 200, r.text
        assert len(r.json()["refresh_token"]) > 10 and _refresh_set_cookie(r) is None

        # A cookie is ignored while the flag is off: the body token stays required.
        r = await _post(ac, "/refresh", headers=CSRF, cookie=data["refresh_token"])
        assert r.status_code == 422

        r = await _post(ac, "/logout")
        assert r.status_code in (401, 403)
        r = await _post(ac, "/logout", headers={"Authorization": f"Bearer {data['access_token']}"})
        assert r.status_code == 204 and _refresh_set_cookie(r) is None


@pytest.mark.asyncio
async def test_cookie_mode_login_sets_httponly_cookie(db_session_integration, cookie_mode):
    db = db_session_integration
    s = await _seed(db)
    async with _client(db) as ac:
        r = await _login(ac, s, csrf=True)
        data = r.json()
        assert data["refresh_cookie"] is True and data["refresh_token"] == ""
        set_cookie = _refresh_set_cookie(r)
        assert set_cookie is not None
        attrs = set_cookie.lower()
        assert "httponly" in attrs and "secure" in attrs and "samesite=strict" in attrs
        assert f"path={EXTERNAL_REFRESH_COOKIE_PATH}" in attrs
        assert f"max-age={get_settings().external_jwt_refresh_expire_days * 86400}" in attrs
        assert len(_cookie_value(set_cookie)) > 10

        # Older frontend (no header): cookie is set too, and the body token is still returned.
        r = await _login(ac, s, csrf=False)
        assert len(r.json()["refresh_token"]) > 10 and _refresh_set_cookie(r) is not None


@pytest.mark.asyncio
async def test_cookie_mode_refresh_via_cookie(db_session_integration, cookie_mode):
    db = db_session_integration
    s = await _seed(db)
    async with _client(db) as ac:
        cookie = _cookie_value(_refresh_set_cookie(await _login(ac, s, csrf=True)))

        r = await _post(ac, "/refresh", headers=CSRF, cookie=cookie)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["refresh_token"] == "" and data["refresh_cookie"] is True
        new_cookie = _refresh_set_cookie(r)
        assert new_cookie is not None and not _is_clearing(new_cookie)

        ac.cookies.clear()
        me = await ac.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {data['access_token']}"})
        assert me.status_code == 200 and me.json()["principal_id"] == s["principal"].id


@pytest.mark.asyncio
async def test_cookie_refresh_without_csrf_header_is_rejected(db_session_integration, cookie_mode):
    db = db_session_integration
    s = await _seed(db)
    async with _client(db) as ac:
        cookie = _cookie_value(_refresh_set_cookie(await _login(ac, s, csrf=True)))
        r = await _post(ac, "/refresh", cookie=cookie)
        assert r.status_code == 403
        assert "access_token" not in r.text and _refresh_set_cookie(r) is None
        r = await _post(ac, "/refresh", headers={CSRF_HEADER_NAME: "XMLHttpRequest"}, cookie=cookie)
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_cookie_mode_body_refresh_still_works(db_session_integration, cookie_mode):
    db = db_session_integration
    s = await _seed(db)
    async with _client(db) as ac:
        body_token = (await _login(ac, s, csrf=False)).json()["refresh_token"]

        r = await _post(ac, "/refresh", json={"refresh_token": body_token})
        assert r.status_code == 200, r.text
        assert len(r.json()["refresh_token"]) > 10

        # New frontend still holding a token from before the switch: moves to the cookie.
        r = await _post(ac, "/refresh", json={"refresh_token": body_token}, headers=CSRF)
        assert r.status_code == 200, r.text
        assert r.json()["refresh_token"] == "" and _refresh_set_cookie(r) is not None


@pytest.mark.asyncio
async def test_cookie_logout_clears_cookie_and_revokes(db_session_integration, cookie_mode):
    db = db_session_integration
    s = await _seed(db)
    async with _client(db) as ac:
        login = await _login(ac, s, csrf=True)
        access = login.json()["access_token"]
        cookie = _cookie_value(_refresh_set_cookie(login))

        r = await _post(ac, "/logout", cookie=cookie)
        assert r.status_code == 403  # cookie-only logout needs the CSRF header

        r = await _post(ac, "/logout", headers=CSRF, cookie=cookie)
        assert r.status_code == 204
        assert _is_clearing(_refresh_set_cookie(r))

        r = await _post(ac, "/refresh", headers=CSRF, cookie=cookie)
        assert r.status_code == 401
        assert _is_clearing(_refresh_set_cookie(r))

        ac.cookies.clear()
        me = await ac.get(f"{AUTH}/me", headers={"Authorization": f"Bearer {access}"})
        assert me.status_code == 401


@pytest.mark.asyncio
async def test_cookie_mode_bearer_logout_and_bad_cookie(db_session_integration, cookie_mode):
    db = db_session_integration
    s = await _seed(db)
    async with _client(db) as ac:
        access = (await _login(ac, s, csrf=True)).json()["access_token"]
        r = await _post(ac, "/logout", headers={"Authorization": f"Bearer {access}"})
        assert r.status_code == 204 and _is_clearing(_refresh_set_cookie(r))

        r = await _post(ac, "/refresh", headers=CSRF, cookie="not-a-real-token")
        assert r.status_code == 401 and _is_clearing(_refresh_set_cookie(r))

        r = await _post(ac, "/refresh", headers=CSRF)
        assert r.status_code == 422
