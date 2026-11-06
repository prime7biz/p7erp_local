"""Live FX rate cache: one HTTP fetch per base currency per TTL, manual rates never hit the network.

The real HTTP call (`fx_rate_cache._fetch_rates_payload`) is always monkeypatched; Redis is disabled so the
in-process cache is used.

Run: docker compose exec backend pytest tests/test_fx_rate_cache.py -q
"""

from __future__ import annotations

import time
import uuid
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.common import fx_rate_cache
from app.config import get_settings
from app.models import CurrencyExchangeRate
from app.models.finance import AccountGroup, ChartOfAccount, Voucher
from app.modules.finance.router import _lookup_exchange_rate
from tests.benchmark_fixtures import api_client, seed_tenant_admin

GOOD_PAYLOAD = {
    "result": "success",
    "base_code": "USD",
    "time_last_update_utc": "Fri, 06 Nov 2026 00:00:01 +0000",
    "rates": {"USD": 1, "BDT": 121.75, "EUR": 0.9},
}


@pytest.fixture
def fx(monkeypatch):
    """Fake rates API: records each fetch; `fx.payload` / `fx.error` control the answer."""

    class FakeApi:
        calls: list[str] = []
        payload: dict = GOOD_PAYLOAD
        error: Exception | None = None

    async def fake_fetch(base: str) -> dict:
        FakeApi.calls.append(base)
        if FakeApi.error is not None:
            raise FakeApi.error
        return FakeApi.payload

    FakeApi.calls = []
    monkeypatch.setattr(fx_rate_cache, "_fetch_rates_payload", fake_fetch)
    monkeypatch.setattr(fx_rate_cache, "get_redis", lambda: None)
    monkeypatch.setattr(get_settings(), "fx_rate_cache_seconds", 3600)
    fx_rate_cache._local.clear()
    yield FakeApi
    fx_rate_cache._local.clear()


@pytest.mark.asyncio
async def test_cache_hit_avoids_second_fetch(fx):
    assert await fx_rate_cache.get_live_rate("USD", "BDT") == 121.75
    assert await fx_rate_cache.get_live_rate("usd", "eur") == 0.9
    assert await fx_rate_cache.get_live_rate("USD", "XXX") is None
    assert fx.calls == ["USD"]
    rates = await fx_rate_cache.get_live_rates("USD")
    assert rates["fetched_at"] == GOOD_PAYLOAD["time_last_update_utc"]
    assert fx.calls == ["USD"]


@pytest.mark.asyncio
async def test_ttl_expiry_and_zero_disables_cache(fx, monkeypatch):
    await fx_rate_cache.get_live_rate("USD", "BDT")
    key = fx_rate_cache._cache_key("USD")
    _expires, value = fx_rate_cache._local[key]
    fx_rate_cache._local[key] = (time.monotonic() - 1, value)
    await fx_rate_cache.get_live_rate("USD", "BDT")
    assert fx.calls == ["USD", "USD"]
    await fx_rate_cache.get_live_rate("USD", "BDT")
    assert fx.calls == ["USD", "USD"]

    monkeypatch.setattr(get_settings(), "fx_rate_cache_seconds", 0)
    fx_rate_cache._local.clear()
    await fx_rate_cache.get_live_rate("USD", "BDT")
    await fx_rate_cache.get_live_rate("USD", "BDT")
    assert fx.calls == ["USD", "USD", "USD", "USD"]
    assert fx_rate_cache._local == {}


@pytest.mark.asyncio
async def test_failures_return_none_and_are_not_cached(fx):
    fx.error = TimeoutError("slow")
    assert await fx_rate_cache.get_live_rate("USD", "BDT") is None
    assert await fx_rate_cache.get_live_rates("USD") is None
    assert fx.calls == ["USD", "USD"]

    fx.error = None
    fx.payload = {"result": "error", "error-type": "unsupported-code"}
    assert await fx_rate_cache.get_live_rate("USD", "BDT") is None
    fx.payload = GOOD_PAYLOAD
    assert await fx_rate_cache.get_live_rate("USD", "BDT") == 121.75
    assert len(fx.calls) == 4


