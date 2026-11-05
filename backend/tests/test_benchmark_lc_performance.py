"""Roadmap item 16: LC performance dashboard (LC value -> shipped -> realised, BTB, expiry flags).

Run: docker compose exec backend pytest tests/test_benchmark_lc_performance.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest

from app.models.commercial import (
    BtbLc,
    CommercialInvoice,
    CommercialInvoiceLine,
    CommercialInvoiceReceiptAllocation,
    MasterContract,
)
from app.models.finance import Voucher
from app.models.merch import Order
from tests.benchmark_fixtures import api_client, seed_tenant_admin
from tests.merch_fixtures import create_customer


@pytest.mark.asyncio
async def test_lc_performance_numbers_and_flags(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    t = tenant.id
    customer = await create_customer(db, tenant)
    today = date.today()
    mc = MasterContract(tenant_id=t, reference="LC-PERF-1", lc_number="EXP-001", status="ACTIVE", amount=Decimal("100000"),
                        currency="USD", buyer_name="Buyer A", expiry_date=today + timedelta(days=20))
    idle = MasterContract(tenant_id=t, reference="LC-PERF-2", status="ACTIVE", amount=Decimal("5000"), currency="EUR",
                          expiry_date=today + timedelta(days=200))
    cancelled = MasterContract(tenant_id=t, reference="LC-PERF-X", status="CANCELLED", amount=Decimal("1"), currency="USD")
    db.add_all([mc, idle, cancelled])
    await db.flush()
    order = Order(tenant_id=t, customer_id=customer.id, order_code=f"LCP-{uuid.uuid4().hex[:6]}", master_contract_id=mc.id)
    db.add(order)
    await db.flush()
    inv = CommercialInvoice(tenant_id=t, invoice_code=f"LCP-CI-{uuid.uuid4().hex[:5]}", customer_id=customer.id,
                            invoice_date=today - timedelta(days=3), currency="USD", total_amount=Decimal("40000"), status="ISSUED")
    draft = CommercialInvoice(tenant_id=t, invoice_code=f"LCP-DR-{uuid.uuid4().hex[:5]}", customer_id=customer.id,
                              currency="USD", total_amount=Decimal("9999"), status="DRAFT")
    db.add_all([inv, draft])
    await db.flush()
    db.add_all([
        CommercialInvoiceLine(tenant_id=t, commercial_invoice_id=inv.id, order_id=order.id, quantity=Decimal("1000"),
                              unit_price=Decimal("40"), line_amount=Decimal("40000")),
        CommercialInvoiceLine(tenant_id=t, commercial_invoice_id=draft.id, order_id=order.id, quantity=Decimal("1"),
                              unit_price=Decimal("9999"), line_amount=Decimal("9999")),
    ])
    v1 = Voucher(tenant_id=t, voucher_number="LCP-R1", voucher_type="RECEIPT", voucher_date=today, status="POSTED")
    v2 = Voucher(tenant_id=t, voucher_number="LCP-R2", voucher_type="RECEIPT", voucher_date=today, status="DRAFT")
    db.add_all([v1, v2])
    await db.flush()
    db.add_all([
        CommercialInvoiceReceiptAllocation(tenant_id=t, commercial_invoice_id=inv.id, voucher_id=v1.id,
                                           allocated_amount=Decimal("25000"), status="POSTED"),
        CommercialInvoiceReceiptAllocation(tenant_id=t, commercial_invoice_id=inv.id, voucher_id=v2.id,
                                           allocated_amount=Decimal("5000"), status="PENDING"),
        BtbLc(tenant_id=t, master_contract_id=mc.id, reference="BTB-1", status="OPEN", amount=Decimal("80000"), currency="USD"),
    ])
    await db.flush()
    await db.commit()

    async with api_client(db, tenant, user) as ac:
        r = await ac.get("/api/v1/commercial/lc-performance")
    assert r.status_code == 200, r.text
    data = r.json()
    by_ref = {row["reference"]: row for row in data["rows"]}
    assert "LC-PERF-X" not in by_ref

    row = by_ref["LC-PERF-1"]
    assert row["shipped"] == "40000.00" and row["shipped_pct"] == 40.0
    assert row["realised"] == "25000.00" and row["realisation_pending"] == "5000.00"
    assert row["outstanding"] == "15000.00" and row["unshipped"] == "60000.00"
    assert row["btb_opened"] == "80000.00" and row["btb_pct_of_lc"] == 80.0
    assert row["invoice_count"] == 1
    assert set(row["flags"]) == {"EXPIRING_UNSHIPPED", "BTB_ABOVE_75PCT"}

    assert by_ref["LC-PERF-2"]["shipped"] == "0.00" and by_ref["LC-PERF-2"]["flags"] == []
    totals = {tt["currency"]: tt for tt in data["totals_by_currency"]}
    assert totals["USD"]["lc_value"] == "100000.00" and totals["EUR"]["lc_value"] == "5000.00"
