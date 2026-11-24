"""INV-03 residual: PMI lock + negative-stock guard (cannot oversell).

Run: docker compose exec backend pytest tests/test_pmi_concurrent_issue.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import BomItem, InventoryCostLayer, StockMovement
from app.modules.inventory.stock_locks import on_hand_qty_decimal

from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_legacy_bom,
    create_quotation_and_order,
)


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


async def _seed_stock(ac, wh_id: int, item_id: int, qty: str) -> None:
    r = await ac.post(
        "/api/v1/inventory/stock-adjustments",
        json={"warehouse_id": wh_id, "item_id": item_id, "quantity": qty, "reason_code": "COUNT"},
    )
    assert r.status_code == 200, r.text
    r = await ac.post(f"/api/v1/inventory/stock-adjustments/{r.json()['id']}/post")
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_pmi_second_issue_cannot_oversell_when_negative_forbidden(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    tenant.allow_negative_stock = False
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    bom = await create_legacy_bom(db, tenant, style, customer=customer, status="APPROVED")
    bom.order_id = order.id
    bom.order_qty_snapshot = Decimal("100")
    bom.is_active = True
    await db.flush()
    bl = BomItem(
        tenant_id=tenant.id,
        bom_id=bom.id,
        item_id=item.id,
        category="FABRIC",
        base_consumption=Decimal("0.1"),
        required_gross_qty=Decimal("10"),
        bom_gross_consumption_per_unit=Decimal("0.1"),
    )
    db.add(bl)
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            await _seed_stock(ac, wh.id, item.id, "10")
            body = {
                "order_id": order.id,
                "bom_id": bom.id,
                "warehouse_id": wh.id,
                "production_stage": "CUTTING",
                "covered_order_qty": "100",
                "issue_date": str(date.today()),
                "lines": [{"bom_line_id": bl.id, "actual_issue_qty": "10"}],
            }
            ok = await ac.post("/api/v1/inventory/production-material-issues", json=body)
            assert ok.status_code == 201, ok.text

            over = await ac.post(
                "/api/v1/inventory/production-material-issues",
                json={
                    **body,
                    "lines": [{"bom_line_id": bl.id, "actual_issue_qty": "1"}],
                },
            )
            assert over.status_code == 400, over.text
            assert "insufficient" in over.json()["detail"].lower()
    finally:
        _clear()

    on_hand = await on_hand_qty_decimal(db, tenant.id, item.id, wh.id)
    assert on_hand == Decimal("0")
    layers = list(
        (
            await db.execute(
                select(InventoryCostLayer).where(
                    InventoryCostLayer.tenant_id == tenant.id,
                    InventoryCostLayer.item_id == item.id,
                    InventoryCostLayer.warehouse_id == wh.id,
                )
            )
        ).scalars().all()
    )
    assert sum(Decimal(str(x.qty_remaining)) for x in layers) == Decimal("0")
    outs = list(
        (
            await db.execute(
                select(StockMovement).where(
                    StockMovement.tenant_id == tenant.id,
                    StockMovement.reference_type == "PRODUCTION_MATERIAL_ISSUE",
                    StockMovement.movement_type == "OUT",
                )
            )
        ).scalars().all()
    )
    assert len(outs) == 1
