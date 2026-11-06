"""Stock posts lock their document row: a second post is rejected and never moves stock twice.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_posting_locks.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import STOCK_HIERARCHY_ENABLED
from app.database import get_db
from app.main import app
from app.models import InventoryCostLayer, Item, StockMovement, Warehouse
from app.modules.inventory import idt_service
from app.modules.inventory.grn_qc_service import create_inspection
from app.modules.inventory.stock_locks import on_hand_qty_decimal

from tests.go_live_fixtures import seed_inventory_chain
from tests.test_grn_quality_inspection import _make_grn, _seed as _seed_qc


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


def _clear_overrides():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


async def _second_warehouse(db, tenant) -> Warehouse:
    wh2 = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"W2{uuid.uuid4().hex[:4]}",
        name="Second WH",
        is_active=True,
    )
    db.add(wh2)
    await db.flush()
    return wh2


async def _movement_count(db, tenant_id: int, reference_type: str, reference_id: int) -> int:
    return int(
        (
            await db.execute(
                select(func.count())
                .select_from(StockMovement)
                .where(
                    StockMovement.tenant_id == tenant_id,
                    StockMovement.reference_type == reference_type,
                    StockMovement.reference_id == reference_id,
                )
            )
        ).scalar()
        or 0
    )


async def _seed_stock_via_adjustment(ac, wh_id: int, item_id: int, qty: str) -> None:
    r = await ac.post(
        "/api/v1/inventory/stock-adjustments",
        json={"warehouse_id": wh_id, "item_id": item_id, "quantity": qty, "reason_code": "COUNT"},
    )
    assert r.status_code == 200, r.text
    r = await ac.post(f"/api/v1/inventory/stock-adjustments/{r.json()['id']}/post")
    assert r.status_code == 200, r.text


@pytest.mark.asyncio
async def test_adjustment_and_transfer_second_post_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    wh2 = await _second_warehouse(db, tenant)
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            r = await ac.post(
                "/api/v1/inventory/stock-adjustments",
                json={"warehouse_id": wh.id, "item_id": item.id, "quantity": "10", "reason_code": "COUNT"},
            )
            assert r.status_code == 200, r.text
            adj_id = r.json()["id"]
            r = await ac.post(f"/api/v1/inventory/stock-adjustments/{adj_id}/post")
            assert r.status_code == 200, r.text
            r = await ac.post(f"/api/v1/inventory/stock-adjustments/{adj_id}/post")
            assert r.status_code == 400
            assert "draft" in r.json()["detail"].lower()
            assert await _movement_count(db, tenant.id, "STOCK_ADJUSTMENT", adj_id) == 1

            r = await ac.post(
                "/api/v1/inventory/warehouse-transfers",
                json={
                    "from_warehouse_id": wh.id,
                    "to_warehouse_id": wh2.id,
                    "items": [{"item_id": item.id, "quantity": "4"}],
                },
            )
            assert r.status_code == 200, r.text
            wt_id = r.json()["id"]
            r = await ac.post(f"/api/v1/inventory/warehouse-transfers/{wt_id}/post")
            assert r.status_code == 200, r.text
            assert r.json()["status"] == "POSTED"
            r = await ac.post(f"/api/v1/inventory/warehouse-transfers/{wt_id}/post")
            assert r.status_code == 400
            assert "draft" in r.json()["detail"].lower()
    finally:
        _clear_overrides()

    # One OUT + one IN only; stock moved exactly once.
    assert await _movement_count(db, tenant.id, "WAREHOUSE_TRANSFER", wt_id) == 2
    assert await on_hand_qty_decimal(db, tenant.id, item.id, wh.id) == Decimal("6")
    assert await on_hand_qty_decimal(db, tenant.id, item.id, wh2.id) == Decimal("4")
    # The FIFO layer of the source warehouse was consumed (locked select path works).
    layers = (
        await db.execute(
            select(InventoryCostLayer).where(
                InventoryCostLayer.tenant_id == tenant.id,
                InventoryCostLayer.item_id == item.id,
                InventoryCostLayer.warehouse_id == wh.id,
            )
        )
    ).scalars().all()
    assert sum(Decimal(str(layer.qty_remaining)) for layer in layers) == Decimal("6")


@pytest.mark.asyncio
async def test_transfer_post_blocks_insufficient_stock_when_negative_not_allowed(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    wh2 = await _second_warehouse(db, tenant)
    tenant.allow_negative_stock = False
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            await _seed_stock_via_adjustment(ac, wh.id, item.id, "3")
            r = await ac.post(
                "/api/v1/inventory/warehouse-transfers",
                json={
                    "from_warehouse_id": wh.id,
                    "to_warehouse_id": wh2.id,
                    "items": [{"item_id": item.id, "quantity": "5"}],
                },
            )
            assert r.status_code == 200, r.text
            r = await ac.post(f"/api/v1/inventory/warehouse-transfers/{r.json()['id']}/post")
            assert r.status_code == 400
            assert "insufficient" in r.json()["detail"].lower()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_physical_count_second_post_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            await _seed_stock_via_adjustment(ac, wh.id, item.id, "10")
            r = await ac.post(
                "/api/v1/inventory/physical-inventory-sessions",
                json={"warehouse_id": wh.id, "lines": [{"item_id": item.id, "counted_qty": "7"}]},
            )
            assert r.status_code == 200, r.text
            sid = r.json()["id"]
            r = await ac.post(f"/api/v1/inventory/physical-inventory-sessions/{sid}/post")
            assert r.status_code == 200, r.text
            r = await ac.post(f"/api/v1/inventory/physical-inventory-sessions/{sid}/post")
            assert r.status_code == 400
            assert "draft" in r.json()["detail"].lower()
    finally:
        _clear_overrides()
    assert await _movement_count(db, tenant.id, "PHYSICAL_COUNT", sid) == 1
    assert await on_hand_qty_decimal(db, tenant.id, item.id, wh.id) == Decimal("7")


@pytest.mark.asyncio
async def test_stock_hierarchy_transfer_checks_on_hand_when_negative_not_allowed(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    wh2 = await _second_warehouse(db, tenant)
    tenant.allow_negative_stock = False
    tenant.feature_flags = {**(tenant.feature_flags or {}), STOCK_HIERARCHY_ENABLED: True}
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            await _seed_stock_via_adjustment(ac, wh.id, item.id, "2")
            body = {
                "from_godown_id": wh.id,
                "to_godown_id": wh2.id,
                "items": [{"stock_item_id": item.id, "qty": "5"}],
            }
            r = await ac.post("/api/v1/inventory/stock-transfers", json=body)
            assert r.status_code == 400, r.text
            assert "insufficient" in r.json()["detail"].lower()

            body["items"][0]["qty"] = "2"
            r = await ac.post("/api/v1/inventory/stock-transfers", json=body)
            assert r.status_code == 200, r.text
    finally:
        _clear_overrides()
    assert await on_hand_qty_decimal(db, tenant.id, item.id, wh.id) == Decimal("0")
    assert await on_hand_qty_decimal(db, tenant.id, item.id, wh2.id) == Decimal("2")


@pytest.mark.asyncio
async def test_idt_issue_checks_on_hand_when_negative_not_allowed(db_session_integration):
    db = db_session_integration
    tenant, _user, wh, _vendor, item = await seed_inventory_chain(db)
    wh2 = await _second_warehouse(db, tenant)
    target = Item(
        tenant_id=tenant.id,
        item_code=f"T{uuid.uuid4().hex[:6]}",
        name="Greige",
        category_id=item.category_id,
        unit_id=item.unit_id,
        default_cost=Decimal("12"),
        is_active=True,
    )
    db.add(target)
    tenant.allow_negative_stock = False
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=item.id,
            warehouse_id=wh.id,
            movement_type="IN",
            quantity=Decimal("5"),
            notes="seed",
        )
    )
    await db.flush()

    kwargs = dict(
        from_warehouse_id=wh.id,
        to_warehouse_id=wh2.id,
        process_name="Knitting",
        source_item_id=item.id,
        source_qty_unit="kg",
        target_item_id=target.id,
        target_qty_expected=Decimal("5"),
        target_qty_unit="kg",
    )
    with pytest.raises(HTTPException) as exc:
        await idt_service.create_idt_issue(db, tenant, source_qty=Decimal("6"), **kwargs)
    assert exc.value.status_code == 400
    assert "insufficient" in str(exc.value.detail).lower()

    idt = await idt_service.create_idt_issue(db, tenant, source_qty=Decimal("5"), **kwargs)
    assert idt.status == "ISSUED"
    assert await on_hand_qty_decimal(db, tenant.id, item.id, wh.id) == Decimal("0")


@pytest.mark.asyncio
async def test_grn_qc_second_submit_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, vendor, item, whs = await _seed_qc(db)
    grn, line, _ = await _make_grn(db, tenant, vendor, item, whs, qty="20")
    args = dict(
        grn_id=grn.id,
        grn_item_id=line.id,
        accepted_qty=Decimal("20"),
        rejected_qty=Decimal("0"),
        hold_qty=Decimal("0"),
    )
    insp = await create_inspection(db, tenant, **args)
    assert insp.status == "COMPLETED"
    with pytest.raises(HTTPException) as exc:
        await create_inspection(db, tenant, **args)
    assert exc.value.status_code == 400
    assert await _movement_count(db, tenant.id, "GRN_QC", insp.id) == 2
