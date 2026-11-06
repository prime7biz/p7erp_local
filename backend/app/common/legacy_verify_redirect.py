"""Send phone scans of old printed QR codes to the public verification page.

Documents printed before the public page existed carry a raw API link
(``/api/v1/finance/vouchers/verify/VFY-...`` or ``/api/v1/inventory/documents/verify/VFY-...``).
A phone opening that link has no login, so the API answered with an error. When such a request
comes from a browser (Accept: text/html) without an Authorization header, redirect it to
``/verify/document/VFY-...``. In-app calls always send Authorization and pass through unchanged.
"""

from __future__ import annotations

import re

from starlette.types import ASGIApp, Receive, Scope, Send

_ID = r"(VFY-[0-9A-F]{16})"


class LegacyVerifyRedirectMiddleware:
    def __init__(self, app: ASGIApp, api_v1_prefix: str = "/api/v1") -> None:
        self.app = app
        prefix = re.escape(api_v1_prefix.rstrip("/") or "/api/v1")
        self._pattern = re.compile(
            rf"^{prefix}/(?:finance/vouchers/verify|inventory/documents/verify)/{_ID}/?$", re.IGNORECASE
        )

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("method") == "GET":
            match = self._pattern.match(scope.get("path", ""))
            if match:
                headers = {k.decode("latin-1").lower(): v.decode("latin-1") for k, v in scope.get("headers", [])}
                if "authorization" not in headers and "text/html" in headers.get("accept", "").lower():
                    location = f"/verify/document/{match.group(1).upper()}"
                    await send(
                        {
                            "type": "http.response.start",
                            "status": 302,
                            "headers": [
                                (b"location", location.encode("latin-1")),
                                (b"cache-control", b"no-store"),
                                (b"content-length", b"0"),
                            ],
                        }
                    )
                    await send({"type": "http.response.body", "body": b""})
                    return
        await self.app(scope, receive, send)
