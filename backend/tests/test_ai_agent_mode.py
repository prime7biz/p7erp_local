"""AI chat agent mode: tool loop, tenant isolation, fail-closed permissions, savepoints, fallback, history.

The OpenRouter call (``loop._post_chat``) is replaced by a scripted fake, so no network is used.

Run:
docker compose exec backend pytest -q tests/test_ai_agent_mode.py
"""

from __future__ import annotations

import dataclasses
import json
import uuid
from datetime import date
from typing import Any

import pytest
from sqlalchemy import func, select, text

from app.config import get_settings
from app.models import User
from app.models.ai_tool import AiAuditLog, AiMessage, AiPermissionPolicy, AiToolInvocation
from app.models.finance import Voucher
from app.modules.ai_tool import service
from app.modules.ai_tool.agent import catalog, loop
from app.modules.ai_tool.agent.catalog import AgentContext
from app.modules.ai_tool.agent.history import load_recent_history
from app.modules.ai_tool.repository import create_message
from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import _create_role_for_tenant, create_customer, create_garment_style, create_quotation_and_order

LEGACY_TEXT = "LEGACY-PIPELINE-ANSWER"


class FakeModel:
    """Plays back scripted chat/completions responses and records every request body."""

    def __init__(self, script: list[Any]):
        self.script = list(script)
        self.bodies: list[dict[str, Any]] = []

    async def __call__(self, body: dict[str, Any], *, timeout: float) -> dict[str, Any]:
        self.bodies.append(json.loads(json.dumps(body, default=str)))
        step = self.script.pop(0) if self.script else {"text": "done"}
        if isinstance(step, Exception):
            raise step
        if "tools" in step:
            calls = [
                {
                    "id": f"call_{i}_{uuid.uuid4().hex[:6]}",
                    "type": "function",
                    "function": {
                        "name": name,
                        "arguments": args if isinstance(args, str) else json.dumps(args),
                    },
                }
                for i, (name, args) in enumerate(step["tools"])
            ]
            msg: dict[str, Any] = {"role": "assistant", "content": None, "tool_calls": calls}
        else:
            msg = {"role": "assistant", "content": step["text"]}
        return {"choices": [{"message": msg}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}}

    def tool_messages(self) -> list[str]:
        if not self.bodies:
            return []
        return [m["content"] for m in self.bodies[-1]["messages"] if m.get("role") == "tool"]

    def all_text(self) -> str:
        return json.dumps(self.bodies)


@pytest.fixture
def agent_env(monkeypatch):
    """Agent configured with a paid model; legacy LLM calls replaced by fakes."""
    s = get_settings()
    monkeypatch.setattr(s, "openrouter_enabled", True)
    monkeypatch.setattr(s, "openrouter_api_key", "test-key")
    monkeypatch.setattr(s, "openrouter_model", "google/gemma-4-31b-it:free")
    monkeypatch.setattr(s, "ai_agent_model", "google/gemini-2.5-flash")
    monkeypatch.setattr(s, "ai_agent_allow_free_model", False)
    monkeypatch.setattr(s, "ai_agent_max_steps", 6)
    monkeypatch.setattr(s, "ai_agent_timeout_seconds", 35)
    legacy_calls: list[str] = []

    async def fake_triage(prompt, *, tenant=None):
        legacy_calls.append("triage")
        return "", None

    async def fake_compose(user_prompt, tool_results, intent, blocked, *, tenant=None, screen_ctx=None):
        legacy_calls.append("compose")
        return LEGACY_TEXT

    monkeypatch.setattr(service, "_run_tier1_triage", fake_triage)
    monkeypatch.setattr(service, "_assistant_text_with_llm", fake_compose)
    return legacy_calls


def use_model(monkeypatch, script: list[Any]) -> FakeModel:
    fake = FakeModel(script)
    monkeypatch.setattr(loop, "_post_chat", fake)
    return fake


async def _enable_agent(db, tenant, **extra_flags) -> None:
    tenant.feature_flags = {**(tenant.feature_flags or {}), "ai_agent_mode_enabled": True, **extra_flags}
    await db.flush()


async def _user_with_role(db, tenant, *, role_name: str, permissions: dict) -> User:
    slug = uuid.uuid4().hex[:8]
    role = await _create_role_for_tenant(
        db, tenant_id=tenant.id, name=role_name, display_name=role_name.title(), permissions=permissions
    )
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"agt{slug}",
        email=f"agt{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _ask(db, tenant, user, prompt: str, session_id: int | None = None):
    if session_id is None:
        session = await service.create_session(db, tenant=tenant, user=user, title="agent test")
        session_id = session.id
    return await service.process_prompt(db, tenant=tenant, user=user, session_id=session_id, prompt=prompt)


