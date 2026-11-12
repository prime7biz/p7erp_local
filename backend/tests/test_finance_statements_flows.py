"""Finance statements, second half: monthly Cash Flow / Funds Flow, Ratio Analysis, stock-vs-GL, drill-down, export.

Everything is worked out by hand from `tests/finance_statement_fixtures.py::seed_world` plus the extras posted in
`seed_cash_world` (a bank ledger, a Bank OD ledger, contra vouchers, a foreign-currency receipt). Never from the
services under test. Calendar fiscal year 2026 unless a test says otherwise.

Hand-worked cash pool (cash + bank + Bank OD, debit minus credit):
  opening 2026-01-01: cash 90,000 (60,000 stored + 50,000 - 20,000 in 2025) + bank 10,000 - OD 4,000 = 96,000
  Mar  contra cash->bank 2,000 (not flow); Dr bank 500 / Cr cash 300 / Cr sales 200 -> inflow 200
  Apr  Dr cash 1,500 / Cr OD 1,500 (both in the pool: contra, no flow)
  May  out 3,000    Jun  in 1,000, out 5,000 + 1,100    Aug  reversed voucher: in 777 and out 777 (nett 0)
  Oct  in 11,000 (USD 100 at base 11,000)               Nov  out 400 (bank)
  year inflow 12,977, outflow 10,277, nett 2,700, closing 98,700 = cash 92,100 + bank 12,100 - OD 5,500
  contra excluded 2,000 + 300 + 1,500 = 3,800
Hand-worked working capital (cash + bank + stock + receivables - payables; OD, capital, unclassified excluded):
  opening 140,000; Feb +30,000; Mar +200; Apr -10,500; May -3,000; Jun -5,100; Jul +11,000; Oct +11,000; Nov -400
  closing 173,200 (assets 193,200, liabilities 20,000), flow 33,200.

Run: docker compose exec -T backend pytest tests/test_finance_statements_flows.py -q
"""

from __future__ import annotations

import io
from datetime import date, datetime
from decimal import ROUND_HALF_UP, Decimal

import pytest

from app.models.costing import Item
from app.models.inventory import InventoryCostLayer, StockGroup, StockMovement
from app.modules.finance.statements.cash_flow_service import build_cash_flow
from app.modules.finance.statements.drill_service import drill_group, drill_ledger
from app.modules.finance.statements.funds_flow_service import build_funds_flow
from app.modules.finance.statements.money_format import (
    format_dr_cr,
    format_indian,
    group_indian_digits,
    parse_indian,
)
from app.modules.finance.statements.ratio_service import build_ratio_analysis
from app.modules.finance.statements.stock_gl_service import build_stock_gl
from app.modules.inventory.stock_report_queries import stock_valuation_totals
from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin
from tests.finance_statement_fixtures import D, make_group, make_ledger, post, seed_noise_tenant, seed_world
from tests.test_perf_inventory_reports_equivalence import QueryCounter

API = "/api/v1/finance/statements"
YEAR_2026 = {"from_date": "2026-01-01", "to_date": "2026-12-31"}


async def seed_cash_world(db, *, flags: dict | None = None, **kwargs):
    """seed_world plus a bank ledger, a Bank OD ledger and the contra / FX / outflow vouchers described above."""
    tenant, user, w = await seed_world(db, flags=flags, **kwargs)
    t, g = tenant.id, w["groups"]
    g["debtors"].statement_class = "SUNDRY_DEBTORS"  # seed_world leaves it inheriting CURRENT_ASSETS
    await db.flush()
    bank_g = await make_group(db, t, "Bank Accounts", "Asset", "BANK_ACCOUNTS", g["ca"])
    od_g = await make_group(db, t, "Bank OD", "Liability", "BANK_OD")
    bank = await make_ledger(db, t, bank_g, "City Bank", "10000")
    od = await make_ledger(db, t, od_g, "Overdraft", "4000")
    w["groups"].update(bank=bank_g, od=od_g)
    w["ledgers"].update(bank=bank, od=od)
    cash, sales, rent = w["ledgers"]["cash"], w["ledgers"]["sales"], w["ledgers"]["rent"]
    await post(db, t, date(2026, 3, 10), [(bank, "DEBIT", "2000"), (cash, "CREDIT", "2000")])
    await post(db, t, date(2026, 3, 20), [(bank, "DEBIT", "500"), (cash, "CREDIT", "300"), (sales, "CREDIT", "200")])
    await post(db, t, date(2026, 4, 1), [(cash, "DEBIT", "1500"), (od, "CREDIT", "1500")])
    await post(db, t, date(2026, 10, 5), [(cash, "DEBIT", "100", "11000"), (sales, "CREDIT", "100", "11000")])
    await post(db, t, date(2026, 11, 10), [(rent, "DEBIT", "400"), (bank, "CREDIT", "400")])
    return tenant, user, w


async def _get(ac, path: str, **params):
    return await ac.get(f"{API}/{path}", params=params)


def _by_month(body: dict) -> dict[str, dict]:
    return {m["month"]: m for m in body["months"]}


CASH_FLOWS_2026 = {  # month -> (inflow, outflow)
    "2026-03": ("200", "0"),
    "2026-05": ("0", "3000"),
    "2026-06": ("1000", "6100"),
    "2026-08": ("777", "777"),
    "2026-10": ("11000", "0"),
    "2026-11": ("0", "400"),
}


