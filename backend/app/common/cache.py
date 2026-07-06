"""Redis-backed API response cache (optional; gated by API_CACHE_ENABLED)."""

from __future__ import annotations

import json
import logging
from typing import Any

from app.common.redis_client import get_redis
from app.config import get_settings

logger = logging.getLogger(__name__)


def tax_config_cache_key(tenant_id: int) -> str:
    return f"cache:tenant:{tenant_id}:compliance:tax-config"


async def cache_get_json(key: str) -> Any | None:
    settings = get_settings()
    if not settings.api_cache_enabled:
        return None
    client = get_redis()
    if not client:
        return None
    try:
        raw = await client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception:
        logger.exception("cache_get_json failed for %s", key)
        return None


async def cache_set_json(key: str, value: Any, ttl_seconds: int) -> None:
    settings = get_settings()
    if not settings.api_cache_enabled:
        return
    client = get_redis()
    if not client:
        return
    try:
        await client.set(key, json.dumps(value), ex=max(1, int(ttl_seconds)))
    except Exception:
        logger.exception("cache_set_json failed for %s", key)


async def cache_delete(key: str) -> None:
    settings = get_settings()
    if not settings.api_cache_enabled:
        return
    client = get_redis()
    if not client:
        return
    try:
        await client.delete(key)
    except Exception:
        logger.exception("cache_delete failed for %s", key)
