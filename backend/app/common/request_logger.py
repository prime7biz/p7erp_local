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
from app.database import AsyncSessionLocal
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
            if user_id is not None:
                result = await db.execute(select(User.tenant_id).where(User.id == user_id))
                tid = result.scalar_one_or_none()
                if tid is not None:
                    if tenant_id is not None and tenant_id != tid:
                        return
                    tenant_id = tid
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