# ---- formatter (pure) ----------------------------------------------------------------------------------
@pytest.mark.parametrize(
    "value, expected",
    [
        ("0", "0.00"),
        ("5", "5.00"),
        ("999", "999.00"),
        ("1000", "1,000.00"),
        ("99999.99", "99,999.99"),
        ("100000", "1,00,000.00"),
        ("1234567.5", "12,34,567.50"),
        ("10000000", "1,00,00,000.00"),
        ("1813863870.26", "1,81,38,63,870.26"),
        ("123456789012.345", "1,23,45,67,89,012.35"),  # half-up
        ("-1234.5", "(-)1,234.50"),
        ("-1813863870.26", "(-)1,81,38,63,870.26"),
        ("-0.001", "0.00"),
        ("0.005", "0.01"),
    ],
)
def test_indian_grouping(value, expected):
    assert format_indian(Decimal(value)) == expected


def test_indian_grouping_helpers_and_variants():
    assert group_indian_digits("") == "" and group_indian_digits("12") == "12" and group_indian_digits("1234") == "1,234"
    assert format_indian(Decimal("-1234.5"), negative="minus") == "-1,234.50"
    assert format_indian(Decimal("1234567.891"), places=0) == "12,34,568"
    assert format_indian(None) == ""
    assert format_dr_cr(Decimal("1234567.5")) == "12,34,567.50 Dr"
    assert format_dr_cr(Decimal("-100")) == "100.00 Cr"
    assert format_dr_cr(Decimal("0")) == "0.00"
    for text in ("12,34,567.50", "(-)1,234.50", "100.00 Cr", "1,81,38,63,870.26 Dr", "0.00"):
        assert format_indian(parse_indian(text)) == format_indian(parse_indian(format_indian(parse_indian(text))))
    assert parse_indian("100.00 Cr") == D("-100") and parse_indian("(-)1,234.50") == D("-1234.50")


# ---- Cash Flow -----------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_cash_flow_hand_computed_contra_od_fx_and_reversal(db_session_integration):
    db = db_session_integration
    await seed_noise_tenant(db)  # must never leak in
    tenant, user, _w = await seed_cash_world(db)
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "cash-flow-monthly", fiscal_year=2026)
    assert r.status_code == 200, r.text
    body = r.json()
    months = _by_month(body)
    assert list(months) == [f"2026-{m:02d}" for m in range(1, 13)]
    assert body["opening_cash"] == "96000.0000" and body["opening_dr_cr"] == "Dr"
    for key, m in months.items():
        inflow, outflow = CASH_FLOWS_2026.get(key, ("0", "0"))
        assert (D(m["inflow"]), D(m["outflow"])) == (D(inflow), D(outflow)), key
        assert D(m["nett_flow"]) == D(m["inflow"]) - D(m["outflow"])
        assert D(m["closing_cash"]) == D(m["opening_cash"]) + D(m["nett_flow"]), key  # closing = opening + nett
        assert m["drilldown"] == {"kind": "month", "value": key}
    ordered = body["months"]
    for prev, nxt in zip(ordered, ordered[1:]):
        assert prev["closing_cash"] == nxt["opening_cash"]  # month N closing == month N+1 opening
    assert ordered[0]["opening_cash"] == body["opening_cash"]
    total = body["grand_total"]
    assert (D(total["inflow"]), D(total["outflow"]), D(total["nett_flow"])) == (D("12977"), D("10277"), D("2700"))
    assert D(total["closing_cash"]) == D("98700") == D(body["gl_closing_cash"])  # equals the GL closing of the pool
    assert body["reconciliation"] == {"balanced": True, "difference": "0.0000"}
    assert body["closing_pool"] == {
        "cash_in_hand": "92100.0000", "bank_accounts": "12100.0000", "bank_od": "-5500.0000", "cash_without_od": "104200.0000",
    }
    assert body["contra_excluded"] == "3800.0000"
    assert body["period"]["fiscal_year"] == "2026" and body["base_currency"] == "BDT"
    for m in ordered:
        for key in ("inflow", "outflow", "nett_flow", "closing_cash"):
            assert len(m[key].split(".")[1]) == 4, (key, m[key])


