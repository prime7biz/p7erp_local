"""Party-ledger statement + wastage order detail: batched queries return the same JSON as the old per-row code.

The `_old_*` functions are verbatim copies of the pre-rewrite algorithms (reference only).

Run: docker compose exec backend pytest tests/test_perf_round2_ledger_wastage.py -q -s
"""

from __future__ import annotations

import uuid
from contextlib import contextmanager
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import pytest
from fastapi.encoders import jsonable_encoder
from sqlalchemy import event, func, select

from app.common.tenant_feature_keys import PARTY_LEDGER_ENABLED
from app.models import (
    Bom,
    BomItem,
    Customer,
    GarmentStyle,
    Item,
    ItemCategory,
    Order,
    Quotation,
    StockMovement,
    Tenant,
    User,
    WastageReason,
    WastageTransaction,
)
from app.models.costing import ItemUnit
from app.models.finance import AccountGroup, ChartOfAccount, Voucher
from app.models.party_ledger import PartyLedger, PartyLedgerBill, PartyLedgerBillAllocation
from app.modules.finance.party_ledger_service import _d, _money, get_party_name
from app.modules.merch.bom_utils import get_latest_governed_bom
from app.modules.merch.deps import to_float_safe as _to_float_safe
from app.modules.merch.material_helpers import material_group_from_item
from app.modules.merch.routers.wastage import DEFAULT_WASTAGE_THRESHOLD_PCT
from tests.benchmark_fixtures import api_client, seed_tenant_admin
from tests.query_counting import is_rls_housekeeping

ZERO = Decimal("0")
FROM = date(2026, 6, 1)
TO = date(2026, 6, 30)


@contextmanager
def count_queries(db):
    """Count SQL statements sent to PostgreSQL while the block runs."""
    counter = {"n": 0}
    engine = db.bind.sync_engine

    def _on_execute(_conn, _cursor, statement, *_rest):
        if not is_rls_housekeeping(statement):
            counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


async def _measure(db, tenant_id: int, user_id: int, url: str, params: dict | None = None) -> tuple[int, Any]:
    db.expunge_all()
    tenant = await db.get(Tenant, tenant_id)
    user = await db.get(User, user_id)
    async with api_client(db, tenant, user) as ac:
        with count_queries(db) as counter:
            r = await ac.get(url, params=params or {})
    assert r.status_code == 200, r.text
    return counter["n"], r.json()


# ---------- Old (pre-rewrite) reference: party-ledger statement ----------


