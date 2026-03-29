"""MCP HTTP endpoint authentication and tenant binding.

Uses a ContextVar so MCP tool handlers can read the authenticated tenant_id
without needing FastAPI Depends (MCP is a mounted ASGI sub-app).
"""

from __future__ import annotations

import contextvars
import json
import logging
from typing import Any

from jose import JWTError, jwt
from sqlalchemy import select

from app.config import get_settings
from app.database import AsyncSessionLocal
from app.models import User

logger = logging.getLogger(__name__)

_mcp_tenant_ctx: contextvars.ContextVar[int | None] = contextvars.ContextVar(
    "mcp_tenant_id", default=None
)


def get_mcp_tenant_id() -> int | None:
    """Read the authenticated tenant_id for the current MCP request (if any)."""
    return _mcp_tenant_ctx.get(None)


async def resolve_mcp_tenant(
    raw_headers: dict[str, str],
    *,
    require_auth: bool = True,
) -> int | None:
    """Validate JWT and resolve user tenant from MCP HTTP request headers.

    Returns the authenticated tenant_id, or None when auth is not required
    and no credentials are provided.  Raises ValueError on auth failure.
    """
    settings = get_settings()
    auth_value = raw_headers.get("authorization", "")
    tenant_header = raw_headers.get("x-tenant-id", "")

    if not auth_value.startswith("Bearer "):
        if require_auth:
            raise ValueError("Missing or invalid Authorization header.")
        return None

    token = auth_value[7:]
    try:
        payload = jwt.decode(
            token, settings.jwt_secret, algorithms=[settings.jwt_algorithm]
        )
    except JWTError as exc:
        raise ValueError("Invalid or expired Bearer token.") from exc

    if payload.get("aud") == "platform-admin":
        raise ValueError("Platform-admin tokens are not valid for MCP tool calls.")

    sub = payload.get("sub")
    if not sub:
        raise ValueError("Token missing subject claim.")
    try:
        user_id = int(sub)
    except (TypeError, ValueError) as exc:
        raise ValueError("Token subject is not a valid user id.") from exc

    async with AsyncSessionLocal() as db:
        row = await db.execute(
            select(User.tenant_id, User.is_active).where(User.id == user_id)
        )
        result = row.one_or_none()

    if result is None:
        raise ValueError("User not found.")
    user_tenant_id, is_active = result.tuple()
    if not is_active:
        raise ValueError("User account is inactive.")

    if tenant_header:
        try:
            hdr_tid = int(tenant_header)
        except (TypeError, ValueError) as exc:
            raise ValueError("X-Tenant-Id header is not a valid integer.") from exc
        if hdr_tid != user_tenant_id:
            raise ValueError(
                "X-Tenant-Id does not match the authenticated user's tenant."
            )

    return user_tenant_id


def _parse_scope_headers(scope: dict[str, Any]) -> dict[str, str]:
    """Extract HTTP headers from an ASGI scope into a lowercase dict."""
    out: dict[str, str] = {}
    for raw_name, raw_value in scope.get("headers", []):
        name = raw_name.decode("latin-1").lower()
        out[name] = raw_value.decode("latin-1")
    return out


class McpAuthMiddleware:
    """ASGI middleware that wraps the MCP sub-app with JWT + tenant validation.

    On success the resolved tenant_id is stored in a ContextVar so tool
    handlers can retrieve it via ``get_mcp_tenant_id()``.
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
            tenant_id = await resolve_mcp_tenant(
                headers, require_auth=self.require_auth
            )
        except ValueError as exc:
            await self._send_json_error(send, 401, str(exc))
            return

        token = _mcp_tenant_ctx.set(tenant_id)
        try:
            await self.app(scope, receive, send)
        finally:
            _mcp_tenant_ctx.reset(token)

    @staticmethod
    async def _send_json_error(send: Any, status_code: int, detail: str) -> None:
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