@pytest.mark.asyncio
async def test_cash_flow_matches_trial_balance_closing_of_the_pool(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_cash_world(db)
    async with api_client(db, tenant, user) as ac:
        cash = (await _get(ac, "cash-flow-monthly", fiscal_year=2026)).json()
        tb = (await _get(ac, "trial-balance", **YEAR_2026)).json()
    pool = {r["name"]: D(r["closing_debit"]) - D(r["closing_credit"]) for r in tb["rows"] if r["row_type"] == "ledger"}
    assert D(cash["grand_total"]["closing_cash"]) == pool["Cash in Hand"] + pool["City Bank"] + pool["Overdraft"]


@pytest.mark.asyncio
async def test_cash_flow_july_and_january_fiscal_years(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_cash_world(db, flags={"fiscal_year_start_month": 7})
    async with api_client(db, tenant, user) as ac:
        fy26 = (await _get(ac, "cash-flow-monthly", fiscal_year=2026)).json()  # Jul 2026 - Jun 2027
        fy25 = (await _get(ac, "cash-flow-monthly", fiscal_year=2025)).json()  # Jul 2025 - Jun 2026
    keys = [m["month"] for m in fy26["months"]]
    assert keys[0] == "2026-07" and keys[5] == "2026-12" and keys[6] == "2027-01" and keys[-1] == "2027-06"
    assert fy26["months"][0]["from_date"] == "2026-07-01" and fy26["months"][-1]["to_date"] == "2027-06-30"
    assert fy26["period"]["fiscal_year"] == "2026-27"
    assert D(fy26["opening_cash"]) == D("88100")  # everything up to 2026-06-30
    m = _by_month(fy26)
    assert (D(m["2026-08"]["inflow"]), D(m["2026-08"]["outflow"])) == (D(777), D(777))
    assert D(m["2026-10"]["inflow"]) == D(11000) and D(m["2026-11"]["outflow"]) == D(400)
    assert D(fy26["grand_total"]["nett_flow"]) == D("10600") and D(fy26["grand_total"]["closing_cash"]) == D("98700")
    assert D(fy26["gl_closing_cash"]) == D("98700") and fy26["reconciliation"]["balanced"] is True
    # previous year: closing of FY 2025-26 is the opening of FY 2026-27
    assert keys and fy25["months"][0]["month"] == "2025-07" and fy25["months"][-1]["month"] == "2026-06"
    assert D(fy25["opening_cash"]) == D("116000")  # 66,000 stored + 50,000 receipt in June 2025
    assert fy25["grand_total"]["closing_cash"] == fy26["opening_cash"] == "88100.0000"
    assert D(_by_month(fy25)["2025-09"]["outflow"]) == D("20000")


@pytest.mark.asyncio
async def test_cash_flow_without_pool_ledgers_is_all_zero(db_session_integration):
    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)
    tenant.feature_flags = {"finance_statements_v2": True}
    await db.flush()
    body = (await build_cash_flow(db, tenant, fiscal_year=2026, today=date(2026, 6, 1))).model_dump(mode="json")
    assert body["opening_cash"] == "0.0000" and len(body["months"]) == 12
    assert body["grand_total"]["closing_cash"] == "0.0000" and body["reconciliation"]["balanced"] is True


# ---- Funds Flow ----------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_funds_flow_continuity_and_od_exclusion(db_session_integration):
    db = db_session_integration
    await seed_noise_tenant(db)
    tenant, user, _w = await seed_cash_world(db)
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "funds-flow-monthly", fiscal_year=2026)
    assert r.status_code == 200, r.text
    body = r.json()
    expected_flow = {"2026-02": 30000, "2026-03": 200, "2026-04": -10500, "2026-05": -3000, "2026-06": -5100,
                     "2026-07": 11000, "2026-10": 11000, "2026-11": -400}
    wc = D(140000)
    for m in body["months"]:
        flow = D(expected_flow.get(m["month"], 0))
        assert D(m["working_capital_opening"]) == wc, m["month"]
        assert D(m["funds_flow"]) == flow == D(m["working_capital_closing"]) - D(m["working_capital_opening"])
        wc += flow
        assert D(m["working_capital_closing"]) == wc
    for prev, nxt in zip(body["months"], body["months"][1:]):
        assert prev["working_capital_closing"] == nxt["working_capital_opening"]
    total = body["grand_total"]
    assert (D(total["working_capital_opening"]), D(total["working_capital_closing"]), D(total["funds_flow"])) == (
        D(140000), D(173200), D(33200),
    )
    last = body["months"][-1]
    assert D(last["current_assets_closing"]) == D(193200) and D(last["current_liabilities_closing"]) == D(20000)
    # Bank OD (5,500 credit) is in neither side: it would otherwise change liabilities
    assert D(last["current_assets_closing"]) - D(last["current_liabilities_closing"]) == D(last["working_capital_closing"])
    assert body["reconciliation"]["balanced"] is True


@pytest.mark.asyncio
async def test_funds_flow_july_fiscal_year_opening(db_session_integration):
    db = db_session_integration
    tenant, _user, _w = await seed_cash_world(db, flags={"fiscal_year_start_month": 7})
    body = (await build_funds_flow(db, tenant, fiscal_year=2026, today=date(2026, 8, 1))).model_dump(mode="json")
    assert [m["month"] for m in body["months"]][0] == "2026-07" and body["months"][-1]["month"] == "2027-06"
    # everything up to 2026-06-30: 140,000 + 30,000 + 200 - 10,500 - 3,000 - 5,100
    assert body["grand_total"]["working_capital_opening"] == "151600.0000"
    assert body["grand_total"]["working_capital_closing"] == "173200.0000" and body["grand_total"]["funds_flow"] == "21600.0000"


# ---- Ratio Analysis ------------------------------------------------------------------------------------
def _round4(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)


