"""MCP caller resolution: same identity rules as get_current_user, active tenant, AI access.

Run (worktree mounted over /app):
docker compose run --rm --no-deps backend pytest -q tests/test_mcp_auth_hardening.py
"""

from __future__ import annotations

import json
import uuid
from contextlib import asynccontextmanager
from types import SimpleNamespace

import pytest

from app.common.auth import create_access_token
from app.models import User
from app.modules.ai_tool.forecast import job_manager
from app.modules.mcp_server import auth as mcp_auth
from app.modules.mcp_server.tools import execute_tool_call
from tests.merch_fixtures import create_merch_tenant_with_user

AI_PERMS = {"ai.read": True}


def _use_test_session(monkeypatch, db) -> None:
    @asynccontextmanager
    async def _factory():
        yield db

    monkeypatch.setattr(mcp_auth, "AsyncSessionLocal", _factory)


def _headers(user: User, *, session_version: int | None = None, tenant_id: int | None = None) -> dict[str, str]:
    sv = int(user.auth_session_version or 0) if session_version is None else session_version
    token = create_access_token(subject=user.id, session_version=sv)
    headers = {"authorization": f"Bearer {token}"}
    if tenant_id is not None:
        headers["x-tenant-id"] = str(tenant_id)
    return headers


async def _seed(db, *, permissions: dict | None = None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions=permissions or AI_PERMS)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "single_session_enforced": True}
    await db.flush()
    return tenant, user, role


