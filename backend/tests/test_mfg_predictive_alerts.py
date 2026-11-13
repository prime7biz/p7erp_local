"""Phase 4 alerts (plan 15 sections 8, D20, 17.3, 17.4, 17.5): the 15-minute scan mirrors only eligible OPEN
findings, minimal content, no re-open after a person closes an alert (unless it escalates), stale and flag-off
cleanup by the job and by Settings.

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_alerts.py -q
"""

from __future__ import annotations

from datetime import timedelta

import pytest
from sqlalchemy import select

from app.models import AlertInstance, AuditLog
from app.models.mfg_predictive import MfgPredictiveFinding
from app.modules.merch.alert_engine import run_scan
from app.modules.merch.alert_rules import DEFAULT_DEFINITIONS, RULE_REGISTRY
from app.modules.mfg_planning import predictive_writer as w
from app.workers import mfg_predictive_worker as worker
from tests.bd_hr_fixtures import api_client
from tests.mfg_intel_fixtures import add_order
from tests.mfg_predictive_fixtures import FLAGS_P4, TODAY, built_finding, new_predictive_tenant

MFG_KEYS = set(w.MFG_RULE_KEYS)
P4_OFF = "mfg_predictive_intelligence_v1"
ALLOWED_FACT_KEYS = {"kind", "severity", "order_code", "line_code", "affected_dates", "days_affected", "reason_codes",
                     "href"}


async def _mfg_alerts(db, tenant_id):
    return list((await db.execute(select(AlertInstance).where(
        AlertInstance.tenant_id == tenant_id, AlertInstance.alert_type.in_(MFG_KEYS)).order_by(AlertInstance.id))).scalars())


async def _seed(db, *, flags=None, eligible=2, extra=1):
    tenant, user, fx = await new_predictive_tenant(db, flags=flags)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=TODAY + timedelta(days=5))
    built = [
        built_finding("DELIVERY_RISK", f"DELIVERY_RISK:order:{order.id}", order_id=order.id, priority="50",
                      deadline=TODAY + timedelta(days=5),
                      payload={"kind": "DELIVERY_RISK", "affected_dates": [TODAY.isoformat()], "days_affected": 4,
                               "reason_codes": ["LATE"], "facts": [{"id": "on_time_probability", "label": "chance",
                                                                    "value": "12.5", "unit": "percent"}],
                               "material": {"po_lines": [{"po_line_id": 1, "qty_used": "5"}]}}),
        built_finding("CAPACITY_OVERLOAD", f"CAPACITY_OVERLOAD:line:{fx.line.id}", line_id=fx.line.id, priority="40",
                      deadline=TODAY),
    ]
    built += [built_finding("LINE_IDLE", f"LINE_IDLE:line:z{i}", priority="1", department="Production Planning")
              for i in range(extra)]
    sync = await w.sync_findings(db, tenant.id, built, today=TODAY)
    # make only the first `eligible` findings eligible (keeps the test independent of the cap)
    rows = list((await db.execute(select(MfgPredictiveFinding).where(MfgPredictiveFinding.tenant_id == tenant.id)
                                  .order_by(MfgPredictiveFinding.priority.desc()))).scalars())
    for i, r in enumerate(rows):
        r.alert_eligible = i < eligible
    await db.commit()
    return tenant, user, fx, order, rows, sync


def test_six_rules_registered_with_definitions():
    keys = {d["rule_key"] for d in DEFAULT_DEFINITIONS}
    assert MFG_KEYS <= keys and MFG_KEYS <= set(RULE_REGISTRY)


@pytest.mark.asyncio
async def test_scan_mirrors_only_eligible_open_findings_with_minimal_content(db_session_integration):
    db = db_session_integration
    tenant, _u, fx, order, rows, _ = await _seed(db, eligible=2, extra=1)
    await run_scan(db, tenant.id, trigger="test")
    alerts = await _mfg_alerts(db, tenant.id)
    assert {a.natural_key for a in alerts} == {w.natural_key_for(r) for r in rows[:2]}
    delivery = next(a for a in alerts if a.alert_type == "mfg_delivery_risk")
    assert delivery.title == f"Delivery risk: {order.order_code}"
    facts = delivery.evidence_json["facts"]
    assert set(facts) == ALLOWED_FACT_KEYS
    assert facts["href"] == f"/app/control-tower?tab=predictions&finding={rows[0].id}"
    text = f"{delivery.title} {delivery.description} {delivery.reason_text} {delivery.evidence_json}"
    assert "12.5" not in text and "po_line" not in text  # never probability / PO values (17.3)
    overload = next(a for a in alerts if a.alert_type == "mfg_capacity_overload")
    assert fx.line.line_code in overload.title


