"""HTTP tests for POST /webhooks/lemonsqueezy (signature gate)."""

from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import get_settings
from app.main import app


@pytest.fixture
def ls_webhook_secret(monkeypatch: pytest.MonkeyPatch) -> str:
    secret = "test_webhook_signing_secret_01"
    monkeypatch.setenv("LEMONSQUEEZY_WEBHOOK_SECRET", secret)
    get_settings.cache_clear()
    yield secret
    get_settings.cache_clear()


@pytest.mark.asyncio
async def test_webhook_rejects_invalid_signature(ls_webhook_secret: str):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post(
            "/webhooks/lemonsqueezy",
            content=b'{"meta":{"event_name":"order_created"}}',
            headers={"X-Signature": "not_a_valid_hmac_hex_digest_match"},
        )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_webhook_rejects_when_secret_not_configured(monkeypatch: pytest.MonkeyPatch):
    # Empty string overrides any value from backend/.env when Settings reloads.
    monkeypatch.setenv("LEMONSQUEEZY_WEBHOOK_SECRET", "")
    get_settings.cache_clear()
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/webhooks/lemonsqueezy", content=b"{}")
        assert resp.status_code == 500
    finally:
        get_settings.cache_clear()


@pytest.mark.asyncio
async def test_webhook_accepts_valid_signature_no_db_processing_errors(ls_webhook_secret: str, monkeypatch: pytest.MonkeyPatch):
    """Valid HMAC + ignored event returns 200 without requiring DB when get_db works."""
    from unittest.mock import AsyncMock, MagicMock

    from app.database import get_db

    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock()
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db
    try:
        payload = {"meta": {"event_name": "subscription_payment_success"}, "data": {}}
        raw = json.dumps(payload).encode("utf-8")
        sig = hmac.new(ls_webhook_secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/webhooks/lemonsqueezy",
                content=raw,
                headers={"X-Signature": sig, "Content-Type": "application/json"},
            )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)


def test_parse_ls_datetime_returns_naive_utc():
    from datetime import datetime, timedelta, timezone

    from app.modules.billing_lemonsqueezy.service import _parse_ls_datetime

    assert _parse_ls_datetime("2026-03-01T10:00:00Z") == datetime(2026, 3, 1, 10, 0, 0)
    assert _parse_ls_datetime("2026-03-01T16:00:00+06:00") == datetime(2026, 3, 1, 10, 0, 0)
    aware = datetime(2026, 3, 1, 10, 0, tzinfo=timezone(timedelta(hours=-5)))
    assert _parse_ls_datetime(aware) == datetime(2026, 3, 1, 15, 0, 0)
    for value in ("2026-03-01T10:00:00Z", aware):
        assert _parse_ls_datetime(value).tzinfo is None
    assert _parse_ls_datetime(datetime(2026, 3, 1, 10, 0)) == datetime(2026, 3, 1, 10, 0)
    assert _parse_ls_datetime("not a date") is None
    assert _parse_ls_datetime(None) is None


@pytest.mark.asyncio
async def test_webhook_sets_naive_processed_at(ls_webhook_secret: str):
    """processed_at maps to TIMESTAMP WITHOUT TIME ZONE; an aware value makes asyncpg fail."""
    from unittest.mock import AsyncMock, MagicMock

    from app.database import get_db
    from app.models import LemonsqueezyWebhookEvent

    added: list = []
    mock_session = MagicMock()
    mock_result = MagicMock()
    mock_result.scalar_one_or_none.return_value = None
    mock_session.execute = AsyncMock(return_value=mock_result)
    mock_session.add = MagicMock(side_effect=added.append)
    mock_session.flush = AsyncMock()
    mock_session.commit = AsyncMock()

    async def override_db():
        yield mock_session

    app.dependency_overrides[get_db] = override_db
    try:
        payload = {"meta": {"event_name": "subscription_payment_success"}, "data": {"id": "naive-ts"}}
        raw = json.dumps(payload).encode("utf-8")
        sig = hmac.new(ls_webhook_secret.encode("utf-8"), raw, hashlib.sha256).hexdigest()
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/webhooks/lemonsqueezy",
                content=raw,
                headers={"X-Signature": sig, "Content-Type": "application/json"},
            )
        assert resp.status_code == 200
    finally:
        app.dependency_overrides.pop(get_db, None)

    rows = [r for r in added if isinstance(r, LemonsqueezyWebhookEvent)]
    assert len(rows) == 1
    assert rows[0].processed_at is not None
    assert rows[0].processed_at.tzinfo is None
