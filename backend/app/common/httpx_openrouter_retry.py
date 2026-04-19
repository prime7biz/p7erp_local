"""Shared POST retry for OpenAI-compatible providers that return 429/503 (OpenRouter free tier, bursts)."""

from __future__ import annotations

import asyncio
import logging
from typing import Any

import httpx

logger = logging.getLogger(__name__)


def _retry_after_seconds(response: httpx.Response, attempt: int) -> float:
    ra = (response.headers.get("retry-after") or "").strip()
    if ra.isdigit():
        return min(float(ra), 120.0)
    return min(2.0**attempt, 30.0)


async def get_with_429_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    headers: dict[str, str],
    max_attempts: int = 5,
    log_feature: str = "openrouter_get",
) -> httpx.Response:
    """GET with 429/503 backoff (e.g. OpenRouter /models connectivity probe)."""
    last: httpx.Response | None = None
    for attempt in range(max_attempts):
        resp = await client.get(url, headers=headers)
        last = resp
        if resp.status_code in (429, 503) and attempt < max_attempts - 1:
            wait_s = _retry_after_seconds(resp, attempt)
            logger.warning(
                "openrouter_compatible_rate_limit",
                extra={
                    "feature": log_feature,
                    "status_code": resp.status_code,
                    "attempt": attempt + 1,
                    "wait_s": wait_s,
                    "url_host": httpx.URL(url).host,
                    "method": "GET",
                },
            )
            await asyncio.sleep(wait_s)
            continue
        return resp
    assert last is not None
    return last


async def post_chat_completions_with_429_retry(
    client: httpx.AsyncClient,
    url: str,
    *,
    json: dict[str, Any],
    headers: dict[str, str],
    max_attempts: int = 5,
    log_feature: str = "openai_compatible_chat",
) -> httpx.Response:
    """POST chat/completions; on 429 or 503 back off and retry (OpenRouter free models are very throttle-prone)."""
    last: httpx.Response | None = None
    for attempt in range(max_attempts):
        resp = await client.post(url, json=json, headers=headers)
        last = resp
        if resp.status_code in (429, 503) and attempt < max_attempts - 1:
            wait_s = _retry_after_seconds(resp, attempt)
            logger.warning(
                "openrouter_compatible_rate_limit",
                extra={
                    "feature": log_feature,
                    "status_code": resp.status_code,
                    "attempt": attempt + 1,
                    "wait_s": wait_s,
                    "url_host": httpx.URL(url).host,
                },
            )
            await asyncio.sleep(wait_s)
            continue
        return resp
    assert last is not None
    return last
