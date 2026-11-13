"""Manufacturing Intelligence Phase 3: finance gate, flags, settings guards and money planning settings.

Finance gate (doc 14 section 12 #10 / 13 Q5): in EVERY RBAC mode the money endpoints need an admin / manager role or
a role that explicitly grants both finance.access and finance.mis_report.view (router level also needs
production.planning.read + finance.access, which only bites under RBAC enforce).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_finance_gate.py -q -p no:warnings"
"""

from __future__ import annotations

import pytest
from fastapi.routing import APIRoute
from sqlalchemy import select

from app.common.tenant_feature_keys import (
    DEFAULT_ON_FEATURE_FLAGS,
    MFG_COST_INTELLIGENCE_V1,
    MFG_FINANCIAL_READINESS_V1,
    is_mfg_cost_intelligence_v1_enabled,
    is_mfg_financial_readiness_v1_enabled,
    with_effective_default_flags,
)
from app.models import AuditLog
from tests.bd_hr_fixtures import api_client
from tests.mfg_alloc_fixtures import add_user_with_role
from tests.mfg_finance_fixtures import CASH, COST, MI, P3_FLAGS, add_quotation, add_quoted_order, p3_tenant
from tests.mfg_intel_fixtures import API, client_for
from tests.merch_fixtures import create_merch_tenant_with_user
from tests.test_route_permission_inventory import _permission_keys

PLAN_READ = {"production.planning.read": True}
FIN_BOTH = {"finance.access": True, "finance.mis_report.view": True}


def _urls(order_id: int) -> list[str]:
    return [
        f"{API}/orders/{order_id}/cost-at-completion",
        f"{API}/cost-at-completion",
        f"{API}/cash-requirement?horizon_days=14",
    ]


@pytest.mark.parametrize("flags", [None, {}, {MFG_COST_INTELLIGENCE_V1: "true"}, {MFG_FINANCIAL_READINESS_V1: 1}, "x"])
def test_phase3_flag_helpers_are_strict(flags):
    assert is_mfg_cost_intelligence_v1_enabled(flags) is False
    assert is_mfg_financial_readiness_v1_enabled(flags) is False


def test_phase3_flags_default_off():
    for key in (MFG_COST_INTELLIGENCE_V1, MFG_FINANCIAL_READINESS_V1):
        assert key not in DEFAULT_ON_FEATURE_FLAGS
        assert key not in with_effective_default_flags({})


def test_new_routes_need_planning_read_and_finance_access_and_are_get_only():
    from app.main import app

    found = 0
    for route in app.routes:
        if isinstance(route, APIRoute) and route.endpoint.__module__ == "app.modules.mfg_intelligence.finance_router":
            found += 1
            assert route.methods == {"GET"}, route.path
            assert {"production.planning.read", "finance.access"} <= _permission_keys(route), route.path
    assert found == 3


async def _seed(db, flags=None):
    tenant, user, role, fx = await p3_tenant(db, flags=flags)
    q = await add_quotation(db, tenant, fx.customer)
    order = await add_quoted_order(db, tenant, fx, q)
    return tenant, user, fx, order


@pytest.mark.parametrize(
    "flags",
    [
        {},
        {COST: True, CASH: True},  # manufacturing_intelligence_v1 off
        {MI: True},
        {MI: True, COST: "true", CASH: 1},
    ],
)
async def test_every_phase3_endpoint_is_404_without_flags(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _fx, order = await _seed(db, flags=flags)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for url in _urls(order.id):
            r = await c.get(url)
            assert r.status_code == 404, (url, r.text)
            assert r.json()["detail"] == "Not found"


async def test_each_flag_opens_only_its_own_endpoints(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order = await _seed(db, flags={MI: True, COST: True})
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.get(f"{API}/orders/{order.id}/cost-at-completion")).status_code == 200
        assert (await c.get(f"{API}/cost-at-completion")).status_code == 200
        assert (await c.get(f"{API}/cash-requirement")).status_code == 404
    tenant.feature_flags = {MI: True, CASH: True}
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await c.get(f"{API}/cost-at-completion")).status_code == 404
        assert (await c.get(f"{API}/cash-requirement", params={"horizon_days": 7})).status_code == 200


# role name, permissions, expected status per RBAC mode (off, shadow, enforce)
MATRIX = [
    ("admin", {}, (200, 200, 200)),
    ("manager", {}, (200, 200, 403)),  # enforce: router keys must be granted explicitly (no manager bypass there)
    ("manager", {**PLAN_READ, "finance.access": True}, (200, 200, 200)),
    ("analyst", {**PLAN_READ, **FIN_BOTH}, (200, 200, 200)),
    ("analyst_star", {"*": True}, (200, 200, 200)),
    ("planner", dict(PLAN_READ), (403, 403, 403)),
    ("fin_clerk", {**PLAN_READ, "finance.access": True}, (403, 403, 403)),  # no finance.mis_report.view
    ("mis_only", {**PLAN_READ, "finance.mis_report.view": True}, (403, 403, 403)),
    ("denied", {**PLAN_READ, **FIN_BOTH, "finance.mis_report.view": False}, (403, 403, 403)),
]


