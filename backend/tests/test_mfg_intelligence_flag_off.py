"""A1: with the tenant flag `manufacturing_intelligence_v1` off, every endpoint returns 404 "Not found".

Run: docker compose exec backend pytest tests/test_mfg_intelligence_flag_off.py -q
"""

from __future__ import annotations

import pytest

from app.common.tenant_feature_keys import (
    DEFAULT_ON_FEATURE_FLAGS,
    MANUFACTURING_INTELLIGENCE_V1,
    MFG_ORDER_BOM_READINESS_V2,
    PLANNING_MATH_V2,
    is_manufacturing_intelligence_v1_enabled,
    is_mfg_order_bom_readiness_v2_enabled,
    is_planning_math_v2_enabled,
    with_effective_default_flags,
)
from tests.mfg_intel_fixtures import API, MONDAY, client_for, new_tenant, seed_basic_factory, add_order

WINDOW = {"date_from": "2030-03-04", "date_to": "2030-03-08"}


def _urls(order_id: int) -> list[tuple[str, dict]]:
    return [
        (f"{API}/summary", WINDOW),
        (f"{API}/capacity", WINDOW),
        (f"{API}/line-loading", WINDOW),
        (f"{API}/orders/{order_id}/readiness", {}),
        (f"{API}/orders/{order_id}/delivery-prediction", {}),
    ]


@pytest.mark.parametrize("flags", [None, {}, {MANUFACTURING_INTELLIGENCE_V1: False}, {MANUFACTURING_INTELLIGENCE_V1: "true"}, {MANUFACTURING_INTELLIGENCE_V1: 1}, "x"])
def test_flag_helpers_are_strict_true(flags):
    assert is_manufacturing_intelligence_v1_enabled(flags) is False
    assert is_planning_math_v2_enabled(flags) is False
    assert is_mfg_order_bom_readiness_v2_enabled(flags) is False


def test_flags_are_default_off_and_never_default_on():
    for key in (MANUFACTURING_INTELLIGENCE_V1, PLANNING_MATH_V2, MFG_ORDER_BOM_READINESS_V2):
        assert key not in DEFAULT_ON_FEATURE_FLAGS
        assert key not in with_effective_default_flags({})
    assert is_manufacturing_intelligence_v1_enabled({MANUFACTURING_INTELLIGENCE_V1: True}) is True


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "flags",
    [
        {},
        {MANUFACTURING_INTELLIGENCE_V1: False, PLANNING_MATH_V2: True, MFG_ORDER_BOM_READINESS_V2: True},
        {MANUFACTURING_INTELLIGENCE_V1: "true"},
        # The other two flags alone never switch the feature on.
        {PLANNING_MATH_V2: True, MFG_ORDER_BOM_READINESS_V2: True},
    ],
)
async def test_every_endpoint_is_404_when_flag_off(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=flags)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=MONDAY)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for url, params in _urls(order.id):
            r = await c.get(url, params=params)
            assert r.status_code == 404, (url, r.text)
            assert r.json()["detail"] == "Not found"


