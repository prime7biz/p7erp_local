"""Finance Control Tower cards and drill-down lists (PLAN Phase 3, acceptance 3.1, 3.2, 3.6-3.8, 3.10).

Everything is worked out by hand from `seed_control_world` below (which sits on `finance_statement_fixtures.seed_world`).
as_of_date is 2027-06-30 for every call so the numbers never depend on today's date.

Hand-worked cards (base currency BDT):
  GRN_NOT_BILLED        G1 qty 10 x PO price 100 = 1000 (Jan 5), G3 qty 5 x 100 = 500 whose only bill is CANCELLED (Feb 1);
                        G2 has a live bill, G4 is DRAFT, other tenant's GRN ignored            -> count 2, amount 1500
  CHALLAN_NOT_INVOICED  C1 posted + C2 posted with a CANCELLED invoice; C3 has a live invoice, C4 is DRAFT -> count 2
  VENDOR_BILL_VARIANCE  PO line price 100 x 100 (GRN 100) and price 100000 x 10 (GRN 10); tolerance = max(2% x expected, 500)
                          price 100 / qty 100 -> 0 (ok)      price 101 -> 100 (below 500)    price 105 -> 500 (AT 500, not flagged)
                          price 110 -> 1000 (above)          qty 110 at price 100 -> 10 x 100 = 1000 (above)
                          big line: price 102000 -> 20000 (AT 2% x 1,000,000 = 20000, not flagged), 102500 -> 25000 (above)
                          cancelled bill with 1000 ignored   -> count 3, amount 27000
  NEGATIVE_CASH         petty cash -300, bank -1200, USD cash Cr 10 at base 1100 -> -1100; Bank OD credit balance is not "cash";
                        a draft credit is ignored                                              -> count 3, amount 2600
  NEGATIVE_STOCK        IN 5 / OUT 8 -> -3 x default cost 10 = 30 (other tenant's negative ignored) -> count 1, amount 30
  OVERDUE_RECEIVABLES   due 800 (1000 - 200 paid) + a USD bill 40 in the count only             -> count 2, amount 800
  OVERDUE_PAYABLES      due 500; PAID, not-yet-due and other-tenant bills ignored               -> count 1, amount 500
  BUDGET_BREACH         100% (1000 of 1000) and 120% (1200 of 1000)                             -> count 2, amount 2200
  BUDGET_WARNING        85% (850) and exactly 80% (800); 79.9% and 50% ignored                  -> count 2, amount 1650
                        a line whose period is another month and a DRAFT budget are ignored
  STOCK_GL_MISMATCH     GL inventory 48000 (40000 opening + 20000 - 12000); stock side = the -3 item at default cost 10 = -30
                        (no cost layers) -> |48000 - (-30)| = 48030
  VOUCHERS_PENDING_APPROVAL  SUBMITTED, CHECKED, RECOMMENDED, APPROVED at debit 100 each -> count 4, amount 400
  VOUCHERS_DRAFT_OLD    seed draft 99999 + a 10-day-old draft 100 (a 3-day-old draft is not old) -> count 2, amount 100099

Run: docker compose exec -T backend pytest tests/test_finance_control_tower.py -q
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models.commercial import CommercialInvoice
from app.models.finance import Budget, BudgetLine, CostCenter, OutstandingBill, VendorBill, VendorBillLine, Voucher
from app.models.inventory import (
    DeliveryChallan,
    GoodsReceiving,
    GoodsReceivingItem,
    InventoryCostLayer,
    PurchaseOrder,
    PurchaseOrderItem,
    StockMovement,
    Vendor,
)
from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin
from tests.finance_control_fixtures import CONTROL_FLAG, cr, dr, make_customer, post_v, uid
from tests.finance_statement_fixtures import make_group, make_ledger, seed_world
from tests.test_perf_inventory_reports_equivalence import QueryCounter

D = Decimal
API = "/api/v1/finance/control-tower"
AS_OF = "2027-06-30"
ALL_CODES = [
    "GRN_NOT_BILLED", "CHALLAN_NOT_INVOICED", "VENDOR_BILL_VARIANCE", "NEGATIVE_CASH", "NEGATIVE_STOCK",
    "OVERDUE_RECEIVABLES", "OVERDUE_PAYABLES", "BUDGET_BREACH", "BUDGET_WARNING", "STOCK_GL_MISMATCH",
    "VOUCHERS_PENDING_APPROVAL", "VOUCHERS_DRAFT_OLD",
]


async def _vendor(db, tenant_id: int, name: str = "Fabric Co") -> Vendor:
    v = Vendor(tenant_id=tenant_id, vendor_code=f"V{uid()}", name=name)
    db.add(v)
    await db.flush()
    return v


async def _po_line(db, tenant_id, vendor, item, wh, *, price: str, qty: str):
    po = PurchaseOrder(tenant_id=tenant_id, po_code=f"PO-{uid()}", vendor_id=vendor.id, supplier_name=vendor.name, status="APPROVED")
    db.add(po)
    await db.flush()
    line = PurchaseOrderItem(
        tenant_id=tenant_id, purchase_order_id=po.id, item_id=item.id, warehouse_id=wh.id, quantity=D(qty), unit_price=D(price)
    )
    db.add(line)
    await db.flush()
    return po, line


async def _grn(db, tenant_id, vendor, po, line, item, wh, *, qty: str, received: date, status: str = "RECEIVED"):
    grn = GoodsReceiving(
        tenant_id=tenant_id, grn_code=f"GRN-{uid()}", purchase_order_id=po.id, received_date=received, status=status, vendor_id=vendor.id
    )
    db.add(grn)
    await db.flush()
    gi = GoodsReceivingItem(
        tenant_id=tenant_id, goods_receiving_id=grn.id, item_id=item.id, warehouse_id=wh.id, quantity=D(qty),
        purchase_order_line_id=line.id,
    )
    db.add(gi)
    await db.flush()
    return grn, gi


async def _bill(db, tenant_id, vendor, grn, gi, line, *, price: str, qty: str, status: str = "POSTED", item):
    bill = VendorBill(
        tenant_id=tenant_id, bill_code=f"B-{uid()}", vendor_id=vendor.id, status=status, goods_receiving_id=grn.id,
        bill_date=date(2027, 2, 1),
    )
    db.add(bill)
    await db.flush()
    db.add(
        VendorBillLine(
            tenant_id=tenant_id, vendor_bill_id=bill.id, item_id=item.id, quantity=D(qty), unit_price=D(price),
            purchase_order_line_id=line.id, goods_receiving_item_id=gi.id,
        )
    )
    await db.flush()
    return bill


async def seed_control_world(db, *, flags: dict | None = None, role_name: str = "admin", permissions: dict | None = None):
    tenant, user, w = await seed_world(db, flags={**CONTROL_FLAG, **(flags or {})}, role_name=role_name, permissions=permissions)
    t, g, L = tenant.id, w["groups"], w["ledgers"]
    # make the seed draft voucher deterministic: it is "old" on 2027-06-30 whatever day the suite runs
    for v in (await db.execute(select(Voucher).where(Voucher.tenant_id == t, Voucher.status == "DRAFT"))).scalars():
        v.created_at = datetime(2027, 1, 1, 9, 0, 0)
    vendor = await _vendor(db, t)
    item, wh, _unit = await seed_item(db, t, code="CT-ITEM")
    item.default_cost = D("10")
    w.update(vendor=vendor, item=item, wh=wh)

    # --- GRN not billed -----------------------------------------------------------------------------------------
    po1, pl1 = await _po_line(db, t, vendor, item, wh, price="100", qty="100")
    g1, _ = await _grn(db, t, vendor, po1, pl1, item, wh, qty="10", received=date(2027, 1, 5))
    g2, gi2 = await _grn(db, t, vendor, po1, pl1, item, wh, qty="7", received=date(2027, 1, 6))
    g3, gi3 = await _grn(db, t, vendor, po1, pl1, item, wh, qty="5", received=date(2027, 2, 1))
    await _grn(db, t, vendor, po1, pl1, item, wh, qty="9", received=date(2027, 1, 7), status="DRAFT")
    await _bill(db, t, vendor, g2, gi2, pl1, price="100", qty="7", item=item)  # live bill: g2 is billed
    await _bill(db, t, vendor, g3, gi3, pl1, price="100", qty="5", status="CANCELLED", item=item)  # cancelled: still unbilled
    w["grns"] = dict(g1=g1, g2=g2, g3=g3)

    # --- vendor bill variance (their GRNs carry a live bill, so they are not "not billed") ---------------------------
    po_a, pl_a = await _po_line(db, t, vendor, item, wh, price="100", qty="100")
    ga, gia = await _grn(db, t, vendor, po_a, pl_a, item, wh, qty="100", received=date(2027, 1, 10))
    po_b, pl_b = await _po_line(db, t, vendor, item, wh, price="100000", qty="10")
    gb, gib = await _grn(db, t, vendor, po_b, pl_b, item, wh, qty="10", received=date(2027, 1, 11))
    bills = {}
    for name, (grn, gi, line, price, qty, status) in {
        "ok": (ga, gia, pl_a, "100", "100", "POSTED"),
        "below": (ga, gia, pl_a, "101", "100", "POSTED"),
        "at": (ga, gia, pl_a, "105", "100", "POSTED"),
        "above": (ga, gia, pl_a, "110", "100", "POSTED"),
        "qty": (ga, gia, pl_a, "100", "110", "POSTED"),
        "pct_at": (gb, gib, pl_b, "102000", "10", "POSTED"),
        "pct_above": (gb, gib, pl_b, "102500", "10", "POSTED"),
        "cancelled": (ga, gia, pl_a, "110", "100", "CANCELLED"),
    }.items():
        bills[name] = await _bill(db, t, vendor, grn, gi, line, price=price, qty=qty, status=status, item=item)
    w["bills"] = bills

    # --- challans -----------------------------------------------------------------------------------------------------
    cust = await make_customer(db, t, "Challan buyer")
    challans = {}
    for name, (status, day) in {
        "c1": ("POSTED", date(2027, 3, 1)),
        "c2": ("POSTED", date(2027, 3, 2)),
        "c3": ("POSTED", date(2027, 3, 3)),
        "c4": ("DRAFT", date(2027, 3, 4)),
    }.items():
        c = DeliveryChallan(tenant_id=t, challan_code=f"DC-{uid()}", customer_name="Challan buyer", delivery_date=day, status=status)
        db.add(c)
        challans[name] = c
    await db.flush()
    for key, status in (("c2", "CANCELLED"), ("c3", "POSTED")):
        db.add(
            CommercialInvoice(
                tenant_id=t, invoice_code=f"CI-{uid()}", status=status, customer_id=cust.id,
                source_delivery_challan_id=challans[key].id,
            )
        )
    await db.flush()
    w["challans"] = challans

    # --- negative cash ------------------------------------------------------------------------------------------------
    bank_g = await make_group(db, t, "Bank Accounts", "Asset", "BANK_ACCOUNTS", g["ca"])
    od_g = await make_group(db, t, "Bank OD", "Liability", "BANK_OD")
    petty = await make_ledger(db, t, g["cash"], "Petty Cash")
    usd_cash = await make_ledger(db, t, g["cash"], "USD Cash")
    ok_cash = await make_ledger(db, t, g["cash"], "Cash OK", "100")
    bank = await make_ledger(db, t, bank_g, "City Bank")
    od = await make_ledger(db, t, od_g, "Overdraft")
    rent = L["rent"]
    await post_v(db, t, date(2027, 4, 1), [dr(rent, "300"), cr(petty, "300")])
    await post_v(db, t, date(2027, 4, 2), [dr(rent, "1200"), cr(bank, "1200")])
    await post_v(db, t, date(2027, 4, 3), [dr(rent, "1100"), cr(usd_cash, "10", base="1100")])
    await post_v(db, t, date(2027, 4, 4), [dr(rent, "500"), cr(od, "500")])
    cash_draft = await post_v(db, t, date(2027, 4, 5), [dr(rent, "500"), cr(ok_cash, "500")], status="DRAFT")
    cash_draft.created_at = datetime(2027, 6, 29, 9, 0, 0)  # recent on 2027-06-30, so not an "old draft"
    w["cash"] = dict(petty=petty, bank=bank, usd=usd_cash, od=od, ok=ok_cash)

    # --- negative stock -----------------------------------------------------------------------------------------------
    for mtype, qty in (("IN", "5"), ("OUT", "8")):
        db.add(
            StockMovement(
                tenant_id=t, item_id=item.id, warehouse_id=wh.id, movement_type=mtype, quantity=D(qty),
                movement_date=date(2027, 2, 1), created_at=datetime(2027, 2, 1, 9, 0, 0), reference_type="TEST",
            )
        )
    item2, wh2, _ = await seed_item(db, t, code="CT-ITEM-OK")
    db.add(
        StockMovement(
            tenant_id=t, item_id=item2.id, warehouse_id=wh2.id, movement_type="IN", quantity=D("4"),
            movement_date=date(2027, 2, 1), created_at=datetime(2027, 2, 1, 9, 0, 0), reference_type="TEST",
        )
    )
    await db.flush()

    # --- overdue bills ------------------------------------------------------------------------------------------------
    for no, btype, due, amount, paid, status, ccy in (
        ("AR-1", "RECEIVABLE", date(2027, 5, 1), "1000", "200", "OPEN", "BDT"),
        ("AR-2", "RECEIVABLE", date(2027, 5, 2), "40", "0", "OPEN", "USD"),
        ("AR-3", "RECEIVABLE", date(2027, 5, 3), "900", "900", "OPEN", "BDT"),  # fully paid
        ("AR-4", "RECEIVABLE", date(2027, 7, 30), "900", "0", "OPEN", "BDT"),  # not yet due
        ("AP-1", "PAYABLE", date(2027, 4, 1), "500", "0", "OPEN", "BDT"),
        ("AP-2", "PAYABLE", date(2027, 4, 2), "700", "0", "PAID", "BDT"),
    ):
        db.add(
            OutstandingBill(
                tenant_id=t, bill_no=f"{no}-{uid()}", party_name="Party", bill_type=btype, bill_date=date(2027, 3, 1),
                due_date=due, amount=D(amount), paid_amount=D(paid), status=status, currency=ccy,
            )
        )
    await db.flush()

    # --- budgets (period month 2027-06 covers AS_OF) ----------------------------------------------------------------------
    centres = {}
    for key in "abcdefgh":
        cc = CostCenter(tenant_id=t, center_code=f"CC{key}{uid()}", name=f"Centre {key}")
        db.add(cc)
        centres[key] = cc
    await db.flush()
    final = Budget(tenant_id=t, budget_name="FY2027", fiscal_year="2027", status="FINAL")
    draft = Budget(tenant_id=t, budget_name="Draft plan", fiscal_year="2027", status="DRAFT")
    db.add_all([final, draft])
    await db.flush()
    plan = {  # centre -> (budget, actual posted in June)
        "a": ("1000", "1000"), "b": ("1000", "850"), "c": ("1000", "500"), "d": ("1000", "1200"),
        "g": ("1000", "800"), "h": ("1000", "799"),
    }
    for key, (planned, actual) in plan.items():
        db.add(BudgetLine(tenant_id=t, budget_id=final.id, cost_center_id=centres[key].id, account_id=rent.id, period_month="2027-06", amount=D(planned)))
        await post_v(db, t, date(2027, 6, 10), [dr(rent, actual, cc=centres[key].id), cr(L["cash"], actual)])
    # other month: 500 spent in Feb against 100 -> not in the June window
    db.add(BudgetLine(tenant_id=t, budget_id=final.id, cost_center_id=centres["e"].id, account_id=rent.id, period_month="2027-02", amount=D("100")))
    await post_v(db, t, date(2027, 2, 10), [dr(rent, "500", cc=centres["e"].id), cr(L["cash"], "500")])
    # draft budget at 200% of centre c's spending
    db.add(BudgetLine(tenant_id=t, budget_id=draft.id, cost_center_id=centres["c"].id, account_id=rent.id, period_month="2027-06", amount=D("250")))
    await db.flush()

    # --- vouchers waiting / old drafts --------------------------------------------------------------------------------------
    for status in ("SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED", "POSTED", "CANCELLED", "REJECTED", "REVERSED"):
        await post_v(db, t, date(2027, 5, 1), [dr(rent, "100"), cr(L["cash"], "100")], status=status)
    old_draft = await post_v(db, t, date(2027, 6, 1), [dr(rent, "100"), cr(L["cash"], "100")], status="DRAFT")
    old_draft.created_at = datetime(2027, 6, 20, 9, 0, 0)
    recent = await post_v(db, t, date(2027, 6, 28), [dr(rent, "100"), cr(L["cash"], "100")], status="DRAFT")
    recent.created_at = datetime(2027, 6, 27, 9, 0, 0)
    await db.flush()
    return tenant, user, w


async def seed_other_tenant_exceptions(db):
    """A second tenant with exceptions of every kind; none of it may appear for the first tenant."""
    tenant, user, w = await seed_control_world(db)
    return tenant, user, w


async def _cards(ac, **params) -> dict[str, dict]:
    r = await ac.get(API, params={"as_of_date": AS_OF, **params})
    assert r.status_code == 200, r.text
    return {c["code"]: c for c in r.json()["cards"]}


EXPECTED = {  # code -> (count, amount, oldest_date)
    "GRN_NOT_BILLED": (2, "1500.0000", "2027-01-05"),
    "CHALLAN_NOT_INVOICED": (2, "0.0000", "2027-03-01"),
    "VENDOR_BILL_VARIANCE": (3, "27000.0000", "2027-02-01"),
    "NEGATIVE_CASH": (3, "2600.0000", None),
    "NEGATIVE_STOCK": (1, "30.0000", None),
    "OVERDUE_RECEIVABLES": (2, "800.0000", "2027-05-01"),
    "OVERDUE_PAYABLES": (1, "500.0000", "2027-04-01"),
    "BUDGET_BREACH": (2, "2200.0000", "2027-06-30"),
    "BUDGET_WARNING": (2, "1650.0000", "2027-06-30"),
    "STOCK_GL_MISMATCH": (1, "48030.0000", "2027-06-30"),
    "VOUCHERS_PENDING_APPROVAL": (4, "400.0000", "2027-05-01"),
    "VOUCHERS_DRAFT_OLD": (2, "100099.0000", "2027-01-01"),
}


# ---- cards, hand-worked -----------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_every_card_hand_computed(db_session_integration):
    db = db_session_integration
    await seed_other_tenant_exceptions(db)  # its exceptions must not leak in
    tenant, user, _w = await seed_control_world(db)
    async with api_client(db, tenant, user) as ac:
        cards = await _cards(ac)
    assert list(cards) == ALL_CODES
    for code, (count, amount, oldest) in EXPECTED.items():
        card = cards[code]
        assert (card["count"], card["amount"], card["oldest_date"]) == (count, amount, oldest), code
        assert card["href"] == f"/app/finance/home?tab=exceptions&exception={code}"
        assert card["severity"] in ("high", "medium", "low") and card["label"]
    assert cards["VENDOR_BILL_VARIANCE"]["severity"] == "low"  # informational, never blocking (acceptance 3.8)
    assert cards["BUDGET_WARNING"]["severity"] == "medium" and cards["BUDGET_BREACH"]["severity"] == "high"
    assert cards["OVERDUE_RECEIVABLES"]["source"] == "outstanding_bills"
    assert "1 foreign-currency" in cards["OVERDUE_RECEIVABLES"]["note"]


@pytest.mark.asyncio
async def test_severity_filter(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_control_world(db)
    async with api_client(db, tenant, user) as ac:
        everything = await _cards(ac)
        for severity in ("high", "medium", "low"):
            subset = await _cards(ac, severity=severity)
            assert subset and {c["severity"] for c in subset.values()} == {severity}
            assert {k for k, c in everything.items() if c["severity"] == severity} == set(subset)
        assert await _cards(ac, severity="all") == everything
        assert (await ac.get(API, params={"severity": "urgent"})).status_code == 422


# ---- card total == drill-down list (acceptance 3.1) ------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_card_equals_drill_list_for_every_card(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_control_world(db)
    async with api_client(db, tenant, user) as ac:
        cards = await _cards(ac)
        for code, card in cards.items():
            r = await ac.get(f"{API}/exceptions/{code}", params={"as_of_date": AS_OF, "limit": 500})
            assert r.status_code == 200, (code, r.text)
            body = r.json()
            assert body["code"] == code and body["total"] == card["count"], code
            assert body["amount"] == card["amount"] and body["oldest_date"] == card["oldest_date"], code
            assert len(body["rows"]) == card["count"], code
            assert sum(D(row["amount"]) for row in body["rows"]) == D(card["amount"]), code
            # paging: one row at a time gives the same rows in the same order, and the total never changes
            if card["count"] > 1:
                seen = []
                for offset in range(card["count"]):
                    page = (await ac.get(f"{API}/exceptions/{code}", params={"as_of_date": AS_OF, "limit": 1, "offset": offset})).json()
                    assert page["total"] == card["count"] and len(page["rows"]) == 1
                    seen.append(page["rows"][0])
                assert seen == body["rows"], code
            beyond = (await ac.get(f"{API}/exceptions/{code}", params={"as_of_date": AS_OF, "offset": 500})).json()
            assert beyond["rows"] == [] and beyond["total"] == card["count"]


@pytest.mark.asyncio
async def test_drill_rows_are_the_expected_records(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_control_world(db)
    async with api_client(db, tenant, user) as ac:
        async def rows(code):
            return (await ac.get(f"{API}/exceptions/{code}", params={"as_of_date": AS_OF, "limit": 500})).json()["rows"]

        grn = await rows("GRN_NOT_BILLED")
        assert [r["reference"] for r in grn] == [w["grns"]["g1"].grn_code, w["grns"]["g3"].grn_code]  # oldest first
        assert [r["amount"] for r in grn] == ["1000.0000", "500.0000"] and grn[0]["party"] == "Fabric Co"
        assert {r["id"] for r in await rows("CHALLAN_NOT_INVOICED")} == {w["challans"]["c1"].id, w["challans"]["c2"].id}
        variance = await rows("VENDOR_BILL_VARIANCE")
        assert {r["id"] for r in variance} == {w["bills"][k].id for k in ("above", "qty", "pct_above")}
        by_ref = {r["reference"]: r for r in variance}
        assert by_ref[w["bills"]["pct_above"].bill_code]["details"]["tolerance"] == "20000.0000"
        assert by_ref[w["bills"]["above"].bill_code]["details"]["tolerance"] == "500.0000"
        cash = await rows("NEGATIVE_CASH")
        # most overdrawn first; the USD ledger counts its base amount (1100), not the 10 USD
        assert [(r["party"], r["amount"]) for r in cash] == [
            ("City Bank", "1200.0000"), ("USD Cash", "1100.0000"), ("Petty Cash", "300.0000"),
        ]
        assert "Overdraft" not in {r["party"] for r in cash} and "Cash OK" not in {r["party"] for r in cash}
        stock = await rows("NEGATIVE_STOCK")
        assert stock[0]["reference"] == "CT-ITEM" and stock[0]["details"]["on_hand"] == "-3.0000"
        assert [r["reference"] for r in await rows("OVERDUE_PAYABLES")][0].startswith("AP-1")
        breach = await rows("BUDGET_BREACH")
        assert [r["details"]["used_percent"] for r in breach] == ["120.0000", "100.0000"]  # worst first
        assert {r["details"]["used_percent"] for r in await rows("BUDGET_WARNING")} == {"85.0000", "80.0000"}
        mismatch = (await rows("STOCK_GL_MISMATCH"))[0]["details"]
        # FIFO side: the -3 negative item valued at default cost 10 = -30 (no cost layers); GL side 48000
        assert mismatch == {"fifo_total": "-30.0000", "gl_total": "48000.0000", "difference": "48030.0000", "unclassified_stock": "-30.0000"}
        pending = await rows("VOUCHERS_PENDING_APPROVAL")
        assert {r["details"]["status"] for r in pending} == {"SUBMITTED", "CHECKED", "RECOMMENDED", "APPROVED"}
        assert all(r["details"]["status"] not in ("POSTED", "CANCELLED", "REJECTED", "REVERSED", "DRAFT") for r in pending)
        assert {r["details"]["status"] for r in await rows("VOUCHERS_DRAFT_OLD")} == {"DRAFT"}


# ---- statement-level rules: posted-only, in-books, base currency ---------------------------------------------------------------------
@pytest.mark.asyncio
async def test_negative_cash_uses_posted_in_books_base_amounts_only(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_control_world(db)
    t, L = tenant.id, w["ledgers"]
    extra = await make_ledger(db, t, w["groups"]["cash"], "Extra Cash")
    for kwargs in (
        {"status": "DRAFT"}, {"status": "CANCELLED"}, {"status": "REVERSED"},
        {"vtype": "MEMORANDUM", "is_memorandum": True}, {"is_post_dated": True},
    ):
        await post_v(db, t, date(2027, 5, 5), [dr(L["rent"], "9999"), cr(extra, "9999")], **kwargs)
    async with api_client(db, tenant, user) as ac:
        cards = await _cards(ac)
        assert cards["NEGATIVE_CASH"]["count"] == 3  # none of those vouchers count
        await post_v(db, t, date(2027, 5, 6), [dr(L["rent"], "50"), cr(extra, "50")])  # a posted one does
        again = await _cards(ac)
    assert again["NEGATIVE_CASH"]["count"] == 4 and again["NEGATIVE_CASH"]["amount"] == "2650.0000"
    # as of an earlier date the April vouchers had not happened yet
    async with api_client(db, tenant, user) as ac:
        early = await _cards(ac, as_of_date="2027-03-31")
    assert early["NEGATIVE_CASH"]["count"] == 0


@pytest.mark.asyncio
async def test_stock_vs_gl_mismatch_and_exact_match(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_control_world(db)
    # exact match: GL 50 (opening) equals FIFO 10 x 5
    t2, u2 = await seed_tenant_admin(db)
    t2.feature_flags = dict(CONTROL_FLAG)
    stock_g = await make_group(db, t2.id, "Stock", "Asset", "STOCK_IN_HAND")
    await make_ledger(db, t2.id, stock_g, "Inventory", "50")
    item, wh, _unit = await seed_item(db, t2.id, code="MATCH-1")
    mv = StockMovement(
        tenant_id=t2.id, item_id=item.id, warehouse_id=wh.id, movement_type="IN", quantity=D("10"),
        movement_date=date(2027, 2, 1), created_at=datetime(2027, 2, 1, 9, 0, 0), reference_type="TEST",
    )
    db.add(mv)
    await db.flush()
    db.add(
        InventoryCostLayer(
            tenant_id=t2.id, item_id=item.id, warehouse_id=wh.id, source_movement_id=mv.id, qty_original=D("10"),
            qty_remaining=D("10"), unit_cost=D("5.0000"), layer_date=date(2027, 2, 1),
        )
    )
    await db.flush()
    async with api_client(db, tenant, user) as ac:
        mismatch = (await _cards(ac))["STOCK_GL_MISMATCH"]
    async with api_client(db, t2, u2) as ac:
        match = (await _cards(ac))["STOCK_GL_MISMATCH"]
        rows = (await ac.get(f"{API}/exceptions/STOCK_GL_MISMATCH", params={"as_of_date": AS_OF})).json()
    assert mismatch["count"] == 1 and mismatch["amount"] == "48030.0000"
    assert match["count"] == 0 and match["amount"] == "0.0000" and match["oldest_date"] is None
    assert rows["total"] == 0 and rows["rows"] == []


@pytest.mark.asyncio
async def test_vendor_variance_is_informational_and_tolerance_boundaries(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_control_world(db)
    async with api_client(db, tenant, user) as ac:
        body = (await ac.get(f"{API}/exceptions/VENDOR_BILL_VARIANCE", params={"as_of_date": AS_OF, "limit": 500})).json()
    flagged = {r["id"] for r in body["rows"]}
    b = w["bills"]
    assert b["above"].id in flagged and b["qty"].id in flagged and b["pct_above"].id in flagged
    for name in ("ok", "below", "at", "pct_at", "cancelled"):  # at / below tolerance and cancelled bills are not flagged
        assert b[name].id not in flagged, name
    assert "Never blocks" in body["note"] and body["severity"] == "low"


# ---- tenant isolation ------------------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_other_tenants_rows_never_appear(db_session_integration):
    db = db_session_integration
    other, _ou, ow = await seed_other_tenant_exceptions(db)
    tenant, user, w = await seed_control_world(db)
    foreign_refs = {g.grn_code for g in ow["grns"].values()} | {b.bill_code for b in ow["bills"].values()}
    foreign_refs |= {c.challan_code for c in ow["challans"].values()}
    async with api_client(db, tenant, user) as ac:
        own_refs: set = set()
        for code in ALL_CODES:
            body = (await ac.get(f"{API}/exceptions/{code}", params={"as_of_date": AS_OF, "limit": 500})).json()
            own_refs |= {r["reference"] for r in body["rows"]}
            assert body["total"] == EXPECTED[code][0], code
    assert own_refs.isdisjoint(foreign_refs) and own_refs
    assert other.id != tenant.id and w["grns"]["g1"].grn_code in own_refs


# ---- gates, validation ------------------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_flag_off_permission_denial_and_validation(db_session_integration):
    db = db_session_integration
    t_on, u_on, _ = await seed_control_world(db)
    t_off, u_off, _ = await seed_control_world(db, flags={"finance_control_tower_v2": False})
    t_str, u_str, _ = await seed_control_world(db, flags={"finance_control_tower_v2": "true"})
    enforce = {"rbac_enforcement": "enforce"}
    t_deny, u_deny, _ = await seed_control_world(
        db, role_name="analyst", permissions={"finance.access": True, "finance.mis_report.view": False}, flags=enforce
    )
    t_none, u_none, _ = await seed_control_world(db, role_name="viewer", permissions={}, flags=enforce)
    t_ok, u_ok, _ = await seed_control_world(db, role_name="clerk", permissions={"finance.access": True}, flags=enforce)
    for tenant, user, expected in (
        (t_on, u_on, 200), (t_off, u_off, 404), (t_str, u_str, 404), (t_deny, u_deny, 403), (t_none, u_none, 403), (t_ok, u_ok, 200),
    ):
        async with api_client(db, tenant, user) as ac:
            for path in (API, f"{API}/exceptions/GRN_NOT_BILLED"):
                r = await ac.get(path, params={"as_of_date": AS_OF})
                assert r.status_code == expected, (user.username, path, r.status_code)
    async with api_client(db, t_on, u_on) as ac:
        for path, params in (
            (API, {"as_of_date": "2027-13-01"}),
            (API, {"as_of_date": "soon"}),
            (API, {"severity": "critical"}),
            (f"{API}/exceptions/GRN_NOT_BILLED", {"limit": 0}),
            (f"{API}/exceptions/GRN_NOT_BILLED", {"limit": 501}),
            (f"{API}/exceptions/GRN_NOT_BILLED", {"offset": -1}),
            (f"{API}/exceptions/GRN_NOT_BILLED", {"as_of_date": "x"}),
            # extreme years: 422, never a 500 from a date overflow
            (API, {"as_of_date": "9999-12-31"}),
            (API, {"as_of_date": "0001-01-01"}),
            (f"{API}/exceptions/VOUCHERS_DRAFT_OLD", {"as_of_date": "0001-01-01"}),
            (f"{API}/exceptions/NEGATIVE_CASH", {"as_of_date": "9999-12-31"}),
        ):
            assert (await ac.get(path, params=params)).status_code == 422, (path, params)
        for code in ("NOPE", "grn-not-billed", "DROP_TABLE", "1"):
            assert (await ac.get(f"{API}/exceptions/{code}")).status_code == 404, code
        assert (await ac.get(f"{API}/exceptions/grn_not_billed", params={"as_of_date": AS_OF})).status_code == 200


# ---- existing exception endpoints unchanged ------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_existing_exception_endpoints_still_work(db_session_integration):
    db = db_session_integration
    tenant, user, _w = await seed_control_world(db)
    async with api_client(db, tenant, user) as ac:
        grn = (await ac.get("/api/v1/finance/exceptions/grn-not-billed")).json()
        challan = (await ac.get("/api/v1/finance/exceptions/challan-not-invoiced")).json()
        stock = (await ac.get("/api/v1/finance/exceptions/negative-stock")).json()
        summary = (await ac.get("/api/v1/finance/exceptions/summary", params={"as_of_date": AS_OF})).json()
    assert grn["total"] == 2 and challan["total"] == 2 and stock["total"] == 1 and stock["rows"][0]["on_hand"] == -3.0
    assert summary["counts"]["grn_not_billed"] == 2 and summary["counts"]["negative_stock"] == 1


# ---- query counts (acceptance 3.10) -------------------------------------------------------------------------------------------------------
@pytest.mark.asyncio
async def test_query_counts_do_not_grow_with_rows(db_session_integration):
    db = db_session_integration
    tenant, user, w = await seed_control_world(db)
    t, L = tenant.id, w["ledgers"]

    async def measure() -> dict[str, int]:
        counts: dict[str, int] = {}
        async with api_client(db, tenant, user) as ac:
            with QueryCounter(db) as qc:
                r = await ac.get(API, params={"as_of_date": AS_OF})
            assert r.status_code == 200, r.text
            counts["tower"] = qc.count
            for code in ALL_CODES:
                with QueryCounter(db) as qc:
                    r = await ac.get(f"{API}/exceptions/{code}", params={"as_of_date": AS_OF, "limit": 500})
                assert r.status_code == 200, (code, r.text)
                counts[code] = qc.count
        return counts

    small = await measure()
    vendor, item, wh = w["vendor"], w["item"], w["wh"]
    po, pl = await _po_line(db, t, vendor, item, wh, price="10", qty="1000")
    cust = await make_customer(db, t, "Bulk buyer")
    for i in range(30):
        grn, gi = await _grn(db, t, vendor, po, pl, item, wh, qty="3", received=date(2027, 1, 1 + i % 20))
        await _bill(db, t, vendor, grn, gi, pl, price="900", qty="3", item=item)  # also a variance + a billed GRN
        await _grn(db, t, vendor, po, pl, item, wh, qty="2", received=date(2027, 1, 1 + i % 20))  # one more unbilled GRN
        db.add(DeliveryChallan(tenant_id=t, challan_code=f"DC-{uid()}", customer_name="B", delivery_date=date(2027, 2, 1 + i % 20), status="POSTED"))
        db.add(OutstandingBill(tenant_id=t, bill_no=f"B-{uid()}-{i}", party_name="P", bill_type="PAYABLE" if i % 2 else "RECEIVABLE",
                               bill_date=date(2027, 1, 1), due_date=date(2027, 2, 1), amount=D("10"), paid_amount=D("0"), status="OPEN"))
        await post_v(db, t, date(2027, 5, 2), [dr(L["rent"], "5"), cr(L["cash"], "5")], status="SUBMITTED")
        old = await post_v(db, t, date(2027, 5, 2), [dr(L["rent"], "5"), cr(L["cash"], "5")], status="DRAFT")
        old.created_at = datetime(2027, 5, 2)
        extra_item, extra_wh, _ = await seed_item(db, t, code=f"NEG-{i}")
        db.add(StockMovement(tenant_id=t, item_id=extra_item.id, warehouse_id=extra_wh.id, movement_type="OUT", quantity=D("1"),
                             movement_date=date(2027, 2, 1), created_at=datetime(2027, 2, 1), reference_type="TEST"))
    await db.flush()
    big = await measure()
    assert big == small, {k: (small[k], big[k]) for k in small if small[k] != big[k]}
    assert big["tower"] <= 70, big["tower"]
    async with api_client(db, tenant, user) as ac:
        grown = await _cards(ac)
    assert grown["GRN_NOT_BILLED"]["count"] == 2 + 30 and grown["VOUCHERS_PENDING_APPROVAL"]["count"] == 4 + 30
    assert grown["NEGATIVE_STOCK"]["count"] == 1 + 30 and grown["VENDOR_BILL_VARIANCE"]["count"] == 3 + 30
