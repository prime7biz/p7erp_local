"""HTTP tests for /api/v1/ai-tool/weekly-reports*.

Run with: docker compose exec backend pytest tests/test_ai_weekly_reports_http.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta  # timedelta used for week_end
import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import AiWeeklyReport, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role


@pytest.fixture(autouse=True)
def _cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def _seed_tenant_user(db) -> tuple[Tenant, User]:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"WT{slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"cw{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"wu{slug}",
        email=f"wu{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user


@pytest.mark.asyncio
async def test_weekly_reports_list_and_status_happy_path(db_session_integration) -> None:
    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)

    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/v1/ai-tool/weekly-reports", headers={"X-Tenant-Id": str(tenant.id)})
            assert r.status_code == 200
            j = r.json()
            assert j.get("items") == []

            r2 = await ac.get("/api/v1/ai-tool/weekly-reports/status", headers={"X-Tenant-Id": str(tenant.id)})
            assert r2.status_code == 200
            st = r2.json()
            assert "gemini_configured" in st
            assert "current_week_start" in st
            assert st.get("has_current_week_report") is False
    finally:
        for k in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(k, None)


@pytest.mark.asyncio
async def test_weekly_report_get_404(db_session_integration) -> None:
    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_tenant] = lambda: tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/v1/ai-tool/weekly-reports/99999999", headers={"X-Tenant-Id": str(tenant.id)})
            assert r.status_code == 404
    finally:
        for k in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(k, None)


@pytest.mark.asyncio
async def test_weekly_report_insert_then_get_list_has_delta(
    db_session_integration, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Seed one report row, second older row — list should return delta on newer."""
    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)
    # Two distinct ISO weeks
    w1 = date(2020, 1, 6)  # Mon
    w1_end = w1 + timedelta(days=6)
    w0 = w1 - timedelta(days=7)
    w0_end = w0 + timedelta(days=6)
    r_old = AiWeeklyReport(
        tenant_id=tenant.id,
        week_start=w0,
        week_end=w0_end,
        narrative="old",
        kpi_snapshot_json={"active_orders": 5, "as_of": w0.isoformat(), "week_label": "a"},
    )
    r_new = AiWeeklyReport(
        tenant_id=tenant.id,
        week_start=w1,
        week_end=w1_end,
        narrative="new week",
        kpi_snapshot_json={"active_orders": 10, "as_of": w1.isoformat(), "week_label": "b"},
    )
    db.add(r_old)
    db.add(r_new)
    await db.flush()
    new_id = r_new.id

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_tenant] = lambda: tenant
    # Allow AI read (admin)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/v1/ai-tool/weekly-reports?limit=5", headers={"X-Tenant-Id": str(tenant.id)})
            assert r.status_code == 200
            items = r.json()["items"]
            assert len(items) >= 1
            top = next((x for x in items if x["id"] == new_id), None)
            assert top is not None
            assert top.get("delta") is not None
            d = top["delta"].get("active_orders")
            assert d is not None
            assert d.get("change") == 5

            r1 = await ac.get(f"/api/v1/ai-tool/weekly-reports/{new_id}", headers={"X-Tenant-Id": str(tenant.id)})
            assert r1.status_code == 200
    finally:
        for k in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(k, None)


@pytest.mark.asyncio
async def test_weekly_report_generate_skipped_no_gemini(
    db_session_integration,
) -> None:
    db = db_session_integration
    tenant, user = await _seed_tenant_user(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[require_tenant] = lambda: tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/ai-tool/weekly-reports/generate",
                json={"force": False},
                headers={"X-Tenant-Id": str(tenant.id), "Content-Type": "application/json"},
            )
            assert r.status_code == 200
            assert r.json()["status"] == "skipped_no_gemini"
            assert r.json()["report"] is None
    finally:
        for k in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(k, None)
        get_settings.cache_clear()