async def _order_setup(db, tenant):
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    return customer, order


def _results_by_tool(response) -> dict[str, Any]:
    return {r.tool_name: r for r in response.tool_results}


# --- happy path -----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_agent_calls_tools_and_answers_with_citations(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    _customer, order = await _order_setup(db, tenant)
    await _enable_agent(db, tenant)
    fake = use_model(
        monkeypatch,
        [
            {"tools": [("search_sales_orders", {"focus": order.order_code}), ("get_record_summary", {"record_type": "order", "record_id": order.id})]},
            {"text": f"**{order.order_code}** is NEW. [Open]( /app/orders/{order.id})"},
        ],
    )

    resp = await _ask(db, tenant, user, "What is the status of my latest order?")

    assert resp.assistant_message.content.startswith(f"**{order.order_code}**")
    meta = resp.assistant_message.content_json or {}
    assert meta["mode"] == "agent"
    assert meta["agent"]["tool_calls"] == 2
    by_tool = _results_by_tool(resp)
    assert by_tool["search_sales_orders"].status == "SUCCESS"
    assert by_tool["get_record_summary"].status == "SUCCESS"
    assert any(c.href == f"/app/orders/{order.id}" for c in resp.citations)
    # The tool results went back to the model, and the tool list offered to it has no write tools.
    assert any(order.order_code in m for m in fake.tool_messages())
    offered = {t["function"]["name"] for t in fake.bodies[0]["tools"]}
    assert offered == set(catalog.AGENT_TOOLS)
    assert not offered & {"create_financial_voucher", "create_sales_inquiry", "process_goods_receipt", "calendar_manage"}
    # Telemetry and audit rows.
    inv = (
        await db.execute(select(AiToolInvocation).where(AiToolInvocation.tenant_id == tenant.id, AiToolInvocation.tool_name == "get_record_summary"))
    ).scalars().all()
    assert inv and inv[0].status == "SUCCESS" and inv[0].invocation_code.startswith("AGT-")
    audits = (
        await db.execute(select(func.count()).select_from(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id, AiAuditLog.action == "AGENT_TOOL_CALL"))
    ).scalar()
    assert audits == 2
    assert agent_env == []


