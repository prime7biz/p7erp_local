from __future__ import annotations

import asyncio
import re
from collections import defaultdict, deque
from datetime import datetime, timezone
from time import monotonic
from typing import Awaitable, TypeVar

from fastapi import HTTPException, Request, status

from app.common.redis_client import get_redis
from app.config import get_settings

T = TypeVar("T")

_rate_lock = asyncio.Lock()
_rate_buckets: dict[tuple[str, str], deque[float]] = defaultdict(deque)
_breaker_lock = asyncio.Lock()
_breaker_state: dict[str, dict[str, float | int]] = {}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _route_limit(category: str) -> int:
    settings = get_settings()
    if category == "heavy":
        return max(1, settings.ai_rate_limit_heavy_per_window)
    if category == "chat":
        return max(1, settings.ai_rate_limit_chat_per_window)
    return max(1, settings.ai_rate_limit_read_per_window)


async def enforce_route_rate_limit(*, key: str, category: str) -> None:
    settings = get_settings()
    window = max(1, settings.ai_rate_limit_window_seconds)
    limit = _route_limit(category)
    now = monotonic()
    cutoff = now - window
    async with _rate_lock:
        bucket = _rate_buckets[(category, key)]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded for AI {category} operations. Please retry shortly.",
            )
        bucket.append(now)


def rate_limit_dependency(category: str):
    async def _dep(request: Request) -> None:
        tenant_id = request.headers.get("X-Tenant-Id", "unknown")
        user_key = request.headers.get("Authorization", request.client.host if request.client else "unknown")
        key = f"{tenant_id}:{user_key}"
        await enforce_route_rate_limit(key=key, category=category)

    return _dep


_daily_quota_lock = asyncio.Lock()
_daily_quota_memory: dict[str, int] = {}


def _utc_day_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


async def enforce_ai_daily_tenant_quota(*, tenant_id: int) -> None:
    """Raise 429 when tenant exceeds daily AI request budget (chat message + escalation approval)."""
    settings = get_settings()
    limit = max(0, int(getattr(settings, "ai_max_requests_per_tenant_per_day", 0) or 0))
    if limit <= 0:
        return
    day = _utc_day_str()
    redis_key = f"ai:quota:day:{tenant_id}:{day}"
    r = get_redis()
    if r is not None:
        try:
            n = await r.incr(redis_key)
            if n == 1:
                await r.expire(redis_key, 86400 * 3)
            if n > limit:
                await r.decr(redis_key)
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail=(
                        f"Daily AI request limit ({limit} per tenant, UTC day) exceeded. "
                        f"Try again after UTC midnight or ask an admin to raise the cap."
                    ),
                )
            return
        except HTTPException:
            raise
        except Exception:
            pass

    mem_key = f"{tenant_id}:{day}"
    async with _daily_quota_lock:
        n = _daily_quota_memory.get(mem_key, 0) + 1
        if n > limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Daily AI request limit ({limit} per tenant, UTC day) exceeded. "
                    f"Try again after UTC midnight or ask an admin to raise the cap."
                ),
            )
        _daily_quota_memory[mem_key] = n


async def call_with_timeout(timeout_seconds: int, awaitable: Awaitable[T], *, error_message: str) -> T:
    try:
        async with asyncio.timeout(max(1, timeout_seconds)):
            return await awaitable
    except TimeoutError as exc:
        raise HTTPException(status_code=status.HTTP_504_GATEWAY_TIMEOUT, detail=error_message) from exc


async def should_block_circuit(tool_key: str) -> bool:
    async with _breaker_lock:
        state = _breaker_state.get(tool_key)
        if not state:
            return False
        opened_until = float(state.get("opened_until", 0.0))
        if opened_until <= monotonic():
            _breaker_state.pop(tool_key, None)
            return False
        return True


async def record_circuit_success(tool_key: str) -> None:
    async with _breaker_lock:
        _breaker_state.pop(tool_key, None)


async def record_circuit_failure(tool_key: str) -> None:
    settings = get_settings()
    threshold = max(1, settings.ai_circuit_breaker_failure_threshold)
    cooldown_seconds = max(5, settings.ai_circuit_breaker_cooldown_seconds)
    now = monotonic()
    async with _breaker_lock:
        state = _breaker_state.setdefault(tool_key, {"failures": 0, "opened_until": 0.0})
        failures = int(state.get("failures", 0)) + 1
        state["failures"] = failures
        if failures >= threshold:
            state["opened_until"] = now + cooldown_seconds


_MAX_PROMPT_LEN = 4000

_INJECTION_PATTERNS = [
    re.compile(r"ignore\s+(previous|above|all)\s+(instructions?|rules?|context)", re.IGNORECASE),
    re.compile(r"system\s*prompt", re.IGNORECASE),
    re.compile(r"you\s+are\s+now", re.IGNORECASE),
    re.compile(r"pretend\s+(to\s+be|you\s+are)", re.IGNORECASE),
    re.compile(r"reveal\s+(your|the)\s+(instructions?|prompt|system)", re.IGNORECASE),
    re.compile(r"(?:drop|delete|truncate|alter)\s+table", re.IGNORECASE),
    re.compile(r";\s*(?:select|insert|update|delete|drop)\b", re.IGNORECASE),
    re.compile(r"<script[^>]*>", re.IGNORECASE),
    re.compile(r"\{\{.*\}\}", re.IGNORECASE),
]


def screen_prompt(prompt: str) -> tuple[bool, str | None]:
    """
    Basic prompt-injection and abuse screening.

    Returns (is_safe, rejection_reason).
    """
    text = (prompt or "").strip()
    if not text:
        return False, "Prompt is empty."
    if len(text) > _MAX_PROMPT_LEN:
        return False, f"Prompt exceeds maximum length ({_MAX_PROMPT_LEN} characters)."
    for pat in _INJECTION_PATTERNS:
        if pat.search(text):
            return False, "Prompt matched a safety pattern and was blocked."
    return True, None


def build_policy_metadata(*, decision: str, reason_code: str | None = None, error_category: str | None = None) -> dict[str, str]:
    payload = {"decision": decision}
    if reason_code:
        payload["reason_code"] = reason_code
    if error_category:
        payload["error_category"] = error_category
    payload["event_time"] = _utc_now().isoformat()
    return payload
