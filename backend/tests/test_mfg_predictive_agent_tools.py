"""Phase 4 AI agent read tools (plan 15 sections D27, 17.7): flag filtering, handler re-check, inventory gate.

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_agent_tools.py -q
"""

from __future__ import annotations

import pytest

from app.models.mfg_predictive import MfgPredictiveFinding
from app.modules.ai_tool.agent import catalog
from app.modules.ai_tool.agent.catalog import AgentContext
from tests.mfg_predictive_fixtures import FLAGS_P4, TODAY, new_predictive_tenant

BOTH = {**FLAGS_P4, "mfg_predictive_ai_text_v1": True}


def _ctx(db, tenant, user) -> AgentContext:
    return AgentContext(db=db, tenant=tenant, user=user, session_id=0, message_id=None, request_id="t")


@pytest.mark.parametrize(
    "flags, offered",
    [
        ({}, False),
        (FLAGS_P4, False),
        ({"mfg_predictive_ai_text_v1": True, "manufacturing_intelligence_v1": True}, False),
        ({"mfg_predictive_intelligence_v1": True, "mfg_predictive_ai_text_v1": True}, False),  # needs MI too
        (BOTH, True),
    ],
)
def test_tool_specs_filter(flags, offered):
    from app.models import Tenant

    names = {t["function"]["name"] for t in catalog.openai_tool_specs(Tenant(feature_flags=flags))}
    assert (catalog.MFG_PREDICTIVE_TOOL_NAMES <= names) is offered
    assert not (catalog.MFG_PREDICTIVE_TOOL_NAMES & names) or offered
    assert not catalog.MFG_PREDICTIVE_TOOL_NAMES & {t["function"]["name"] for t in catalog.openai_tool_specs()}


@pytest.mark.asyncio
async def test_handlers_refuse_when_flags_off(db_session_integration):
    db = db_session_integration
    tenant, user, _fx = await new_predictive_tenant(db, flags=FLAGS_P4)
    for name in catalog.MFG_PREDICTIVE_TOOL_NAMES:
        out = await catalog.AGENT_TOOLS[name].handler(_ctx(db, tenant, user), {})
        assert out["blocked"] is True and out["summary"].startswith("FEATURE_DISABLED")


@pytest.mark.asyncio
async def test_inventory_gate_hides_po_detail_and_supplier_tool(db_session_integration):
    db = db_session_integration
    flags = {**BOTH, "rbac_enforcement": "enforce"}
    tenant, user, fx = await new_predictive_tenant(
        db, flags=flags,
        permissions={"production.access": True, "production.planning.read": True, "ai.tools.production.read": True,
                     "inventory.access": False, "inventory.items.read": False, "ai.tools.inventory.read": False})
    db.add(MfgPredictiveFinding(
        tenant_id=tenant.id, finding_key="LATE_MATERIAL:order:x", kind="LATE_MATERIAL", severity="high", priority=5,
        status="OPEN", first_detected_on=TODAY, last_detected_on=TODAY,
        payload={"kind": "LATE_MATERIAL", "material": {"po_lines": [{"po_line_id": 7, "qty_used": "5"}]}}))
    db.add(MfgPredictiveFinding(
        tenant_id=tenant.id, finding_key="LINE_IDLE:line:x", kind="LINE_IDLE", severity="medium", priority=1,
        status="OPEN", first_detected_on=TODAY, last_detected_on=TODAY,
        payload={"kind": "LINE_IDLE", "subject": {"vendor_name": "Secret Mills Ltd", "line_code": "L1"}}))
    await db.flush()
    ctx = _ctx(db, tenant, user)
    out = await catalog.AGENT_TOOLS["mfg_bottlenecks"].handler(ctx, {})
    # review L2: LATE_MATERIAL items are left out entirely without the inventory gate (same rule as /recommendations)
    assert [i["kind"] for i in out["data"]["items"]] == ["LINE_IDLE"]
    assert "Secret Mills" not in str(out)  # review I3: no vendor names to the external model
    only_material = await catalog.AGENT_TOOLS["mfg_bottlenecks"].handler(ctx, {"kind": "LATE_MATERIAL"})
    assert only_material["data"]["items"] == []
    blocked = await catalog.AGENT_TOOLS["mfg_supplier_lateness"].handler(ctx, {})
    assert blocked["blocked"] is True
    bad = await catalog.AGENT_TOOLS["mfg_bottlenecks"].handler(ctx, {"kind": "SALARY"})
    assert "kind must be one of" in bad["summary"]


@pytest.mark.asyncio
async def test_supplier_tool_sends_vendor_codes_not_names(db_session_integration, monkeypatch):
    """Review I3: the agent tool result has vendor codes (or V-<id>); the REST endpoint keeps names."""
    from tests.mfg_alloc_fixtures import add_vendor
    from tests.mfg_predictive_fixtures import add_late_history, add_supply_basics

    db = db_session_integration
    tenant, user, _fx = await new_predictive_tenant(db, flags=BOTH,
                                                    permissions={"*": True, "ai.tools.inventory.read": True})
    sb = await add_supply_basics(db, tenant)
    sb.vendor.name = "Secret Mills Ltd"
    nocode = await add_vendor(db, tenant)
    nocode.name, nocode.vendor_code = "Hidden Trims", ""
    await add_late_history(db, tenant, sb, [1, 2, 3])
    await add_late_history(db, tenant, sb, [4, 5], vendor=nocode)
    await db.flush()
    monkeypatch.setattr("app.common.business_date.today_local", lambda _t=None: TODAY)
    out = await catalog.AGENT_TOOLS["mfg_supplier_lateness"].handler(_ctx(db, tenant, user), {})
    text = str(out)
    assert "vendors" in out["data"], out
    assert "Secret Mills" not in text and "Hidden Trims" not in text and "vendor_name" not in text
    codes = {v["vendor_id"]: v["vendor_code"] for v in out["data"]["vendors"]}
    assert codes == {sb.vendor.id: sb.vendor.vendor_code, nocode.id: f"V-{nocode.id}"}
