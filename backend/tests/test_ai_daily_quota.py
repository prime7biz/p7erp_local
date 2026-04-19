"""Per-tenant daily AI quota (UTC day)."""

from __future__ import annotations

import random

import pytest
from fastapi import HTTPException

from app.config import get_settings
from app.modules.ai_tool.guardrails import enforce_ai_daily_tenant_quota


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _unique_tenant_id() -> int:
    """Avoid collisions with Redis keys from other tests or runs."""
    return random.randint(10_000_000, 99_999_999)


@pytest.mark.asyncio
async def test_daily_quota_allows_under_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_MAX_REQUESTS_PER_TENANT_PER_DAY", "5")
    get_settings.cache_clear()
    tid = _unique_tenant_id()
    await enforce_ai_daily_tenant_quota(tenant_id=tid)
    await enforce_ai_daily_tenant_quota(tenant_id=tid)


@pytest.mark.asyncio
async def test_daily_quota_blocks_over_limit(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_MAX_REQUESTS_PER_TENANT_PER_DAY", "2")
    get_settings.cache_clear()
    tid = _unique_tenant_id()
    await enforce_ai_daily_tenant_quota(tenant_id=tid)
    await enforce_ai_daily_tenant_quota(tenant_id=tid)
    with pytest.raises(HTTPException) as excinfo:
        await enforce_ai_daily_tenant_quota(tenant_id=tid)
    assert excinfo.value.status_code == 429


@pytest.mark.asyncio
async def test_daily_quota_disabled_when_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_MAX_REQUESTS_PER_TENANT_PER_DAY", "0")
    get_settings.cache_clear()
    tid = _unique_tenant_id()
    for _ in range(5):
        await enforce_ai_daily_tenant_quota(tenant_id=tid)
