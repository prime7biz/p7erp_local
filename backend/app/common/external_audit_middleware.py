"""Best-effort audit logging for /api/external/* (skips sensitive auth endpoints)."""

from __future__ import annotations

import asyncio
import logging
from typing import Callable

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from app.external_access.constants import JWT_CLAIM_TYPE, JWT_VALUE_EXTERNAL, parse_external_subject
from app.external_access.tokens import decode_external_token

logger = logging.getLogger(__name__)


def _skip_audit(path: str) -> bool:
    p = path.lower()
    return any(
        x in p
        for x in (
            "/auth/login",
            "/auth/accept-invite",
            "/auth/reset-password",
            "/auth/request-password-reset",
            "/auth/refresh",
        )
    )


class ExternalAuditMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        path = request.url.path
        if not path.startswith("/api/external"):
            return response
        if _skip_audit(path):
            return response

        auth = request.headers.get("authorization") or ""
        principal_id = None
        if auth.lower().startswith("bearer "):
            token = auth[7:].strip()
            try:
                payload = decode_external_token(token)
                if payload.get(JWT_CLAIM_TYPE) == JWT_VALUE_EXTERNAL:
                    principal_id = parse_external_subject(str(payload.get("sub") or ""))
            except Exception:
                principal_id = None

        tenant_hdr = request.headers.get("x-tenant-id")
        tenant_id = None
        if tenant_hdr:
            try:
                tenant_id = int(tenant_hdr)
            except ValueError:
                tenant_id = None

        if tenant_id is None:
            return response

        async def _write():
            try:
                from app.database import AsyncSessionLocal
                from app.external_access.audit import log_external_action

                async with AsyncSessionLocal() as db:
                    await log_external_action(
                        db,
                        tenant_id=tenant_id,
                        action="EXTERNAL_API_REQUEST",
                        resource_type="http",
                        resource_id=None,
                        external_principal_id=principal_id,
                        details={
                            "method": request.method,
                            "path": path,
                            "status": response.status_code,
                        },
                        ip_address=request.client.host if request.client else None,
                        user_agent=request.headers.get("user-agent"),
                    )
                    await db.commit()
            except Exception:
                logger.debug("external audit log failed", exc_info=True)

        asyncio.create_task(_write())
        return response
