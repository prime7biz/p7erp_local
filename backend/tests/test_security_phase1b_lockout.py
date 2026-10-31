"""Phase 1b: staff login lockout after N failures.

Run:
docker compose exec backend pytest tests/test_security_phase1b_lockout.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import hash_password
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType


@pytest.mark.asyncio
async def test_staff_login_locks_after_max_failures(db_session_integration, monkeypatch):
    db = db_session_integration
    slug = uuid.uuid4().hex[:8]
    tenant = Tenant(
        name=f"Lock {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"lk{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"lock_{slug}@example.com",
        username=f"lock_{slug}",
        password_hash=await hash_password("CorrectPass1!"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    await db.commit()

    # Speed up the test: lock after 3 failures.
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "staff_login_max_attempts", 3)
    monkeypatch.setattr(settings, "staff_login_lockout_minutes", 30)
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            for _ in range(3):
                r = await ac.post(
                    "/api/v1/auth/login",
                    json={
                        "company_code": tenant.company_code,
                        "username": user.username,
                        "password": "WrongPass!!!",
                        "login_as": "staff",
                    },
                )
                assert r.status_code == 401, r.text

            locked = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "username": user.username,
                    "password": "CorrectPass1!",
                    "login_as": "staff",
                },
            )
            assert locked.status_code == 403, locked.text
            assert "locked" in locked.text.lower()
    finally:
        app.dependency_overrides.pop(get_db, None)
