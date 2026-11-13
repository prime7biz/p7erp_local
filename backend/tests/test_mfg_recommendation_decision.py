"""Recommendation decisions and outcomes (plan 15 sections 5.6, 7, D21-D23, 17.9, 17.15) and the governed-AI agent.

Run: docker compose exec -T backend pytest tests/test_mfg_recommendation_decision.py -q
"""

from __future__ import annotations

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import SewingLineStyleConfig
from app.models.ai_agents import AiAgentDecision
from app.models.inventory import DeliveryChallan, DeliveryChallanOrder, PurchaseOrder
from app.models.mfg_planning import MfgPlanRevision
from app.models.mfg_predictive import MfgPredictiveFinding
from app.modules.mfg_planning import predictive_writer as w
from tests.mfg_alloc_fixtures import add_grn_line, add_po
from tests.mfg_intel_fixtures import add_order, client_for
from tests.mfg_predictive_fixtures import (
    API,
    FLAGS_P4,
    TODAY,
    add_supply_basics,
    built_finding,
    freeze_today,
    new_predictive_tenant,
)


def _url(finding_id: int) -> str:
    return f"{API}/recommendations/{finding_id}/decision"


async def _finding(db, tenant, *, kind="DELIVERY_RISK", key=None, order=None, line=None, deadline=TODAY, payload=None):
    """One OPEN finding stored directly (the daily writer would clear the others of a partial build)."""
    b = built_finding(kind, key or f"{kind}:x:{uuid.uuid4().hex[:6]}", order_id=order.id if order else None,
                      line_id=line.id if line else None, deadline=deadline, payload=payload)
    row = MfgPredictiveFinding(tenant_id=tenant.id, finding_key=b["finding_key"], kind=kind, severity=b["severity"],
                               priority=b["priority"], department=b["department"], order_id=b["order_id"],
                               line_id=b["line_id"], status="OPEN", first_detected_on=TODAY, last_detected_on=TODAY,
                               deadline_date=deadline, payload=b["payload"], alert_eligible=True)
    db.add(row)
    await db.flush()
    return row


async def _count(db, model, tenant_id) -> int:
    return (await db.execute(select(func.count()).select_from(model).where(model.tenant_id == tenant_id))).scalar()


@pytest.mark.asyncio
async def test_accept_records_decision_only_and_replay_is_idempotent(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=TODAY)
    finding = await _finding(db, tenant, order=order)
    await db.commit()
    before = [await _count(db, m, tenant.id) for m in (SewingLineStyleConfig, PurchaseOrder, MfgPlanRevision)]
    async with client_for(db, tenant, user) as c:
        r = await c.post(_url(finding.id), json={"decision": "ACCEPT", "note": "do it"})
        assert r.status_code == 200, r.text
        first = r.json()
        assert first["decision"] == "ACCEPTED" and first["replayed"] is False
        assert first["next_step"] == {"href": "/app/production/line-plan", "label": "Line plan"}
        assert first["recommendation"]["kind"] == "DELIVERY_RISK"  # copied server-side from the stored finding
        again = await c.post(_url(finding.id), json={"decision": "REJECT"})
        assert again.status_code == 200
        assert again.json()["decision_id"] == first["decision_id"] and again.json()["replayed"] is True
        assert again.json()["decision"] == "ACCEPTED"  # the stored decision wins
        bad = await c.post(_url(finding.id), json={"decision": "MAYBE"})
        assert bad.status_code == 422
        extra = await c.post(_url(finding.id), json={"decision": "ACCEPT", "payload": {"x": 1}})
        assert extra.status_code == 422  # the browser never sends the recommendation
    rows = list((await db.execute(select(AiAgentDecision).where(AiAgentDecision.tenant_id == tenant.id))).scalars())
    assert len(rows) == 1 and rows[0].finding_id == finding.id and rows[0].agent == "mfg_bottleneck"
    assert rows[0].exception_key == w.natural_key_for(finding)
    await db.refresh(finding)
    assert finding.decision_status == "ACCEPTED" and finding.alert_eligible is False
    after = [await _count(db, m, tenant.id) for m in (SewingLineStyleConfig, PurchaseOrder, MfgPlanRevision)]
    assert after == before  # no plan / PO / revision written


