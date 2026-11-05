"""Dashboard /ai-insights reuses the cached AI summary instead of calling the LLM on every load.

Run:
docker compose exec backend pytest tests/test_dashboard_ai_summary_cache.py -q
"""

from __future__ import annotations

import uuid

import pytest

from app.models import Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role
from app.modules.dashboard import ai_summary_cache
from app.modules.dashboard.router import ai_insights

_SUMMARY = "- Follow up the open orders today and onboard more buyers this week."


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(name=f"Dash {slug}", tenant_type=TenantType.both, is_active=True, company_code=f"ds{slug}"[:18])
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"ds{slug}",
        email=f"ds{slug}@example.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user


@pytest.mark.asyncio
async def test_ai_summary_cached_per_tenant_and_refresh_bypasses(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user = await _seed(db)

    calls: list[int] = []

    async def _fake_llm(_db, tenant_id, _user_id, _kind, _prompt):
        calls.append(tenant_id)
        return _SUMMARY

    monkeypatch.setattr("app.modules.dashboard.router.generate_text_for_tenant", _fake_llm)
    # Use the in-process cache so the test does not depend on Redis.
    monkeypatch.setattr(ai_summary_cache, "get_redis", lambda: None)
    monkeypatch.setattr(ai_summary_cache, "_local", {})

    first = await ai_insights(refresh=False, tenant=tenant, user=user, db=db)
    second = await ai_insights(refresh=False, tenant=tenant, user=user, db=db)
    assert len(calls) == 1

    def _summary(rows):
        return next(r for r in rows if r["id"] == "gemini-daily-summary")

    assert _summary(first)["message"] == _SUMMARY
    assert _summary(second)["message"] == _SUMMARY
    assert _summary(second)["cached_at"] == _summary(first)["cached_at"]

    await ai_insights(refresh=True, tenant=tenant, user=user, db=db)
    assert len(calls) == 2


@pytest.mark.asyncio
async def test_ai_summary_ttl_zero_disables_cache(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user = await _seed(db)

    calls: list[int] = []

    async def _fake_llm(_db, tenant_id, _user_id, _kind, _prompt):
        calls.append(tenant_id)
        return _SUMMARY

    class _Settings:
        dashboard_ai_summary_ttl_seconds = 0

    monkeypatch.setattr("app.modules.dashboard.router.generate_text_for_tenant", _fake_llm)
    monkeypatch.setattr("app.modules.dashboard.router.get_settings", lambda: _Settings())
    monkeypatch.setattr(ai_summary_cache, "get_redis", lambda: None)
    monkeypatch.setattr(ai_summary_cache, "_local", {})

    await ai_insights(refresh=False, tenant=tenant, user=user, db=db)
    await ai_insights(refresh=False, tenant=tenant, user=user, db=db)
    assert len(calls) == 2
