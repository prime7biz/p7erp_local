"""Global search: tenant isolation, RBAC-enforced module hiding, and LIKE wildcard escaping."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import RBAC_ENFORCEMENT
from app.database import get_db
from app.main import app
from app.models import Customer
from app.models.hr import Employee

from tests.go_live_fixtures import create_admin_tenant_with_user


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


def _kinds(body: dict) -> dict[str, list[str]]:
    return {g["kind"]: [h["title"] for h in g["hits"]] for g in body["groups"]}


@pytest.mark.asyncio
async def test_global_search_scoping_permissions_and_escaping(db_session_integration):
    db = db_session_integration
    tag = uuid.uuid4().hex[:6]
    t_a, u_a, _ = await create_admin_tenant_with_user(db)
    t_b, u_b, _ = await create_admin_tenant_with_user(db)
    # Merch-only role in an RBAC-enforced tenant: HR results must be hidden.
    t_c, u_c, role_c = await create_admin_tenant_with_user(db, permissions={"merch.access": True})
    role_c.name = "merch_viewer"  # "admin" role name bypasses permission checks
    t_c.feature_flags = {**(t_c.feature_flags or {}), RBAC_ENFORCEMENT: "enforce"}

    db.add_all(
        [
            Customer(tenant_id=t_a.id, customer_code=f"A{tag}", name=f"Zeta {tag} Apparel", status="active"),
            Customer(tenant_id=t_a.id, customer_code=f"P{tag}", name=f"100% {tag} Cotton", status="active"),
            Customer(tenant_id=t_b.id, customer_code=f"B{tag}", name=f"Zeta {tag} Other Tenant", status="active"),
            Customer(tenant_id=t_c.id, customer_code=f"C{tag}", name=f"Zeta {tag} Merch", status="active"),
            Employee(tenant_id=t_c.id, employee_code=f"E{tag}", first_name=f"Zeta{tag}", is_active=True),
        ]
    )
    await db.commit()

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            _as(db, u_a, t_a)
            r = await ac.get("/api/v1/search", params={"q": f"zeta {tag}"})
            assert r.status_code == 200, r.text
            found = _kinds(r.json())
            assert found.get("customer") == [f"Zeta {tag} Apparel"]
            assert r.json()["groups"][0]["hits"][0]["href"].startswith("/app/customers/")

            # "%" must match literally, not as a wildcard for everything.
            r = await ac.get("/api/v1/search", params={"q": f"100% {tag}"})
            assert _kinds(r.json()).get("customer") == [f"100% {tag} Cotton"]
            r = await ac.get("/api/v1/search", params={"q": "%%"})
            assert not any(tag in t for t in _kinds(r.json()).get("customer", []))

            assert (await ac.get("/api/v1/search", params={"q": "z"})).status_code == 422

            _as(db, u_c, t_c)
            r = await ac.get("/api/v1/search", params={"q": f"zeta{tag}"})
            assert "employee" not in _kinds(r.json())
            r = await ac.get("/api/v1/search", params={"q": f"zeta {tag}"})
            assert _kinds(r.json()).get("customer") == [f"Zeta {tag} Merch"]
    finally:
        app.dependency_overrides.clear()
