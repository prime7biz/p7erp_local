"""Roadmap item 4: exception reports (GRN not billed, negative cash/bank, negative stock, overdue).

Run: docker compose exec backend pytest tests/test_benchmark_exception_reports.py -q
"""

from __future__ import annotations

from datetime import timedelta
from decimal import Decimal

import pytest

from app.common.business_date import today_local
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.finance import AccountGroup, ChartOfAccount, OutstandingBill, VendorBill
from app.models.inventory import GoodsReceiving, StockMovement, Vendor, Warehouse
from tests.benchmark_fixtures import api_client, seed_tenant_admin


async def _seed(db):
    tenant, user = await seed_tenant_admin(db)
    t = tenant.id
    vendor = Vendor(tenant_id=t, vendor_code="EXC-V1", name="Exception Supplier")
    db.add(vendor)
    await db.flush()
    grn_open = GoodsReceiving(tenant_id=t, grn_code="EXC-GRN-1", status="RECEIVED", vendor_id=vendor.id,
                              received_date=today_local() - timedelta(days=10))
    grn_billed = GoodsReceiving(tenant_id=t, grn_code="EXC-GRN-2", status="RECEIVED", vendor_id=vendor.id)
    grn_draft = GoodsReceiving(tenant_id=t, grn_code="EXC-GRN-3", status="DRAFT", vendor_id=vendor.id)
    db.add_all([grn_open, grn_billed, grn_draft])
    await db.flush()
    db.add(VendorBill(tenant_id=t, bill_code="EXC-VB-1", vendor_id=vendor.id, goods_receiving_id=grn_billed.id, status="DRAFT"))

    bank_group = AccountGroup(tenant_id=t, name="Bank Accounts", code="EXC-BANK", nature="Asset", is_bank_group=True)
    db.add(bank_group)
    await db.flush()
    db.add(ChartOfAccount(tenant_id=t, account_number="EXC-1001", name="Overdrawn Bank", group_id=bank_group.id,
                          normal_balance="debit", opening_balance=Decimal("-250"), is_bank_account=True))
    db.add(ChartOfAccount(tenant_id=t, account_number="EXC-1002", name="Healthy Bank", group_id=bank_group.id,
                          normal_balance="debit", opening_balance=Decimal("900"), is_bank_account=True))

    cat = ItemCategory(tenant_id=t, category_code="EXC-C", name="Fabric")
    unit = ItemUnit(tenant_id=t, unit_code="EXC-U", name="Yard")
    wh = Warehouse(tenant_id=t, warehouse_code="EXC-W", name="Main store")
    db.add_all([cat, unit, wh])
    await db.flush()
    item = Item(tenant_id=t, item_code="EXC-I1", name="Twill", category_id=cat.id, unit_id=unit.id)
    db.add(item)
    await db.flush()
    db.add_all([
        StockMovement(tenant_id=t, item_id=item.id, warehouse_id=wh.id, movement_type="IN", quantity=Decimal("3")),
        StockMovement(tenant_id=t, item_id=item.id, warehouse_id=wh.id, movement_type="OUT", quantity=Decimal("5")),
    ])

    db.add(OutstandingBill(tenant_id=t, bill_no="EXC-OB-1", party_name="Late Buyer", bill_type="RECEIVABLE",
                           bill_date=today_local() - timedelta(days=60), due_date=today_local() - timedelta(days=30),
                           amount=Decimal("1000"), paid_amount=Decimal("400"), status="PARTIAL"))
    db.add(OutstandingBill(tenant_id=t, bill_no="EXC-OB-2", party_name="Paid Buyer", bill_type="RECEIVABLE",
                           bill_date=today_local() - timedelta(days=60), due_date=today_local() - timedelta(days=30),
                           amount=Decimal("500"), paid_amount=Decimal("500"), status="PAID"))
    await db.flush()
    await db.commit()
    return tenant, user


@pytest.mark.asyncio
async def test_exception_reports_find_each_gap(db_session_integration):
    db = db_session_integration
    tenant, user = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        grn = await ac.get("/api/v1/finance/exceptions/grn-not-billed")
        cash = await ac.get("/api/v1/finance/exceptions/negative-cash-bank")
        stock = await ac.get("/api/v1/finance/exceptions/negative-stock")
        overdue = await ac.get("/api/v1/finance/exceptions/overdue-bills")
        challan = await ac.get("/api/v1/finance/exceptions/challan-not-invoiced")
        summary = await ac.get("/api/v1/finance/exceptions/summary")

    assert grn.status_code == 200, grn.text
    assert [r["grn_code"] for r in grn.json()["rows"]] == ["EXC-GRN-1"]
    assert grn.json()["rows"][0]["days_waiting"] == 10

    assert [r["account_name"] for r in cash.json()["rows"]] == ["Overdrawn Bank"]
    assert cash.json()["rows"][0]["balance"] == -250.0

    stock_rows = stock.json()["rows"]
    assert len(stock_rows) == 1 and stock_rows[0]["on_hand"] == -2.0

    ov = overdue.json()["rows"]
    assert [r["bill_number"] for r in ov] == ["EXC-OB-1"]
    assert ov[0]["amount_due"] == 600.0

    assert challan.status_code == 200 and challan.json()["total"] == 0

    counts = summary.json()["counts"]
    assert counts == {
        "grn_not_billed": 1,
        "challan_not_invoiced": 0,
        "negative_cash_bank": 1,
        "negative_stock": 1,
        "overdue_bills": 1,
    }


@pytest.mark.asyncio
async def test_posted_challan_without_invoice_is_listed(db_session_integration):
    from app.models.inventory import DeliveryChallan

    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    db.add_all([
        DeliveryChallan(tenant_id=tenant.id, challan_code="EXC-DC-1", customer_name="Buyer A", status="POSTED",
                        delivery_date=today_local() - timedelta(days=4)),
        DeliveryChallan(tenant_id=tenant.id, challan_code="EXC-DC-2", customer_name="Buyer B", status="DRAFT"),
    ])
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r = await ac.get("/api/v1/finance/exceptions/challan-not-invoiced")
    assert r.status_code == 200, r.text
    rows = r.json()["rows"]
    assert [x["challan_code"] for x in rows] == ["EXC-DC-1"]
    assert rows[0]["days_waiting"] == 4


@pytest.mark.asyncio
async def test_exception_reports_are_tenant_scoped(db_session_integration):
    db = db_session_integration
    await _seed(db)
    other_tenant, other_user = await seed_tenant_admin(db)
    await db.commit()
    async with api_client(db, other_tenant, other_user) as ac:
        summary = await ac.get("/api/v1/finance/exceptions/summary")
    assert summary.status_code == 200
    assert all(v == 0 for v in summary.json()["counts"].values())
