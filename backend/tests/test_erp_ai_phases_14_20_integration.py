"""DB-backed tests for ERP AI Phases 14–20 (flags, audit, RBAC, tenant isolation).

Run: docker compose exec backend pytest tests/test_erp_ai_phases_14_20_integration.py -v
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.config import get_settings
from app.database import get_db
from app.main import app
from app.models import AiAutomationRule, AiControlledActionProposal, Tenant, User
from app.models.ai_tool import AiAuditLog
from app.models.tenant import TenantType
from app.models.user import Role


@pytest.fixture(autouse=True)
def _clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


async def _seed_admin_user(db, *, name_slug: str, feature_flags: dict | None = None):
    tenant = Tenant(
        name=f"T{name_slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"c{name_slug}"[:18],
        feature_flags=feature_flags,
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"u{name_slug}",
        email=f"u{name_slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user


async def _seed_viewer_user(db, *, tenant: Tenant):
    role = Role(tenant_id=tenant.id, name="viewer", display_name="Viewer", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"v{uuid.uuid4().hex[:8]}",
        email=f"v{uuid.uuid4().hex[:8]}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_executive_brief_disabled_returns_403(db_session_integration, monkeypatch):
    monkeypatch.delenv("EXECUTIVE_AI_DASHBOARD_ENABLED", raising=False)
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(db, name_slug=slug)

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
            r = await ac.get(
                "/api/v1/dashboard/ai/executive-brief",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_executive_brief_happy_path_creates_audit(db_session_integration, monkeypatch):
    monkeypatch.setenv("EXECUTIVE_AI_DASHBOARD_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"executive_ai_dashboard_enabled": True}
    )

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
            r = await ac.get(
                "/api/v1/dashboard/ai/executive-brief",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "snapshot" in body
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "EXECUTIVE_AI_BRIEF",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("EXECUTIVE_AI_DASHBOARD_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_document_validate_order_not_found(db_session_integration, monkeypatch):
    monkeypatch.setenv("DOCUMENT_AI_VALIDATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"document_ai_validation_enabled": True}
    )

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
                "/api/v1/erp-ai/document/validate",
                json={"entity_type": "order", "entity_id": 999999999, "extracted_fields": {"order_code": "x"}},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200
        assert r.json().get("ok") is False
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "DOCUMENT_AI_VALIDATE",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_governance_proposal_creates_row(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_CONTROLLED_AUTOMATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"ai_controlled_automation_enabled": True}
    )

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
                "/api/v1/erp-ai/governance/proposals",
                json={"rule_code": "demo_rule", "payload_json": {"k": 1}, "idempotency_key": f"idem-{slug}"},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        res = r.json()
        pid = res.get("id")
        assert res.get("rule_evaluation") is not None
        row = await db.get(AiControlledActionProposal, pid)
        assert row is not None
        assert row.tenant_id == tenant.id
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "AI_CONTROLLED_ACTION_PROPOSED",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_CONTROLLED_AUTOMATION_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_governance_rule_evaluator_match(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_CONTROLLED_AUTOMATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"ai_controlled_automation_enabled": True}
    )
    db.add(
        AiAutomationRule(
            tenant_id=tenant.id,
            rule_code="demo_rule",
            action_key="phase20_eval",
            label="Phase 20 demo",
            is_enabled=True,
            requires_confirmation=True,
            permission_key=None,
            policy_json=None,
            description="test",
            condition_json={"path": "k", "op": "eq", "value": 1},
        )
    )
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
                "/api/v1/erp-ai/governance/proposals",
                json={"rule_code": "demo_rule", "payload_json": {"k": 1}, "idempotency_key": f"re-{slug}"},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        ev = r.json().get("rule_evaluation") or {}
        assert ev.get("rule_defined") is True
        assert (ev.get("evaluation") or {}).get("matched") is True
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_CONTROLLED_AUTOMATION_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_phase19_copilot_unknown_intent(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_COPILOT_READONLY_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    tenant, user = await _seed_admin_user(
        db, name_slug=uuid.uuid4().hex[:10], feature_flags={"ai_copilot_readonly_enabled": True}
    )

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
                "/api/v1/erp-ai/copilot/safe-query",
                json={"intent": "not_a_real_intent_xyz"},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200
        assert r.json().get("ok") is False
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_COPILOT_READONLY_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_governance_viewer_cannot_approve(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_CONTROLLED_AUTOMATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, admin_user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"ai_controlled_automation_enabled": True}
    )
    viewer = await _seed_viewer_user(db, tenant=tenant)

    async def override_db():
        yield db

    async def override_user():
        return viewer

    async def override_tenant():
        return tenant

    prop = AiControlledActionProposal(
        tenant_id=tenant.id,
        created_by_user_id=admin_user.id,
        rule_code="r1",
        payload_json={},
        status="proposed",
    )
    db.add(prop)
    await db.flush()
    pid = prop.id

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/erp-ai/governance/proposals/{pid}/approve",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_CONTROLLED_AUTOMATION_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_governance_admin_can_approve(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_CONTROLLED_AUTOMATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, admin_user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"ai_controlled_automation_enabled": True}
    )

    prop = AiControlledActionProposal(
        tenant_id=tenant.id,
        created_by_user_id=admin_user.id,
        rule_code="r2",
        payload_json={},
        status="proposed",
    )
    db.add(prop)
    await db.flush()
    pid = prop.id

    async def override_db():
        yield db

    async def override_user():
        return admin_user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/erp-ai/governance/proposals/{pid}/approve",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "approved"
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "AI_CONTROLLED_ACTION_APPROVED",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_CONTROLLED_AUTOMATION_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_governance_admin_reject_sets_rejection_columns_not_approval(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_CONTROLLED_AUTOMATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, admin_user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"ai_controlled_automation_enabled": True}
    )

    prop = AiControlledActionProposal(
        tenant_id=tenant.id,
        created_by_user_id=admin_user.id,
        rule_code="r_reject",
        payload_json={},
        status="proposed",
    )
    db.add(prop)
    await db.flush()
    pid = prop.id

    async def override_db():
        yield db

    async def override_user():
        return admin_user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/erp-ai/governance/proposals/{pid}/reject",
                json={"reason": "not now"},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "rejected"
        row = await db.get(AiControlledActionProposal, pid)
        assert row is not None
        assert row.approved_by_user_id is None
        assert row.approved_at is None
        assert row.rejected_by_user_id == admin_user.id
        assert row.rejected_at is not None
        assert row.rejected_reason == "not now"
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_CONTROLLED_AUTOMATION_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_governance_other_tenant_cannot_see_proposal(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_CONTROLLED_AUTOMATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    t1, u1 = await _seed_admin_user(
        db, name_slug=uuid.uuid4().hex[:8], feature_flags={"ai_controlled_automation_enabled": True}
    )
    t2, u2 = await _seed_admin_user(
        db, name_slug=uuid.uuid4().hex[:8], feature_flags={"ai_controlled_automation_enabled": True}
    )
    prop = AiControlledActionProposal(
        tenant_id=t1.id,
        created_by_user_id=u1.id,
        rule_code="iso",
        payload_json={},
        status="proposed",
    )
    db.add(prop)
    await db.flush()
    pid = prop.id

    async def override_db():
        yield db

    async def override_user():
        return u2

    async def override_tenant():
        return t2

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/erp-ai/governance/proposals/{pid}/approve",
                headers={"X-Tenant-Id": str(t2.id)},
            )
        assert r.status_code == 404
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_CONTROLLED_AUTOMATION_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_phase14_planning_advisory_happy_audit(db_session_integration, monkeypatch):
    monkeypatch.setenv("PRODUCTION_PLANNING_AI_ENHANCED_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"production_planning_ai_enhanced_enabled": True}
    )
    fd = date.today()
    td = fd + timedelta(days=14)

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
                "/api/v1/production/planning/advisory/capacity-sequencing",
                json={"from_date": fd.isoformat(), "to_date": td.isoformat()},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        assert "lines" in r.json()
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "PRODUCTION_PLANNING_ADVISORY",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("PRODUCTION_PLANNING_AI_ENHANCED_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_phase14_planning_disabled_403(db_session_integration, monkeypatch):
    monkeypatch.delenv("PRODUCTION_PLANNING_AI_ENHANCED_ENABLED", raising=False)
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(db, name_slug=slug)
    fd = date.today()

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
                "/api/v1/production/planning/advisory/capacity-sequencing",
                json={"from_date": fd.isoformat(), "to_date": (fd + timedelta(days=7)).isoformat()},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_phase15_followup_insights_audit(db_session_integration, monkeypatch):
    monkeypatch.setenv("TNA_FOLLOWUP_AI_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"tna_followup_ai_enabled": True}
    )

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
            r = await ac.get(
                "/api/v1/tna-unified/ai/followup-insights",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        body = r.json()
        assert "delay_risk_score" in body
        assert "delay_prediction" in body
        assert "follow_up_suggestions" in body
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "TNA_FOLLOWUP_AI_INSIGHTS",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("TNA_FOLLOWUP_AI_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_phase15_disabled_403(db_session_integration, monkeypatch):
    monkeypatch.delenv("TNA_FOLLOWUP_AI_ENABLED", raising=False)
    get_settings.cache_clear()
    db = db_session_integration
    tenant, user = await _seed_admin_user(db, name_slug=uuid.uuid4().hex[:10])

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
            r = await ac.get(
                "/api/v1/tna-unified/ai/followup-insights",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_phase17_finance_readonly_audit(db_session_integration, monkeypatch):
    monkeypatch.setenv("FINANCE_AI_READONLY_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"finance_ai_readonly_enabled": True}
    )

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
            r = await ac.get(
                "/api/v1/finance/ai/readonly-insights",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert "posted_voucher_series" in data
        assert "margin_trend_proxy" in data
        assert "cash_flow_proxy" in data
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "FINANCE_AI_READONLY_INSIGHTS",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("FINANCE_AI_READONLY_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_phase17_disabled_403(db_session_integration, monkeypatch):
    monkeypatch.delenv("FINANCE_AI_READONLY_ENABLED", raising=False)
    get_settings.cache_clear()
    db = db_session_integration
    tenant, user = await _seed_admin_user(db, name_slug=uuid.uuid4().hex[:10])

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
            r = await ac.get(
                "/api/v1/finance/ai/readonly-insights",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_phase19_copilot_safe_query_audit(db_session_integration, monkeypatch):
    monkeypatch.setenv("AI_COPILOT_READONLY_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"ai_copilot_readonly_enabled": True}
    )

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
                "/api/v1/erp-ai/copilot/safe-query",
                json={"intent": "orders_open_count"},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        ar = await db.execute(
            select(AiAuditLog).where(
                AiAuditLog.tenant_id == tenant.id,
                AiAuditLog.action == "AI_COPILOT_SAFE_QUERY",
            )
        )
        assert len(ar.scalars().all()) >= 1
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_COPILOT_READONLY_ENABLED", raising=False)
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_phase19_copilot_disabled_403(db_session_integration, monkeypatch):
    monkeypatch.delenv("AI_COPILOT_READONLY_ENABLED", raising=False)
    get_settings.cache_clear()
    db = db_session_integration
    tenant, user = await _seed_admin_user(db, name_slug=uuid.uuid4().hex[:10])

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
                "/api/v1/erp-ai/copilot/safe-query",
                json={"intent": "orders_open_count"},
                headers={"X-Tenant-Id": str(tenant.id)},
            )
        assert r.status_code == 403
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_governance_list_proposals_read(db_session_integration, monkeypatch):
    """GET /governance/proposals is readable by any user when the phase is enabled (not admin-only)."""
    monkeypatch.setenv("AI_CONTROLLED_AUTOMATION_ENABLED", "true")
    get_settings.cache_clear()
    db = db_session_integration
    slug = uuid.uuid4().hex[:10]
    tenant, admin_user = await _seed_admin_user(
        db, name_slug=slug, feature_flags={"ai_controlled_automation_enabled": True}
    )
    viewer = await _seed_viewer_user(db, tenant=tenant)
    db.add(
        AiControlledActionProposal(
            tenant_id=tenant.id,
            created_by_user_id=admin_user.id,
            rule_code="demo_rule",
            status="proposed",
            payload_json={"k": 1},
        )
    )
    await db.commit()

    async def override_db():
        yield db

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[require_tenant] = override_tenant

    async def override_user_viewer():
        return viewer

    app.dependency_overrides[get_current_user] = override_user_viewer
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/erp-ai/governance/proposals?status_filter=proposed",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert r.status_code == 200, r.text
            rows = r.json()
            assert isinstance(rows, list) and len(rows) >= 1
            assert all(x["tenant_id"] == tenant.id for x in rows)
            assert all(x["status"] == "proposed" for x in rows)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
        monkeypatch.delenv("AI_CONTROLLED_AUTOMATION_ENABLED", raising=False)
        get_settings.cache_clear()
