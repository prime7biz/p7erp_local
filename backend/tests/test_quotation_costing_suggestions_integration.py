"""DB-backed tests for quotation costing line suggestions (Phase 2).

Run: docker compose exec backend pytest tests/test_quotation_costing_suggestions_integration.py -v
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import Customer, Quotation, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.costing import QuotationMaterial
from app.models.tenant import TenantType
from app.models.user import Role


@pytest.fixture(autouse=True)
def _enable_phase2(monkeypatch):
    monkeypatch.setenv("QUOTATION_AI_COSTING_PHASE2_ENABLED", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def _seed_negative_material(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"CSug {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"cs{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"cs{slug}",
        email=f"cs{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"Z{slug}"[:10],
        name="Buyer",
    )
    db.add(customer)
    await db.flush()
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"CS{slug}"[:14],
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
            total_amount="-1.00",
            amount_per_dozen="0",
            currency="USD",
        )
    )
    await db.flush()
    return tenant, user, q


@pytest.mark.asyncio
async def test_costing_suggestions_generate_creates_audit(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed_negative_material(db)

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
                "/api/v1/quotations/ai/costing-suggestions",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body["quotation_id"] == q.id
            assert body["id"] >= 1
            assert isinstance(body["items"], list)

        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "QUOTATION_COSTING_SUGGESTIONS_GENERATE",
            )
        )
        rows = ar.scalars().all()
        assert len(rows) >= 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_costing_suggestions_apply_fixes_negative_line(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed_negative_material(db)

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
                "/api/v1/quotations/ai/costing-suggestions",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            batch = r.json()
            items = [i for i in batch["items"] if i.get("suggestion_type") == "modify_line"]
            assert items, "expected modify_line for negative material"
            item_id = items[0]["id"]

            r2 = await ac.post(
                "/api/v1/quotations/ai/costing-suggestions/apply",
                json={
                    "quotation_id": q.id,
                    "batch_id": batch["id"],
                    "items": [{"item_id": item_id, "decision": "apply"}],
                },
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r2.status_code == 200, r2.text
            out = r2.json()
            assert item_id in out["applied_item_ids"]

        mat = (
            await db.execute(select(QuotationMaterial).where(QuotationMaterial.quotation_id == q.id))
        ).scalars().first()
        assert mat is not None
        assert mat.total_amount == "0"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_costing_suggestions_locked_blocked(db_session_integration):
    db = db_session_integration
    tenant, user, q = await _seed_negative_material(db)
    q.status = "APPROVED"
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
                "/api/v1/quotations/ai/costing-suggestions",
                json={"quotation_id": q.id},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            batch = r.json()
            items = [i for i in batch["items"] if i.get("suggestion_type") == "modify_line"]
            assert items
            item_id = items[0]["id"]

            r2 = await ac.post(
                "/api/v1/quotations/ai/costing-suggestions/apply",
                json={
                    "quotation_id": q.id,
                    "batch_id": batch["id"],
                    "items": [{"item_id": item_id, "decision": "apply"}],
                },
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r2.status_code == 200, r2.text
            out = r2.json()
            assert out["requires_revision"] is True
            assert out["applied_item_ids"] == []

        mat = (
            await db.execute(select(QuotationMaterial).where(QuotationMaterial.quotation_id == q.id))
        ).scalars().first()
        assert mat is not None
        assert mat.total_amount == "-1.00"
    finally:
        app.dependency_overrides.clear()