@pytest.mark.asyncio
async def test_unique_index_and_concurrent_double_submit(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db)
    finding = await _finding(db, tenant)
    winner = AiAgentDecision(tenant_id=tenant.id, agent="mfg_bottleneck", exception_key="k", decision="ACCEPTED",
                             decided_by=user.id, finding_id=finding.id)
    db.add(winner)
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(AiAgentDecision(tenant_id=tenant.id, agent="mfg_bottleneck", exception_key="k", decision="REJECTED",
                                   decided_by=user.id, finding_id=finding.id))
            await db.flush()
    # the other request saw no decision yet (race): the unique index makes it re-read and return the winner
    real = w._stored_decision
    calls = {"n": 0}

    async def first_miss(*a, **kw):
        calls["n"] += 1
        return None if calls["n"] == 1 else await real(*a, **kw)

    monkeypatch.setattr(w, "_stored_decision", first_miss)
    row, replayed = await w.record_decision(db, tenant_id=tenant.id, user_id=user.id, finding=finding,
                                            decision="REJECTED", note=None)
    assert replayed is True and row.id == winner.id


@pytest.mark.asyncio
async def test_permission_cross_tenant_cleared_and_flag(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db, permissions={"production.planning.read": True})
    finding = await _finding(db, tenant)
    other, other_user, _ofx = await new_predictive_tenant(db)
    foreign = await _finding(db, other)
    cleared = await _finding(db, other)
    cleared.status = "CLEARED"
    await db.commit()
    async with client_for(db, tenant, user) as c:  # no ai.agents.confirm, not admin / manager
        r = await c.post(_url(finding.id), json={"decision": "ACCEPT"})
        assert r.status_code == 403 and "ai.agents.confirm" in r.json()["detail"]
    async with client_for(db, other, other_user) as c:
        assert (await c.post(_url(finding.id), json={"decision": "ACCEPT"})).status_code == 404  # A's id from B
        assert (await c.post(_url(999999999), json={"decision": "ACCEPT"})).json() == {"detail": "Recommendation not found"}
        assert (await c.post(_url(cleared.id), json={"decision": "ACCEPT"})).status_code == 409
        assert (await c.post(_url(foreign.id), json={"decision": "REJECT"})).status_code == 200
    other.feature_flags = {"manufacturing_intelligence_v1": True}
    await db.commit()
    async with client_for(db, other, other_user) as c:
        assert (await c.post(_url(foreign.id), json={"decision": "ACCEPT"})).status_code == 404


@pytest.mark.asyncio
async def test_rbac_enforce_denials(db_session_integration):
    db = db_session_integration
    flags = {**FLAGS_P4, "rbac_enforcement": "enforce"}
    tenant, user, fx = await new_predictive_tenant(
        db, flags=flags, permissions={"production.planning.read": False, "ai.agents.confirm": True})
    finding = await _finding(db, tenant)
    t2, u2, _fx2 = await new_predictive_tenant(
        db, flags=flags,
        permissions={"production.planning.read": True, "ai.agents.confirm": True, "inventory.access": False,
                     "inventory.items.read": False})
    material = await _finding(db, t2, kind="LATE_MATERIAL")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.post(_url(finding.id), json={"decision": "ACCEPT"})).status_code == 403
    async with client_for(db, t2, u2) as c:
        r = await c.post(_url(material.id), json={"decision": "ACCEPT"})
        assert r.status_code == 403 and "inventory" in r.json()["detail"]


async def _posted_challan(db, tenant, order, day):
    dc = DeliveryChallan(tenant_id=tenant.id, challan_code=f"DC-{uuid.uuid4().hex[:8]}", customer_name="B",
                         delivery_date=day, status="POSTED")
    db.add(dc)
    await db.flush()
    db.add(DeliveryChallanOrder(tenant_id=tenant.id, delivery_challan_id=dc.id, order_id=order.id))
    await db.flush()


