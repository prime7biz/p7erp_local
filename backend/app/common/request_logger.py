"""ASGI middleware: log API requests to audit_logs (best-effort, non-blocking)."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime
from typing import Callable

from app.common.jwt_compat import JWTError, jwt
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
    user_tenant_id: int | None = None,
) -> None:
    """``user_tenant_id`` is the user's tenant when the request already resolved it (skips a query)."""
    try:
        async with AsyncSessionLocal() as db:
            tenant_id: int | None = tenant_id_hdr
            if user_id is not None and user_tenant_id is None:
                result = await db.execute(select(User.tenant_id).where(User.id == user_id))
                user_tenant_id = result.scalar_one_or_none()
            if user_id is not None and user_tenant_id is not None:
                if tenant_id is None:
                    tenant_id = user_tenant_id
                elif user_tenant_id != tenant_id:
                    logger.warning(
                        "Audit skip: X-Tenant-Id=%s does not match user tenant=%s for user_id=%s",
                        tenant_id,
                        user_tenant_id,
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


class _AuditWriteQueue:
    """Background audit writes for one event loop, with limits.

    At most ``max_concurrency`` rows are written at once (each write holds a DB connection) and at
    most ``max_pending`` wait in total; beyond that rows are dropped with a warning so a traffic
    spike cannot pile up unbounded tasks or starve request handlers of DB connections.
    """

    def __init__(self, loop: asyncio.AbstractEventLoop, max_concurrency: int) -> None:
        self.loop = loop
        self.slots = asyncio.Semaphore(max(1, max_concurrency))
        self.tasks: set[asyncio.Task] = set()
        self.dropped = 0

    async def _run(self, row: dict) -> None:
        async with self.slots:
            await _insert_audit_row(**row)

    def submit(self, row: dict, max_pending: int) -> None:
        if len(self.tasks) >= max(1, max_pending):
            self.dropped += 1
            if self.dropped == 1 or self.dropped % 100 == 0:
                logger.warning(
                    "request audit backlog full (%s pending); dropped %s audit rows so far",
                    len(self.tasks),
                    self.dropped,
                )
            return
        task = self.loop.create_task(self._run(row))
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)


_audit_queue: _AuditWriteQueue | None = None


def _submit_audit_row(row: dict) -> None:
    global _audit_queue
    settings = get_settings()
    loop = asyncio.get_running_loop()
    if _audit_queue is None or _audit_queue.loop is not loop:
        _audit_queue = _AuditWriteQueue(loop, int(settings.audit_log_max_concurrency or 1))
    _audit_queue.submit(row, int(settings.audit_log_max_pending or 1))


_READ_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})


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
        if (
            not settings.audit_log_read_requests
            and request.method.upper() in _READ_METHODS
            and status_code < 500
        ):
            return response
        action = "API_REQUEST"
        if status_code >= 500:
            action = "API_ERROR"
        ua = request.headers.get("user-agent")
        client = request.client.host if request.client else None
        # get_current_user stores the user's tenant on request.state; reuse it to skip a DB lookup.
        user_tenant_id = None
        if user_id is not None and getattr(request.state, "auth_user_id", None) == user_id:
            user_tenant_id = getattr(request.state, "auth_user_tenant_id", None)
        _submit_audit_row(
            {
                "tenant_id_hdr": tenant_id,
                "user_id": user_id,
                "user_tenant_id": user_tenant_id,
                "action": action,
                "resource": "http",
                "ip_address": client,
                "user_agent": ua,
                "request_method": request.method,
                "request_path": path[:500],
                "response_status": status_code,
                "duration_ms": duration_ms,
            }
        )
        return response
