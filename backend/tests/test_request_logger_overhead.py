"""RequestLoggingMiddleware: reuse resolved ids, optional read-request audit, bounded background writes.

Run:
docker compose exec backend pytest tests/test_request_logger_overhead.py -q
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

import pytest
from fastapi import FastAPI, HTTPException, Request
from httpx import ASGITransport, AsyncClient

from app.common import request_logger
from app.common.auth import create_access_token
from app.common.tenant import _tenant_already_loaded
from app.config import get_settings

USER_ID = 424242
TENANT_ID = 777


def _app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(request_logger.RequestLoggingMiddleware)

    @app.get("/api/v1/thing")
    async def read_thing(request: Request):
        # What get_current_user stores for the rest of the request.
        request.state.auth_user_id = USER_ID
        request.state.auth_user_tenant_id = TENANT_ID
        return {"ok": True}

    @app.post("/api/v1/thing")
    async def write_thing():
        return {"ok": True}

    @app.get("/api/v1/boom")
    async def boom():
        raise HTTPException(status_code=503, detail="down")

    return app


def _headers() -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token(subject=USER_ID)}", "X-Tenant-Id": str(TENANT_ID)}


@pytest.fixture
def captured(monkeypatch):
    rows: list[dict] = []

    async def _fake_insert(**row):
        rows.append(row)

    monkeypatch.setattr(request_logger, "_insert_audit_row", _fake_insert)
    monkeypatch.setattr(request_logger, "_audit_queue", None)
    return rows


def _use_settings(monkeypatch, **overrides):
    settings = get_settings().model_copy(update=overrides)
    monkeypatch.setattr(request_logger, "get_settings", lambda: settings)


async def _drain() -> None:
    queue = request_logger._audit_queue
    if queue is not None and queue.tasks:
        await asyncio.gather(*list(queue.tasks))


@pytest.mark.asyncio
async def test_audit_reuses_user_tenant_resolved_during_request(captured, monkeypatch):
    _use_settings(monkeypatch, audit_log_read_requests=True)
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test") as ac:
        r = await ac.get("/api/v1/thing", headers=_headers())
        assert r.status_code == 200
        await _drain()
    assert len(captured) == 1
    row = captured[0]
    assert row["user_id"] == USER_ID
    assert row["tenant_id_hdr"] == TENANT_ID
    assert row["user_tenant_id"] == TENANT_ID
    assert row["action"] == "API_REQUEST"


@pytest.mark.asyncio
async def test_read_requests_skipped_when_disabled_but_writes_and_5xx_kept(captured, monkeypatch):
    _use_settings(monkeypatch, audit_log_read_requests=False)
    async with AsyncClient(transport=ASGITransport(app=_app()), base_url="http://test") as ac:
        await ac.get("/api/v1/thing", headers=_headers())
        await ac.post("/api/v1/thing", headers=_headers())
        await ac.get("/api/v1/boom", headers=_headers())
        await _drain()
    assert [(r["request_method"], r["response_status"], r["action"]) for r in captured] == [
        ("POST", 200, "API_REQUEST"),
        ("GET", 503, "API_ERROR"),
    ]


@pytest.mark.asyncio
async def test_audit_backlog_is_bounded(monkeypatch):
    _use_settings(monkeypatch, audit_log_max_pending=2, audit_log_max_concurrency=1)
    monkeypatch.setattr(request_logger, "_audit_queue", None)
    release = asyncio.Event()
    started: list[dict] = []

    async def _slow_insert(**row):
        started.append(row)
        await release.wait()

    monkeypatch.setattr(request_logger, "_insert_audit_row", _slow_insert)
    for i in range(5):
        request_logger._submit_audit_row({"request_path": f"/r/{i}"})
    queue = request_logger._audit_queue
    assert queue is not None
    assert len(queue.tasks) == 2
    assert queue.dropped == 3
    release.set()
    await asyncio.gather(*list(queue.tasks))
    assert [r["request_path"] for r in started] == ["/r/0", "/r/1"]


def test_tenant_already_loaded_only_reuses_matching_active_tenant():
    active = SimpleNamespace(id=5, is_active=True, deleted_at=None)
    request = SimpleNamespace(state=SimpleNamespace(auth_user_tenant=active))
    assert _tenant_already_loaded(request, 5) is active
    assert _tenant_already_loaded(request, 6) is None

    request.state.auth_user_tenant = SimpleNamespace(id=5, is_active=False, deleted_at=None)
    assert _tenant_already_loaded(request, 5) is None

    request.state.auth_user_tenant = SimpleNamespace(id=5, is_active=True, deleted_at="2026-01-01")
    assert _tenant_already_loaded(request, 5) is None

    assert _tenant_already_loaded(SimpleNamespace(state=SimpleNamespace()), 5) is None