@pytest.mark.asyncio
async def test_outcomes_met_not_met_ignored_unknown(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db)
    past = TODAY - timedelta(days=5)
    shipped = await add_order(db, tenant, fx.customer, fx.style, status="COMPLETED", delivery=past)
    await _posted_challan(db, tenant, shipped, past - timedelta(days=1))
    late = await add_order(db, tenant, fx.customer, fx.style, delivery=past)
    met = await _finding(db, tenant, order=shipped, deadline=past)
    not_met = await _finding(db, tenant, order=late, deadline=past)
    overload_open = await _finding(db, tenant, kind="CAPACITY_OVERLOAD", line=fx.line, deadline=past)
    idle_cleared = await _finding(db, tenant, kind="LINE_IDLE", line=fx.line, deadline=past)
    idle_cleared.status, idle_cleared.cleared_on = "CLEARED", past - timedelta(days=1)
    sb = await add_supply_basics(db, tenant)
    po, line = await add_po(db, tenant, sb.vendor, sb.item, "10", status="APPROVED", expected_date=past)
    await add_grn_line(db, tenant, po, line, sb.store, received="10", accepted="10")
    from app.models.inventory import GoodsReceiving

    for g in (await db.execute(select(GoodsReceiving).where(GoodsReceiving.tenant_id == tenant.id))).scalars():
        g.received_date = past - timedelta(days=2)
    material = await _finding(db, tenant, kind="LATE_MATERIAL", order=late, deadline=past, payload={
        "material": {"po_lines": [{"po_line_id": line.id, "qty_used": "10"}]}})
    old_drop = await _finding(db, tenant, kind="OUTPUT_DROP", line=fx.line, deadline=TODAY - timedelta(days=40),
                              payload={"anomaly": {"metric": "EFFICIENCY", "latest_day": (TODAY - timedelta(days=47)).isoformat()}})
    met.decision_status = "ACCEPTED"
    await db.flush()
    counts = await w.measure_outcomes(db, tenant.id, today=TODAY)
    for r in (met, not_met, overload_open, idle_cleared, material, old_drop):
        await db.refresh(r)
    assert (met.outcome_status, not_met.outcome_status) == ("MET", "NOT_MET")
    assert (overload_open.outcome_status, idle_cleared.outcome_status) == ("NOT_MET", "MET")
    assert material.outcome_status == "MET"
    assert old_drop.outcome_status == "UNKNOWN"  # no production data by deadline + 30 days
    assert met.decision_status == "ACCEPTED" and not_met.decision_status == "IGNORED"
    assert counts["ignored"] == 5
    assert await w.measure_outcomes(db, tenant.id, today=TODAY) == {"ignored": 0, "MET": 0, "NOT_MET": 0, "UNKNOWN": 0}


@pytest.mark.asyncio
async def test_decision_refused_after_outcome_recorded_but_replay_still_works(db_session_integration):
    """Owner rule (review L3): once the outcome is measured (e.g. IGNORED after the deadline) no new decision."""
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db)
    late = await _finding(db, tenant, deadline=TODAY - timedelta(days=3))
    decided = await _finding(db, tenant, deadline=TODAY - timedelta(days=3))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        first = await c.post(_url(decided.id), json={"decision": "REJECT"})
        assert first.status_code == 200
    await w.measure_outcomes(db, tenant.id, today=TODAY)  # sets IGNORED + an outcome on `late`
    await db.commit()
    await db.refresh(late)
    assert late.decision_status == "IGNORED" and late.outcome_status is not None
    async with client_for(db, tenant, user) as c:
        r = await c.post(_url(late.id), json={"decision": "ACCEPT"})
        assert r.status_code == 409 and r.json()["detail"] == "The deadline has passed; the outcome is already recorded"
        again = await c.post(_url(decided.id), json={"decision": "ACCEPT"})
        assert again.status_code == 200 and again.json()["replayed"] is True
        assert again.json()["decision_id"] == first.json()["decision_id"]


NO_INVENTORY = {"production.access": True, "production.planning.read": True, "ai.access": True, "ai.read": True,
                "ai.agents.confirm": True, "merch.access": True, "inventory.access": False, "inventory.items.read": False}


