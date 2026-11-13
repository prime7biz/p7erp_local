"""Explain route (plan 15 sections D26, 17.6, 17.8): placeholders without digits, validate_answer JSON shape,
fallback to the rule text on an invented number, timeout or empty answer; only with mfg_predictive_ai_text_v1.

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_explain.py -q
"""

from __future__ import annotations

import asyncio
import json
from datetime import date, timedelta

import pytest
from sqlalchemy import select

from app.models import AiAuditLog
from app.modules.mfg_planning import predictive_explain as px
from tests.mfg_intel_fixtures import add_order, add_plan, client_for
from tests.mfg_predictive_fixtures import API, FLAGS_P4, PRED, TODAY, freeze_today, new_predictive_tenant

URL = f"{PRED}/explain"
FLAGS = {**FLAGS_P4, "mfg_predictive_ai_text_v1": True}
PERMS = {"*": True, "ai.read": True}


class FakeLLM:
    def __init__(self, answer=None, delay: float = 0.0):
        self.answer, self.delay, self.prompts = answer, delay, []

    async def __call__(self, db, tenant_id, user_id, feature, prompt, **kw):
        self.prompts.append(prompt)
        if self.delay:
            await asyncio.sleep(self.delay)
        return self.answer(prompt) if callable(self.answer) else self.answer


def _use(monkeypatch, fake: FakeLLM) -> FakeLLM:
    monkeypatch.setattr("app.common.gemini_client.generate_text_for_tenant", fake)
    return fake


async def _setup(db, *, flags=FLAGS):
    tenant, user, fx = await new_predictive_tenant(db, flags=flags, permissions=PERMS)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=date(2030, 3, 20))
    await add_plan(db, tenant, fx.line, start=TODAY, end=TODAY + timedelta(days=10), qty="1000", order=order, ob=fx.ob)
    await db.commit()
    return tenant, user, fx, order


async def _p50(c, order_id) -> str:
    return (await c.get(f"{PRED}/orders/{order_id}/delivery-forecast")).json()["p50_date"]


@pytest.mark.asyncio
async def test_ai_text_round_trip_maps_placeholders_back(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx, order = await _setup(db)
    async with client_for(db, tenant, user) as c:
        p50 = await _p50(c, order.id)
        fake = _use(monkeypatch, FakeLLM(json.dumps({
            "summary": f"ORDER_A is likely to finish on {p50}.",
            "findings": [{"text": "ORDER_A still has 1000 pieces to sew on LINE_A.", "fact_ids": ["pieces_left"]}],
        })))
        r = await c.post(URL, json={"subject": "order", "record_id": order.id})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["source"], body["tag"], body["fallback_reason"]) == ("ai", "AI_TEXT", None)
    assert body["text"] == f"{order.order_code} is likely to finish on {p50}."
    assert body["findings"][0]["text"] == f"{order.order_code} still has 1000 pieces to sew on {fx.line.line_code}."
    prompt = fake.prompts[0]
    assert "ORDER_A" in prompt and order.order_code not in prompt and fx.customer.name not in prompt
    assert not any(tag in prompt for tag in ("P50", "P80", "P90"))
    assert '"summary"' in prompt and "fact_ids" in prompt  # the validate_answer JSON shape is requested
    audit = (await db.execute(select(AiAuditLog).where(AiAuditLog.tenant_id == tenant.id,
                                                       AiAuditLog.action == "MFG_PREDICTIVE_EXPLAIN"))).scalars().all()
    assert len(audit) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "answer, delay, reason",
    [
        (json.dumps({"summary": "ORDER_A has 999 pieces left.", "findings": [
            {"text": "ORDER_A has 999 pieces left.", "fact_ids": ["pieces_left"]}]}), 0.0, "number_not_in_facts"),
        ("not json at all", 0.0, "not_json"),
        (None, 0.0, "empty"),
        ("{}", 1.0, "timeout"),
    ],
)
async def test_fallback_to_rule_text(db_session_integration, monkeypatch, answer, delay, reason):
    db = db_session_integration
    freeze_today(monkeypatch)
    monkeypatch.setattr(px, "EXPLAIN_TIMEOUT_SECONDS", 0.05)
    tenant, user, _fx, order = await _setup(db)
    order_id, order_code = order.id, order.order_code  # a provider failure rolls the session back (objects expire)
    _use(monkeypatch, FakeLLM(answer, delay))
    async with client_for(db, tenant, user) as c:
        r = await c.post(URL, json={"subject": "order", "record_id": order_id})
    assert r.status_code == 200, r.text
    body = r.json()
    assert (body["source"], body["tag"], body["fallback_reason"]) == ("rules", "RULES", reason)
    assert body["text"] == body["rules_text"] and order_code in body["text"]
    assert body["findings"] == []
    assert any(f["id"] == "pieces_left" and f["value"] == "1000" for f in body["facts"])  # numbers unchanged