async def _old_statement(db, tenant_id, party_ledger_id, from_date=None, to_date=None) -> dict[str, Any]:
    pl = await db.get(PartyLedger, party_ledger_id)
    if to_date is None:
        to_date = date.today()
    if from_date is None:
        from_date = to_date - timedelta(days=90)
    opening = _d(pl.opening_balance)
    if (pl.opening_balance_type or "DR").upper() == "CR":
        opening = -opening
    prior = (
        await db.execute(
            select(PartyLedgerBill).where(
                PartyLedgerBill.party_ledger_id == party_ledger_id,
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.status != "CANCELLED",
                PartyLedgerBill.bill_date < from_date,
            )
        )
    ).scalars().all()
    for bill in prior:
        amt = _d(bill.original_amount)
        if bill.amount_type == "DR":
            opening += amt
        else:
            opening -= amt
        alloc_sum = (
            await db.execute(
                select(func.coalesce(func.sum(PartyLedgerBillAllocation.allocated_amount), 0)).where(
                    PartyLedgerBillAllocation.bill_id == bill.id,
                    PartyLedgerBillAllocation.allocated_date < from_date,
                )
            )
        ).scalar_one()
        settled_prior = _d(alloc_sum)
        if bill.amount_type == "DR":
            opening -= settled_prior
        else:
            opening += settled_prior
    bills = (
        await db.execute(
            select(PartyLedgerBill)
            .where(
                PartyLedgerBill.party_ledger_id == party_ledger_id,
                PartyLedgerBill.tenant_id == tenant_id,
                PartyLedgerBill.status != "CANCELLED",
                PartyLedgerBill.bill_date >= from_date,
                PartyLedgerBill.bill_date <= to_date,
            )
            .order_by(PartyLedgerBill.bill_date.asc(), PartyLedgerBill.id.asc())
        )
    ).scalars().all()
    running = opening
    transactions: list[dict[str, Any]] = []
    for bill in bills:
        debit = _d(bill.original_amount) if bill.amount_type == "DR" else ZERO
        credit = _d(bill.original_amount) if bill.amount_type == "CR" else ZERO
        running = running + debit - credit
        bal_type = "DR" if running >= 0 else "CR"
        transactions.append(
            {
                "date": bill.bill_date.isoformat(),
                "bill_number": bill.bill_number,
                "bill_type": bill.bill_type,
                "narration": bill.narration or "",
                "debit": str(_money(debit)),
                "credit": str(_money(credit)),
                "balance": str(_money(abs(running))),
                "balance_type": bal_type,
                "voucher_id": bill.voucher_id,
                "status": bill.status,
            }
        )
    closing_type = "DR" if running >= 0 else "CR"
    return {
        "party_ledger_id": pl.id,
        "party_name": await get_party_name(db, pl),
        "party_type": pl.party_type,
        "from_date": from_date.isoformat(),
        "to_date": to_date.isoformat(),
        "opening_balance": str(_money(abs(opening))),
        "opening_balance_type": "DR" if opening >= 0 else "CR",
        "transactions": transactions,
        "closing_balance": str(_money(abs(running))),
        "closing_balance_type": closing_type,
    }


# ---------- Seed: party ledger with history ----------


async def _seed_ledger(db, *, prior_bills: int = 6, label: str = "A") -> dict[str, Any]:
    """One customer ledger: `prior_bills` bills before FROM (mixed DR/CR, cancelled, allocations before/after FROM)
    plus a handful inside FROM..TO."""
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {PARTY_LEDGER_ENABLED: True}
    slug = uuid.uuid4().hex[:8]
    group = AccountGroup(tenant_id=tenant.id, name="Debtors", code=f"G{slug}", nature="Asset")
    db.add(group)
    await db.flush()
    cust = Customer(tenant_id=tenant.id, customer_code=f"C{slug}", name=f"Stmt Buyer {label} {slug}")
    db.add(cust)
    await db.flush()
    acct = ChartOfAccount(tenant_id=tenant.id, account_number=f"PL-{slug}", name="Ledger", group_id=group.id,
                          normal_balance="debit")
    db.add(acct)
    await db.flush()
    pl = PartyLedger(
        tenant_id=tenant.id,
        party_type="CUSTOMER",
        customer_id=cust.id,
        ledger_account_id=acct.id,
        opening_balance=Decimal("250.75"),
        opening_balance_type="CR",
        bill_wise_tracking=True,
        is_active=True,
    )
    db.add(pl)
    await db.flush()
    # Allocations are unique per (bill, voucher): one receipt voucher per allocation slot.
    receipts = [
        Voucher(tenant_id=tenant.id, voucher_number=f"RV{n}-{slug}", voucher_type="RECEIPT",
                voucher_date=FROM, status="POSTED")
        for n in range(4)
    ]
    db.add_all(receipts)
    await db.flush()
    receipt = receipts[0]

    seq = 0

    def _bill(bill_date, amount, amount_type="DR", status="PENDING"):
        nonlocal seq
        seq += 1
        return PartyLedgerBill(
            tenant_id=tenant.id,
            party_ledger_id=pl.id,
            bill_number=f"B{seq:03d}-{slug}",
            bill_date=bill_date,
            bill_type="SALE" if amount_type == "DR" else "RECEIPT",
            original_amount=Decimal(amount),
            amount_type=amount_type,
            pending_amount=Decimal(amount),
            settled_amount=ZERO,
            status=status,
            narration=None if seq % 2 else f"Bill {seq}",
            voucher_id=receipt.id if seq % 3 == 0 else None,
        )

    allocs: list[tuple[PartyLedgerBill, Voucher, str, date]] = []
    for k in range(prior_bills):
        amount_type = "CR" if k % 3 == 2 else "DR"
        status = "CANCELLED" if k % 5 == 4 else ("SETTLED" if k % 4 == 1 else "PARTIAL")
        b = _bill(FROM - timedelta(days=10 + k), f"{100 + k * 7}.{k % 10}5", amount_type, status)
        db.add(b)
        await db.flush()
        # Allocations: two before FROM, one on FROM (excluded), one after FROM (excluded).
        allocs.append((b, receipts[0], f"{10 + k}.10", FROM - timedelta(days=5)))
        allocs.append((b, receipts[1], "3.33", FROM - timedelta(days=1)))
        if k % 2 == 0:
            allocs.append((b, receipts[2], "7.00", FROM))
            allocs.append((b, receipts[3], "1.01", FROM + timedelta(days=4)))
    for k, (amt, at, status) in enumerate(
        [("500.00", "DR", "PENDING"), ("120.40", "CR", "PENDING"), ("75.25", "DR", "CANCELLED"), ("1000.00", "CR", "SETTLED")]
    ):
        db.add(_bill(FROM + timedelta(days=k * 3), amt, at, status))
    db.add(_bill(TO + timedelta(days=1), "999.99"))
    await db.flush()
    for bill, voucher, amount, alloc_date in allocs:
        db.add(
            PartyLedgerBillAllocation(
                tenant_id=tenant.id,
                bill_id=bill.id,
                voucher_id=voucher.id,
                allocated_amount=Decimal(amount),
                allocated_date=alloc_date,
                bill_balance_after=ZERO,
            )
        )
    await db.flush()
    return {"tenant": tenant, "user": user, "ledger": pl}


