"""GL-based profitability (PLAN Phase 3, acceptance 3.2-3.5, 3.10). Hand-worked figures: see finance_control_fixtures.py.

Hand-worked results (2027, BDT):
  O1  revenue 10000, material 4000, cm 1500, overhead 300, finance_cost 200, other 0
      gross = 10000 - 4000 - 1500 - 0 = 4500, nett = 4500 - 300 - 200 = 4000, margin 40.0000
  O2  revenue 5500 (USD 50 at base 5500), material 2000 (COGS), gross = nett = 3500, margin 3500/5500 = 63.6364
  O3  revenue 3000, overhead 600 - 600 (reversal) = 0, nett 3000, margin 100.0000
  O4  revenue 0, overhead 100, nett -100, margin null
  Style S1 / Buyer A = O1 + O2: revenue 15500, material 6000, cm 1500, overhead 300, finance 200,
      gross 8000, nett 7500, margin 7500/15500 = 48.3871; budget 21000 / 8400 / 4200 / 1050
  Master contract MC1 = O1 + O2 + 700 CM on its cost centre: cm 2200, gross 7300, nett 6800, margin 43.8710
      (the COGS line that carries BOTH O2 and the LC cost centre is counted once, through the order)
  Unlinked (no order, no contract cost centre): rent 900 + rent 100 on a department cost centre = 1000, 2 lines

Run: docker compose exec -T backend pytest tests/test_finance_profitability_gl.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from tests.benchmark_fixtures import api_client
from tests.finance_control_fixtures import (
    CONTROL_FLAG,
    YEAR_2027,
    add_bulk_orders,
    seed_foreign_order_noise,
    seed_profit_world,
)
from tests.test_perf_inventory_reports_equivalence import QueryCounter

D = Decimal
API = "/api/v1/finance/profitability"
BUCKETS = ("revenue", "material", "cm", "overhead", "finance_cost", "other")


async def _get(ac, path: str, **params):
    return await ac.get(f"{API}/{path}", params=params)


def _actual(body: dict) -> dict[str, Decimal]:
    return {k: D(v) for k, v in body["actual"].items()}


def _expect(body: dict, **expected: str):
    got = _actual(body)
    for key in BUCKETS:
        assert got[key] == D(expected.get(key, "0")), (key, got[key], expected.get(key))


# ---- order ------------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_order_direct_actual_buckets_and_budget(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    o1 = w["orders"]["o1"]
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, f"orders/{o1.id}", **YEAR_2027)
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["entity"] == {"type": "order", "id": o1.id, "code": o1.order_code, "name": None}
    assert body["period"] == {"from_date": "2027-01-01", "to_date": "2027-12-31"}
    _expect(body, revenue="10000", material="4000", cm="1500", overhead="300", finance_cost="200")
    assert body["gross_profit"] == "4500.0000" and body["nett_profit"] == "4000.0000"
    assert body["margin_percent"] == "40.0000"
    assert body["budget"] == {"revenue": "10000.0000", "material": "4000.0000", "cm": "2000.0000", "other": "500.0000"}
    assert body["coverage"]["direct_voucher_lines"] == 5 and body["coverage"]["cost_center_lines"] == 0
    assert set(body) >= {
        "entity", "period", "budget", "actual", "gross_profit", "nett_profit", "margin_percent",
        "unattributed_actual", "coverage", "drilldown",
    }
    # draft / cancelled / memorandum / bare-reversed vouchers on O1 (99,999 each) never reach it
    assert D(body["actual"]["overhead"]) == D(300)


@pytest.mark.asyncio
async def test_foreign_currency_uses_base_amount_and_quotation_rate(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    o2 = w["orders"]["o2"]
    async with api_client(db, tenant, user) as ac:
        body = (await _get(ac, f"orders/{o2.id}", **YEAR_2027)).json()
    _expect(body, revenue="5500", material="2000")  # USD 50 posted at base 5500, not 50
    assert body["gross_profit"] == "3500.0000" and body["margin_percent"] == "63.6364"
    assert body["budget"] == {"revenue": "11000.0000", "material": "4400.0000", "cm": "2200.0000", "other": "550.0000"}


@pytest.mark.asyncio
async def test_reversed_voucher_nets_to_zero_through_the_original_order(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    o3, o1 = w["orders"]["o3"], w["orders"]["o1"]
    async with api_client(db, tenant, user) as ac:
        body = (await _get(ac, f"orders/{o3.id}", **YEAR_2027)).json()
        listing = (await ac.get(f"{API}/orders", params={**YEAR_2027})).json()
    # The reversal voucher carries no order id; it must follow the voucher it reverses.
    _expect(body, revenue="3000")
    assert body["nett_profit"] == "3000.0000" and body["margin_percent"] == "100.0000"
    assert body["coverage"]["direct_voucher_lines"] == 3  # sale + the reversed rent + its reversal
    # ...and must not leak into the unlinked pool (otherwise it would show as -600 there)
    assert body["unattributed_actual"] == "1000.0000" and body["coverage"]["unlinked_lines"] == 2
    assert listing["unlinked_lines"] == 2 and D(listing["unattributed_actual"]) == D(1000)
    assert o1.id  # silence unused


@pytest.mark.asyncio
async def test_zero_revenue_margin_is_null_and_period_filter(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    o1, o4 = w["orders"]["o1"], w["orders"]["o4"]
    async with api_client(db, tenant, user) as ac:
        o4_body = (await _get(ac, f"orders/{o4.id}", **YEAR_2027)).json()
        feb_on = (await _get(ac, f"orders/{o1.id}", from_date="2027-02-01", to_date="2027-12-31")).json()
        jan_only = (await _get(ac, f"orders/{o1.id}", from_date="2027-01-01", to_date="2027-01-31")).json()
    assert o4_body["margin_percent"] is None and o4_body["nett_profit"] == "-100.0000"
    _expect(o4_body, overhead="100")
    assert feb_on["margin_percent"] is None  # costs but no revenue in the window
    _expect(feb_on, material="4000", cm="1500", overhead="300", finance_cost="200")
    assert feb_on["gross_profit"] == "-5500.0000" and feb_on["nett_profit"] == "-6000.0000"
    _expect(jan_only, revenue="10000")
    assert jan_only["margin_percent"] == "100.0000"


# ---- rollups ----------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_style_and_buyer_roll_up_their_orders(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    async with api_client(db, tenant, user) as ac:
        style = (await _get(ac, f"styles/{w['style'].id}", **YEAR_2027)).json()
        buyer_a = (await _get(ac, f"buyers/{w['customers']['a'].id}", **YEAR_2027)).json()
        buyer_b = (await _get(ac, f"buyers/{w['customers']['b'].id}", **YEAR_2027)).json()
        buyer_c = (await _get(ac, f"buyers/{w['customers']['c'].id}", **YEAR_2027)).json()
    for body, kind in ((style, "style"), (buyer_a, "buyer")):
        assert body["entity"]["type"] == kind
        _expect(body, revenue="15500", material="6000", cm="1500", overhead="300", finance_cost="200")
        assert body["gross_profit"] == "8000.0000" and body["nett_profit"] == "7500.0000"
        assert body["margin_percent"] == "48.3871"
        assert body["budget"] == {"revenue": "21000.0000", "material": "8400.0000", "cm": "4200.0000", "other": "1050.0000"}
        assert body["coverage"]["direct_voucher_lines"] == 7 and body["coverage"]["orders_in_scope"] == 2
    _expect(buyer_b, revenue="3000")
    assert buyer_b["entity"]["name"] == "Buyer B"
    _expect(buyer_c, overhead="100")
    assert buyer_c["coverage"]["orders_without_budget"] == 1 and buyer_c["margin_percent"] is None
    assert any("contract cost-centre" in n for n in buyer_a["notes"])


@pytest.mark.asyncio
async def test_master_contract_counts_cost_center_lines_and_orders_once(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    async with api_client(db, tenant, user) as ac:
        body = (await _get(ac, f"master-contracts/{w['mc'].id}", **YEAR_2027)).json()
    assert body["entity"]["type"] == "master_contract" and body["entity"]["code"] == w["mc"].reference
    # COGS 2000 carries O2 AND the LC cost centre: counted once (material 4000 + 2000), plus 700 CM on the cost centre only.
    _expect(body, revenue="15500", material="6000", cm="2200", overhead="300", finance_cost="200")
    assert body["gross_profit"] == "7300.0000" and body["nett_profit"] == "6800.0000"
    assert body["margin_percent"] == "43.8710"
    assert body["coverage"]["direct_voucher_lines"] == 7 and body["coverage"]["cost_center_lines"] == 1
    # the drill-down reconciles to the actual of every bucket (acceptance 3.3)
    by_bucket: dict[str, Decimal] = {}
    for row in body["drilldown"]:
        by_bucket[row["bucket"]] = by_bucket.get(row["bucket"], D(0)) + D(row["amount"])
    for key in BUCKETS:
        assert by_bucket.get(key, D(0)) == D(body["actual"][key]), key
    assert {d["source"] for d in body["drilldown"]} == {"ORDER", "COST_CENTER"}
    assert sum(d["line_count"] for d in body["drilldown"]) == 8


@pytest.mark.asyncio
async def test_line_with_order_and_contract_cost_center_of_another_order_is_not_duplicated(db_session_integration):
    """The cost-centre line is owned by an order outside the contract: left out and disclosed, not guessed."""
    from tests.finance_control_fixtures import cr, dr, post_v

    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    t, L = tenant.id, w["ledgers"]
    await post_v(
        db, t, date(2027, 6, 1), [dr(L["rent"], "250", cc=w["cc_lc"].id), cr(L["cash"], "250")], order_id=w["orders"]["o3"].id
    )
    async with api_client(db, tenant, user) as ac:
        mc = (await _get(ac, f"master-contracts/{w['mc'].id}", **YEAR_2027)).json()
        o3 = (await _get(ac, f"orders/{w['orders']['o3'].id}", **YEAR_2027)).json()
    _expect(mc, revenue="15500", material="6000", cm="2200", overhead="300", finance_cost="200")  # unchanged
    assert {"code": "COST_CENTER_LINES_OWNED_BY_OTHER_ORDER", "count": 1, "amount": "250.0000"} in mc["warnings"]
    _expect(o3, revenue="3000", overhead="250")  # the owning order has it


@pytest.mark.asyncio
async def test_contract_without_cost_center_and_unclassified_account(db_session_integration):
    from app.models.commercial import MasterContract
    from tests.finance_control_fixtures import cr, dr, post_v, uid

    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    t, L = tenant.id, w["ledgers"]
    mc2 = MasterContract(tenant_id=t, reference=f"MC-{uid()}")
    db.add(mc2)
    await db.flush()
    w["orders"]["o4"].master_contract_id = mc2.id
    # an account in an Unclassified expense group lands in "other" and is flagged, never guessed
    await post_v(
        db, t, date(2027, 6, 2), [dr(L["misc_exp"], "40"), cr(L["cash"], "40")], order_id=w["orders"]["o4"].id
    )
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        body = (await _get(ac, f"master-contracts/{mc2.id}", **YEAR_2027)).json()
    _expect(body, overhead="100", other="40")
    assert body["coverage"]["cost_center_lines"] == 0
    assert any("no cost centre" in n for n in body["notes"])
    assert {"code": "UNCLASSIFIED_ACCOUNTS", "count": 1, "amount": "40.0000"} in body["warnings"]


# ---- order list -------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_order_list_margins_sorting_and_paging(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    o = {k: v.id for k, v in w["orders"].items()}
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"{API}/orders", params={**YEAR_2027, "sort": "-nett_profit"})
        by_margin = await ac.get(f"{API}/orders", params={**YEAR_2027, "sort": "-margin_percent"})
        page = await ac.get(f"{API}/orders", params={**YEAR_2027, "sort": "-nett_profit", "limit": 2, "offset": 1})
    body = r.json()
    assert r.status_code == 200 and body["total"] == 4
    assert [x["order_id"] for x in body["rows"]] == [o["o1"], o["o2"], o["o3"], o["o4"]]  # 4000, 3500, 3000, -100
    rows = {x["order_id"]: x for x in body["rows"]}
    assert rows[o["o1"]]["margin_percent"] == "40.0000" and rows[o["o4"]]["margin_percent"] is None
    assert rows[o["o2"]]["revenue"] == "5500.0000" and rows[o["o3"]]["overhead"] == "0.0000"
    assert [x["order_id"] for x in by_margin.json()["rows"]][:3] == [o["o3"], o["o2"], o["o1"]]  # 100, 63.6, 40; null last
    assert by_margin.json()["rows"][-1]["order_id"] == o["o4"]
    assert [x["order_id"] for x in page.json()["rows"]] == [o["o2"], o["o3"]] and page.json()["total"] == 4
    # list rows equal the single-order endpoint
    async with api_client(db, tenant, user) as ac:
        single = (await _get(ac, f"orders/{o['o2']}", **YEAR_2027)).json()
    assert rows[o["o2"]]["nett_profit"] == single["nett_profit"]
    assert rows[o["o2"]]["margin_percent"] == single["margin_percent"]


# ---- tenant isolation -----------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_cross_tenant_ids_are_404_and_foreign_vouchers_never_count(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    other, other_user, ow = await seed_foreign_order_noise(db, w)  # also a voucher pointing at O1 (77,777)
    other_w = await _other_ids(db, other)
    async with api_client(db, tenant, user) as ac:
        own = (await _get(ac, f"orders/{w['orders']['o1'].id}", **YEAR_2027)).json()
        _expect(own, revenue="10000", material="4000", cm="1500", overhead="300", finance_cost="200")
        for path in (
            f"orders/{other_w['order'].id}",
            f"styles/{other_w['style'].id}",
            f"master-contracts/{other_w['mc'].id}",
            f"buyers/{other_w['customer'].id}",
            "orders/999999999",
            "styles/999999999",
            "master-contracts/999999999",
            "buyers/999999999",
        ):
            r = await _get(ac, path)
            assert r.status_code == 404, (path, r.status_code)
        listing = (await ac.get(f"{API}/orders", params=YEAR_2027)).json()
    assert other_w["order"].id not in {x["order_id"] for x in listing["rows"]}
    async with api_client(db, other, other_user) as ac:  # the other tenant sees its own order and not tenant A's
        assert (await _get(ac, f"orders/{other_w['order'].id}")).status_code == 200
        assert (await _get(ac, f"orders/{w['orders']['o1'].id}")).status_code == 404
    assert ow


async def _other_ids(db, tenant):
    from app.models.commercial import MasterContract
    from app.models.merch import GarmentStyle
    from tests.finance_control_fixtures import make_customer, make_order, uid

    cust = await make_customer(db, tenant.id, "Other buyer")
    style = GarmentStyle(tenant_id=tenant.id, style_code=f"S-{uid()}", name="Other")
    mc = MasterContract(tenant_id=tenant.id, reference=f"MC-{uid()}")
    db.add_all([style, mc])
    await db.flush()
    order = await make_order(db, tenant.id, cust, style_id=style.id, master_contract_id=mc.id)
    return {"customer": cust, "style": style, "mc": mc, "order": order}


# ---- gates and validation ---------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_flag_off_permission_denial_and_validation(db_session_integration):
    db = db_session_integration
    t_on, u_on, w = await seed_profit_world(db)
    t_off, u_off, w_off = await seed_profit_world(db, flags={"finance_control_tower_v2": False})
    t_str, u_str, w_str = await seed_profit_world(db, flags={"finance_control_tower_v2": "true"})  # strict true only
    enforce = {"rbac_enforcement": "enforce"}
    t_deny, u_deny, w_deny = await seed_profit_world(
        db, role_name="analyst", permissions={"finance.access": True, "finance.mis_report.view": False}, flags=enforce
    )
    t_none, u_none, w_none = await seed_profit_world(db, role_name="viewer", permissions={}, flags=enforce)
    t_ok, u_ok, w_ok = await seed_profit_world(db, role_name="clerk", permissions={"finance.access": True}, flags=enforce)

    def paths(world):
        o, s, mc, b = world["orders"]["o1"].id, world["style"].id, world["mc"].id, world["customers"]["a"].id
        return [f"orders/{o}", f"styles/{s}", f"master-contracts/{mc}", f"buyers/{b}", "orders"]

    for tenant, user, world, expected in (
        (t_on, u_on, w, 200),
        (t_off, u_off, w_off, 404),
        (t_str, u_str, w_str, 404),
        (t_deny, u_deny, w_deny, 403),  # explicit finance.mis_report.view=false
        (t_none, u_none, w_none, 403),  # no finance.access
        (t_ok, u_ok, w_ok, 200),  # soft key missing allows
    ):
        async with api_client(db, tenant, user) as ac:
            for path in paths(world):
                assert (await _get(ac, path)).status_code == expected, (user.username, path, expected)

    async with api_client(db, t_on, u_on) as ac:
        o1 = w["orders"]["o1"].id
        bad = [
            (f"orders/{o1}", {"from_date": "2027-13-01"}),
            (f"orders/{o1}", {"from_date": "nope"}),
            (f"orders/{o1}", {"from_date": "2027-12-31", "to_date": "2027-01-01"}),
            ("orders/abc", {}),
            ("styles/abc", {}),
            ("orders", {"limit": 0}),
            ("orders", {"limit": 501}),
            ("orders", {"offset": -1}),
            ("orders", {"sort": "password"}),
            ("orders", {"sort": "-order_code; drop table orders"}),
            ("orders", {"from_date": "2027-12-31", "to_date": "2027-01-01"}),
        ]
        for path, params in bad:
            assert (await _get(ac, path, **params)).status_code == 422, (path, params)
        assert (await _get(ac, "orders", sort="-order_date")).status_code == 200


def test_flag_is_strict_and_not_default_on():
    from app.common import tenant_feature_keys as fk

    for flags in (None, {}, {fk.FINANCE_CONTROL_TOWER_V2: "true"}, {fk.FINANCE_CONTROL_TOWER_V2: 1}, "x"):
        assert fk.is_finance_control_tower_v2_enabled(flags) is False
    assert fk.is_finance_control_tower_v2_enabled(CONTROL_FLAG) is True
    assert fk.FINANCE_CONTROL_TOWER_V2 not in fk.DEFAULT_ON_FEATURE_FLAGS
    assert fk.FINANCE_CONTROL_TOWER_V2 not in fk.with_effective_default_flags({})


# ---- query counts (acceptance 3.10) -------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_query_counts_do_not_grow_with_orders_or_vouchers(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_profit_world(db)
    o1, style, mc, cust = w["orders"]["o1"].id, w["style"].id, w["mc"].id, w["customers"]["a"].id

    async def measure() -> dict[str, int]:
        counts: dict[str, int] = {}
        async with api_client(db, tenant, user) as ac:
            for name, path in (
                ("order", f"orders/{o1}"),
                ("style", f"styles/{style}"),
                ("contract", f"master-contracts/{mc}"),
                ("buyer", f"buyers/{cust}"),
                ("list", "orders"),
            ):
                with QueryCounter(db) as qc:
                    r = await _get(ac, path, limit=500) if name == "list" else await _get(ac, path)
                assert r.status_code == 200, (path, r.text)
                counts[name] = qc.count
        return counts

    small = await measure()
    await add_bulk_orders(db, tenant.id, w, 25)
    big = await measure()
    assert big == small, (small, big)
    assert max(big.values()) <= 14, big
    async with api_client(db, tenant, user) as ac:
        listing = (await ac.get(f"{API}/orders", params={"limit": 500})).json()
    assert listing["total"] == 4 + 25  # the new orders really exist in the measured data
