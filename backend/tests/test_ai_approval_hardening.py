"""AI approvals: single-use escalation approval, read-only paid tool loop, artifact review rules.

Run (worktree mounted over /app):
docker compose run --rm --no-deps backend pytest -q tests/test_ai_approval_hardening.py
"""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.models import User
from app.models.ai_tool import AiMessage, AiSession
from app.modules.ai_tool import service as ai_service
from app.modules.ai_tool.artifacts import service as artifact_service
from app.modules.ai_tool.llm_provider import paid_provider
from app.modules.ai_tool.llm_provider.paid_provider import PaidLlmProvider
from app.modules.mcp_server import safety
from tests.merch_fixtures import create_merch_tenant_with_user

READ_ONLY_TOOLS = {"search_unstructured_context", "analyze_structured_metrics"}


async def _second_user(db, tenant, role) -> User:
    slug = uuid.uuid4().hex[:8]
    other = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"rev{slug}",
        email=f"rev{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(other)
    await db.flush()
    return other


# --- human approval token comparison -------------------------------------------------


def test_commit_gate_accepts_matching_token_and_rejects_others(monkeypatch):
    monkeypatch.setattr(
        safety,
        "get_settings",
        lambda: SimpleNamespace(mcp_commit_bypass=False, mcp_human_approval_secret="approval-secret"),
    )
    args = {"human_approval_confirmed": True, "human_approval_token": "approval-secret"}
    assert safety.check_commit_allowed(tool_name="create_financial_voucher", arguments=args) == (True, None)

    for bad in ("approval-secreT", "approval-secret-extra", "", "x"):
        ok, _msg = safety.check_commit_allowed(
            tool_name="create_financial_voucher",
            arguments={"human_approval_confirmed": True, "human_approval_token": bad},
        )
        assert ok is False


# --- paid model tool loop ------------------------------------------------------------


def test_paid_loop_offers_only_read_only_tools():
    user = SimpleNamespace(id=1, tenant_id=1)
    names = {t["name"] for t in paid_provider.paid_loop_tools(user)}  # type: ignore[arg-type]
    assert names == READ_ONLY_TOOLS
    assert paid_provider.paid_loop_tools(None) == []


@pytest.mark.asyncio
async def test_paid_loop_refuses_write_tool_and_runs_read_tool_as_user(monkeypatch):
    calls: list[dict] = []

    async def fake_call(tool_name, arguments, *, context_tenant_id=None, user=None):
        calls.append({"tool": tool_name, "args": arguments, "tenant": context_tenant_id, "user": user})
        return {"status": "SUCCESS"}

    monkeypatch.setattr(paid_provider, "call_registered_tool", fake_call)
    user = SimpleNamespace(id=9, tenant_id=3)
    allowed = {t["name"] for t in paid_provider.paid_loop_tools(user)}  # type: ignore[arg-type]

    blocked = await paid_provider.run_paid_loop_tool(
        "create_financial_voucher", {"amount": 1}, tenant_id=3, user=user, allowed_names=allowed  # type: ignore[arg-type]
    )
    assert blocked["status"] == "BLOCKED"
    assert calls == []

    no_user = await paid_provider.run_paid_loop_tool(
        "analyze_structured_metrics", {}, tenant_id=3, user=None, allowed_names=allowed
    )
    assert no_user["status"] == "BLOCKED"
    assert calls == []

    ok = await paid_provider.run_paid_loop_tool(
        "analyze_structured_metrics", {"metric_type": "margin"}, tenant_id=3, user=user, allowed_names=allowed  # type: ignore[arg-type]
    )
    assert ok["status"] == "SUCCESS"
    assert calls[0]["user"] is user
    assert calls[0]["tenant"] == 3
    assert calls[0]["args"]["tenant_id"] == 3


class _FakeResp:
    def __init__(self, data: dict) -> None:
        self._data = data

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._data


@pytest.mark.asyncio
async def test_paid_openai_loop_never_executes_write_tool(monkeypatch):
    bodies: list[dict] = []
    replies = [
        {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": None,
                        "tool_calls": [
                            {
                                "id": "c1",
                                "type": "function",
                                "function": {"name": "create_financial_voucher", "arguments": "{\"amount\": 5}"},
                            }
                        ],
                    }
                }
            ]
        },
        {"choices": [{"message": {"role": "assistant", "content": "done"}}]},
    ]

    async def fake_post(client, url, *, json, headers, max_attempts, log_feature):
        bodies.append(json)
        return _FakeResp(replies[len(bodies) - 1])

    executed: list[str] = []

    async def fake_call(tool_name, arguments, *, context_tenant_id=None, user=None):
        executed.append(tool_name)
        return {"status": "SUCCESS"}

    monkeypatch.setattr(paid_provider, "post_chat_completions_with_429_retry", fake_post)
    monkeypatch.setattr(paid_provider, "call_registered_tool", fake_call)
    user = SimpleNamespace(id=2, tenant_id=4)

    out = await PaidLlmProvider()._generate_openai_with_tool_loop(
        conversation=[{"role": "user", "content": "post a voucher"}],
        model="m",
        api_key="k",
        tenant_id=4,
        tools=paid_provider.paid_loop_tools(user),  # type: ignore[arg-type]
        requested_tool="create_financial_voucher",
        chat_url="http://llm.invalid/chat/completions",
        user=user,  # type: ignore[arg-type]
    )

    assert out == "done"
    assert executed == []
    offered = {t["function"]["name"] for t in bodies[0]["tools"]}
    assert offered == READ_ONLY_TOOLS
    assert bodies[0]["tool_choice"] == "auto"
    tool_msg = bodies[1]["messages"][-1]
    assert tool_msg["role"] == "tool" and "BLOCKED" in tool_msg["content"]


