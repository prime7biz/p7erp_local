"""Cached live currency rates from open.er-api.com (free, no API key).

One fetch returns every rate for a base currency, so the whole table is cached per base for
FX_RATE_CACHE_SECONDS (Redis when REDIS_URL is set, otherwise a small in-process dictionary).
Failures are never cached and never raise: callers get None and use their own fallback.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

from app.common.redis_client import get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)

FX_API_URL = "https://open.er-api.com/v6/latest/{base}"
FX_HTTP_TIMEOUT_SECONDS = 3.0

_LOCAL_MAX_ENTRIES = 500
_local: dict[str, tuple[float, dict[str, Any]]] = {}


def _cache_key(base: str) -> str:
    return f"fx:live-rates:{base}"


def _cache_seconds() -> int:
    return max(0, int(get_settings().fx_rate_cache_seconds or 0))


async def _fetch_rates_payload(base: str) -> dict[str, Any]:
    """Raw JSON from the rates API (raises on network / HTTP errors)."""
    import httpx

    async with httpx.AsyncClient(timeout=FX_HTTP_TIMEOUT_SECONDS) as client:
        response = await client.get(FX_API_URL.format(base=base))
        response.raise_for_status()
        payload = response.json()
    return payload if isinstance(payload, dict) else {}


async def _cache_get(key: str) -> dict[str, Any] | None:
    client = get_redis()
    if client is not None:
        try:
            raw = await client.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:
            logger.warning("fx rate cache read failed: %s", exc)
    hit = _local.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    return None


async def _cache_set(key: str, value: dict[str, Any], ttl: int) -> None:
    client = get_redis()
    if client is not None:
        try:
            await client.set(key, json.dumps(value), ex=ttl)
            return
        except Exception as exc:
            logger.warning("fx rate cache write failed: %s", exc)
    now = time.monotonic()
    if len(_local) >= _LOCAL_MAX_ENTRIES:
        _local.clear()
    _local[key] = (now + ttl, value)


async def get_live_rates(base: str) -> dict[str, Any] | None:
    """Return {"rates": {...}, "base": "USD", "fetched_at": "..."} or None when the API is unavailable."""
    base = (base or "").strip().upper()
    if not base:
        return None
    ttl = _cache_seconds()
    key = _cache_key(base)
    if ttl > 0:
        cached = await _cache_get(key)
        if cached is not None:
            return cached
    try:
        payload = await _fetch_rates_payload(base)
    except Exception as exc:
        logger.warning("live FX fetch failed for %s: %s", base, exc)
        return None
    rates = payload.get("rates")
    if payload.get("result") != "success" or not isinstance(rates, dict) or not rates:
        logger.warning("live FX fetch for %s returned no rates (result=%s)", base, payload.get("result"))
        return None
    data = {
        "rates": rates,
        "base": payload.get("base_code", base),
        "fetched_at": payload.get("time_last_update_utc", ""),
    }
    if ttl > 0:
        await _cache_set(key, data, ttl)
    return data


async def get_live_rate(base: str, quote: str) -> float | None:
    """One rate base -> quote (e.g. USD -> BDT), or None when unknown / unavailable."""
    data = await get_live_rates(base)
    if not data:
        return None
    try:
        rate = float(data["rates"].get((quote or "").strip().upper()))
    except (TypeError, ValueError):
        return None
    return rate if rate > 0 else None
