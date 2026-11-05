"""Roadmap item 13: Mushak 6.10 (> BDT 2 lakh), 9.1 draft summary, 6.3 tax invoice data.

Run: docker compose exec backend pytest tests/test_benchmark_mushak.py tests/test_bd_registers.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.common.tenant_feature_keys import BD_BOND_COMPLIANCE_ENABLED, normalize_feature_flags
from app.models.commercial import CommercialInvoice
from app.models.finance import VendorBill
from tests.benchmark_fixtures import api_client
from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import create_customer

BASE = "/api/v1/compliance/bd/mushak"


def test_vat_bin_validated_on_write():
    assert normalize_feature_flags({"vat_bin": "000-123-456-0101"})["vat_bin"] == "0001234560101"
    assert normalize_feature_flags({"vat_bin": ""})["vat_bin"] is None
    for bad in ("12345", "ABC123456789", "12345678901234"):
        with pytest.raises(ValueError):
            normalize_feature_flags({"vat_bin": bad})


@pytest.mark.asyncio
async def test_mushak_6_10_9_1_and_6_3(db_session_integration):
    db = db_session_integration
    tenant, user, _wh, vendor, _item = await seed_inventory_chain(db)
    tenant.feature_flags = {BD_BOND_COMPLIANCE_ENABLED: True, "vat_bin": "0001234560101"}
    customer = await create_customer(db, tenant)
    today = date.today()
    db.add_all([
        VendorBill(tenant_id=tenant.id, bill_code=f"MB-{uuid.uuid4().hex[:6]}", vendor_id=vendor.id, bill_date=today,
                   subtotal_amount=Decimal("300000"), tax_amount=Decimal("45000"), total_amount=Decimal("345000"), status="POSTED"),
        VendorBill(tenant_id=tenant.id, bill_code=f"MB-{uuid.uuid4().hex[:6]}", vendor_id=vendor.id, bill_date=today,
                   subtotal_amount=Decimal("1000"), tax_amount=Decimal("150"), total_amount=Decimal("1150"), status="POSTED"),
    ])
    inv = CommercialInvoice(tenant_id=tenant.id, invoice_code=f"MCI-{uuid.uuid4().hex[:6]}", customer_id=customer.id,
                            invoice_date=today, currency="USD", total_amount=Decimal("5000"),
                            base_total_amount=Decimal("550000"), status="ISSUED")
    db.add(inv)
    await db.flush()
    await db.commit()

    params = {"year": today.year, "month": today.month}
    async with api_client(db, tenant, user) as ac:
        r610 = await ac.get(f"{BASE}/6-10", params=params)
        r91 = await ac.get(f"{BASE}/9-1", params=params)
        r63 = await ac.get(f"{BASE}/6-3/{inv.id}")
        r61 = await ac.get(f"{BASE}/6-1", params=params)
        missing = await ac.get(f"{BASE}/6-3/999999999")

    assert r610.status_code == 200, r610.text
    big = r610.json()
    assert len(big["purchases"]) == 1 and big["purchases"][0]["total"] == "345000.00"
    assert len(big["sales"]) == 1 and big["sales"][0]["invoice_code"] == inv.invoice_code

    s = r91.json()
    assert s["seller_bin"] == "0001234560101"
    lines = {ln["label"]: ln for ln in s["lines"]}
    assert lines["Zero-rated supply — exports"]["value"] == "550000.00"
    assert lines["Purchases with input VAT"]["vat"] == "45150.00"
    assert s["net_vat_payable"] == "0.00" and s["carry_forward_credit"] == "45150.00"

    t = r63.json()
    assert t["form"] == "6.3" and t["seller"]["bin"] == "0001234560101"
    assert t["buyer"]["name"] == customer.name
    assert t["totals"]["total_bdt"] == "550000.00" and t["totals"]["vat"] == "0.00"

    assert r61.json()["totals"]["vat_amount"] == "45150.00"  # existing register unchanged after refactor
    assert missing.status_code == 404
