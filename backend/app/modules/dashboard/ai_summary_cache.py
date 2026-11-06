"""Short-lived cache for the dashboard "AI summary" card.

Without it every dashboard load calls the LLM. Entries are keyed by tenant plus a hash of the
KPI snapshot sent to the model, so a change in the numbers produces a fresh summary.
Uses Redis when REDIS_URL is configured, otherwise a small in-process dictionary.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from typing import Any

from app.common.redis_client import get_redis

logger = logging.getLogger(__name__)

_LOCAL_MAX_ENTRIES = 1000
_local: dict[str, tuple[float, dict[str, Any]]] = {}


def ai_summary_cache_key(tenant_id: int, snapshot: dict[str, Any]) -> str:
    digest = hashlib.sha256(json.dumps(snapshot, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    return f"dashboard:ai-summary:{tenant_id}:{digest}"


async def get_cached_ai_summary(key: str) -> dict[str, Any] | None:
    client = get_redis()
    if client is not None:
        try:
            raw = await client.get(key)
            return json.loads(raw) if raw else None
        except Exception as exc:
            logger.warning("dashboard ai summary cache read failed: %s", exc)
    hit = _local.get(key)
    if hit and hit[0] > time.monotonic():
        return hit[1]
    return None


async def set_cached_ai_summary(key: str, value: dict[str, Any], ttl_seconds: int) -> None:
    ttl = max(1, int(ttl_seconds))
    client = get_redis()
    if client is not None:
        try:
            await client.set(key, json.dumps(value), ex=ttl)
            return
        except Exception as exc:
            logger.warning("dashboard ai summary cache write failed: %s", exc)
    now = time.monotonic()
    if len(_local) >= _LOCAL_MAX_ENTRIES:
        for k in [k for k, (expires, _) in _local.items() if expires <= now]:
            _local.pop(k, None)
        if len(_local) >= _LOCAL_MAX_ENTRIES:
            _local.clear()
    _local[key] = (now + ttl, value)
