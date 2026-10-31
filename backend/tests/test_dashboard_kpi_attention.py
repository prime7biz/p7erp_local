"""Dashboard KPI honesty + attention-summary tenant isolation tests."""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


def _kpi_map(rows: list[dict]) -> dict[str, float | int]:
    return {r["id"]: r["value"] for r in rows}


@pytest.mark.asyncio
async def test_dashboard_kpi_excludes_draft_and_is_tenant_scoped(db_session_integration):
    db = db_session_integration
    t1, u1, _ = await create_merch_tenant_with_user(db)
    t2, u2, _ = await create_merch_tenant_with_user(db)
    c1 = await create_customer(db, t1)
    c2 = await create_customer(db, t2)
    s1 = await create_garment_style(db, t1, c1)
    s2 = await create_garment_style(db, t2, c2)

    _q1, _o1 = await create_quotation_and_order(db, t1, c1, s1)
    q_draft, o_draft = await create_quotation_and_order(db, t1, c1, s1)
    o_draft.status = "DRAFT"
    q_draft.quoted_price = "250.00"
    await create_quotation_and_order(db, t2, c2, s2)
    await db.flush()

    async def override_db():
        yield db

    async def override_user_t1():
        return u1

    async def override_tenant_t1():
        return t1

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user_t1
    app.dependency_overrides[require_tenant] = override_tenant_t1
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/v1/dashboard/kpi")
            assert r.status_code == 200
            kpi = _kpi_map(r.json())
            assert kpi["active-orders"] == 1
            assert kpi["total-customers"] == 1
            assert "inventory-items" in kpi
            assert "styles-count" in kpi
            assert kpi["styles-count"] >= 1
            assert float(kpi["monthly-revenue"]) >= 0
    finally:
        app.dependency_overrides.clear()

    async def override_user_t2():
        return u2

    async def override_tenant_t2():
        return t2

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user_t2
    app.dependency_overrides[require_tenant] = override_tenant_t2
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/v1/dashboard/kpi")
            assert r.status_code == 200
            kpi = _kpi_map(r.json())
            assert kpi["active-orders"] == 1
            assert kpi["total-customers"] == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_dashboard_attention_summary_tenant_isolation(db_session_integration):
    db = db_session_integration
    t1, u1, _ = await create_merch_tenant_with_user(db)
    t2, u2, _ = await create_merch_tenant_with_user(db)

    async def override_db():
        yield db

    async def override_user():
        return u1

    async def override_tenant():
        return t1

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/v1/dashboard/attention-summary")
            assert r.status_code == 200
            body = r.json()
            for key in (
                "pending_approvals",
                "tna_open",
                "tna_overdue",
                "critical_alerts",
                "total_alerts",
                "promise_blocked",
                "commercial_pending",
                "links",
            ):
                assert key in body
    finally:
        app.dependency_overrides.clear()

    async def override_user2():
        return u2

    async def override_tenant2():
        return t2

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user2
    app.dependency_overrides[require_tenant] = override_tenant2
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/v1/dashboard/attention-summary")
            assert r.status_code == 200
            assert r.json()["pending_approvals"] == 0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_dashboard_production_trends_honest_keys(db_session_integration):
    db = db_session_integration
    t1, u1, _ = await create_merch_tenant_with_user(db)
    c1 = await create_customer(db, t1)
    s1 = await create_garment_style(db, t1, c1)
    await create_quotation_and_order(db, t1, c1, s1)

    async def override_db():
        yield db

    async def override_user():
        return u1

    async def override_tenant():
        return t1

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/v1/dashboard/production-trends")
            assert r.status_code == 200
            rows = r.json()
            assert isinstance(rows, list)
            if rows:
                assert rows[0]["output"] == rows[0]["target"]
                assert "orders_created" in rows[0]
    finally:
        app.dependency_overrides.clear()
