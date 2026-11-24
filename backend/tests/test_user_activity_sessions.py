"""Phase 2 User Activity sessions: JWT sid, login/logout session rows, list APIs.

Run:
  docker compose exec backend pytest tests/test_user_activity_sessions.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import decode_access_token, hash_password
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.tenant import TenantType
from app.models.user_login_session import UserLoginSession


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    cc = f"us{slug}"[:18]
    tenant = Tenant(
        name=f"Sessions {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=cc,
        feature_flags={"single_session_enforced": True},
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    staff_role = Role(tenant_id=tenant.id, name="user", display_name="User", permissions={})
    db.add(admin_role)
    db.add(staff_role)
    await db.flush()
    pwd = await hash_password("SessionTest123!")
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
    return tenant, admin, staff, "SessionTest123!"


@pytest.mark.asyncio
async def test_login_creates_session_and_logout_closes_it(db_session_integration, monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "user_session_tracking_enabled", True)

    db = db_session_integration
    tenant, admin, _staff, password = await _seed(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
                headers={"X-Forwarded-For": "1.2.3.4", "User-Agent": "Mozilla/5.0 Chrome/120.0 Windows NT 10.0"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            payload = decode_access_token(token)
            assert payload.get("sid"), "JWT must carry sid"
            sid = payload["sid"]

            await db.commit()
            rows = (
                await db.execute(
                    select(UserLoginSession).where(
                        UserLoginSession.tenant_id == tenant.id,
                        UserLoginSession.user_id == admin.id,
                        UserLoginSession.session_id == sid,
                    )
                )
            ).scalars().all()
            assert len(rows) == 1
            assert rows[0].logout_at is None
            assert rows[0].ip_address == "1.2.3.4"

            # Second login supersedes the first under single-session.
            login2 = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
                headers={"X-Forwarded-For": "9.9.9.9", "User-Agent": "Mozilla/5.0 Firefox/121.0 Windows NT 10.0"},
            )
            assert login2.status_code == 200, login2.text
            token2 = login2.json()["access_token"]
            sid2 = decode_access_token(token2)["sid"]
            assert sid2 != sid
            await db.commit()

            first = (
                await db.execute(
                    select(UserLoginSession).where(
                        UserLoginSession.tenant_id == tenant.id,
                        UserLoginSession.session_id == sid,
                    )
                )
            ).scalar_one()
            assert first.logout_at is not None
            assert first.ended_reason == "superseded"

            headers = {"Authorization": f"Bearer {token2}", "X-Tenant-Id": str(tenant.id)}
            listed = await ac.get("/api/v1/settings/user-sessions", headers=headers)
            assert listed.status_code == 200, listed.text
            body = listed.json()
            assert body["total"] >= 2
            assert any(i["session_id"] == sid2 and i["is_active"] for i in body["items"])

            logout = await ac.post("/api/v1/auth/logout", headers=headers)
            assert logout.status_code == 204, logout.text
            await db.commit()
            current = (
                await db.execute(
                    select(UserLoginSession).where(
                        UserLoginSession.tenant_id == tenant.id,
                        UserLoginSession.session_id == sid2,
                    )
                )
            ).scalar_one()
            assert current.logout_at is not None
            assert current.ended_reason == "logout"
            assert (current.logout_at - current.login_at).total_seconds() >= 0
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_staff_sees_only_own_sessions(db_session_integration, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "user_session_tracking_enabled", True)
    db = db_session_integration
    tenant, admin, staff, password = await _seed(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
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
            token = staff_login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

            denied = await ac.get("/api/v1/settings/user-sessions", headers=headers)
            assert denied.status_code == 403

            mine = await ac.get("/api/v1/settings/my-sessions", headers=headers)
            assert mine.status_code == 200, mine.text
            assert all(i["user_id"] == staff.id for i in mine.json()["items"])
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_jwt_sid_issued_when_session_tracking_off(db_session_integration, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "user_session_tracking_enabled", False)
    db = db_session_integration
    tenant, admin, _staff, password = await _seed(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
            assert login.status_code == 200, login.text
            assert decode_access_token(login.json()["access_token"]).get("sid")
            await db.commit()
            rows = (
                await db.execute(
                    select(UserLoginSession).where(
                        UserLoginSession.tenant_id == tenant.id,
                        UserLoginSession.user_id == admin.id,
                    )
                )
            ).scalars().all()
            assert rows == []
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_sign_out_other_sessions_keeps_current(db_session_integration, monkeypatch):
    from app.config import get_settings
    from app.modules.auth.session_service import create_login_session, new_session_id

    monkeypatch.setattr(get_settings(), "user_session_tracking_enabled", True)
    db = db_session_integration
    tenant, admin, _staff, password = await _seed(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            # Disable single-session so two open rows can coexist before sign-out-others.
            tenant.feature_flags = {**(tenant.feature_flags or {}), "single_session_enforced": False}
            await db.commit()

            login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
                headers={"X-Forwarded-For": "1.2.3.4", "User-Agent": "Mozilla/5.0 Chrome/120.0 Windows NT 10.0"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            current_sid = decode_access_token(token)["sid"]
            await db.commit()

            other_sid = new_session_id()
            await create_login_session(
                db,
                tenant_id=tenant.id,
                user_id=admin.id,
                session_id=other_sid,
                session_version=None,
                ip_address="9.9.9.9",
                user_agent="Mozilla/5.0 Firefox/121.0 Macintosh",
                supersede_others=False,
            )
            await db.commit()

            headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}
            res = await ac.post("/api/v1/settings/my-sessions/sign-out-others", headers=headers)
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["closed_count"] >= 1
            assert body["access_token"]
            new_sid = decode_access_token(body["access_token"]).get("sid")
            assert new_sid == current_sid
            await db.commit()

            other = (
                await db.execute(
                    select(UserLoginSession).where(
                        UserLoginSession.tenant_id == tenant.id,
                        UserLoginSession.session_id == other_sid,
                    )
                )
            ).scalar_one()
            assert other.logout_at is not None
            assert other.ended_reason == "signed_out_by_user"

            current = (
                await db.execute(
                    select(UserLoginSession).where(
                        UserLoginSession.tenant_id == tenant.id,
                        UserLoginSession.session_id == current_sid,
                    )
                )
            ).scalar_one()
            assert current.logout_at is None
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_sign_out_others_blocked_while_impersonating(db_session_integration, monkeypatch):
    from datetime import datetime, timedelta

    from app.common.auth import create_access_token
    from app.config import get_settings
    from app.models import ImpersonationSession, PlatformAdmin
    from app.modules.auth.session_service import create_login_session, new_session_id

    monkeypatch.setattr(get_settings(), "user_session_tracking_enabled", True)
    monkeypatch.setattr(get_settings(), "login_rate_limit_per_minute", 100)

    db = db_session_integration
    tenant, admin, _staff, _password = await _seed(db)
    pa = PlatformAdmin(
        username=f"pa_{uuid.uuid4().hex[:8]}",
        email=f"pa_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=await hash_password("AdminPass123!"),
        role="support_agent",
        is_active=True,
    )
    db.add(pa)
    await db.flush()
    sid = new_session_id()
    sess = ImpersonationSession(
        admin_id=pa.id,
        tenant_id=tenant.id,
        user_id=admin.id,
        token_hash="pending",
        expires_at=datetime.utcnow() + timedelta(hours=1),
    )
    db.add(sess)
    await db.flush()
    await create_login_session(
        db,
        tenant_id=tenant.id,
        user_id=admin.id,
        session_id=sid,
        session_version=None,
        ip_address="1.2.3.4",
        user_agent="Mozilla/5.0 Chrome/120.0 Windows NT 10.0",
        supersede_others=False,
    )
    await db.commit()

    token = create_access_token(
        subject=admin.id,
        tenant_id=tenant.id,
        session_id=sid,
        session_version=int(admin.auth_session_version or 0),
        impersonator_admin_id=pa.id,
        impersonation_session_id=sess.id,
    )

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            res = await ac.post(
                "/api/v1/settings/my-sessions/sign-out-others",
                headers={"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)},
            )
            assert res.status_code == 403, res.text
            assert "support" in res.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_expire_stale_sessions_and_skip_when_disabled(db_session_integration, monkeypatch):
    from datetime import datetime, timedelta

    from app.config import get_settings
    from app.modules.auth.session_service import create_login_session, expire_stale_sessions_for_tenant, new_session_id
    from app.workers.user_activity_worker import expire_sessions_all_tenants

    settings = get_settings()
    monkeypatch.setattr(settings, "user_session_tracking_enabled", False)
    db = db_session_integration
    tenant, admin, _staff, _password = await _seed(db)

    skipped = await expire_sessions_all_tenants(db)
    assert skipped.get("skipped") is True

    monkeypatch.setattr(settings, "user_session_tracking_enabled", True)
    sid = new_session_id()
    row, _alert = await create_login_session(
        db,
        tenant_id=tenant.id,
        user_id=admin.id,
        session_id=sid,
        session_version=1,
        ip_address="1.2.3.4",
        user_agent="Mozilla/5.0 Chrome/120.0 Windows NT 10.0",
        supersede_others=False,
    )
    assert row is not None
    # Make the session look idle.
    row.last_seen_at = datetime.utcnow() - timedelta(days=3)
    await db.flush()

    closed = await expire_stale_sessions_for_tenant(
        db,
        tenant_id=tenant.id,
        idle_before=datetime.utcnow() - timedelta(days=1),
    )
    assert closed == 1
    await db.flush()
    expired = (
        await db.execute(
            select(UserLoginSession).where(
                UserLoginSession.tenant_id == tenant.id,
                UserLoginSession.session_id == sid,
            )
        )
    ).scalar_one()
    assert expired.logout_at is not None
    assert expired.ended_reason == "expired"
