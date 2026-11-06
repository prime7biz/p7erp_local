"""MCP HTTP endpoint authentication and tenant binding.

Uses ContextVars so MCP tool handlers can read the authenticated tenant_id and
caller User without needing FastAPI Depends (MCP is a mounted ASGI sub-app).
"""

from __future__ import annotations

import contextvars
import json
import logging
from typing import Any

from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from starlette.requests import Request

from app.common.auth import get_current_user
from app.common.rls import reset_session_context
from app.common.tenant import get_tenant
from app.database import AsyncSessionLocal
from app.models import User
from app.modules.ai_tool.authz import require_ai_access

logger = logging.getLogger(__name__)

_mcp_tenant_ctx: contextvars.ContextVar[int | None] = contextvars.ContextVar(
    "mcp_tenant_id", default=None
)
_mcp_user_ctx: contextvars.ContextVar[User | None] = contextvars.ContextVar(
    "mcp_user", default=None
)


class McpAuthError(ValueError):
    """Auth failure for /mcp; ``status_code`` is 401 (identity) or 403 (permission)."""

    def __init__(self, detail: Any, status_code: int = 401) -> None:
        super().__init__(detail if isinstance(detail, str) else json.dumps(detail, default=str))
        self.detail = detail
        self.status_code = status_code


def get_mcp_tenant_id() -> int | None:
    """Read the authenticated tenant_id for the current MCP request (if any)."""
    return _mcp_tenant_ctx.get(None)


def get_mcp_user() -> User | None:
    """Read the authenticated caller for the current MCP request (if any)."""
    return _mcp_user_ctx.get(None)


async def resolve_mcp_user(
    raw_headers: dict[str, str],
    *,
    require_auth: bool = True,
) -> User | None:
    """Resolve the MCP caller like ``get_current_user`` plus active tenant and AI access.

    Returns the User, or None when auth is not required and no credentials are
    provided. Raises McpAuthError on failure.
    """
    auth_value = raw_headers.get("authorization", "")
    tenant_header = raw_headers.get("x-tenant-id", "")

    if not auth_value.startswith("Bearer "):
        if require_auth:
            raise McpAuthError("Missing or invalid Authorization header.")
        return None

    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_value[7:])
    request = Request({"type": "http", "headers": [], "state": {}})

    async with AsyncSessionLocal() as db:
        try:
            try:
                user = await get_current_user(db=db, request=request, credentials=credentials)
            except HTTPException as exc:
                raise McpAuthError(exc.detail, 401) from exc

            if tenant_header:
                try:
                    hdr_tid = int(tenant_header)
                except (TypeError, ValueError) as exc:
                    raise McpAuthError("X-Tenant-Id header is not a valid integer.") from exc
                if hdr_tid != user.tenant_id:
                    raise McpAuthError("X-Tenant-Id does not match the authenticated user's tenant.")

            if await get_tenant(db, user.tenant_id) is None:
                raise McpAuthError("Tenant not found or inactive.")

            try:
                await require_ai_access(db, user)
            except HTTPException as exc:
                raise McpAuthError(exc.detail, 403) from exc
        finally:
            # get_current_user pinned this session to the caller's tenant (RLS); no request scope here.
            await reset_session_context(db)

    return user


async def resolve_mcp_tenant(
    raw_headers: dict[str, str],
    *,
    require_auth: bool = True,
) -> int | None:
    """Backward-compatible wrapper: return only the caller's tenant_id."""
    user = await resolve_mcp_user(raw_headers, require_auth=require_auth)
    return user.tenant_id if user is not None else None


def _parse_scope_headers(scope: dict[str, Any]) -> dict[str, str]:
    """Extract HTTP headers from an ASGI scope into a lowercase dict."""
    out: dict[str, str] = {}
    for raw_name, raw_value in scope.get("headers", []):
        name = raw_name.decode("latin-1").lower()
        out[name] = raw_value.decode("latin-1")
    return out


class McpAuthMiddleware:
    """ASGI middleware that wraps the MCP sub-app with JWT + tenant validation.

    On success the resolved tenant_id and caller are stored in ContextVars so
    tool handlers can retrieve them via ``get_mcp_tenant_id()`` / ``get_mcp_user()``.
    """

    def __init__(self, app: Any, *, require_auth: bool = True) -> None:
        self.app = app
        self.require_auth = require_auth

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        headers = _parse_scope_headers(scope)

        try:
            user = await resolve_mcp_user(headers, require_auth=self.require_auth)
        except McpAuthError as exc:
            await self._send_json_error(send, exc.status_code, exc.detail)
            return

        tenant_token = _mcp_tenant_ctx.set(user.tenant_id if user is not None else None)
        user_token = _mcp_user_ctx.set(user)
        try:
            await self.app(scope, receive, send)
        finally:
            _mcp_user_ctx.reset(user_token)
            _mcp_tenant_ctx.reset(tenant_token)

    @staticmethod
    async def _send_json_error(send: Any, status_code: int, detail: Any) -> None:
        body = json.dumps({"detail": detail}).encode()
        await send(
            {
                "type": "http.response.start",
                "status": status_code,
                "headers": [
                    [b"content-type", b"application/json"],
                    [b"content-length", str(len(body)).encode()],
                ],
            }
        )
        await send({"type": "http.response.body", "body": body})
