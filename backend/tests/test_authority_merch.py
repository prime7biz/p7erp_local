"""Phase 6 merchandising: module grants + PDF + Class1 admin-equivalent (user_authority_classes_v1).

Run: docker compose exec backend pytest tests/test_authority_merch.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_1, AUTHORITY_CLASS_4
from app.common.authority.policy import elevated_role_or_manager_equivalent, is_manager_equivalent_for_module
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Customer, GarmentStyle, Inquiry, Order, Quotation, Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed(db, *, flag_on: bool = True, user_permissions: dict | None = None):
    slug = uuid.uuid4().hex[:10]
    flags = {USER_AUTHORITY_CLASSES_V1: True} if flag_on else {}
    tenant = Tenant(
        name=f"MerchAuth {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"MA{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(
        tenant_id=tenant.id,
        name="user",
        display_name="User",
        permissions=user_permissions if user_permissions is not None else {},
    )
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
        "c1_merch": await _user("c1m", AUTHORITY_CLASS_1, modules=["merch"]),
        "c4_merch": await _user("c4m", AUTHORITY_CLASS_4, modules=["merch"]),
        "c4_fin": await _user("c4f", AUTHORITY_CLASS_4, modules=["finance"]),
        "admin_legacy": await _user("adm", AUTHORITY_CLASS_4, modules=[], admin=True),
    }
    return tenant, users


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


async def _seed_merch_docs(db, tenant: Tenant):
    slug = uuid.uuid4().hex[:6]
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"C-{slug}",
        name=f"Buyer {slug}",
        status="active",
    )
    db.add(customer)
    await db.flush()
    style = GarmentStyle(
        tenant_id=tenant.id,
        style_code=f"ST-{slug}",
        name=f"Style {slug}",
        buyer_customer_id=customer.id,
        status="ACTIVE",
    )
    db.add(style)
    await db.flush()
    inquiry = Inquiry(
        tenant_id=tenant.id,
        customer_id=customer.id,
        inquiry_code=f"INQ-{slug}",
        style_ref=f"REF-{slug}",
        style_id=style.id,
        status="DRAFT",
        quantity=100,
    )
    db.add(inquiry)
    await db.flush()
    quotation = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        inquiry_id=inquiry.id,
        quotation_code=f"QUO-{slug}",
        style_ref=f"REF-{slug}",
        style_id=style.id,
        status="DRAFT",
        projected_quantity=100,
    )
    db.add(quotation)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_id=quotation.id,
        order_code=f"ORD-{slug}",
        style_ref=f"REF-{slug}",
        style_id=style.id,
        status="CONFIRMED",
        pipeline_status="ORDER_CONFIRMED",
        quantity=100,
    )
    db.add(order)
    await db.flush()
    return {
        "customer": customer,
        "style": style,
        "inquiry": inquiry,
        "quotation": quotation,
        "order": order,
    }


@pytest.mark.asyncio
async def test_module_grant_blocks_merch_without_merch(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get(
                "/api/v1/customers/paginated?page=1&page_size=10",
                headers=_headers(users["c4_fin"], tenant),
            )
            assert denied.status_code == 403, denied.text
            allowed = await client.get(
                "/api/v1/customers/paginated?page=1&page_size=10",
                headers=_headers(users["c4_merch"], tenant),
            )
            assert allowed.status_code == 200, allowed.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_merch_pdfs_and_cross_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)
    docs = await _seed_merch_docs(db, tenant)

    other = Tenant(
        name=f"Other {uuid.uuid4().hex[:8]}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"OT{uuid.uuid4().hex[:8]}"[:18].upper(),
        feature_flags={USER_AUTHORITY_CLASSES_V1: True},
    )
    db.add(other)
    await db.flush()
    other_role = Role(tenant_id=other.id, name="user", display_name="User", permissions={})
    db.add(other_role)
    await db.flush()
    other_user = User(
        tenant_id=other.id,
        role_id=other_role.id,
        email=f"o_{uuid.uuid4().hex[:8]}@example.com",
        username=f"o_{uuid.uuid4().hex[:8]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_4,
    )
    db.add(other_user)
    await db.flush()
    db.add(UserModuleGrant(tenant_id=other.id, user_id=other_user.id, module_code="merch"))
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            paths = [
                f"/api/v1/customers/{docs['customer'].id}/pdf",
                f"/api/v1/inquiries/{docs['inquiry'].id}/pdf",
                f"/api/v1/quotations/{docs['quotation'].id}/pdf",
                f"/api/v1/orders/{docs['order'].id}/pdf",
                f"/api/v1/merch/styles/{docs['style'].id}/pdf",
            ]
            for path in paths:
                ok = await client.get(path, headers=_headers(users["c4_merch"], tenant))
                assert ok.status_code == 200, f"{path}: {ok.text}"
                assert ok.headers.get("content-type", "").startswith("application/pdf")
                assert ok.content[:4] == b"%PDF"

                denied_module = await client.get(path, headers=_headers(users["c4_fin"], tenant))
                assert denied_module.status_code == 403, f"{path}: {denied_module.text}"

                # Same id, foreign tenant header → not found (no cross-tenant leak).
                cross = await client.get(path, headers=_headers(other_user, other))
                assert cross.status_code == 404, f"{path}: {cross.text}"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_can_force_pipeline_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)
    docs = await _seed_merch_docs(db, tenant)
    order = docs["order"]

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            c4 = await client.patch(
                f"/api/v1/orders/{order.id}/status",
                headers=_headers(users["c4_merch"], tenant),
                json={"status": "CONFIRMED", "force_pipeline_status": "IN_PRODUCTION"},
            )
            assert c4.status_code == 403, c4.text

            c1 = await client.patch(
                f"/api/v1/orders/{order.id}/status",
                headers=_headers(users["c1_merch"], tenant),
                json={"status": "CONFIRMED", "force_pipeline_status": "IN_PRODUCTION"},
            )
            assert c1.status_code == 200, c1.text
            assert (c1.json().get("pipeline_status") or "").upper() == "IN_PRODUCTION"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_class1_cannot_force_pipeline_without_admin_role(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)
    docs = await _seed_merch_docs(db, tenant)
    order = docs["order"]

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.patch(
                f"/api/v1/orders/{order.id}/status",
                headers=_headers(users["c1_merch"], tenant),
                json={"status": "CONFIRMED", "force_pipeline_status": "IN_PRODUCTION"},
            )
            assert denied.status_code == 403, denied.text

            ok = await client.patch(
                f"/api/v1/orders/{order.id}/status",
                headers=_headers(users["admin_legacy"], tenant),
                json={"status": "CONFIRMED", "force_pipeline_status": "IN_PRODUCTION"},
            )
            assert ok.status_code == 200, ok.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_class1_bypasses_denied_commercial_capability_when_flag_on(db_session_integration):
    """AC6: explicit false commercial.view_changes denies Class4; Class1+merch still allowed."""
    db = db_session_integration
    tenant, users = await _seed(
        db,
        flag_on=True,
        user_permissions={"commercial.view_changes": False},
    )

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get(
                "/api/v1/change-requests/pending-summary",
                headers=_headers(users["c4_merch"], tenant),
            )
            assert denied.status_code == 403, denied.text

            allowed = await client.get(
                "/api/v1/change-requests/pending-summary",
                headers=_headers(users["c1_merch"], tenant),
            )
            assert allowed.status_code == 200, allowed.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_class1_does_not_bypass_denied_commercial_capability(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(
        db,
        flag_on=False,
        user_permissions={"commercial.view_changes": False},
    )

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            denied = await client.get(
                "/api/v1/change-requests/pending-summary",
                headers=_headers(users["c1_merch"], tenant),
            )
            assert denied.status_code == 403, denied.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_manager_equivalent_helpers_respect_flag_and_module(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)
    flags = tenant.feature_flags

    assert await is_manager_equivalent_for_module(
        db, users["c1_merch"], tenant.id, "merch", feature_flags=flags
    )
    assert not await is_manager_equivalent_for_module(
        db, users["c4_merch"], tenant.id, "merch", feature_flags=flags
    )
    assert not await is_manager_equivalent_for_module(
        db, users["c1_merch"], tenant.id, "finance", feature_flags=flags
    )
    assert await elevated_role_or_manager_equivalent(
        db, users["c1_merch"], module_code="merch", feature_flags=flags
    )
    assert not await elevated_role_or_manager_equivalent(
        db, users["c4_merch"], module_code="merch", feature_flags=flags
    )

    tenant_off, users_off = await _seed(db, flag_on=False)
    assert not await is_manager_equivalent_for_module(
        db, users_off["c1_merch"], tenant_off.id, "merch", feature_flags=tenant_off.feature_flags
    )
