"""Login lockout helpers for staff and external principals."""

from __future__ import annotations

import ipaddress
import time
from collections import defaultdict
from datetime import timedelta
from threading import Lock

from fastapi import HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.db_datetime import utc_now_naive
from app.config import get_settings

# In-process fallback when Redis is unavailable (dev / single-worker).
# Bounded so a flood of distinct keys cannot grow memory without limit.
_LOGIN_BUCKETS_MAX_KEYS = 10_000
_login_buckets: dict[str, list[float]] = defaultdict(list)
_login_buckets_lock = Lock()


def _is_public_ip(value: str) -> bool:
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return not (ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_unspecified)


def _client_ip(request: Request | None) -> str:
    """Best-effort real client IP behind host Nginx -> frontend Nginx -> backend.

    Clients can prepend arbitrary X-Forwarded-For entries, but each trusted proxy
    appends on the right. Walking from the right and taking the first public
    address skips our own (private/docker) hops and ignores spoofed left entries.
    """
    if request is None:
        return "unknown"
    peer = request.client.host if request.client and request.client.host else ""
    hops = [h.strip() for h in (request.headers.get("x-forwarded-for") or "").split(",") if h.strip()]
    real_ip = (request.headers.get("x-real-ip") or "").strip()
    chain = hops + ([real_ip] if real_ip else []) + ([peer] if peer else [])
    for candidate in reversed(chain):
        if _is_public_ip(candidate):
            return candidate
    return peer or real_ip or "unknown"


def lockout_minutes(value: object, default: int = 30) -> int:
    """Configured lockout window; an explicit 0 means "locked until an admin clears it"."""
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _prune_buckets(now: float, window: float) -> None:
    stale = [k for k, stamps in _login_buckets.items() if not stamps or now - stamps[-1] >= window]
    for k in stale:
        _login_buckets.pop(k, None)
    if len(_login_buckets) >= _LOGIN_BUCKETS_MAX_KEYS:
        oldest = sorted(_login_buckets, key=lambda k: _login_buckets[k][-1])
        for k in oldest[: len(_login_buckets) - _LOGIN_BUCKETS_MAX_KEYS + 1]:
            _login_buckets.pop(k, None)


def _too_many() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
        detail="Too many login attempts. Try again shortly.",
    )


async def enforce_login_rate_limit(
    request: Request | None,
    *,
    company_key: str,
    scope: str = "staff",
) -> None:
    """Limit login attempts by IP + company code (or tenant id string). Fails open if Redis errors."""
    settings = get_settings()
    limit = int(getattr(settings, "login_rate_limit_per_minute", 20) or 0)
    if limit <= 0:
        return
    ip = _client_ip(request)
    key = f"login_rl:{scope}:{ip}:{company_key.strip().lower() or 'none'}"
    now = time.time()
    window = 60

    try:
        from app.common.redis_client import get_redis

        r = get_redis()
        if r is not None:
            async with r.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, window, nx=True)
                n, _ = await pipe.execute()
            if int(n) > limit:
                raise _too_many()
            return
    except HTTPException:
        raise
    except Exception:
        pass

    with _login_buckets_lock:
        if key not in _login_buckets and len(_login_buckets) >= _LOGIN_BUCKETS_MAX_KEYS:
            _prune_buckets(now, window)
        stamps = [t for t in _login_buckets[key] if now - t < window]
        stamps.append(now)
        _login_buckets[key] = stamps
        if len(stamps) > limit:
            raise _too_many()


def lockout_still_active(locked_at, *, minutes: int) -> bool:
    """Return True if lock is still in effect. minutes<=0 means permanent until cleared."""
    if locked_at is None:
        return False
    if minutes <= 0:
        return True
    return utc_now_naive() < (locked_at + timedelta(minutes=minutes))


async def record_staff_failed_login(db: AsyncSession, user) -> None:
    settings = get_settings()
    user.failed_login_count = int(user.failed_login_count or 0) + 1
    max_attempts = int(getattr(settings, "staff_login_max_attempts", 8) or 8)
    if user.failed_login_count >= max_attempts:
        user.locked_at = utc_now_naive()
    await db.flush()


async def clear_staff_failed_login(db: AsyncSession, user) -> None:
    user.failed_login_count = 0
    user.locked_at = None
    await db.flush()


def staff_lock_active(user) -> bool:
    """True while a timed lock is in force; clears an expired lock in place."""
    if user.locked_at is None:
        return False
    minutes = lockout_minutes(getattr(get_settings(), "staff_login_lockout_minutes", 30))
    if lockout_still_active(user.locked_at, minutes=minutes):
        return True
    user.locked_at = None
    user.failed_login_count = 0
    return False


# --- Platform super-admin login (no lockout columns on platform_admins; counters live in Redis or memory) ---

_admin_failures: dict[str, tuple[int, float]] = {}
_admin_failures_lock = Lock()


def _platform_admin_failure_key(username: str) -> str:
    return f"admin_login_fail:{(username or '').strip().lower() or 'none'}"


def _platform_admin_lock_settings() -> tuple[int, int]:
    settings = get_settings()
    max_attempts = int(getattr(settings, "platform_admin_login_max_attempts", 5) or 5)
    minutes = lockout_minutes(getattr(settings, "platform_admin_login_lockout_minutes", 15), default=15)
    return max(1, max_attempts), max(1, minutes) * 60


def _memory_admin_failures(key: str, now: float) -> int:
    count, expires_at = _admin_failures.get(key, (0, 0.0))
    if now >= expires_at:
        _admin_failures.pop(key, None)
        return 0
    return count


async def platform_admin_login_locked(username: str) -> bool:
    """True when this username has too many recent failures (same answer for unknown usernames)."""
    max_attempts, _window = _platform_admin_lock_settings()
    key = _platform_admin_failure_key(username)
    try:
        from app.common.redis_client import get_redis

        r = get_redis()
        if r is not None:
            raw = await r.get(key)
            return int(raw or 0) >= max_attempts
    except Exception:
        pass
    with _admin_failures_lock:
        return _memory_admin_failures(key, time.time()) >= max_attempts


async def record_platform_admin_failed_login(username: str) -> None:
    _max_attempts, window = _platform_admin_lock_settings()
    key = _platform_admin_failure_key(username)
    try:
        from app.common.redis_client import get_redis

        r = get_redis()
        if r is not None:
            async with r.pipeline(transaction=True) as pipe:
                pipe.incr(key)
                pipe.expire(key, window, nx=True)
                await pipe.execute()
            return
    except Exception:
        pass
    now = time.time()
    with _admin_failures_lock:
        if key not in _admin_failures and len(_admin_failures) >= _LOGIN_BUCKETS_MAX_KEYS:
            for k in [k for k, (_c, exp) in _admin_failures.items() if now >= exp]:
                _admin_failures.pop(k, None)
            if len(_admin_failures) >= _LOGIN_BUCKETS_MAX_KEYS:
                _admin_failures.pop(min(_admin_failures, key=lambda k: _admin_failures[k][1]), None)
        count = _memory_admin_failures(key, now)
        expires_at = _admin_failures.get(key, (0, now + window))[1]
        _admin_failures[key] = (count + 1, expires_at)


async def clear_platform_admin_failed_login(username: str) -> None:
    key = _platform_admin_failure_key(username)
    try:
        from app.common.redis_client import get_redis

        r = get_redis()
        if r is not None:
            await r.delete(key)
    except Exception:
        pass
    with _admin_failures_lock:
        _admin_failures.pop(key, None)


def assert_staff_not_locked(user) -> None:
    if staff_lock_active(user):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account temporarily locked due to failed login attempts",
        )