@pytest.mark.asyncio
async def test_only_get_routes_exist(db_session_integration):
    from fastapi.routing import APIRoute

    from app.main import app

    routes = [r for r in app.routes if isinstance(r, APIRoute) and r.path.startswith(API)]
    # Phase 1 routes stay GET-only; the Phase 2 allocation routes (mfg_planning, run R2) are the only writes
    # Phase 1 = the read-only package itself (module app.modules.mfg_intelligence.router)
    phase1 = [r for r in routes if r.endpoint.__module__ == "app.modules.mfg_intelligence.router"]
    assert len(phase1) == 5
    for r in phase1:
        assert r.methods == {"GET"}, r.path
    # Phase 3 (cost at completion, cash requirement) lives in the read-only package too: GET only
    phase3 = [r for r in routes if r.endpoint.__module__ == "app.modules.mfg_intelligence.finance_router"]
    assert len(phase3) == 3
    for r in phase3:
        assert r.methods == {"GET"}, r.path
    # Phase 4 predictive reads live in the read-only package too: GET only
    phase4 = [r for r in routes if r.endpoint.__module__ == "app.modules.mfg_intelligence.predictive_router"]
    assert len(phase4) == 6
    for r in phase4:
        assert r.methods == {"GET"}, r.path
    # Phase 5 forward plan / scenarios live in the read-only package too: GET only
    phase5 = [r for r in routes if r.endpoint.__module__ == "app.modules.mfg_intelligence.advanced_planning_router"]
    assert len(phase5) == 5
    for r in phase5:
        assert r.methods == {"GET"}, r.path
    for r in routes:
        if r not in phase1 and r not in phase3 and r not in phase4 and r not in phase5:
            assert r.endpoint.__module__ in (
                "app.modules.mfg_planning.allocation_router",
                "app.modules.mfg_planning.planning_router",
                "app.modules.mfg_planning.assignments_router",
                "app.modules.mfg_planning.predictive_router",
                "app.modules.mfg_planning.scheduler_router",
            ), r.path


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "flags",
    [
        {},
        {"mfg_cost_intelligence_v1": True, "mfg_financial_readiness_v1": True},  # without manufacturing_intelligence_v1
        {MANUFACTURING_INTELLIGENCE_V1: True, PLANNING_MATH_V2: True},
        {MANUFACTURING_INTELLIGENCE_V1: True, "mfg_cost_intelligence_v1": "true", "mfg_financial_readiness_v1": 1},
    ],
)
async def test_phase3_endpoints_are_404_without_their_flags(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=flags)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=MONDAY)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for url, params in (
            (f"{API}/orders/{order.id}/cost-at-completion", {}),
            (f"{API}/cost-at-completion", {}),
            (f"{API}/cash-requirement", {"horizon_days": 7}),
        ):
            r = await c.get(url, params=params)
            assert r.status_code == 404, (url, r.text)
            assert r.json()["detail"] == "Not found"


@pytest.mark.asyncio
async def test_phase3_flags_leave_phase1_and_phase2_responses_unchanged(db_session_integration):
    """Switching the Phase 3 flags on changes no byte of the Phase 1 / 2 GET responses."""
    db = db_session_integration
    base_flags = {MANUFACTURING_INTELLIGENCE_V1: True, PLANNING_MATH_V2: True, MFG_ORDER_BOM_READINESS_V2: True,
                  "mfg_integrated_planning_v1": True}
    tenant, user, _ = await new_tenant(db, flags=base_flags)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=MONDAY)
    await db.commit()
    urls = _urls(order.id) + [(f"{API}/planning-settings", {}), (f"{API}/tentative-demand", {})]

    async def snapshot() -> list[str]:
        async with client_for(db, tenant, user) as c:
            out = []
            for url, params in urls:
                r = await c.get(url, params=params)
                assert r.status_code == 200, (url, r.text)
                out.append(r.text)
            return out

    before = await snapshot()
    tenant.feature_flags = {**base_flags, "mfg_cost_intelligence_v1": True}
    await db.commit()
    with_cost = await snapshot()
    # only planning-settings gains the Phase 3 keys (index 5); every Phase 1 response and tentative demand is identical
    assert with_cost[:5] == before[:5] and with_cost[6:] == before[6:]
    tenant.feature_flags = dict(base_flags)
    await db.commit()
    assert await snapshot() == before


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "flags",
    [
        {},
        # integrated planning alone never switches the R4 endpoints on
        {"mfg_integrated_planning_v1": True},
        {MANUFACTURING_INTELLIGENCE_V1: True, PLANNING_MATH_V2: True},
        {MANUFACTURING_INTELLIGENCE_V1: True, "mfg_integrated_planning_v1": "true"},
    ],
)
async def test_phase2_r4_endpoints_are_404_without_both_flags(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=flags)
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=MONDAY)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for method, url, kw in (
            ("get", f"{API}/line-assignments/employees", {}),
            ("get", f"{API}/line-assignments/machines", {}),
            ("get", f"{API}/route-stages", {"params": {"order_id": order.id}}),
            ("get", f"{API}/styles/{fx.style.id}/standard-smv", {}),
            ("put", f"{API}/styles/{fx.style.id}/standard-smv",
             {"json": {"smv": "12.5", "source": "IE_STUDY", "confidence": "HIGH", "reason": "time study done"}}),
        ):
            r = await getattr(c, method)(url, **kw)
            assert r.status_code == 404, (url, r.text)
    await db.refresh(fx.style)
    assert fx.style.standard_smv is None
