"""Colour × size grid on purchase-order lines (flag po_color_size_matrix_enabled)."""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import PO_COLOR_SIZE_MATRIX_ENABLED
from app.database import get_db
from app.main import app
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain


def _as(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


@pytest.mark.asyncio
async def test_po_color_size_grid(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    po = PurchaseOrder(
        tenant_id=tenant.id, po_code=f"PO-{uuid.uuid4().hex[:6]}", vendor_id=vendor.id, supplier_name=vendor.name, status="DRAFT"
    )
    db.add(po)
    await db.flush()
    line = PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=po.id, item_id=item.id, quantity=Decimal("100"))
    db.add(line)
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    other_tenant.feature_flags = {PO_COLOR_SIZE_MATRIX_ENABLED: True}
    await db.commit()
    ids = {"po": po.id, "line": line.id}
    url = f"/api/v1/inventory/purchase-orders/{ids['po']}/items/{ids['line']}/color-size"
    grid = {
        "colors": [{"name": "Navy"}, {"name": "White"}],
        "sizes": ["S", "M"],
        "cells": [
            {"color": "Navy", "size": "S", "quantity": "30"},
            {"color": "Navy", "size": "M", "quantity": "20.5"},
            {"color": "White", "size": "S", "quantity": "10"},
        ],
    }

    tenant.feature_flags = {PO_COLOR_SIZE_MATRIX_ENABLED: False}
    _as(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get(f"/api/v1/inventory/purchase-orders/{ids['po']}/color-size")
            assert r.status_code == 200, r.text
            assert r.json()["enabled"] is False
            r = await client.put(url, json=grid)
            assert r.status_code == 403

            tenant.feature_flags = {PO_COLOR_SIZE_MATRIX_ENABLED: True}
            await db.commit()

            r = await client.put(url, json=grid)
            assert r.status_code == 200, r.text
            out = r.json()["lines"][0]
            assert out["total"] == "60.5" and out["matches_quantity"] is False
            assert len(out["cells"]) == 4  # full grid incl. zero cell
            assert out["quantity"] == "100"

            bad = {**grid, "cells": grid["cells"] + [{"color": "Red", "size": "S", "quantity": "1"}]}
            r = await client.put(url, json=bad)
            assert r.status_code == 400

            po_row = await db.get(PurchaseOrder, ids["po"])
            po_row.status = "APPROVED"
            await db.commit()
            r = await client.put(url, json=grid)
            assert r.status_code == 409  # approved PO: must match 100
            fixed = {**grid, "cells": [*grid["cells"][:2], {"color": "White", "size": "S", "quantity": "49.5"}]}
            r = await client.put(url, json=fixed)
            assert r.status_code == 200 and r.json()["lines"][0]["matches_quantity"] is True

            po_row = await db.get(PurchaseOrder, ids["po"])
            po_row.status = "CLOSED"
            await db.commit()
            r = await client.put(url, json=fixed)
            assert r.status_code == 409

        _as(db, outsider, other_tenant)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get(f"/api/v1/inventory/purchase-orders/{ids['po']}/color-size")
            assert r.status_code == 404
            r = await client.put(url, json=fixed)
            assert r.status_code == 404
    finally:
        app.dependency_overrides.clear()
