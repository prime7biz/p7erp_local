"""Tell browsers not to keep API answers on disk (phones are shared, lost and stolen).

Every response under /api/ gets ``Cache-Control: private, no-store`` unless the route already set
its own Cache-Control header.
"""

from __future__ import annotations

from starlette.types import ASGIApp, Message, Receive, Scope, Send

API_NO_STORE_VALUE = b"private, no-store"
_API_PREFIX = "/api/"


class ApiNoStoreMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or not (scope.get("path") or "").startswith(_API_PREFIX):
            await self.app(scope, receive, send)
            return

        async def send_with_no_store(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers") or [])
                if not any(name.lower() == b"cache-control" for name, _ in headers):
                    headers.append((b"cache-control", API_NO_STORE_VALUE))
                    message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_with_no_store)
