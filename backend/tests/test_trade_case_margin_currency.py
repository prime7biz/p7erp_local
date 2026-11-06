"""Trade case margin: revenue and cost are both reported in base currency, with warnings for bad PO cost data.

Run in Docker: docker compose exec backend pytest tests/test_trade_case_margin_currency.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.costing import CurrencyExchangeRate
from app.models.inventory import PurchaseOrder, Vendor
from app.models.trade import TradeCase
from tests.benchmark_fixtures import api_client, seed_tenant_admin


async def _vendor(db, tenant_id: int) -> Vendor:
    slug = uuid.uuid4().hex[:6]
    vendor = Vendor(tenant_id=tenant_id, vendor_code=f"V{slug}"[:10], name=f"Mill {slug}")
    db.add(vendor)
    await db.flush()
    return vendor


def _po(tenant_id: int, vendor_id: int, *, currency: str | None, rate: str | None, base: str | None,
        status: str = "APPROVED") -> PurchaseOrder:
    return PurchaseOrder(
        tenant_id=tenant_id,
        po_code=f"PO-{uuid.uuid4().hex[:8]}",
        vendor_id=vendor_id,
        supplier_name="Mill",
        status=status,
        currency=currency,
        exchange_rate_to_base=Decimal(rate) if rate is not None else None,
        base_total_amount=Decimal(base) if base is not None else None,
    )


@pytest.mark.asyncio
async def test_margin_reports_currencies_and_po_cost_counts(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    vendor = await _vendor(db, tenant.id)
    db.add_all(
        [
            _po(tenant.id, vendor.id, currency="BDT", rate=None, base="50000"),
            _po(tenant.id, vendor.id, currency="USD", rate="120", base="24000"),
            _po(tenant.id, vendor.id, currency="BDT", rate=None, base="999", status="DRAFT"),  # not counted
        ]
    )
    db.add(CurrencyExchangeRate(tenant_id=tenant.id, from_currency="USD", to_currency="BDT",
                                exchange_rate=Decimal("120"), effective_date=date(2020, 1, 1), is_active=True))
    tc = TradeCase(tenant_id=tenant.id, reference=f"TC-{uuid.uuid4().hex[:6]}", amount=Decimal("1000"),
                   currency="USD", base_currency="BDT", vendor_id=vendor.id)
    db.add(tc)
    await db.flush()

    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/trade-cases/{tc.id}/margin")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount"] == 1000.0
    assert body["amount_currency"] == "USD"
    assert body["amount_base"] == 120000.0
    assert body["fx_rate_to_base"] == 120.0
    assert body["estimated_cost"] == 74000.0
    assert body["estimated_cost_currency"] == "BDT"
    assert body["margin_currency"] == "BDT"
    assert body["margin_amount"] == 46000.0
    assert body["cost_po_count"] == 2
    assert body["cost_po_missing_base_count"] == 0
    assert body["cost_po_unrated_count"] == 0
    assert body["margin_note"] is None


@pytest.mark.asyncio
async def test_margin_note_warns_about_unrated_and_missing_po_cost(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    vendor = await _vendor(db, tenant.id)
    db.add_all(
        [
            _po(tenant.id, vendor.id, currency="EUR", rate=None, base="300"),  # saved at rate 1
            _po(tenant.id, vendor.id, currency="BDT", rate=None, base=None),  # no base value
            _po(tenant.id, vendor.id, currency=None, rate=None, base="700"),  # no currency = base
        ]
    )
    tc = TradeCase(tenant_id=tenant.id, reference=f"TC-{uuid.uuid4().hex[:6]}", amount=Decimal("5000"),
                   currency="BDT", base_currency="BDT", vendor_id=vendor.id)
    db.add(tc)
    await db.flush()

    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/trade-cases/{tc.id}/margin")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["estimated_cost"] == 1000.0
    assert body["cost_po_count"] == 3
    assert body["cost_po_missing_base_count"] == 1
    assert body["cost_po_unrated_count"] == 1
    assert body["margin_amount"] == 4000.0
    assert "no BDT value" in body["margin_note"]
    assert "no exchange rate" in body["margin_note"]


@pytest.mark.asyncio
async def test_margin_without_cost_source_has_no_cost_currency(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    tc = TradeCase(tenant_id=tenant.id, reference=f"TC-{uuid.uuid4().hex[:6]}", amount=Decimal("10"),
                   currency="EUR", base_currency="BDT")
    db.add(tc)
    await db.flush()

    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"/api/v1/trade-cases/{tc.id}/margin")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["amount_currency"] == "EUR"
    assert body["amount_base"] is None
    assert body["estimated_cost"] is None
    assert body["estimated_cost_currency"] is None
    assert body["cost_po_count"] is None
    assert "No exchange rate from EUR to BDT" in body["margin_note"]
