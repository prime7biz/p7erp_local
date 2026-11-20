"""Phase 6 inventory: purchase order Class 1 (user_authority_classes_v1) — AC31.

Run: docker compose exec backend pytest tests/test_authority_purchase_order_class1.py -q
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
        name=f"PO {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"PO{slug}"[:18].upper(),
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
        "c4_inv": await _user("c4i", AUTHORITY_CLASS_4, modules=["inventory"]),
    }
    return tenant, users


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


async def _create_draft_po(client: AsyncClient, headers: dict[str, str]) -> int:
    created = await client.post(
        "/api/v1/inventory/purchase-orders",
        headers=headers,
        json={
            "supplier_name": "AC31 Supplier",
            "status": "DRAFT",
            "items": [],
        },
    )
    assert created.status_code == 200, created.text
    return int(created.json()["id"])


@pytest.mark.asyncio
async def test_po_approve_queues_class1_and_ratify(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = _headers(users["c4_inv"], tenant)
            c1 = _headers(users["c1"], tenant)
            c1b = _headers(users["c1b"], tenant)
            po_id = await _create_draft_po(client, c4)

            # Class 1 creates + approves → SoD must block that same Class 1 from ratifying
            po_id_sod = await _create_draft_po(client, c1)
            approved_by_c1 = await client.patch(
                f"/api/v1/inventory/purchase-orders/{po_id_sod}/status",
                headers=c1,
                json={"status": "APPROVED"},
            )
            assert approved_by_c1.status_code == 200, approved_by_c1.text
            assert approved_by_c1.json().get("class1_approval_status") == "PENDING_CLASS1"
            sod = await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id_sod}/class1-approve",
                headers=c1,
            )
            assert sod.status_code == 403, sod.text
            assert "Separation of duties" in (sod.json().get("detail") or "")

            approved = await client.patch(
                f"/api/v1/inventory/purchase-orders/{po_id}/status",
                headers=c4,
                json={"status": "APPROVED"},
            )
            assert approved.status_code == 200, approved.text
            assert approved.json().get("class1_approval_status") == "PENDING_CLASS1"
            assert approved.json().get("status") == "APPROVED"

            wrong_mod = await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id}/class1-approve",
                headers=_headers(users["c1_nofin"], tenant),
            )
            assert wrong_mod.status_code == 403, wrong_mod.text

            # Creator/approver is c4; other Class 1 may ratify
            ok = await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id}/class1-approve",
                headers=c1,
            )
            assert ok.status_code == 200, ok.text
            assert ok.json().get("class1_approval_status") == "APPROVED"

            # Cross-tenant: other tenant's PO id looks like not found
            other = Tenant(
                name=f"Other {uuid.uuid4().hex[:8]}",
                tenant_type=TenantType.both,
                is_active=True,
                company_code=f"OX{uuid.uuid4().hex[:8]}".upper()[:18],
                feature_flags={USER_AUTHORITY_CLASSES_V1: True},
            )
            db.add(other)
            await db.flush()
            cross = await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id}/class1-approve",
                headers={
                    "Authorization": c1["Authorization"],
                    "X-Tenant-Id": str(other.id),
                },
            )
            assert cross.status_code in (403, 404), cross.text

            replay = await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id}/class1-approve",
                headers=c1b,
            )
            assert replay.status_code == 409, replay.text

            inbox = await client.get("/api/v1/authority/inbox", headers=c1)
            assert inbox.status_code == 200, inbox.text
            waiting = inbox.json().get("waiting_for_me") or []
            assert not any(r.get("kind") == "purchase_order_class1" and r.get("id") == po_id for r in waiting)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_po_class1_reject_cancels_and_inbox(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = _headers(users["c4_inv"], tenant)
            c1 = _headers(users["c1"], tenant)
            po_id = await _create_draft_po(client, c4)
            await client.patch(
                f"/api/v1/inventory/purchase-orders/{po_id}/status",
                headers=c4,
                json={"status": "APPROVED"},
            )

            inbox = await client.get("/api/v1/authority/inbox", headers=c1)
            assert inbox.status_code == 200, inbox.text
            waiting = inbox.json().get("waiting_for_me") or []
            assert any(r.get("kind") == "purchase_order_class1" and r.get("id") == po_id for r in waiting), waiting

            rejected = await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id}/class1-reject",
                headers=c1,
            )
            assert rejected.status_code == 200, rejected.text
            body = rejected.json()
            assert body.get("class1_approval_status") == "REJECTED"
            assert body.get("status") == "CANCELLED"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_po_reapprove_after_draft_requeues_class1(db_session_integration):
    """Moving APPROVED → DRAFT clears Class 1 so a later APPROVED re-queues."""
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = _headers(users["c4_inv"], tenant)
            c1 = _headers(users["c1"], tenant)
            po_id = await _create_draft_po(client, c4)
            await client.patch(
                f"/api/v1/inventory/purchase-orders/{po_id}/status",
                headers=c4,
                json={"status": "APPROVED"},
            )
            await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id}/class1-approve",
                headers=c1,
            )
            back = await client.patch(
                f"/api/v1/inventory/purchase-orders/{po_id}/status",
                headers=c4,
                json={"status": "DRAFT"},
            )
            assert back.status_code == 200, back.text
            assert back.json().get("class1_approval_status") in (None, "")
            again = await client.patch(
                f"/api/v1/inventory/purchase-orders/{po_id}/status",
                headers=c4,
                json={"status": "APPROVED"},
            )
            assert again.status_code == 200, again.text
            assert again.json().get("class1_approval_status") == "PENDING_CLASS1"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_approve_skips_class1_queue(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = _headers(users["c4_inv"], tenant)
            po_id = await _create_draft_po(client, c4)
            approved = await client.patch(
                f"/api/v1/inventory/purchase-orders/{po_id}/status",
                headers=c4,
                json={"status": "APPROVED"},
            )
            assert approved.status_code == 200, approved.text
            assert approved.json().get("class1_approval_status") in (None, "")
            missing = await client.post(
                f"/api/v1/inventory/purchase-orders/{po_id}/class1-approve",
                headers=_headers(users["c1"], tenant),
            )
            assert missing.status_code == 404, missing.text
    finally:
        app.dependency_overrides.pop(get_db, None)
