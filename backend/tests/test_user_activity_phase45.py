"""Phase 4–5 User Activity: GeoIP labels, new-device alerts, platform audit user filter.

Run:
  docker compose exec backend pytest tests/test_user_activity_phase45.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import hash_password
from app.common.geoip_lookup import lookup_ip_location
from app.database import get_db
from app.main import app
from app.models import PlatformAdmin, Role, Tenant, User
from app.models.notification import UserNotification
from app.models.tenant import TenantType
from app.modules.audit.service import log_action
from app.modules.auth.session_service import create_login_session, new_session_id


async def _seed_tenant_user(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Phase45 {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"p5{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    pwd = await hash_password("Phase45Activity123!")
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"admin_{slug}@example.com",
        username=f"admin_{slug}",
        first_name="Pat",
        last_name="Admin",
        password_hash=pwd,
        is_active=True,
    )
    db.add(user)
    await db.commit()
    return tenant, user, "Phase45Activity123!"


def test_geoip_private_and_empty():
    assert lookup_ip_location(None) is None
    assert lookup_ip_location("") is None
    assert lookup_ip_location("127.0.0.1") == "Private network"
    assert lookup_ip_location("10.0.0.5") == "Private network"
    assert lookup_ip_location("192.168.1.10") == "Private network"
    # Public IP with no City DB configured → None (no crash).
    assert lookup_ip_location("1.2.3.4") is None


@pytest.mark.asyncio
async def test_first_login_not_alert_second_new_device_alerts(db_session_integration, monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "user_session_tracking_enabled", True)
    monkeypatch.setattr(settings, "user_session_new_device_alerts", True)

    db = db_session_integration
    tenant, user, _pwd = await _seed_tenant_user(db)

    row1, alert1 = await create_login_session(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=new_session_id(),
        session_version=1,
        ip_address="1.2.3.4",
        user_agent="Mozilla/5.0 Chrome/120.0 Windows NT 10.0",
        supersede_others=False,
    )
    assert row1 is not None
    assert alert1 is False
    await db.flush()

    notes = (
        await db.execute(
            select(UserNotification).where(
                UserNotification.tenant_id == tenant.id,
                UserNotification.user_id == user.id,
                UserNotification.kind == "security_new_login",
            )
        )
    ).scalars().all()
    assert notes == []

    row2, alert2 = await create_login_session(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=new_session_id(),
        session_version=2,
        ip_address="9.9.9.9",
        user_agent="Mozilla/5.0 Firefox/121.0 Macintosh",
        supersede_others=False,
    )
    assert row2 is not None
    assert alert2 is True
    await db.flush()

    notes2 = (
        await db.execute(
            select(UserNotification).where(
                UserNotification.tenant_id == tenant.id,
                UserNotification.user_id == user.id,
                UserNotification.kind == "security_new_login",
            )
        )
    ).scalars().all()
    assert len(notes2) == 1
    assert "9.9.9.9" in (notes2[0].body or "")


@pytest.mark.asyncio
async def test_known_ip_or_device_skips_alert(db_session_integration, monkeypatch):
    from app.config import get_settings

    settings = get_settings()
    monkeypatch.setattr(settings, "user_session_tracking_enabled", True)
    monkeypatch.setattr(settings, "user_session_new_device_alerts", True)

    db = db_session_integration
    tenant, user, _pwd = await _seed_tenant_user(db)

    await create_login_session(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=new_session_id(),
        session_version=1,
        ip_address="1.2.3.4",
        user_agent="Mozilla/5.0 Chrome/120.0 Windows NT 10.0",
        supersede_others=False,
    )
    await db.flush()

    # Same IP, different device label → still known IP → no alert.
    _row, alert = await create_login_session(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=new_session_id(),
        session_version=2,
        ip_address="1.2.3.4",
        user_agent="Mozilla/5.0 Firefox/121.0 Macintosh",
        supersede_others=False,
    )
    assert alert is False


@pytest.mark.asyncio
async def test_settings_activity_includes_private_location(db_session_integration, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "user_session_tracking_enabled", True)

    db = db_session_integration
    tenant, user, password = await _seed_tenant_user(db)

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
                    "email": user.email,
                    "password": password,
                    "login_as": "admin",
                },
                headers={"X-Forwarded-For": "10.1.2.3", "User-Agent": "Mozilla/5.0 Chrome/120.0 Windows NT 10.0"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant.id)}

            activity = await ac.get("/api/v1/settings/my-activity?limit=20", headers=headers)
            assert activity.status_code == 200, activity.text
            items = activity.json()["items"]
            login_rows = [r for r in items if r["action"] == "LOGIN"]
            assert login_rows
            assert login_rows[0].get("location") == "Private network"

            sessions = await ac.get("/api/v1/settings/my-sessions?limit=20", headers=headers)
            assert sessions.status_code == 200, sessions.text
            sess_items = sessions.json()["items"]
            assert sess_items
            assert sess_items[0].get("location") == "Private network"
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_platform_monitoring_audit_filters_user_id(db_session_integration, monkeypatch):
    from app.config import get_settings

    monkeypatch.setattr(get_settings(), "login_rate_limit_per_minute", 100)

    db = db_session_integration
    tenant, user, _pwd = await _seed_tenant_user(db)
    other = User(
        tenant_id=tenant.id,
        role_id=user.role_id,
        email=f"other_{uuid.uuid4().hex[:8]}@example.com",
        username=f"other_{uuid.uuid4().hex[:8]}",
        password_hash=user.password_hash,
        is_active=True,
    )
    db.add(other)
    await db.flush()

    await log_action(
        db,
        tenant_id=tenant.id,
        action="API_REQUEST",
        user_id=user.id,
        resource="GET /api/v1/orders",
        details="ok",
        ip_address="1.2.3.4",
    )
    await log_action(
        db,
        tenant_id=tenant.id,
        action="API_REQUEST",
        user_id=other.id,
        resource="GET /api/v1/customers",
        details="ok",
        ip_address="9.9.9.9",
    )
    await db.commit()

    admin = PlatformAdmin(
        username=f"pa_{uuid.uuid4().hex[:8]}",
        email=f"pa_{uuid.uuid4().hex[:8]}@example.com",
        password_hash=await hash_password("AdminPass123!"),
        role="super_admin",
        is_active=True,
    )
    db.add(admin)
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            login = await ac.post(
                "/api/v1/admin/auth/login",
                json={"username": admin.username, "password": "AdminPass123!"},
                headers={"X-Forwarded-For": "1.2.3.4"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            ah = {"Authorization": f"Bearer {token}"}

            filtered = await ac.get(
                f"/api/v1/admin/monitoring/audit?tenant_id={tenant.id}&user_id={user.id}&action=API_REQUEST",
                headers=ah,
            )
            assert filtered.status_code == 200, filtered.text
            body = filtered.json()
            assert body["total"] >= 1
            assert all(row["user_id"] == user.id for row in body["items"])
            assert all("API_REQUEST" in row["action"] for row in body["items"])
    finally:
        app.dependency_overrides.pop(get_db, None)
