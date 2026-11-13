"""Phase 5 flag `mfg_advanced_planning_v1`: strict, default OFF, 404 when off, Phase 1-4 outputs unchanged, Settings guard,
planning settings keys, and the Phase 4 material wrapper contract (doc 16 sections 10.6, 15.17, 15.18).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_advanced_flag_off.py -q -p no:warnings"
"""

from __future__ import annotations

import json
from datetime import timedelta
from decimal import Decimal

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import select

from app.common.tenant_feature_keys import (
    DEFAULT_ON_FEATURE_FLAGS,
    MFG_ADVANCED_PLANNING_V1,
    is_mfg_advanced_planning_v1_enabled,
    with_effective_default_flags,
)
from app.models import AuditLog
from app.modules.mfg_intelligence.flags import advanced_planning_on
from tests.bd_hr_fixtures import api_client
from tests.mfg_forward_fixtures import (
    ADV,
    ADV_FLAGS,
    CASH,
    FP,
    INTEGRATED,
    MI,
    PREDICTIVE,
    TODAY,
    add_order,
    add_plan,
    adv_tenant,
    base_row,
    pinned_today,  # noqa: F401 - autouse fixture
)
from tests.mfg_intel_fixtures import API, client_for
from tests.merch_fixtures import create_merch_tenant_with_user
from tests.test_route_permission_inventory import _permission_keys

NEW_URLS = (FP, f"{FP}/compare?scenarios=BASE", f"{FP}/forecast-demand", f"{FP}/finance-constrained",
            f"{API}/scheduler/preview")


@pytest.mark.parametrize("flags", [None, {}, {MFG_ADVANCED_PLANNING_V1: "true"}, {MFG_ADVANCED_PLANNING_V1: 1}, "x"])
def test_flag_helper_is_strict(flags):
    assert is_mfg_advanced_planning_v1_enabled(flags) is False


def test_flag_default_off_and_needs_mi():
    from types import SimpleNamespace

    assert MFG_ADVANCED_PLANNING_V1 not in DEFAULT_ON_FEATURE_FLAGS
    assert MFG_ADVANCED_PLANNING_V1 not in with_effective_default_flags({})
    assert advanced_planning_on(SimpleNamespace(feature_flags={ADV: True})) is False
    assert advanced_planning_on(SimpleNamespace(feature_flags={MI: True, ADV: True})) is True


def test_new_routes_are_get_only_with_planning_read_and_finance_key():
    from app.main import app

    found = 0
    for route in app.routes:
        if isinstance(route, APIRoute) and route.endpoint.__module__ == "app.modules.mfg_intelligence.advanced_planning_router":
            found += 1
            assert route.methods == {"GET"}, route.path
            keys = _permission_keys(route)
            assert "production.planning.read" in keys, route.path
            if route.path.endswith("/finance-constrained"):
                assert "finance.access" in keys
    assert found == 5


@pytest.mark.parametrize("flags", [{}, {ADV: True}, {MI: True}, {MI: True, ADV: "true", CASH: True}])
async def test_every_new_route_is_404_when_off(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _role, _fx = await adv_tenant(db, flags=flags)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for url in NEW_URLS:
            r = await c.get(url)
            assert r.status_code == 404, (url, r.text)
            assert r.json()["detail"] == "Not found"


PHASE14 = {
    MI: True, "planning_math_v2": True, "mfg_order_bom_readiness_v2": True, INTEGRATED: True, PREDICTIVE: True,
    CASH: True, "mfg_cost_intelligence_v1": True,
}


async def test_phase1_to_4_payloads_identical_with_flag_on_and_off(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags=PHASE14)
    await base_row(db, tenant, fx)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=800, delivery=TODAY + timedelta(days=30))
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=2), end=TODAY + timedelta(days=9), qty="500",
                   order=order, ob=fx.ob, style=fx.style)
    await db.commit()
    window = {"date_from": TODAY.isoformat(), "date_to": (TODAY + timedelta(days=20)).isoformat()}
    urls = [
        (f"{API}/summary", window), (f"{API}/capacity", window), (f"{API}/line-loading", window),
        (f"{API}/orders/{order.id}/readiness", {}), (f"{API}/orders/{order.id}/delivery-prediction", {}),
        (f"{API}/tentative-demand", {}), (f"{API}/bookings", window),
        (f"{API}/predictive/orders/{order.id}/delivery-forecast", {}), (f"{API}/predictive/line-efficiency", {}),
        (f"{API}/cash-requirement", {"date_from": TODAY.isoformat(), "horizon_days": 30}),
        (f"{API}/cost-at-completion", {}),
    ]

    async def snapshot() -> dict[str, str]:
        out = {}
        async with client_for(db, tenant, user) as c:
            for url, params in urls:
                r = await c.get(url, params=params)
                assert r.status_code == 200, (url, r.text)
                out[url] = json.dumps(r.json(), sort_keys=True)
        return out

    off = await snapshot()
    tenant.feature_flags = {**PHASE14, ADV: True}
    await db.commit()
    on = await snapshot()
    assert on == off
    # planning settings: only the Phase 5 keys are added while the flag is on
    async with client_for(db, tenant, user) as c:
        with_flag = (await c.get(f"{API}/planning-settings")).json()
    tenant.feature_flags = dict(PHASE14)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        without = (await c.get(f"{API}/planning-settings")).json()
    assert set(with_flag) - set(without) == {"frozen_horizon_days", "changeover_loss_pct"}
    assert {k: v for k, v in with_flag.items() if k in without} == without


SETTINGS_URL = "/api/v1/settings/config"


def _body(flags: dict) -> dict:
    return {"company_name": "Guard Co", "tenant_type": "manufacturer", "feature_flags": flags}


