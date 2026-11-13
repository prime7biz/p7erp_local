"""Phase 5 demand layers: every piece of demand in exactly one layer (doc 16 D4-D9, 15.2-15.5).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_forward_plan_layers.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal

from app.models import OrderFollowupAction
from tests.mfg_finance_fixtures import add_quotation
from tests.mfg_forward_fixtures import (
    ADV_FLAGS,
    FP,
    INTEGRATED,
    TODAY,
    add_booking,
    add_inquiry,
    add_order,
    add_plan,
    adv_tenant,
    base_row,
    dec,
    layer_total,
    pinned_today,  # noqa: F401 - autouse fixture
)
from tests.mfg_intel_fixtures import add_style_with_ob, client_for

SMV = Decimal("12.5")
ZERO = Decimal("0")
PLAN = {"efficiency_basis": "PLAN"}


async def _get(db, tenant, user, **params):
    async with client_for(db, tenant, user) as c:
        r = await c.get(FP, params={"horizon_days": 90, **PLAN, **params})
    assert r.status_code == 200, r.text
    return r.json()


async def test_layer_identity_with_completed_and_draft_rows(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=1000, delivery=TODAY + timedelta(days=60))
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=11), qty="300",
                   done="100", order=order, ob=fx.ob, style=fx.style)
    await add_plan(db, tenant, fx.line, start=TODAY - timedelta(days=30), end=TODAY - timedelta(days=20), qty="200",
                   done="200", order=order, ob=fx.ob, style=fx.style, rs="COMPLETED")
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=14), end=TODAY + timedelta(days=18), qty="400",
                   order=order, ob=fx.ob, style=fx.style, rs="DRAFT")
    await db.commit()
    body = await _get(db, tenant, user)
    ident = next(i for i in body["identity"]["orders"] if i["order_id"] == order.id)
    assert (dec(ident["completed_qty"]), dec(ident["remaining_qty"]), dec(ident["unplanned_qty"])) == (200 + 100, 200, 500)
    assert dec(ident["completed_qty"]) + dec(ident["remaining_qty"]) + dec(ident["unplanned_qty"]) == dec(ident["order_qty"])
    assert "DRAFT_ROWS_PRESENT" in ident["reason_codes"] and "DRAFT_ROWS_PRESENT" in body["reason_codes"]
    assert body["counts"]["draft_rows"] == 1
    planned = layer_total(body, "CONFIRMED_PLANNED_FIRM")
    unplanned = layer_total(body, "CONFIRMED_UNPLANNED") + layer_total(body, "OVERDUE_UNPLANNED")
    assert planned == 200 * SMV and unplanned == 500 * SMV
    # minutes identity: (completed + remaining + unplanned) x SMV = order qty x SMV; DRAFT never loads
    assert (300 * SMV) + planned + unplanned == 1000 * SMV
    assert dec(body["totals"]["load_minutes"]) == planned + unplanned


async def test_over_planned_order_has_no_unplanned(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=60))
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=9), qty="150",
                   order=order, ob=fx.ob, style=fx.style)
    await db.commit()
    body = await _get(db, tenant, user)
    ident = next(i for i in body["identity"]["orders"] if i["order_id"] == order.id)
    assert dec(ident["unplanned_qty"]) == 0 and "OVER_PLANNED" in ident["reason_codes"]
    assert layer_total(body, "CONFIRMED_UNPLANNED") == 0


async def test_overdue_backlog_and_respread_from_today(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    order = await add_order(db, tenant, fx.customer, fx.style, qty=1200, delivery=TODAY + timedelta(days=60))
    # ended last week with 100 pieces left -> overdue backlog (first bucket)
    await add_plan(db, tenant, fx.line, start=TODAY - timedelta(days=14), end=TODAY - timedelta(days=7), qty="400",
                   done="300", order=order, ob=fx.ob, style=fx.style)
    # stale: ended 90 days ago (outside the capacity look-back) with 50 pieces left -> still overdue backlog
    await add_plan(db, tenant, fx.line, start=TODAY - timedelta(days=100), end=TODAY - timedelta(days=90), qty="250",
                   done="200", order=order, ob=fx.ob, style=fx.style)
    # started 5 days ago, ends Friday: remaining 500 re-spread over Mon..Fri of this week only
    await add_plan(db, tenant, fx.line, start=TODAY - timedelta(days=5), end=TODAY + timedelta(days=4), qty="550",
                   done="50", order=order, ob=fx.ob, style=fx.style)
    await db.commit()
    body = await _get(db, tenant, user)
    first = body["buckets"][0]
    assert dec(first["layers"]["OVERDUE_PLANNED_BACKLOG"]) == (100 + 50) * SMV
    assert layer_total(body, "OVERDUE_PLANNED_BACKLOG") == (100 + 50) * SMV
    assert dec(first["layers"]["CONFIRMED_PLANNED_FIRM"]) == 500 * SMV
    ident = next(i for i in body["identity"]["orders"] if i["order_id"] == order.id)
    assert dec(ident["completed_qty"]) + dec(ident["remaining_qty"]) + dec(ident["unplanned_qty"]) == 1200


async def test_unconfirmed_and_unlinked_rows_are_separate_layers(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    draft_order = await add_order(db, tenant, fx.customer, fx.style, status="DRAFT", qty=100, delivery=TODAY + timedelta(days=40))
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=7), qty="80",
                   order=draft_order, ob=fx.ob, style=fx.style, rs="SOFT_BOOKED")
    await add_plan(db, tenant, fx.line, start=TODAY + timedelta(days=8), end=TODAY + timedelta(days=8), qty="40",
                   ob=fx.ob, style=fx.style)
    await add_order(db, tenant, fx.customer, fx.style, status="DRAFT", qty=100)  # no rows -> notice only
    await db.commit()
    body = await _get(db, tenant, user)
    assert layer_total(body, "UNCONFIRMED_ORDER_ROWS") == 80 * SMV
    assert layer_total(body, "UNLINKED_ROWS") == 40 * SMV
    assert layer_total(body, "CONFIRMED_PLANNED_FIRM") == 0 and layer_total(body, "CONFIRMED_PLANNED_SOFT") == 0
    assert body["counts"]["unconfirmed_orders_without_rows"] == 1
    assert any(n.startswith("UNCONFIRMED_ORDERS_WITHOUT_ROWS") for n in body["notices"])


async def test_tentative_dedupe_converted_and_inquiry_plus_quotation_counted_once(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, INTEGRATED: True})
    await base_row(db, tenant, fx)
    week2 = (TODAY + timedelta(days=7), TODAY + timedelta(days=11))
    # converted: an order exists for the quotation -> counted only as the confirmed order
    q_conv = await add_quotation(db, tenant, fx.customer)
    conv_order = await add_order(db, tenant, fx.customer, fx.style, qty=100, delivery=TODAY + timedelta(days=50))
    conv_order.quotation_id = q_conv.id
    await add_booking(db, tenant, fx, start=week2[0], end=week2[1], qty="100", conf="80", quotation=q_conv)
    # inquiry booking + quotation booking of the same inquiry -> only the quotation booking counts
    inq = await add_inquiry(db, tenant, fx.customer)
    q2 = await add_quotation(db, tenant, fx.customer)
    q2.inquiry_id = inq.id
    await add_booking(db, tenant, fx, start=week2[0], end=week2[1], qty="200", conf="40", inquiry=inq)
    await add_booking(db, tenant, fx, start=week2[0], end=week2[1], qty="200", conf="60", quotation=q2)
    await db.commit()
    body = await _get(db, tenant, user)
    assert layer_total(body, "TENTATIVE_FULL") == 200 * SMV
    assert layer_total(body, "TENTATIVE_WEIGHTED") == 200 * SMV * Decimal("0.6")
    unplanned = layer_total(body, "CONFIRMED_UNPLANNED") + layer_total(body, "OVERDUE_UNPLANNED")
    assert unplanned == 100 * SMV  # the converted order counts once, as confirmed


async def test_weighted_never_added_to_full(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, INTEGRATED: True})
    await base_row(db, tenant, fx)
    inq = await add_inquiry(db, tenant, fx.customer)
    await add_booking(db, tenant, fx, start=TODAY + timedelta(days=7), end=TODAY + timedelta(days=11), qty="400",
                      conf="25", inquiry=inq)
    await db.commit()
    base = await _get(db, tenant, user, scenario="BASE")
    cons = await _get(db, tenant, user, scenario="CONSERVATIVE")
    full, weighted = layer_total(base, "TENTATIVE_FULL"), layer_total(base, "TENTATIVE_WEIGHTED")
    assert weighted <= full and weighted == full * Decimal("0.25")
    assert "TENTATIVE_WEIGHTED" in base["layers_included"] and "TENTATIVE_FULL" not in base["layers_included"]
    assert "TENTATIVE_FULL" in cons["layers_included"] and "TENTATIVE_WEIGHTED" not in cons["layers_included"]
    assert dec(base["totals"]["load_minutes"]) == weighted
    assert dec(cons["totals"]["load_minutes"]) == full


async def test_unplanned_spread_backward_from_need_by_with_post_sewing_lead(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db, flags={**ADV_FLAGS, INTEGRATED: True})
    await base_row(db, tenant, fx)
    delivery = TODAY + timedelta(days=46)  # Friday 2030-04-19
    order = await add_order(db, tenant, fx.customer, fx.style, qty=2000, delivery=delivery)
    db.add(OrderFollowupAction(tenant_id=tenant.id, order_id=order.id, phase="production", title="Washing",
                               status="pending", stage_kind="EXTERNAL_PROCESS", stage_position="POST_SEWING",
                               lead_time_days=4, is_active=True))
    beyond = await add_order(db, tenant, fx.customer, fx.style, qty=10, delivery=TODAY + timedelta(days=300))
    late = await add_order(db, tenant, fx.customer, fx.style, qty=40, delivery=TODAY - timedelta(days=3))
    await db.commit()
    body = await _get(db, tenant, user)
    minutes = 2000 * SMV  # 25,000 / 8,640 per day -> 3 working days ending on need-by (Monday 2030-04-15)
    need_by = delivery - timedelta(days=4)
    ident = next(i for i in body["identity"]["orders"] if i["order_id"] == order.id)
    assert ident["need_by_date"] == need_by.isoformat()
    week_of_need = (need_by - TODAY).days // 7
    spread = [b for b in body["buckets"] if dec(b["layers"]["CONFIRMED_UNPLANNED"]) > 0]
    assert sum((dec(b["layers"]["CONFIRMED_UNPLANNED"]) for b in spread), Decimal("0")) == minutes
    assert {b["index"] for b in spread} <= {week_of_need - 1, week_of_need}
    assert all(date.fromisoformat(b["start"]) <= need_by for b in spread)
    assert body["counts"]["unplanned_need_by_beyond_horizon"] == 1 and beyond.id
    assert dec(body["buckets"][0]["layers"]["OVERDUE_UNPLANNED"]) == 40 * SMV and late.id
    assert dec(body["median_line_daily_minutes"]) == Decimal("8640")


async def test_unplanned_without_post_sewing_reason_when_integrated_off(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    await base_row(db, tenant, fx)
    await add_order(db, tenant, fx.customer, fx.style, qty=10, delivery=TODAY + timedelta(days=20))
    await db.commit()
    body = await _get(db, tenant, user)
    assert "POST_SEWING_NOT_APPLIED" in body["reason_codes"]
    assert any(n.startswith("TENTATIVE_REQUIRES_INTEGRATED_PLANNING") for n in body["notices"])


async def _history_order(db, tenant, fx, style, month_start: date, qty=100, status="COMPLETED"):
    return await add_order(db, tenant, fx.customer, style, status=status, qty=qty, delivery=month_start + timedelta(days=9))


def _months_back(day: date, k: int) -> date:
    idx = day.year * 12 + day.month - 1 - k
    return date(idx // 12, idx % 12 + 1, 1)


async def test_forecast_unavailable_under_12_months(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    for k in range(1, 9):  # 8 months of history only
        await _history_order(db, tenant, fx, fx.style, _months_back(TODAY, k))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{FP}/forecast-demand", params={"horizon_days": 90})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["availability"] == "UNAVAILABLE" and body["tenant_history_sufficient"] is False
    assert all(f["availability"] == "INSUFFICIENT_HISTORY" for f in body["families"])


async def test_forecast_available_per_family_and_consumed_by_confirmed(db_session_integration):
    db = db_session_integration
    tenant, user, _role, fx = await adv_tenant(db)
    fx.style.product_type = "Knit"
    _c, woven, _ob = await add_style_with_ob(db, tenant, customer=fx.customer)
    woven.product_type = "Woven"
    for k in range(1, 15):  # 14 months of KNIT history, 400 pcs each
        await _history_order(db, tenant, fx, fx.style, _months_back(TODAY, k), qty=400)
    for k in (1, 2, 3):  # only 3 months of WOVEN -> insufficient for that family
        await _history_order(db, tenant, fx, woven, _months_back(TODAY, k), qty=100)
    # a confirmed order ex-factory this month consumes 300 pcs of March's forecast (same month last year = 400)
    await add_order(db, tenant, fx.customer, fx.style, qty=300, delivery=TODAY + timedelta(days=10))
    await db.commit()
    async with client_for(db, tenant, user) as c:
        body = (await c.get(f"{FP}/forecast-demand", params={"horizon_days": 90})).json()
        plan = (await c.get(FP, params={"horizon_days": 90, "scenario": "CONSERVATIVE", "efficiency_basis": "PLAN"})).json()
        base = (await c.get(FP, params={"horizon_days": 90, "efficiency_basis": "PLAN"})).json()
    fams = {f["family"]: f for f in body["families"]}
    assert fams["KNIT"]["availability"] == "AVAILABLE" and fams["WOVEN"]["availability"] == "INSUFFICIENT_HISTORY"
    march = next(m for m in fams["KNIT"]["months"] if m["month"] == "2030-03")
    assert dec(march["forecast_minutes"]) == 400 * SMV
    assert dec(march["consumed_minutes"]) == 300 * SMV and dec(march["residual_minutes"]) == 100 * SMV
    assert body["label"] == "FORECAST_AT_EXFACTORY_MONTH" and body["method"] == "SEASONAL_NAIVE_12M"
    # residual only in CONSERVATIVE, never in confirmed / BASE
    assert layer_total(plan, "FORECAST_RESIDUAL") > 0 and "FORECAST_RESIDUAL" in plan["layers_included"]
    assert "FORECAST_RESIDUAL" not in base["layers_included"]
    confirmed = sum((layer_total(base, k) for k in ("CONFIRMED_PLANNED_FIRM", "CONFIRMED_PLANNED_SOFT", "CONFIRMED_UNPLANNED",
                                                       "OVERDUE_UNPLANNED")), ZERO)
    assert confirmed == 300 * SMV
