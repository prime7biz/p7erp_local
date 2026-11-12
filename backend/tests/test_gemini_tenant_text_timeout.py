"""The Gemini fallback in generate_text_for_tenant is bounded by AI_TIMEOUT_HEAVY_SECONDS.

Run in Docker:
    docker compose exec -T backend pytest tests/test_gemini_tenant_text_timeout.py -q
"""

from __future__ import annotations

import logging
import time
from types import SimpleNamespace

import pytest

from app.common import gemini_client

SECRET_PROMPT = "PROMPT-WITH-PRIVATE-NUMBERS-123"


class _FakeDb:
    def __init__(self) -> None:
        self.flushed = 0

    async def flush(self) -> None:
        self.flushed += 1


def _settings(timeout) -> SimpleNamespace:
    return SimpleNamespace(
        openrouter_tenant_text_enabled=False,
        gemini_enabled=True,
        gemini_api_key="test-key",
        gemini_model="gemini-2.5-flash",
        ai_timeout_heavy_seconds=timeout,
    )


@pytest.fixture
def usage_calls(monkeypatch):
    calls: list[dict] = []

    async def _allow(_db, _tenant_id):
        return True

    async def _record(_db, **kw):
        calls.append(kw)

    monkeypatch.setattr(gemini_client, "allow_gemini_for_tenant", _allow)
    monkeypatch.setattr(gemini_client, "record_gemini_usage", _record)
    return calls


@pytest.mark.asyncio
async def test_slow_gemini_call_times_out_with_no_text(monkeypatch, usage_calls, caplog):
    monkeypatch.setattr(gemini_client, "get_settings", lambda: _settings(0.2))

    def _slow(prompt, *, model_override=None):
        time.sleep(1.5)
        return "late answer", "gemini-2.5-flash", 1, 1, 2

    monkeypatch.setattr(gemini_client, "_raw_generate_text_sync", _slow)
    db = _FakeDb()
    caplog.set_level(logging.WARNING, logger=gemini_client.logger.name)
    started = time.monotonic()
    result = await gemini_client.generate_text_for_tenant(db, 7, 3, "finance_commentary", SECRET_PROMPT)
    assert result is None
    assert time.monotonic() - started < 1.2
    assert usage_calls == [] and db.flushed == 0
    record = next(r for r in caplog.records if r.getMessage() == "gemini_tenant_text_timeout")
    assert record.tenant_id == 7 and record.feature == "finance_commentary" and record.timeout_seconds == 0.2
    assert SECRET_PROMPT not in caplog.text


@pytest.mark.asyncio
async def test_fast_gemini_call_still_returns_text_and_records_usage(monkeypatch, usage_calls):
    monkeypatch.setattr(gemini_client, "get_settings", lambda: _settings(5))
    monkeypatch.setattr(
        gemini_client,
        "_raw_generate_text_sync",
        lambda prompt, *, model_override=None: ("fine answer", "gemini-2.5-flash", 1, 2, 3),
    )
    db = _FakeDb()
    assert await gemini_client.generate_text_for_tenant(db, 7, 3, "f", "hello") == "fine answer"
    assert len(usage_calls) == 1 and usage_calls[0]["total_tokens"] == 3 and db.flushed == 1


@pytest.mark.parametrize("raw,expected", [(10, 10.0), (0, 35.0), (-3, 35.0), ("bad", 35.0), (None, 35.0)])
def test_timeout_setting_falls_back_to_safe_default(raw, expected):
    assert gemini_client._gemini_fallback_timeout_seconds(SimpleNamespace(ai_timeout_heavy_seconds=raw)) == expected
