"""A2, A3, A20: tenant isolation and the `production.planning.read` permission.

Run: docker compose exec backend pytest tests/test_mfg_intelligence_tenant_isolation.py -q
"""

from __future__ import annotations

from datetime import date

import pytest

from app.common.permissions import require_internal_permission  # noqa: F401  (documents the gate under test)
from tests.mfg_intel_fixtures import (
    API,
    FLAGS_ON,
    MONDAY,
    add_line,
    add_order,
    add_plan,
    client_for,
    new_tenant,
    seed_basic_factory,
)

WINDOW = {"date_from": "2030-03-04", "date_to": "2030-03-08"}
FRIDAY = date(2030, 3, 8)


async def _two_tenants(db):
    ta, ua, _ = await new_tenant(db, flags=FLAGS_ON)
    tb, ub, _ = await new_tenant(db, flags=FLAGS_ON)
    fa = await seed_basic_factory(db, ta)
    fb = await seed_basic_factory(db, tb)
    # Tenant B has an extra, differently named line and a big confirmed order that must never leak.
    lb2 = await add_line(db, tb, "B-ONLY-LINE")
    order_a = await add_order(db, ta, fa.customer, fa.style, qty=1000, delivery=FRIDAY)
    order_b = await add_order(db, tb, fb.customer, fb.style, qty=999999, delivery=FRIDAY)
    await add_plan(db, ta, fa.line, start=MONDAY, end=FRIDAY, qty="500", order=order_a, ob=fa.ob, shift=fa.shift)
    await add_plan(db, tb, fb.line, start=MONDAY, end=FRIDAY, qty="777777", order=order_b, ob=fb.ob, shift=fb.shift)
    await add_plan(db, tb, lb2, start=MONDAY, end=FRIDAY, qty="333333", order=order_b, ob=fb.ob, shift=fb.shift)
    await db.commit()
    return ta, ua, order_a, tb, ub, order_b


@pytest.mark.asyncio
async def test_other_tenant_order_is_404_order_not_found(db_session_integration):
    db = db_session_integration
    ta, ua, order_a, _tb, _ub, order_b = await _two_tenants(db)
    async with client_for(db, ta, ua) as c:
        for suffix in ("readiness", "delivery-prediction"):
            own = await c.get(f"{API}/orders/{order_a.id}/{suffix}")
            assert own.status_code == 200, own.text
            foreign = await c.get(f"{API}/orders/{order_b.id}/{suffix}")
            assert foreign.status_code == 404
            assert foreign.json()["detail"] == "Order not found"
            missing = await c.get(f"{API}/orders/999999999/{suffix}")
            assert missing.status_code == 404
            # A foreign id and a non-existent id are indistinguishable.
            assert missing.json() == foreign.json()


@pytest.mark.asyncio
async def test_tenant_b_data_never_appears_in_tenant_a_views(db_session_integration):
    db = db_session_integration
    ta, ua, order_a, tb, _ub, order_b = await _two_tenants(db)
    async with client_for(db, ta, ua) as c:
        cap = (await c.get(f"{API}/capacity", params=WINDOW)).json()
        assert [ln["line_code"] for ln in cap["lines"]] == ["L1"]
        assert "B-ONLY-LINE" not in str(cap)
        # Only tenant A's 500 pieces x 12.5 SMV = 6250 firm minutes (never 777777 / 333333 x 12.5).
        assert cap["lines"][0]["totals"]["firm_smv_minutes"] == "6250.00"

        loading = (await c.get(f"{API}/line-loading", params=WINDOW)).json()
        assert {r["order_id"] for r in loading["rows"]} == {order_a.id}
        assert str(order_b.id) not in {str(r["order_id"]) for r in loading["rows"]}
        assert all(r["line_code"] == "L1" for r in loading["line_days"])

        summary = (await c.get(f"{API}/summary", params=WINDOW)).json()
        assert summary["orders"]["confirmed_total"] == 1
        assert summary["capacity"]["line_count"] == 1
        assert summary["capacity"]["firm_smv_minutes"] == "6250.00"

        # Another tenant's line id as a filter finds nothing instead of leaking it.
        other_line = cap["lines"][0]["line_id"] + 1
        filtered = (await c.get(f"{API}/capacity", params={**WINDOW, "line_id": other_line})).json()
        assert filtered["lines"] == []

    # And the mirror image: tenant B sees its own two lines only.
    async with client_for(db, tb, _ub) as c:
        cap_b = (await c.get(f"{API}/capacity", params=WINDOW)).json()
        assert sorted(ln["line_code"] for ln in cap_b["lines"]) == ["B-ONLY-LINE", "L1"]


@pytest.mark.asyncio
async def test_user_of_another_tenant_gets_403_tenant_mismatch(db_session_integration):
    db = db_session_integration
    ta, ua, _oa, tb, _ub, _ob = await _two_tenants(db)
    async with client_for(db, tb, ua) as c:  # user of A, tenant resolved as B
        r = await c.get(f"{API}/capacity", params=WINDOW)
        assert r.status_code == 403
        assert r.json()["detail"] == "Tenant mismatch"


