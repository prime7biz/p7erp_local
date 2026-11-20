"""Phase 6 commercial/PO: module grants + PO/PI PDF (user_authority_classes_v1).

Commercial routes mount under merch.access. PO routes under inventory.access.
Run: docker compose exec backend pytest tests/test_authority_commercial_po.py -q
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_4
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import ProformaInvoice, PurchaseOrder, Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed(db, *, flag_on: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {USER_AUTHORITY_CLASSES_V1: True} if flag_on else {}
    tenant = Tenant(
        name=f"CommPO {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"CP{slug}"[:18].upper(),
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add_all([admin_role, user_role])
    await db.flush()

    async def _user(prefix: str, cls: str, *, modules: list[str]) -> User:
        u = User(
            tenant_id=tenant.id,
            role_id=user_role.id,
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
        "c4_merch": await _user("c4m", AUTHORITY_CLASS_4, modules=["merch"]),
        "c4_inv": await _user("c4i", AUTHORITY_CLASS_4, modules=["inventory"]),
        "c4_fin": await _user("c4f", AUTHORITY_CLASS_4, modules=["finance"]),
        "c4_trade": await _user("c4t", AUTHORITY_CLASS_4, modules=["trade"]),
        "c4_facility": await _user("c4fc", AUTHORITY_CLASS_4, modules=["facility"]),
        "c4_none": await _user("c4n", AUTHORITY_CLASS_4, modules=[]),
    }
    return tenant, users


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_flag_off_module_grants_do_not_block_mounts(db_session_integration):
    """AC1: with user_authority_classes_v1 OFF, empty grants are a no-op (legacy soft RBAC)."""
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=False)
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-{uuid.uuid4().hex[:6]}",
        supplier_name="Fabric Ltd",
        order_date=date(2026, 11, 1),
        status="OPEN",
        currency="USD",
    )
    pi = ProformaInvoice(
        tenant_id=tenant.id,
        direction="EXPORT",
        reference=f"PI-{uuid.uuid4().hex[:6]}",
        status="DRAFT",
        currency="USD",
        amount=500,
    )
    db.add_all([po, pi])
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    bare = users["c4_none"]
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            po_pdf = await client.get(
                f"/api/v1/inventory/purchase-orders/{po.id}/pdf",
                headers=_headers(bare, tenant),
            )
            assert po_pdf.status_code == 200, po_pdf.text
            assert po_pdf.content[:4] == b"%PDF"

            pi_pdf = await client.get(
                f"/api/v1/commercial/proforma-invoices/{pi.id}/pdf",
                headers=_headers(bare, tenant),
            )
            assert pi_pdf.status_code == 200, pi_pdf.text
            assert pi_pdf.content[:4] == b"%PDF"

            trade = await client.get("/api/v1/trade-cases", headers=_headers(bare, tenant))
            assert trade.status_code == 200, trade.text

            facility = await client.get("/api/v1/facility/facilities", headers=_headers(bare, tenant))
            assert facility.status_code == 200, facility.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_po_pdf_requires_inventory_grant(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-{uuid.uuid4().hex[:6]}",
        supplier_name="Fabric Ltd",
        order_date=date(2026, 11, 1),
        status="OPEN",
        currency="USD",
        notes="Test",
    )
    db.add(po)
    await db.flush()

    other = Tenant(
        name=f"Other {uuid.uuid4().hex[:6]}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"OT{uuid.uuid4().hex[:8]}".upper()[:18],
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
        email=f"ox_{uuid.uuid4().hex[:6]}@example.com",
        username=f"ox_{uuid.uuid4().hex[:6]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_4,
    )
    db.add(other_user)
    await db.flush()
    db.add(UserModuleGrant(tenant_id=other.id, user_id=other_user.id, module_code="inventory"))
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    path = f"/api/v1/inventory/purchase-orders/{po.id}/pdf"
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            ok = await client.get(path, headers=_headers(users["c4_inv"], tenant))
            assert ok.status_code == 200, ok.text
            assert ok.headers.get("content-type", "").startswith("application/pdf")
            assert ok.content[:4] == b"%PDF"

            denied = await client.get(path, headers=_headers(users["c4_fin"], tenant))
            assert denied.status_code == 403, denied.text

            cross = await client.get(path, headers=_headers(other_user, other))
            assert cross.status_code == 404, cross.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_pi_pdf_requires_merch_grant_not_commercial_alone(db_session_integration):
    """Commercial router is mounted with merch.access — commercial module grant is not enough."""
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)
    # Add a user with only the commercial module code (no merch).
    slug = uuid.uuid4().hex[:6]
    role = (await db.get(Role, users["c4_fin"].role_id))
    assert role is not None
    commercial_only = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"comm_{slug}@example.com",
        username=f"comm_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_4,
    )
    db.add(commercial_only)
    await db.flush()
    db.add(UserModuleGrant(tenant_id=tenant.id, user_id=commercial_only.id, module_code="commercial"))
    await db.flush()

    pi = ProformaInvoice(
        tenant_id=tenant.id,
        direction="EXPORT",
        reference=f"PI-{slug}",
        status="DRAFT",
        currency="USD",
        amount=1000,
        buyer_name="Buyer Co",
    )
    db.add(pi)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    path = f"/api/v1/commercial/proforma-invoices/{pi.id}/pdf"
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            ok = await client.get(path, headers=_headers(users["c4_merch"], tenant))
            assert ok.status_code == 200, ok.text
            assert ok.content[:4] == b"%PDF"

            denied_fin = await client.get(path, headers=_headers(users["c4_fin"], tenant))
            assert denied_fin.status_code == 403, denied_fin.text

            denied_commercial_module = await client.get(path, headers=_headers(commercial_only, tenant))
            assert denied_commercial_module.status_code == 403, denied_commercial_module.text
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_trade_and_facility_mounts_need_own_grants(db_session_integration):
    db = db_session_integration
    tenant, users = await _seed(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            trade_ok = await client.get("/api/v1/trade-cases", headers=_headers(users["c4_trade"], tenant))
            assert trade_ok.status_code == 200, trade_ok.text

            trade_denied = await client.get("/api/v1/trade-cases", headers=_headers(users["c4_fin"], tenant))
            assert trade_denied.status_code == 403, trade_denied.text

            fac_ok = await client.get("/api/v1/facility/facilities", headers=_headers(users["c4_facility"], tenant))
            assert fac_ok.status_code == 200, fac_ok.text
            fac_denied = await client.get("/api/v1/facility/facilities", headers=_headers(users["c4_fin"], tenant))
            assert fac_denied.status_code == 403, fac_denied.text
    finally:
        app.dependency_overrides.pop(get_db, None)