# --- escalation approval -------------------------------------------------------------


class _RecordingPaidProvider(PaidLlmProvider):
    def __init__(self) -> None:
        self.calls: list[dict] = []

    async def generate_with_mcp_loop(self, **kwargs):  # type: ignore[override]
        self.calls.append(kwargs)
        return "paid answer"


async def _seed_pending_escalation(db, *, stored_tool: str):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"ai.read": True})
    session = AiSession(tenant_id=tenant.id, user_id=user.id, session_code=f"S-{uuid.uuid4().hex[:12]}")
    db.add(session)
    await db.flush()
    db.add(
        AiMessage(
            tenant_id=tenant.id,
            session_id=session.id,
            sender_user_id=user.id,
            message_index=1,
            role="user",
            content="show margin risk",
        )
    )
    pending = AiMessage(
        tenant_id=tenant.id,
        session_id=session.id,
        message_index=2,
        role="assistant",
        content="Needs paid processing",
        content_json={"escalation_pending": True, "tool_required": stored_tool, "reason": "r"},
    )
    db.add(pending)
    await db.flush()
    return tenant, user, session, pending


@pytest.mark.asyncio
async def test_escalation_approval_uses_stored_tool_and_is_single_use(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, session, pending = await _seed_pending_escalation(db, stored_tool="analyze_structured_metrics")
    fake = _RecordingPaidProvider()
    monkeypatch.setattr(ai_service, "get_paid_llm_provider", lambda: fake)

    resp = await ai_service.approve_escalation(
        db,
        tenant=tenant,
        user=user,
        session_id=session.id,
        message_id=pending.id,
        tool_required="create_financial_voucher",
        approved=True,
    )

    assert resp.tool_results[0].tool_name == "analyze_structured_metrics"
    assert fake.calls[0]["requested_tool"] == "analyze_structured_metrics"
    assert fake.calls[0]["user"] is user

    row = (await db.execute(select(AiMessage).where(AiMessage.id == pending.id))).scalar_one()
    assert row.content_json["escalation_pending"] is False
    assert row.content_json["escalation_approved_by_user_id"] == user.id

    with pytest.raises(HTTPException) as exc:
        await ai_service.approve_escalation(
            db,
            tenant=tenant,
            user=user,
            session_id=session.id,
            message_id=pending.id,
            tool_required="analyze_structured_metrics",
            approved=True,
        )
    assert exc.value.status_code == 400
    assert len(fake.calls) == 1


# --- approval artifacts --------------------------------------------------------------


async def _seed_artifact(db, *, expires_at: datetime | None = None):
    tenant, requester, role = await create_merch_tenant_with_user(db, permissions={"ai.read": True})
    reviewer = await _second_user(db, tenant, role)
    art = await artifact_service.create_artifact(
        db,
        tenant_id=tenant.id,
        user_id=requester.id,
        session_id=None,
        artifact_type="finance_voucher",
        source_tool="create_financial_voucher",
        source_module="finance",
        original_input={"tenant_id": tenant.id},
        generated_payload={"tenant_id": tenant.id},
    )
    if expires_at is not None:
        art.expires_at = expires_at
        await db.flush()
    return tenant, requester, reviewer, art


@pytest.mark.asyncio
async def test_artifact_approval_rejects_requester_and_allows_other_reviewer(db_session_integration):
    db = db_session_integration
    tenant, requester, reviewer, art = await _seed_artifact(db)

    with pytest.raises(HTTPException) as exc:
        await artifact_service.approve_artifact(db, tenant_id=tenant.id, artifact_id=art.id, reviewer=requester)
    assert exc.value.status_code == 403
    assert art.status == "pending_review"

    row = await artifact_service.approve_artifact(db, tenant_id=tenant.id, artifact_id=art.id, reviewer=reviewer)
    assert row is not None
    assert row.status == "approved"
    assert row.reviewer_user_id == reviewer.id


@pytest.mark.asyncio
async def test_artifact_approval_rejects_expired(db_session_integration):
    db = db_session_integration
    tenant, _requester, reviewer, art = await _seed_artifact(
        db, expires_at=datetime.utcnow() - timedelta(minutes=1)
    )

    with pytest.raises(HTTPException) as exc:
        await artifact_service.approve_artifact(db, tenant_id=tenant.id, artifact_id=art.id, reviewer=reviewer)
    assert exc.value.status_code == 400
    assert art.status == "pending_review"


@pytest.mark.asyncio
async def test_artifact_commit_rejects_expired_after_approval(db_session_integration):
    db = db_session_integration
    tenant, _requester, reviewer, art = await _seed_artifact(db)
    await artifact_service.approve_artifact(db, tenant_id=tenant.id, artifact_id=art.id, reviewer=reviewer)
    art.expires_at = datetime.utcnow() - timedelta(minutes=1)
    await db.flush()

    row, result, err = await artifact_service.commit_artifact(
        db, tenant_id=tenant.id, artifact_id=art.id, user=reviewer
    )
    assert row is not None and row.status == "approved"
    assert result is None
    assert err and "expired" in err.lower()