@pytest.mark.asyncio
async def test_ratio_formulas_on_hand_computed_fixture(db_session_integration):
    db = db_session_integration
    await seed_noise_tenant(db)
    tenant, user, _w = await seed_cash_world(db)
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "ratio-analysis", as_of_date="2026-12-31")
    assert r.status_code == 200, r.text
    body = r.json()
    groups = {g["code"]: g for g in body["principal_groups"]}
    ratios = {q["code"]: q for q in body["principal_ratios"]}
    # hand figures
    ca, cl, stock, debtors, sales = D(193200), D(20000), D(48000), D(41000), D(52200)
    wc, loans, capital, gross, nett, op_cost = D(173200), D(5500), D(100000), D(35200), D(32100), D(8400)
    equity = capital + nett
    assert (groups["WORKING_CAPITAL"]["amount"], groups["WORKING_CAPITAL"]["dr_cr"]) == ("173200.0000", "Dr")
    assert (groups["CASH_IN_HAND"]["amount"], groups["CASH_AT_BANK"]["amount"]) == ("92100.0000", "12100.0000")
    assert (groups["BANK_OD"]["amount"], groups["BANK_OD"]["dr_cr"]) == ("5500.0000", "Cr")
    assert (groups["SUNDRY_DEBTORS"]["amount"], groups["SUNDRY_DEBTORS"]["dr_cr"]) == ("41000.0000", "Dr")
    assert (groups["SUNDRY_CREDITORS"]["amount"], groups["SUNDRY_CREDITORS"]["dr_cr"]) == ("20000.0000", "Cr")
    assert (groups["SALES_ACCOUNTS"]["amount"], groups["SALES_ACCOUNTS"]["dr_cr"]) == ("52200.0000", "Cr")
    assert groups["PURCHASE_ACCOUNTS"]["amount"] == "0.0000" and groups["STOCK_IN_HAND"]["amount"] == "48000.0000"
    assert (groups["NETT_RESULT"]["label"], groups["NETT_RESULT"]["amount"]) == ("Nett Profit", "32100.0000")
    assert groups["WORKING_CAPITAL_TURNOVER"]["value"] == str(_round4(sales / wc)) and groups["WORKING_CAPITAL_TURNOVER"]["unit"] == "times"
    assert groups["INVENTORY_TURNOVER"]["value"] == str(_round4(sales / stock))
    # "due till today": undecided source (PLAN open question 8) -> null with a reason, never a guess
    for code in ("SUNDRY_DEBTORS_DUE", "SUNDRY_CREDITORS_DUE"):
        assert groups[code]["amount"] is None and "open question 8" in groups[code]["reason"]

    expected = {
        "CURRENT_RATIO": _round4(ca / cl),
        "QUICK_RATIO": _round4((ca - stock) / cl),
        "DEBT_EQUITY": _round4(loans / equity),
        "GROSS_PROFIT_PCT": _round4(gross / sales * 100),
        "NETT_PROFIT_PCT": _round4(nett / sales * 100),
        "OPERATING_COST_PCT": _round4(op_cost / sales * 100),
        "RECEIVABLE_TURNOVER_DAYS": _round4(debtors * 365 / sales),
        "ROI_PCT": _round4(nett / equity * 100),
        "RETURN_ON_WC_PCT": _round4(nett / wc * 100),
    }
    assert set(ratios) == set(expected)
    for code, value in expected.items():
        assert D(ratios[code]["value"]) == value, code
        assert ratios[code]["reason"] is None
    assert ratios["CURRENT_RATIO"]["display"] == "9.66 : 1" and ratios["QUICK_RATIO"]["display"] == "7.26 : 1"
    assert ratios["GROSS_PROFIT_PCT"]["display"].endswith("%") and ratios["RECEIVABLE_TURNOVER_DAYS"]["display"].endswith("days")
    assert (ratios["CURRENT_RATIO"]["numerator"], ratios["CURRENT_RATIO"]["denominator"]) == ("193200.0000", "20000.0000")
    # nett profit agrees with the P&L endpoint
    async with api_client(db, tenant, user) as ac:
        pnl = (await _get(ac, "profit-loss", **YEAR_2026)).json()
    assert pnl["profit_and_loss"]["nett_result"]["amount"] == "32100.0000"
    assert any(w["code"] == "UNCLASSIFIED_GROUPS" for w in body["warnings"])


@pytest.mark.asyncio
async def test_ratio_zero_denominators_return_null_not_errors(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {"finance_statements_v2": True}
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "ratio-analysis", as_of_date="2026-12-31")
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["principal_ratios"]) == 9
    for q in body["principal_ratios"]:
        assert q["value"] is None and q["display"] == "N/A" and q["reason"], q["code"]
    turnovers = [g for g in body["principal_groups"] if g["unit"]]
    assert {g["code"] for g in turnovers} == {"WORKING_CAPITAL_TURNOVER", "INVENTORY_TURNOVER"}
    assert all(g["value"] is None and g["reason"] for g in turnovers)
    assert any(w["code"] == "ZERO_DENOMINATOR" for w in body["warnings"])


