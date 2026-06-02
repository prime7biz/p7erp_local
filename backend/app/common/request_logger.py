"""ASGI middleware: log API requests to audit_logs (best-effort, non-blocking)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Callable

from jose import JWTError, jwt
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.config import get_settings
from app.database import AsyncSessionLocal, engine
from sqlalchemy import select

from app.models import AuditLog, User

logger = logging.getLogger(__name__)

SKIP_PREFIXES = ("/health", "/docs", "/openapi.json", "/redoc", "/favicon.ico", "/api/v1/files/")


def _should_skip(path: str) -> bool:
    if path in ("/health", "/"):
        return True
    return any(path.startswith(p) for p in SKIP_PREFIXES)


def _decode_tenant_user(token: str) -> tuple[int | None, int | None]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None, None
    aud = payload.get("aud")
    if aud == "platform-admin":
        return None, None
    sub = payload.get("sub")
    if not sub:
        return None, None
    try:
        uid = int(sub)
    except (TypeError, ValueError):
        return None, None
    return None, uid


async def _insert_audit_row(
    *,
    tenant_id_hdr: int | None,
    user_id: int | None,
    action: str,
    resource: str,
    ip_address: str | None,
    user_agent: str | None,
    request_method: str,
    request_path: str,
    response_status: int,
    duration_ms: int,
) -> None:
    try:
        async with AsyncSessionLocal() as db:
            tenant_id: int | None = tenant_id_hdr
            # When X-Tenant-Id is present, use it (API routes already enforce user↔tenant match).
            # Only hit the DB when the header is missing but we have a user id.
            if user_id is not None and tenant_id is None:
                result = await db.execute(select(User.tenant_id).where(User.id == user_id))
                tid = result.scalar_one_or_none()
                if tid is not None:
                    tenant_id = tid
            elif user_id is not None and tenant_id is not None:
                result = await db.execute(select(User.tenant_id).where(User.id == user_id))
                tid = result.scalar_one_or_none()
                if tid is not None and tid != tenant_id:
                    logger.warning(
                        "Audit skip: X-Tenant-Id=%s does not match user tenant=%s for user_id=%s",
                        tenant_id,
                        tid,
                        user_id,
                    )
                    return
            if tenant_id is None or user_id is None:
                return
            row = AuditLog(
                tenant_id=tenant_id,
                user_id=user_id,
                action=action,
                resource=resource,
                details=None,
                ip_address=ip_address,
                user_agent=user_agent,
                request_method=request_method,
                request_path=request_path,
                response_status=response_status,
                duration_ms=duration_ms,
                created_at=datetime.utcnow(),
            )
            db.add(row)
            await db.commit()
    except Exception:
        logger.exception("request_logger audit insert failed")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        if _should_skip(path):
            return await call_next(request)
        start = datetime.utcnow()
        settings = get_settings()
        qraw = request.url.query or ""
        warn_bytes = int(getattr(settings, "perf_request_query_warn_bytes", 0) or 0)
        if warn_bytes > 0 and len(qraw.encode("utf-8", errors="replace")) > warn_bytes:
            logger.warning(
                "perf_oversized_query_string method=%s path=%s query_bytes=%s",
                request.method,
                path[:240],
                len(qraw.encode("utf-8", errors="replace")),
            )
        auth = request.headers.get("authorization") or ""
        tenant_id = None
        user_id = None
        if auth.lower().startswith("bearer "):
            token = auth.split(" ", 1)[1].strip()
            if token:
                # Tenant resolution: X-Tenant-Id + user id from JWT
                try:
                    h = request.headers.get("x-tenant-id")
                    if h:
                        tenant_id = int(h)
                except (TypeError, ValueError):
                    tenant_id = None
                _, user_id = _decode_tenant_user(token)
        response = await call_next(request)
        duration_ms = int((datetime.utcnow() - start).total_seconds() * 1000)
        slow_ms = int(getattr(settings, "perf_timing_slow_ms", 750) or 750)
        if settings.perf_timing_enabled and duration_ms >= slow_ms:
            pool_chunk = ""
            if settings.perf_pool_metrics_enabled:
                try:
                    pool = engine.sync_engine.pool
                    pool_chunk = (
                        f" pool_in={pool.checkedin()} pool_out={pool.checkedout()} pool_overflow={pool.overflow()}"
                    )
                except Exception:
                    pool_chunk = " pool=unavailable"
            logger.info(
                "perf_request tenant_id=%s user_id=%s %s %s status=%s duration_ms=%s%s",
                tenant_id,
                user_id,
                request.method,
                path[:500],
                response.status_code,
                duration_ms,
                pool_chunk,
            )
        status_code = response.status_code
        if tenant_id is None and user_id is None:
            return response
        action = "API_REQUEST"
        if status_code >= 500:
            action = "API_ERROR"
        ua = request.headers.get("user-agent")
        client = request.client.host if request.client else None
        asyncio.create_task(
            _insert_audit_row(
                tenant_id_hdr=tenant_id,
                user_id=user_id,
                action=action,
                resource="http",
                ip_address=client,
                user_agent=ua,
                request_method=request.method,
                request_path=path[:500],
                response_status=status_code,
                duration_ms=duration_ms,
            )
        )
        return response
