"""Budget analytics, expense analysis and expense controls (PLAN Phase 4, acceptance 4.1-4.8).

Every expected figure is worked out by hand below (never by calling the service under test).

World `seed_ba_world`: fiscal year starts in July, FY label "2030-31" (2030-07-01 .. 2031-06-30), base currency BDT.
  cost centres  A (department "Sewing")   B (department "Finishing ", trailing space on purpose)   C (no department)
  budget (FINAL, "2030-31"):  L1 rent / A / 2030-07 = 1000      L2 wages / B / 2030-Q1 = 3000 (Jul, Aug, Sep: 1000 each)
                              L3 wages / A / ANNUAL = 1200.01   L4 rent / no cost centre / 2030-08 = 500        total 5700.01
      ANNUAL spread: 1200.01 / 12 = 100.0008 (4 decimals, rounded down) x 11 = 1100.0088, last month 100.0012
  actual (posted, in books, base currency):
      Jul 10 rent 800 on A          Jul 20 wages 1000 on A         Aug 5 wages 1500 on B        Aug 15 rent 600 (no cost centre)
      Sep 1 purchases 400 on C      Oct 1 misc expense 100 (group has no class, no cost centre)
      Nov 1 rent USD 10 at 110 = base 1100 on B
      Dec 1 rent 777 on A, REVERSED by a Dec 2 reversal                      -> nets to 0
      never counted: draft / cancelled / memorandum rent 9999 on A (in the FY); rent 5000 on 2031-07-01 (next FY)
      before the FY: 2030-06-30 rent 500 on A, 2030-03-01 wages 1000 on B (only the expense-analysis comparison reads them)
  => total actual 5500:  cost centre A 1800, B 2600, C 400, none 700 | rent 2500, wages 2500, purchases 400, misc 100
                         Jul 1800, Aug 2100, Sep 400, Oct 100, Nov 1100, Dec 0 | Sewing 1800, Finishing 2600, none 1100

Run: docker compose exec -T backend pytest tests/test_finance_budget_analytics.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.finance import Budget, BudgetLine, CostCenter, VendorBill, Voucher
from app.models.inventory import Vendor
from app.modules.finance.budget_analytics.analytics_service import status_for
from tests.benchmark_fixtures import api_client
from tests.finance_control_fixtures import cr, dr, post_v, uid
from tests.finance_statement_fixtures import make_group, make_ledger, seed_world
from tests.test_perf_inventory_reports_equivalence import QueryCounter

D = Decimal
FLAG = {"finance_budget_analytics_v2": True, "fiscal_year_start_month": 7}
API = "/api/v1/finance"
BA = f"{API}/budget-analytics"
FY = "2030-31"
ANALYSIS = {"from_date": "2030-07-01", "to_date": "2030-12-31"}


async def seed_ba_world(db, *, flags: dict | None = None, role_name: str = "admin", permissions: dict | None = None, departments: bool = True):
    tenant, user, w = await seed_world(db, flags={**FLAG, **(flags or {})}, role_name=role_name, permissions=permissions)
    t, g, L = tenant.id, w["groups"], w["ledgers"]
    purchase_g = await make_group(db, t, "Purchases", "Expense", "PURCHASE_ACCOUNTS")
    L["purchases"] = await make_ledger(db, t, purchase_g, "Fabric Purchases")
    cc_a = CostCenter(tenant_id=t, center_code=f"CCA{uid()}", name="Cutting", department="Sewing" if departments else None)
    cc_b = CostCenter(tenant_id=t, center_code=f"CCB{uid()}", name="Packing", department="Finishing " if departments else None)
    cc_c = CostCenter(tenant_id=t, center_code=f"CCC{uid()}", name="Yard")
    db.add_all([cc_a, cc_b, cc_c])
    await db.flush()
    w["cc"] = {"a": cc_a, "b": cc_b, "c": cc_c}

    budget = Budget(tenant_id=t, budget_name="FY30 plan", fiscal_year=FY, status="FINAL")
    draft = Budget(tenant_id=t, budget_name="FY30 draft", fiscal_year=FY, status="DRAFT")
    db.add_all([budget, draft])
    await db.flush()
    db.add_all(
        [
            BudgetLine(tenant_id=t, budget_id=budget.id, cost_center_id=cc_a.id, account_id=L["rent"].id, period_month="2030-07", amount=D("1000")),
            BudgetLine(tenant_id=t, budget_id=budget.id, cost_center_id=cc_b.id, account_id=L["wages"].id, period_month="2030-Q1", amount=D("3000")),
            BudgetLine(tenant_id=t, budget_id=budget.id, cost_center_id=cc_a.id, account_id=L["wages"].id, period_month="ANNUAL", amount=D("1200.01")),
            BudgetLine(tenant_id=t, budget_id=budget.id, cost_center_id=None, account_id=L["rent"].id, period_month="2030-08", amount=D("500")),
            # a DRAFT budget never counts unless it is asked for by id
            BudgetLine(tenant_id=t, budget_id=draft.id, cost_center_id=cc_c.id, account_id=L["rent"].id, period_month="2030-07", amount=D("77777")),
        ]
    )
    w["budget"], w["draft_budget"] = budget, draft

    A, B, C = cc_a.id, cc_b.id, cc_c.id
    cash = L["cash"]
    v_rent_a = await post_v(db, t, date(2030, 7, 10), [dr(L["rent"], "800", cc=A), cr(cash, "800")])
    v_wages_a = await post_v(db, t, date(2030, 7, 20), [dr(L["wages"], "1000", cc=A), cr(cash, "1000")])
    v_wages_b = await post_v(db, t, date(2030, 8, 5), [dr(L["wages"], "1500", cc=B), cr(cash, "1500")])
    await post_v(db, t, date(2030, 8, 15), [dr(L["rent"], "600"), cr(cash, "600")])
    v_purchase = await post_v(db, t, date(2030, 9, 1), [dr(L["purchases"], "400", cc=C), cr(cash, "400")])
    await post_v(db, t, date(2030, 10, 1), [dr(L["misc_exp"], "100"), cr(cash, "100")])
    await post_v(db, t, date(2030, 11, 1), [dr(L["rent"], "10", base="1100", cc=B), cr(cash, "10", base="1100")])
    original = await post_v(db, t, date(2030, 12, 1), [dr(L["rent"], "777", cc=A), cr(cash, "777")], status="REVERSED")
    reversal = await post_v(db, t, date(2030, 12, 2), [dr(cash, "777"), cr(L["rent"], "777", cc=A)], reverses_voucher_id=original.id)
    original.reversed_by_voucher_id = reversal.id
    big = [dr(L["rent"], "9999", cc=A), cr(cash, "9999")]
    await post_v(db, t, date(2030, 9, 9), big, status="DRAFT")
    await post_v(db, t, date(2030, 9, 9), big, status="CANCELLED")
    await post_v(db, t, date(2030, 9, 9), big, vtype="MEMORANDUM", is_memorandum=True)
    await post_v(db, t, date(2031, 7, 1), [dr(L["rent"], "5000", cc=A), cr(cash, "5000")])
    await post_v(db, t, date(2030, 6, 30), [dr(L["rent"], "500", cc=A), cr(cash, "500")])
    await post_v(db, t, date(2030, 3, 1), [dr(L["wages"], "1000", cc=B), cr(cash, "1000")])
    w["vouchers"] = {"rent_a": v_rent_a, "wages_a": v_wages_a, "wages_b": v_wages_b, "purchase": v_purchase}
    await db.flush()
    return tenant, user, w


async def _get(ac, path, expected=200, **params):
    r = await ac.get(path, params=params)
    assert r.status_code == expected, (path, params, r.status_code, r.text)
    return r.json()


def _rows(data) -> dict:
    return {r["id"]: r for r in data["rows"]}


# ---- 4.1 every slice totals to the same overall actual ----------------------------------------------------------------
@pytest.mark.asyncio
async def test_every_slice_totals_to_the_same_actual(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db)
    async with api_client(db, tenant, user) as ac:
        slices = {dim: await _get(ac, BA, fiscal_year=FY, dimension=dim) for dim in ("cost_center", "account", "month", "department")}
    for dim, data in slices.items():
        assert data["totals"]["actual"] == "5500.0000", dim
        assert sum(D(r["actual"]) for r in data["rows"]) == D("5500"), dim
        assert D(data["totals"]["budget"]) == D("5700.01"), dim
        assert sum(D(r["budget"]) for r in data["rows"]) == D("5700.01"), dim
        assert D(data["totals"]["variance"]) == D("200.01"), dim
        assert data["fiscal_year"] == FY and data["fiscal_year_start"] == "2030-07-01" and data["fiscal_year_end"] == "2031-06-30"
        assert [b["budget_name"] for b in data["budgets"]] == ["FY30 plan"]  # the DRAFT budget is not used
    cc = w["cc"]
    rows = _rows(slices["cost_center"])
    assert (rows[cc["a"].id]["budget"], rows[cc["a"].id]["actual"]) == ("2200.0100", "1800.0000")
    assert (rows[cc["b"].id]["budget"], rows[cc["b"].id]["actual"]) == ("3000.0000", "2600.0000")
    assert (rows[cc["c"].id]["budget"], rows[cc["c"].id]["actual"]) == ("0.0000", "400.0000")
    assert (rows[None]["budget"], rows[None]["actual"], rows[None]["label"]) == ("500.0000", "700.0000", "(No cost centre)")
    L = w["ledgers"]
    rows = _rows(slices["account"])
    assert (rows[L["rent"].id]["budget"], rows[L["rent"].id]["actual"]) == ("1500.0000", "2500.0000")
    assert (rows[L["wages"].id]["budget"], rows[L["wages"].id]["actual"]) == ("4200.0100", "2500.0000")
    assert rows[L["purchases"].id]["actual"] == "400.0000" and rows[L["misc_exp"].id]["actual"] == "100.0000"
    rows = _rows(slices["department"])
    assert (rows["Sewing"]["budget"], rows["Sewing"]["actual"]) == ("2200.0100", "1800.0000")
    assert (rows["Finishing"]["budget"], rows["Finishing"]["actual"]) == ("3000.0000", "2600.0000")  # trailing space trimmed
    assert (rows[None]["actual"], rows[None]["label"]) == ("1100.0000", "(No department)")  # C + no cost centre, never HR depts
    # the foreign-currency line (USD 10 at 110) is counted at its base amount 1100, never at 10
    assert D(_rows(slices["month"])["2030-11"]["actual"]) == D("1100")


# ---- 4.3 month order and the exact spread of quarter / annual lines -----------------------------------------------------
@pytest.mark.asyncio
async def test_month_order_and_exact_budget_spread(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_ba_world(db)
    async with api_client(db, tenant, user) as ac:
        data = await _get(ac, BA, fiscal_year=FY, dimension="month")
    ids = [r["id"] for r in data["rows"]]
    assert ids == ["2030-07", "2030-08", "2030-09", "2030-10", "2030-11", "2030-12", "2031-01", "2031-02", "2031-03", "2031-04", "2031-05", "2031-06"]
    rows = _rows(data)
    # Jul: L1 1000 + quarter share 1000 + annual share 100.0008      Aug: 1000 + 100.0008 + L4 500      Sep: 1000 + 100.0008
    assert rows["2030-07"]["budget"] == "2100.0008" and rows["2030-08"]["budget"] == "1600.0008" and rows["2030-09"]["budget"] == "1100.0008"
    assert rows["2030-10"]["budget"] == "100.0008" and rows["2031-05"]["budget"] == "100.0008"
    assert rows["2031-06"]["budget"] == "100.0012"  # the rounding remainder lands on the last month
    assert sum(D(r["budget"]) for r in data["rows"]) == D("5700.01")  # exact, no drift
    assert any("spread evenly" in n for n in data["notes"])
    # Jul actual 1800 vs 2100.0008 = 85.7140% -> warning
    assert rows["2030-07"]["status"] == "warning" and rows["2030-12"]["actual"] == "0.0000"
    # the other dimensions do NOT spread: a quarter line stays one amount
    async with api_client(db, tenant, user) as ac:
        cc = _rows(await _get(ac, BA, fiscal_year=FY, dimension="cost_center"))
    assert cc[_w["cc"]["b"].id]["budget"] == "3000.0000"


# ---- 4.6 thresholds: 79 / 80 / 100 / 110 --------------------------------------------------------------------------------
def test_status_thresholds_pure():
    for budget, actual, status in (
        ("100", "79.9999", "within"), ("100", "79", "within"), ("100", "80", "warning"), ("100", "99.9999", "warning"),
        ("100", "100", "over"), ("100", "109.9999", "over"), ("100", "110", "critical"), ("100", "250", "critical"),
        ("0", "5", "over"), ("0", "0", "within"), ("100", "0", "within"),
    ):
        assert status_for(D(budget), D(actual))[0] == status, (budget, actual)
    assert status_for(D("0"), D("5"))[1] is None and status_for(D("200"), D("50"))[1] == D("25")


@pytest.mark.asyncio
async def test_status_thresholds_over_http(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_world(db, flags=FLAG)
    t, L = tenant.id, w["ledgers"]
    budget = Budget(tenant_id=t, budget_name="Thresholds", fiscal_year=FY, status="FINAL")
    db.add(budget)
    await db.flush()
    expected = {}
    for amount, status in (("79.9999", "within"), ("80", "warning"), ("100", "over"), ("109.9999", "over"), ("110", "critical")):
        cc = CostCenter(tenant_id=t, center_code=f"T{uid()}", name=f"CC {amount}")
        db.add(cc)
        await db.flush()
        db.add(BudgetLine(tenant_id=t, budget_id=budget.id, cost_center_id=cc.id, account_id=L["rent"].id, period_month="2030-07", amount=D("100")))
        await post_v(db, t, date(2030, 7, 5), [dr(L["rent"], amount, cc=cc.id), cr(L["cash"], amount)])
        expected[cc.id] = status
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        data = await _get(ac, BA, fiscal_year=FY, dimension="cost_center", budget_id=budget.id)
    rows = _rows(data)
    assert {cid: rows[cid]["status"] for cid in expected} == expected
    assert rows[next(c for c, s in expected.items() if s == "warning")]["used_percent"] == "80.0000"
    assert data["totals"]["actual"] == "479.9998" and data["totals"]["status"] == "warning"  # 479.9998 / 500 = 95.9999%


# ---- 4.2 drill-down equals the cell it was opened from -------------------------------------------------------------------
@pytest.mark.asyncio
async def test_drilldown_total_equals_every_cell(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db)
    cc, L = w["cc"], w["ledgers"]
    async with api_client(db, tenant, user) as ac:
        by_cc = await _get(ac, BA, fiscal_year=FY, dimension="cost_center")
        by_account = await _get(ac, BA, fiscal_year=FY, dimension="account")
        by_month = await _get(ac, BA, fiscal_year=FY, dimension="month")
        by_dept = await _get(ac, BA, fiscal_year=FY, dimension="department")
        for row in by_cc["rows"]:
            params = {"no_cost_center": True} if row["id"] is None else {"cost_center_id": row["id"]}
            d = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, **params)
            assert D(d["total"]) == D(row["actual"]), ("cc", row["label"])
        for row in by_account["rows"]:
            d = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, account_id=row["id"])
            assert D(d["total"]) == D(row["actual"]), ("account", row["label"])
        for row in by_month["rows"]:
            d = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, month=row["id"])
            assert D(d["total"]) == D(row["actual"]), ("month", row["id"])
        for row in by_dept["rows"]:
            params = {"no_department": True} if row["id"] is None else {"department": row["id"]}
            d = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, **params)
            assert D(d["total"]) == D(row["actual"]), ("department", row["label"])
        # cost centre A: rent 800, wages 1000, the reversed rent 777 and its reversal -777 = 4 lines, 1800
        full = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, cost_center_id=cc["a"].id)
        assert full["total"] == "1800.0000" and full["line_count"] == 4 and len(full["lines"]) == 4
        assert sorted(ln["signed_amount"] for ln in full["lines"]) == ["-777.0000", "1000.0000", "777.0000", "800.0000"]
        assert all(ln["base_amount"].startswith(("800", "1000", "777")) for ln in full["lines"])
        # paging: two pages of 2 hold exactly the same lines and the same total
        p1 = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, cost_center_id=cc["a"].id, limit=2, offset=0)
        p2 = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, cost_center_id=cc["a"].id, limit=2, offset=2)
        ids = [ln["voucher_line_id"] for ln in p1["lines"] + p2["lines"]]
        assert ids == [ln["voucher_line_id"] for ln in full["lines"]] and len(set(ids)) == 4
        assert p1["total"] == p2["total"] == "1800.0000" and p1["line_count"] == 4
        # cost centre B + rent + November = the USD 10 line at base 1100
        one = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, cost_center_id=cc["b"].id, account_id=L["rent"].id, month="2030-11")
        assert one["total"] == "1100.0000" and one["line_count"] == 1
        assert one["lines"][0]["base_amount"] == "1100.0000" and one["lines"][0]["cost_center_id"] == cc["b"].id
        assert one["lines"][0]["voucher_number"] and one["lines"][0]["voucher_status"] == "POSTED"
        # the reversed voucher and its reversal both appear and net to zero
        dec = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, month="2030-12")
        assert dec["total"] == "0.0000" and dec["line_count"] == 2 and {ln["voucher_status"] for ln in dec["lines"]} == {"REVERSED", "POSTED"}
        # a budget_id keeps the same numbers
        again = await _get(ac, f"{BA}/drilldown", budget_id=w["budget"].id, cost_center_id=cc["a"].id)
        assert again["total"] == "1800.0000"
        # draft / cancelled / memorandum / next-fiscal-year vouchers never appear
        everything = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, limit=500)
        assert everything["total"] == "5500.0000" and everything["line_count"] == len(everything["lines"])
        assert all(ln["voucher_status"] in ("POSTED", "REVERSED") for ln in everything["lines"])
        assert all("9999" not in ln["base_amount"][:4] and "5000" != ln["base_amount"][:4] for ln in everything["lines"])


# ---- expense analysis -----------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_expense_analysis_classes_and_comparison(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db)
    L, cc = w["ledgers"], w["cc"]
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{uid()}", name="Fabric House")
    other = Vendor(tenant_id=tenant.id, vendor_code=f"V{uid()}", name="Cancelled Co")
    db.add_all([vendor, other])
    await db.flush()
    vs = w["vouchers"]
    for code, ven, voucher, status in (("B1", vendor, vs["wages_b"], "APPROVED"), ("B2", vendor, vs["purchase"], "APPROVED"), ("B3", other, vs["wages_a"], "CANCELLED")):
        db.add(VendorBill(tenant_id=tenant.id, bill_code=f"{code}-{uid()}", vendor_id=ven.id, status=status, voucher_id=voucher.id))
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        acct = await _get(ac, f"{API}/expense-analysis", group_by="account", **ANALYSIS)
        ccs = await _get(ac, f"{API}/expense-analysis", group_by="cost_center", **ANALYSIS)
        months = await _get(ac, f"{API}/expense-analysis", group_by="month", **ANALYSIS)
        vendors = await _get(ac, f"{API}/expense-analysis", group_by="vendor", **ANALYSIS)
    for data in (acct, ccs, months, vendors):
        # rent 2500 + wages 2500 + purchases 400; the unclassified misc expense (100) is reported, never added
        assert data["total_current"] == "5400.0000" and data["total_previous"] == "1500.0000"
        assert data["change"] == "3900.0000" and data["change_percent"] == "260.0000"
        assert sum(D(r["current"]) for r in data["rows"]) == D("5400")
        assert (data["previous_from_date"], data["previous_to_date"]) == ("2029-12-29", "2030-06-30")  # 184 days before
        assert sorted(data["expense_classes"]) == ["COGS", "DIRECT_EXPENSES", "INDIRECT_EXPENSES", "PURCHASE_ACCOUNTS"]
        classes = {c["statement_class"]: (c["current"], c["previous"]) for c in data["by_class"]}
        assert classes == {
            "INDIRECT_EXPENSES": ("2500.0000", "500.0000"),
            "DIRECT_EXPENSES": ("2500.0000", "1000.0000"),
            "PURCHASE_ACCOUNTS": ("400.0000", "0.0000"),
        }
        (warning,) = data["warnings"]
        assert warning["code"] == "UNCLASSIFIED_EXPENSE_GROUPS" and warning["current"] == "100.0000" and warning["account_count"] == 1
    rows = _rows(acct)
    assert (rows[L["rent"].id]["current"], rows[L["rent"].id]["previous"], rows[L["rent"].id]["change"], rows[L["rent"].id]["change_percent"]) == (
        "2500.0000", "500.0000", "2000.0000", "400.0000")
    assert rows[L["wages"].id]["change_percent"] == "150.0000"
    assert rows[L["purchases"].id]["previous"] == "0.0000" and rows[L["purchases"].id]["change_percent"] is None  # no base to compare
    assert L["misc_exp"].id not in rows
    rows = _rows(ccs)
    assert {k: (v["current"], v["previous"]) for k, v in rows.items()} == {
        cc["a"].id: ("1800.0000", "500.0000"), cc["b"].id: ("2600.0000", "1000.0000"), cc["c"].id: ("400.0000", "0.0000"), None: ("600.0000", "0.0000")}
    rows = _rows(months)
    assert list(rows) == ["2030-07", "2030-08", "2030-09", "2030-10", "2030-11", "2030-12"]
    assert [rows[m]["current"] for m in rows] == ["1800.0000", "2100.0000", "400.0000", "0.0000", "1100.0000", "0.0000"]
    # month rows compare with the previous calendar month: June held 500
    assert (rows["2030-07"]["previous"], rows["2030-07"]["change"], rows["2030-07"]["change_percent"]) == ("500.0000", "1300.0000", "260.0000")
    assert rows["2030-08"]["previous"] == "1800.0000" and rows["2030-12"]["previous"] == "1100.0000"
    # vendor: only the explicit vendor-bill link counts; the CANCELLED bill is ignored
    rows = _rows(vendors)
    assert (rows[vendor.id]["label"], rows[vendor.id]["current"]) == ("Fabric House", "1900.0000")
    assert (rows[None]["label"], rows[None]["current"], rows[None]["previous"]) == ("(No vendor bill link)", "3500.0000", "1500.0000")
    assert other.id not in rows


# ---- expense controls --------------------------------------------------------------------------------------------------------
AS_OF = "2030-10-31"


async def seed_ctl_world(db, *, budgets: bool = True, flags: dict | None = None):
    tenant, user, w = await seed_world(db, flags={**FLAG, **(flags or {})})
    t, g, L = tenant.id, w["groups"], w["ledgers"]
    purchase_g = await make_group(db, t, "Purchases", "Expense", "PURCHASE_ACCOUNTS")
    L["purchases"] = await make_ledger(db, t, purchase_g, "Fabric Purchases")
    for name in ("stationery", "newacct", "repeat_acct", "no_cc_acct", "no_cc_zero"):
        L[name] = await make_ledger(db, t, g["iexp"], name)
    cc_a = CostCenter(tenant_id=t, center_code=f"CCA{uid()}", name="Cutting")
    db.add(cc_a)
    await db.flush()
    A, cash = cc_a.id, L["cash"]
    w["cc_a"] = cc_a

    async def spend(vdate, account, amount, *, cc=A, description=None, **kw):
        lines = [dr(account, amount, cc=cc), cr(cash, amount)]
        v = await post_v(db, t, vdate, lines, **kw)
        v.description = description
        return v

    for account, history, october in (
        (L["rent"], "10000", "20000"),  # 200% of the 3-month average -> flagged
        (L["wages"], "10000", "14000"),  # 140% -> not flagged
        (L["purchases"], "10000", "15000"),  # exactly 150% -> not flagged (strictly above)
        (L["stationery"], "100", "1000"),  # 1000% but below the minimum amount
    ):
        for month in (7, 8, 9):
            await spend(date(2030, month, 15), account, history)
        await spend(date(2030, 10, 15), account, october)
    await spend(date(2030, 10, 20), L["newacct"], "50000")  # no history at all -> never an "increase"
    rep = L["repeat_acct"]
    v1 = await spend(date(2030, 10, 1), rep, "750", description="Tea Supplier")
    v2 = await spend(date(2030, 10, 5), rep, "750", description="tea   supplier ")  # same party after normalising
    await spend(date(2030, 10, 20), rep, "750", description="Tea Supplier")  # 15 days later: a new cluster of one
    await spend(date(2030, 10, 6), rep, "750", description="Other")  # other narration
    await spend(date(2030, 10, 6), rep, "760", description="Tea Supplier")  # other amount
    twin = await post_v(db, t, date(2030, 10, 12), [dr(rep, "300", cc=A), dr(rep, "300", cc=A), cr(cash, "600")])  # one voucher
    twin.description = "Dup"
    r1 = await spend(date(2030, 10, 10), rep, "640", description="Rev", status="REVERSED")
    rr = await post_v(db, t, date(2030, 10, 10), [dr(cash, "640"), cr(rep, "640", cc=A)], reverses_voucher_id=r1.id)
    r1.reversed_by_voucher_id = rr.id
    await spend(date(2030, 10, 11), rep, "640", description="Rev")  # the reversed original must not count as a repeat
    # same vendor through vendor bills (no narration), and a pair whose only bill is CANCELLED
    vendor = Vendor(tenant_id=t, vendor_code=f"V{uid()}", name="Trim House")
    db.add(vendor)
    await db.flush()
    vv = [await spend(date(2030, 10, 22), rep, "900"), await spend(date(2030, 10, 25), rep, "900")]
    cv = [await spend(date(2030, 10, 26), rep, "910"), await spend(date(2030, 10, 27), rep, "910")]
    for voucher, status in [(v, "APPROVED") for v in vv] + [(v, "CANCELLED") for v in cv]:
        db.add(VendorBill(tenant_id=t, bill_code=f"B-{uid()}", vendor_id=vendor.id, status=status, voucher_id=voucher.id))
    # missing cost centre: 200 + 300 (net 500), and a reversed pair that nets to zero
    await spend(date(2030, 10, 3), L["no_cc_acct"], "200", cc=None)
    await spend(date(2030, 10, 4), L["no_cc_acct"], "300", cc=None)
    z = await spend(date(2030, 10, 5), L["no_cc_zero"], "150", cc=None, status="REVERSED")
    zr = await post_v(db, t, date(2030, 10, 6), [dr(cash, "150"), cr(L["no_cc_zero"], "150")], reverses_voucher_id=z.id)
    z.reversed_by_voucher_id = zr.id
    # budget alerts / unbudgeted spend
    final = Budget(tenant_id=t, budget_name="Controls", fiscal_year=FY, status="FINAL" if budgets else "DRAFT")
    db.add(final)
    await db.flush()
    db.add_all(
        [
            BudgetLine(tenant_id=t, budget_id=final.id, cost_center_id=A, account_id=L["rent"].id, period_month="ANNUAL", amount=D("62500")),
            BudgetLine(tenant_id=t, budget_id=final.id, cost_center_id=None, account_id=L["purchases"].id, period_month="ANNUAL", amount=D("40000")),
            BudgetLine(tenant_id=t, budget_id=final.id, cost_center_id=A, account_id=L["wages"].id, period_month="ANNUAL", amount=D("100000")),
        ]
    )
    await db.flush()
    w.update(final=final, vendor=vendor, v_tea=[v1, v2], v_vendor=vv, v_cancelled=cv)
    return tenant, user, w


def _rule(data, code) -> dict:
    return next(r for r in data["rules"] if r["code"] == code)


@pytest.mark.asyncio
async def test_expense_controls_every_rule(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ctl_world(db)
    L = w["ledgers"]
    async with api_client(db, tenant, user) as ac:
        data = await _get(ac, f"{API}/expense-controls", as_of_date=AS_OF)
    assert [r["code"] for r in data["rules"]] == ["UNUSUAL_INCREASE", "UNBUDGETED_SPEND", "REPEATED_AMOUNT", "MISSING_COST_CENTRE", "BUDGET_ALERT"]
    assert data["fiscal_year"] == FY and data["as_of_date"] == AS_OF

    unusual = _rule(data, "UNUSUAL_INCREASE")  # only rent: wages 140%, purchases exactly 150%, stationery below minimum, newacct no history
    assert unusual["count"] == 1
    (item,) = unusual["items"]
    assert item["account_id"] == L["rent"].id and item["amount"] == "20000.0000" and len(item["voucher_ids"]) == 1
    ev = item["evidence"]
    assert (ev["current_spend"], ev["trailing_average"], ev["ratio_percent"]) == ("20000.0000", "10000.0000", "200.0000")
    assert set(ev["trailing_months"]) == {"2030-07", "2030-08", "2030-09"} and ev["month"] == "2030-10"

    unbudgeted = _rule(data, "UNBUDGETED_SPEND")  # rent/A, wages/A and purchases (any cost centre) are covered; the reversed pair nets to 0
    assert {i["account_id"] for i in unbudgeted["items"]} == {L["stationery"].id, L["newacct"].id, L["repeat_acct"].id, L["no_cc_acct"].id}
    assert unbudgeted["count"] == 4
    assert all(i["evidence"]["budget_ids"] == [w["final"].id] and i["voucher_ids"] for i in unbudgeted["items"])
    nocc = next(i for i in unbudgeted["items"] if i["account_id"] == L["no_cc_acct"].id)
    assert nocc["cost_center_id"] is None and nocc["amount"] == "500.0000"

    repeated = _rule(data, "REPEATED_AMOUNT")
    assert repeated["count"] == 2 and [i["amount"] for i in repeated["items"]] == ["1800.0000", "1500.0000"]
    by_vendor, by_text = repeated["items"]
    assert by_vendor["evidence"]["party_type"] == "vendor" and by_vendor["evidence"]["vendor_id"] == w["vendor"].id
    assert sorted(by_vendor["voucher_ids"]) == sorted(v.id for v in w["v_vendor"])
    assert by_text["evidence"]["party_type"] == "narration" and by_text["evidence"]["occurrences"] == 2
    assert sorted(by_text["voucher_ids"]) == sorted(v.id for v in w["v_tea"])
    assert by_text["evidence"]["unit_amount"] == "750.0000" and by_text["evidence"]["dates"] == ["2030-10-01", "2030-10-05"]

    missing = _rule(data, "MISSING_COST_CENTRE")  # no_cc_zero nets to 0 and is skipped
    assert missing["count"] == 1 and missing["amount"] == "500.0000"
    (m,) = missing["items"]
    assert m["account_id"] == L["no_cc_acct"].id and m["evidence"]["line_count"] == 2 and len(m["voucher_ids"]) == 2

    alerts = _rule(data, "BUDGET_ALERT")  # purchases 45000 / 40000 = 112.5% critical, rent 50000 / 62500 = exactly 80% warning, wages 54% none
    assert [(i["evidence"]["status"], i["evidence"]["used_percent"]) for i in alerts["items"]] == [("critical", "112.5000"), ("warning", "80.0000")]
    assert alerts["items"][0]["account_id"] == L["purchases"].id and alerts["items"][0]["budget_id"] == w["final"].id
    assert alerts["items"][0]["budget_line_id"] and alerts["items"][0]["severity"] == "high" and alerts["items"][1]["severity"] == "medium"
    assert alerts["items"][0]["evidence"]["thresholds"] == {"warning": "80", "over": "100", "critical": "110"}
    assert data["enforcement_mode"] in ("off", "warn", "block")  # shown, never changed


@pytest.mark.asyncio
async def test_expense_controls_negative_cases(db_session_integration):
    db = db_session_integration
    # no FINAL budget (a DRAFT one does not count) -> UNBUDGETED_SPEND is skipped with a note, BUDGET_ALERT is empty
    tenant, user, _w = await seed_ctl_world(db, budgets=False)
    async with api_client(db, tenant, user) as ac:
        data = await _get(ac, f"{API}/expense-controls", as_of_date=AS_OF)
        early = await _get(ac, f"{API}/expense-controls", as_of_date="2030-07-31")
    unbudgeted = _rule(data, "UNBUDGETED_SPEND")
    assert unbudgeted["count"] == 0 and "skipped" in unbudgeted["note"]
    assert _rule(data, "BUDGET_ALERT")["count"] == 0
    # as of July there are only 3 months of nothing to compare with: no increase, no repeat
    assert _rule(early, "UNUSUAL_INCREASE")["count"] == 0 and _rule(early, "REPEATED_AMOUNT")["count"] == 0
    # a bare tenant with no expense data at all returns five empty rules
    t2, u2, _ = await seed_world(db, flags=FLAG)
    async with api_client(db, t2, u2) as ac:
        bare = await _get(ac, f"{API}/expense-controls", as_of_date=AS_OF)
    assert [r["count"] for r in bare["rules"]] == [0, 0, 0, 0, 0]


# ---- tenant isolation -----------------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_cross_tenant_ids_look_missing_and_rows_never_leak(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db)
    t2, u2, w2 = await seed_ba_world(db)
    await post_v(db, t2.id, date(2030, 8, 1), [dr(w2["ledgers"]["rent"], "1000000", cc=w2["cc"]["a"].id), cr(w2["ledgers"]["cash"], "1000000")])
    async with api_client(db, tenant, user) as ac:
        for dim in ("cost_center", "account", "month", "department"):
            data = await _get(ac, BA, fiscal_year=FY, dimension=dim)
            assert data["totals"]["actual"] == "5500.0000", dim
        assert (await _get(ac, f"{API}/expense-analysis", **ANALYSIS))["total_current"] == "5400.0000"
        await _get(ac, BA, 404, budget_id=w2["budget"].id)
        await _get(ac, BA, 404, budget_id=999999999)
        await _get(ac, f"{BA}/drilldown", 404, budget_id=w2["budget"].id)
        await _get(ac, f"{BA}/drilldown", 404, fiscal_year=FY, cost_center_id=w2["cc"]["a"].id)
        await _get(ac, f"{BA}/drilldown", 404, fiscal_year=FY, account_id=w2["ledgers"]["rent"].id)
        await _get(ac, f"{BA}/export", 404, budget_id=w2["budget"].id)
        mine = await _get(ac, f"{BA}/drilldown", fiscal_year=FY, limit=500)
        assert mine["total"] == "5500.0000"
        own = await _get(ac, BA, fiscal_year=FY, dimension="cost_center", budget_id=w["budget"].id)
        assert own["budgets"][0]["id"] == w["budget"].id


# ---- permissions, flag, validation -------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_flag_permission_and_validation(db_session_integration):
    db = db_session_integration
    enforce = {"rbac_enforcement": "enforce"}
    t_on, u_on, _ = await seed_world(db, flags=FLAG)
    t_off, u_off, _ = await seed_world(db, flags={"finance_budget_analytics_v2": False})
    t_str, u_str, _ = await seed_world(db, flags={"finance_budget_analytics_v2": "true"})
    t_view, u_view, _ = await seed_world(db, role_name="analyst", permissions={"finance.access": True, "finance.mis_report.view": False}, flags={**FLAG, **enforce})
    t_none, u_none, _ = await seed_world(db, role_name="viewer", permissions={}, flags={**FLAG, **enforce})
    t_ok, u_ok, _ = await seed_world(db, role_name="clerk", permissions={"finance.access": True}, flags={**FLAG, **enforce})
    t_noexp, u_noexp, _ = await seed_world(
        db, role_name="reader", permissions={"finance.access": True, "finance.mis_report.export": False}, flags={**FLAG, **enforce}
    )
    view_paths = (
        (BA, {}), (f"{BA}/drilldown", {}), (f"{API}/expense-analysis", ANALYSIS), (f"{API}/expense-controls", {"as_of_date": AS_OF}),
    )
    for tenant, user, expected in (
        (t_on, u_on, 200), (t_off, u_off, 404), (t_str, u_str, 404), (t_view, u_view, 403), (t_none, u_none, 403), (t_ok, u_ok, 200), (t_noexp, u_noexp, 200),
    ):
        async with api_client(db, tenant, user) as ac:
            for path, params in view_paths:
                r = await ac.get(path, params=params)
                assert r.status_code == expected, (user.username, path, r.status_code)
    # export needs finance.mis_report.export on top of view; an explicit false denies it
    async with api_client(db, t_noexp, u_noexp) as ac:
        assert (await ac.get(f"{BA}/export")).status_code == 403
    async with api_client(db, t_view, u_view) as ac:
        assert (await ac.get(f"{BA}/export")).status_code == 403
    async with api_client(db, t_off, u_off) as ac:
        assert (await ac.get(f"{BA}/export")).status_code == 404
    async with api_client(db, t_ok, u_ok) as ac:
        assert (await ac.get(f"{BA}/export")).status_code == 200
    # validation (admin, flag on)
    async with api_client(db, t_on, u_on) as ac:
        for path, params in (
            (BA, {"dimension": "vendor"}), (BA, {"dimension": "DROP TABLE"}), (BA, {"fiscal_year": "abc"}), (BA, {"fiscal_year": "20300"}),
            (BA, {"budget_id": 0}), (BA, {"budget_id": "x"}),
            (f"{BA}/drilldown", {"month": "2030-13"}), (f"{BA}/drilldown", {"month": "abc"}), (f"{BA}/drilldown", {"fiscal_year": FY, "month": "2031-07"}),
            (f"{BA}/drilldown", {"limit": 0}), (f"{BA}/drilldown", {"limit": 501}), (f"{BA}/drilldown", {"offset": -1}),
            (f"{BA}/drilldown", {"cost_center_id": 1, "no_cost_center": True}),
            (f"{API}/expense-analysis", {"group_by": "party"}), (f"{API}/expense-analysis", {"from_date": "2030-12-01", "to_date": "2030-01-01"}),
            (f"{API}/expense-analysis", {"from_date": "2000-01-01", "to_date": "2030-01-01"}), (f"{API}/expense-analysis", {"from_date": "x"}),
            (f"{API}/expense-controls", {"as_of_date": "2030-13-01"}),
        ):
            assert (await ac.get(path, params=params)).status_code == 422, (path, params)
        # department view needs an explicit department on the Finance cost centres; HR departments are never used
        r = await ac.get(BA, params={"dimension": "department", "fiscal_year": FY})
        assert r.status_code == 422 and "department" in r.json()["detail"].lower()


@pytest.mark.asyncio
async def test_department_422_when_no_cost_centre_has_a_department_and_budget_mismatch(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db, departments=False)
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(BA, params={"dimension": "department", "fiscal_year": FY})
        assert r.status_code == 422 and "department" in r.json()["detail"].lower()
        # the other dimensions still work, and a budget of another fiscal year than asked for is a validation error
        assert (await ac.get(BA, params={"dimension": "cost_center", "fiscal_year": FY})).status_code == 200
        assert (await ac.get(BA, params={"budget_id": w["budget"].id, "fiscal_year": "2029-30"})).status_code == 422
        assert (await ac.get(BA, params={"budget_id": w["budget"].id})).status_code == 200  # fiscal year taken from the budget


@pytest.mark.asyncio
async def test_export_csv_and_formula_safety(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db)
    w["cc"]["a"].center_code = "=CMD"
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"{BA}/export", params={"fiscal_year": FY, "dimension": "cost_center"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    lines = r.text.strip().splitlines()
    assert lines[0] == "id,label,budget,actual,variance,variance_percent,used_percent,status"
    assert lines[-1].startswith(",TOTAL,5700.0100,5500.0000,200.0100,")
    assert "'=CMD - Cutting" in r.text  # a leading = is neutralised with a quote
    assert not any(part.startswith("=") for ln in lines for part in ln.split(","))


# ---- 4.5 existing endpoints unchanged -------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_existing_budget_vs_actual_unchanged(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db)
    async with api_client(db, tenant, user) as ac:
        before = await _get(ac, f"{API}/budgets/{w['budget'].id}/vs-actual")
        await _get(ac, BA, fiscal_year=FY, dimension="month")
        await _get(ac, f"{API}/expense-controls", as_of_date=AS_OF)
        after = await _get(ac, f"{API}/budgets/{w['budget'].id}/vs-actual")
    assert before == after
    # hand-worked: L1 rent/A Jul 800 | L2 wages/B Q1 1500 | L3 wages/A annual 1000 | L4 rent/any Aug 600
    assert before["total_budget"] == 5700.01 and before["total_actual"] == 3900.0
    assert set(before["rows"][0]) >= {"line_id", "budget_amount", "actual_amount", "variance", "variance_pct", "period_type", "net_rule"}
    # the read-only endpoints wrote nothing
    assert (await db.execute(select(Voucher.id).where(Voucher.tenant_id == tenant.id, Voucher.status == "POSTED"))).scalars().first() is not None


# ---- 4.8 bounded query counts -------------------------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_query_counts_do_not_grow_with_cost_centres_and_months(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_ba_world(db)
    t, L = tenant.id, w["ledgers"]
    calls = [(BA, {"fiscal_year": FY, "dimension": d}) for d in ("cost_center", "account", "month", "department")]
    calls += [(f"{BA}/drilldown", {"fiscal_year": FY, "limit": 500}), (f"{BA}/export", {"fiscal_year": FY})]
    calls += [(f"{API}/expense-analysis", {"group_by": g, **ANALYSIS}) for g in ("month", "account", "cost_center", "vendor")]

    async def measure(items) -> dict[str, int]:
        counts: dict[str, int] = {}
        async with api_client(db, tenant, user) as ac:
            for path, params in items:
                with QueryCounter(db) as qc:
                    r = await ac.get(path, params=params)
                assert r.status_code == 200, (path, params, r.text)
                counts[f"{path}?{sorted(params.items())}"] = qc.count
        return counts

    small = await measure(calls)
    for i in range(6):
        cc = CostCenter(tenant_id=t, center_code=f"N{i}{uid()}", name=f"Bulk {i}", department=f"Dept {i}")
        db.add(cc)
        await db.flush()
        for month in range(12):
            year, mon = (2030, 7 + month) if month < 6 else (2031, month - 5)
            db.add(BudgetLine(tenant_id=t, budget_id=w["budget"].id, cost_center_id=cc.id, account_id=L["rent"].id, period_month=f"{year}-{mon:02d}", amount=D("10")))
            await post_v(db, t, date(year, mon, 5), [dr(L["rent"], "10", cc=cc.id), cr(L["cash"], "10")])
    await db.flush()
    big = await measure(calls)
    assert big == small, {k: (small[k], big[k]) for k in small if small[k] != big[k]}
    assert max(big.values()) <= 12, big
    async with api_client(db, tenant, user) as ac:
        grown = await _get(ac, BA, fiscal_year=FY, dimension="cost_center")
    assert grown["totals"]["actual"] == "6220.0000"  # 5500 + 6 cost centres x 12 months x 10
    assert len(grown["rows"]) == 4 + 6

    # controls: the same statements run however many accounts / rows raise exceptions
    t2, u2, w2 = await seed_ctl_world(db)
    ctl = [(f"{API}/expense-controls", {"as_of_date": AS_OF})]
    small_c = await measure_for(db, t2, u2, ctl)
    cash, A = w2["ledgers"]["cash"], w2["cc_a"].id
    for i in range(10):
        acct = await make_ledger(db, t2.id, w2["groups"]["iexp"], f"Bulk acct {i}")
        for month in (7, 8, 9):
            await post_v(db, t2.id, date(2030, month, 15), [dr(acct, "10000", cc=A), cr(cash, "10000")])
        await post_v(db, t2.id, date(2030, 10, 15), [dr(acct, "20000", cc=A), cr(cash, "20000")])
        await post_v(db, t2.id, date(2030, 10, 16), [dr(acct, "55", cc=None), cr(cash, "55")])
        db.add(BudgetLine(tenant_id=t2.id, budget_id=w2["final"].id, cost_center_id=A, account_id=acct.id, period_month="ANNUAL", amount=D("1000")))
    await db.flush()
    big_c = await measure_for(db, t2, u2, ctl)
    assert big_c == small_c, (small_c, big_c)
    assert max(big_c.values()) <= 40, big_c
    async with api_client(db, t2, u2) as ac:
        grown_c = await _get(ac, f"{API}/expense-controls", as_of_date=AS_OF)
    assert _rule(grown_c, "UNUSUAL_INCREASE")["count"] == 11 and _rule(grown_c, "MISSING_COST_CENTRE")["count"] == 11


async def measure_for(db, tenant, user, items) -> dict[str, int]:
    counts: dict[str, int] = {}
    async with api_client(db, tenant, user) as ac:
        for path, params in items:
            with QueryCounter(db) as qc:
                r = await ac.get(path, params=params)
            assert r.status_code == 200, (path, params, r.text)
            counts[path] = qc.count
    return counts