@pytest.mark.asyncio
async def test_permission_false_is_403_under_rbac_enforce(db_session_integration):
    db = db_session_integration
    flags = {**FLAGS_ON, "rbac_enforcement": "enforce"}
    tenant, user, _ = await new_tenant(db, flags=flags, permissions={"production.planning.read": False})
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=FRIDAY)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for url, params in [
            (f"{API}/summary", WINDOW),
            (f"{API}/capacity", WINDOW),
            (f"{API}/line-loading", WINDOW),
            (f"{API}/orders/{order.id}/readiness", {}),
            (f"{API}/orders/{order.id}/delivery-prediction", {}),
        ]:
            r = await c.get(url, params=params)
            assert r.status_code == 403, (url, r.text)


@pytest.mark.asyncio
async def test_permission_true_is_allowed_under_rbac_enforce(db_session_integration):
    db = db_session_integration
    flags = {**FLAGS_ON, "rbac_enforcement": "enforce"}
    tenant, user, _ = await new_tenant(db, flags=flags, permissions={"production.planning.read": True})
    await seed_basic_factory(db, tenant)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{API}/capacity", params=WINDOW)
        assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------- Phase 4 (predictive)

P4_FLAGS = {**FLAGS_ON, "mfg_predictive_intelligence_v1": True}


def _phase4_urls(order_id: int) -> list[tuple[str, dict]]:
    return [
        (f"{API}/predictive/orders/{order_id}/delivery-forecast", {}),
        (f"{API}/predictive/line-efficiency", {"date_to": "2026-01-05"}),
        (f"{API}/predictive/supplier-lateness", {}),
        (f"{API}/predictive/anomalies", {"date_from": "2026-01-01", "date_to": "2026-01-05"}),
        (f"{API}/predictive/calibration", {}),
        (f"{API}/recommendations", {}),
    ]


@pytest.mark.asyncio
async def test_phase4_other_tenant_data_never_leaks(db_session_integration):
    from app.models.mfg_predictive import MfgPredictiveFinding

    db = db_session_integration
    ta, ua, order_a, tb, _ub, order_b = await _two_tenants(db)
    ta.feature_flags = dict(P4_FLAGS)
    tb.feature_flags = dict(P4_FLAGS)
    db.add(MfgPredictiveFinding(tenant_id=tb.id, finding_key="DELIVERY_RISK:B", kind="DELIVERY_RISK", severity="high",
                                priority=5, order_id=order_b.id, first_detected_on=MONDAY, last_detected_on=MONDAY,
                                payload={"facts": []}))
    await db.commit()
    async with client_for(db, ta, ua) as c:
        own = await c.get(f"{API}/predictive/orders/{order_a.id}/delivery-forecast")
        assert own.status_code == 200, own.text
        foreign = await c.get(f"{API}/predictive/orders/{order_b.id}/delivery-forecast")
        missing = await c.get(f"{API}/predictive/orders/999999999/delivery-forecast")
        assert foreign.status_code == missing.status_code == 404
        assert foreign.json() == missing.json() == {"detail": "Order not found"}
        rec = (await c.get(f"{API}/recommendations", params={"status": "ALL"})).json()
        assert rec["items"] == []
        eff = (await c.get(f"{API}/predictive/line-efficiency", params={"date_to": "2026-01-05"})).json()
        assert [ln["line_code"] for ln in eff["lines"]] == ["L1"]
        # another tenant's (or a missing) line id is 404 on the Phase 4 GETs, never an empty-but-valid answer
        from app.models import SewingLine
        from sqlalchemy import select as _select

        b_line = (await db.execute(_select(SewingLine.id).where(SewingLine.tenant_id == tb.id).limit(1))).scalar_one()
        for url, params in (
            (f"{API}/predictive/line-efficiency", {"date_to": "2026-01-05", "line_id": b_line}),
            (f"{API}/predictive/anomalies", {"date_from": "2026-01-01", "date_to": "2026-01-05", "line_id": b_line}),
            (f"{API}/predictive/line-efficiency", {"date_to": "2026-01-05", "line_id": 999999999}),
        ):
            r = await c.get(url, params=params)
            assert r.status_code == 404 and r.json()["detail"].startswith("Sewing line"), (url, r.text)
    async with client_for(db, tb, ua) as c:  # user of A, tenant resolved as B
        for url, params in _phase4_urls(order_b.id):
            r = await c.get(url, params=params)
            assert r.status_code == 403 and r.json()["detail"] == "Tenant mismatch", url


@pytest.mark.asyncio
async def test_phase4_permission_false_is_403_under_rbac_enforce(db_session_integration):
    db = db_session_integration
    flags = {**P4_FLAGS, "rbac_enforcement": "enforce"}
    tenant, user, _ = await new_tenant(db, flags=flags, permissions={"production.planning.read": False})
    fx = await seed_basic_factory(db, tenant)
    order = await add_order(db, tenant, fx.customer, fx.style, delivery=FRIDAY)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        for url, params in _phase4_urls(order.id):
            r = await c.get(url, params=params)
            assert r.status_code == 403, (url, r.text)
