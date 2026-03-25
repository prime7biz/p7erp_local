"""Redis-backed per-tenant rate limiting (optional)."""

from __future__ import annotations

import time
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.common.redis_client import get_redis
from app.config import get_settings


def _is_rate_limit_exempt_path(*, path: str, method: str, api_v1_prefix: str) -> bool:
    """High-frequency, authenticated bootstrap calls should not burn the shared tenant budget."""
    if path.startswith(f"{api_v1_prefix}/admin"):
        return True
    if path in ("/health", "/docs", "/openapi.json"):
        return True
    if method.upper() == "GET" and path.rstrip("/") == f"{api_v1_prefix}/auth/me".rstrip("/"):
        return True
    return False


class TenantRateLimitMiddleware(BaseHTTPMiddleware):
    """Apply per-tenant request limits when Redis is available (see config tenant_rate_limit_requests_per_minute)."""

    async def dispatch(self, request: Request, call_next: Callable):
        settings = get_settings()
        api_p = settings.api_v1_prefix.rstrip("/") or "/api/v1"
        if _is_rate_limit_exempt_path(
            path=request.url.path, method=request.method, api_v1_prefix=api_p
        ):
            return await call_next(request)
        tenant_hdr = request.headers.get("x-tenant-id")
        if not tenant_hdr:
            return await call_next(request)
        try:
            tid = int(tenant_hdr)
        except ValueError:
            return await call_next(request)
        r = get_redis()
        if r is None:
            return await call_next(request)
        limit = settings.tenant_rate_limit_requests_per_minute
        if limit <= 0:
            return await call_next(request)
        key = f"rl:min:{tid}"
        now = int(time.time())
        window = now // 60
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