@pytest.mark.asyncio
async def test_flag_off_uses_legacy_pipeline(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    fake = use_model(monkeypatch, [{"text": "should not be used"}])

    resp = await _ask(db, tenant, user, "show delayed orders")

    assert fake.bodies == []
    assert (resp.assistant_message.content_json or {}).get("mode") != "agent"
    assert resp.assistant_message.content == LEGACY_TEXT


@pytest.mark.asyncio
async def test_ai_disabled_tenant_never_runs_agent(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, _user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant, ai_enabled=False)
    assert loop.agent_mode_ready(tenant) is False


# --- tenant isolation -----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_other_tenants_record_is_not_found(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    other_tenant, _other_user, _ = await create_admin_tenant_with_user(db)
    _c, foreign_order = await _order_setup(db, other_tenant)
    await _enable_agent(db, tenant)
    fake = use_model(
        monkeypatch,
        [
            {
                "tools": [
                    ("get_record_summary", {"record_type": "order", "record_id": foreign_order.id}),
                    ("search_sales_orders", {"focus": foreign_order.order_code, "tenant_id": other_tenant.id}),
                    ("search_records", {"query": foreign_order.order_code, "tenant_id": other_tenant.id}),
                ]
            },
            {"text": "Not found."},
        ],
    )

    resp = await _ask(db, tenant, user, f"Tell me about order {foreign_order.order_code}")

    by_tool = _results_by_tool(resp)
    assert by_tool["get_record_summary"].summary == "Record not found."
    assert by_tool["search_sales_orders"].data.get("items") == []
    assert by_tool["search_records"].data.get("groups") == []
    # Nothing from the other tenant reached the model (its order code appears only in the user's own question).
    assert all(foreign_order.order_code not in m for m in fake.tool_messages())
    assert resp.citations == []


def test_model_supplied_tenant_id_is_dropped():
    args, err = catalog.parse_tool_arguments('{"focus": "x", "tenant_id": 999}')
    assert err is None and args == {"focus": "x"}
    assert catalog.parse_tool_arguments("{bad json")[0] is None
    assert catalog.parse_tool_arguments("[1, 2]")[0] is None


# --- permissions ----------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_finance_and_hr_are_fail_closed_for_non_manager(db_session_integration, agent_env, monkeypatch):
    """RBAC enforcement off (default): a plain AI user still cannot reach finance or HR data."""
    db = db_session_integration
    tenant, _admin, _ = await create_admin_tenant_with_user(db)
    _c, order = await _order_setup(db, tenant)
    voucher = Voucher(
        tenant_id=tenant.id,
        voucher_number=f"JV-{uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        voucher_date=date(2026, 11, 1),
        status="SUBMITTED",
    )
    db.add(voucher)
    await db.flush()
    analyst = await _user_with_role(db, tenant, role_name="analyst", permissions={"ai.read": True})
    await _enable_agent(db, tenant)
    fake = use_model(
        monkeypatch,
        [
            {
                "tools": [
                    ("get_financial_summary", {}),
                    ("get_record_summary", {"record_type": "voucher", "record_id": voucher.id}),
                    ("analyze_structured_metrics", {"metric_type": "finance_exceptions"}),
                    ("get_pending_approvals", {}),
                    ("search_records", {"query": voucher.voucher_number}),
                    ("get_record_summary", {"record_type": "order", "record_id": order.id}),
                ]
            },
            {"text": "Some data is not available to you."},
        ],
    )

    resp = await _ask(db, tenant, analyst, "How are our finances and approvals?")

    results = resp.tool_results
    assert results[0].tool_name == "get_financial_summary" and results[0].status == "BLOCKED"
    assert results[1].summary == "Record not found."
    assert results[2].status == "BLOCKED"
    approvals = results[3].data
    assert "vouchers" not in approvals and "leave_requests" not in approvals and "payroll_approvals" not in approvals
    assert results[4].data.get("groups") == []
    assert results[5].status == "SUCCESS" and results[5].data["record_id"] == order.id
    assert voucher.voucher_number not in "".join(fake.tool_messages())


@pytest.mark.asyncio
async def test_search_kind_gates_follow_fail_closed_keys(db_session_integration):
    db = db_session_integration
    tenant, _admin, _ = await create_admin_tenant_with_user(db)
    analyst = await _user_with_role(db, tenant, role_name="analyst", permissions={"ai.read": True})
    ctx = AgentContext(db=db, tenant=tenant, user=analyst, session_id=0, message_id=None, request_id="t")
    gates = catalog.SEARCH_KIND_GATES
    assert await catalog.gate_allowed(ctx, "search_records", gates["order"]) is True
    assert await catalog.gate_allowed(ctx, "search_records", gates["item"]) is True
    assert await catalog.gate_allowed(ctx, "search_records", gates["voucher"]) is False
    assert await catalog.gate_allowed(ctx, "search_records", gates["employee"]) is False


@pytest.mark.asyncio
async def test_enforced_rbac_module_access_blocks_tool(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, _admin, _ = await create_admin_tenant_with_user(db)
    user = await _user_with_role(
        db,
        tenant,
        role_name="analyst",
        permissions={"ai.read": True, "ai.tools.finance.read": True, "merch.access": True, "finance.access": False},
    )
    await _enable_agent(db, tenant, rbac_enforcement="enforce")
    use_model(monkeypatch, [{"tools": [("get_financial_summary", {}), ("search_sales_orders", {"focus": "orders"})]}, {"text": "ok"}])

    resp = await _ask(db, tenant, user, "finance and orders please")

    by_tool = _results_by_tool(resp)
    assert by_tool["get_financial_summary"].status == "BLOCKED"
    assert by_tool["search_sales_orders"].status == "SUCCESS"


@pytest.mark.asyncio
async def test_ai_permission_policy_deny_blocks_tool(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    db.add(AiPermissionPolicy(tenant_id=tenant.id, module="*", tool_name="search_sales_orders", action="deny", priority=10))
    await _enable_agent(db, tenant)
    use_model(monkeypatch, [{"tools": [("search_sales_orders", {"focus": "late"})]}, {"text": "blocked"}])

    resp = await _ask(db, tenant, user, "late orders?")

    assert _results_by_tool(resp)["search_sales_orders"].status == "BLOCKED"


@pytest.mark.asyncio
async def test_write_unknown_and_malformed_tool_calls_are_refused(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant)
    before = (await db.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant.id))).scalar()
    use_model(
        monkeypatch,
        [
            {
                "tools": [
                    ("create_financial_voucher", {"amount": "100"}),
                    ("calendar_manage", {"focus": "add holiday"}),
                    ("get_dashboard_summary", "{not json"),
                ]
            },
            {"text": "I cannot change data."},
        ],
    )

    resp = await _ask(db, tenant, user, "Create a voucher for 100")

    statuses = [(r.tool_name, r.status) for r in resp.tool_results]
    assert statuses == [
        ("create_financial_voucher", "BLOCKED"),
        ("calendar_manage", "BLOCKED"),
        ("get_dashboard_summary", "FAILED"),
    ]
    after = (await db.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant.id))).scalar()
    assert after == before


