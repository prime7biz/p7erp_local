"""Management Performance: forecast rules, statuses, budget spread, direct / unmapped split, commitments, targets.

Rules: docs/management-performance/02-plan-audit-resolutions.md.
Run: docker compose exec -T backend sh -c "pytest tests/test_mgmt_performance_forecast.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import DEFAULT_ON_FEATURE_FLAGS, MGMT_PERFORMANCE_V1, is_mgmt_performance_v1_enabled, with_effective_default_flags
from app.modules.finance.mgmt_performance.contribution_service import ContributionResult, counted_quantity
from app.modules.finance.mgmt_performance.expense_forecast_service import (
    compute_forecast,
    distribute,
    evaluate_row,
    month_forecast,
    remaining_fraction,
    row_status,
)
from app.modules.finance.mgmt_performance.periods import parse_period
from app.modules.finance.mgmt_performance.targets_service import MonthTarget, compute_targets
from tests.mfg_alloc_fixtures import add_vendor
from tests.mfg_finance_fixtures import add_item_simple, add_priced_po
from tests.mgmt_performance_fixtures import TODAY, budget, cash_account, cost_center, expense_account, mp_tenant, spend, threshold

D = Decimal


# ------------------------------------------------------------------ pure


@pytest.mark.parametrize("flags", [None, {}, {MGMT_PERFORMANCE_V1: "true"}, {MGMT_PERFORMANCE_V1: 1}, "x"])
def test_flag_is_strict_and_default_off(flags):
    assert is_mgmt_performance_v1_enabled(flags) is False
    assert MGMT_PERFORMANCE_V1 not in DEFAULT_ON_FEATURE_FLAGS
    assert MGMT_PERFORMANCE_V1 not in with_effective_default_flags({})


def test_time_phased_forecast_keeps_a_40_percent_line_ok():
    frac = remaining_fraction(date(2030, 3, 1), date(2030, 3, 16))
    assert frac == D(15) / D(31)
    forecast, src = month_forecast("current", actual=D("400"), budget=D("1000"), committed=D("0"), history_avg=D("0"), fraction_left=frac)
    assert src == "BUDGET_TIME_PHASED"
    assert forecast == (D("400") + D("1000") * frac).quantize(D("0.0001"))
    assert row_status(budget=D("1000"), actual=D("400"), committed=D("0"), forecast=forecast, warning_pct=D("90")) == "OK"


def test_status_order_failed_at_risk_warning_unbudgeted():
    kw = dict(committed=D("0"), warning_pct=D("90"))
    assert row_status(budget=D("100"), actual=D("101"), forecast=D("101"), **kw) == "FAILED"
    assert row_status(budget=D("100"), actual=D("60"), forecast=D("120"), **kw) == "AT_RISK"
    assert row_status(budget=D("100"), actual=D("60"), forecast=D("95"), **kw) == "WARNING"
    assert row_status(budget=D("100"), actual=D("10"), forecast=D("50"), run_rate_value=D("130"), **kw) == "WARNING"
    assert row_status(budget=D("0"), actual=D("5"), forecast=D("5"), **kw) == "UNBUDGETED"
    assert row_status(budget=D("0"), actual=D("0"), forecast=D("40"), **kw) == "OK"


def test_closed_and_future_months():
    assert month_forecast("past", actual=D("7"), budget=D("100"), committed=D("0"), history_avg=D("9"), fraction_left=D("0")) == (D("7"), "ACTUAL_CLOSED_MONTH")
    assert month_forecast("future", actual=D("0"), budget=D("0"), committed=D("20"), history_avg=D("50"), fraction_left=D("0"))[0] == D("50")
    assert month_forecast("future", actual=D("0"), budget=D("10"), committed=D("20"), history_avg=D("0"), fraction_left=D("0"))[0] == D("20")


def test_distribute_adds_up_exactly():
    parts = distribute(D("100"), [D("1"), D("1"), D("1")])
    assert sum(parts) == D("100")
    assert distribute(D("5"), [D("0")]) == []


def test_received_quantity_is_never_counted_twice():
    assert counted_quantity(D("600"), D("0"), D("1000")) == D("600")
    assert counted_quantity(D("600"), D("700"), D("1000")) == D("300")
    assert counted_quantity(D("600"), D("1200"), D("1000")) == D("0")
    assert counted_quantity(D("5"), D("0"), None) == D("0")


def _contribution(value="0", contrib="0", qty="0", pipeline="0", book=None) -> ContributionResult:
    return ContributionResult(
        orders=[], value=D(value), direct_cost=D(value) - D(contrib), contribution=D(contrib), counted_qty=D(qty),
        unknown_orders=0, receipts_without_order_qty=D("0"), receipts_without_order_rows=0, pipeline_contribution=D(pipeline),
        pipeline_value=D("0"), pipeline_orders=0, pipeline_unknown_orders=0,
        order_book_contribution_pct=D(book) if book else None, fg_groups=1, truncated=False, reason_codes=[],
    )


# ------------------------------------------------------------------ integration


async def test_forecast_budget_history_direct_and_unmapped(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await mp_tenant(db)
    cash = await cash_account(db, tenant)
    util = await expense_account(db, tenant, "UTILITIES")
    material = await expense_account(db, tenant, "DIRECT_MATERIAL")
    landed = await expense_account(db, tenant, "DIRECT_LANDED", by_group=False)
    unmapped = await expense_account(db, tenant, None)
    cc = await cost_center(db, tenant)
    await budget(db, tenant, [(cc, util, "2030-03", "1000"), (cc, util, "2030-Q2", "900"), (None, None, "2030-03", "50")])
    await spend(db, tenant, util, cash, date(2030, 3, 5), "400", cc=cc)
    await spend(db, tenant, util, cash, date(2030, 1, 10), "300", cc=cc)  # history (3 closed months: Dec-Feb)
    await spend(db, tenant, util, cash, date(2030, 3, 6), "999", cc=cc, status="DRAFT")  # not in books
    await spend(db, tenant, material, cash, date(2030, 3, 7), "5000")
    await spend(db, tenant, landed, cash, date(2030, 3, 8), "250")
    await spend(db, tenant, unmapped, cash, date(2030, 3, 9), "70")

    result = await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    row = result.rows[(cc.id, "UTILITIES")]
    fig = evaluate_row(result, row)
    assert fig.actual == D("400") and fig.budget == D("1000")
    assert fig.forecast == (D("400") + D("1000") * D(15) / D(31)).quantize(D("0.0001"))
    assert fig.status == "OK"
    assert row.history_avg == D("100.0000")
    assert all(k[1] in ("UTILITIES",) for k in result.rows)  # direct cost is never opex
    assert result.direct_posted["DIRECT_MATERIAL"] == D("5000")
    assert result.direct_posted["DIRECT_LANDED"] == D("250")
    assert result.unmapped_actual[unmapped.id] == D("70")
    assert result.unmapped_budget[(None, None)] == D("50")

    q = await compute_forecast(db, tenant, parse_period("2030-Q2", tenant, today=TODAY))
    q_row = q.rows[(cc.id, "UTILITIES")]
    assert evaluate_row(q, q_row).budget == D("900")  # quarter line spread over 3 months, summed back
    assert sorted(c.budget for c in q_row.months.values()) == [D("300"), D("300"), D("300")]


async def test_threshold_and_failed_status(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await mp_tenant(db)
    cash = await cash_account(db, tenant)
    util = await expense_account(db, tenant, "UTILITIES")
    cc = await cost_center(db, tenant)
    await budget(db, tenant, [(cc, util, "2030-03", "1000")])
    await spend(db, tenant, util, cash, date(2030, 3, 2), "400", cc=cc)
    await threshold(db, tenant, "UTILITIES", "80")
    r = await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    assert evaluate_row(r, r.rows[(cc.id, "UTILITIES")]).status == "WARNING"  # 88.4 % >= 80 %
    await spend(db, tenant, util, cash, date(2030, 3, 3), "700", cc=cc)
    r = await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    assert evaluate_row(r, r.rows[(cc.id, "UTILITIES")]).status == "FAILED"


async def test_order_linked_po_is_never_opex_commitment(db_session_integration):
    from app.models.costing import Item
    from app.models.inventory import StockGroup

    db = db_session_integration
    tenant, _user, _ = await mp_tenant(db)
    overhead = await expense_account(db, tenant, "FACTORY_OVERHEAD", by_group=False)
    grp = StockGroup(tenant_id=tenant.id, group_code="SPARE", name="Spares", purchase_account_id=overhead.id)
    db.add(grp)
    await db.flush()
    vendor = await add_vendor(db, tenant)
    item = await add_item_simple(db, tenant, "SPR")
    (await db.get(Item, item.id)).stock_group_id = grp.id
    await db.flush()
    from tests.mfg_intel_fixtures import add_order
    from tests.merch_fixtures import create_customer, create_garment_style

    customer = await create_customer(db, tenant)
    order = await add_order(db, tenant, customer, await create_garment_style(db, tenant, customer))
    await add_priced_po(db, tenant, vendor, item, qty="10", price="50", currency="BDT", rate="1", expected=date(2030, 3, 20))
    await add_priced_po(db, tenant, vendor, item, qty="99", price="99", currency="BDT", rate="1", order=order, expected=date(2030, 3, 20))
    r = await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    row = r.rows[(None, "FACTORY_OVERHEAD")]
    assert row.total("committed") == D("500")  # only the non-order PO


async def test_company_commitment_is_set_against_the_category_budget(db_session_integration):
    from app.models.costing import Item
    from app.models.inventory import StockGroup

    db = db_session_integration
    tenant, _user, _ = await mp_tenant(db)
    overhead = await expense_account(db, tenant, "FACTORY_OVERHEAD", by_group=False)
    cc = await cost_center(db, tenant)
    await budget(db, tenant, [(cc, overhead, "2030-03", "3100")])  # 1,500 left for the 15 days after today
    grp = StockGroup(tenant_id=tenant.id, group_code="SPR", name="Spares", purchase_account_id=overhead.id)
    db.add(grp)
    await db.flush()
    vendor = await add_vendor(db, tenant)
    item = await add_item_simple(db, tenant, "SP2")
    (await db.get(Item, item.id)).stock_group_id = grp.id
    await db.flush()
    await add_priced_po(db, tenant, vendor, item, qty="10", price="100", currency="BDT", rate="1", expected=date(2030, 3, 20))
    r = await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    company = evaluate_row(r, r.rows[(None, "FACTORY_OVERHEAD")])
    assert company.committed == D("1000") and company.forecast == D("0") and company.status == "OK"
    total = sum(evaluate_row(r, row).forecast for row in r.rows.values())
    assert total == D("1500.0000")  # max(committed 1,000, remaining budget 1,500) - never 2,500
    await add_priced_po(db, tenant, vendor, item, qty="10", price="100", currency="BDT", rate="1", expected=date(2030, 3, 21))
    r = await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    total = sum(evaluate_row(r, row).forecast for row in r.rows.values())
    assert total == D("2000.0000")  # committed 2,000 now exceeds the remaining budget


async def test_incomplete_payroll_projection_never_lowers_the_forecast(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await mp_tenant(db)
    from app.models.hr import Employee

    db.add(Employee(tenant_id=tenant.id, employee_code="NOSAL1", first_name="No structure", is_active=True))
    pay = await expense_account(db, tenant, "PAYROLL")
    cc = await cost_center(db, tenant)
    await budget(db, tenant, [(cc, pay, "2030-03", "3100")])
    r = await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    fig = evaluate_row(r, r.rows[(cc.id, "PAYROLL")])
    assert fig.forecast == D("1500.0000")  # time-phased budget kept; the 0 projection cannot pull it down
    assert "EMPLOYEE_WITHOUT_STRUCTURE" in r.reason_codes


async def _count_forecast_statements(db, tenant) -> int:
    from sqlalchemy import event

    from tests.query_counting import is_rls_housekeeping

    statements: list[str] = []
    conn = db.sync_session.get_bind()

    def _record(_c, _cur, statement, _p, _ctx, _many):
        if not is_rls_housekeeping(statement):
            statements.append(statement)

    event.listen(conn, "before_cursor_execute", _record)
    try:
        await compute_forecast(db, tenant, parse_period("2030-03", tenant, today=TODAY))
    finally:
        event.remove(conn, "before_cursor_execute", _record)
    return len(statements)


async def test_forecast_query_count_does_not_grow_with_cost_centres(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await mp_tenant(db)
    cash = await cash_account(db, tenant)
    util = await expense_account(db, tenant, "UTILITIES")
    cc = await cost_center(db, tenant)
    await budget(db, tenant, [(cc, util, "2030-03", "100")])
    await spend(db, tenant, util, cash, date(2030, 3, 2), "10", cc=cc)
    few = await _count_forecast_statements(db, tenant)
    for _ in range(8):
        more = await cost_center(db, tenant)
        await budget(db, tenant, [(more, util, "2030-03", "100")])
        await spend(db, tenant, util, cash, date(2030, 3, 3), "10", cc=more)
    many = await _count_forecast_statements(db, tenant)
    assert many == few, (few, many)


def test_targets_formulas_and_unknown():
    from types import SimpleNamespace

    period = SimpleNamespace(months=[date(2030, 3, 1)])
    row = SimpleNamespace(months={date(2030, 3, 1): SimpleNamespace(forecast=D("1000"))}, total=lambda a: D("1000") if a == "forecast" else D("0"))
    forecast = SimpleNamespace(period=period, rows={(None, "ADMIN"): row}, direct_posted={"DIRECT_LANDED": D("100"), "DIRECT_SELLING": D("0")})
    targets = {date(2030, 3, 1): MonthTarget(D("500"), D("10"), True)}
    t = compute_targets(forecast, _contribution(value="2000", contrib="500", qty="100", pipeline="300"), targets)
    # required = 1000 + 100 (10 %) + 500 + 100 - 500 = 1200 ; expected % = 25
    assert t["required_contribution"] == D("1200")
    assert t["expected_contribution_pct"] == D("25.0000")
    assert t["break_even_value"] == D("4400.0000")  # (1000 + 100) / 25 %
    assert t["remaining_production_value"] == D("4800.0000")
    assert t["remaining_production_pieces"] == D("240.0000")  # 1200 / 5 per piece
    assert t["marketing_gap_value"] == D("3600.0000")  # (1200 - 300) / 25 %
    assert t["gap_status"] == "GAP"
    unknown = compute_targets(forecast, _contribution(), targets)
    assert unknown["expected_contribution_pct"] is None and unknown["break_even_value"] is None
    assert "CONTRIBUTION_PCT_UNKNOWN" in unknown["reason_codes"]
    book = compute_targets(forecast, _contribution(book="20"), targets)
    assert book["expected_contribution_pct_source"] == "CONFIRMED_ORDER_BOOK"
