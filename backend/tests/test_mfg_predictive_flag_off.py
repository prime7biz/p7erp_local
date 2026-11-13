"""Phase 4 flags (plan 15 D1, acceptance 1, 17.19): strict default OFF, every route 404 without both flags,
Phase 1-3 responses identical with the predictive flags on vs off (frozen tenant_today, volatile timestamps removed).

Run: docker compose exec -T backend pytest tests/test_mfg_predictive_flag_off.py -q
"""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import (
    DEFAULT_ON_FEATURE_FLAGS,
    MFG_PREDICTIVE_AI_TEXT_V1,
    MFG_PREDICTIVE_INTELLIGENCE_V1,
    is_mfg_predictive_ai_text_v1_enabled,
    is_mfg_predictive_intelligence_v1_enabled,
    with_effective_default_flags,
)
from app.models import Tenant
from app.modules.mfg_intelligence.flags import predictive_ai_text_on, predictive_on
from tests.mfg_intel_fixtures import add_order, add_plan, client_for
from tests.mfg_predictive_fixtures import API, PRED, TODAY, freeze_today, new_predictive_tenant, seed_history

MI = "manufacturing_intelligence_v1"


def _urls(order_id: int) -> list[tuple[str, dict]]:
    return [
        (f"{PRED}/orders/{order_id}/delivery-forecast", {}),
        (f"{PRED}/line-efficiency", {}),
        (f"{PRED}/supplier-lateness", {}),
        (f"{PRED}/anomalies", {"date_from": "2030-02-01", "date_to": "2030-02-28"}),
        (f"{PRED}/calibration", {}),
        (f"{API}/recommendations", {}),
    ]


@pytest.mark.parametrize("value", [None, False, "true", 1, "yes"])
def test_helpers_are_strict_true(value):
    flags = {MFG_PREDICTIVE_INTELLIGENCE_V1: value, MFG_PREDICTIVE_AI_TEXT_V1: value, MI: True}
    assert is_mfg_predictive_intelligence_v1_enabled(flags) is False
    assert is_mfg_predictive_ai_text_v1_enabled(flags) is False
    assert is_mfg_predictive_intelligence_v1_enabled("x") is False


def test_flags_default_off_and_need_manufacturing_intelligence():
    for key in (MFG_PREDICTIVE_INTELLIGENCE_V1, MFG_PREDICTIVE_AI_TEXT_V1):
        assert key not in DEFAULT_ON_FEATURE_FLAGS
        assert key not in with_effective_default_flags({})
    assert predictive_on(Tenant(feature_flags={MFG_PREDICTIVE_INTELLIGENCE_V1: True})) is False
    assert predictive_on(Tenant(feature_flags={MI: True, MFG_PREDICTIVE_INTELLIGENCE_V1: True})) is True
    assert predictive_ai_text_on(Tenant(feature_flags={MI: True, MFG_PREDICTIVE_AI_TEXT_V1: True})) is False
    assert predictive_ai_text_on(
        Tenant(feature_flags={MI: True, MFG_PREDICTIVE_INTELLIGENCE_V1: True, MFG_PREDICTIVE_AI_TEXT_V1: True})
    ) is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "flags",
    [
        {},
        {MI: True, "planning_math_v2": True},
        {MFG_PREDICTIVE_INTELLIGENCE_V1: True},  # without manufacturing_intelligence_v1
        {MI: False, MFG_PREDICTIVE_INTELLIGENCE_V1: True},
        {MI: True, MFG_PREDICTIVE_INTELLIGENCE_V1: "true"},
        {MI: True, MFG_PREDICTIVE_AI_TEXT_V1: True},  # the AI text flag alone opens nothing
    ],
)
async def test_every_phase4_route_is_404_without_both_flags(db_session_integration, monkeypatch, flags):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db, flags=flags)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=TODAY)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for url, params in _urls(order.id):
            r = await c.get(url, params=params)
            assert r.status_code == 404, (url, r.text)
            assert r.json()["detail"] == "Not found"


def test_phase4_routes_are_get_only():
    from fastapi.routing import APIRoute

    from app.main import app

    routes = [r for r in app.routes if isinstance(r, APIRoute)
              and r.endpoint.__module__ == "app.modules.mfg_intelligence.predictive_router"]
    assert len(routes) == 6
    assert all(r.methods == {"GET"} for r in routes)


def _strip_volatile(value):
    if isinstance(value, dict):
        return {k: _strip_volatile(v) for k, v in value.items() if not k.endswith("_at") and k != "duration_ms"}
    if isinstance(value, list):
        return [_strip_volatile(v) for v in value]
    return value


@pytest.mark.asyncio
async def test_phase1_to_3_responses_identical_with_predictive_flags(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    base = {MI: True, "planning_math_v2": True, "mfg_order_bom_readiness_v2": True,
            "mfg_cost_intelligence_v1": True, "mfg_financial_readiness_v1": True}
    tenant, user, fx = await new_predictive_tenant(db, flags=base)
    await seed_history(db, tenant, fx, [Decimal("0.5")] * 12)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=800, delivery=date(2030, 3, 20))
    await add_plan(db, tenant, fx.line, start=TODAY, end=date(2030, 3, 15), qty="800", order=order, ob=fx.ob)
    await db.commit()
    window = {"date_from": "2030-03-04", "date_to": "2030-03-15"}
    urls = [
        (f"{API}/summary", window),
        (f"{API}/capacity", window),
        (f"{API}/line-loading", window),
        (f"{API}/orders/{order.id}/readiness", {}),
        (f"{API}/orders/{order.id}/delivery-prediction", {}),
        (f"{API}/orders/{order.id}/cost-at-completion", {}),
        (f"{API}/cost-at-completion", {}),
        (f"{API}/cash-requirement", {"date_from": "2030-03-04", "horizon_days": 30}),
    ]

    async def snapshot() -> list[str]:
        out = []
        async with client_for(db, tenant, user) as c:
            for url, params in urls:
                r = await c.get(url, params=params)
                assert r.status_code == 200, (url, r.text)
                out.append(json.dumps(_strip_volatile(r.json()), sort_keys=True))
        return out

    before = await snapshot()
    tenant.feature_flags = {**base, MFG_PREDICTIVE_INTELLIGENCE_V1: True, MFG_PREDICTIVE_AI_TEXT_V1: True}
    await db.commit()
    assert await snapshot() == before
    tenant.feature_flags = dict(base)
    await db.commit()
    assert await snapshot() == before