# --- transaction safety, limits, fallback ---------------------------------------------------


@pytest.mark.asyncio
async def test_tool_db_error_rolls_back_only_its_savepoint(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant)

    async def broken(ctx, args):
        await ctx.db.execute(text("SELECT * FROM table_that_does_not_exist_p7"))
        return {}

    bad_tool = dataclasses.replace(catalog.AGENT_TOOLS["get_dashboard_summary"], handler=broken)
    monkeypatch.setitem(catalog.AGENT_TOOLS, "get_dashboard_summary", bad_tool)
    use_model(monkeypatch, [{"tools": [("get_dashboard_summary", {}), ("search_sales_orders", {"focus": "orders"})]}, {"text": "Partial answer."}])

    resp = await _ask(db, tenant, user, "dashboard and orders")

    by_tool = _results_by_tool(resp)
    assert by_tool["get_dashboard_summary"].status == "FAILED"
    assert by_tool["search_sales_orders"].status == "SUCCESS"
    await db.commit()
    msgs = (
        await db.execute(select(AiMessage.role).where(AiMessage.session_id == resp.session.id).order_by(AiMessage.message_index))
    ).scalars().all()
    assert msgs == ["user", "assistant"]
    failed = (
        await db.execute(
            select(AiToolInvocation.status).where(
                AiToolInvocation.session_id == resp.session.id, AiToolInvocation.tool_name == "get_dashboard_summary"
            )
        )
    ).scalars().all()
    assert failed == ["FAILED"]


@pytest.mark.asyncio
async def test_slow_tool_is_stopped_by_statement_timeout_and_setting_restored(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant)
    monkeypatch.setattr(get_settings(), "ai_timeout_chat_seconds", 1)
    before = (await db.execute(text("SHOW statement_timeout"))).scalar()

    async def slow(ctx, args):
        await ctx.db.execute(text("SELECT pg_sleep(3)"))
        return {"summary": "never"}

    monkeypatch.setitem(catalog.AGENT_TOOLS, "get_dashboard_summary", dataclasses.replace(catalog.AGENT_TOOLS["get_dashboard_summary"], handler=slow))
    use_model(monkeypatch, [{"tools": [("get_dashboard_summary", {})]}, {"text": "The dashboard is slow right now."}])

    resp = await _ask(db, tenant, user, "dashboard")

    result = _results_by_tool(resp)["get_dashboard_summary"]
    assert result.status == "FAILED" and result.error == "Timed out."
    assert (resp.assistant_message.content_json or {})["mode"] == "agent"
    assert (await db.execute(text("SHOW statement_timeout"))).scalar() == before
    assert await service._session_still_usable(db) is True


@pytest.mark.asyncio
async def test_aborted_transaction_is_detected(db_session_integration):
    db = db_session_integration
    assert await service._session_still_usable(db) is True
    with pytest.raises(Exception):
        await db.execute(text("SELECT * FROM table_that_does_not_exist_p7"))
    assert await service._session_still_usable(db) is False
    await db.rollback()


@pytest.mark.asyncio
async def test_note_and_help_sources_follow_fail_closed_keys(db_session_integration):
    db = db_session_integration
    tenant, _admin, _ = await create_admin_tenant_with_user(db)
    analyst = await _user_with_role(db, tenant, role_name="analyst", permissions={"ai.read": True})
    ctx = AgentContext(db=db, tenant=tenant, user=analyst, session_id=0, message_id=None, request_id="t")
    assert await catalog.gate_allowed(ctx, "search_notes", catalog.source_gate("merch")) is True
    assert await catalog.gate_allowed(ctx, "search_notes", catalog.source_gate("knowledge")) is True
    assert await catalog.gate_allowed(ctx, "search_notes", catalog.source_gate("hr")) is False
    assert await catalog.gate_allowed(ctx, "search_help_articles", catalog.source_gate("finance")) is False


@pytest.mark.asyncio
async def test_step_limit_falls_back_to_legacy(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant)
    monkeypatch.setattr(get_settings(), "ai_agent_max_steps", 2)
    fake = use_model(monkeypatch, [{"tools": [("get_dashboard_summary", {})]}] * 5)

    resp = await _ask(db, tenant, user, "show delayed orders")

    assert len(fake.bodies) == 2
    assert resp.assistant_message.content == LEGACY_TEXT
    assert (resp.assistant_message.content_json or {}).get("mode") != "agent"
    fallback = (
        await db.execute(select(func.count()).select_from(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id, AiAuditLog.action == "AGENT_FALLBACK"))
    ).scalar()
    assert fallback == 1