@pytest.mark.asyncio
async def test_party_ledger_statement_matches_old_algorithm(db_session_integration):
    db = db_session_integration
    a = await _seed_ledger(db, label="A")
    b = await _seed_ledger(db, label="B")
    tenant, user, pl = a["tenant"], a["user"], a["ledger"]

    scenarios = [
        {"from_date": FROM.isoformat(), "to_date": TO.isoformat()},
        {"from_date": (FROM - timedelta(days=12)).isoformat(), "to_date": TO.isoformat()},
        {"from_date": (FROM + timedelta(days=5)).isoformat(), "to_date": (TO + timedelta(days=5)).isoformat()},
        {"from_date": (FROM - timedelta(days=400)).isoformat(), "to_date": FROM.isoformat()},
        {"to_date": TO.isoformat()},
    ]
    async with api_client(db, tenant, user) as ac:
        for params in scenarios:
            r = await ac.get(f"/api/v1/finance/party-ledgers/{pl.id}/statement", params=params)
            assert r.status_code == 200, (params, r.text)
            old = await _old_statement(
                db,
                tenant.id,
                pl.id,
                from_date=date.fromisoformat(params["from_date"]) if "from_date" in params else None,
                to_date=date.fromisoformat(params["to_date"]),
            )
            assert r.json() == old, params
        first = (await ac.get(f"/api/v1/finance/party-ledgers/{pl.id}/statement",
                              params=scenarios[0])).json()
        assert first["opening_balance"] != "250.75"
        assert len(first["transactions"]) == 3

        r = await ac.get(f"/api/v1/finance/party-ledgers/{b['ledger'].id}/statement", params=scenarios[0])
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_party_ledger_statement_query_count_constant(db_session_integration):
    db = db_session_integration
    params = {"from_date": FROM.isoformat(), "to_date": TO.isoformat()}
    counts: list[tuple[int, int]] = []
    for n in (4, 20):
        s = await _seed_ledger(db, prior_bills=n, label=f"N{n}")
        url = f"/api/v1/finance/party-ledgers/{s['ledger'].id}/statement"
        new_n, body = await _measure(db, s["tenant"].id, s["user"].id, url, params)
        db.expunge_all()
        with count_queries(db) as c:
            old = await _old_statement(db, s["tenant"].id, s["ledger"].id, FROM, TO)
        assert body == old
        counts.append((c["n"], new_n))
    print(f"\n[party-ledger statement queries] old (4 / 20 prior bills) = {counts[0][0]} / {counts[1][0]}; "
          f"new = {counts[0][1]} / {counts[1][1]}")
    assert counts[0][1] == counts[1][1]
    assert counts[1][0] > counts[0][0]


