"""Gzip API responses, except streaming endpoints that must not be buffered."""

from __future__ import annotations

from starlette.datastructures import Headers
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import Receive, Scope, Send

# /mcp uses streamable HTTP (may answer with Server-Sent Events); gzip would hold chunks back.
_SKIP_PATH_PREFIXES = ("/mcp",)


class SelectiveGZipMiddleware(GZipMiddleware):
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope.get("path") or ""
            accept = Headers(scope=scope).get("accept", "")
            if path.startswith(_SKIP_PATH_PREFIXES) or "text/event-stream" in accept:
                await self.app(scope, receive, send)
                return
        await super().__call__(scope, receive, send)
