"""Manufacturing Intelligence Phase 3: order cost at completion (doc 14 sections 12-14).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_cost_at_completion.py -q -p no:warnings"
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import event

from app.models import Bom, BomItem, HourlyProductionEntry, ProformaInvoice, ProformaInvoiceOrder
from app.modules.mfg_intelligence.cost_at_completion_service import margin_pct, material_eac, progress_ratio
from app.modules.mfg_intelligence.revenue_resolver import (
    OrderMoneyContext,
    QuotationInfo,
    resolve_budget,
    resolve_revenue,
)
from tests.mfg_alloc_fixtures import add_grn_line, add_warehouse
from tests.mfg_finance_fixtures import (
    add_account,
    add_closed_periods,
    add_item_simple,
    add_priced_po,
    add_quotation,
    add_quoted_order,
    add_vendor,
    add_voucher,
    p3_tenant,
    set_planning_config,
)
from tests.mfg_intel_fixtures import API, MONDAY, add_plan, client_for
from tests.query_counting import is_rls_housekeeping

D = Decimal


# ------------------------------------------------------------------ pure formulas


def test_material_eac_never_negative_and_unknown_budget():
    assert material_eac(D("100"), D("250")) == (D("150.0000"), D("250.0000"))
    assert material_eac(D("300"), D("250")) == (D("0.0000"), D("300.0000"))  # over-procured: remaining 0
    assert material_eac(D("80"), None) == (None, D("80.0000"))


def test_progress_caps_at_one_and_unknown():
    assert progress_ratio(D("1200"), D("1000")) == D("1")
    assert progress_ratio(D("250"), D("1000")) == D("0.25")
    assert progress_ratio(None, D("1000")) is None
    assert progress_ratio(D("5"), D("0")) is None


def test_margin_pct_zero_revenue_is_null():
    assert margin_pct(D("10"), D("0")) is None
    assert margin_pct(D("25"), D("100")) == D("25.0000")
    assert margin_pct(None, D("100")) is None


def _order(**kw):
    base = dict(id=1, quantity=500, quotation_id=7, commercial_snapshot_json=None, customer_intermediary_id=None,
                commission_type=None, commission_value=None)
    base.update(kw)
    return SimpleNamespace(**base)


def _ctx(**kw) -> OrderMoneyContext:
    q = QuotationInfo(id=7, currency="USD", exchange_rate=D("110"), total_amount=D("10000"), material_cost=D("6000"),
                      manufacturing_cost=D("2000"), other_cost=D("500"), projected_quantity=1000)
    ctx = OrderMoneyContext(base="BDT", quotations={7: q})
    for k, v in kw.items():
        setattr(ctx, k, v)
    return ctx


def test_revenue_chain_snapshot_then_single_pi_then_quotation():
    # 1. snapshot unit price x qty
    rev = resolve_revenue(_order(commercial_snapshot_json={"quoted_price": "12.5", "currency": "USD"}), _ctx())
    assert (rev.source, rev.gross_source, rev.gross_base) == ("SNAPSHOT_QUOTED", D("6250.0000"), D("687500.0000"))
    # 2. PI linking only this order
    ctx = _ctx(pis_by_order={1: [(55, D("7000"), "USD")]}, pi_order_count={55: 1})
    rev = resolve_revenue(_order(), ctx)
    assert (rev.source, rev.gross_base) == ("PI_SINGLE_ORDER", D("770000.0000"))
    # multi-order PI is skipped -> quotation total x order qty / projected qty
    ctx = _ctx(pis_by_order={1: [(56, D("9000"), "USD")]}, pi_order_count={56: 2})
    rev = resolve_revenue(_order(), ctx)
    assert rev.source == "QUOTATION_TOTAL_SCALED" and "PI_MULTI_ORDER" in rev.reason_codes
    assert rev.gross_source == D("5000.0000") and rev.gross_base == D("550000.0000")
    # quotation-only order, never quoted_price as a unit price
    rev = resolve_revenue(_order(commercial_snapshot_json={"currency": "USD"}), _ctx())
    assert rev.source == "QUOTATION_TOTAL_SCALED" and "REVENUE_FROM_QUOTATION" in rev.reason_codes


def test_revenue_fx_unknown_and_commission_deduction():
    rev = resolve_revenue(_order(commercial_snapshot_json={"quoted_price": "10", "currency": "EUR"}), _ctx())
    assert rev.gross_base is None and "REVENUE_FX_UNKNOWN" in rev.reason_codes
    assert "exchange_rate:EUR" in rev.missing_inputs
    # payable commission only with a customer intermediary (commission module semantics)
    rev = resolve_revenue(_order(customer_intermediary_id=9, commission_type="PERCENTAGE", commission_value=5), _ctx())
    assert rev.commission_base == D("27500.0000") and rev.net_base == D("522500.0000")
    rev = resolve_revenue(_order(customer_intermediary_id=9, commission_type="FIXED", commission_value="0.2"), _ctx())
    assert rev.commission_source == D("100.0000") and rev.commission_base == D("11000.0000")
    rev = resolve_revenue(_order(commission_type="PERCENTAGE", commission_value=5), _ctx())
    assert rev.commission_base == D("0.0000")  # no agent: receivable terms, not a deduction


def test_budget_scaling_and_fx_unknown():
    b = resolve_budget(_order(), _ctx())
    assert b.usable and "BUDGET_SCALED" in b.reason_codes
    assert b.unscaled == {"revenue": D("1100000.0000"), "material": D("660000.0000"), "cm": D("220000.0000"), "other": D("55000.0000")}
    assert b.scaled["cm"] == D("110000.0000") and b.scaled["material"] == D("330000.0000")
    ctx = _ctx()
    ctx.quotations[7].exchange_rate = None
    b = resolve_budget(_order(), ctx)
    assert not b.usable and b.reason_codes == ["BUDGET_FX_UNKNOWN"]


# ------------------------------------------------------------------ integration


async def _seed(db, *, qty=500, cpm: str | None = "5", **qkw):
    tenant, user, _role, fx = await p3_tenant(db)
    q = await add_quotation(db, tenant, fx.customer, **qkw)
    order = await add_quoted_order(db, tenant, fx, q, qty=qty, delivery=date(2030, 4, 30))
    await add_plan(db, tenant, fx.line, start=MONDAY, qty=str(qty), order=order, style=fx.style, ob=fx.ob)
    if cpm is not None:
        await set_planning_config(db, tenant, cpm_override=cpm)
    vendor = await add_vendor(db, tenant)
    item = await add_item_simple(db, tenant)
    return SimpleNamespace(tenant=tenant, user=user, fx=fx, q=q, order=order, vendor=vendor, item=item)


def _amt(v) -> Decimal | None:
    return Decimal(v["amount"]) if v["amount"] is not None else None


async def test_eac_reconciles_exactly_and_margin_uses_net_revenue(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    await add_priced_po(db, s.tenant, s.vendor, s.item, qty="100", price="10", order=s.order)  # 1000 USD x 110
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        r = await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")
    assert r.status_code == 200, r.text
    body = r.json()
    m = body["material"]
    procured, remaining, conv, other = _amt(m["procured"]), _amt(m["remaining"]), _amt(body["conversion"]["eac"]), _amt(body["other"])
    assert procured == D("110000.0000") and m["procured"]["value_class"] == "COMMITTED"
    assert _amt(m["budget"]) == D("330000.0000") and remaining == D("220000.0000")
    # conversion = qty 500 x SMV 12.5 x CPM 5 (override)
    assert body["conversion"]["sah_minutes"] == "6250.0000" and body["conversion"]["cpm_source"] == "CPM_OVERRIDE"
    assert conv == D("31250.0000") and other == D("27500.0000")
    eac = _amt(body["eac"])
    assert eac == procured + remaining + conv + other
    assert eac == _amt(m["eac"]) + conv + other
    net = _amt(body["revenue"]["net"])
    assert net == D("550000.0000")
    assert Decimal(body["margin"]["amount"]) == net - eac
    assert body["margin"]["basis"] == "NET_REVENUE"
    assert body["conversion"]["variance_vs_budget_cm"] == format(D("110000") - conv, ".4f")
    assert body["gl_actual"]["value_class"] == "ACTUAL"


async def test_no_order_cost_posting_full_progress_uses_scaled_budget_cm(db_session_integration):
    db = db_session_integration
    s = await _seed(db, cpm=None)  # no override, no locked periods -> CPM unknown
    db.add(HourlyProductionEntry(tenant_id=s.tenant.id, department_type="sewing", order_id=s.order.id,
                                 production_date=MONDAY, hour_slot=1, good_qty=D("500")))
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    assert body["progress"]["p"] == "1.0000" and body["progress"]["source"] == "HOURLY_SEWING_GOOD_QTY"
    conv = body["conversion"]["eac"]
    assert conv["amount"] == "110000.0000" and conv["source"] == "QUOTATION_CM_SCALED"
    assert {"NO_ORDER_COST_POSTING", "CPM_UNKNOWN"} <= set(conv["reason_codes"])
    assert body["status"] == "PARTIAL"
    assert body["progress"]["remaining_conversion"] == "0.0000"


async def test_procured_and_gl_actual_are_never_added(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    await add_priced_po(db, s.tenant, s.vendor, s.item, qty="10", price="10", order=s.order)
    purchases = await add_account(db, s.tenant, statement_class="PURCHASE_ACCOUNTS")
    cash = await add_account(db, s.tenant, statement_class="BANK_ACCOUNTS", nature="Asset")
    await add_voucher(db, s.tenant, date(2030, 3, 5), [(purchases, "DEBIT", "999999"), (cash, "CREDIT", "999999")], order_id=s.order.id)
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        one = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
        lst = (await c.get(f"{API}/cost-at-completion")).json()
    from app.modules.finance.control.profitability_service import build_entity_profit

    profit = await build_entity_profit(db, s.tenant, kind="order", entity_id=s.order.id, from_date=None, to_date=None)
    assert one["gl_actual"]["material"] == format(profit.actual.material, ".4f") == "999999.0000"
    assert "GL_MATERIAL_EXCEEDS_PROCURED" in one["gl_actual"]["reason_codes"]
    row = next(i for i in lst["items"] if i["order_id"] == s.order.id)
    assert row["gl_actual"] is None
    assert one["eac"] == row["eac"]  # GL never changes the estimate
    assert one["material"]["procured"]["amount"] == "11000.0000"


async def test_budget_contract_equals_finance_order_budget(db_session_integration):
    db = db_session_integration
    s = await _seed(db, total="12345.6789", material="7000.1234", cm="2100.5", other="333.3333", rate="117.123456")
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    from app.modules.finance.control.profitability_service import build_entity_profit

    fin = (await build_entity_profit(db, s.tenant, kind="order", entity_id=s.order.id, from_date=None, to_date=None)).budget
    unscaled = body["budget"]["unscaled"]
    assert unscaled == {
        "revenue": format(fin.revenue, ".4f"), "material": format(fin.material, ".4f"),
        "cm": format(fin.cm, ".4f"), "other": format(fin.other, ".4f"),
    }
    assert body["budget"]["scale_factor"] == "0.5000" and "BUDGET_SCALED" in body["budget"]["reason_codes"]


async def test_progress_uses_sewing_department_only(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    for dept, good in (("cutting", "500"), ("sewing", "200"), ("finishing", "150")):
        db.add(HourlyProductionEntry(tenant_id=s.tenant.id, department_type=dept, order_id=s.order.id,
                                     production_date=MONDAY, hour_slot=1, good_qty=D(good)))
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    assert body["progress"]["p"] == "0.4000" and body["progress"]["sewing_good_qty"] == "200.000"
    assert body["progress"]["produced_qty"] == "200.000"  # the produced value behind p
    assert body["progress"]["plan_completed_qty"] == "0.000"  # Phase 1 plan completed qty side by side


async def test_bom_budget_scaling_and_fx_fallback(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    bom = Bom(tenant_id=s.tenant.id, style_id=s.fx.style.id, order_id=s.order.id, status="APPROVED", is_active=True,
              version_no=1, currency_snapshot="USD", order_qty_at_approval=250)
    db.add(bom)
    await db.flush()
    db.add_all([
        BomItem(tenant_id=s.tenant.id, bom_id=bom.id, item_id=s.item.id, category="FABRIC", base_consumption=D("1"),
                bom_expected_total_cost=D("2000")),
        BomItem(tenant_id=s.tenant.id, bom_id=bom.id, item_id=s.item.id, category="TRIM", base_consumption=D("1"),
                quoted_total_cost=D("1000")),
    ])
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    mat = body["material"]["budget"]
    assert mat["source"] == "ORDER_BOM_SCALED" and mat["amount"] == "660000.0000"  # 3000 x 500/250 x 110
    bom.currency_snapshot = "EUR"
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    mat = body["material"]["budget"]
    assert mat["source"] == "QUOTATION_MATERIAL_SCALED" and "BOM_FX_UNKNOWN" in mat["reason_codes"]


async def test_po_status_allowlist_and_foreign_po_without_rate(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    wh = await add_warehouse(db, s.tenant)
    for st in ("APPROVED", "PARTIALLY_RECEIVED", "FULLY_RECEIVED"):  # ordered qty basis: 10 x 1 BDT each
        await add_priced_po(db, s.tenant, s.vendor, s.item, qty="10", price="1", status=st, currency="BDT", rate=None, order=s.order)
    for st in ("DRAFT", "SUBMITTED", "CANCELLED"):
        await add_priced_po(db, s.tenant, s.vendor, s.item, qty="999", price="1", status=st, currency="BDT", rate=None, order=s.order)
    closed, cline = await add_priced_po(db, s.tenant, s.vendor, s.item, qty="100", price="2", status="CLOSED",
                                        currency="BDT", rate=None, line_order=s.order)
    await add_grn_line(db, s.tenant, closed, cline, wh, received="50", accepted="40")
    await add_priced_po(db, s.tenant, s.vendor, s.item, qty="5", price="3", currency="EUR", rate=None, order=s.order)
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    m = body["material"]
    assert m["procured"]["amount"] == "110.0000"  # 3 x 10 + CLOSED accepted 40 x 2
    assert m["po_lines"] == 5 and m["po_lines_unknown_fx"] == 1
    assert body["unknown_by_currency"] == {"EUR": "15.0000"}
    assert "PO_FX_UNKNOWN" in m["procured"]["reason_codes"]
    assert body["status"] == "PARTIAL"


async def test_revenue_chain_multi_order_pi_skipped_and_single_pi_used(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    other = await add_quoted_order(db, s.tenant, s.fx, None, qty=100)
    pi = ProformaInvoice(tenant_id=s.tenant.id, reference="PI-MULTI", status="ISSUED", amount=D("9999"), currency="USD")
    db.add(pi)
    await db.flush()
    db.add_all([ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=s.order.id),
                ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=other.id)])
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    gross = body["revenue"]["gross"]
    assert gross["source"] == "QUOTATION_TOTAL_SCALED" and "PI_MULTI_ORDER" in gross["reason_codes"]
    single = ProformaInvoice(tenant_id=s.tenant.id, reference="PI-ONE", status="ISSUED", amount=D("6000"), currency="USD")
    db.add(single)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=single.id, order_id=s.order.id))
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    assert body["revenue"]["gross"]["source"] == "PI_SINGLE_ORDER"
    assert body["revenue"]["gross"]["amount"] == "660000.0000"


async def test_cpm_from_locked_periods_and_uncoded_direct_expense_warning(db_session_integration):
    db = db_session_integration
    s = await _seed(db, cpm=None)
    await add_closed_periods(db, s.tenant, [(date(2026, 8, 1), date(2026, 8, 31)), (date(2026, 9, 1), date(2026, 9, 30)),
                                            (date(2026, 10, 1), date(2026, 10, 31))])
    cm = await add_account(db, s.tenant, statement_class="DIRECT_EXPENSES", cost_nature="CM")
    uncoded = await add_account(db, s.tenant, statement_class="DIRECT_EXPENSES")
    bank = await add_account(db, s.tenant, statement_class="BANK_ACCOUNTS", nature="Asset")
    await add_voucher(db, s.tenant, date(2026, 9, 15), [(cm, "DEBIT", "9000"), (uncoded, "DEBIT", "40"), (bank, "CREDIT", "9040")])
    db.add(HourlyProductionEntry(tenant_id=s.tenant.id, department_type="sewing", order_id=s.order.id,
                                 production_date=date(2026, 9, 10), hour_slot=1, good_qty=D("120")))
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    cpm = body["cpm_detail"]
    assert cpm["value"] == "6.0000" and cpm["earned_minutes"] == "1500.0000" and cpm["cm_total"] == "9000.0000"
    assert any(w["code"] == "CPM_UNCODED_DIRECT_EXPENSES" for w in cpm["warnings"])
    assert body["conversion"]["eac"]["amount"] == "37500.0000"  # 6250 SAH x 6
    # one period not locked -> CPM unknown, conversion falls back to the scaled budget CM
    from sqlalchemy import update

    from app.models.finance import AccountingPeriod

    await db.execute(update(AccountingPeriod).where(AccountingPeriod.tenant_id == s.tenant.id, AccountingPeriod.start_date == date(2026, 10, 1)).values(is_closed=False))
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/orders/{s.order.id}/cost-at-completion")).json()
    assert body["cpm_detail"]["value"] is None and "CPM_PERIOD_NOT_LOCKED" in body["cpm_detail"]["reason_codes"]
    assert body["conversion"]["eac"]["source"] == "QUOTATION_CM_SCALED"


async def test_cross_tenant_order_is_404(db_session_integration):
    db = db_session_integration
    a = await _seed(db)
    b = await _seed(db)
    await db.commit()
    async with client_for(db, a.tenant, a.user) as c:
        r = await c.get(f"{API}/orders/{b.order.id}/cost-at-completion")
        assert r.status_code == 404
        lst = (await c.get(f"{API}/cost-at-completion")).json()
    assert {i["order_id"] for i in lst["items"]} == {a.order.id}


async def test_list_filters_confirmed_and_is_bounded(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    await add_quoted_order(db, s.tenant, s.fx, None, qty=10, status="DRAFT")
    await add_quoted_order(db, s.tenant, s.fx, None, qty=10, status="NEW")
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        body = (await c.get(f"{API}/cost-at-completion")).json()
        assert body["total"] == 2
        assert (await c.get(f"{API}/cost-at-completion", params={"status": "NEW"})).json()["total"] == 1
        assert (await c.get(f"{API}/cost-at-completion", params={"limit": 201})).status_code == 422
        assert (await c.get(f"{API}/cost-at-completion", params={"status": "DRAFT"})).status_code == 422
    unknown = [i for i in body["items"] if i["status"] == "UNKNOWN"]
    assert body["totals"]["orders_excluded"] == len(unknown)


async def _count_list_statements(db, tenant, user) -> int:
    statements: list[str] = []
    conn = db.sync_session.get_bind()

    def _record(_c, _cur, statement, _p, _ctx, _many):
        if not is_rls_housekeeping(statement):
            statements.append(statement)

    event.listen(conn, "before_cursor_execute", _record)
    try:
        async with client_for(db, tenant, user) as c:
            r = await c.get(f"{API}/cost-at-completion", params={"limit": 200})
            assert r.status_code == 200, r.text
    finally:
        event.remove(conn, "before_cursor_execute", _record)
    return len(statements)


async def test_list_query_count_does_not_grow_with_orders(db_session_integration):
    db = db_session_integration
    s = await _seed(db, cpm=None)
    await db.commit()
    few = await _count_list_statements(db, s.tenant, s.user)
    for i in range(6):
        q = await add_quotation(db, s.tenant, s.fx.customer)
        o = await add_quoted_order(db, s.tenant, s.fx, q, qty=100 + i)
        await add_plan(db, s.tenant, s.fx.line, start=MONDAY, qty="100", order=o, style=s.fx.style, ob=s.fx.ob)
        await add_priced_po(db, s.tenant, s.vendor, s.item, qty="1", price="1", order=o)
    await db.commit()
    many = await _count_list_statements(db, s.tenant, s.user)
    assert many == few, (few, many)