# ---------- Old (pre-rewrite) reference: wastage order detail ----------


async def _old_wastage_order_detail(db, tenant_id: int, order_id: int) -> dict[str, Any]:
    order = await db.get(Order, order_id)
    customer = await db.get(Customer, order.customer_id)
    buyer_name = customer.name if customer else f"Customer #{order.customer_id}"
    quotation = await db.get(Quotation, order.quotation_id)
    sid = quotation.style_id
    style = await db.get(GarmentStyle, sid)
    style_code = style.style_code if style else str(sid)
    order_qty = _to_float_safe(str(order.quantity)) if order.quantity is not None else 0.0
    bom = await get_latest_governed_bom(db, tenant_id=tenant_id, style_id=sid)
    lines_result = await db.execute(
        select(BomItem).where(BomItem.tenant_id == tenant_id, BomItem.bom_id == bom.id, BomItem.item_id.isnot(None))
    )
    total_expected_value = 0.0
    total_actual_value = 0.0
    bom_lines = []
    for line in lines_result.scalars().all():
        item = await db.get(Item, line.item_id)
        if not item or item.tenant_id != tenant_id:
            continue
        cat = await db.get(ItemCategory, item.category_id) if item.category_id else None
        category = material_group_from_item(item, cat)
        base = _to_float_safe(line.base_consumption)
        wastage_pct_val = _to_float_safe(line.wastage_pct)
        expected = order_qty * base * (1.0 + wastage_pct_val / 100.0)
        act_result = await db.execute(
            select(StockMovement).where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "CONSUMPTION_ISSUE",
                StockMovement.reference_id == order.id,
                StockMovement.item_id == line.item_id,
            )
        )
        actual = sum(
            _to_float_safe(m.quantity) for m in act_result.scalars().all() if (m.movement_type or "").upper() == "OUT"
        )
        variance_qty = actual - expected
        wastage_pct_vs_bom = round((variance_qty / expected * 100.0), 2) if expected > 0 else 0.0
        unit_cost = _to_float_safe(item.default_cost)
        wastage_value = round(max(0.0, variance_qty) * unit_cost, 2)
        total_expected_value += expected * unit_cost
        total_actual_value += actual * unit_cost
        bom_lines.append(
            {
                "item_id": line.item_id,
                "item_code": item.item_code,
                "item_name": item.name or item.description or "",
                "category": category,
                "base_consumption": base,
                "wastage_pct": wastage_pct_val,
                "expected_qty": round(expected, 4),
                "actual_qty": round(actual, 4),
                "variance_qty": round(variance_qty, 4),
                "wastage_pct_vs_bom": wastage_pct_vs_bom,
                "wastage_value": wastage_value,
                "threshold_breach": wastage_pct_vs_bom > DEFAULT_WASTAGE_THRESHOLD_PCT,
            }
        )
    total_wastage_value = round(total_actual_value - total_expected_value, 2)
    if total_wastage_value < 0:
        total_wastage_value = 0.0
    return {
        "order_id": order.id,
        "order_code": order.order_code,
        "style_id": sid,
        "style_code": style_code,
        "buyer_name": buyer_name,
        "bom_lines": bom_lines,
        "total_expected_value": round(total_expected_value, 2),
        "total_actual_value": round(total_actual_value, 2),
        "total_wastage_value": total_wastage_value,
    }


