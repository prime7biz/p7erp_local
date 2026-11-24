"""Quotation wiring context (Phase 3): prefill, wiring-context and item price hints.

Run:
    docker compose exec backend pytest tests/test_quotation_wiring_context.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Quotation
from app.models.costing import CurrencyExchangeRate, Item, ItemCategory, ItemUnit
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.models.merch import Bom, BomItem, StyleSizeScale
from tests.merch_fixtures import create_customer, create_garment_style, create_merch_tenant_with_user

API = "/api/v1/quotations"


@asynccontextmanager
async def _api(db: AsyncSession, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test", headers={"X-Tenant-Id": str(tenant.id)}
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


async def _item(db: AsyncSession, tenant, *, unit_code: str = "KG", default_cost: str = "3.5000") -> Item:
    slug = uuid.uuid4().hex[:6]
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}", name=f"Cat {slug}")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"{unit_code}"[:16], name=f"Unit {slug}")
    db.add_all([cat, unit])
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"IT{slug}",
        name=f"Item {slug}",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal(default_cost),
        avg_cost=Decimal("3.250000"),
    )
    db.add(item)
    await db.flush()
    return item


async def _po_line(db: AsyncSession, tenant, item: Item, *, price: str, currency: str, days_ago: int = 1) -> PurchaseOrder:
    slug = uuid.uuid4().hex[:8]
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-{slug}",
        supplier_name="Supplier X",
        status="APPROVED",
        currency=currency,
        order_date=date.today() - timedelta(days=days_ago),
    )
    db.add(po)
    await db.flush()
    db.add(
        PurchaseOrderItem(
            tenant_id=tenant.id,
            purchase_order_id=po.id,
            item_id=item.id,
            quantity=Decimal("10"),
            unit_price=Decimal(price),
        )
    )
    await db.flush()
    return po


async def _quotation(db: AsyncSession, tenant, customer, style=None, **kw) -> Quotation:
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"Q-{uuid.uuid4().hex[:8]}",
        style_id=style.id if style else None,
        status="DRAFT",
        version_no=1,
        currency="USD",
        **kw,
    )
    db.add(q)
    await db.flush()
    return q


@pytest.mark.asyncio
async def test_prefill_route_is_not_swallowed_by_quotation_id_route(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    async with _api(db, tenant, user) as c:
        r = await c.get(f"{API}/prefill-context")
    assert r.status_code == 200, r.text
    assert "omitted" in r.json()


@pytest.mark.asyncio
async def test_prefill_style_bom_and_size_scales(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    db.add(StyleSizeScale(tenant_id=tenant.id, style_id=style.id, scale_name="S-XL", sizes_csv="S, M ,L,XL"))
    bom = Bom(tenant_id=tenant.id, style_id=style.id, status="APPROVED", version_no=1, is_active=True)
    db.add(bom)
    await db.flush()
    db.add(
        BomItem(
            tenant_id=tenant.id,
            bom_id=bom.id,
            category="FABRIC",
            description="Shell",
            uom="KG",
            base_consumption=Decimal("1.250000"),
            wastage_pct=Decimal("5"),
        )
    )
    await db.flush()
    async with _api(db, tenant, user) as c:
        r = await c.get(f"{API}/prefill-context", params={"style_id": style.id, "customer_id": customer.id, "currency": "usd"})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["currency"] == "USD"
    assert body["style"]["id"] == style.id and body["customer"]["id"] == customer.id
    assert body["style_size_scales"][0]["sizes"] == ["S", "M", "L", "XL"]
    line = body["style_bom"]["lines"][0]
    assert line["base_consumption"] == "1.250000" and line["wastage_pct"] == "5.0000"
    # Flags are off: planning and CPM are omitted with a reason, not an error.
    assert body["omitted"]["style_planning"].startswith("FLAG_OFF")
    assert body["omitted"]["factory_cpm"].startswith("FLAG_OFF")
    assert "factory_cpm" not in body and "style_planning" not in body


@pytest.mark.asyncio
async def test_prefill_cross_tenant_ids_look_not_found(db_session_integration):
    db = db_session_integration
    ta, ua, _ = await create_merch_tenant_with_user(db)
    tb, _ub, _ = await create_merch_tenant_with_user(db)
    other_customer = await create_customer(db, tb)
    other_style = await create_garment_style(db, tb, other_customer)
    async with _api(db, ta, ua) as c:
        r1 = await c.get(f"{API}/prefill-context", params={"style_id": other_style.id})
        r2 = await c.get(f"{API}/prefill-context", params={"customer_id": other_customer.id})
    assert r1.status_code == 404 and r2.status_code == 404


@pytest.mark.asyncio
async def test_wiring_context_cross_tenant_quotation_is_404(db_session_integration):
    db = db_session_integration
    ta, ua, _ = await create_merch_tenant_with_user(db)
    tb, _ub, _ = await create_merch_tenant_with_user(db)
    cust_b = await create_customer(db, tb)
    q_b = await _quotation(db, tb, cust_b)
    async with _api(db, ta, ua) as c:
        r = await c.get(f"{API}/{q_b.id}/wiring-context")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_wiring_context_rates_and_flag_gated_blocks(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    tenant.feature_flags = {
        "manufacturing_intelligence_v1": True,
        "mfg_cost_intelligence_v1": True,
        "mfg_integrated_planning_v1": True,
    }
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    q = await _quotation(db, tenant, customer, style)
    db.add(
        CurrencyExchangeRate(
            tenant_id=tenant.id,
            from_currency="USD",
            to_currency="BDT",
            exchange_rate=Decimal("110.500000"),
            effective_date=date.today(),
        )
    )
    other = await create_merch_tenant_with_user(db)
    db.add(
        CurrencyExchangeRate(
            tenant_id=other[0].id,
            from_currency="USD",
            to_currency="BDT",
            exchange_rate=Decimal("999.000000"),
            effective_date=date.today(),
        )
    )
    await db.flush()
    async with _api(db, tenant, user) as c:
        r = await c.get(f"{API}/{q.id}/wiring-context")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["quotation"]["id"] == q.id
    rates = body["exchange_rates"]
    assert [x["exchange_rate"] for x in rates] == ["110.500000"]  # never the other tenant's 999
    assert body["tentative_bookings"] == []
    assert "style_planning" in body and "standard_smv" in body["style_planning"]
    assert "factory_cpm" in body and "reason_codes" in body["factory_cpm"]


@pytest.mark.asyncio
async def test_cpm_omitted_without_finance_gate(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(
        db, permissions={"merch.access": True, "inventory.access": True}
    )
    tenant.feature_flags = {"manufacturing_intelligence_v1": True, "mfg_cost_intelligence_v1": True}
    await db.flush()
    async with _api(db, tenant, user) as c:
        r = await c.get(f"{API}/prefill-context")
    body = r.json()
    assert r.status_code == 200
    assert "factory_cpm" not in body
    assert body["omitted"]["factory_cpm"] == "NO_PERMISSION:finance"


@pytest.mark.asyncio
async def test_rbac_enforced_omits_inventory_and_production_blocks(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db, permissions={"merch.access": True})
    tenant.feature_flags = {"rbac_enforcement": "enforce", "mfg_integrated_planning_v1": True}
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    q = await _quotation(db, tenant, customer, style)
    await db.flush()
    async with _api(db, tenant, user) as c:
        r = await c.get(f"{API}/{q.id}/wiring-context")
        hints = await c.get(f"{API}/item-price-hints", params={"item_ids": "1,2"})
    body = r.json()
    assert r.status_code == 200, r.text
    assert body["omitted"]["style_planning"] == "NO_PERMISSION:production.access"
    assert body["omitted"]["tentative_bookings"] == "NO_PERMISSION:production.access"
    assert body["omitted"]["material_price_hints"] == "NO_PERMISSION:inventory.access"
    assert hints.status_code == 200
    assert hints.json() == {"items": [], "omitted": {"item_price_hints": "NO_PERMISSION:inventory.access"}}


@pytest.mark.asyncio
async def test_item_price_hints_comparable_only_when_uom_and_currency_match(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    item = await _item(db, tenant, unit_code="KG")
    await _po_line(db, tenant, item, price="4.0000", currency="USD", days_ago=30)
    await _po_line(db, tenant, item, price="4.5000", currency="USD", days_ago=2)  # newest wins
    no_po = await _item(db, tenant, unit_code="MTR")
    async with _api(db, tenant, user) as c:
        ok = await c.get(f"{API}/item-price-hints", params={"item_ids": f"{item.id},{no_po.id}", "currency": "usd", "uom": "kg"})
        bad_ccy = await c.get(f"{API}/item-price-hints", params={"item_ids": str(item.id), "currency": "EUR", "uom": "KG"})
        bad_uom = await c.get(f"{API}/item-price-hints", params={"item_ids": str(item.id), "currency": "USD", "uom": "MTR"})
        bare = await c.get(f"{API}/item-price-hints", params={"item_ids": str(item.id)})
    by_id = {x["item_id"]: x for x in ok.json()["items"]}
    assert by_id[item.id]["last_po"]["unit_price"] == "4.5000"
    assert by_id[item.id]["comparable"] is True
    assert by_id[item.id]["default_cost"] == "3.5000" and by_id[item.id]["avg_cost"] == "3.250000"
    assert by_id[no_po.id]["last_po"] is None and by_id[no_po.id]["comparable_reason"] == "NO_PO_PRICE"
    assert bad_ccy.json()["items"][0]["comparable_reason"] == "CURRENCY_MISMATCH"
    assert bad_uom.json()["items"][0]["comparable_reason"] == "UOM_MISMATCH"
    assert bare.json()["items"][0]["comparable"] is False


@pytest.mark.asyncio
async def test_item_price_hints_validation_and_cross_tenant(db_session_integration):
    db = db_session_integration
    ta, ua, _ = await create_merch_tenant_with_user(db)
    tb, _ub, _ = await create_merch_tenant_with_user(db)
    foreign = await _item(db, tb)
    await _po_line(db, tb, foreign, price="1.0000", currency="USD")
    async with _api(db, ta, ua) as c:
        too_many = await c.get(f"{API}/item-price-hints", params={"item_ids": ",".join(str(i) for i in range(1, 102))})
        junk = await c.get(f"{API}/item-price-hints", params={"item_ids": "a,b"})
        empty = await c.get(f"{API}/item-price-hints", params={"item_ids": ","})
        cross = await c.get(f"{API}/item-price-hints", params={"item_ids": str(foreign.id)})
    assert too_many.status_code == 422 and junk.status_code == 422 and empty.status_code == 422
    assert cross.status_code == 200 and cross.json()["items"] == []  # foreign item looks absent