async def test_settings_switch_needs_manufacturing_intelligence_and_is_audited(db_session_integration):
    db = db_session_integration
    tenant, admin, role = await create_merch_tenant_with_user(db, permissions={"*": True})
    role.name = "admin"
    tenant.feature_flags = {}
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put(SETTINGS_URL, json=_body({ADV: True}))
        assert r.status_code == 400 and MI in r.json()["detail"]
        assert (await c.put(SETTINGS_URL, json=_body({MI: True, ADV: True}))).status_code == 200
        assert (await c.put(SETTINGS_URL, json=_body({MI: True, ADV: False}))).status_code == 200
    logs = (
        await db.execute(
            select(AuditLog.details).where(AuditLog.tenant_id == tenant.id, AuditLog.resource == "settings.mfg_planning_flags")
        )
    ).scalars().all()
    assert any(f"{ADV} enabled" in d for d in logs) and any(f"{ADV} disabled" in d for d in logs)


async def test_planning_settings_phase5_keys(db_session_integration):
    from tests.mfg_alloc_fixtures import add_user_with_role

    db = db_session_integration
    tenant, owner, _role, _fx = await adv_tenant(db, flags={**ADV_FLAGS, CASH: True})
    no_approve = await add_user_with_role(db, tenant, "planner", {"production.planning.read": True,
                                                                  "production.planning.approve": False})
    tenant.feature_flags = {**ADV_FLAGS, CASH: True, "rbac_enforcement": "enforce"}
    await db.commit()
    url = f"{API}/planning-settings"
    async with client_for(db, tenant, owner) as c:
        got = (await c.get(url)).json()
        assert (got["frozen_horizon_days"], got["changeover_loss_pct"]) == (14, 50)
        for bad in ({"frozen_horizon_days": 13}, {"frozen_horizon_days": 61}, {"changeover_loss_pct": 101},
                    {"changeover_loss_pct": -1}, {"frozen_horizon_days": None}):
            assert (await c.put(url, json=bad)).status_code == 422, bad
        r = await c.put(url, json={"frozen_horizon_days": 21, "changeover_loss_pct": 40})
        assert r.status_code == 200, r.text
        assert (r.json()["frozen_horizon_days"], r.json()["changeover_loss_pct"]) == (21, 40)
        # a Phase 3 save keeps the Phase 5 keys
        assert (await c.put(url, json={"export_usance_days": 60})).status_code == 200
        got = (await c.get(url)).json()
        assert (got["frozen_horizon_days"], got["changeover_loss_pct"], got["export_usance_days"]) == (21, 40, 60)
        fp_body = (await c.get(FP)).json()
        assert fp_body["frozen_end"] == (TODAY + timedelta(days=20)).isoformat()
    async with client_for(db, tenant, no_approve) as c:
        assert (await c.put(url, json={"frozen_horizon_days": 30})).status_code == 403
    audit = (await db.execute(select(AuditLog.details).where(
        AuditLog.tenant_id == tenant.id, AuditLog.action == "mfg_planning_settings.update"))).scalars().all()
    assert any("frozen_horizon_days: 14 -> 21" in d for d in audit), audit
    # flag off: the keys are refused and hidden
    tenant.feature_flags = {MI: True, CASH: True}
    await db.commit()
    async with client_for(db, tenant, owner) as c:
        assert (await c.put(url, json={"frozen_horizon_days": 30})).status_code == 404
        assert "frozen_horizon_days" not in (await c.get(url)).json()


async def test_material_wrapper_keeps_phase4_forecast_identical(db_session_integration):
    from app.models.inventory import PurchaseOrder, PurchaseOrderItem
    from app.modules.mfg_intelligence import predictive_stats as st
    from app.modules.mfg_intelligence.delivery_forecast_service import forecast_deliveries, material_ready_dates
    from tests.test_mfg_intelligence_readiness import _ready_order

    db = db_session_integration
    tenant, _user, fx, order, item, _bom = await _ready_order(
        db, flags={MI: True, "planning_math_v2": True, "mfg_order_bom_readiness_v2": True, PREDICTIVE: True},
        stock="10", gross="5000",
    )
    po = PurchaseOrder(tenant_id=tenant.id, po_code="PO-WRAP-1", supplier_name="S", status="APPROVED",
                       expected_date=TODAY + timedelta(days=10), source_order_id=order.id)
    db.add(po)
    await db.flush()
    db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=po.id, item_id=item.id, quantity=Decimal("999999")))
    await db.commit()

    def dump(rows):
        return json.dumps(rows, sort_keys=True, default=str)

    before = dump(await forecast_deliveries(db, tenant, [order], today=TODAY))
    with_lateness = await material_ready_dates(db, tenant, [order], today=TODAY, q=st.Q50, apply_lateness=True)
    without = await material_ready_dates(db, tenant, [order], today=TODAY, q=st.Q80, apply_lateness=False)
    after = dump(await forecast_deliveries(db, tenant, [order], today=TODAY))
    assert before == after
    forecast = json.loads(before)[0]
    material = forecast.get("material") or {}
    mr = with_lateness[order.id]
    assert mr.status == material.get("status") == "DATED", (mr, material)
    assert without[order.id].ready_date == TODAY + timedelta(days=10)
    assert (mr.ready_date.isoformat() if mr.ready_date else None) == (str(material.get("ready_p50")) if material.get("ready_p50") else None)
    assert without[order.id].lateness_source in ("NONE", "NOT_EVALUATED")
    off = await material_ready_dates(
        db, type("T", (), {"id": tenant.id, "feature_flags": {MI: True}})(), [order], today=TODAY, q=st.Q50, apply_lateness=True,
    )
    assert off[order.id].status == "NOT_EVALUATED" and off[order.id].ready_date is None