@pytest.mark.asyncio
async def test_ratio_period_inputs_and_loss_sign(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        for params in ({"as_of_date": "2026-12-31", "fiscal_year": 2026}, {"as_of_date": "2026-12-31", "from_date": "2026-01-01"},
                       {"from_date": "2026-12-31", "to_date": "2026-01-01"}):
            assert (await _get(ac, "ratio-analysis", **params)).status_code == 422, params
        # a period with no sales: Feb-only has sales 30,000; January has none -> margin ratios null, balance ratios fine
        jan = (await _get(ac, "ratio-analysis", from_date="2026-01-01", to_date="2026-01-31")).json()
        mar_year = (await _get(ac, "ratio-analysis", fiscal_year=2026)).json()
    ratios = {q["code"]: q for q in jan["principal_ratios"]}
    assert ratios["GROSS_PROFIT_PCT"]["value"] is None and ratios["CURRENT_RATIO"]["value"] is None  # no payables yet
    assert mar_year["period"]["from_date"] == "2026-01-01" and mar_year["period"]["to_date"] == "2026-12-31"


# ---- Stock versus GL -----------------------------------------------------------------------------------
async def _seed_stock(db, tenant_id: int):
    rm_parent = StockGroup(tenant_id=tenant_id, group_code="RM", name="Raw", stock_nature="RAW_MATERIAL")
    db.add(rm_parent)
    await db.flush()
    rm_child = StockGroup(tenant_id=tenant_id, group_code="RM-F", name="Fabric", parent_id=rm_parent.id)  # inherits RM
    fg = StockGroup(tenant_id=tenant_id, group_code="FG", name="Finished", stock_nature="FINISHED_GOODS")
    db.add_all([rm_child, fg])
    await db.flush()
    plan = [  # (code, group, qty, layer unit cost or None, default cost)
        ("S-RM", rm_child, "10", "5.0000", "0"),
        ("S-FG", fg, "4", "10.0000", "0"),
        ("S-NOGROUP", None, "3", None, "7.0000"),  # no layer -> on-hand x default cost; no group -> Unclassified
    ]
    for code, group, qty, cost, default_cost in plan:
        item, wh, _unit = await seed_item(db, tenant_id, code=code, name=code)
        item.stock_group_id = group.id if group else None
        item.default_cost = Decimal(default_cost)
        mv = StockMovement(
            tenant_id=tenant_id, item_id=item.id, warehouse_id=wh.id, movement_type="IN", quantity=Decimal(qty),
            movement_date=date(2026, 2, 1), created_at=datetime(2026, 2, 1, 9, 0, 0), reference_type="TEST",
        )
        db.add(mv)
        await db.flush()
        if cost is not None:
            db.add(InventoryCostLayer(
                tenant_id=tenant_id, item_id=item.id, warehouse_id=wh.id, source_movement_id=mv.id,
                qty_original=Decimal(qty), qty_remaining=Decimal(qty), unit_cost=Decimal(cost), layer_date=date(2026, 2, 1),
            ))
    await db.flush()


@pytest.mark.asyncio
async def test_stock_vs_gl_difference_and_unclassified(db_session_integration):
    db = db_session_integration
    other, _ou, _ow = await seed_noise_tenant(db)
    await _seed_stock(db, other.id)  # other tenant's stock must not be counted
    tenant, user, _w = await seed_cash_world(db)
    await _seed_stock(db, tenant.id)
    async with api_client(db, tenant, user) as ac:
        r = await _get(ac, "stock-gl-reconciliation", as_of_date="2026-12-31")
        early = await _get(ac, "stock-gl-reconciliation", as_of_date="2026-01-15")
    assert r.status_code == 200, r.text
    body = r.json()
    by_nature = {n["nature"]: n for n in body["by_nature"]}
    assert D(by_nature["RAW_MATERIAL"]["fifo_value"]) == D(50)  # 10 x 5 (nature inherited from the parent group)
    assert D(by_nature["FINISHED_GOODS"]["fifo_value"]) == D(40)
    assert D(by_nature["UNCLASSIFIED"]["fifo_value"]) == D(21) and by_nature["UNCLASSIFIED"]["line_count"] == 1
    assert D(by_nature["WORK_IN_PROCESS"]["fifo_value"]) == 0 and D(by_nature["OTHER"]["fifo_value"]) == 0
    assert D(body["fifo_total"]) == D(111) and D(body["unclassified_stock"]) == D(21)
    assert D(body["gl_total"]) == D(48000) and [g["name"] for g in body["gl_ledgers"]] == ["Inventory"]
    assert D(body["difference"]) == D(48000) - D(111)  # shown, never forced to zero
    assert body["reconciliation"] == {"balanced": False, "difference": "47889.0000"}
    assert [w["code"] for w in body["warnings"]] == ["UNCLASSIFIED_STOCK"]
    # same total as the stock valuation report
    total, lines = await stock_valuation_totals(db, tenant.id, tenant.feature_flags, as_of_date=date(2026, 12, 31))
    assert (total, lines) == (111.0, 3)
    # before the stock arrived (movement is 2026-02-01), nothing is held and the GL shows 40,000 (opening only)
    assert early.status_code == 200 and D(early.json()["fifo_total"]) == 0 and D(early.json()["gl_total"]) == D(40000)


# ---- Drill-down ----------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_drill_group_totals_equal_parent_and_children(db_session_integration):
    db = db_session_integration
    other, _ou, ow = await seed_noise_tenant(db)
    tenant, user, w = await seed_cash_world(db)
    ca_id = w["groups"]["ca"].id
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"{API}/drill/group", params={"group_id": ca_id, **YEAR_2026})
        tb = (await _get(ac, "trial-balance", **YEAR_2026)).json()
        cash_drill = await ac.get(f"{API}/drill/group", params={"group_id": w["groups"]["cash"].id, **YEAR_2026})
        foreign = await ac.get(f"{API}/drill/group", params={"group_id": ow["groups"]["ca"].id, **YEAR_2026})
        missing = await ac.get(f"{API}/drill/group", params={"group_id": 999999999, **YEAR_2026})
    assert r.status_code == 200, r.text
    body = r.json()
    assert foreign.status_code == 404 and missing.status_code == 404 and foreign.json() == missing.json()
    names = {row["name"]: row for row in body["rows"]}
    assert set(names) == {"Cash", "Stock", "Debtors", "Bank Accounts"}
    assert all(row["row_type"] == "group" for row in body["rows"])
    # parent total == sum of the rows == the Trial Balance row of the same group
    for key in ("opening", "debit", "credit", "closing"):
        assert D(body["total"][key]) == sum((D(row[key]) for row in body["rows"]), D(0)), key
    tb_row = next(row for row in tb["rows"] if row["row_type"] == "group" and row["id"] == ca_id)
    assert D(body["total"]["closing"]) == D(tb_row["closing_debit"]) - D(tb_row["closing_credit"])
    assert D(body["total"]["opening"]) == D(tb_row["opening_debit"]) - D(tb_row["opening_credit"])
    assert D(body["total"]["debit"]) == D(tb_row["period_debit"]) and D(body["total"]["credit"]) == D(tb_row["period_credit"])
    # next level: the Cash group lists its ledger, equal to the group row above
    cash = cash_drill.json()
    assert [row["row_type"] for row in cash["rows"]] == ["ledger"] and cash["rows"][0]["name"] == "Cash in Hand"
    for key in ("opening", "debit", "credit", "closing"):
        assert cash["rows"][0][key] == cash["total"][key] == names["Cash"][key]
    assert body["total"]["closing_dr_cr"] in ("Dr", "Cr")


