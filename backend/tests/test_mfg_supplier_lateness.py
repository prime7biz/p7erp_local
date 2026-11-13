"""Supplier lateness (plan 15 sections 5.3-5.4, D7-D10, 17.10, 17.16).

Run: docker compose exec -T backend pytest tests/test_mfg_supplier_lateness.py -q
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal as D

import pytest

from app.models.inventory import GoodsReceiving
from app.modules.mfg_intelligence.supplier_lateness_service import load_lateness_model, predicted_receipt
from tests.mfg_alloc_fixtures import add_grn_line, add_item, add_po, add_vendor
from tests.mfg_intel_fixtures import client_for
from tests.mfg_predictive_fixtures import (
    PRED,
    TODAY,
    add_late_history,
    add_supply_basics,
    freeze_today,
    new_predictive_tenant,
)

PROMISE = TODAY - timedelta(days=30)


async def _receive(db, tenant, sb, po, line, qty: str, day: date):
    grn_line = await add_grn_line(db, tenant, po, line, sb.store, received=qty, accepted=qty)
    grn = await db.get(GoodsReceiving, grn_line.goods_receiving_id)
    grn.received_date = day
    await db.flush()


@pytest.mark.asyncio
async def test_in_full_rule_uses_the_receipt_reaching_95_percent(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx = await new_predictive_tenant(db)
    sb = await add_supply_basics(db, tenant)
    po, line = await add_po(db, tenant, sb.vendor, sb.item, "100", status="FULLY_RECEIVED", expected_date=PROMISE)
    await _receive(db, tenant, sb, po, line, "50", PROMISE + timedelta(days=2))
    await _receive(db, tenant, sb, po, line, "50", PROMISE + timedelta(days=5))
    po2, line2 = await add_po(db, tenant, sb.vendor, sb.item, "100", status="CLOSED", expected_date=PROMISE)
    await _receive(db, tenant, sb, po2, line2, "96", PROMISE + timedelta(days=3))  # 96 % = in full
    po3, line3 = await add_po(db, tenant, sb.vendor, sb.item, "100", status="CLOSED", expected_date=PROMISE)
    await _receive(db, tenant, sb, po3, line3, "40", PROMISE - timedelta(days=1))  # closed short: last receipt
    await add_po(db, tenant, sb.vendor, sb.item, "100", status="CLOSED", expected_date=PROMISE)  # no receipt
    model = await load_lateness_model(db, tenant.id, today=TODAY)
    assert sorted(model.tenant.values) == [-1, 3, 5]
    assert model.excluded["CLOSED_NO_RECEIPT"] == 1


@pytest.mark.asyncio
async def test_open_lines_lower_bound_stale_and_not_due(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx = await new_predictive_tenant(db)
    sb = await add_supply_basics(db, tenant)
    await add_po(db, tenant, sb.vendor, sb.item, "100", status="APPROVED", expected_date=TODAY - timedelta(days=10))
    await add_po(db, tenant, sb.vendor, sb.item, "100", status="PARTIALLY_RECEIVED", expected_date=TODAY - timedelta(days=200))
    await add_po(db, tenant, sb.vendor, sb.item, "100", status="APPROVED", expected_date=TODAY + timedelta(days=5))
    await add_po(db, tenant, sb.vendor, sb.item, "100", status="DRAFT", expected_date=TODAY - timedelta(days=10))
    await add_po(db, tenant, sb.vendor, sb.item, "100", status="CANCELLED", expected_date=TODAY - timedelta(days=10))
    await add_po(db, tenant, sb.vendor, sb.item, "100", status="APPROVED", expected_date=None)
    model = await load_lateness_model(db, tenant.id, today=TODAY)
    assert model.tenant.values == [10]
    assert model.tenant.open_lower_bound == 1
    assert model.excluded == {"NOT_DUE": 1, "STALE": 1}


@pytest.mark.asyncio
async def test_hierarchy_needs_five_lines(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx = await new_predictive_tenant(db)
    sb = await add_supply_basics(db, tenant)
    await add_late_history(db, tenant, sb, [1, 2, 3, 4, 10])
    vendor_b = await add_vendor(db, tenant)
    await add_late_history(db, tenant, sb, [20, 20], vendor=vendor_b)
    other_item = await add_item(db, tenant, sb.cat, sb.unit, "TRM")
    model = await load_lateness_model(db, tenant.id, today=TODAY)
    source, group = model.group_for(sb.vendor.id, sb.cat.id)
    assert source == "VENDOR_CATEGORY" and group.n == 5
    assert group.quantile(D("0.5")) == 3 and group.quantile(D("0.9")) == 10
    # vendor B has 2 lines -> its category (7 lines, this tenant only)
    assert model.group_for(vendor_b.id, sb.cat.id)[0] == "CATEGORY"
    assert model.group_for(vendor_b.id, None)[0] == "TENANT"
    assert model.lateness_days(vendor_b.id, sb.cat.id, D("0.9")) == (20, "CATEGORY")
    assert other_item.category_id == sb.cat.id


@pytest.mark.asyncio
async def test_fallback_never_reads_another_tenant(db_session_integration):
    db = db_session_integration
    tenant, _u, _fx = await new_predictive_tenant(db)
    sb = await add_supply_basics(db, tenant)
    await add_late_history(db, tenant, sb, [1, 2])
    other, _u2, _fx2 = await new_predictive_tenant(db)
    sb2 = await add_supply_basics(db, other)
    await add_late_history(db, other, sb2, [30] * 10)
    model = await load_lateness_model(db, tenant.id, today=TODAY)
    assert model.tenant.n == 2
    assert model.group_for(sb.vendor.id, sb.cat.id) == ("UNKNOWN", None)
    assert model.lateness_days(sb.vendor.id, sb.cat.id, D("0.9")) == (0, "UNKNOWN")


def test_predicted_receipt_never_adds_buffer_and_lateness():
    eta = date(2030, 3, 10)
    today = date(2030, 3, 4)
    assert predicted_receipt(eta, "PO_EXPECTED_DATE", today=today, buffer_days=3, lateness_days=5) == date(2030, 3, 15)
    assert predicted_receipt(eta, "PO_EXPECTED_DATE", today=today, buffer_days=3, lateness_days=2) == date(2030, 3, 13)
    assert predicted_receipt(eta, "ORDER_DATE_PLUS_LEAD_TIME", today=today, buffer_days=0, lateness_days=-4) == eta
    assert predicted_receipt(eta, "SUPPLIER_CONFIRMED", today=today, buffer_days=3, lateness_days=9) == date(2030, 3, 13)
    assert predicted_receipt(date(2030, 2, 1), "PO_EXPECTED_DATE", today=today, buffer_days=0, lateness_days=5) == today
    assert predicted_receipt(None, "UNKNOWN", today=today, buffer_days=0, lateness_days=5) is None


@pytest.mark.asyncio
async def test_endpoint_needs_inventory_read_under_rbac_enforce(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    flags = {"manufacturing_intelligence_v1": True, "mfg_predictive_intelligence_v1": True, "rbac_enforcement": "enforce"}
    tenant, user, _fx = await new_predictive_tenant(
        db, flags=flags, permissions={"production.planning.read": True, "inventory.access": False, "inventory.items.read": False}
    )
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{PRED}/supplier-lateness")
        assert r.status_code == 403, r.text
        assert r.json()["detail"] == "Supplier lateness needs inventory read access"
        r = await c.get(f"{PRED}/calibration")  # the planning permission alone opens the other Phase 4 GETs
        assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_endpoint_payload_and_foreign_vendor_is_404(db_session_integration, monkeypatch):
    db = db_session_integration
    freeze_today(monkeypatch)
    tenant, user, _fx = await new_predictive_tenant(db)
    sb = await add_supply_basics(db, tenant)
    await add_late_history(db, tenant, sb, [0, 1, 2, 3, 8])
    other, _u2, _fx2 = await new_predictive_tenant(db)
    sb2 = await add_supply_basics(db, other)
    await db.commit()
    async with client_for(db, tenant, user) as c:
        r = await c.get(f"{PRED}/supplier-lateness")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["promise_basis"] == "CURRENT_EXPECTED_DATE"
        assert body["tenant"] == {"n": 5, "p50_days": 2, "p80_days": 3, "p90_days": 8, "on_time_rate": "0.2000",
                                  "open_late_lower_bound": 0, "sufficient": True}
        assert [v["vendor_id"] for v in body["vendors"]] == [sb.vendor.id]
        r = await c.get(f"{PRED}/supplier-lateness", params={"vendor_id": sb2.vendor.id})
        assert r.status_code == 404
        r = await c.get(f"{PRED}/supplier-lateness", params={"category_id": sb2.cat.id})
        assert r.status_code == 404