@pytest.mark.asyncio
async def test_provider_error_falls_back_and_slow_fallback_skips_llm(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant)
    monkeypatch.setattr(service, "AGENT_FAST_FALLBACK_AFTER_SECONDS", -1.0)
    use_model(monkeypatch, [RuntimeError("HTTP 500")])

    resp = await _ask(db, tenant, user, "show delayed orders")

    assert (resp.assistant_message.content_json or {}).get("mode") != "agent"
    # The fallback ran the plain rule-based reply: no extra LLM calls.
    assert agent_env == []
    assert resp.assistant_message.content != LEGACY_TEXT


def test_free_model_is_skipped_unless_allowed(monkeypatch):
    s = get_settings()
    monkeypatch.setattr(s, "openrouter_enabled", True)
    monkeypatch.setattr(s, "openrouter_api_key", "k")
    monkeypatch.setattr(s, "openrouter_model", "google/gemma-4-31b-it:free")
    monkeypatch.setattr(s, "ai_agent_model", "")
    monkeypatch.setattr(s, "ai_agent_allow_free_model", False)
    assert loop.resolve_agent_model() is None
    monkeypatch.setattr(s, "ai_agent_allow_free_model", True)
    assert loop.resolve_agent_model() == "google/gemma-4-31b-it:free"
    monkeypatch.setattr(s, "ai_agent_model", "google/gemini-2.5-flash")
    assert loop.resolve_agent_model() == "google/gemini-2.5-flash"
    monkeypatch.setattr(s, "openrouter_api_key", "")
    assert loop.resolve_agent_model() is None


# --- history and redaction ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_history_is_newest_ten_in_order_without_current_message(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    session = await service.create_session(db, tenant=tenant, user=user, title="h")
    other = await service.create_session(db, tenant=tenant, user=user, title="other")
    await create_message(db, tenant_id=tenant.id, session_id=other.id, sender_user_id=user.id, role="user", content="OTHER SESSION")
    for i in range(14):
        role = "user" if i % 2 == 0 else "assistant"
        await create_message(db, tenant_id=tenant.id, session_id=session.id, sender_user_id=None, role=role, content=f"m{i}")
    current = await create_message(db, tenant_id=tenant.id, session_id=session.id, sender_user_id=user.id, role="user", content="CURRENT")

    hist = await load_recent_history(db, tenant_id=tenant.id, session_id=session.id, exclude_message_id=current.id)

    assert [h["content"] for h in hist] == [f"m{i}" for i in range(4, 14)]
    assert all(h["content"] not in ("CURRENT", "OTHER SESSION") for h in hist)
    other_tenant, _u, _ = await create_admin_tenant_with_user(db)
    assert await load_recent_history(db, tenant_id=other_tenant.id, session_id=session.id, exclude_message_id=None) == []


@pytest.mark.asyncio
async def test_follow_up_sends_history_and_redacts_pii(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant)
    use_model(monkeypatch, [{"text": "First answer for buyer@example.com"}])
    first = await _ask(db, tenant, user, "Orders for buyer@example.com, phone 555-123-4567?")
    fake = use_model(monkeypatch, [{"text": "Second answer"}])

    await _ask(db, tenant, user, "and last month?", session_id=first.session.id)

    sent = fake.bodies[0]["messages"]
    roles = [m["role"] for m in sent]
    assert roles == ["system", "user", "assistant", "user"]
    assert sent[-1]["content"] == "and last month?"
    text_sent = fake.all_text()
    assert "buyer@example.com" not in text_sent and "555-123-4567" not in text_sent
    assert "[EMAIL_REDACTED]" in text_sent


@pytest.mark.asyncio
async def test_tool_results_are_redacted_before_reaching_model(db_session_integration, agent_env, monkeypatch):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await _enable_agent(db, tenant)

    async def leaky(ctx, args):
        return {"summary": "contact", "data": {"email": "secret.person@example.com"}}

    monkeypatch.setitem(
        catalog.AGENT_TOOLS, "get_dashboard_summary", dataclasses.replace(catalog.AGENT_TOOLS["get_dashboard_summary"], handler=leaky)
    )
    fake = use_model(monkeypatch, [{"tools": [("get_dashboard_summary", {})]}, {"text": "ok"}])

    await _ask(db, tenant, user, "dashboard")

    assert "secret.person@example.com" not in fake.all_text()
    assert any("[EMAIL_REDACTED]" in m for m in fake.tool_messages())
