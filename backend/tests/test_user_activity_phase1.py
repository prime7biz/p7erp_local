"""Phase 1 User Activity: login IP/failed events, settings audit enrichment, my-activity.

Run:
  docker compose exec backend pytest tests/test_user_activity_phase1.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import hash_password
from app.database import get_db
from app.main import app
from app.models import AuditLog, Role, Tenant, User
from app.models.tenant import TenantType
from app.modules.audit.service import log_action, log_action_best_effort


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    cc = f"ua{slug}"[:18]
    tenant = Tenant(
        name=f"User Activity {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=cc,
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    staff_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(admin_role)
    db.add(staff_role)
    await db.flush()
    pwd = await hash_password("UserActivityTest123!")
    admin = User(
        tenant_id=tenant.id,
        role_id=admin_role.id,
        email=f"admin_{slug}@example.com",
        username=f"admin_{slug}",
        first_name="Ada",
        last_name="Admin",
        password_hash=pwd,
        is_active=True,
    )
    staff = User(
        tenant_id=tenant.id,
        role_id=staff_role.id,
        email=f"staff_{slug}@example.com",
        username=f"staff_{slug}",
        first_name="Sam",
        last_name="Staff",
        password_hash=pwd,
        is_active=True,
    )
    db.add(admin)
    db.add(staff)
    await db.commit()
    return tenant, admin, staff, "UserActivityTest123!"


@pytest.mark.asyncio
async def test_login_and_failed_login_write_ip_audit(db_session_integration):
    db = db_session_integration
    tenant, admin, _staff, password = await _seed(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            bad = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": "WrongPassword!!!",
                    "login_as": "admin",
                },
                headers={"X-Forwarded-For": "1.2.3.4", "User-Agent": "ActivityTestAgent/1.0"},
            )
            assert bad.status_code == 401, bad.text

            ok = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
                headers={"X-Forwarded-For": "9.9.9.9", "User-Agent": "ActivityTestAgent/1.0"},
            )
            assert ok.status_code == 200, ok.text
            token = ok.json()["access_token"]

            # Refresh session view of audit rows.
            await db.commit()
            failed = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "LOGIN_FAILED",
                        AuditLog.user_id == admin.id,
                    )
                )
            ).scalars().all()
            assert failed, "expected LOGIN_FAILED audit row"
            assert failed[-1].ip_address == "1.2.3.4"

            login_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "LOGIN",
                        AuditLog.user_id == admin.id,
                    )
                )
            ).scalars().all()
            assert login_rows
            assert login_rows[-1].ip_address == "9.9.9.9"
            assert login_rows[-1].user_agent and "ActivityTestAgent" in login_rows[-1].user_agent

            listed = await ac.get(
                "/api/v1/settings/audit",
                headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)},
            )
            assert listed.status_code == 200, listed.text
            body = listed.json()
            assert body["total"] >= 2
            sample = next(i for i in body["items"] if i["action"] == "LOGIN")
            assert sample["username"] == admin.username
            assert sample["full_name"] == "Ada Admin"
            assert sample["ip_address"] == "9.9.9.9"
            assert all(i["action"] not in ("API_REQUEST", "API_ERROR") for i in body["items"])
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_my_activity_is_own_rows_only_and_staff_cannot_list_all(db_session_integration):
    db = db_session_integration
    tenant, admin, staff, password = await _seed(db)

    await log_action(
        db,
        tenant_id=tenant.id,
        action="SETTINGS_USER_UPDATE",
        user_id=admin.id,
        resource="settings.user",
        details="admin did something",
        ip_address="198.51.100.1",
    )
    await log_action(
        db,
        tenant_id=tenant.id,
        action="SETTINGS_USER_UPDATE",
        user_id=staff.id,
        resource="settings.user",
        details="staff did something",
        ip_address="198.51.100.2",
    )
    # Technical noise must never appear on tenant activity endpoints.
    await log_action(
        db,
        tenant_id=tenant.id,
        action="API_REQUEST",
        user_id=staff.id,
        resource="http",
        details="should be hidden",
        ip_address="198.51.100.2",
    )
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            staff_login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": staff.email,
                    "password": password,
                    "login_as": "staff",
                },
            )
            assert staff_login.status_code == 200, staff_login.text
            staff_token = staff_login.json()["access_token"]
            headers = {"Authorization": f"Bearer {staff_token}", "X-Tenant-Id": str(tenant.id)}

            denied = await ac.get("/api/v1/settings/audit", headers=headers)
            assert denied.status_code == 403, denied.text

            mine = await ac.get("/api/v1/settings/my-activity", headers=headers)
            assert mine.status_code == 200, mine.text
            body = mine.json()
            assert body["total"] >= 1
            assert all(i["user_id"] == staff.id for i in body["items"])
            assert all(i["action"] != "API_REQUEST" for i in body["items"])
            assert any(i["details"] and "staff did something" in i["details"] for i in body["items"])
            assert not any(i["user_id"] == admin.id for i in body["items"])
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_log_action_best_effort_savepoint_does_not_rollback_caller(db_session_integration):
    db = db_session_integration
    tenant, admin, _staff, _password = await _seed(db)
    admin.last_login = None
    await db.flush()

    # Force a nested flush failure by using an impossibly long action that exceeds VARCHAR(64)
    # after a successful state change — prove the outer change survives.
    admin.last_login = admin.created_at
    await db.flush()
    await log_action_best_effort(
        db,
        tenant_id=tenant.id,
        action="X" * 200,  # AuditLog.action is String(64)
        user_id=admin.id,
        resource="auth",
    )
    await db.commit()
    await db.refresh(admin)
    assert admin.last_login is not None


@pytest.mark.asyncio
async def test_cross_tenant_audit_list_denied(db_session_integration):
    db = db_session_integration
    tenant_a, admin_a, _s, password = await _seed(db)
    tenant_b, admin_b, _s2, _ = await _seed(db)

    await log_action(
        db,
        tenant_id=tenant_b.id,
        action="LOGIN",
        user_id=admin_b.id,
        resource="auth",
        details="other tenant",
    )
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant_a.company_code,
                    "email": admin_a.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            # Using tenant A's token against tenant B header should fail tenant match.
            r = await ac.get(
                "/api/v1/settings/audit",
                headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_b.id)},
            )
            assert r.status_code in (401, 403, 404), r.text
    finally:
        app.dependency_overrides.pop(get_db, None)
