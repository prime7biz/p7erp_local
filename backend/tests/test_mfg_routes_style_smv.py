"""Route stages and the governed style standard SMV (Manufacturing Intelligence Phase 2, run R4; migration 299).

Covers: template route fields (validation, clearing), TNA generators copy them onto order actions, GET /route-stages,
delivery prediction adds open external POST-sewing lead time only with mfg_integrated_planning_v1, PUT
/styles/{id}/standard-smv (approve permission, audit, cross-tenant 404, validation), SMV level 3 only with the flag.

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_routes_style_smv.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import select

from app.models import AuditLog, FollowupActionTemplate, OrderFollowupAction
from app.modules.mfg_intelligence import router as mfg_router
from app.modules.mfg_intelligence.smv_resolver import resolve_smv_for_rows
from app.modules.orders.router import _auto_generate_followup_actions_if_missing
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_order,
    add_plan,
    add_style_with_ob,
    client_for,
    new_tenant,
    seed_basic_factory,
)

pytestmark = pytest.mark.asyncio

FLAGS = {**FLAGS_ON, "mfg_integrated_planning_v1": True}
MERCH = "/api/v1/merch"
SMV_BODY = {"smv": "11.25", "source": "ie_study", "confidence": "high", "reason": "time study on line 1"}


@pytest.fixture(autouse=True)
def _pin_today(monkeypatch):
    monkeypatch.setattr(mfg_router, "today_local", lambda tenant=None: MONDAY)


async def _setup(db, *, flags=None, qty=6912, delivery=date(2030, 3, 20)):
    tenant, user, _ = await new_tenant(db, flags=FLAGS if flags is None else flags)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=qty, delivery=delivery)
    await add_plan(db, tenant, fx.line, start=MONDAY, end=date(2030, 3, 29), qty=str(qty), order=order, ob=fx.ob,
                   shift=fx.shift, rs="FIRM_BOOKED")
    await db.commit()
    return tenant, user, fx, order


def _stage(tenant, order, *, title="Washing", kind="EXTERNAL_PROCESS", pos="POST_SEWING", lead=7, status="pending"):
    return OrderFollowupAction(
        tenant_id=tenant.id, order_id=order.id, phase="production", title=title, status=status,
        stage_kind=kind, stage_position=pos, lead_time_days=lead, route_code="DENIM-WASH", gate_class="MANDATORY",
    )


# ------------------------------------------------------------------ templates and TNA generators


async def test_template_route_fields_validate_and_clear(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order = await _setup(db)
    body = {
        "code": "WASH", "name": "Garment wash", "phase": "production", "default_days_before_delivery": 10,
        "route_code": "denim-wash", "stage_kind": "external_process", "stage_position": "post_sewing",
        "gate_class": "mandatory", "lead_time_days": 7, "sourcing_mode": "in_house", "product_type": "Denim",
        "predecessor_codes": ["SEW", "SEW", ""], "lag_days": 1,
    }
    async with client_for(db, tenant, user) as c:
        r = await c.post(f"{MERCH}/followup-templates", json=body)
        assert r.status_code == 201, r.text
        t = r.json()
        assert t["route_code"] == "DENIM-WASH" and t["stage_kind"] == "EXTERNAL_PROCESS"
        assert t["stage_position"] == "POST_SEWING" and t["gate_class"] == "MANDATORY"
        assert t["sourcing_mode"] == "IN_HOUSE" and t["predecessor_codes"] == ["SEW"] and t["lead_time_days"] == 7
        for bad in ({"stage_kind": "OUTSOURCE"}, {"stage_position": "AFTER"}, {"gate_class": "SOFT"},
                    {"lead_time_days": -1}, {"lead_time_days": 400}, {"route_code": "bad code!"}):
            assert (await c.post(f"{MERCH}/followup-templates", json={**body, "code": "X", **bad})).status_code == 422, bad
        r = await c.patch(f"{MERCH}/followup-templates/{t['id']}", json={"lead_time_days": None, "name": "Wash"})
        assert r.status_code == 200
        assert r.json()["lead_time_days"] is None and r.json()["stage_kind"] == "EXTERNAL_PROCESS"
        # a template without route fields still works and returns nulls
        plain = await c.post(f"{MERCH}/followup-templates", json={"code": "PLAIN", "name": "Plain", "phase": "production"})
        assert plain.status_code == 201 and plain.json()["route_code"] is None


async def test_tna_generators_copy_route_fields(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order = await _setup(db)
    db.add_all([
        FollowupActionTemplate(tenant_id=tenant.id, code="WASH", name="Wash", phase="production", sequence_no=1,
                               is_active=True, route_code="DENIM-WASH", stage_kind="EXTERNAL_PROCESS",
                               stage_position="POST_SEWING", gate_class="MANDATORY", lead_time_days=6),
        FollowupActionTemplate(tenant_id=tenant.id, code="PLAIN", name="Plain", phase="production", sequence_no=2,
                               is_active=True),
    ])
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.post(f"{MERCH}/followup-actions/generate", json={"order_id": order.id})
        assert r.status_code == 200, r.text
        by_code = {a["milestone_type"]: a for a in r.json()}
    assert by_code["WASH"]["route_code"] == "DENIM-WASH" and by_code["WASH"]["lead_time_days"] == 6
    assert by_code["WASH"]["stage_position"] == "POST_SEWING" and by_code["WASH"]["gate_class"] == "MANDATORY"
    assert by_code["PLAIN"]["route_code"] is None and by_code["PLAIN"]["stage_kind"] is None

    # the order-status auto generator copies them too
    order2 = await add_order(db, tenant, fx.customer, fx.style, qty=10, delivery=date(2030, 5, 1))
    await _auto_generate_followup_actions_if_missing(db, tenant_id=tenant.id, order=order2, next_status="CONFIRMED")
    await db.flush()
    rows = (
        await db.execute(select(OrderFollowupAction).where(OrderFollowupAction.order_id == order2.id))
    ).scalars().all()
    wash = next(a for a in rows if a.milestone_type == "WASH")
    assert wash.stage_kind == "EXTERNAL_PROCESS" and wash.lead_time_days == 6 and wash.route_code == "DENIM-WASH"


# ------------------------------------------------------------------ route stages and delivery


async def test_route_stages_endpoint(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order = await _setup(db)
    db.add_all([
        _stage(tenant, order, title="Print", pos="PRE_SEWING", lead=3),
        _stage(tenant, order, title="Wash", lead=7),
        _stage(tenant, order, title="Embroidery", lead=2, status="completed"),
        _stage(tenant, order, title="Old wash", lead=9, status="cancelled"),
        _stage(tenant, order, title="CMT", kind="SUBCONTRACT", pos="SEWING", lead=12),
        _stage(tenant, order, title="Inline QC", kind="INTERNAL", lead=1),
    ])
    t2, u2, fx2, order2 = await _setup(db)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/route-stages", params={"order_id": order.id})
        assert r.status_code == 200, r.text
        body = r.json()
        assert [s["title"] for s in body["post_sewing"]] == ["Wash", "Embroidery"]
        assert body["post_sewing_open_lead_time_days"] == 7  # completed embroidery not counted
        assert body["pre_sewing_open_lead_time_days"] == 3
        assert [s["title"] for s in body["subcontract_sewing"]] == ["CMT"]
        assert body["route_codes"] == ["DENIM-WASH"]
        assert (await c.get(f"{API}/route-stages", params={"order_id": order2.id})).status_code == 404


async def test_delivery_adds_post_sewing_lead_time_only_with_the_flag(db_session_integration):
    db = db_session_integration
    # flag off: identical Phase 1 answer even though the order has a wash stage
    tenant, user, fx, order = await _setup(db, flags=dict(FLAGS_ON))
    db.add(_stage(tenant, order, lead=7))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        off = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
    assert off["likely_complete_date"] == "2030-03-15" and off["band"] == "ON_TRACK"
    assert "external_lead_time_days" not in off and "EXTERNAL_STAGE_LEAD_TIME_ADDED" not in off["reason_codes"]

    tenant.feature_flags = dict(FLAGS)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        on = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
    assert on["likely_complete_date"] == "2030-03-22"  # sewing ends 03-15, + 7 calendar days of washing
    assert on["optimistic_complete_date"] == "2030-03-22" and on["pessimistic_complete_date"] == "2030-03-26"
    assert on["external_lead_time_days"] == 7 and "EXTERNAL_STAGE_LEAD_TIME_ADDED" in on["reason_codes"]
    assert on["band"] == "LATE" and on["delay_days"] == 2
    assert any("POST-sewing" in a for a in on["assumptions"])


async def test_completed_stage_adds_nothing(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order = await _setup(db)
    db.add(_stage(tenant, order, lead=7, status="completed"))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        on = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
    assert on["likely_complete_date"] == "2030-03-15" and on["external_lead_time_days"] == 0
    assert "EXTERNAL_STAGE_LEAD_TIME_ADDED" not in on["reason_codes"]


# ------------------------------------------------------------------ style standard SMV


async def test_put_standard_smv_is_audited_and_idempotent(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order = await _setup(db)
    url = f"{API}/styles/{fx.style.id}/standard-smv"
    async with client_for(db, tenant, user) as c:
        assert (await c.get(url)).json()["standard_smv"] is None
        r = await c.put(url, json=SMV_BODY)
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["standard_smv"] == "11.2500" and out["standard_smv_source"] == "IE_STUDY"
        assert out["standard_smv_confidence"] == "HIGH" and out["standard_smv_approved_by"] == user.id
        assert out["changed"] is True
        again = await c.put(url, json=SMV_BODY)
        assert again.status_code == 200 and again.json()["changed"] is False
        for bad in ({"smv": "0"}, {"smv": "-1"}, {"source": "GUESS"}, {"confidence": "SURE"}, {"reason": "x"},
                    {"smv": 11.25000001}):
            assert (await c.put(url, json={**SMV_BODY, **bad})).status_code == 422, bad
        assert (await c.put(url, json={**SMV_BODY, "extra": 1})).status_code == 422
    logs = (
        await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "style_standard_smv.approve"))
    ).scalars().all()
    assert len(logs) == 1 and "none -> 11.2500" in logs[0].details and "time study" in logs[0].details


async def test_standard_smv_permission_and_cross_tenant(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order = await _setup(db, flags={**FLAGS, "rbac_enforcement": "enforce"})
    writer = await add_user_with_role(
        db, tenant, "planner", {"production.planning.read": True, "production.planning.write": True}
    )
    approver = await add_user_with_role(
        db, tenant, "lead", {"production.planning.read": True, "production.planning.approve": True}
    )
    t2, u2, fx2, _o2 = await _setup(db)
    await db.commit()
    url = f"{API}/styles/{fx.style.id}/standard-smv"
    async with client_for(db, tenant, writer) as c:
        assert (await c.get(url)).status_code == 200
        assert (await c.put(url, json=SMV_BODY)).status_code == 403
    async with client_for(db, tenant, approver) as c:
        assert (await c.put(url, json=SMV_BODY)).status_code == 200
        foreign = f"{API}/styles/{fx2.style.id}/standard-smv"
        assert (await c.put(foreign, json=SMV_BODY)).status_code == 404
        assert (await c.get(foreign)).status_code == 404
    await db.refresh(fx2.style)
    assert fx2.style.standard_smv is None


async def test_smv_level3_style_standard_only_with_the_flag(db_session_integration):
    db = db_session_integration
    tenant, user, fx, order = await _setup(db, flags=dict(FLAGS_ON))
    _c, bare_style, _ob = await add_style_with_ob(db, tenant, smv=None, customer=fx.customer)
    bare_style.standard_smv = Decimal("10.0000")
    bare_style.standard_smv_confidence = "MEDIUM"
    fx.style.standard_smv = Decimal("99.0000")  # has an approved OB (12.5): the OB still wins
    await add_plan(db, tenant, fx.line, start=MONDAY, end=MONDAY, qty="100", style=bare_style, rs="SOFT_BOOKED")
    await db.commit()

    rows = [
        SimpleNamespace(id=1, ob_id=None, style_id=bare_style.id, smv_per_piece=None),
        SimpleNamespace(id=2, ob_id=None, style_id=bare_style.id, smv_per_piece=Decimal("8")),
        SimpleNamespace(id=3, ob_id=fx.ob.id, style_id=fx.style.id, smv_per_piece=None),
    ]
    off = await resolve_smv_for_rows(db, tenant.id, rows)
    assert off[1].value is None and off[2].source == "PLAN_ROW" and off[3].value == Decimal("12.5")
    on = await resolve_smv_for_rows(db, tenant.id, rows, use_style_standard=True)
    assert on[1].value == Decimal("10.0000") and on[1].source == "STYLE_STANDARD" and on[1].confidence == "medium"
    assert on[2].source == "STYLE_STANDARD"  # the approved standard beats the low-confidence plan row value
    assert on[3].value == Decimal("12.5") and on[3].source == "OB"

    window = {"date_from": "2030-03-04", "date_to": "2030-03-04"}
    async with client_for(db, tenant, user) as c:
        flag_off = (await c.get(f"{API}/line-loading", params=window)).json()
    assert any("SMV_UNKNOWN" in u["reason_codes"] for u in flag_off["unresolved_rows"])
    tenant.feature_flags = dict(FLAGS)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        flag_on = (await c.get(f"{API}/line-loading", params=window)).json()
    sources = {r["smv_source"] for r in flag_on["rows"]}
    assert "STYLE_STANDARD" in sources
    assert not any("SMV_UNKNOWN" in u["reason_codes"] for u in flag_on["unresolved_rows"])
