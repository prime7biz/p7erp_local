"""Regression tests: client-supplied related-record IDs must belong to the caller's tenant.

Each case checks that a cross-tenant ID is rejected, nothing is persisted, and the same operation
with the caller's own record still works.

Run: docker compose exec backend pytest tests/test_tenant_ownership_regressions.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import SERIAL_TRACKING_ENABLED
from app.database import get_db
from app.main import app
from app.models import (
    AccountGroup,
    Bom,
    BomItem,
    BtbLc,
    ChartOfAccount,
    CuttingBundle,
    DeliveryChallan,
    DeliveryChallanItem,
    Item,
    ItemCategory,
    ItemUnit,
    LayPlan,
    ManufacturingMaterialIssue,
    ManufacturingWorkOrder,
    MarkerPlan,
    MasterContract,
    OperationBulletin,
    PurchaseOrder,
    SewingLine,
    SewingLineStyleConfig,
    StockMovement,
    StockSerial,
    Voucher,
)
from app.models.inventory import Vendor, Warehouse
from app.modules.facility.router import _validate_facility_links
from app.modules.inventory import serial_tracking_service
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


async def _master_data(db, tenant):
    slug = uuid.uuid4().hex[:8]
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Cat")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Pcs")
    db.add_all([cat, unit])
    await db.flush()
    wh = Warehouse(tenant_id=tenant.id, warehouse_code=f"W{slug}"[:10], name=f"WH {slug}", is_store=True)
    vendor = Vendor(tenant_id=tenant.id, vendor_code=f"V{slug}"[:12], name=f"Vendor {slug}")
    db.add_all([wh, vendor])
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"IT{slug}"[:20],
        name=f"Item {slug}",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("1"),
        default_warehouse_id=wh.id,
    )
    db.add(item)
    await db.flush()
    return {"wh": wh, "vendor": vendor, "item": item}


async def _two_tenants(db):
    t_a, _u_a, _ = await create_merch_tenant_with_user(db)
    t_b, u_b, _ = await create_merch_tenant_with_user(db)
    return t_a, t_b, u_b


async def _order_for(db, tenant):
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    return order, style


@asynccontextmanager
async def _client(db, tenant, user):
    async def o_db():
        yield db

    async def o_user():
        return user

    async def o_tenant():
        return tenant

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = o_user
    app.dependency_overrides[require_tenant] = o_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def _count(db, model, *where) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*where))).scalar() or 0)


# --- Order-BOM lines (item, preferred vendor) ---


@pytest.mark.asyncio
async def test_order_bom_line_rejects_foreign_item_and_vendor(db_session_integration):
    db = db_session_integration
    t_a, t_b, u_b = await _two_tenants(db)
    a = await _master_data(db, t_a)
    b = await _master_data(db, t_b)
    order_b, style_b = await _order_for(db, t_b)
    bom = Bom(
        tenant_id=t_b.id, style_id=style_b.id, order_id=order_b.id, status="DRAFT",
        is_legacy=False, is_active=True, order_qty_snapshot=100, bom_code=f"OB-{uuid.uuid4().hex[:8]}",
    )
    db.add(bom)
    await db.commit()
    line_body = {"description": "x", "uom": "PCS", "bom_net_consumption_per_unit": 1}
    async with _client(db, t_b, u_b) as c:
        r_bad = await c.post(f"/api/v1/merch/order-boms/{bom.id}/lines", json={**line_body, "item_id": a["item"].id})
        assert r_bad.status_code == 400, r_bad.text
        assert await _count(db, BomItem, BomItem.bom_id == bom.id) == 0

        r_ok = await c.post(f"/api/v1/merch/order-boms/{bom.id}/lines", json={**line_body, "item_id": b["item"].id})
        assert r_ok.status_code == 201, r_ok.text
        line_id = r_ok.json()["id"]

        r_patch_bad = await c.patch(
            f"/api/v1/merch/order-boms/{bom.id}/lines/{line_id}", json={"preferred_vendor_id": a["vendor"].id}
        )
        assert r_patch_bad.status_code == 400, r_patch_bad.text
        r_patch_item_bad = await c.patch(f"/api/v1/merch/order-boms/{bom.id}/lines/{line_id}", json={"item_id": a["item"].id})
        assert r_patch_item_bad.status_code == 400, r_patch_item_bad.text
        line = await db.get(BomItem, line_id)
        await db.refresh(line)
        assert line.preferred_vendor_id is None and line.item_id == b["item"].id

        r_patch_ok = await c.patch(
            f"/api/v1/merch/order-boms/{bom.id}/lines/{line_id}", json={"preferred_vendor_id": b["vendor"].id}
        )
        assert r_patch_ok.status_code == 200, r_patch_ok.text


# --- Cutting chain (marker -> lay -> cut ticket -> bundles) ---


@pytest.mark.asyncio
async def test_cutting_chain_rejects_foreign_links(db_session_integration):
    db = db_session_integration
    t_a, t_b, u_b = await _two_tenants(db)
    order_a, style_a = await _order_for(db, t_a)
    order_b, style_b = await _order_for(db, t_b)
    marker_a = MarkerPlan(tenant_id=t_a.id, order_id=order_a.id, style_id=style_a.id, marker_code="MK-A", status="draft")
    db.add(marker_a)
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        r = await c.post("/api/v1/production/cutting/marker-plans", json={"marker_code": "MK-B", "order_id": order_a.id})
        assert r.status_code == 400, r.text
        r = await c.post("/api/v1/production/cutting/lay-plans", json={"marker_plan_id": marker_a.id, "lay_code": "L-B"})
        assert r.status_code == 400, r.text
        assert await _count(db, LayPlan, LayPlan.tenant_id == t_b.id) == 0

        r = await c.post(
            "/api/v1/production/cutting/marker-plans",
            json={"marker_code": "MK-B", "order_id": order_b.id, "style_id": style_b.id},
        )
        assert r.status_code == 200, r.text
        r = await c.post("/api/v1/production/cutting/lay-plans", json={"marker_plan_id": r.json()["id"], "lay_code": "L-B"})
        assert r.status_code == 200, r.text
        r = await c.post("/api/v1/production/cutting/cut-tickets", json={"lay_plan_id": r.json()["id"], "ticket_code": "CT-B"})
        assert r.status_code == 200, r.text
        r = await c.post(
            f"/api/v1/production/cutting/cut-tickets/{r.json()['id']}/generate-bundles",
            json={"lines": [{"size": "M", "qty_in_bundle": 5}]},
        )
        assert r.status_code == 200, r.text
    assert await _count(db, CuttingBundle, CuttingBundle.tenant_id == t_b.id, CuttingBundle.order_id == order_a.id) == 0
    assert await _count(db, CuttingBundle, CuttingBundle.tenant_id == t_b.id, CuttingBundle.order_id == order_b.id) == 1


# --- Plan board (operation bulletin, order, line) ---


@pytest.mark.asyncio
async def test_plan_board_assign_rejects_foreign_bulletin(db_session_integration):
    db = db_session_integration
    t_a, t_b, u_b = await _two_tenants(db)
    _order_a, style_a = await _order_for(db, t_a)
    order_b, style_b = await _order_for(db, t_b)
    ob_a = OperationBulletin(tenant_id=t_a.id, style_id=style_a.id, ob_code="OB-A", total_smv=Decimal("9"))
    ob_b = OperationBulletin(tenant_id=t_b.id, style_id=style_b.id, ob_code="OB-B", total_smv=Decimal("11"))
    line_b = SewingLine(tenant_id=t_b.id, line_code=f"L{uuid.uuid4().hex[:5]}", name="Line B")
    db.add_all([ob_a, ob_b, line_b])
    await db.commit()
    body = {"line_id": line_b.id, "order_id": order_b.id, "start_date": date.today().isoformat(), "planned_qty": 100}
    async with _client(db, t_b, u_b) as c:
        r = await c.post("/api/v1/production/plan-board/assign", json={**body, "ob_id": ob_a.id})
        assert r.status_code == 400, r.text
        assert await _count(db, SewingLineStyleConfig, SewingLineStyleConfig.tenant_id == t_b.id) == 0
        r = await c.post("/api/v1/production/plan-board/assign", json={**body, "ob_id": ob_b.id})
        assert r.status_code == 200, r.text


# --- Purchase order source links (order, BTB LC) ---


@pytest.mark.asyncio
async def test_purchase_order_rejects_foreign_source_links(db_session_integration):
    db = db_session_integration
    t_a, t_b, u_b = await _two_tenants(db)
    order_a, _ = await _order_for(db, t_a)
    order_b, _ = await _order_for(db, t_b)
    b = await _master_data(db, t_b)
    btb_a = BtbLc(tenant_id=t_a.id, reference=f"BTB-{uuid.uuid4().hex[:6]}")
    db.add(btb_a)
    await db.commit()
    line = {"item_id": b["item"].id, "quantity": "10", "unit_price": "1"}
    async with _client(db, t_b, u_b) as c:
        for bad in (
            {"source_order_id": order_a.id},
            {"btb_lc_id": btb_a.id},
            {"items": [{**line, "source_order_id": order_a.id}]},
        ):
            payload = {"vendor_id": b["vendor"].id, "items": [line], **bad}
            r = await c.post("/api/v1/inventory/purchase-orders", json=payload)
            assert r.status_code == 400, r.text
        assert await _count(db, PurchaseOrder, PurchaseOrder.tenant_id == t_b.id) == 0
        r = await c.post(
            "/api/v1/inventory/purchase-orders",
            json={"vendor_id": b["vendor"].id, "source_order_id": order_b.id, "items": [line]},
        )
        assert r.status_code == 200, r.text


# --- Item preferred vendor ---


@pytest.mark.asyncio
async def test_item_preferred_vendor_rejects_foreign_vendor(db_session_integration):
    db = db_session_integration
    t_a, t_b, u_b = await _two_tenants(db)
    a = await _master_data(db, t_a)
    b = await _master_data(db, t_b)
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        r = await c.patch(f"/api/v1/inventory/items/{b['item'].id}", json={"preferred_vendor_id": a["vendor"].id})
        assert r.status_code == 400, r.text
        await db.refresh(b["item"])
        assert b["item"].preferred_vendor_id is None
        r = await c.patch(f"/api/v1/inventory/items/{b['item'].id}", json={"preferred_vendor_id": b["vendor"].id})
        assert r.status_code == 200, r.text


# --- Serial tracking (warehouse, delivery challan line) ---


@pytest.mark.asyncio
async def test_serial_tracking_rejects_foreign_refs_and_trace_works(db_session_integration):
    db = db_session_integration
    t_a, t_b, _u_b = await _two_tenants(db)
    a = await _master_data(db, t_a)
    b = await _master_data(db, t_b)
    t_b.feature_flags = {**(t_b.feature_flags or {}), SERIAL_TRACKING_ENABLED: True}
    dc_a = DeliveryChallan(tenant_id=t_a.id, challan_code=f"DC{uuid.uuid4().hex[:6]}", customer_name="A")
    dc_b = DeliveryChallan(tenant_id=t_b.id, challan_code=f"DC{uuid.uuid4().hex[:6]}", customer_name="B")
    db.add_all([dc_a, dc_b])
    await db.flush()
    dci_a = DeliveryChallanItem(tenant_id=t_a.id, challan_id=dc_a.id, item_id=a["item"].id, warehouse_id=a["wh"].id)
    dci_b = DeliveryChallanItem(tenant_id=t_b.id, challan_id=dc_b.id, item_id=b["item"].id, warehouse_id=b["wh"].id)
    db.add_all([dci_a, dci_b])
    await db.flush()

    bad_sn, ok_sn = f"SN-{uuid.uuid4().hex[:6]}", f"SN-{uuid.uuid4().hex[:6]}"
    res = await serial_tracking_service.import_serials_csv(
        db, t_b, rows=[{"item_id": b["item"].id, "serial_number": bad_sn, "warehouse_id": a["wh"].id}]
    )
    assert res["created"] == 0 and res["errors"]
    assert await _count(db, StockSerial, StockSerial.serial_number == bad_sn) == 0

    res = await serial_tracking_service.import_serials_csv(
        db, t_b, rows=[{"item_id": b["item"].id, "serial_number": ok_sn, "warehouse_id": b["wh"].id}]
    )
    assert res["created"] == 1
    serial = (await db.execute(select(StockSerial).where(StockSerial.serial_number == ok_sn))).scalar_one()

    with pytest.raises(HTTPException) as exc:
        await serial_tracking_service.issue_serials(db, t_b, serial_ids=[serial.id], dc_item_id=dci_a.id)
    assert exc.value.status_code == 400
    await db.refresh(serial)
    assert serial.status == "IN_STOCK" and serial.dc_item_id is None

    await serial_tracking_service.issue_serials(db, t_b, serial_ids=[serial.id], dc_item_id=dci_b.id)
    trace = await serial_tracking_service.trace_serial(db, t_b.id, ok_sn)
    assert trace["warehouse_name"] == b["wh"].name
    assert trace["dc_code"] == dc_b.challan_code


# --- Facility links (BTB LC, master contract) ---


@pytest.mark.asyncio
async def test_facility_links_reject_foreign_btb_and_contract(db_session_integration):
    db = db_session_integration
    t_a, t_b, _u_b = await _two_tenants(db)
    btb_a = BtbLc(tenant_id=t_a.id, reference=f"BTB-{uuid.uuid4().hex[:6]}")
    mc_a = MasterContract(tenant_id=t_a.id, reference=f"MC-{uuid.uuid4().hex[:6]}")
    btb_b = BtbLc(tenant_id=t_b.id, reference=f"BTB-{uuid.uuid4().hex[:6]}")
    db.add_all([btb_a, mc_a, btb_b])
    await db.flush()
    for bad in ({"linked_btb_lc_id": btb_a.id}, {"linked_master_contract_id": mc_a.id}):
        with pytest.raises(HTTPException) as exc:
            await _validate_facility_links(db, t_b.id, bad)
        assert exc.value.status_code == 400
    await _validate_facility_links(db, t_b.id, {"linked_btb_lc_id": btb_b.id})


# --- Manufacturing material return (warehouse) ---


@pytest.mark.asyncio
async def test_manufacturing_return_rejects_foreign_warehouse(db_session_integration):
    db = db_session_integration
    t_a, t_b, u_b = await _two_tenants(db)
    a = await _master_data(db, t_a)
    b = await _master_data(db, t_b)
    wo = ManufacturingWorkOrder(tenant_id=t_b.id, mo_number=f"MO-{uuid.uuid4().hex[:6]}", item_id=b["item"].id)
    db.add(wo)
    await db.flush()
    issue = ManufacturingMaterialIssue(
        tenant_id=t_b.id, work_order_id=wo.id, item_id=b["item"].id, warehouse_id=b["wh"].id, qty_issued=Decimal("5")
    )
    db.add(issue)
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        r = await c.post(
            "/api/v1/manufacturing/execution/material-returns",
            json={"issue_id": issue.id, "qty_returned": 1, "warehouse_id": a["wh"].id},
        )
        assert r.status_code == 400, r.text
        assert await _count(db, StockMovement, StockMovement.tenant_id == t_b.id, StockMovement.reference_type == "MFG_RETURN") == 0
        r = await c.post(
            "/api/v1/manufacturing/execution/material-returns",
            json={"issue_id": issue.id, "qty_returned": 1, "warehouse_id": b["wh"].id},
        )
        assert r.status_code == 201, r.text


# --- Special (memorandum) voucher accounts ---


@pytest.mark.asyncio
async def test_special_voucher_rejects_foreign_account(db_session_integration):
    db = db_session_integration
    t_a, t_b, u_b = await _two_tenants(db)
    t_b.feature_flags = {**(t_b.feature_flags or {}), "memorandum_voucher_enabled": True}
    accounts = {}
    for t in (t_a, t_b):
        grp = AccountGroup(tenant_id=t.id, name="Test", code=f"G{uuid.uuid4().hex[:5]}", nature="asset")
        db.add(grp)
        await db.flush()
        acc = ChartOfAccount(tenant_id=t.id, account_number=f"9{uuid.uuid4().hex[:6]}", name="Acc", group_id=grp.id)
        db.add(acc)
        await db.flush()
        accounts[t.id] = acc.id
    await db.commit()
    lines = [
        {"account_id": accounts[t_b.id], "entry_type": "DEBIT", "amount": "10"},
        {"account_id": accounts[t_a.id], "entry_type": "CREDIT", "amount": "10"},
    ]
    async with _client(db, t_b, u_b) as c:
        r = await c.post(
            "/api/v1/finance/special-vouchers",
            json={"voucher_type": "MEMORANDUM", "voucher_date": date.today().isoformat(), "lines": lines},
        )
        assert r.status_code == 400, r.text
    assert await _count(db, Voucher, Voucher.tenant_id == t_b.id) == 0