async def _seed_wastage_order(db, tenant, other_tenant, *, extra_lines: int = 0) -> Order:
    """Order with a governed BOM: duplicate item lines, a cross-tenant item, mixed movement types and noise."""
    slug = uuid.uuid4().hex[:6]
    cust = Customer(tenant_id=tenant.id, customer_code=f"WB{slug}", name="Wastage Buyer", status="active")
    style = GarmentStyle(tenant_id=tenant.id, style_code=f"WS{slug}", name="Polo", status="ACTIVE")
    db.add_all([cust, style])
    await db.flush()
    fab = ItemCategory(tenant_id=tenant.id, category_code=f"FAB{slug}", name="Fabric")
    trim = ItemCategory(tenant_id=tenant.id, category_code=f"TRM{slug}", name="Trims")
    other_cat = ItemCategory(tenant_id=other_tenant.id, category_code=f"OC{slug}", name="Other fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}", name="Pcs")
    db.add_all([fab, trim, other_cat, unit])
    await db.flush()

    def _item(code, cat, cost, name="Item", tenant_id=tenant.id):
        return Item(tenant_id=tenant_id, item_code=f"{code}-{slug}", name=name, category_id=cat.id, unit_id=unit.id,
                    default_cost=Decimal(cost))

    i_fab = _item("FAB", fab, "2.5", "Jersey")
    i_trim = _item("TRM", trim, "0.25", "")
    i_odd = _item("ODD", other_cat, "1.1", "Odd category")
    i_none = _item("NOM", fab, "3", "No movements")
    i_foreign = _item("FOR", other_cat, "9", "Foreign", tenant_id=other_tenant.id)
    extra = [_item(f"X{n}", trim if n % 2 else fab, f"0.{n + 1}", f"Extra {n}") for n in range(extra_lines)]
    db.add_all([i_fab, i_trim, i_odd, i_none, i_foreign, *extra])
    await db.flush()

    q = Quotation(tenant_id=tenant.id, customer_id=cust.id, quotation_code=f"Q{uuid.uuid4().hex[:8]}",
                  style_id=style.id, status="NEW", currency="USD")
    db.add(q)
    await db.flush()
    order = Order(tenant_id=tenant.id, customer_id=cust.id, quotation_id=q.id, order_code=f"WO-{slug}",
                  status="CONFIRMED", quantity=120, order_date=date(2026, 10, 1), delivery_date=date(2026, 12, 1))
    other_order = Order(tenant_id=tenant.id, customer_id=cust.id, order_code=f"WX-{slug}", status="CONFIRMED", quantity=5)
    db.add_all([order, other_order])
    await db.flush()

    def _bom(status, version):
        return Bom(tenant_id=tenant.id, style_id=style.id, status=status, is_legacy=True, is_active=True,
                   bom_code=f"BOM-{uuid.uuid4().hex[:8]}", version_no=version)

    old_bom, bom, draft = _bom("APPROVED", 1), _bom("FROZEN", 2), _bom("DRAFT", 3)
    db.add_all([old_bom, bom, draft])
    await db.flush()

    def _bi(b, item, base, wpct):
        return BomItem(tenant_id=tenant.id, bom_id=b.id, item_id=item.id if item else None, category="fabric",
                       base_consumption=Decimal(base), wastage_pct=Decimal(wpct) if wpct is not None else None)

    db.add_all(
        [
            _bi(old_bom, i_fab, "9", "0"),
            _bi(bom, i_fab, "1.5", "4"),
            _bi(bom, i_trim, "2", None),
            _bi(bom, i_fab, "0.25", "2"),
            _bi(bom, i_odd, "0", "0"),
            _bi(bom, i_none, "0.5", "3"),
            _bi(bom, i_foreign, "1", "1"),
            _bi(bom, None, "1", "1"),
            _bi(draft, i_trim, "5", "5"),
            *[_bi(bom, it, "1.1", "5") for it in extra],
        ]
    )

    def _mv(item, qty, mtype="OUT", ref="CONSUMPTION_ISSUE", ref_order=order, tenant_id=tenant.id):
        return StockMovement(tenant_id=tenant_id, item_id=item.id, movement_type=mtype, quantity=Decimal(qty),
                             reference_type=ref, reference_id=ref_order.id)

    db.add_all(
        [
            _mv(i_fab, "100.5"),
            _mv(i_fab, "80.25"),
            _mv(i_fab, "10", mtype="IN"),
            _mv(i_fab, "5", mtype="out"),
            _mv(i_fab, "50", ref="GRN"),
            _mv(i_fab, "40", ref_order=other_order),
            _mv(i_fab, "33", tenant_id=other_tenant.id),
            _mv(i_trim, "300"),
            _mv(i_odd, "2.2"),
            _mv(i_foreign, "7"),
            *[_mv(it, f"{140 + n}.5") for n, it in enumerate(extra)],
        ]
    )
    reason = WastageReason(tenant_id=tenant.id, code=f"cut{slug}", name="Cutting", category="fabric", recoverable=False)
    db.add(reason)
    await db.flush()
    db.add_all(
        [
            WastageTransaction(tenant_id=tenant.id, order_id=order.id, item_id=i_fab.id, process_stage="cutting",
                               reason_id=reason.id, quantity="4", unit_cost="2.5", value="10", recoverable_value="0"),
            WastageTransaction(tenant_id=tenant.id, order_id=order.id, item_id=None, process_stage="sewing",
                               reason_id=None, quantity="1.5", unit_cost="2", value="3", recoverable_value="0"),
        ]
    )
    await db.flush()
    return order


