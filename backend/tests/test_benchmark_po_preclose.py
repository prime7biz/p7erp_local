"""Roadmap item 6: pre-close a PO with a reason (kept in the PO history with pending qty).

Run: docker compose exec backend pytest tests/test_benchmark_po_preclose.py -q
"""

from __future__ import annotations

from decimal import Decimal

import pytest

from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin


async def _seed_po(db, tenant_id: int, code: str, status: str = "APPROVED"):
    item, wh, _unit = await seed_item(db, tenant_id, code=f"I-{code}")
    po = PurchaseOrder(tenant_id=tenant_id, po_code=code, supplier_name="Fabric Mills", status=status)
    db.add(po)
    await db.flush()
    db.add(PurchaseOrderItem(tenant_id=tenant_id, purchase_order_id=po.id, item_id=item.id, warehouse_id=wh.id,
                             quantity=Decimal("100"), unit_price=Decimal("2")))
    await db.flush()
    return po


@pytest.mark.asyncio
async def test_close_po_records_reason_and_pending_qty(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    po = await _seed_po(db, tenant.id, "PC-PO-1")
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r = await ac.patch(
            f"/api/v1/inventory/purchase-orders/{po.id}/status",
            json={"status": "CLOSED", "reason": "Supplier cannot ship balance; re-ordering elsewhere"},
        )
        hist = await ac.get(f"/api/v1/inventory/purchase-orders/{po.id}/history")
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CLOSED"
    ev = hist.json()["events"]
    assert len(ev) == 1
    assert ev[0]["to_status"] == "CLOSED" and ev[0]["from_status"] == "APPROVED"
    assert ev[0]["reason"] == "Supplier cannot ship balance; re-ordering elsewhere"
    assert ev[0]["username"] == user.username
    assert ev[0]["extra"]["pending_lines"][0]["pending_qty"] == 100.0


@pytest.mark.asyncio
async def test_bulk_close_without_reason_still_works(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    po1 = await _seed_po(db, tenant.id, "PC-PO-2")
    po2 = await _seed_po(db, tenant.id, "PC-PO-3", status="DRAFT")
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r = await ac.post("/api/v1/inventory/purchase-orders/bulk-status", json={"ids": [po1.id, po2.id], "status": "CLOSED"})
        h1 = await ac.get(f"/api/v1/inventory/purchase-orders/{po1.id}/history")
        h2 = await ac.get(f"/api/v1/inventory/purchase-orders/{po2.id}/history")
    assert r.status_code == 200, r.text
    assert r.json()["updated"] == 1 and len(r.json()["skipped"]) == 1
    assert h1.json()["events"][0]["reason"] is None
    assert h2.json()["events"] == []
