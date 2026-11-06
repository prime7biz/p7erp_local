"""SelectiveGZipMiddleware: gzip normal responses, never streaming /mcp or SSE requests.

Run:
docker compose exec backend pytest tests/test_gzip_middleware.py -q
"""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.common.gzip_middleware import SelectiveGZipMiddleware

_BIG = {"rows": ["x" * 50] * 100}


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(SelectiveGZipMiddleware, minimum_size=1024)

    @app.get("/api/v1/big")
    async def big():
        return _BIG

    @app.get("/api/v1/small")
    async def small():
        return {"ok": True}

    @app.get("/mcp/big")
    async def mcp_big():
        return _BIG

    return app


@pytest.mark.asyncio
async def test_gzip_applies_to_large_json_and_skips_small_mcp_and_sse():
    transport = ASGITransport(app=_app())
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        gz_headers = {"accept-encoding": "gzip"}

        r = await ac.get("/api/v1/big", headers=gz_headers)
        assert r.status_code == 200
        assert r.headers.get("content-encoding") == "gzip"
        assert r.json() == _BIG

        r = await ac.get("/api/v1/small", headers=gz_headers)
        assert r.headers.get("content-encoding") is None

        r = await ac.get("/mcp/big", headers=gz_headers)
        assert r.headers.get("content-encoding") is None
        assert r.json() == _BIG

        r = await ac.get("/api/v1/big", headers={**gz_headers, "accept": "text/event-stream"})
        assert r.headers.get("content-encoding") is None
