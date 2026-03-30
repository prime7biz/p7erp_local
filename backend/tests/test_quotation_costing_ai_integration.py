"""DB-backed tests for read-only quotation costing intelligence (Phase 1).

Run: docker compose exec backend pytest tests/test_quotation_costing_ai_integration.py -v
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.config import get_settings
from app.models import Customer, Quotation, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.costing import QuotationManufacturing, QuotationMaterial, QuotationOtherCost
from app.models.tenant import TenantType
from app.models.user import Role


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"CostIntel {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ci{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"ci{slug}",
        email=f"ci{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"K{slug}"[:10],
        name="Buyer",
    )
    db.add(customer)
    await db.flush()
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"CI{slug}"[:14],
        currency="USD",
        target_price_currency="USD",
        exchange_rate="1",
        material_cost="100.00",
        manufacturing_cost="50.00",
        total_cost="150.0000",
        quoted_price="200.00",
        projected_quantity=1000,
        style_ref="ST-1",
        status="DRAFT",
    )
    db.add(q)
    await db.flush()
    db.add(
        QuotationMaterial(
            tenant_id=tenant.id,
            quotation_id=q.id,
            serial_no=1,
            category_id=None,
            description="Fabric",
            total_amount="100.00",
            amount_per_dozen="0",
            currency="USD",
        )
    )
    await db.flush()
    return tenant, user, q


async def _quotation_protected_snapshot(db, *, quotation_id: int, tenant_id: int):
    q = await db.get(Quotation, quotation_id)
    assert q is not None
    mats = (
        await db.execute(
            select(QuotationMaterial).where(
                QuotationMaterial.quotation_id == quotation_id,
                QuotationMaterial.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    mfg = (
        await db.execute(
            select(QuotationManufacturing).where(
                QuotationManufacturing.quotation_id == quotation_id,
                QuotationManufacturing.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    oth = (
        await db.execute(
            select(QuotationOtherCost).where(
                QuotationOtherCost.quotation_id == quotation_id,
                QuotationOtherCost.tenant_id == tenant_id,
            )
        )
    ).scalars().all()
    return {
        "material_cost": q.material_cost,
        "manufacturing_cost": q.manufacturing_cost,
        "other_cost": q.other_cost,
        "total_cost": q.total_cost,
        "cost_per_piece": q.cost_per_piece,
        "profit_percentage": q.profit_percentage,
        "quoted_price": q.quoted_price,
        "total_amount": q.total_amount,
        "currency": q.currency,
        "exchange_rate": q.exchange_rate,
        "target_price": q.target_price,
        "target_price_currency": q.target_price_currency,
        "status": q.status,
        "version_no": q.version_no,
        "material_rows": len(mats),
        "manufacturing_rows": len(mfg),
        "other_cost_rows": len(oth),
    }


@pytest.mark.asyncio
async def test_cost_completeness_creates_audit_row(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed(db)

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
                "/api/v1/quotations/ai/cost-completeness-check",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["quotation_id"] == q.id
            assert "cost_completeness_score" in body
            assert body["line_counts"]["materials"] == 1
            assert body.get("signal_scope") == "full_costing"
            assert body.get("source_mode") == "deterministic_only"
            assert isinstance(body.get("reason_codes"), list)

            r2 = await ac.post(
                "/api/v1/quotations/ai/cost-completeness-check",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r2.status_code == 200

        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "QUOTATION_COSTING_COMPLETENESS_CHECK",
            )
        )
        rows = ar.scalars().all()
        assert len(rows) >= 1
        assert rows[0].prompt_category == "quotation_costing_ai"
        dj = rows[0].details_json or {}
        assert dj.get("action_type") == "cost_completeness_check"
        assert dj.get("result_status") == "success"
        assert dj.get("source_mode") == "deterministic_only"
        assert isinstance(dj.get("reason_codes"), list)
        assert isinstance(dj.get("indicator_snapshot"), dict)
        assert dj.get("request_fingerprint_sha256")
        assert "correlation_id" in dj
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_costing_intel_does_not_mutate_quotation(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed(db)

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
            endpoints = [
                "/api/v1/quotations/ai/cost-completeness-check",
                "/api/v1/quotations/ai/costing-anomaly-scan",
                "/api/v1/quotations/ai/margin-risk-explanation",
                "/api/v1/quotations/ai/fx-sensitivity-summary",
                "/api/v1/quotations/ai/costing-summary",
                "/api/v1/quotations/ai/costing-next-actions",
            ]
            for path in endpoints:
                before = await _quotation_protected_snapshot(db, quotation_id=q.id, tenant_id=tenant.id)
                r = await ac.post(
                    path,
                    json={"quotation_id": q.id},
                    headers={"X-Tenant-Id": str(tenant.id)},
                )
                assert r.status_code == 200, (path, r.text)
                await db.refresh(q)
                after = await _quotation_protected_snapshot(db, quotation_id=q.id, tenant_id=tenant.id)
                assert after == before, path
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_costing_phase1_globally_disabled_returns_403(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, q = await _seed(db)
    monkeypatch.setenv("QUOTATION_AI_COSTING_PHASE1_ENABLED", "false")
    get_settings.cache_clear()

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
                "/api/v1/quotations/ai/costing-summary",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
        detail = r.json().get("detail")
        assert isinstance(detail, dict)
        assert detail.get("code") == "QUOTATION_COSTING_PHASE1_DISABLED"
    finally:
        app.dependency_overrides.clear()
        monkeypatch.delenv("QUOTATION_AI_COSTING_PHASE1_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_costing_phase1_tenant_feature_flag_disabled_returns_403(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, q = await _seed(db)
    monkeypatch.setenv("QUOTATION_AI_COSTING_PHASE1_ENABLED", "true")
    get_settings.cache_clear()
    tenant.feature_flags = {"quotation_ai_costing_phase1_enabled": False}
    await db.flush()

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
                "/api/v1/quotations/ai/cost-completeness-check",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_costing_intel_rbac_denied(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed(db)
    role_row = await db.get(Role, user.role_id)
    assert role_row is not None
    # `analyst` can use AI globally but is not in quotation AI allow-all names; deny costing only.
    role_row.name = "analyst"
    role_row.display_name = "Analyst"
    role_row.permissions = {"quotations.ai.costing_intelligence": False}
    await db.flush()

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
                "/api/v1/quotations/ai/costing-anomaly-scan",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_costing_audit_log_filter_quotation(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed(db)

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
            await ac.post(
                "/api/v1/quotations/ai/fx-sensitivity-summary",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            lr = await ac.get(
                "/api/v1/quotations/ai/costing-audit-log",
                params={"quotation_id": q.id, "limit": 20},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert lr.status_code == 200
        items = lr.json().get("items") or []
        assert any("FX" in (x.get("event_label") or "") or "fx" in (x.get("action") or "").lower() for x in items)
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_costing_intel_wrong_quotation_404(db_session_integration):
    db = db_session_integration
    tenant, user, _q = await _seed(db)

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
                "/api/v1/quotations/ai/costing-summary",
                json={"quotation_id": 999_999_999},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
