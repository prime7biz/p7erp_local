"""Optional async Redis client (used when REDIS_URL is set)."""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Any

from app.config import get_settings

logger = logging.getLogger(__name__)

_client: Any = None


def get_redis():
    """Return redis.asyncio.Redis or None if REDIS_URL not configured."""
    global _client
    if _client is not None:
        return _client
    s = get_settings()
    url = (s.redis_url or "").strip()
    if not url:
        return None
    try:
        import redis.asyncio as redis  # type: ignore[import-untyped]

        _client = redis.from_url(
            url,
            decode_responses=True,
            socket_connect_timeout=2.5,
            socket_timeout=5.0,
            retry_on_timeout=True,
        )
        return _client
    except Exception:
        logger.exception("Redis init failed")
        return None


async def close_redis() -> None:
    global _client
    if _client is not None:
        try:
            await _client.close()
        except Exception:
            pass
        _client = None
