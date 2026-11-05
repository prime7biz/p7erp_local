"""Platform super-admin login: per-IP rate limit and per-username failure lock.

Run:
    docker compose exec backend pytest tests/test_platform_admin_login_lockout.py -q
"""

from __future__ import annotations

import random
import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import hash_password
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import PlatformAdmin

LOGIN_URL = "/api/v1/admin/auth/login"


def _random_public_ip() -> str:
    return f"8.{random.randint(1, 250)}.{random.randint(1, 250)}.{random.randint(1, 250)}"


async def _create_admin(db, password: str) -> PlatformAdmin:
    slug = uuid.uuid4().hex[:10]
    admin = PlatformAdmin(
        username=f"pa_{slug}",
        email=f"pa_{slug}@example.com",
        password_hash=await hash_password(password),
        role="super_admin",
        is_active=True,
    )
    db.add(admin)
    await db.flush()
    return admin


@pytest.fixture
def client_with_db(db_session_integration):
    async def override_db():
        yield db_session_integration

    app.dependency_overrides[get_db] = override_db
    try:
        yield db_session_integration
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_admin_login_locks_after_max_failures(client_with_db, monkeypatch):
    db = client_with_db
    admin = await _create_admin(db, "CorrectPass1!")
    settings = get_settings()
    monkeypatch.setattr(settings, "platform_admin_login_max_attempts", 3)
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)
    headers = {"X-Forwarded-For": _random_public_ip()}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for _ in range(3):
            r = await ac.post(LOGIN_URL, json={"username": admin.username, "password": "WrongPass!!"}, headers=headers)
            assert r.status_code == 401, r.text
        locked = await ac.post(LOGIN_URL, json={"username": admin.username, "password": "CorrectPass1!"}, headers=headers)
        assert locked.status_code == 429, locked.text


@pytest.mark.asyncio
async def test_unknown_admin_username_gets_same_lock(client_with_db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "platform_admin_login_max_attempts", 2)
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)
    headers = {"X-Forwarded-For": _random_public_ip()}
    username = f"missing_{uuid.uuid4().hex[:10]}"

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for _ in range(2):
            r = await ac.post(LOGIN_URL, json={"username": username, "password": "x"}, headers=headers)
            assert r.status_code == 401, r.text
        r = await ac.post(LOGIN_URL, json={"username": username, "password": "x"}, headers=headers)
        assert r.status_code == 429, r.text


@pytest.mark.asyncio
async def test_admin_good_login_still_works_and_resets_failures(client_with_db, monkeypatch):
    db = client_with_db
    admin = await _create_admin(db, "CorrectPass1!")
    settings = get_settings()
    monkeypatch.setattr(settings, "platform_admin_login_max_attempts", 3)
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)
    headers = {"X-Forwarded-For": _random_public_ip()}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        for _ in range(2):
            r = await ac.post(LOGIN_URL, json={"username": admin.username, "password": "WrongPass!!"}, headers=headers)
            assert r.status_code == 401, r.text
        ok = await ac.post(LOGIN_URL, json={"username": admin.username, "password": "CorrectPass1!"}, headers=headers)
        assert ok.status_code == 200, ok.text
        assert ok.json().get("access_token")
        # Counter was cleared, so two more failures still do not lock the account.
        for _ in range(2):
            r = await ac.post(LOGIN_URL, json={"username": admin.username, "password": "WrongPass!!"}, headers=headers)
            assert r.status_code == 401, r.text


@pytest.mark.asyncio
async def test_admin_login_per_ip_rate_limit(client_with_db, monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 2)
    monkeypatch.setattr(settings, "platform_admin_login_max_attempts", 100)
    headers = {"X-Forwarded-For": _random_public_ip()}

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        codes = []
        for i in range(3):
            r = await ac.post(
                LOGIN_URL,
                json={"username": f"ip_{uuid.uuid4().hex[:8]}_{i}", "password": "x"},
                headers=headers,
            )
            codes.append(r.status_code)
    assert codes == [401, 401, 429]