@pytest.mark.asyncio
async def test_drill_ledger_vouchers_equal_parent_and_are_paginated(db_session_integration):
    db = db_session_integration
    other, _ou, ow = await seed_noise_tenant(db)
    tenant, user, w = await seed_cash_world(db)
    cash_id = w["ledgers"]["cash"].id
    async with api_client(db, tenant, user) as ac:
        full = (await ac.get(f"{API}/drill/ledger", params={"account_id": cash_id, "limit": 500, **YEAR_2026})).json()
        p1 = (await ac.get(f"{API}/drill/ledger", params={"account_id": cash_id, "limit": 3, "offset": 0, **YEAR_2026})).json()
        p2 = (await ac.get(f"{API}/drill/ledger", params={"account_id": cash_id, "limit": 3, "offset": 3, **YEAR_2026})).json()
        beyond = (await ac.get(f"{API}/drill/ledger", params={"account_id": cash_id, "limit": 3, "offset": 400, **YEAR_2026})).json()
        too_big = await ac.get(f"{API}/drill/ledger", params={"account_id": cash_id, "limit": 501})
        zero = await ac.get(f"{API}/drill/ledger", params={"account_id": cash_id, "limit": 0})
        neg = await ac.get(f"{API}/drill/ledger", params={"account_id": cash_id, "offset": -1})
        foreign = await ac.get(f"{API}/drill/ledger", params={"account_id": ow["ledgers"]["cash"].id, **YEAR_2026})
        tb = (await _get(ac, "trial-balance", **YEAR_2026)).json()
    # 10 vouchers touch cash in 2026: Mar x2, Apr, May, Jun x3, Aug x2, Oct
    assert full["total_vouchers"] == 10 and len(full["rows"]) == 10
    assert sum((D(x["debit"]) for x in full["rows"]), D(0)) == D(full["period_debit"])
    assert sum((D(x["credit"]) for x in full["rows"]), D(0)) == D(full["period_credit"])
    assert D(full["opening"]) + D(full["period_debit"]) - D(full["period_credit"]) == D(full["closing"]) == D(92100)
    assert D(full["rows"][-1]["running_balance"]) == D(full["closing"])
    tb_row = next(r for r in tb["rows"] if r["row_type"] == "ledger" and r["id"] == cash_id)
    assert D(full["closing"]) == D(tb_row["closing_debit"]) - D(tb_row["closing_credit"])
    dates = [x["voucher_date"] for x in full["rows"]]
    assert dates == sorted(dates)
    # pagination is bounded, stable and complete
    assert len(p1["rows"]) == 3 and len(p2["rows"]) == 3 and p1["total_vouchers"] == p2["total_vouchers"] == 10
    assert [x["voucher_id"] for x in p1["rows"] + p2["rows"]] == [x["voucher_id"] for x in full["rows"][:6]]
    assert beyond["rows"] == [] and beyond["total_vouchers"] == 10 and beyond["limit"] == 3 and beyond["offset"] == 400
    assert too_big.status_code == 422 and zero.status_code == 422 and neg.status_code == 422
    assert foreign.status_code == 404


