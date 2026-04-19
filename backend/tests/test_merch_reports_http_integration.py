"""Merchandising report/catalog and read-only KPI endpoints (Phase 9) — HTTP + tenant isolation."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Inquiry

from tests.merch_fixtures import create_customer, create_merch_tenant_with_user


def _setup_app_overrides(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


def _clear_app_overrides():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_merch_reports_catalog_ok(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    await db.commit()
    _setup_app_overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/merch/reports/catalog",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["tenant_id"] == tenant.id
            reports = body["reports"]
            assert isinstance(reports, list)
            assert len(reports) >= 5
            keys = {x["key"] for x in reports}
            assert "control_tower" in keys
            assert "pipeline" in keys
            assert "pipeline_analytics" in keys
    finally:
        _clear_app_overrides()


@pytest.mark.asyncio
async def test_merch_reports_catalog_wrong_header_tenant_403(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, _ = await create_merch_tenant_with_user(db)
    tenant_b, _, _ = await create_merch_tenant_with_user(db)
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return user_a

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/merch/reports/catalog",
                headers={"X-Tenant-Id": str(tenant_b.id)},
            )
            assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)


@pytest.mark.asyncio
async def test_pipeline_summary_tenant_scoped(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, _ = await create_merch_tenant_with_user(db)
    cust = await create_customer(db, tenant_a)
    slug = uuid.uuid4().hex[:8]
    db.add(
        Inquiry(
            tenant_id=tenant_a.id,
            customer_id=cust.id,
            inquiry_code=f"INQ-{slug}"[:16],
            status="DRAFT",
        )
    )
    tenant_b, user_b, _ = await create_merch_tenant_with_user(db)
    await db.commit()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        _setup_app_overrides(db, tenant_a, user_a)
        try:
            r_a = await ac.get(
                "/api/v1/merch/pipeline",
                headers={"X-Tenant-Id": str(tenant_a.id)},
            )
            assert r_a.status_code == 200, r_a.text
            assert r_a.json()["inquiries"] >= 1
        finally:
            _clear_app_overrides()

        _setup_app_overrides(db, tenant_b, user_b)
        try:
            r_b = await ac.get(
                "/api/v1/merch/pipeline",
                headers={"X-Tenant-Id": str(tenant_b.id)},
            )
            assert r_b.status_code == 200, r_b.text
            assert r_b.json()["inquiries"] == 0
        finally:
            _clear_app_overrides()


@pytest.mark.asyncio
async def test_pipeline_analytics_and_control_tower_ok(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    await db.commit()
    _setup_app_overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            pa = await ac.get(
                "/api/v1/merch/pipeline/analytics",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert pa.status_code == 200, pa.text
            body = pa.json()
            assert "by_month" in body
            assert "by_quarter" in body
            assert "summary" in body

            ct = await ac.get(
                "/api/v1/merch/control-tower/summary",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert ct.status_code == 200, ct.text
            s = ct.json()
            assert "generated_at" in s
            assert "sample_pending" in s
            assert "sample_overdue_target" in s
    finally:
        _clear_app_overrides()


@pytest.mark.asyncio
async def test_style_summary_report_and_wastage_list_ok(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    await db.commit()
    _setup_app_overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            sr = await ac.get(
                "/api/v1/merch/styles/summary-report",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert sr.status_code == 200, sr.text
            assert isinstance(sr.json(), list)

            w = await ac.get(
                "/api/v1/merch/reports/wastage",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert w.status_code == 200, w.text
            assert isinstance(w.json(), list)
    finally:
        _clear_app_overrides()


@pytest.mark.asyncio
async def test_consumption_reconciliation_dashboard_ok(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    await db.commit()
    _setup_app_overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/merch/consumption-reconciliation/dashboard",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert "orders" in body
            assert "total_count" in body
    finally:
        _clear_app_overrides()
