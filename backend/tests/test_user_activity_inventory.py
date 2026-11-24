"""Inventory User Activity: PO, GRN, transfer, adjustment write document history rows.

Run:
  docker compose exec backend pytest tests/test_user_activity_inventory.py -q
"""

from __future__ import annotations

from datetime import date
import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AuditLog, Warehouse
from tests.go_live_fixtures import seed_inventory_chain


@pytest.mark.asyncio
async def test_po_and_grn_create_write_activity(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)

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
        headers = {"X-Tenant-Id": str(tenant.id)}
        today = str(date.today())
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                headers=headers,
                json={
                    "vendor_id": vendor.id,
                    "supplier_name": vendor.name,
                    "order_date": today,
                    "status": "DRAFT",
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "10",
                            "unit_price": "2",
                        }
                    ],
                },
            )
            assert po.status_code == 200, po.text
            po_id = po.json()["id"]

            po_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "purchase_order.created",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"purchase_order:{po_id}" for r in po_rows)

            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                headers=headers,
                json={
                    "purchase_order_id": po_id,
                    "received_date": today,
                    "default_warehouse_id": wh.id,
                },
            )
            assert grn.status_code == 200, grn.text
            grn_id = grn.json()["id"]

            grn_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "goods_receiving.created",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"goods_receiving:{grn_id}" for r in grn_rows)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_transfer_and_adjustment_write_activity(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    wh2 = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"WH{uuid.uuid4().hex[:4]}",
        name="Secondary WH",
        is_active=True,
    )
    db.add(wh2)
    await db.flush()

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
        headers = {"X-Tenant-Id": str(tenant.id)}
        today = str(date.today())
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            xfer = await ac.post(
                "/api/v1/inventory/warehouse-transfers",
                headers=headers,
                json={
                    "from_warehouse_id": wh.id,
                    "to_warehouse_id": wh2.id,
                    "transfer_date": today,
                    "items": [{"item_id": item.id, "quantity": "1"}],
                },
            )
            assert xfer.status_code == 200, xfer.text
            xfer_id = xfer.json()["id"]

            xfer_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "warehouse_transfer.created",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"warehouse_transfer:{xfer_id}" for r in xfer_rows)

            adj = await ac.post(
                "/api/v1/inventory/stock-adjustments",
                headers=headers,
                json={
                    "warehouse_id": wh.id,
                    "item_id": item.id,
                    "quantity": "5",
                    "reason_code": "OTHER",
                    "adjustment_date": today,
                },
            )
            assert adj.status_code == 200, adj.text
            adj_id = adj.json()["id"]

            adj_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "stock_adjustment.created",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"stock_adjustment:{adj_id}" for r in adj_rows)

            posted = await ac.post(
                f"/api/v1/inventory/stock-adjustments/{adj_id}/post",
                headers=headers,
            )
            assert posted.status_code == 200, posted.text

            post_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "stock_adjustment.posted",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"stock_adjustment:{adj_id}" for r in post_rows)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_challan_and_gate_pass_write_activity(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)

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
        headers = {"X-Tenant-Id": str(tenant.id)}
        today = str(date.today())
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            dc = await ac.post(
                "/api/v1/inventory/delivery-challans",
                headers=headers,
                json={
                    "customer_name": "Activity Buyer",
                    "delivery_date": today,
                    "status": "DRAFT",
                    "items": [{"item_id": item.id, "warehouse_id": wh.id, "quantity": "1"}],
                },
            )
            assert dc.status_code == 200, dc.text
            dc_id = dc.json()["id"]

            dc_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "delivery_challan.created",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"delivery_challan:{dc_id}" for r in dc_rows)

            gp = await ac.post(
                "/api/v1/inventory/enhanced-gate-passes",
                headers=headers,
                json={"purpose": "Delivery", "challan_id": dc_id, "status": "DRAFT"},
            )
            assert gp.status_code == 200, gp.text
            gp_id = gp.json()["id"]

            gp_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "gate_pass.created",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"gate_pass:{gp_id}" for r in gp_rows)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
