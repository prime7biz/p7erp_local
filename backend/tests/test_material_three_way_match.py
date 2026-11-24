"""Soft 3-way match (PO vs GRN vs VendorBill) — warn only.

Run: docker compose exec -T backend pytest tests/test_material_three_way_match.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.finance import VendorBill, VendorBillLine
from app.models.inventory import GoodsReceiving, GoodsReceivingItem

from tests.go_live_fixtures import seed_inventory_chain

API = "/api/v1/material-control"


async def _api_client(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Tenant-Id": str(tenant.id)},
    )


def _clear():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_three_way_flag_off_404(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.get(f"{API}/three-way-match")
            assert res.status_code == 404
    finally:
        _clear()


@pytest.mark.asyncio
async def test_three_way_missing_bill_warn(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_control_hub_v1"] = True
    tenant.feature_flags = flags

    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code="GRN-3WAY-01",
        status="POSTED",
        default_warehouse_id=wh.id,
        vendor_id=_vendor.id,
    )
    db.add(grn)
    await db.flush()
    db.add(
        GoodsReceivingItem(
            tenant_id=tenant.id,
            goods_receiving_id=grn.id,
            item_id=item.id,
            warehouse_id=wh.id,
            quantity=Decimal("10"),
            accepted_qty="10",
            unit_price="5",
            accepted_value="50",
        )
    )
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            detail = await ac.get(f"{API}/three-way-match/{grn.id}")
            assert detail.status_code == 200, detail.text
            body = detail.json()
            assert body["warn_only"] is True
            assert body["status"] == "MISSING_BILL"
            assert body["lines"][0]["status"] == "MISSING_BILL"

            listed = await ac.get(f"{API}/three-way-match")
            assert listed.status_code == 200
            codes = [x["grn_code"] for x in listed.json()["items"]]
            assert "GRN-3WAY-01" in codes
    finally:
        _clear()


@pytest.mark.asyncio
async def test_three_way_qty_warn_when_bill_differs(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_inbound_v2"] = True
    tenant.feature_flags = flags

    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code="GRN-3WAY-02",
        status="POSTED",
        default_warehouse_id=wh.id,
        vendor_id=vendor.id,
    )
    db.add(grn)
    await db.flush()
    gri = GoodsReceivingItem(
        tenant_id=tenant.id,
        goods_receiving_id=grn.id,
        item_id=item.id,
        warehouse_id=wh.id,
        quantity=Decimal("10"),
        accepted_qty="10",
        unit_price="5",
        accepted_value="50",
    )
    db.add(gri)
    await db.flush()

    bill = VendorBill(
        tenant_id=tenant.id,
        bill_code="VB-3WAY-01",
        vendor_id=vendor.id,
        status="DRAFT",
        goods_receiving_id=grn.id,
        total_amount=Decimal("40"),
    )
    db.add(bill)
    await db.flush()
    db.add(
        VendorBillLine(
            tenant_id=tenant.id,
            vendor_bill_id=bill.id,
            goods_receiving_item_id=gri.id,
            item_id=item.id,
            quantity=Decimal("8"),
            unit_price=Decimal("5"),
            line_total=Decimal("40"),
        )
    )
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            detail = await ac.get(f"{API}/three-way-match/{grn.id}")
            assert detail.status_code == 200, detail.text
            body = detail.json()
            assert body["status"] in ("QTY_WARN", "VALUE_WARN")
            assert "QTY_BILL_VS_GRN" in body["lines"][0]["flags"]
    finally:
        _clear()


@pytest.mark.asyncio
async def test_three_way_cross_tenant_grn_404(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, *_ = await seed_inventory_chain(db)
    tenant_b, _user_b, wh_b, *_ = await seed_inventory_chain(db)
    flags = dict(tenant_a.feature_flags or {})
    flags["material_control_hub_v1"] = True
    tenant_a.feature_flags = flags

    grn_b = GoodsReceiving(
        tenant_id=tenant_b.id,
        grn_code="GRN-OTHER-3WAY",
        status="POSTED",
        default_warehouse_id=wh_b.id,
    )
    db.add(grn_b)
    await db.commit()

    try:
        async with await _api_client(db, tenant_a, user_a) as ac:
            res = await ac.get(f"{API}/three-way-match/{grn_b.id}")
            assert res.status_code == 404
    finally:
        _clear()
