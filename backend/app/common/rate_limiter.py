"""Redis-backed API rate limiting (optional).

Authenticated requests count against the tenant taken from the verified JWT (never from the
``X-Tenant-Id`` header, which any caller can set). Requests without a valid token count against
the caller's IP address with a separate, smaller budget.
"""

from __future__ import annotations

import time
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.common.client_ip import client_ip_from_request
from app.common.jwt_compat import JWTError, jwt
from app.common.redis_client import get_redis
from app.config import get_settings


def _is_rate_limit_exempt_path(*, path: str, method: str, api_v1_prefix: str) -> bool:
    """High-frequency, authenticated bootstrap calls should not burn the shared tenant budget."""
    if path.startswith(f"{api_v1_prefix}/admin"):
        return True
    if path in ("/health", "/docs", "/openapi.json"):
        return True
    # Attendance machines: limited per device serial + IP in hr_attendance.iclock_router instead,
    # so a factory's machines do not use up the anonymous budget of everyone behind the same IP.
    if path.startswith("/iclock/"):
        return True
    if method.upper() == "GET" and path.rstrip("/") == f"{api_v1_prefix}/auth/me".rstrip("/"):
        return True
    return False


def _as_int(value: object) -> int | None:
    try:
        return int(str(value).strip())
    except (TypeError, ValueError):
        return None


def rate_limit_bucket(request: Request) -> tuple[str, int]:
    """Return ``(redis_key_prefix, per_minute_limit)`` for this request.

    Staff and external portal access tokens carry ``tid`` (staff tokens issued before that claim
    fall back to the user id). Anything else is treated as anonymous.
    """
    settings = get_settings()
    auth = request.headers.get("authorization") or ""
    if auth.lower().startswith("bearer "):
        token = auth.split(" ", 1)[1].strip()
        payload: dict | None = None
        if token:
            try:
                payload = jwt.decode(
                    token,
                    settings.jwt_secret,
                    algorithms=[settings.jwt_algorithm],
                    options={"verify_aud": False},
                )
            except JWTError:
                payload = None
        if payload:
            tenant_limit = int(settings.tenant_rate_limit_requests_per_minute or 0)
            sub = str(payload.get("sub") or "")
            if payload.get("typ") == "external" and payload.get("use") == "access":
                tid = _as_int(payload.get("tid"))
                if tid is not None:
                    return f"rl:min:{tid}", tenant_limit
            elif payload.get("typ") is None and payload.get("aud") is None and payload.get("use") is None and sub:
                tid = _as_int(payload.get("tid"))
                if tid is not None:
                    return f"rl:min:{tid}", tenant_limit
                uid = _as_int(sub)
                if uid is not None:
                    return f"rl:user:{uid}", tenant_limit
    return f"rl:ip:{client_ip_from_request(request)}", int(settings.anon_rate_limit_requests_per_minute or 0)


class TenantRateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-tenant / per-IP request limits when Redis is available."""

    async def dispatch(self, request: Request, call_next: Callable):
        settings = get_settings()
        api_p = settings.api_v1_prefix.rstrip("/") or "/api/v1"
        if _is_rate_limit_exempt_path(
            path=request.url.path, method=request.method, api_v1_prefix=api_p
        ):
            return await call_next(request)
        r = get_redis()
        if r is None:
            return await call_next(request)
        key, limit = rate_limit_bucket(request)
        if limit <= 0:
            return await call_next(request)
        window = int(time.time()) // 60
        k = f"{key}:{window}"
        try:
            n = await r.incr(k)
            if n == 1:
                await r.expire(k, 120)
            if n > limit:
                return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
        except Exception:
            pass
        return await call_next(request)