@pytest.mark.asyncio
async def test_governed_ai_hides_material_findings_without_inventory_read(db_session_integration):
    """Review L1: governed AI applies the same inventory-read rule as /recommendations (RBAC enforce)."""
    db = db_session_integration
    flags = {**FLAGS_P4, "ai_exception_agents_enabled": True, "rbac_enforcement": "enforce"}
    tenant, user, fx = await new_predictive_tenant(db, flags=flags, permissions=NO_INVENTORY)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=TODAY)
    material = await _finding(db, tenant, kind="LATE_MATERIAL", order=order)
    delivery = await _finding(db, tenant, order=order)
    await db.commit()
    material_key, delivery_key = w.natural_key_for(material), w.natural_key_for(delivery)
    async with client_for(db, tenant, user) as c:
        body = (await c.get("/api/v1/governed-ai/exceptions")).json()
        keys = {i["key"] for i in body["items"]}
        assert delivery_key in keys and material_key not in keys
        r = await c.post("/api/v1/governed-ai/exceptions/confirm", json={"key": material_key, "decision": "dismiss"})
        assert r.status_code == 403 and "inventory" in r.json()["detail"]
    from app.models import Role

    role = await db.get(Role, user.role_id)
    role.permissions = {**NO_INVENTORY, "inventory.access": True}
    await db.commit()
    async with client_for(db, tenant, user) as c:
        keys = {i["key"] for i in (await c.get("/api/v1/governed-ai/exceptions")).json()["items"]}
        assert material_key in keys


@pytest.mark.asyncio
async def test_explain_material_403_before_daily_quota(db_session_integration, monkeypatch):
    """Review I4: the inventory 403 (and the 404 for another tenant) never consume the daily AI quota."""
    from app.modules.mfg_planning import predictive_router as pr

    db = db_session_integration
    flags = {**FLAGS_P4, "mfg_predictive_ai_text_v1": True, "rbac_enforcement": "enforce"}
    perms = {**NO_INVENTORY, "ai.tools.production.read": True}
    tenant, user, fx = await new_predictive_tenant(db, flags=flags, permissions=perms)
    material = await _finding(db, tenant, kind="LATE_MATERIAL")
    await db.commit()
    used: list[int] = []

    async def counting_quota(*, tenant_id):
        used.append(tenant_id)

    monkeypatch.setattr(pr, "enforce_ai_daily_tenant_quota", counting_quota)
    async with client_for(db, tenant, user) as c:
        r = await c.post(f"{API}/predictive/explain", json={"subject": "finding", "record_id": material.id})
        assert r.status_code == 403
        r = await c.post(f"{API}/predictive/explain", json={"subject": "order", "record_id": 999999999})
        assert r.status_code == 404
    assert used == []


@pytest.mark.asyncio
async def test_governed_ai_agent_lists_and_dismiss_rejects_finding(db_session_integration):
    db = db_session_integration
    tenant, user, fx = await new_predictive_tenant(db, flags={**FLAGS_P4, "ai_exception_agents_enabled": True})
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=TODAY)
    finding = await _finding(db, tenant, order=order, payload={
        "kind": "DELIVERY_RISK", "affected_dates": [TODAY.isoformat()], "days_affected": 2, "reason_codes": ["LATE"],
        "facts": [{"id": "p", "label": "chance", "value": "33.3", "unit": "percent"}]})
    await db.commit()
    key = w.natural_key_for(finding)
    async with client_for(db, tenant, user) as c:
        body = (await c.get("/api/v1/governed-ai/exceptions")).json()
        assert "mfg_bottleneck" in [a["id"] for a in body["agents"]]
        item = next(i for i in body["items"] if i["agent"] == "mfg_bottleneck")
        assert item["key"] == key and "33.3" not in str(item)
        assert item["href"] == f"/app/control-tower?tab=predictions&finding={finding.id}"
        r = await c.post("/api/v1/governed-ai/exceptions/confirm", json={"key": key, "decision": "dismiss"})
        assert r.status_code == 200, r.text
    await db.refresh(finding)
    assert finding.decision_status == "REJECTED"
    dismissed = (await db.execute(select(AiAgentDecision).where(AiAgentDecision.tenant_id == tenant.id))).scalar_one()
    assert dismissed.decision == "DISMISSED" and dismissed.finding_id == finding.id
    async with client_for(db, tenant, user) as c:
        r = await c.post(_url(finding.id), json={"decision": "ACCEPT"})
        assert r.status_code == 409  # already decided in AI agents
    tenant.feature_flags = {"ai_exception_agents_enabled": True, "manufacturing_intelligence_v1": True}
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get("/api/v1/governed-ai/exceptions")).json()
        assert "mfg_bottleneck" not in [a["id"] for a in body["agents"]]