@pytest.mark.asyncio
async def test_flag_off_rules_return_nothing(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx, _o, _rows, _ = await _seed(db, flags={"manufacturing_intelligence_v1": True})
    await run_scan(db, tenant.id, trigger="test")
    assert await _mfg_alerts(db, tenant.id) == []


@pytest.mark.asyncio
async def test_user_resolved_alert_stays_resolved_unless_escalated(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx, _o, rows, _ = await _seed(db, eligible=1, extra=0)
    await run_scan(db, tenant.id, trigger="test")
    alert = (await _mfg_alerts(db, tenant.id))[0]
    assert alert.severity == "high"
    alert.status = "resolved"
    await db.commit()
    await run_scan(db, tenant.id, trigger="test")
    await db.refresh(alert)
    assert alert.status == "resolved"  # 17.4: the 15-minute scan does not re-open it
    finding = rows[0]
    finding.severity = "critical"
    await db.commit()
    await run_scan(db, tenant.id, trigger="test")
    await db.refresh(alert)
    assert alert.status == "new" and alert.severity == "critical"  # escalation re-opens


@pytest.mark.asyncio
async def test_job_resolves_stale_and_flag_off_alerts(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx, _o, rows, _ = await _seed(db, eligible=2, extra=0)
    await run_scan(db, tenant.id, trigger="test")
    assert len(await _mfg_alerts(db, tenant.id)) == 2
    resolved = await w.resolve_stale_alerts(db, tenant.id, {w.natural_key_for(rows[0])})
    assert resolved == 1
    for a in await _mfg_alerts(db, tenant.id):
        await db.refresh(a)
    statuses = {a.natural_key: a.status for a in await _mfg_alerts(db, tenant.id)}
    assert statuses[w.natural_key_for(rows[0])] == "new"
    assert statuses[w.natural_key_for(rows[1])] == "resolved"
    # flag off: the job only runs the bounded UPDATE for this tenant
    tenant.feature_flags = {"manufacturing_intelligence_v1": True}
    await db.commit()
    assert await worker.cleanup_disabled_tenant(db, tenant.id) == 1
    for a in await _mfg_alerts(db, tenant.id):
        await db.refresh(a)
        assert a.status == "resolved"
    assert await worker.cleanup_disabled_tenant(db, tenant.id) == 0


def _body(flags: dict) -> dict:
    return {"company_name": "Guard Co", "tenant_type": "manufacturer", "feature_flags": flags}


@pytest.mark.asyncio
async def test_settings_guard_and_switch_off_cleanup(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, _o, _rows, _ = await _seed(db, eligible=2, extra=0)
    from app.models import Role

    role = await db.get(Role, user.role_id)
    role.name = "admin"
    await db.commit()
    await run_scan(db, tenant.id, trigger="test")
    assert len(await _mfg_alerts(db, tenant.id)) == 2
    url = "/api/v1/settings/config"
    async with api_client(db, tenant, user) as c:
        r = await c.put(url, json=_body({**FLAGS_P4, P4_OFF: False}))  # switching off is always allowed
        assert r.status_code == 200, r.text
        r = await c.put(url, json=_body({P4_OFF: True}))
        assert r.status_code == 400 and "manufacturing_intelligence_v1" in r.json()["detail"]
        r = await c.put(url, json=_body({**FLAGS_P4, "mfg_predictive_ai_text_v1": True, P4_OFF: False}))
        assert r.status_code == 400 and "mfg_predictive_intelligence_v1" in r.json()["detail"]
        r = await c.put(url, json=_body({**FLAGS_P4, "mfg_predictive_ai_text_v1": True}))  # both in one request
        assert r.status_code == 200, r.text
    for a in await _mfg_alerts(db, tenant.id):
        await db.refresh(a)
        assert a.status == "resolved"  # 17.5 (a): same transaction as the switch-off
    details = list((await db.execute(select(AuditLog.details).where(
        AuditLog.tenant_id == tenant.id, AuditLog.resource == "settings.mfg_planning_flags"))).scalars())
    assert any("mfg_predictive_intelligence_v1 disabled" in d for d in details)
    assert any("predictive alerts resolved after switching off: 2" in d for d in details)
