"""Manufacturing Intelligence Phase 3: weekly cash requirement (doc 14 sections 12-14).

Run: docker compose exec -T backend sh -c "pytest tests/test_mfg_cash_requirement.py -q -p no:warnings"
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

import pytest
from sqlalchemy import event

from app.models import Employee, ProformaInvoice, ProformaInvoiceOrder
from app.models.commercial import (
    BtbLc,
    BtbLcAccounting,
    CommercialInvoice,
    CommercialInvoiceLine,
    CommercialInvoiceReceiptAllocation,
    ProformaReceiptAllocation,
)
from app.models.facility import Facility, FacilityUtilization, RepaymentScheduleLine
from app.models.finance import OutstandingBill, Voucher, VendorBill
from app.models.hr_payroll import PayrollCalculationSnapshot, PayrollPeriod, PayrollRun, PayrollRunLine
from app.models.party_ledger import PartyLedger, PartyLedgerBill
from app.modules.mfg_intelligence.calendar_helpers import CalendarContext
from app.modules.mfg_intelligence.cash_requirement_service import (
    CashRow,
    assign_weeks,
    build_weeks,
    nth_working_day_after,
    parse_markers,
    remaining_order_inflow,
    statutory_from_trace,
)
from tests.mfg_alloc_fixtures import add_grn_line, add_warehouse
from tests.mfg_finance_fixtures import (
    add_account,
    add_item_simple,
    add_priced_po,
    add_quoted_order,
    add_vendor,
    p3_tenant,
)
from tests.mfg_intel_fixtures import API, client_for
from tests.query_counting import is_rls_housekeeping

D = Decimal
START = date(2030, 3, 4)  # Monday
PARAMS = {"date_from": START.isoformat(), "horizon_days": 28}
PURCHASE_CATEGORIES = ("AP_BILL", "VENDOR_BILL", "GRN_NOT_BILLED", "PO_UNRECEIVED", "BTB_MATURITY", "FACILITY_REPAYMENT")


# ------------------------------------------------------------------ pure


def test_parse_markers_from_finance_ap_notes():
    assert parse_markers("x | PO:PO-1 | GRN_COUNT:0") == ({"PO-1"}, set())
    assert parse_markers("PO:PO-1 | GRN:GRN-9") == ({"PO-1"}, {"GRN-9"})
    assert parse_markers(None) == (set(), set())


def _row(direction, amount, due, category="X"):
    return CashRow(direction, category, "t", 1, None, due, "R", "SCHEDULED", "BDT", D(amount), D("1"), "BASE",
                   D(amount) if amount is not None else None)


def test_weekly_totals_equal_rows_and_balances_roll_forward():
    rows = [
        _row("OUT", "100", START - timedelta(days=3)),  # overdue -> week 1
        _row("IN", "40", START + timedelta(days=2)),
        _row("OUT", "25", START + timedelta(days=8)),
        _row("IN", "500", START + timedelta(days=40)),  # beyond 28 days
        _row("OUT", "7", None),  # undated
    ]
    kept, beyond = assign_weeks(rows, START, START + timedelta(days=27))
    assert beyond == 1 and kept[0].overdue and kept[0].week_index == 0 and "OVERDUE" in kept[0].reason_codes
    weeks = build_weeks(kept, START, START + timedelta(days=27), D("50"))
    assert len(weeks) == 4
    assert weeks[0]["outflow"] == "100.0000" and weeks[0]["inflow"] == "40.0000" and weeks[0]["closing"] == "-10.0000"
    assert weeks[1]["outflow"] == "25.0000"
    for w in weeks:
        assert D(w["opening"]) + D(w["net"]) == D(w["closing"])
        assert D(w["inflow"]) - D(w["outflow"]) == D(w["net"])
    assert sum(D(w["outflow"]) for w in weeks) == D("125")  # undated row not in any week


def test_remaining_order_inflow_clamps_at_zero():
    assert remaining_order_inflow(D("10000"), D("3000"), D("2000")) == D("5000.0000")
    assert remaining_order_inflow(D("10000"), D("3000"), D("9000")) == D("0.0000")


def test_statutory_from_trace_sums_cash_components_only():
    trace = {"statutory": {"pf": {"employee_pf": "100", "employer_pf": "100"}, "esi": {"employee_esi": "5"},
                           "pt_amount": "10", "bd_tds": {"monthly_tds": "50"}}, "deductions": {"loan": "999"}}
    assert statutory_from_trace(trace) == D("265")
    assert statutory_from_trace(None) == D("0")


def test_seventh_working_day_after_month_end():
    cal = CalendarContext(weekend_days=["friday"], overrides={date(2030, 4, 1): "holiday"})
    # 2030-03-31 is a Sunday; Apr 1 holiday; Fri Apr 5 weekend -> 2,3,4,6,7,8,9
    assert nth_working_day_after(date(2030, 3, 31), 7, cal) == date(2030, 4, 9)


# ------------------------------------------------------------------ integration helpers


async def _get(db, tenant, user, params=None, today: date = START):
    """GET the cash requirement with the tenant's "today" pinned (default: the window start, so rows due before it
    are OVERDUE)."""
    with patch("app.modules.mfg_intelligence.finance_router.today_local", lambda _t: today):
        async with client_for(db, tenant, user) as c:
            r = await c.get(f"{API}/cash-requirement", params=params or PARAMS)
    assert r.status_code == 200, r.text
    return r.json()


def _rows(body, *categories):
    return [r for r in body["rows"] if r["category"] in categories]


def _sum(rows) -> Decimal:
    return sum((D(r["amount"]) for r in rows if r["amount"] is not None), D("0"))


async def _purchase(db, *, flags_extra: dict | None = None):
    tenant, user, _role, fx = await p3_tenant(db)
    if flags_extra:
        tenant.feature_flags = {**tenant.feature_flags, **flags_extra}
    vendor = await add_vendor(db, tenant)
    vendor.payment_terms_days = 10
    vendor.vendor_type = "local"
    item = await add_item_simple(db, tenant)
    wh = await add_warehouse(db, tenant)
    po, line = await add_priced_po(db, tenant, vendor, item, qty="100", price="10", currency="BDT", rate=None,
                                   expected=START + timedelta(days=3))
    await db.flush()
    return SimpleNamespace(tenant=tenant, user=user, fx=fx, vendor=vendor, item=item, wh=wh, po=po, line=line)


# ------------------------------------------------------------------ one purchase counted once


@pytest.mark.parametrize("source", ["outstanding_bills", "party_ledger"])
async def test_one_purchase_counted_once_from_po_to_payment(db_session_integration, source):
    db = db_session_integration
    s = await _purchase(db, flags_extra={"finance_ar_ap_due_source": source})
    await db.commit()
    # stage 1: open PO only
    body = await _get(db, s.tenant, s.user)
    rows = _rows(body, *PURCHASE_CATEGORIES)
    assert [r["category"] for r in rows] == ["PO_UNRECEIVED"] and _sum(rows) == D("1000")
    assert rows[0]["due_date"] == (START + timedelta(days=13)).isoformat()  # expected + 10 vendor days
    # stage 2: fully received -> GRN not billed
    grn_item = await add_grn_line(db, s.tenant, s.po, s.line, s.wh, received="100", accepted="100")
    s.po.status = "PARTIALLY_RECEIVED"
    await db.commit()
    rows = _rows(await _get(db, s.tenant, s.user), *PURCHASE_CATEGORIES)
    assert [r["category"] for r in rows] == ["GRN_NOT_BILLED"] and _sum(rows) == D("1000")
    # stage 3: billed
    from app.models.inventory import GoodsReceiving

    grn = await db.get(GoodsReceiving, grn_item.goods_receiving_id)
    if source == "outstanding_bills":
        bill = OutstandingBill(tenant_id=s.tenant.id, bill_no=f"AP-{uuid.uuid4().hex[:6]}", party_name="V", bill_type="PAYABLE",
                               bill_date=START, due_date=START + timedelta(days=20), amount=D("1000"), paid_amount=D("0"),
                               currency="BDT", status="OPEN", notes=f"PO:{s.po.po_code} | GRN:{grn.grn_code}")
        db.add(bill)
    else:
        vb = VendorBill(tenant_id=s.tenant.id, bill_code=f"VB-{uuid.uuid4().hex[:6]}", vendor_id=s.vendor.id, status="POSTED",
                        goods_receiving_id=grn.id, purchase_order_id=s.po.id, total_amount=D("1000"), currency="BDT",
                        due_date=START + timedelta(days=20))
        db.add(vb)
        await db.flush()
        ledger_acct = await add_account(db, s.tenant, statement_class="SUNDRY_CREDITORS", nature="Liability", normal="credit")
        pl = PartyLedger(tenant_id=s.tenant.id, party_type="VENDOR", vendor_id=s.vendor.id, ledger_account_id=ledger_acct.id)
        db.add(pl)
        await db.flush()
        bill = PartyLedgerBill(tenant_id=s.tenant.id, party_ledger_id=pl.id, bill_number=f"PLB-{uuid.uuid4().hex[:6]}",
                               bill_date=START, bill_type="PURCHASE", vendor_bill_id=vb.id, original_amount=D("1000"),
                               amount_type="CR", pending_amount=D("1000"), status="PENDING", due_date=START + timedelta(days=20))
        db.add(bill)
    await db.commit()
    rows = _rows(await _get(db, s.tenant, s.user), *PURCHASE_CATEGORIES)
    assert [r["category"] for r in rows] == ["AP_BILL"] and _sum(rows) == D("1000"), rows
    # stage 4: paid
    if source == "outstanding_bills":
        bill.paid_amount, bill.status = D("1000"), "PAID"
    else:
        bill.pending_amount, bill.settled_amount, bill.status = D("0"), D("1000"), "SETTLED"
    await db.commit()
    rows = _rows(await _get(db, s.tenant, s.user), *PURCHASE_CATEGORIES)
    assert rows == []


async def test_posted_vendor_bill_without_ap_bill_counts_once_payment_unknown(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    grn_item = await add_grn_line(db, s.tenant, s.po, s.line, s.wh, received="100", accepted="100")
    s.po.status = "PARTIALLY_RECEIVED"
    from app.models.inventory import GoodsReceiving

    grn = await db.get(GoodsReceiving, grn_item.goods_receiving_id)
    db.add(VendorBill(tenant_id=s.tenant.id, bill_code="VB-X1", vendor_id=s.vendor.id, status="POSTED",
                      goods_receiving_id=grn.id, purchase_order_id=s.po.id, total_amount=D("1000"), currency="BDT",
                      due_date=START + timedelta(days=5)))
    await db.commit()
    rows = _rows(await _get(db, s.tenant, s.user), *PURCHASE_CATEGORIES)
    assert [r["category"] for r in rows] == ["VENDOR_BILL"]
    assert "PAYMENT_STATUS_UNKNOWN" in rows[0]["reason_codes"]


async def test_stale_vendor_bill_of_unknown_payment_is_listed_not_counted(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    grn_item = await add_grn_line(db, s.tenant, s.po, s.line, s.wh, received="100", accepted="100")
    s.po.status = "PARTIALLY_RECEIVED"
    from app.models.inventory import GoodsReceiving

    grn = await db.get(GoodsReceiving, grn_item.goods_receiving_id)
    db.add(VendorBill(tenant_id=s.tenant.id, bill_code="VB-OLD", vendor_id=s.vendor.id, status="POSTED",
                      goods_receiving_id=grn.id, purchase_order_id=s.po.id, total_amount=D("1000"), currency="BDT",
                      due_date=START - timedelta(days=120)))
    await db.commit()
    body = await _get(db, s.tenant, s.user)
    # billed, so neither GRN-not-billed nor PO counts it; too old to be cash due now
    assert _rows(body, *PURCHASE_CATEGORIES) == []
    assert any(n.startswith("STALE_PAYABLES: 1 ") for n in body["notes"])


# ------------------------------------------------------------------ BTB and facility dedupe


async def test_btb_funded_po_is_paid_only_through_btb(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    btb = BtbLc(tenant_id=s.tenant.id, reference="BTB-1", status="OPEN", lc_date=START - timedelta(days=30),
                amount=10.0, currency="USD", exchange_rate_to_base=110, purchase_order_id=s.po.id)
    db.add(btb)
    await db.commit()
    body = await _get(db, s.tenant, s.user, {"date_from": START.isoformat(), "horizon_days": 180})
    rows = _rows(body, *PURCHASE_CATEGORIES)
    assert [r["category"] for r in rows] == ["BTB_MATURITY"]
    r = rows[0]
    assert r["amount"] == "1100.0000" and r["confidence"] == "ESTIMATED" and "BTB_DATE_ESTIMATED" in r["reason_codes"]
    assert r["due_date"] == (START + timedelta(days=3 + 120)).isoformat()  # PO expected date + btb_usance_days
    # accepted documents with a maturity date -> contractual date
    db.add(BtbLcAccounting(tenant_id=s.tenant.id, btb_lc_id=btb.id, maturity_date=START + timedelta(days=60), status="DOCUMENTS_ACCEPTED"))
    await db.commit()
    r = _rows(await _get(db, s.tenant, s.user, {"date_from": START.isoformat(), "horizon_days": 180}), "BTB_MATURITY")[0]
    assert r["confidence"] == "CONTRACTUAL" and r["due_date"] == (START + timedelta(days=60)).isoformat()


async def test_draft_btb_does_not_take_over_its_po(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    db.add(BtbLc(tenant_id=s.tenant.id, reference="BTB-D", status="DRAFT", amount=10.0, currency="USD",
                 exchange_rate_to_base=110, purchase_order_id=s.po.id))
    await db.commit()
    rows = _rows(await _get(db, s.tenant, s.user), *PURCHASE_CATEGORIES)
    assert [r["category"] for r in rows] == ["PO_UNRECEIVED"]


async def test_facility_funded_btb_is_paid_only_through_facility_and_overdue_in_week_1(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    btb = BtbLc(tenant_id=s.tenant.id, reference="BTB-F", status="OPEN", maturity_date=START + timedelta(days=10),
                amount=10.0, currency="USD", exchange_rate_to_base=110, purchase_order_id=s.po.id)
    db.add(btb)
    await db.flush()
    fac = Facility(tenant_id=s.tenant.id, facility_code="F-1", facility_type="btb_lc_facility", status="active",
                   sanctioned_amount=5000, utilized_amount=1100, currency="BDT")
    db.add(fac)
    await db.flush()
    util = FacilityUtilization(tenant_id=s.tenant.id, facility_id=fac.id, utilization_code="U-1", status="active",
                               currency="BDT", linked_btb_lc_id=btb.id)
    db.add(util)
    await db.flush()
    db.add_all([
        RepaymentScheduleLine(tenant_id=s.tenant.id, facility_utilization_id=util.id, installment_number=1,
                              due_date=START - timedelta(days=5), emi_amount=600, status="overdue"),
        RepaymentScheduleLine(tenant_id=s.tenant.id, facility_utilization_id=util.id, installment_number=2,
                              due_date=START + timedelta(days=9), emi_amount=600, paid_amount=100, status="partially_paid"),
        RepaymentScheduleLine(tenant_id=s.tenant.id, facility_utilization_id=util.id, installment_number=3,
                              due_date=START + timedelta(days=12), emi_amount=600, status="paid"),
    ])
    await db.commit()
    body = await _get(db, s.tenant, s.user)
    rows = _rows(body, *PURCHASE_CATEGORIES)
    assert sorted(r["category"] for r in rows) == ["FACILITY_REPAYMENT", "FACILITY_REPAYMENT"]
    overdue = next(r for r in rows if r["overdue"])
    assert overdue["week_index"] == 0 and "OVERDUE" in overdue["reason_codes"] and overdue["amount"] == "600.0000"
    assert next(r for r in rows if not r["overdue"])["amount"] == "500.0000"
    assert body["facility_headroom"]["amount"] == "3900.0000"
    assert "OVERDUE_IN_WEEK_1" in body["reason_codes"]


# ------------------------------------------------------------------ inflows


async def _voucher(db, tenant) -> Voucher:
    v = Voucher(tenant_id=tenant.id, voucher_number=f"RV-{uuid.uuid4().hex[:8]}", voucher_type="RECEIPT", voucher_date=START, status="POSTED")
    db.add(v)
    await db.flush()
    return v


async def test_partial_invoice_and_advance_never_double_count(db_session_integration):
    db = db_session_integration
    tenant, user, _r, fx = await p3_tenant(db)
    order = await add_quoted_order(db, tenant, fx, None, qty=1000, delivery=START + timedelta(days=1),
                                   commercial_snapshot_json={"quoted_price": "10", "currency": "BDT"})
    inv = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-1", status="ISSUED", customer_id=fx.customer.id,
                            invoice_date=START - timedelta(days=90), currency="BDT", total_amount=D("3000"))
    db.add(inv)
    await db.flush()
    db.add(CommercialInvoiceLine(tenant_id=tenant.id, commercial_invoice_id=inv.id, order_id=order.id, line_amount=D("3000")))
    db.add(CommercialInvoiceReceiptAllocation(tenant_id=tenant.id, commercial_invoice_id=inv.id, voucher_id=(await _voucher(db, tenant)).id,
                                              allocated_amount=D("1000"), status="POSTED"))
    pi = ProformaInvoice(tenant_id=tenant.id, reference="PI-A", status="ISSUED", amount=D("10000"), currency="BDT")
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id))
    adv = ProformaReceiptAllocation(tenant_id=tenant.id, proforma_invoice_id=pi.id, voucher_id=(await _voucher(db, tenant)).id,
                                    order_id=None, allocated_amount=D("2000"), allocated_base_amount=D("2000"), status="POSTED")
    db.add(adv)
    await db.commit()
    params = {"date_from": START.isoformat(), "horizon_days": 180}
    body = await _get(db, tenant, user, params)
    ci = _rows(body, "COMMERCIAL_INVOICE")
    assert len(ci) == 1 and ci[0]["amount"] == "2000.0000"
    assert ci[0]["due_date"] == (START + timedelta(days=7)).isoformat()  # invoice date + 7 + 90
    od = _rows(body, "ORDER_REMAINING")
    assert len(od) == 1 and od[0]["amount"] == "5000.0000"  # 10000 - 3000 invoiced - 2000 advance (PI-level spread)
    assert od[0]["due_date"] == (START + timedelta(days=1 + 97)).isoformat()
    adv.allocated_base_amount = D("9000")
    await db.commit()
    assert _rows(await _get(db, tenant, user, params), "ORDER_REMAINING") == []  # clamped at 0


# ------------------------------------------------------------------ payroll


async def test_payroll_net_and_statutory_rows_and_repeat_months(db_session_integration):
    db = db_session_integration
    tenant, user, _r, fx = await p3_tenant(db)
    emp = Employee(tenant_id=tenant.id, employee_code="E-1", first_name="Op", is_active=True)
    db.add(emp)
    old = PayrollPeriod(tenant_id=tenant.id, period_code="2030-01", start_date=date(2030, 1, 1), end_date=date(2030, 1, 31),
                        payment_date=date(2030, 2, 7), status="FINALIZED")
    cur = PayrollPeriod(tenant_id=tenant.id, period_code="2030-02", start_date=date(2030, 2, 1), end_date=date(2030, 2, 28),
                        payment_date=START + timedelta(days=4), status="FINALIZED")
    db.add_all([old, cur])
    await db.flush()
    runs = []
    for period, net, st in ((old, "40000", "POSTED"), (cur, "11111", "DRAFT"), (cur, "50000", "FINALIZED")):
        run = PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code=f"R-{uuid.uuid4().hex[:6]}", run_date=period.end_date,
                         status=st, net_total=D(net))
        db.add(run)
        await db.flush()
        runs.append(run)
    line = PayrollRunLine(tenant_id=tenant.id, run_id=runs[2].id, employee_id=emp.id, net_pay=D("50000"))
    db.add(line)
    await db.flush()
    db.add(PayrollCalculationSnapshot(tenant_id=tenant.id, payroll_run_line_id=line.id,
                                      trace_json={"statutory": {"pf": {"employee_pf": "300"}, "bd_tds": {"monthly_tds": "200"}}}))
    await db.commit()
    body = await _get(db, tenant, user, {"date_from": START.isoformat(), "horizon_days": 60})
    net = _rows(body, "PAYROLL_NET")
    stat = _rows(body, "PAYROLL_STATUTORY")
    first = [r for r in net if r["date_rule"] == "PAYROLL_PERIOD_PAYMENT_DATE"]
    assert len(first) == 1 and first[0]["amount"] == "50000.0000" and first[0]["source_id"] == runs[2].id
    assert [r["amount"] for r in stat if r["date_rule"] == "PAYROLL_PERIOD_PAYMENT_DATE"] == ["500.0000"]
    repeat = [r for r in net if r["date_rule"] == "PAYROLL_7TH_WORKING_DAY"]
    assert repeat and all(r["confidence"] == "ESTIMATED" and r["amount"] == "50000.0000" for r in repeat)
    # March 2030 ends Sunday 31; weekend Sat+Sun -> 7th working day = Tue 9 April
    assert repeat[0]["due_date"] == "2030-04-09"
    assert not any(r["source_id"] == runs[0].id for r in net)  # earlier period assumed paid


# ------------------------------------------------------------------ opening, gap, isolation, query count


async def test_opening_cash_and_financing_gap(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    await add_account(db, s.tenant, statement_class="BANK_ACCOUNTS", nature="Asset", opening="800")
    await add_account(db, s.tenant, statement_class="BANK_OD", nature="Liability", normal="credit", opening="300")
    await db.commit()
    body = await _get(db, s.tenant, s.user)
    assert body["opening"]["excluding_overdraft"] == "800.0000"
    assert body["opening"]["including_overdraft"] == "500.0000"
    assert body["opening"]["basis"] == "NET_OF_DRAWN_OVERDRAFT"
    gap = body["financing_gap"]
    # net cash 500 (800 bank - 300 drawn overdraft); PO 1000 due in week 2 -> shortfall 500
    assert gap is not None and gap["week_index"] == 1 and gap["shortfall"] == "500.0000"
    assert "FINANCING_GAP" in body["reason_codes"]
    total_out = sum(D(w["outflow"]) for w in body["weeks"])
    assert total_out == D(body["totals"]["outflow"]) == _sum([r for r in body["rows"] if r["direction"] == "OUT" and r["week_index"] is not None])
    assert D(body["totals"]["closing"]) == D(body["weeks"][-1]["closing"])


async def test_foreign_amount_without_rate_is_unknown_and_excluded(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    await add_priced_po(db, s.tenant, s.vendor, s.item, qty="2", price="5", currency="EUR", rate=None,
                        expected=START + timedelta(days=1))
    await db.commit()
    body = await _get(db, s.tenant, s.user)
    unknown = [r for r in body["rows"] if r["amount"] is None]
    assert len(unknown) == 1 and "FX_UNKNOWN" in unknown[0]["reason_codes"]
    assert body["unknown_by_currency"] == [{"direction": "OUT", "category": "PO_UNRECEIVED", "currency": "EUR",
                                            "source_amount": "10.0000", "rows": 1}]
    assert D(body["totals"]["outflow"]) == D("1000")


async def test_other_tenant_rows_never_appear(db_session_integration):
    db = db_session_integration
    a = await _purchase(db)
    b = await _purchase(db)
    await db.commit()
    body = await _get(db, a.tenant, a.user)
    ids = {r["source_id"] for r in body["rows"] if r["source_type"] == "purchase_order"}
    assert ids == {a.po.id}


async def _count(db, tenant, user) -> int:
    statements: list[str] = []
    conn = db.sync_session.get_bind()

    def _record(_c, _cur, statement, _p, _ctx, _many):
        if not is_rls_housekeeping(statement):
            statements.append(statement)

    event.listen(conn, "before_cursor_execute", _record)
    try:
        await _get(db, tenant, user)
    finally:
        event.remove(conn, "before_cursor_execute", _record)
    return len(statements)


async def test_query_count_does_not_grow_with_orders_or_purchases(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    await add_quoted_order(db, s.tenant, s.fx, None, qty=10, delivery=START, commercial_snapshot_json={"quoted_price": "1"})
    await db.commit()
    few = await _count(db, s.tenant, s.user)
    for i in range(5):
        await add_quoted_order(db, s.tenant, s.fx, None, qty=10 + i, delivery=START + timedelta(days=i),
                               commercial_snapshot_json={"quoted_price": "1"})
        po, line = await add_priced_po(db, s.tenant, s.vendor, s.item, qty="1", price="1", currency="BDT", rate=None,
                                       expected=START)
        await add_grn_line(db, s.tenant, po, line, s.wh, received="1", accepted="1")
    await db.commit()
    many = await _count(db, s.tenant, s.user)
    assert many == few, (few, many)


async def test_horizon_and_defaults_validated(db_session_integration):
    db = db_session_integration
    s = await _purchase(db)
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        assert (await c.get(f"{API}/cash-requirement", params={"horizon_days": 181})).status_code == 422
        assert (await c.get(f"{API}/cash-requirement", params={"horizon_days": 0})).status_code == 422
        r = await c.get(f"{API}/cash-requirement")
    assert r.status_code == 200 and r.json()["horizon_days"] == 90 and len(r.json()["weeks"]) == 13
    assert r.json()["forecast_complete"] is True


# ------------------------------------------------------------------ security review round 1 (H1, M1, M2, INFO, L1-L6)


async def test_sql_marker_extraction_matches_finance_notes(db_session_integration):
    from sqlalchemy import func, literal, select

    from app.modules.mfg_intelligence.cash_requirement_service import _PG_GRN_MARKER, _PG_PO_MARKER

    db = db_session_integration
    for notes, po, grn in (
        ("x | PO:PO-1 | GRN_COUNT:0", "PO-1", None),
        ("PO:PO-1 | GRN:GRN-9", "PO-1", "GRN-9"),
        ("XPO:BAD", None, None),
    ):
        got = (await db.execute(select(func.substring(literal(notes), _PG_PO_MARKER), func.substring(literal(notes), _PG_GRN_MARKER)))).one()
        assert tuple(got) == (po, grn), notes
        assert parse_markers(notes) == ({po} - {None}, {grn} - {None})


async def test_source_cap_keeps_newest_unbilled_rows_and_reports_truncation(db_session_integration, monkeypatch):
    from app.models.finance import VendorBillLine
    from app.models.inventory import GoodsReceiving
    from app.modules.mfg_intelligence import cash_requirement_service as svc

    db = db_session_integration
    s = await _purchase(db)
    s.po.status = "CANCELLED"  # keep the base PO out of this test
    grns = {}
    for label, offset in (("old", -3), ("mid", -2), ("new", -1), ("billed", 0)):
        po, line = await add_priced_po(db, s.tenant, s.vendor, s.item, qty="10", price="1", currency="BDT", rate=None,
                                       status="FULLY_RECEIVED")
        item = await add_grn_line(db, s.tenant, po, line, s.wh, received="10", accepted="10")
        grn = await db.get(GoodsReceiving, item.goods_receiving_id)
        grn.received_date = START + timedelta(days=offset)
        grns[label] = (grn, item, po)
    billed_grn, billed_item, billed_po = grns["billed"]
    vb = VendorBill(tenant_id=s.tenant.id, bill_code="VB-LINE", vendor_id=s.vendor.id, status="POSTED",
                    purchase_order_id=billed_po.id, total_amount=D("10"), currency="BDT", due_date=START)
    db.add(vb)
    await db.flush()
    db.add(VendorBillLine(tenant_id=s.tenant.id, vendor_bill_id=vb.id, goods_receiving_item_id=billed_item.id,
                          item_id=s.item.id, quantity=D("10"), unit_price=D("1")))
    await db.commit()
    monkeypatch.setattr(svc, "MAX_SOURCE_ROWS", 2)
    body = await _get(db, s.tenant, s.user)
    grn_rows = _rows(body, "GRN_NOT_BILLED")
    # the billed (newest) GRN line is skipped in SQL, so it never takes a slot; the two newest unbilled are kept
    assert sorted(r["source_id"] for r in grn_rows) == sorted([grns["new"][0].id, grns["mid"][0].id])
    assert "SOURCE_TRUNCATED:GRN_NOT_BILLED" in body["reason_codes"]
    assert body["forecast_complete"] is False
    assert any(n.startswith("Forecast incomplete") for n in body["notes"])
    monkeypatch.setattr(svc, "MAX_SOURCE_ROWS", 20000)
    body = await _get(db, s.tenant, s.user)
    assert len(_rows(body, "GRN_NOT_BILLED")) == 3 and body["forecast_complete"] is True


async def test_advance_already_applied_to_an_invoice_is_not_subtracted_twice(db_session_integration):
    db = db_session_integration
    tenant, user, _r, fx = await p3_tenant(db)
    order = await add_quoted_order(db, tenant, fx, None, qty=1000, delivery=START + timedelta(days=1),
                                   commercial_snapshot_json={"quoted_price": "10", "currency": "BDT"})
    inv = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-M1", status="ISSUED", customer_id=fx.customer.id,
                            invoice_date=START - timedelta(days=10), currency="BDT", total_amount=D("3000"))
    db.add(inv)
    await db.flush()
    db.add(CommercialInvoiceLine(tenant_id=tenant.id, commercial_invoice_id=inv.id, order_id=order.id, line_amount=D("3000")))
    receipt = await _voucher(db, tenant)
    db.add(CommercialInvoiceReceiptAllocation(tenant_id=tenant.id, commercial_invoice_id=inv.id, voucher_id=receipt.id,
                                              allocated_amount=D("1000"), status="POSTED"))
    pi = ProformaInvoice(tenant_id=tenant.id, reference="PI-M1", status="ISSUED", amount=D("10000"), currency="BDT")
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id))
    db.add(ProformaReceiptAllocation(tenant_id=tenant.id, proforma_invoice_id=pi.id, voucher_id=receipt.id, order_id=order.id,
                                     allocated_amount=D("1000"), allocated_base_amount=D("1000"), status="POSTED"))
    unapplied = await _voucher(db, tenant)
    db.add(ProformaReceiptAllocation(tenant_id=tenant.id, proforma_invoice_id=pi.id, voucher_id=unapplied.id, order_id=order.id,
                                     allocated_amount=D("500"), allocated_base_amount=D("500"), status="POSTED"))
    await db.commit()
    body = await _get(db, tenant, user, {"date_from": START.isoformat(), "horizon_days": 180})
    assert [r["amount"] for r in _rows(body, "COMMERCIAL_INVOICE")] == ["2000.0000"]
    # 10000 - 3000 invoiced - 500 unapplied advance; the 1000 advance applied to the invoice is already in it
    assert [r["amount"] for r in _rows(body, "ORDER_REMAINING")] == ["6500.0000"]


async def test_partly_applied_advance_nets_only_the_unapplied_part(db_session_integration):
    db = db_session_integration
    tenant, user, _r, fx = await p3_tenant(db)
    order = await add_quoted_order(db, tenant, fx, None, qty=1000, delivery=START + timedelta(days=1),
                                   commercial_snapshot_json={"quoted_price": "10", "currency": "BDT"})
    inv = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-R1", status="ISSUED", customer_id=fx.customer.id,
                            invoice_date=START - timedelta(days=10), currency="BDT", total_amount=D("3000"))
    void = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-R1X", status="CANCELLED", customer_id=fx.customer.id,
                             invoice_date=START - timedelta(days=10), currency="BDT", total_amount=D("400"))
    db.add_all([inv, void])
    await db.flush()
    db.add(CommercialInvoiceLine(tenant_id=tenant.id, commercial_invoice_id=inv.id, order_id=order.id, line_amount=D("3000")))
    db.add(CommercialInvoiceLine(tenant_id=tenant.id, commercial_invoice_id=void.id, order_id=order.id, line_amount=D("400")))
    receipt = await _voucher(db, tenant)
    # 2000 advance: 500 applied to the live invoice, 400 to a cancelled one (does not count as applied)
    db.add(CommercialInvoiceReceiptAllocation(tenant_id=tenant.id, commercial_invoice_id=inv.id, voucher_id=receipt.id,
                                              allocated_amount=D("500"), allocated_base_amount=D("500"), status="POSTED"))
    db.add(CommercialInvoiceReceiptAllocation(tenant_id=tenant.id, commercial_invoice_id=void.id, voucher_id=receipt.id,
                                              allocated_amount=D("400"), allocated_base_amount=D("400"), status="POSTED"))
    pi = ProformaInvoice(tenant_id=tenant.id, reference="PI-R1", status="ISSUED", amount=D("10000"), currency="BDT")
    db.add(pi)
    await db.flush()
    db.add(ProformaInvoiceOrder(proforma_invoice_id=pi.id, order_id=order.id))
    db.add(ProformaReceiptAllocation(tenant_id=tenant.id, proforma_invoice_id=pi.id, voucher_id=receipt.id, order_id=order.id,
                                     allocated_amount=D("2000"), allocated_base_amount=D("2000"), status="POSTED"))
    await db.commit()
    body = await _get(db, tenant, user, {"date_from": START.isoformat(), "horizon_days": 180})
    # 10000 - 3000 invoiced - (2000 advance - 500 applied) = 5500
    assert [r["amount"] for r in _rows(body, "ORDER_REMAINING")] == ["5500.0000"]


async def test_draft_and_stale_invoices_are_not_cash(db_session_integration):
    db = db_session_integration
    tenant, user, _r, fx = await p3_tenant(db)
    order = await add_quoted_order(db, tenant, fx, None, qty=1000, delivery=START + timedelta(days=1),
                                   commercial_snapshot_json={"quoted_price": "10", "currency": "BDT"})
    draft = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-D", status="DRAFT", customer_id=fx.customer.id,
                              invoice_date=START, currency="BDT", total_amount=D("3000"))
    stale = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-S", status="ISSUED", customer_id=fx.customer.id,
                              invoice_date=START - timedelta(days=300), currency="BDT", total_amount=D("700"))
    cancelled = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-C", status="CANCELLED", customer_id=fx.customer.id,
                                  invoice_date=START, currency="BDT", total_amount=D("900"))
    db.add_all([draft, stale, cancelled])
    await db.flush()
    db.add(CommercialInvoiceLine(tenant_id=tenant.id, commercial_invoice_id=draft.id, order_id=order.id, line_amount=D("3000")))
    await db.commit()
    body = await _get(db, tenant, user, {"date_from": START.isoformat(), "horizon_days": 180})
    assert _rows(body, "COMMERCIAL_INVOICE") == []
    # the DRAFT invoice is not invoiced yet: the whole contract value is still the order's remaining inflow
    assert [r["amount"] for r in _rows(body, "ORDER_REMAINING")] == ["10000.0000"]
    assert any(n.startswith("STALE_RECEIVABLES: 1 invoice(s)") for n in body["notes"])


async def test_order_inflow_is_net_of_buying_commission(db_session_integration):
    from app.models.parties import CustomerIntermediary, Intermediary

    db = db_session_integration
    tenant, user, _r, fx = await p3_tenant(db)
    agent = Intermediary(tenant_id=tenant.id, code="AG-1", name="Agent", kind="BUYING_AGENT")
    db.add(agent)
    await db.flush()
    link = CustomerIntermediary(tenant_id=tenant.id, customer_id=fx.customer.id, intermediary_id=agent.id)
    db.add(link)
    await db.flush()
    order = await add_quoted_order(db, tenant, fx, None, qty=1000, delivery=START + timedelta(days=1),
                                   commercial_snapshot_json={"quoted_price": "10", "currency": "BDT"},
                                   customer_intermediary_id=link.id, commission_type="PERCENTAGE", commission_value=5)
    inv = CommercialInvoice(tenant_id=tenant.id, invoice_code="CI-N", status="ISSUED", customer_id=fx.customer.id,
                            invoice_date=START, currency="BDT", total_amount=D("2000"))
    db.add(inv)
    await db.flush()
    db.add(CommercialInvoiceLine(tenant_id=tenant.id, commercial_invoice_id=inv.id, order_id=order.id, line_amount=D("2000")))
    await db.commit()
    body = await _get(db, tenant, user, {"date_from": START.isoformat(), "horizon_days": 180})
    row = _rows(body, "ORDER_REMAINING")[0]
    assert row["amount"] == "7600.0000"  # (10000 - 2000 invoiced) x 95 %
    assert "NET_OF_BUYING_COMMISSION" in row["reason_codes"]
    assert any("net of buying commission" in n for n in body["notes"])


async def test_date_from_is_bounded_and_far_dates_never_overflow(db_session_integration):
    from app.models.inventory import GoodsReceiving

    db = db_session_integration
    s = await _purchase(db)
    s.vendor.payment_terms_days = 365
    item = await add_grn_line(db, s.tenant, s.po, s.line, s.wh, received="10", accepted="10")
    grn = await db.get(GoodsReceiving, item.goods_receiving_id)
    grn.received_date = date(9999, 12, 30)
    s.po.expected_date = date(9999, 12, 31)
    await db.commit()
    async with client_for(db, s.tenant, s.user) as c:
        for bad in ("2000-01-01", "2999-01-01"):
            r = await c.get(f"{API}/cash-requirement", params={"date_from": bad})
            assert r.status_code == 422 and "5 years" in r.json()["detail"]
    body = await _get(db, s.tenant, s.user)
    far = [r for r in body["rows"] if "DATE_OUT_OF_RANGE" in r["reason_codes"]]
    assert {r["category"] for r in far} == {"GRN_NOT_BILLED", "PO_UNRECEIVED"}
    assert all(r["week_index"] is None for r in far)


def test_to_dec_rejects_nan_and_infinity():
    from app.modules.mfg_intelligence.decimals import to_dec
    from app.modules.mfg_intelligence.money import positive

    for bad in ("NaN", "Infinity", "-inf", D("NaN"), float("inf")):
        assert to_dec(bad) is None, bad
        assert positive(bad) is None
    assert to_dec("1.5") == D("1.5")


@pytest.mark.parametrize("status,funded", [("active", True), ("closed", True), ("settled", True), ("draft", False), ("cancelled", False)])
async def test_po_funded_by_facility_stays_funded_unless_draft_or_cancelled(db_session_integration, status, funded):
    db = db_session_integration
    s = await _purchase(db)
    fac = Facility(tenant_id=s.tenant.id, facility_code=f"F-{status}", facility_type="working_capital", status="active",
                   sanctioned_amount=1000, currency="BDT")
    db.add(fac)
    await db.flush()
    db.add(FacilityUtilization(tenant_id=s.tenant.id, facility_id=fac.id, utilization_code=f"U-{status}", status=status,
                               currency="BDT", linked_purchase_order_id=s.po.id))
    await db.commit()
    rows = _rows(await _get(db, s.tenant, s.user), "PO_UNRECEIVED")
    assert (rows == []) is funded, (status, rows)


async def test_payroll_due_between_today_and_a_future_start_is_in_week_1(db_session_integration):
    db = db_session_integration
    tenant, user, _r, fx = await p3_tenant(db)
    period = PayrollPeriod(tenant_id=tenant.id, period_code="2030-01", start_date=date(2030, 1, 1), end_date=date(2030, 1, 31),
                           payment_date=date(2030, 2, 7), status="FINALIZED")
    db.add(period)
    await db.flush()
    run = PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code="R-L6", run_date=period.end_date, status="POSTED",
                     net_total=D("40000"))
    db.add(run)
    await db.commit()
    params = {"date_from": START.isoformat(), "horizon_days": 14}
    # today before the payment date: not paid yet, so it is cash due before the window starts -> week 1
    body = await _get(db, tenant, user, params, today=date(2030, 1, 20))
    rows = [r for r in _rows(body, "PAYROLL_NET") if r["source_id"] == run.id and r["date_rule"] == "PAYROLL_PERIOD_PAYMENT_DATE"]
    assert len(rows) == 1 and rows[0]["week_index"] == 0 and not rows[0]["overdue"]
    assert "DUE_BEFORE_START" in rows[0]["reason_codes"] and "DUE_BEFORE_START_IN_WEEK_1" in body["reason_codes"]
    # today after the payment date: assumed paid
    body = await _get(db, tenant, user, params, today=START)
    assert not [r for r in _rows(body, "PAYROLL_NET") if r["date_rule"] == "PAYROLL_PERIOD_PAYMENT_DATE"]