@pytest.mark.asyncio
async def test_finance_lookup_uses_table_before_network(db_session_integration, fx):
    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)
    rate, source, _at = await _lookup_exchange_rate(db, tenant.id, "BDT", "bdt")
    assert (rate, source) == (1.0, "same-currency")
    db.add(CurrencyExchangeRate(tenant_id=tenant.id, from_currency="EUR", to_currency="BDT", exchange_rate=Decimal("130.5"),
                                effective_date=date(2026, 1, 1), source="manual", is_active=True))
    await db.flush()
    rate, source, _at = await _lookup_exchange_rate(db, tenant.id, "EUR", "BDT")
    assert (rate, source) == (130.5, "manual-rate-table")
    assert fx.calls == []

    rate, source, _at = await _lookup_exchange_rate(db, tenant.id, "USD", "BDT")
    assert (rate, source) == (121.75, "open.er-api.com")
    await _lookup_exchange_rate(db, tenant.id, "USD", "BDT")
    assert fx.calls == ["USD"]

    fx_rate_cache._local.clear()
    fx.error = ConnectionError("offline")
    with pytest.raises(HTTPException) as exc:
        await _lookup_exchange_rate(db, tenant.id, "USD", "BDT")
    assert exc.value.status_code == 400
    assert "No exchange rate available for USD to BDT" in exc.value.detail


async def _accounts(db, tenant_id: int):
    slug = uuid.uuid4().hex[:6]
    grp = AccountGroup(tenant_id=tenant_id, name="Expenses", code=f"FX-E{slug}", nature="Expense")
    cash_grp = AccountGroup(tenant_id=tenant_id, name="Cash", code=f"FX-C{slug}", nature="Asset")
    db.add_all([grp, cash_grp])
    await db.flush()
    rent = ChartOfAccount(tenant_id=tenant_id, account_number=f"FX-5{slug}", name="Rent", group_id=grp.id,
                          normal_balance="debit")
    cash = ChartOfAccount(tenant_id=tenant_id, account_number=f"FX-1{slug}", name="Cash", group_id=cash_grp.id,
                          normal_balance="debit")
    db.add_all([rent, cash])
    await db.flush()
    return rent, cash


def _voucher_body(rent_id: int, cash_id: int, **extra):
    return {
        "voucher_type": "JOURNAL",
        "voucher_date": date.today().isoformat(),
        "description": "Imported service",
        "currency": "USD",
        "base_currency": "BDT",
        "lines": [
            {"account_id": rent_id, "entry_type": "DEBIT", "amount": "100"},
            {"account_id": cash_id, "entry_type": "CREDIT", "amount": "100"},
        ],
        **extra,
    }


@pytest.mark.asyncio
async def test_voucher_create_manual_rate_never_fetches(db_session_integration, fx):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    rent, cash = await _accounts(db, tenant.id)
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r = await ac.post("/api/v1/finance/vouchers", json=_voucher_body(rent.id, cash.id, exchange_rate="110.5"))
        assert r.status_code == 200, r.text
        manual_id = r.json()["id"]
        assert fx.calls == []

        r = await ac.post("/api/v1/finance/vouchers", json=_voucher_body(rent.id, cash.id))
        assert r.status_code == 200, r.text
        live_id = r.json()["id"]
        r = await ac.post("/api/v1/finance/vouchers", json=_voucher_body(rent.id, cash.id))
        assert r.status_code == 200, r.text
        assert fx.calls == ["USD"]

    rows = {
        v.id: (v.exchange_rate, v.exchange_rate_source)
        for v in (await db.execute(select(Voucher).where(Voucher.id.in_([manual_id, live_id])))).scalars()
    }
    assert rows[manual_id] == (Decimal("110.500000"), "manual")
    assert rows[live_id] == (Decimal("121.750000"), "open.er-api.com")


@pytest.mark.asyncio
async def test_currency_live_rates_endpoint_cached_and_fallback(db_session_integration, fx):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.get("/api/v1/currency/live-rates", params={"base": "usd"})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["live"] is True and body["source"] == "open.er-api.com"
        assert body["rates"]["BDT"] == 121.75 and body["base"] == "USD"
        await ac.get("/api/v1/currency/live-rates", params={"base": "USD"})
        assert fx.calls == ["USD"]

        fx.error = ConnectionError("offline")
        r = await ac.get("/api/v1/currency/live-rates", params={"base": "EUR"})
        body = r.json()
        assert body["live"] is False and body["source"] == "fallback" and body["base"] == "USD"
        assert body["rates"]["USD"] == 1.0 and "BDT" in body["rates"]
