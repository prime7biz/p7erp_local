"""Delivery forecast P50 / P80 / P90 + on-time probability (plan 15 sections 5.5, D10-D13, 17.10-17.14).

Run: docker compose exec -T backend pytest tests/test_mfg_delivery_forecast.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from tests.mfg_alloc_fixtures import add_order_bom, add_po
from tests.mfg_intel_fixtures import add_order, add_plan, client_for
from tests.mfg_predictive_fixtures import (
    API,
    FLAGS_P4,
    PRED,
    TODAY,
    add_late_history,
    add_supply_basics,
    freeze_today,
    new_predictive_tenant,
    seed_history,
)

VARIED = [D(x) for x in ("0.45", "0.55", "0.60", "0.50", "0.65", "0.58", "0.52", "0.62", "0.48", "0.57")] * 3


async def _order_with_plan(db, tenant, fx, *, qty=1000, delivery: date | None = date(2030, 3, 20), status="CONFIRMED"):
    order = await add_order(db, tenant, fx.customer, fx.style, status=status, qty=qty, delivery=delivery)
    await add_plan(db, tenant, fx.line, start=TODAY, end=TODAY + timedelta(days=10), qty=str(qty), order=order, ob=fx.ob)
    return order


async def _forecast(c, order_id: int) -> dict:
    r = await c.get(f"{PRED}/orders/{order_id}/delivery-forecast")
    assert r.status_code == 200, r.text
    return r.json()


@pytest.mark.asyncio
async def test_p50_equals_phase1_likely_without_history(db_session_integration, monkeypatch):
    """n < 10 history days (planning_math_v2 on): planned efficiency, fixed bands, no probability (17.12)."""
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    order = await _order_with_plan(db, tenant, fx)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        phase1 = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
        body = await _forecast(c, order.id)
    assert phase1["likely_complete_date"] is not None
    assert body["p50_date"] == phase1["likely_complete_date"]
    assert body["p90_date"] == phase1["pessimistic_complete_date"]
    assert body["daily_rate_likely"] == phase1["daily_rate_likely"]
    assert body["p80_date"] is None
    assert body["on_time_probability"] is None and body["probability_display"] is None
    assert body["spread_mode"] == "FIXED_BANDS"
    assert "INSUFFICIENT_HISTORY" in body["reason_codes"]
    assert body["confidence"] == "LOW" and body["efficiency_source"] == "PLANNED"
    assert body["calibration_label"] == "uncalibrated" and body["calibrated"] is False
    assert body["band"] == phase1["band"]


@pytest.mark.asyncio
async def test_quantiles_are_ordered_and_probability_from_grid(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    await seed_history(db, tenant, fx, VARIED)
    order = await _order_with_plan(db, tenant, fx, qty=5000)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = await _forecast(c, order.id)
    assert body["spread_mode"] == "EMPIRICAL_SPREAD", body["reason_codes"]
    p50, p80, p90 = (date.fromisoformat(body[k]) for k in ("p50_date", "p80_date", "p90_date"))
    assert p50 <= p80 <= p90
    finishes = [date.fromisoformat(g["finish_date"]) for g in body["grid"]]
    assert len(finishes) == 19 and finishes == sorted(finishes)
    target = date.fromisoformat(body["target_date"])
    on_time = [D(g["q"]) for g in body["grid"] if date.fromisoformat(g["finish_date"]) <= target]
    expected = D("0.025") if not on_time else (D("0.975") if max(on_time) == D("0.95") else max(on_time))
    assert D(body["on_time_probability"]) == expected
    assert body["efficiency_source"] == "BLENDED"
    assert body["lines"][0]["efficiency"]["n"] == 30
    assert {d["driver"] for d in body["drivers"]} == {"MATERIAL", "EFFICIENCY", "LOAD"}
    assert body["inputs_hash"] and len(body["inputs_hash"]) == 64


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "delivery, probability, display, band",
    [(date(2031, 3, 1), "0.9750", ">= 95 %", "ON_TRACK"), (TODAY, "0.0250", "< 5 %", "LATE")],
)
async def test_probability_grid_ends(db_session_integration, monkeypatch, delivery, probability, display, band):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    await seed_history(db, tenant, fx, VARIED)
    order = await _order_with_plan(db, tenant, fx, qty=5000, delivery=delivery)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = await _forecast(c, order.id)
    assert (body["on_time_probability"], body["probability_display"], body["band"]) == (probability, display, band)


@pytest.mark.asyncio
async def test_material_not_on_order_is_unknown_never_a_date(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db, flags={**FLAGS_P4, "mfg_order_bom_readiness_v2": True})
    sb = await add_supply_basics(db, tenant)
    order = await _order_with_plan(db, tenant, fx)
    await add_order_bom(db, tenant, order, [(sb.item, "1")])
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = await _forecast(c, order.id)
    assert body["band"] == "UNKNOWN"
    assert "MATERIAL_NOT_ON_ORDER" in body["reason_codes"]
    assert body["p50_date"] is None and body["p90_date"] is None
    assert body["material"]["status"] == "UNKNOWN"


@pytest.mark.asyncio
async def test_material_waits_for_po_with_supplier_lateness(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db, flags={**FLAGS_P4, "mfg_order_bom_readiness_v2": True})
    sb = await add_supply_basics(db, tenant)
    await add_late_history(db, tenant, sb, [0, 2, 4, 6, 20])  # P50 4, P90 20 days late
    order = await _order_with_plan(db, tenant, fx, delivery=date(2030, 6, 1))
    await add_order_bom(db, tenant, order, [(sb.item, "1")])
    eta = TODAY + timedelta(days=10)
    _po, _line = await add_po(db, tenant, sb.vendor, sb.item, "1000", status="APPROVED", expected_date=eta)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = await _forecast(c, order.id)
    material = body["material"]
    assert material["status"] == "DATED", body["reason_codes"]
    assert material["ready_p50"] == (eta + timedelta(days=4)).isoformat()
    assert material["ready_p90"] == (eta + timedelta(days=20)).isoformat()
    assert material["lateness_source"] == "VENDOR_CATEGORY"
    assert material["shared_supply"] is True and "SHARED_SUPPLY_NOT_ALLOCATED" in body["reason_codes"]
    assert material["po_lines"][0]["eta_source"] == "PO_EXPECTED_DATE"
    assert date.fromisoformat(body["start_date"]) >= eta + timedelta(days=4)
    assert date.fromisoformat(body["p50_date"]) <= date.fromisoformat(body["p90_date"])
    assert body["confidence"] in ("LOW", "MEDIUM")


@pytest.mark.asyncio
async def test_po_detail_hidden_without_inventory_read(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    flags = {**FLAGS_P4, "mfg_order_bom_readiness_v2": True, "rbac_enforcement": "enforce"}
    tenant, user, fx = await new_predictive_tenant(
        db, flags=flags, permissions={"production.planning.read": True, "inventory.access": False, "inventory.items.read": False}
    )
    sb = await add_supply_basics(db, tenant)
    order = await _order_with_plan(db, tenant, fx, delivery=date(2030, 6, 1))
    await add_order_bom(db, tenant, order, [(sb.item, "1")])
    await add_po(db, tenant, sb.vendor, sb.item, "1000", status="APPROVED", expected_date=TODAY + timedelta(days=10))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = await _forecast(c, order.id)
    assert body["material"]["status"] == "DATED"
    assert body["material"]["po_lines"] == []
    assert "PO_DETAIL_HIDDEN_NO_INVENTORY_ACCESS" in body["reason_codes"]


@pytest.mark.asyncio
async def test_unconfirmed_and_complete_orders(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, fx = await new_predictive_tenant(db)
    draft = await _order_with_plan(db, tenant, fx, status="DRAFT")
    done = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=date(2030, 3, 20))
    await add_plan(db, tenant, fx.line, start=TODAY, qty="100", done="100", order=done, ob=fx.ob, rs="COMPLETED")
    await db.commit()
    async with client_for(db, tenant, user) as c:
        assert (await _forecast(c, draft.id))["reason_codes"] == ["ORDER_NOT_CONFIRMED"]
        body = await _forecast(c, done.id)
        assert body["band"] == "COMPLETE"


@pytest.mark.asyncio
async def test_other_tenant_order_is_404(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, _fx = await new_predictive_tenant(db)
    other, _u2, fx2 = await new_predictive_tenant(db)
    foreign = await _order_with_plan(db, other, fx2)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{PRED}/orders/{foreign.id}/delivery-forecast")
        assert r.status_code == 404 and r.json()["detail"] == "Order not found"