@pytest.mark.asyncio
async def test_mcp_resolves_active_caller_with_ai_access(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await _seed(db)
    _use_test_session(monkeypatch, db)

    caller = await mcp_auth.resolve_mcp_user(_headers(user, tenant_id=tenant.id))

    assert caller is not None
    assert caller.id == user.id
    assert await mcp_auth.resolve_mcp_tenant(_headers(user)) == tenant.id


@pytest.mark.asyncio
async def test_mcp_rejects_superseded_session_token(db_session_integration, monkeypatch):
    db = db_session_integration
    _tenant, user, _ = await _seed(db)
    _use_test_session(monkeypatch, db)
    old_headers = _headers(user, session_version=int(user.auth_session_version or 0))

    user.auth_session_version = int(user.auth_session_version or 0) + 1
    await db.flush()

    with pytest.raises(mcp_auth.McpAuthError) as exc:
        await mcp_auth.resolve_mcp_user(old_headers)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_mcp_rejects_inactive_user(db_session_integration, monkeypatch):
    db = db_session_integration
    _tenant, user, _ = await _seed(db)
    _use_test_session(monkeypatch, db)
    headers = _headers(user)
    user.is_active = False
    await db.flush()

    with pytest.raises(mcp_auth.McpAuthError) as exc:
        await mcp_auth.resolve_mcp_user(headers)
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_mcp_rejects_inactive_tenant(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await _seed(db)
    _use_test_session(monkeypatch, db)
    tenant.is_active = False
    await db.flush()

    with pytest.raises(mcp_auth.McpAuthError) as exc:
        await mcp_auth.resolve_mcp_user(_headers(user))
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_mcp_rejects_tenant_header_mismatch(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await _seed(db)
    _use_test_session(monkeypatch, db)

    with pytest.raises(mcp_auth.McpAuthError) as exc:
        await mcp_auth.resolve_mcp_user(_headers(user, tenant_id=tenant.id + 100000))
    assert exc.value.status_code == 401


@pytest.mark.asyncio
async def test_mcp_rejects_user_without_ai_access(db_session_integration, monkeypatch):
    db = db_session_integration
    _tenant, user, _ = await _seed(db, permissions={"merch.access": True})
    _use_test_session(monkeypatch, db)

    with pytest.raises(mcp_auth.McpAuthError) as exc:
        await mcp_auth.resolve_mcp_user(_headers(user))
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_mcp_middleware_returns_403_and_sets_caller_context(db_session_integration, monkeypatch):
    db = db_session_integration
    _t1, allowed_user, _ = await _seed(db)
    _t2, denied_user, _ = await _seed(db, permissions={"merch.access": True})
    _use_test_session(monkeypatch, db)

    seen: dict = {}

    async def inner_app(scope, receive, send):
        seen["user"] = mcp_auth.get_mcp_user()
        seen["tenant_id"] = mcp_auth.get_mcp_tenant_id()

    middleware = mcp_auth.McpAuthMiddleware(inner_app, require_auth=True)

    def _scope(headers: dict[str, str]) -> dict:
        return {
            "type": "http",
            "headers": [(k.encode("latin-1"), v.encode("latin-1")) for k, v in headers.items()],
        }

    sent: list[dict] = []

    async def send(message):
        sent.append(message)

    await middleware(_scope(_headers(denied_user)), None, send)
    assert sent[0]["status"] == 403
    assert "detail" in json.loads(sent[1]["body"])
    assert "user" not in seen

    sent.clear()
    await middleware(_scope(_headers(allowed_user)), None, send)
    assert sent == []
    assert seen["user"].id == allowed_user.id
    assert seen["tenant_id"] == allowed_user.tenant_id
    assert mcp_auth.get_mcp_user() is None


@pytest.mark.asyncio
async def test_forecast_refuses_without_caller_user():
    out = await job_manager.run_forecast_for_mcp(
        None,  # type: ignore[arg-type]
        tenant_id=1,
        user=None,
        target_variable="sales_trend",
        timeframe="30d",
        parameters=None,
    )
    assert out["status"] == "FAILED"


@pytest.mark.asyncio
async def test_forecast_refuses_caller_from_other_tenant():
    out = await job_manager.run_forecast_for_mcp(
        None,  # type: ignore[arg-type]
        tenant_id=1,
        user=SimpleNamespace(id=5, tenant_id=2),  # type: ignore[arg-type]
        target_variable="sales_trend",
        timeframe="30d",
        parameters=None,
    )
    assert out["status"] == "FAILED"


@pytest.mark.asyncio
async def test_forecast_runs_as_caller_user(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, first_user, role = await _seed(db)
    caller = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"caller{uuid.uuid4().hex[:8]}",
        email=f"caller{uuid.uuid4().hex[:8]}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(caller)
    await db.flush()
    assert first_user.id < caller.id

    captured: dict = {}

    async def fake_execute(db_, *, tenant_id, user, prompt, horizon_days, from_date, to_date):
        captured["user_id"] = user.id
        return None, None, None, "stub stop"

    monkeypatch.setattr(job_manager, "execute_forecast_request", fake_execute)

    out = await job_manager.run_forecast_for_mcp(
        db,
        tenant_id=tenant.id,
        user=caller,
        target_variable="sales_trend",
        timeframe="30d",
        parameters=None,
    )
    assert out == {"status": "FAILED", "message": "stub stop"}
    assert captured["user_id"] == caller.id


@pytest.mark.asyncio
async def test_execute_tool_call_passes_caller_to_forecast(monkeypatch):
    captured: dict = {}

    async def fake_run(session, **kwargs):
        captured.update(kwargs)
        return {"status": "SUCCESS"}

    monkeypatch.setattr(job_manager, "run_forecast_for_mcp", fake_run)
    caller = SimpleNamespace(id=42, tenant_id=7)

    out = await execute_tool_call(
        "generate_forecast",
        {"tenant_id": 7, "target_variable": "sales_trend"},
        context_tenant_id=7,
        user=caller,  # type: ignore[arg-type]
    )
    assert out["status"] == "SUCCESS"
    assert captured["user"] is caller


@pytest.mark.asyncio
async def test_execute_tool_call_blocks_context_tenant_not_matching_caller():
    out = await execute_tool_call(
        "search_unstructured_context",
        {"tenant_id": 7, "query": "late shipments", "domain": "merch"},
        context_tenant_id=7,
        user=SimpleNamespace(id=1, tenant_id=8),  # type: ignore[arg-type]
    )
    assert out["status"] == "BLOCKED"
