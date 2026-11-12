"""Governed finance AI agents (docs/finance-modernization/PLAN.md Phase 5, guardrails 5, 8, 9, 10).

1. The read-only exception agent `finance_exceptions` (governed_ai): needs `ai_exception_agents_enabled`,
   `finance_ai_insights_v2` and the source flag `finance_control_tower_v2`, fail-closed `ai.tools.finance.read` and the
   soft `finance.mis_report.view`. Findings are the Control Tower cards of the caller's tenant; the only action is
   acknowledge through the existing human-confirm endpoint.
2. The AI assistant tool `finance_statement_summary` (ai_tool agent catalog): same service and permissions as
   POST /finance/statements/commentary, deterministic text only, never the tenant AI provider.

Every test fails if `generate_text_for_tenant` is called.
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from sqlalchemy import func, select

from app.common.business_date import today_local
from app.common.tenant_feature_keys import AI_EXCEPTION_AGENTS_ENABLED
from app.models import Role, User
from app.models.ai_agents import AiAgentDecision
from app.models.ai_tool import AiAuditLog, AiToolInvocation
from app.models.finance import Voucher, VoucherLine
from app.models.notification import UserNotification
from app.modules.ai_tool import service as ai_tool_service
from app.modules.ai_tool.agent import catalog, loop
from app.modules.ai_tool.agent.catalog import AgentContext
from app.modules.finance.ai_insights import service as insights_service
from app.modules.finance.ai_insights.constants import REPORTS
from app.modules.finance.ai_insights.schemas import CommentaryRequest
from app.modules.finance.control.control_tower_service import build_control_tower
from app.modules.governed_ai.detectors import FINANCE_AGENT_CARDS, FINANCE_GRN_UNBILLED_DAYS
from tests.benchmark_fixtures import api_client
from tests.finance_control_fixtures import cr, dr, post_v
from tests.finance_statement_fixtures import make_ledger, seed_world
from tests.test_ai_agent_mode import agent_env, use_model  # noqa: F401  (pytest fixture + helper)

EXC_URL = "/api/v1/governed-ai/exceptions"
CONFIRM_URL = "/api/v1/governed-ai/exceptions/confirm"
COMMENTARY_URL = "/api/v1/finance/statements/commentary"
ON = {
    AI_EXCEPTION_AGENTS_ENABLED: True,
    "finance_ai_insights_v2": True,
    "finance_control_tower_v2": True,
    "finance_statements_v2": True,
    "finance_budget_analytics_v2": True,
}
NEG_CASH_KEY = "finance_exception:NEGATIVE_CASH"
PL_2026 = {"report": "profit_loss", "from_date": "2026-01-01", "to_date": "2026-12-31"}
FIN_READ = {"finance.access": True, "ai.tools.finance.read": True}


@pytest.fixture(autouse=True)
def no_provider(monkeypatch):
    """Fail the test if anything here reaches the tenant AI provider."""

    async def _forbidden(*_args, **_kwargs):
        pytest.fail("generate_text_for_tenant must not be called by the finance agents")

    monkeypatch.setattr("app.common.gemini_client.generate_text_for_tenant", _forbidden)


async def _world(db, *, negative_cash: str = "321", flags: dict | None = None):
    """seed_world tenant + admin, plus a petty cash ledger with a credit balance (one NEGATIVE_CASH row)."""
    tenant, admin, w = await seed_world(db, flags={**ON, **(flags or {})})
    petty = await make_ledger(db, tenant.id, w["groups"]["cash"], "Petty Cash")
    await post_v(db, tenant.id, date(2024, 6, 1), [dr(w["ledgers"]["rent"], negative_cash), cr(petty, negative_cash)])
    await db.commit()
    return tenant, admin, w


async def _user(db, tenant, permissions: dict, role_name: str = "clerk") -> User:
    slug = uuid.uuid4().hex[:8]
    role = Role(tenant_id=tenant.id, name=f"{role_name}{slug}", display_name=role_name.title(), permissions=permissions)
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id, role_id=role.id, username=f"fa{slug}", email=f"fa{slug}@example.com",
        password_hash="unused", is_active=True,
    )
    db.add(user)
    await db.commit()
    return user


async def _set_flags(db, tenant, **flags) -> None:
    tenant.feature_flags = {**(tenant.feature_flags or {}), **flags}
    await db.commit()
    await db.refresh(tenant)


async def _call(db, tenant, user, method: str, url: str, **kwargs):
    await db.refresh(tenant)
    await db.refresh(user)
    async with api_client(db, tenant, user) as ac:
        return await ac.request(method, url, **kwargs)


async def _finance_items(db, tenant, user) -> tuple[list[str], list[dict]]:
    r = await _call(db, tenant, user, "GET", EXC_URL)
    assert r.status_code == 200, r.text
    body = r.json()
    agents = [a["id"] for a in body["agents"]]
    return agents, [i for i in body["items"] if i["agent"] == "finance_exceptions"]


async def _count(db, model, tenant_id: int, *where) -> int:
    return (await db.execute(select(func.count()).select_from(model).where(model.tenant_id == tenant_id, *where))).scalar()


def _expected_keys(tower, as_of: date) -> set[str]:
    out = set()
    for card in tower.cards:
        if card.code not in FINANCE_AGENT_CARDS or card.count <= 0:
            continue
        if card.code == "GRN_NOT_BILLED" and (
            card.oldest_date is None or card.oldest_date > as_of - timedelta(days=FINANCE_GRN_UNBILLED_DAYS)
        ):
            continue
        out.add(f"finance_exception:{card.code}")
    return out


# ---- exception agent: flags --------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_finance_agent_needs_every_flag(db_session_integration):
    db = db_session_integration
    tenant, admin, _w = await _world(db)

    agents, items = await _finance_items(db, tenant, admin)
    assert "finance_exceptions" in agents and any(i["key"] == NEG_CASH_KEY for i in items)

    # Exception agents switched off: the whole endpoint is refused, nothing is recorded.
    await _set_flags(db, tenant, **{AI_EXCEPTION_AGENTS_ENABLED: False})
    assert (await _call(db, tenant, admin, "GET", EXC_URL)).status_code == 403
    r = await _call(db, tenant, admin, "POST", CONFIRM_URL, json={"key": NEG_CASH_KEY, "decision": "dismiss"})
    assert r.status_code == 403
    await _set_flags(db, tenant, **{AI_EXCEPTION_AGENTS_ENABLED: True})

    # Finance AI flag or its source Control Tower flag off (or not strictly true): the finance agent is hidden.
    for flag, value in (
        ("finance_ai_insights_v2", False),
        ("finance_ai_insights_v2", "true"),
        ("finance_control_tower_v2", False),
        ("finance_control_tower_v2", "true"),
    ):
        await _set_flags(db, tenant, **{flag: value})
        agents, items = await _finance_items(db, tenant, admin)
        assert "finance_exceptions" not in agents and items == [], (flag, value)
        assert {"tna_delay", "lc_expiry", "bom_shortfall"} <= set(agents)  # the other agents are unchanged
        r = await _call(db, tenant, admin, "POST", CONFIRM_URL, json={"key": NEG_CASH_KEY, "decision": "dismiss"})
        assert r.status_code == 403, (flag, value, r.text)
        await _set_flags(db, tenant, **{flag: True})

    assert await _count(db, AiAgentDecision, tenant.id) == 0


# ---- exception agent: permissions --------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_finance_agent_permissions_are_fail_closed(db_session_integration):
    db = db_session_integration
    tenant, _admin, _w = await _world(db)
    cases = (
        ({"finance.access": True, "ai.agents.confirm": True}, False),  # ai.tools.finance.read missing -> deny
        ({"finance.access": True, "ai.read": True, "ai.chat": True, "ai.agents.confirm": True}, False),
        ({**FIN_READ, "ai.tools.finance.read": False, "ai.agents.confirm": True}, False),
        ({**FIN_READ, "finance.mis_report.view": False, "ai.agents.confirm": True}, False),
        ({**FIN_READ, "ai.agents.confirm": True}, True),
        ({"finance.access": True, "ai.tools.finance.*": True, "ai.agents.confirm": True}, True),
    )
    for perms, visible in cases:
        user = await _user(db, tenant, perms)
        agents, items = await _finance_items(db, tenant, user)
        assert ("finance_exceptions" in agents) is visible, perms
        assert bool(items) is visible, perms
        if not visible:
            r = await _call(db, tenant, user, "POST", CONFIRM_URL, json={"key": NEG_CASH_KEY, "decision": "dismiss"})
            assert r.status_code == 403, (perms, r.text)
    assert await _count(db, AiAgentDecision, tenant.id) == 0

    # Enforced RBAC: finance.access false hides the agent even with the AI key.
    await _set_flags(db, tenant, rbac_enforcement="enforce")
    user = await _user(db, tenant, {"ai.access": True, "finance.access": False, "ai.tools.finance.read": True})
    agents, items = await _finance_items(db, tenant, user)
    assert "finance_exceptions" not in agents and items == []
    user = await _user(db, tenant, {"ai.access": True, **FIN_READ})
    agents, items = await _finance_items(db, tenant, user)
    assert "finance_exceptions" in agents and items


# ---- exception agent: findings = Control Tower cards of this tenant only -------------------------------------------
@pytest.mark.asyncio
async def test_findings_are_the_control_tower_cards_of_the_callers_tenant(db_session_integration):
    db = db_session_integration
    tenant_a, admin_a, _ = await _world(db, negative_cash="321")
    tenant_b, admin_b, _ = await _world(db, negative_cash="98765")

    as_of = today_local(tenant_a)
    tower_a = await build_control_tower(db, tenant_a, as_of=as_of, severity="all")
    cards_a = {c.code: c for c in tower_a.cards}
    assert cards_a["NEGATIVE_CASH"].count == 1

    _agents, items_a = await _finance_items(db, tenant_a, admin_a)
    by_key = {i["key"]: i for i in items_a}
    assert set(by_key) == _expected_keys(tower_a, as_of)
    neg = by_key[NEG_CASH_KEY]
    card = cards_a["NEGATIVE_CASH"]
    assert neg["severity"] == "high" and neg["href"] == card.href
    assert neg["title"] == f"{card.label}: 1"
    assert f"{tower_a.base_currency} 321.00" in neg["detail"]
    assert neg["suggested_action"]["type"] == "acknowledge"
    assert "assignee_user_id" not in neg
    # Nothing of tenant B reaches tenant A.
    assert all("98,765" not in i["detail"] and "98765" not in i["detail"] for i in items_a)

    _agents, items_b = await _finance_items(db, tenant_b, admin_b)
    neg_b = next(i for i in items_b if i["key"] == NEG_CASH_KEY)
    assert "98,765.00" in neg_b["detail"] and "321.00" not in neg_b["detail"]

    # A user of tenant B presented with tenant A is refused (tenant mismatch).
    assert (await _call(db, tenant_a, admin_b, "GET", EXC_URL)).status_code == 403

    # Finance findings never enter the owner brief.
    r = await _call(db, tenant_a, admin_a, "GET", "/api/v1/governed-ai/owner-brief", params={"use_ai": "false"})
    assert r.status_code == 200, r.text
    assert "Finance exceptions" not in r.json()["exception_counts"]
    assert all(h["href"] != card.href for h in r.json()["highlights"])


# ---- exception agent: acknowledge only, through the existing human confirm ----------------------------------------
@pytest.mark.asyncio
async def test_acknowledge_needs_confirm_permission_and_writes_only_the_decision(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _world(db)
    other, other_admin, _ = await _world(db, negative_cash="555")
    reader = await _user(db, tenant, FIN_READ)  # can see finance findings, has no ai.agents.confirm

    agents, items = await _finance_items(db, tenant, reader)
    assert "finance_exceptions" in agents and items
    r = await _call(db, tenant, reader, "GET", EXC_URL)
    assert r.json()["can_confirm"] is False
    r = await _call(db, tenant, reader, "POST", CONFIRM_URL, json={"key": NEG_CASH_KEY, "decision": "dismiss"})
    assert r.status_code == 403

    vouchers_before = await _count(db, Voucher, tenant.id)
    lines_before = await _count(db, VoucherLine, tenant.id)
    notes_before = await _count(db, UserNotification, tenant.id)

    # Notifying is not an action of the finance agent; a finding that is not open is refused.
    r = await _call(db, tenant, admin, "POST", CONFIRM_URL, json={"key": NEG_CASH_KEY, "decision": "notify"})
    assert r.status_code == 400
    r = await _call(db, tenant, admin, "POST", CONFIRM_URL, json={"key": "finance_exception:BUDGET_BREACH", "decision": "dismiss"})
    assert r.status_code == 409
    assert await _count(db, AiAgentDecision, tenant.id) == 0

    r = await _call(db, tenant, admin, "POST", CONFIRM_URL, json={"key": NEG_CASH_KEY, "decision": "dismiss", "note": "Known"})
    assert r.status_code == 200, r.text
    assert r.json() == {"ok": True, "decision": "DISMISSED", "recipients": 0}

    decisions = (await db.execute(select(AiAgentDecision).where(AiAgentDecision.tenant_id == tenant.id))).scalars().all()
    assert [(d.agent, d.exception_key, d.decision, d.recipients_count) for d in decisions] == [
        ("finance_exceptions", NEG_CASH_KEY, "DISMISSED", 0)
    ]
    audits = await _count(
        db, AiAuditLog, tenant.id, AiAuditLog.action == "AGENT_FINDING_DISMISSED", AiAuditLog.resource == "governed_ai.finance_exceptions"
    )
    assert audits == 1
    assert await _count(db, Voucher, tenant.id) == vouchers_before
    assert await _count(db, VoucherLine, tenant.id) == lines_before
    assert await _count(db, UserNotification, tenant.id) == notes_before

    # Hidden for this tenant only.
    _agents, items = await _finance_items(db, tenant, admin)
    assert NEG_CASH_KEY not in {i["key"] for i in items}
    _agents, other_items = await _finance_items(db, other, other_admin)
    assert NEG_CASH_KEY in {i["key"] for i in other_items}
    assert await _count(db, AiAgentDecision, other.id) == 0


# ---- assistant tool -----------------------------------------------------------------------------------------------
async def _ctx(db, tenant, user, session_owner: User | None = None) -> AgentContext:
    session = await ai_tool_service.create_session(db, tenant=tenant, user=session_owner or user, title="finance agent")
    return AgentContext(db=db, tenant=tenant, user=user, session_id=session.id, message_id=None, request_id="t")


def test_tool_report_enum_matches_the_service():
    assert catalog.FINANCE_REPORTS == REPORTS
    assert catalog.AGENT_TOOLS["finance_statement_summary"].gate == catalog.GATE_FINANCE


@pytest.mark.asyncio
async def test_tool_returns_the_deterministic_commentary_of_the_service(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _world(db)
    other, _other_admin, _ = await _world(db, negative_cash="44444")
    vouchers_before = await _count(db, Voucher, tenant.id)

    r = await _call(db, tenant, admin, "POST", COMMENTARY_URL, json={**PL_2026, "use_ai": False})
    assert r.status_code == 200, r.text
    http = r.json()

    ctx = await _ctx(db, tenant, admin)
    # A model-supplied tenant id is dropped; the session tenant is used.
    raw_args = {**PL_2026, "tenant_id": other.id}
    first, _cit = await loop.execute_tool_call(ctx, "finance_statement_summary", raw_args, timeout=30)
    second, _cit = await loop.execute_tool_call(ctx, "finance_statement_summary", raw_args, timeout=30)
    assert first.status == "SUCCESS", first.summary
    assert first.summary == http["summary"] == second.summary
    data = first.data
    assert data["source"] == "deterministic" and data["deterministic_fallback"] is False and data["reason"] is None
    assert data["findings"] == http["findings"] == second.data["findings"]
    assert "summary" not in data
    assert data["facts_total"] == len(http["facts"]) and len(data["facts"]) <= catalog.MAX_AGENT_FINANCE_FACTS
    assert {f["id"] for f in data["facts"]} <= {f["id"] for f in http["facts"]}
    cited = {fid for f in data["findings"] for fid in f["fact_ids"]}
    assert cited <= {f["id"] for f in data["facts"]}
    # Same numbers as the service itself.
    req = CommentaryRequest(report="profit_loss", from_date=date(2026, 1, 1), to_date=date(2026, 12, 31), use_ai=False)
    direct = await insights_service.build_commentary(db, tenant, admin, req, audit=False)
    assert direct.summary == first.summary

    # Read-only: no voucher written; tool calls are recorded like every other agent tool.
    assert await _count(db, Voucher, tenant.id) == vouchers_before
    inv = (
        await db.execute(
            select(AiToolInvocation.status).where(
                AiToolInvocation.tenant_id == tenant.id, AiToolInvocation.tool_name == "finance_statement_summary"
            )
        )
    ).scalars().all()
    assert inv == ["SUCCESS", "SUCCESS"]


@pytest.mark.asyncio
async def test_tool_respects_flags_and_permissions(db_session_integration):
    db = db_session_integration
    tenant, admin, _ = await _world(db)

    async def run(user, args=None) -> dict:
        ctx = await _ctx(db, tenant, user, session_owner=admin)
        return await catalog._finance_statement_summary(ctx, dict(args or PL_2026))

    assert "blocked" not in await run(admin)

    # Flags: the finance AI flag and each report's own source flag.
    for flag, value, report in (
        ("finance_ai_insights_v2", False, "profit_loss"),
        ("finance_ai_insights_v2", "true", "profit_loss"),
        ("finance_statements_v2", False, "profit_loss"),
        ("finance_budget_analytics_v2", False, "expense_analysis"),
        ("finance_control_tower_v2", False, "control_tower"),
    ):
        await _set_flags(db, tenant, **{flag: value})
        out = await run(admin, {**PL_2026, "report": report})
        assert out.get("blocked") is True and out["data"] == {}, (flag, value, report)
        await _set_flags(db, tenant, **{flag: True})

    # Permissions: ai.tools.finance.read is fail closed, finance.mis_report.view false denies.
    for perms, allowed in (
        ({"finance.access": True, "ai.read": True}, False),
        ({**FIN_READ, "ai.tools.finance.read": False}, False),
        ({**FIN_READ, "finance.mis_report.view": False}, False),
        (FIN_READ, True),
    ):
        user = await _user(db, tenant, perms)
        out = await run(user)
        assert (out.get("blocked") is not True) is allowed, (perms, out["summary"])
        if not allowed:
            assert out["data"] == {}
        # The agent loop refuses the same way (gate first, then the commentary checks).
        ctx = await _ctx(db, tenant, user, session_owner=admin)
        result, _ = await loop.execute_tool_call(ctx, "finance_statement_summary", PL_2026, timeout=30)
        assert (result.status == "SUCCESS") is allowed, (perms, result.status, result.summary)

    # Invalid arguments are answered, never raised.
    out = await run(admin, {"report": "general_ledger"})
    assert "report must be one of" in out["summary"] and out["data"] == {}
    out = await run(admin, {"report": "profit_loss", "from_date": "not-a-date"})
    assert out["summary"].startswith("Invalid arguments") and out["data"] == {}
    out = await run(admin, {"report": "profit_loss", "from_date": "2026-12-31", "to_date": "2026-01-01"})
    assert out["data"] == {} and "blocked" not in out


@pytest.mark.asyncio
async def test_agent_loop_can_use_the_finance_tool(db_session_integration, agent_env, monkeypatch):  # noqa: F811
    db = db_session_integration
    tenant, admin, _ = await _world(db, flags={"ai_agent_mode_enabled": True})
    fake = use_model(monkeypatch, [{"tools": [("finance_statement_summary", PL_2026)]}, {"text": "Profit is in the report."}])

    session = await ai_tool_service.create_session(db, tenant=tenant, user=admin, title="agent finance")
    resp = await ai_tool_service.process_prompt(db, tenant=tenant, user=admin, session_id=session.id, prompt="How was profit in 2026?")

    result = next(r for r in resp.tool_results if r.tool_name == "finance_statement_summary")
    assert result.status == "SUCCESS" and result.data["source"] == "deterministic"
    messages = fake.tool_messages()
    assert len(messages) == 1 and '"status": "SUCCESS"' in messages[0] and '"fact_ids"' in messages[0]
    assert "finance_statement_summary" in {t["function"]["name"] for t in fake.bodies[0]["tools"]}
    assert agent_env == []