@pytest.mark.parametrize("strict", [False, True])
@pytest.mark.parametrize("mode_index,mode", [(0, "off"), (1, "shadow"), (2, "enforce")])
async def test_finance_gate_rbac_matrix(db_session_integration, strict, mode_index, mode):
    db = db_session_integration
    flags = {**P3_FLAGS, "rbac_enforcement": mode, "strict_sensitive_permissions": strict}
    tenant, _owner, _fx, order = await _seed(db, flags=flags)
    users = [(name, await add_user_with_role(db, tenant, name, perms), expected[mode_index]) for name, perms, expected in MATRIX]
    await db.commit()
    for name, user, expected in users:
        async with client_for(db, tenant, user) as c:
            for url in _urls(order.id):
                r = await c.get(url)
                assert r.status_code == expected, (mode, strict, name, url, r.status_code, r.text)
            if expected == 200 or mode != "enforce":
                hint = await c.get(f"{API}/planning-permissions")
                assert hint.status_code == 200
                assert hint.json()["can_view_finance"] is (name not in ("planner", "fin_clerk", "mis_only", "denied")), name


async def test_tenant_mismatch_is_403(db_session_integration):
    db = db_session_integration
    tenant, user, _fx, order = await _seed(db)
    other, _u, _f, _o = await _seed(db)
    await db.commit()
    async with client_for(db, other, user) as c:
        r = await c.get(f"{API}/cost-at-completion")
    assert r.status_code == 403


# ------------------------------------------------------------------ settings guards (PUT /settings/config)

SETTINGS_URL = "/api/v1/settings/config"


def _body(flags: dict) -> dict:
    return {"company_name": "Guard Co", "tenant_type": "manufacturer", "feature_flags": flags}


@pytest.mark.parametrize("key", [COST, CASH])
async def test_phase3_flags_need_manufacturing_intelligence_and_are_audited(db_session_integration, key):
    db = db_session_integration
    tenant, admin, role = await create_merch_tenant_with_user(db, permissions={"*": True})
    role.name = "admin"
    tenant.feature_flags = {}
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        r = await c.put(SETTINGS_URL, json=_body({key: True}))
        assert r.status_code == 400 and MI in r.json()["detail"]
        r = await c.put(SETTINGS_URL, json=_body({MI: True, key: True}))
        assert r.status_code == 200, r.text
        assert (await c.put(SETTINGS_URL, json=_body({MI: True, key: False}))).status_code == 200
    logs = (
        await db.execute(
            select(AuditLog.details).where(AuditLog.tenant_id == tenant.id, AuditLog.resource == "settings.mfg_planning_flags")
        )
    ).scalars().all()
    assert any(f"{key} enabled" in d for d in logs) and any(f"{key} disabled" in d for d in logs)


# ------------------------------------------------------------------ money keys in planning settings


async def test_money_planning_settings_need_phase3_flag_and_finance_gate(db_session_integration):
    db = db_session_integration
    tenant, owner, _fx, _order = await _seed(db, flags={**P3_FLAGS, "mfg_integrated_planning_v1": True})
    approver = await add_user_with_role(db, tenant, "lead", {"production.planning.approve": True, **PLAN_READ})
    await db.commit()
    url = f"{API}/planning-settings"
    async with client_for(db, tenant, owner) as c:
        got = (await c.get(url)).json()
        assert (got["export_document_days"], got["export_usance_days"], got["btb_usance_days"], got["cpm_override"]) == (7, 90, 120, None)
        for bad in ({"export_document_days": 61}, {"export_usance_days": -1}, {"btb_usance_days": 366}, {"cpm_override": "0"},
                    {"cpm_override": "-2"}, {"export_document_days": None}):
            assert (await c.put(url, json=bad)).status_code == 422, bad
        r = await c.put(url, json={"export_document_days": 10, "export_usance_days": 0, "btb_usance_days": 90, "cpm_override": "4.25"})
        assert r.status_code == 200, r.text
        assert r.json()["cpm_override"] == "4.2500" and r.json()["export_usance_days"] == 0
        # Phase 2 keys still merge without wiping the Phase 3 keys
        assert (await c.put(url, json={"receipt_buffer_days": 2})).status_code == 200
        got = (await c.get(url)).json()
        assert got["export_document_days"] == 10 and got["cpm_override"] == "4.2500" and got["receipt_buffer_days"] == 2
        assert (await c.put(url, json={"cpm_override": None})).json()["cpm_override"] is None
    async with client_for(db, tenant, approver) as c:  # planning approver without the finance gate
        assert (await c.put(url, json={"export_usance_days": 30})).status_code == 403
        assert (await c.put(url, json={"receipt_buffer_days": 1})).status_code == 200
        hidden = (await c.get(url)).json()
        assert hidden["cpm_override"] is None and hidden["cpm_override_hidden"] is True
    audit = (await db.execute(select(AuditLog.details).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "mfg_planning_settings.update"))).scalars().all()
    assert any("cpm_override: None -> 4.2500" in d and "export_usance_days: 90 -> 0" in d for d in audit), audit
    assert any("cpm_override: 4.2500 -> None" in d for d in audit), audit


async def test_phase3_settings_without_integrated_planning(db_session_integration):
    db = db_session_integration
    tenant, owner, _fx, _order = await _seed(db, flags=dict(P3_FLAGS))
    await db.commit()
    url = f"{API}/planning-settings"
    async with client_for(db, tenant, owner) as c:
        assert (await c.get(url)).status_code == 200
        assert (await c.put(url, json={"export_usance_days": 60})).status_code == 200
        assert (await c.put(url, json={"receipt_buffer_days": 1})).status_code == 404  # Phase 2 key needs integrated
    tenant.feature_flags = {MI: True, "mfg_integrated_planning_v1": True}
    await db.commit()
    async with client_for(db, tenant, owner) as c:
        got = (await c.get(url)).json()
        assert "export_usance_days" not in got and "cpm_override" not in got  # Phase 2 output unchanged
        assert (await c.put(url, json={"export_usance_days": 60})).status_code == 404
