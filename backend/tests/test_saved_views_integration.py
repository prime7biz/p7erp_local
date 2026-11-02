"""Saved list views: own + shared visibility, owner-only edits, tenant isolation, validation."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import User

from tests.go_live_fixtures import create_admin_tenant_with_user

BASE = "/api/v1/saved-views"


def _as(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


@pytest.mark.asyncio
async def test_saved_views_sharing_ownership_and_isolation(db_session_integration):
    db = db_session_integration
    tenant, owner, role = await create_admin_tenant_with_user(db)
    colleague = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"sv{uuid.uuid4().hex[:8]}",
        email=f"sv{uuid.uuid4().hex[:8]}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(colleague)
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            _as(db, owner, tenant)
            cfg = {"query": "status=active", "hidden_columns": ["email"], "density": "compact"}
            r = await ac.post(BASE, json={"table_key": "customers.list", "name": "Active", "config": cfg, "is_shared": True})
            assert r.status_code == 201, r.text
            shared_id = r.json()["id"]
            assert r.json()["is_mine"] is True
            r = await ac.post(BASE, json={"table_key": "customers.list", "name": "Mine only", "config": {}})
            private_id = r.json()["id"]

            bad = await ac.post(BASE, json={"table_key": "Bad Key!", "name": "x", "config": {}})
            assert bad.status_code == 422
            huge = await ac.post(BASE, json={"table_key": "customers.list", "name": "x", "config": {"q": "a" * 17000}})
            assert huge.status_code == 422

            _as(db, colleague, tenant)
            r = await ac.get(BASE, params={"table_key": "customers.list"})
            assert r.status_code == 200
            seen = {v["id"]: v for v in r.json()}
            assert shared_id in seen and private_id not in seen
            assert seen[shared_id]["is_mine"] is False
            assert seen[shared_id]["config"] == cfg
            assert (await ac.patch(f"{BASE}/{shared_id}", json={"name": "hijack"})).status_code == 403
            assert (await ac.delete(f"{BASE}/{shared_id}")).status_code == 403

            _as(db, outsider, other_tenant)
            r = await ac.get(BASE, params={"table_key": "customers.list"})
            assert r.json() == []
            assert (await ac.patch(f"{BASE}/{shared_id}", json={"name": "x"})).status_code == 404
            assert (await ac.delete(f"{BASE}/{private_id}")).status_code == 404

            _as(db, owner, tenant)
            r = await ac.patch(f"{BASE}/{shared_id}", json={"name": "Active buyers", "is_shared": False})
            assert r.status_code == 200 and r.json()["name"] == "Active buyers"
            assert (await ac.delete(f"{BASE}/{private_id}")).status_code == 204

            _as(db, colleague, tenant)
            r = await ac.get(BASE, params={"table_key": "customers.list"})
            assert r.json() == []
    finally:
        app.dependency_overrides.clear()