@pytest.mark.asyncio
async def test_gates_flag_cross_tenant_and_finding_subject(db_session_integration, monkeypatch):
    from app.models.mfg_predictive import MfgPredictiveFinding

    db = db_session_integration
    freeze_today(monkeypatch)
    _use(monkeypatch, FakeLLM(None))
    tenant, user, fx, order = await _setup(db, flags=FLAGS_P4)  # AI text flag off
    other, other_user, _ofx, other_order = await _setup(db)
    finding = MfgPredictiveFinding(
        tenant_id=other.id, finding_key="LINE_IDLE:line:x", kind="LINE_IDLE", severity="high", priority=3,
        line_id=_ofx.line.id, status="OPEN", first_detected_on=TODAY, last_detected_on=TODAY,
        payload={"kind_label": "Line idle", "days_affected": 4, "facts": [
            {"id": "idle_days", "label": "idle working days", "value": "4", "unit": "days"}],
            "dates": {"first_day": TODAY.isoformat()}, "recommendation": {"action": "Pull forward an order."}})
    db.add(finding)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.post(URL, json={"subject": "order", "record_id": order.id})
        assert r.status_code == 404  # mfg_predictive_ai_text_v1 off
    async with client_for(db, other, other_user) as c:
        r = await c.post(URL, json={"subject": "order", "record_id": order.id})  # tenant A's order from B
        assert r.status_code == 404 and r.json()["detail"] == "Order not found"
        r = await c.post(URL, json={"subject": "finding", "record_id": finding.id})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["dates"] == {"first affected day": TODAY.isoformat()}
        assert _ofx.line.line_code in body["text"] and body["source"] == "rules"
        assert (await c.post(URL, json={"subject": "invoice", "record_id": 1})).status_code == 422
    other.feature_flags = {**FLAGS, "ai_enabled": False}
    await db.commit()
    async with client_for(db, other, other_user) as c:
        r = await c.post(URL, json={"subject": "order", "record_id": other_order.id})
        assert r.status_code == 403  # AI policy denies
    assert API


def test_finding_prompt_never_writes_p50_style_names():
    from types import SimpleNamespace

    f = SimpleNamespace(kind="DELIVERY_RISK", severity="high", payload={
        "dates": {"p50_date": "2030-03-10", "p90_date": "2030-03-12", "target_date": "2030-03-11"},
        "facts": [{"id": "delay_days", "label": "likely delay", "value": "2", "unit": "days"}]})
    subject = px.finding_subject(f, "ORD-77", None)
    prompt = px.build_prompt(subject)
    assert "ORD-77" not in prompt and "p50" not in prompt.lower() and "likely finish date: 2030-03-10" in prompt
    ok, _ = px.validated_text(json.dumps({"summary": "ORDER_A may slip.", "findings": [
        {"text": "ORDER_A is likely 2 days late; worst case 2030-03-12.", "fact_ids": ["delay_days"]}]}), subject)
    assert ok["findings"][0]["text"] == "ORD-77 is likely 2 days late; worst case 2030-03-12."