def _detail_core(body: dict[str, Any]) -> dict[str, Any]:
    keys = ("order_id", "order_code", "style_id", "style_code", "buyer_name", "bom_lines",
            "total_expected_value", "total_actual_value", "total_wastage_value")
    return {k: body[k] for k in keys}


@pytest.mark.asyncio
async def test_wastage_order_detail_matches_old_algorithm(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, other_user = await seed_tenant_admin(db)
    order = await _seed_wastage_order(db, tenant, other)
    foreign_order = await _seed_wastage_order(db, other, tenant)

    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/merch/reports/wastage/order/{order.id}")
        assert r.status_code == 200, r.text
        body = r.json()
        old = jsonable_encoder(await _old_wastage_order_detail(db, tenant.id, order.id))
        assert _detail_core(body) == old
        lines = body["bom_lines"]
        assert [ln["item_code"].split("-")[0] for ln in lines] == ["FAB", "TRM", "FAB", "ODD", "NOM"]
        assert lines[0]["actual_qty"] == 185.75
        assert lines[1]["actual_qty"] == 300.0
        assert lines[4]["actual_qty"] == 0.0
        assert {x["process_stage"] for x in body["process_stage_breakdown"]} == {"cutting", "sewing"}

        r = await ac.get(f"/api/v1/merch/reports/wastage/order/{foreign_order.id}")
        assert r.status_code == 404


@pytest.mark.asyncio
async def test_wastage_order_detail_query_count_constant(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, _ = await seed_tenant_admin(db)
    counts: list[tuple[int, int]] = []
    for extra in (0, 12):
        order = await _seed_wastage_order(db, tenant, other, extra_lines=extra)
        new_n, body = await _measure(db, tenant.id, user.id, f"/api/v1/merch/reports/wastage/order/{order.id}")
        db.expunge_all()
        with count_queries(db) as c:
            old = jsonable_encoder(await _old_wastage_order_detail(db, tenant.id, order.id))
        assert _detail_core(body) == old
        counts.append((c["n"], new_n))
    print(f"\n[wastage order detail queries] old (base / +12 BOM lines) = {counts[0][0]} / {counts[1][0]}; "
          f"new = {counts[0][1]} / {counts[1][1]}")
    assert counts[0][1] == counts[1][1]
    assert counts[1][0] > counts[0][0]
