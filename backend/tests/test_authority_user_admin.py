"""Phase 2: Settings user/invite admin under user_authority_classes_v1.

Run: docker compose exec backend pytest tests/test_authority_user_admin.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import create_access_token, hash_password
from app.common.authority.constants import AUTHORITY_CLASS_2, AUTHORITY_CLASS_4, AUTHORITY_SUPER
from app.common.tenant_feature_keys import USER_AUTHORITY_CLASSES_V1
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.hr import Employee
from app.models.staff_invitation import StaffInvitation
from app.models.tenant import TenantType
from app.models.user_authority import UserModuleGrant


async def _seed_super(db, *, flag_on: bool = True) -> tuple[Tenant, User, Role]:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"UA {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"UA{slug}"[:18].upper(),
        feature_flags={USER_AUTHORITY_CLASSES_V1: True} if flag_on else {},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"super_{slug}@example.com",
        username=f"super_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_SUPER,
        is_tenant_super_admin=True,
    )
    db.add(user)
    await db.flush()
    await db.refresh(tenant)
    await db.refresh(user)
    return tenant, user, role


def _headers(user: User, tenant: Tenant) -> dict[str, str]:
    token = create_access_token(user.id, tenant_id=tenant.id, session_version=user.auth_session_version)
    return {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}


@pytest.mark.asyncio
async def test_create_user_with_class_and_modules(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _seed_super(db, flag_on=True)
    emp = Employee(
        tenant_id=tenant.id,
        employee_code=f"E{uuid.uuid4().hex[:6]}",
        first_name="Linkable",
        is_active=True,
    )
    db.add(emp)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users",
                headers=_headers(admin, tenant),
                json={
                    "email": f"c4_{uuid.uuid4().hex[:8]}@example.com",
                    "password": "StrongPass123!",
                    "first_name": "Entry",
                    "authority_class": "CLASS_4",
                    "module_grants": ["finance", "inventory"],
                    "employee_id": emp.id,
                },
            )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["authority_class"] == AUTHORITY_CLASS_4
        assert sorted(body["module_grants"]) == ["finance", "inventory"]
        assert body["employee_id"] == emp.id
        await db.refresh(emp)
        assert emp.user_id == body["id"]
        grants = (
            await db.execute(
                select(UserModuleGrant.module_code).where(
                    UserModuleGrant.tenant_id == tenant.id,
                    UserModuleGrant.user_id == body["id"],
                )
            )
        ).scalars().all()
        assert sorted(grants) == ["finance", "inventory"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_user_requires_modules_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _seed_super(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users",
                headers=_headers(admin, tenant),
                json={
                    "email": f"bad_{uuid.uuid4().hex[:8]}@example.com",
                    "password": "StrongPass123!",
                    "authority_class": "CLASS_3",
                    "module_grants": [],
                },
            )
        assert res.status_code == 400
        assert "module" in res.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_update_class_bumps_session_version(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await _seed_super(db, flag_on=True)
    target = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"tgt_{uuid.uuid4().hex[:8]}@example.com",
        username=f"tgt_{uuid.uuid4().hex[:8]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_4,
        is_tenant_super_admin=False,
        auth_session_version=1,
    )
    db.add(target)
    await db.flush()
    db.add(UserModuleGrant(tenant_id=tenant.id, user_id=target.id, module_code="finance"))
    await db.flush()
    before = target.auth_session_version

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/settings/users/{target.id}",
                headers=_headers(admin, tenant),
                json={
                    "authority_class": "CLASS_2",
                    "module_grants": ["finance", "hr"],
                },
            )
        assert res.status_code == 200, res.text
        await db.refresh(target)
        assert target.authority_class == AUTHORITY_CLASS_2
        assert target.auth_session_version == before + 1
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_invite_stores_authority_when_flag_on(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _seed_super(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users/invite",
                headers=_headers(admin, tenant),
                json={
                    "email": f"inv_{uuid.uuid4().hex[:8]}@example.com",
                    "first_name": "Invitee",
                    "authority_class": "CLASS_3",
                    "module_grants": ["merch", "production"],
                },
            )
        assert res.status_code in (200, 201), res.text
        body = res.json()
        inv = body.get("invitation") or body
        assert inv["authority_class"] == "CLASS_3"
        assert sorted(inv["module_grants"]) == ["merch", "production"]
        row = (
            await db.execute(
                select(StaffInvitation).where(
                    StaffInvitation.tenant_id == tenant.id,
                    StaffInvitation.email == inv["email"],
                )
            )
        ).scalar_one()
        assert row.authority_class == "CLASS_3"
        assert sorted(row.module_grants or []) == ["merch", "production"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_invite_rejects_foreign_employee(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _seed_super(db, flag_on=True)
    other = Tenant(
        name=f"Other {uuid.uuid4().hex[:6]}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"OT{uuid.uuid4().hex[:8]}".upper()[:18],
        feature_flags={},
    )
    db.add(other)
    await db.flush()
    foreign_emp = Employee(
        tenant_id=other.id,
        employee_code="FX1",
        first_name="Foreign",
        is_active=True,
    )
    db.add(foreign_emp)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users/invite",
                headers=_headers(admin, tenant),
                json={
                    "email": f"fx_{uuid.uuid4().hex[:8]}@example.com",
                    "authority_class": "CLASS_4",
                    "module_grants": ["settings"],
                    "employee_id": foreign_emp.id,
                },
            )
        assert res.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_linkable_employees_excludes_linked(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await _seed_super(db, flag_on=True)
    free = Employee(
        tenant_id=tenant.id,
        employee_code=f"F{uuid.uuid4().hex[:6]}",
        first_name="Free",
        is_active=True,
    )
    linked_user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"linked_{uuid.uuid4().hex[:8]}@example.com",
        username=f"linked_{uuid.uuid4().hex[:8]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_4,
    )
    db.add(linked_user)
    await db.flush()
    taken = Employee(
        tenant_id=tenant.id,
        employee_code=f"T{uuid.uuid4().hex[:6]}",
        first_name="Taken",
        is_active=True,
        user_id=linked_user.id,
    )
    db.add_all([free, taken])
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.get(
                "/api/v1/settings/users/linkable-employees",
                headers=_headers(admin, tenant),
            )
        assert res.status_code == 200, res.text
        ids = {row["id"] for row in res.json()}
        assert free.id in ids
        assert taken.id not in ids
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_create_still_uses_role(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await _seed_super(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users",
                headers=_headers(admin, tenant),
                json={
                    "email": f"legacy_{uuid.uuid4().hex[:8]}@example.com",
                    "password": "StrongPass123!",
                    "role_id": role.id,
                    "first_name": "Legacy",
                },
            )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["role_id"] == role.id
        grants = (
            await db.execute(
                select(UserModuleGrant).where(
                    UserModuleGrant.tenant_id == tenant.id,
                    UserModuleGrant.user_id == body["id"],
                )
            )
        ).scalars().all()
        assert grants == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_on_ignores_client_admin_role_id(db_session_integration):
    """UA-P2-01: Class 4 + role_id=admin must not store the admin role."""
    db = db_session_integration
    tenant, admin, admin_role = await _seed_super(db, flag_on=True)
    user_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(user_role)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users",
                headers=_headers(admin, tenant),
                json={
                    "email": f"stealth_{uuid.uuid4().hex[:8]}@example.com",
                    "password": "StrongPass123!",
                    "role_id": admin_role.id,
                    "authority_class": "CLASS_4",
                    "module_grants": ["finance"],
                },
            )
        assert res.status_code == 201, res.text
        body = res.json()
        assert body["authority_class"] == AUTHORITY_CLASS_4
        assert body["role_id"] == user_role.id
        assert body["role_id"] != admin_role.id
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_rejects_super_authority_class(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _seed_super(db, flag_on=True)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users",
                headers=_headers(admin, tenant),
                json={
                    "email": f"supertry_{uuid.uuid4().hex[:8]}@example.com",
                    "password": "StrongPass123!",
                    "authority_class": "SUPER",
                    "module_grants": ["settings"],
                },
            )
        assert res.status_code == 400
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_replace_module_grants_keeps_overlap(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await _seed_super(db, flag_on=True)
    target = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"ovl_{uuid.uuid4().hex[:8]}@example.com",
        username=f"ovl_{uuid.uuid4().hex[:8]}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
        authority_class=AUTHORITY_CLASS_4,
        is_tenant_super_admin=False,
    )
    db.add(target)
    await db.flush()
    db.add(UserModuleGrant(tenant_id=tenant.id, user_id=target.id, module_code="finance"))
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.patch(
                f"/api/v1/settings/users/{target.id}",
                headers=_headers(admin, tenant),
                json={"module_grants": ["finance", "hr"]},
            )
        assert res.status_code == 200, res.text
        assert sorted(res.json()["module_grants"]) == ["finance", "hr"]
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_flag_off_invite_still_uses_role(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await _seed_super(db, flag_on=False)

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users/invite",
                headers=_headers(admin, tenant),
                json={
                    "email": f"invoff_{uuid.uuid4().hex[:8]}@example.com",
                    "first_name": "LegacyInvite",
                    "role_id": role.id,
                },
            )
        assert res.status_code == 201, res.text
        inv = res.json()["invitation"]
        assert inv["role_id"] == role.id
        assert inv.get("authority_class") is None
        assert inv.get("module_grants") in ([], None)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_create_rejects_foreign_employee(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _seed_super(db, flag_on=True)
    other = Tenant(
        name=f"Other2 {uuid.uuid4().hex[:6]}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"OX{uuid.uuid4().hex[:8]}".upper()[:18],
        feature_flags={},
    )
    db.add(other)
    await db.flush()
    foreign_emp = Employee(
        tenant_id=other.id,
        employee_code="FX2",
        first_name="Foreign",
        is_active=True,
    )
    db.add(foreign_emp)
    await db.flush()

    async def _override():
        yield db

    app.dependency_overrides[get_db] = _override
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            res = await client.post(
                "/api/v1/settings/users",
                headers=_headers(admin, tenant),
                json={
                    "email": f"fxu_{uuid.uuid4().hex[:8]}@example.com",
                    "password": "StrongPass123!",
                    "authority_class": "CLASS_4",
                    "module_grants": ["settings"],
                    "employee_id": foreign_emp.id,
                },
            )
        assert res.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
