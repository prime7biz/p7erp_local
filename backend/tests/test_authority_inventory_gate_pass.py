"""Phase 6 inventory: module grants + gate pass Class 1 (user_authority_classes_v1).

Run: docker compose exec backend pytest tests/test_authority_inventory_gate_pass.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_1, AUTHORITY_CLASS_2, AUTHORITY_CLASS_4
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {USER_AUTHORITY_CLASSES_V1: True} if flag_on else {}
    tenant = Tenant(
        name=f"GP {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"GP{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()

    async def _user(prefix: str, cls: str, *, modules: list[str], admin: bool = False) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=admin_role.id if admin else user_role.id,
            email=f"{prefix}_{slug}@example.com",
            username=f"{prefix}_{slug}",
            password_hash=await hash_password("StrongPass123!"),
            is_active=True,
            authority_class=cls,
        )
        db.add(u)
        await db.flush()
        for code in modules:
            db.add(UserModuleGrant(tenant_id=tenant.id, user_id=u.id, module_code=code))
        await db.flush()
        return u

    users = {
        "c1": await _user("c1", AUTHORITY_CLASS_1, modules=["inventory"], admin=False),
        "c1b": await _user("c1b", AUTHORITY_CLASS_1, modules=["inventory"], admin=False),
        "c1_nofin": await _user("c1n", AUTHORITY_CLASS_1, modules=["finance"], admin=False),
        "c2": await _user("c2", AUTHORITY_CLASS_2, modules=["inventory"]),
        "c4_fin": await _user("c4f", AUTHORITY_CLASS_4, modules=["finance"]),
        "c4_inv": await _user("c4i", AUTHORITY_CLASS_4, modules=["inventory"]),
    }
    return tenant, users


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_module_grant_blocks_inventory_without_inventory(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get(
                "/api/v1/inventory/enhanced-gate-passes",
                headers=_headers(users["c4_fin"], tenant),
            )
            assert denied.status_code == 403, denied.text
            allowed = await client.get(
                "/api/v1/inventory/enhanced-gate-passes",
                headers=_headers(users["c4_inv"], tenant),
            )
            assert allowed.status_code == 200, allowed.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_gate_pass_release_queues_class1_and_ratify(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = _headers(users["c4_inv"], tenant)
            c1 = _headers(users["c1"], tenant)
            created = await client.post(
                "/api/v1/inventory/enhanced-gate-passes",
                headers=c4,
                json={"purpose": "Delivery", "destination": "Yard", "status": "DRAFT"},
            )
            assert created.status_code == 200, created.text
            gp_id = created.json()["id"]

            released = await client.post(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/status",
                headers=c4,
                json={"status": "RELEASED"},
            )
            assert released.status_code == 200, released.text
            assert released.json().get("class1_approval_status") == "PENDING_CLASS1"

            # Creator/releaser cannot ratify
            self_deny = await client.post(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/class1-approve",
                headers=c4,
            )
            assert self_deny.status_code in (403, 409), self_deny.text

            no_inv = await client.post(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/class1-approve",
                headers=_headers(users["c1_nofin"], tenant),
            )
            assert no_inv.status_code == 403, no_inv.text

            ok = await client.post(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/class1-approve",
                headers=c1,
            )
            assert ok.status_code == 200, ok.text
            assert ok.json().get("class1_approval_status") == "APPROVED"

            inbox = await client.get("/api/v1/authority/inbox", headers=_headers(users["c1b"], tenant))
            assert inbox.status_code == 200, inbox.text
            # Already approved — should not appear as pending for Class 1
            assert not any(
                r.get("kind") == "gate_pass_class1" and r.get("id") == gp_id
                for r in inbox.json().get("waiting_for_me") or []
            )

            pdf = await client.get(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/pdf",
                headers=c4,
            )
            assert pdf.status_code == 200, pdf.text
            assert pdf.headers.get("content-type", "").startswith("application/pdf")
            assert pdf.content[:4] == b"%PDF"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_gate_pass_class1_reject_and_inbox(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = _headers(users["c4_inv"], tenant)
            c1 = _headers(users["c1"], tenant)
            created = await client.post(
                "/api/v1/inventory/enhanced-gate-passes",
                headers=c4,
                json={"purpose": "Return", "status": "DRAFT"},
            )
            gp_id = created.json()["id"]
            await client.post(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/status",
                headers=c4,
                json={"status": "RELEASED"},
            )

            inbox = await client.get("/api/v1/authority/inbox", headers=c1)
            assert inbox.status_code == 200, inbox.text
            waiting = inbox.json().get("waiting_for_me") or []
            assert any(r.get("kind") == "gate_pass_class1" and r.get("id") == gp_id for r in waiting), waiting

            rejected = await client.post(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/class1-reject",
                headers=c1,
            )
            assert rejected.status_code == 200, rejected.text
            body = rejected.json()
            assert body.get("class1_approval_status") == "REJECTED"
            assert body.get("status") == "REJECTED"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_inventory_passes_manager_gate(db_session_integration):
    """AC8: non-admin Class 1 with inventory may call manager-gated inventory actions."""
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            ok = await client.post(
                "/api/v1/inventory/fifo-rebuild",
                headers=_headers(users["c1"], tenant),
            )
            assert ok.status_code == 200, ok.text

            denied = await client.post(
                "/api/v1/inventory/fifo-rebuild",
                headers=_headers(users["c4_inv"], tenant),
            )
            assert denied.status_code == 403, denied.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_release_skips_class1_queue(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = _headers(users["c4_inv"], tenant)
            created = await client.post(
                "/api/v1/inventory/enhanced-gate-passes",
                headers=c4,
                json={"purpose": "Delivery", "status": "DRAFT"},
            )
            assert created.status_code == 200, created.text
            gp_id = created.json()["id"]
            released = await client.post(
                f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/status",
                headers=c4,
                json={"status": "RELEASED"},
            )
            assert released.status_code == 200, released.text
            assert released.json().get("class1_approval_status") in (None, "")
    finally:
        app.dependency_overrides.pop(get_db, None)
