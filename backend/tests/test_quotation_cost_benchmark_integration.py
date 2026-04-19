"""DB-backed tests for quotation cost benchmark (Phase 13).

Run: docker compose exec backend pytest tests/test_quotation_cost_benchmark_integration.py -v
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.money import parse_money
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import Customer, Quotation, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.quotations.quotation_cost_benchmark_service import _overall_from_metric_classes


def test_overall_from_metric_classes_all_insufficient_is_not_normal():
    assert _overall_from_metric_classes(
        ["insufficient_data", "insufficient_data", "insufficient_data"]
    ) == "insufficient_data"


def test_overall_from_metric_classes_mixed_normal_and_insufficient():
    assert _overall_from_metric_classes(["normal", "insufficient_data", "normal"]) == "normal"


@pytest.fixture(autouse=True)
def _enable_benchmark(monkeypatch):
    monkeypatch.setenv("QUOTATION_AI_COST_BENCHMARK_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def _seed_quote(db, *, status: str = "DRAFT"):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Bench {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"bn{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"bn{slug}",
        email=f"bn{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"B{slug}"[:10],
        name="Buyer",
    )
    db.add(customer)
    await db.flush()
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"BN{slug}"[:14],
        department="Mens",
        currency="USD",
        target_price_currency="USD",
        exchange_rate="1",
        material_cost="40.00",
        manufacturing_cost="30.00",
        other_cost="10.00",
        total_cost="80.00",
        quoted_price="100.00",
        projected_quantity=500,
        style_ref="ST-B",
        status=status,
    )
    db.add(q)
    await db.flush()
    return tenant, user, q


async def _add_peer(db, tenant, customer_id, code_suffix: str):
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer_id,
        quotation_code=f"P{code_suffix}"[:14],
        department="Mens",
        currency="USD",
        target_price_currency="USD",
        exchange_rate="1",
        material_cost="40.00",
        manufacturing_cost="30.00",
        other_cost="10.00",
        total_cost="80.00",
        quoted_price="100.00",
        projected_quantity=500,
        style_ref="ST-P",
        status="APPROVED",
    )
    db.add(q)
    await db.flush()
    return q


@pytest.mark.asyncio
async def test_cost_benchmark_creates_audit(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed_quote(db)
    for i in range(3):
        await _add_peer(db, tenant, q.customer_id, f"{i}{uuid.uuid4().hex[:6]}")

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
            r = await ac.post(
                "/api/v1/quotations/ai/cost-benchmark",
                json={"quotation_id": q.id, "months_back": 12},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["quotation_id"] == q.id
            assert isinstance(body["metrics"], list)
            assert "overall_confidence" in body
            assert 0.0 <= body["overall_confidence"] <= 1.0
            for m in body["metrics"]:
                assert "confidence" in m
                assert 0.0 <= m["confidence"] <= 1.0

        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "QUOTATION_COST_BENCHMARK",
            )
        )
        rows = ar.scalars().all()
        assert len(rows) >= 1
        dj = rows[-1].details_json or {}
        assert dj.get("overall_confidence") is not None
        assert 0.0 <= float(dj["overall_confidence"]) <= 1.0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cost_benchmark_insufficient_without_peers(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed_quote(db, status="APPROVED")

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
            r = await ac.post(
                "/api/v1/quotations/ai/cost-benchmark",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["insufficient_data"] is True
            assert body["similar_quotation_count"] < 3
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cost_benchmark_disabled_returns_403(db_session_integration, monkeypatch):
    monkeypatch.setenv("QUOTATION_AI_COST_BENCHMARK_ENABLED", "false")
    get_settings.cache_clear()
    db = db_session_integration
    tenant, user, q = await _seed_quote(db)

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
            r = await ac.post(
                "/api/v1/quotations/ai/cost-benchmark",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()
        monkeypatch.setenv("QUOTATION_AI_COST_BENCHMARK_ENABLED", "true")
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_cost_benchmark_other_tenant_quotation_returns_404(db_session_integration):
    """Tenant A cannot benchmark tenant B's quotation (service enforces quotation.tenant_id)."""
    db = db_session_integration
    tenant_a, user_a, _qa = await _seed_quote(db)
    tenant_b, _user_b, qb = await _seed_quote(db)

    async def override_db():
        yield db

    async def override_user():
        return user_a

    async def override_tenant():
        return tenant_a

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/quotations/ai/cost-benchmark",
                json={"quotation_id": qb.id, "months_back": 12},
                headers={"X-Tenant-Id": str(tenant_a.id)},
            )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cost_benchmark_does_not_mutate_quotation(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed_quote(db)
    for i in range(3):
        await _add_peer(db, tenant, q.customer_id, f"{i}{uuid.uuid4().hex[:6]}")
    before_tc = parse_money(q.total_cost)

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
            r = await ac.post(
                "/api/v1/quotations/ai/cost-benchmark",
                json={"quotation_id": q.id, "months_back": 12},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200
        await db.refresh(q)
        assert parse_money(q.total_cost) == before_tc
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_cost_benchmark_history_after_run(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed_quote(db)
    for i in range(3):
        await _add_peer(db, tenant, q.customer_id, f"{i}{uuid.uuid4().hex[:6]}")

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
            pr = await ac.post(
                "/api/v1/quotations/ai/cost-benchmark",
                json={"quotation_id": q.id, "months_back": 12},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert pr.status_code == 200
            hr = await ac.get(
                "/api/v1/quotations/ai/cost-benchmark-history",
                params={"quotation_id": q.id, "limit": 10},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert hr.status_code == 200, hr.text
        items = hr.json().get("items") or []
        assert len(items) >= 1
        assert items[0].get("quotation_id") == q.id
        if items[0].get("overall_confidence") is not None:
            assert 0.0 <= float(items[0]["overall_confidence"]) <= 1.0
    finally:
        app.dependency_overrides.clear()