@pytest.mark.asyncio
async def test_drill_cash_flow_month_ledgers_equal_the_month_row(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_cash_world(db)
    async with api_client(db, tenant, user) as ac:
        cash = (await _get(ac, "cash-flow-monthly", fiscal_year=2026)).json()
        months = _by_month(cash)
        for key in ("2026-03", "2026-04", "2026-06", "2026-08", "2026-10", "2026-12"):
            r = await ac.get(f"{API}/drill/cash-flow", params={"month": key, "fiscal_year": 2026})
            assert r.status_code == 200, r.text
            d = r.json()
            assert (d["inflow"], d["outflow"], d["nett_flow"]) == (months[key]["inflow"], months[key]["outflow"], months[key]["nett_flow"])
            assert D(d["total_debit"]) - D(d["contra_excluded"]) == D(d["inflow"]), key
            assert D(d["total_credit"]) - D(d["contra_excluded"]) == D(d["outflow"]), key
            assert d["reconciliation"]["balanced"] is True
        march = (await ac.get(f"{API}/drill/cash-flow", params={"month": "2026-03", "fiscal_year": 2026})).json()
        assert {x["name"]: (D(x["debit"]), D(x["credit"])) for x in march["ledgers"]} == {
            "Cash in Hand": (D(0), D(2300)), "City Bank": (D(2500), D(0)),
        }
        assert D(march["contra_excluded"]) == D(2300)
        for bad in ({"month": "2027-01", "fiscal_year": 2026}, {"month": "2026-13"}, {"month": "March"}, {"month": "2026-3"}):
            assert (await ac.get(f"{API}/drill/cash-flow", params=bad)).status_code == 422, bad


# ---- Export --------------------------------------------------------------------------------------------
EXPORTS = ("trial-balance", "balance-sheet", "profit-loss", "cash-flow-monthly", "funds-flow-monthly", "ratio-analysis")


def _xlsx_rows(content: bytes) -> list[list[str]]:
    from openpyxl import load_workbook

    ws = load_workbook(io.BytesIO(content)).active
    return [[("" if c is None else str(c)) for c in row] for row in ws.iter_rows(values_only=True)]


@pytest.mark.asyncio
async def test_export_xlsx_totals_equal_json_for_every_statement(db_session_integration):
    pytest.importorskip("openpyxl")
    db = db_session_integration
    tenant, user, _w = await seed_cash_world(db)
    tenant.address = "12 Mill Road, Dhaka"
    await db.flush()
    params = {"fiscal_year": 2026}
    async with api_client(db, tenant, user) as ac:
        files = {}
        for report in EXPORTS:
            r = await ac.get(f"{API}/{report}/export", params={"format": "xlsx", **params})
            assert r.status_code == 200, (report, r.text)
            assert r.headers["content-type"].startswith("application/vnd.openxmlformats")
            assert f'{report}-2026.xlsx' in r.headers["content-disposition"] and r.headers["cache-control"] == "no-store"
            files[report] = _xlsx_rows(r.content)
        tb = (await _get(ac, "trial-balance", **params)).json()
        bs = (await _get(ac, "balance-sheet", **params)).json()
        cash = (await _get(ac, "cash-flow-monthly", **params)).json()
        funds = (await _get(ac, "funds-flow-monthly", **params)).json()
        ratios = (await _get(ac, "ratio-analysis", **params)).json()
    for report, rows in files.items():
        assert rows[0][0] == tenant.name and rows[1][0] == "12 Mill Road, Dhaka", report  # company header
        assert "2026" in rows[3][0] and "BDT" in rows[3][0]
    # Trial Balance: Grand Total row equals the JSON totals
    grand = next(r for r in files["trial-balance"] if r[0] == "Grand Total")
    assert parse_indian(grand[1]) == D(tb["totals"]["opening_debit"]).quantize(D("0.01"))
    assert parse_indian(grand[2]) == D(tb["totals"]["period_debit"]) and parse_indian(grand[3]) == D(tb["totals"]["period_credit"])
    assert parse_indian(grand[4]) == D(tb["totals"]["closing_debit"])
    assert grand[4].endswith(" Dr")
    cash_row = next(r for r in files["trial-balance"] if r[0] == "Cash in Hand")
    assert cash_row[4] == "92,100.00 Dr"
    # Balance Sheet
    assert parse_indian(next(r for r in files["balance-sheet"] if r[0] == "Total Liabilities")[2]) == D(bs["totals"]["liabilities"])
    assert parse_indian(next(r for r in files["balance-sheet"] if r[0] == "Total Assets")[2]) == D(bs["totals"]["assets"])
    # Cash flow: lakh formatting in the sheet, values equal JSON
    g = next(r for r in files["cash-flow-monthly"] if r[0] == "Grand Total")
    assert parse_indian(g[1]) == D(cash["grand_total"]["inflow"]) and parse_indian(g[3]) == D(cash["grand_total"]["nett_flow"])
    assert g[4] == "98,700.00 Dr"
    june = next(r for r in files["cash-flow-monthly"] if r[0] == "Jun 2026")
    assert (parse_indian(june[1]), parse_indian(june[2])) == (D(1000), D(6100))
    # Funds flow and ratios
    fg = next(r for r in files["funds-flow-monthly"] if r[0] == "Grand Total")
    assert parse_indian(fg[3]) == D(funds["grand_total"]["funds_flow"]) == D(33200)
    cr = next(r for r in files["ratio-analysis"] if r[0] == "Current Ratio")
    assert cr[1] == "9.66 : 1" and next(q for q in ratios["principal_ratios"] if q["code"] == "CURRENT_RATIO")["display"] == cr[1]
    # P&L carries its gross and nett result lines
    assert any(r[0] == "Nett Profit" and parse_indian(r[2]) == D(32100) for r in files["profit-loss"])


@pytest.mark.asyncio
async def test_export_pdf_and_lakh_crore_in_files(db_session_integration):
    pytest.importorskip("reportlab")
    db = db_session_integration
    tenant, user, w = await seed_cash_world(db)
    cash, sales = w["ledgers"]["cash"], w["ledgers"]["sales"]
    await post(db, tenant.id, date(2026, 12, 1), [(cash, "DEBIT", "181386300.26"), (sales, "CREDIT", "181386300.26")])
    async with api_client(db, tenant, user) as ac:
        for report in EXPORTS:
            r = await ac.get(f"{API}/{report}/export", params={"format": "pdf", "fiscal_year": 2026})
            assert r.status_code == 200, (report, r.text[:200])
            assert r.headers["content-type"] == "application/pdf" and r.content.startswith(b"%PDF") and len(r.content) > 1000
        x = await ac.get(f"{API}/cash-flow-monthly/export", params={"fiscal_year": 2026})  # default format = xlsx
    assert x.status_code == 200
    rows = _xlsx_rows(x.content)
    dec = next(r for r in rows if r[0] == "Dec 2026")
    assert dec[1] == "18,13,86,300.26"  # crore grouping
    closing = D("98700") + D("181386300.26")
    assert next(r for r in rows if r[0] == "Grand Total")[4] == f"{format_indian(closing)} Dr"


@pytest.mark.asyncio
async def test_export_negative_values_use_tally_style(db_session_integration):
    pytest.importorskip("openpyxl")
    db = db_session_integration
    tenant, user, w = await seed_cash_world(db)
    await post(db, tenant.id, date(2026, 12, 2), [(w["ledgers"]["rent"], "DEBIT", "123456"), (w["ledgers"]["cash"], "CREDIT", "123456")])
    async with api_client(db, tenant, user) as ac:
        x = await ac.get(f"{API}/cash-flow-monthly/export", params={"fiscal_year": 2026, "format": "xlsx"})
    dec = next(r for r in _xlsx_rows(x.content) if r[0] == "Dec 2026")
    assert dec[2] == "1,23,456.00" and dec[3] == "(-)1,23,456.00"  # nett flow negative -> (-)


@pytest.mark.asyncio
async def test_export_and_view_permission_denial(db_session_integration):
    db = db_session_integration
    enforce = {"rbac_enforcement": "enforce"}
    t1, u1, _ = await seed_world(db, role_name="viewer_only", flags=enforce,
                                 permissions={"finance.access": True, "finance.mis_report.export": False})
    t2, u2, _ = await seed_world(db, role_name="no_view", flags=enforce,
                                 permissions={"finance.access": True, "finance.mis_report.view": False})
    t3, u3, _ = await seed_world(db, role_name="plain", flags=enforce, permissions={"finance.access": True})
    t4, u4, _ = await seed_world(db, role_name="noaccess", flags=enforce, permissions={})
    new_paths = ("cash-flow-monthly", "funds-flow-monthly", "ratio-analysis", "stock-gl-reconciliation")
    cases = (
        (t1, u1, {"json": 200, "export": 403}),
        (t2, u2, {"json": 403, "export": 403}),  # view denied blocks JSON and export
        (t3, u3, {"json": 200, "export": 200}),  # missing soft keys allow
        (t4, u4, {"json": 403, "export": 403}),  # no finance.access
    )
    for tenant, user, expect in cases:
        async with api_client(db, tenant, user) as ac:
            for path in new_paths:
                assert (await _get(ac, path)).status_code == expect["json"], (user.username, path)
            for report in EXPORTS:
                assert (await _get(ac, f"{report}/export")).status_code == expect["export"], (user.username, report)
            assert (await ac.get(f"{API}/drill/group", params={"group_id": 1})).status_code in (expect["json"], 404)
            assert (await ac.get(f"{API}/drill/cash-flow", params={"month": "2026-01"})).status_code == expect["json"]


@pytest.mark.asyncio
@pytest.mark.parametrize("flags", [{"finance_statements_v2": False}, {"finance_statements_v2": "true"}, {}])
async def test_new_endpoints_return_404_when_flag_is_off(db_session_integration, flags):
    db = db_session_integration
    tenant, user, _w = await seed_world(db)
    tenant.feature_flags = dict(flags)
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        for path in ("cash-flow-monthly", "funds-flow-monthly", "ratio-analysis", "stock-gl-reconciliation",
                     "trial-balance/export", "ratio-analysis/export", "drill/group?group_id=1", "drill/ledger?account_id=1",
                     "drill/cash-flow?month=2026-01"):
            assert (await ac.get(f"{API}/{path}")).status_code == 404, path


@pytest.mark.asyncio
async def test_validation_errors_are_422(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_world(db)
    async with api_client(db, tenant, user) as ac:
        for path, params in [
            ("cash-flow-monthly", {"fiscal_year": 1800}),
            ("cash-flow-monthly", {"fiscal_year": "abc"}),
            ("funds-flow-monthly", {"fiscal_year": 99999}),
            ("ratio-analysis", {"as_of_date": "2026-02-30"}),
            ("stock-gl-reconciliation", {"as_of_date": "yesterday"}),
            ("drill/group", {}),
            ("drill/group", {"group_id": 0}),
            ("drill/group", {"group_id": 1, "from_date": "2026-12-31", "to_date": "2026-01-01"}),
            ("drill/ledger", {"account_id": "x"}),
            ("trial-balance/export", {"format": "csv"}),
            ("not-a-report/export", {}),
            ("balance-sheet/export", {"as_of_date": "2026-12-31", "fiscal_year": 2026}),
        ]:
            assert (await _get(ac, path, **params)).status_code == 422, (path, params)


# ---- Query counts --------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_query_counts_are_bounded_and_do_not_grow_with_data(db_session_integration):
    db = db_session_integration
    tenant, _user, w = await seed_cash_world(db)
    await _seed_stock(db, tenant.id)
    today = date(2026, 12, 31)

    async def counts() -> dict[str, int]:
        out: dict[str, int] = {}
        with QueryCounter(db) as q:
            await build_cash_flow(db, tenant, fiscal_year=2026, today=today)
        out["cash"] = q.count
        with QueryCounter(db) as q:
            await build_funds_flow(db, tenant, fiscal_year=2026, today=today)
        out["funds"] = q.count
        with QueryCounter(db) as q:
            await build_ratio_analysis(db, tenant, from_date=date(2026, 1, 1), to_date=today)
        out["ratio"] = q.count
        with QueryCounter(db) as q:
            await build_stock_gl(db, tenant, as_of_date=today)
        out["stock"] = q.count
        with QueryCounter(db) as q:
            await drill_group(db, tenant, group_id=w["groups"]["ca"].id, from_date=date(2026, 1, 1), to_date=today, today=today)
        out["drill_group"] = q.count
        with QueryCounter(db) as q:
            await drill_ledger(db, tenant, account_id=w["ledgers"]["cash"].id, from_date=date(2026, 1, 1), to_date=today,
                               today=today, limit=50, offset=0)
        out["drill_ledger"] = q.count
        return out

    small = await counts()
    budgets = {"cash": 5, "funds": 6, "ratio": 10, "stock": 6, "drill_group": 5, "drill_ledger": 5}
    for key, limit in budgets.items():
        assert small[key] <= limit, (key, small[key], limit)
    # 40 more cash-pool / working-capital ledgers and 120 vouchers must not add a single statement
    cash_g, ca_g = w["groups"]["cash"], w["groups"]["bank"]
    sales = w["ledgers"]["sales"]
    for i in range(40):
        ledger = await make_ledger(db, tenant.id, cash_g if i % 2 else ca_g, f"Extra {i}")
        for day in (3, 9, 17):
            await post(db, tenant.id, date(2026, 1 + i % 12, day), [(ledger, "DEBIT", "10"), (sales, "CREDIT", "10")])
    assert await counts() == small
