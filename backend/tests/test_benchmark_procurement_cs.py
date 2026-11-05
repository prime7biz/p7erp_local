"""Roadmap item 8: requisition -> quotations -> comparative statement -> PO (flag procurement_cs_enabled).

Run: docker compose exec backend pytest tests/test_benchmark_procurement_cs.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models.inventory import PurchaseOrder, PurchaseOrderItem, Vendor
from app.models.user import Role
from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin

BASE = "/api/v1/procurement"


async def _setup(db, *, flag: bool = True):
    tenant, user = await seed_tenant_admin(db)
    tenant.feature_flags = {"procurement_cs_enabled": flag}
    fabric, wh, _u = await seed_item(db, tenant.id, code="CS-FAB")
    trims, _wh2, _u2 = await seed_item(db, tenant.id, code="CS-TRM", name="Buttons")
    cheap = Vendor(tenant_id=tenant.id, vendor_code="CS-V1", name="Cheap Mills")
    fast = Vendor(tenant_id=tenant.id, vendor_code="CS-V2", name="Fast Mills")
    partial = Vendor(tenant_id=tenant.id, vendor_code="CS-V3", name="Partial Mills")
    db.add_all([cheap, fast, partial])
    await db.flush()
    await db.commit()
    return tenant, user, fabric, trims, wh, cheap, fast, partial


@pytest.mark.asyncio
async def test_full_comparative_statement_flow(db_session_integration):
    db = db_session_integration
    tenant, user, fabric, trims, wh, cheap, fast, partial = await _setup(db)
    async with api_client(db, tenant, user) as ac:
        pr = await ac.post(f"{BASE}/requisitions", json={
            "department": "Merchandising",
            "purpose": "Order 123 fabric",
            "lines": [
                {"item_id": fabric.id, "warehouse_id": wh.id, "quantity": "100"},
                {"item_id": trims.id, "warehouse_id": wh.id, "quantity": "1000"},
            ],
        })
        assert pr.status_code == 201, pr.text
        pr_id = pr.json()["id"]
        l_fab, l_trm = [ln["id"] for ln in pr.json()["lines"]]

        too_early = await ac.post(f"{BASE}/requisitions/{pr_id}/quotations", json={
            "vendor_id": cheap.id, "lines": [{"requisition_line_id": l_fab, "unit_price": "1"}]})
        assert too_early.status_code == 400

        assert (await ac.post(f"{BASE}/requisitions/{pr_id}/status", json={"status": "SUBMITTED"})).status_code == 200
        assert (await ac.post(f"{BASE}/requisitions/{pr_id}/status", json={"status": "APPROVED"})).status_code == 200

        for vendor, fab_price, trm_price in ((cheap, "2.00", "0.05"), (fast, "2.20", "0.05")):
            r = await ac.post(f"{BASE}/requisitions/{pr_id}/quotations", json={
                "vendor_id": vendor.id, "currency": "USD", "delivery_days": 30 if vendor is cheap else 10,
                "lines": [{"requisition_line_id": l_fab, "unit_price": fab_price},
                          {"requisition_line_id": l_trm, "unit_price": trm_price}],
            })
            assert r.status_code == 201, r.text
        r = await ac.post(f"{BASE}/requisitions/{pr_id}/quotations", json={
            "vendor_id": partial.id, "lines": [{"requisition_line_id": l_fab, "unit_price": "1.00"}]})
        assert r.status_code == 201

        cs = (await ac.get(f"{BASE}/requisitions/{pr_id}/comparative-statement")).json()
        by_vendor = {q["vendor_name"]: q for q in cs["quotations"]}
        assert by_vendor["Cheap Mills"]["total"] == 250.0 and by_vendor["Cheap Mills"]["rank"] == 1
        assert by_vendor["Fast Mills"]["total"] == 270.0 and by_vendor["Fast Mills"]["rank"] == 2
        assert by_vendor["Partial Mills"]["is_complete"] is False
        assert cs["lowest_quotation_id"] == by_vendor["Cheap Mills"]["quotation_id"]
        fab_row = next(r for r in cs["rows"] if r["line_id"] == l_fab)
        lowest_cell = next(p for p in fab_row["prices"] if p["is_lowest"])
        assert lowest_cell["quotation_id"] == by_vendor["Partial Mills"]["quotation_id"]

        incomplete = await ac.post(f"{BASE}/requisitions/{pr_id}/select", json={
            "quotation_id": by_vendor["Partial Mills"]["quotation_id"], "reason": "cheapest fabric"})
        assert incomplete.status_code == 400

        no_reason = await ac.post(f"{BASE}/requisitions/{pr_id}/select", json={
            "quotation_id": by_vendor["Fast Mills"]["quotation_id"], "reason": ""})
        assert no_reason.status_code == 422

        sel = await ac.post(f"{BASE}/requisitions/{pr_id}/select", json={
            "quotation_id": by_vendor["Fast Mills"]["quotation_id"], "reason": "Delivers in 10 days; shipment date is tight"})
        assert sel.status_code == 200, sel.text
        assert sel.json()["status"] == "CS_SELECTED"

        po = await ac.post(f"{BASE}/requisitions/{pr_id}/create-po", json={})
        assert po.status_code == 200, po.text
        again = await ac.post(f"{BASE}/requisitions/{pr_id}/create-po", json={})
        assert again.status_code == 409

        detail = (await ac.get(f"{BASE}/requisitions/{pr_id}")).json()

    po_id = po.json()["purchase_order_id"]
    po_row = await db.get(PurchaseOrder, po_id)
    assert po_row.vendor_id == fast.id and po_row.status == "DRAFT" and po_row.currency == "USD"
    assert "comparative statement" in (po_row.notes or "")
    lines = (await db.execute(select(PurchaseOrderItem).where(PurchaseOrderItem.purchase_order_id == po_id))).scalars().all()
    assert sorted((float(ln.quantity), float(ln.unit_price)) for ln in lines) == [(100.0, 2.2), (1000.0, 0.05)]

    assert detail["status"] == "PO_CREATED" and detail["purchase_order_id"] == po_id
    events = [e["event"] for e in detail["history"]]
    assert events[0] == "po_created" and "supplier_selected" in events
    sel_ev = next(e for e in detail["history"] if e["event"] == "supplier_selected")
    assert "not the lowest" in sel_ev["summary"]
    assert sel_ev["reason"].startswith("Delivers in 10 days")


@pytest.mark.asyncio
async def test_flag_off_hides_module(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await _setup(db, flag=False)
    async with api_client(db, tenant, user) as ac:
        r = await ac.get(f"{BASE}/requisitions")
    assert r.status_code == 404


@pytest.mark.asyncio
async def test_only_manager_can_approve_and_select(db_session_integration):
    db = db_session_integration
    tenant, admin, fabric, _trims, wh, cheap, *_ = await _setup(db)
    clerk_role = Role(tenant_id=tenant.id, name="store_clerk", display_name="Clerk", permissions={})
    db.add(clerk_role)
    await db.flush()
    from app.models import User

    clerk = User(tenant_id=tenant.id, role_id=clerk_role.id, username=f"clerk{tenant.id}", email=f"clerk{tenant.id}@e.com",
                 password_hash="x", is_active=True)
    db.add(clerk)
    await db.commit()
    async with api_client(db, tenant, clerk) as ac:
        pr = await ac.post(f"{BASE}/requisitions", json={"lines": [{"item_id": fabric.id, "quantity": "5"}]})
        pr_id = pr.json()["id"]
        assert (await ac.post(f"{BASE}/requisitions/{pr_id}/status", json={"status": "SUBMITTED"})).status_code == 200
        denied = await ac.post(f"{BASE}/requisitions/{pr_id}/status", json={"status": "APPROVED"})
        reject_no_reason = await ac.post(f"{BASE}/requisitions/{pr_id}/status", json={"status": "CANCELLED"})
    assert denied.status_code == 403
    assert reject_no_reason.status_code == 400
