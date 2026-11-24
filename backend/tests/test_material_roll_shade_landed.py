"""Phase 7 lite: rolls/shade + landed cost onto FIFO layers.

Run: docker compose exec -T backend pytest tests/test_material_roll_shade_landed.py -q
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
from app.models.inventory import InventoryCostLayer, StockMovement
from app.services.fifo_inventory import finalize_movement_fifo

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import _account, setup_inventory_gl


async def _credit_account(db, tenant_id: int):
    """Liability ledger credited for freight/duty (e.g. freight payable)."""
    return await _account(db, tenant_id, "Freight payable", normal="credit")

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


async def _seed_stock(db, tenant, wh, item, qty: str = "100", unit_cost: float = 10.0):
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="IN",
        quantity=Decimal(qty),
        movement_date=date.today(),
        reference_type="TEST",
        movement_kind="TEST_IN",
    )
    db.add(mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=unit_cost)
    return mv


@pytest.mark.asyncio
async def test_rolls_flag_off_404(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/rolls",
                json={"item_id": 1, "warehouse_id": 1, "qty": "10", "shade_band": "A"},
            )
            assert res.status_code == 404
    finally:
        _clear()


@pytest.mark.asyncio
async def test_roll_create_list_and_shade_mismatch(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_budget_plan_v1"] = True
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            r1 = await ac.post(
                f"{API}/rolls",
                json={
                    "item_id": item.id,
                    "warehouse_id": wh.id,
                    "qty": "40",
                    "shade_band": "A",
                    "request_id": "roll-req-1",
                },
            )
            assert r1.status_code == 200, r1.text
            body = r1.json()
            assert body["roll_code"].startswith("ROLL-")
            assert body["shade_band"] == "A"

            r1b = await ac.post(
                f"{API}/rolls",
                json={
                    "item_id": item.id,
                    "warehouse_id": wh.id,
                    "qty": "40",
                    "shade_band": "A",
                    "request_id": "roll-req-1",
                },
            )
            assert r1b.status_code == 200
            assert r1b.json()["id"] == body["id"]

            listed = await ac.get(
                f"{API}/rolls",
                params={"item_id": item.id, "warehouse_id": wh.id, "shade_band": "A"},
            )
            assert listed.status_code == 200
            assert len(listed.json()["items"]) >= 1

            ok = await ac.post(
                f"{API}/rolls/assert-shade",
                json={
                    "item_id": item.id,
                    "warehouse_id": wh.id,
                    "required_shade_band": "A",
                    "qty_needed": "10",
                },
            )
            assert ok.status_code == 200

            bad = await ac.post(
                f"{API}/rolls/assert-shade",
                json={
                    "item_id": item.id,
                    "warehouse_id": wh.id,
                    "required_shade_band": "B",
                    "qty_needed": "10",
                },
            )
            assert bad.status_code == 409
            assert "SHADE_MISMATCH" in bad.json()["detail"]
    finally:
        _clear()


@pytest.mark.asyncio
async def test_landed_cost_allocates_onto_fifo_layers(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_landed_cost_v1"] = True
    tenant.feature_flags = flags
    gl = await setup_inventory_gl(db, tenant.id, [item])
    credit_acc = await _credit_account(db, tenant.id)
    ALLOC = {"credit_account_id": credit_acc.id}

    from app.models.inventory import GoodsReceiving

    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code="GRN-LC-TEST-01",
        status="POSTED",
        default_warehouse_id=wh.id,
    )
    db.add(grn)
    await db.flush()

    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="IN",
        quantity=Decimal("100"),
        movement_date=date.today(),
        reference_type="GOODS_RECEIVING",
        reference_id=grn.id,
        goods_receiving_id=grn.id,
        movement_kind="GRN",
    )
    db.add(mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=10.0)
    await db.commit()

    layer = (
        await db.execute(
            select(InventoryCostLayer).where(
                InventoryCostLayer.tenant_id == tenant.id,
                InventoryCostLayer.source_movement_id == mv.id,
            )
        )
    ).scalar_one()
    assert Decimal(str(layer.unit_cost)) == Decimal("10")

    try:
        async with await _api_client(db, tenant, user) as ac:
            create = await ac.post(
                f"{API}/landed-costs",
                json={
                    "goods_receiving_id": grn.id,
                    "lines": [{"cost_kind": "FREIGHT", "amount": "50"}, {"cost_kind": "DUTY", "amount": "50"}],
                    "request_id": "lc-req-1",
                },
            )
            assert create.status_code == 200, create.text
            doc = create.json()
            assert doc["status"] == "DRAFT"
            assert doc["total_amount"] == "100.0000" or Decimal(doc["total_amount"]) == Decimal("100")

            create2 = await ac.post(
                f"{API}/landed-costs",
                json={
                    "goods_receiving_id": grn.id,
                    "lines": [{"cost_kind": "FREIGHT", "amount": "50"}],
                    "request_id": "lc-req-1",
                },
            )
            assert create2.json()["id"] == doc["id"]

            alloc = await ac.post(f"{API}/landed-costs/{doc['id']}/allocate", json=ALLOC)
            assert alloc.status_code == 200, alloc.text
            assert alloc.json()["status"] == "ALLOCATED"

            alloc2 = await ac.post(f"{API}/landed-costs/{doc['id']}/allocate", json=ALLOC)
            assert alloc2.status_code == 200
            assert alloc2.json()["status"] == "ALLOCATED"

        await db.refresh(layer)
        # 100 freight+duty over 100 qty → +1 per unit → 11
        assert Decimal(str(layer.unit_cost)) == Decimal("11.0000")

        # GL: one balanced voucher, Dr inventory 100 / Cr supplied account 100, re-allocate posts nothing new.
        from app.models.finance import Voucher, VoucherLine

        vouchers = (
            await db.execute(
                select(Voucher).where(
                    Voucher.tenant_id == tenant.id,
                    Voucher.source_module == "MATERIAL_LANDED_COST",
                )
            )
        ).scalars().all()
        assert len(vouchers) == 1
        assert vouchers[0].status == "POSTED"
        assert alloc.json()["voucher_id"] == vouchers[0].id
        vlines = (
            await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == vouchers[0].id))
        ).scalars().all()
        debit = sum(Decimal(str(v.amount)) for v in vlines if v.entry_type == "DEBIT")
        credit = sum(Decimal(str(v.amount)) for v in vlines if v.entry_type == "CREDIT")
        assert debit == credit == Decimal("100")
        assert any(v.account_id == gl.inventory.id and v.entry_type == "DEBIT" for v in vlines)
        assert any(v.account_id == credit_acc.id and v.entry_type == "CREDIT" for v in vlines)
    finally:
        _clear()


@pytest.mark.asyncio
async def test_landed_cost_flag_off_404(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/landed-costs",
                json={"goods_receiving_id": 1, "lines": [{"cost_kind": "FREIGHT", "amount": "10"}]},
            )
            assert res.status_code == 404
    finally:
        _clear()


@pytest.mark.asyncio
async def test_cross_tenant_roll_grn_item_404(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, wh_a, _vendor_a, item_a = await seed_inventory_chain(db)
    tenant_b, _user_b, wh_b, _vendor_b, item_b = await seed_inventory_chain(db)
    flags = dict(tenant_a.feature_flags or {})
    flags["material_budget_plan_v1"] = True
    tenant_a.feature_flags = flags

    from app.models.inventory import GoodsReceiving, GoodsReceivingItem

    grn_b = GoodsReceiving(
        tenant_id=tenant_b.id,
        grn_code="GRN-OTHER-01",
        status="DRAFT",
    )
    db.add(grn_b)
    await db.flush()
    gri_b = GoodsReceivingItem(
        tenant_id=tenant_b.id,
        goods_receiving_id=grn_b.id,
        item_id=item_b.id,
        warehouse_id=wh_b.id,
        quantity=Decimal("5"),
    )
    db.add(gri_b)
    await db.commit()

    try:
        async with await _api_client(db, tenant_a, user_a) as ac:
            res = await ac.post(
                f"{API}/rolls",
                json={
                    "item_id": item_a.id,
                    "warehouse_id": wh_a.id,
                    "qty": "5",
                    "grn_item_id": gri_b.id,
                },
            )
            assert res.status_code == 404
    finally:
        _clear()


@pytest.mark.asyncio
async def test_cross_tenant_landed_cost_grn_404(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, *_ = await seed_inventory_chain(db)
    tenant_b, _user_b, wh_b, *_ = await seed_inventory_chain(db)
    flags = dict(tenant_a.feature_flags or {})
    flags["material_landed_cost_v1"] = True
    tenant_a.feature_flags = flags

    from app.models.inventory import GoodsReceiving

    grn_b = GoodsReceiving(
        tenant_id=tenant_b.id,
        grn_code="GRN-LC-OTHER",
        status="POSTED",
        default_warehouse_id=wh_b.id,
    )
    db.add(grn_b)
    await db.commit()

    try:
        async with await _api_client(db, tenant_a, user_a) as ac:
            res = await ac.post(
                f"{API}/landed-costs",
                json={
                    "goods_receiving_id": grn_b.id,
                    "lines": [{"cost_kind": "FREIGHT", "amount": "10"}],
                },
            )
            assert res.status_code == 404
    finally:
        _clear()


@pytest.mark.asyncio
async def test_second_landed_allocate_same_grn_409(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_landed_cost_v1"] = True
    tenant.feature_flags = flags
    gl = await setup_inventory_gl(db, tenant.id, [item])
    credit_acc = await _credit_account(db, tenant.id)
    ALLOC = {"credit_account_id": credit_acc.id}

    from app.models.inventory import GoodsReceiving

    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code="GRN-LC-DUP-01",
        status="POSTED",
        default_warehouse_id=wh.id,
    )
    db.add(grn)
    await db.flush()
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="IN",
        quantity=Decimal("50"),
        movement_date=date.today(),
        reference_type="GOODS_RECEIVING",
        reference_id=grn.id,
        goods_receiving_id=grn.id,
        movement_kind="GRN",
    )
    db.add(mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=10.0)
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            d1 = await ac.post(
                f"{API}/landed-costs",
                json={
                    "goods_receiving_id": grn.id,
                    "lines": [{"cost_kind": "FREIGHT", "amount": "25"}],
                    "request_id": "lc-dup-1",
                },
            )
            assert d1.status_code == 200, d1.text
            bad = await ac.post(
                f"{API}/landed-costs/{d1.json()['id']}/allocate",
                json={"credit_account_id": 999999999},
            )
            assert bad.status_code == 404, bad.text
            # The handler rolls back; refresh the shared test objects it expired.
            await db.refresh(tenant)
            await db.refresh(user)
            await db.refresh(grn)
            no_body = await ac.post(f"{API}/landed-costs/{d1.json()['id']}/allocate")
            assert no_body.status_code == 422
            a1 = await ac.post(f"{API}/landed-costs/{d1.json()['id']}/allocate", json=ALLOC)
            assert a1.status_code == 200, a1.text

            d2 = await ac.post(
                f"{API}/landed-costs",
                json={
                    "goods_receiving_id": grn.id,
                    "lines": [{"cost_kind": "DUTY", "amount": "25"}],
                    "request_id": "lc-dup-2",
                },
            )
            assert d2.status_code == 200, d2.text
            a2 = await ac.post(f"{API}/landed-costs/{d2.json()['id']}/allocate", json=ALLOC)
            assert a2.status_code == 409, a2.text
            assert "LANDED_COST_ALREADY_ALLOCATED" in a2.json()["detail"]
    finally:
        _clear()


@pytest.mark.asyncio
async def test_pmi_shade_mismatch_409(db_session_integration):
    """PMI with required_shade_band rejects when shaded rolls exist but none match."""
    from app.models import BomItem
    from tests.merch_fixtures import (
        create_customer,
        create_garment_style,
        create_legacy_bom,
        create_quotation_and_order,
    )

    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_budget_plan_v1"] = True
    tenant.feature_flags = flags
    tenant.allow_negative_stock = False

    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    bom = await create_legacy_bom(db, tenant, style, customer=customer, status="APPROVED")
    bom.order_id = order.id
    bom.order_qty_snapshot = Decimal("10")
    bom.is_active = True
    await db.flush()
    bl = BomItem(
        tenant_id=tenant.id,
        bom_id=bom.id,
        item_id=item.id,
        category="FABRIC",
        base_consumption=Decimal("1"),
        required_gross_qty=Decimal("10"),
        bom_gross_consumption_per_unit=Decimal("1"),
    )
    db.add(bl)
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            roll = await ac.post(
                f"{API}/rolls",
                json={
                    "item_id": item.id,
                    "warehouse_id": wh.id,
                    "qty": "20",
                    "shade_band": "A",
                    "request_id": "pmi-shade-roll",
                },
            )
            assert roll.status_code == 200, roll.text

            adj = await ac.post(
                "/api/v1/inventory/stock-adjustments",
                json={
                    "warehouse_id": wh.id,
                    "item_id": item.id,
                    "quantity": "20",
                    "reason_code": "COUNT",
                },
            )
            assert adj.status_code == 200, adj.text
            posted = await ac.post(f"/api/v1/inventory/stock-adjustments/{adj.json()['id']}/post")
            assert posted.status_code == 200, posted.text

            bad = await ac.post(
                "/api/v1/inventory/production-material-issues",
                json={
                    "order_id": order.id,
                    "bom_id": bom.id,
                    "warehouse_id": wh.id,
                    "production_stage": "CUTTING",
                    "covered_order_qty": 10,
                    "issue_date": str(date.today()),
                    "required_shade_band": "B",
                    "lines": [{"bom_line_id": bl.id, "actual_issue_qty": "5"}],
                },
            )
            assert bad.status_code == 409, bad.text
            assert "SHADE_MISMATCH" in bad.json()["detail"]

            ok = await ac.post(
                "/api/v1/inventory/production-material-issues",
                json={
                    "order_id": order.id,
                    "bom_id": bom.id,
                    "warehouse_id": wh.id,
                    "production_stage": "CUTTING",
                    "covered_order_qty": 10,
                    "issue_date": str(date.today()),
                    "required_shade_band": "A",
                    "lines": [{"bom_line_id": bl.id, "actual_issue_qty": "5"}],
                },
            )
            assert ok.status_code == 201, ok.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_consume_roll_rejects_unshaded_when_shade_required(db_session_integration):
    from app.modules.material_control import roll_service

    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_budget_plan_v1"] = True
    tenant.feature_flags = flags
    await db.commit()

    roll = await roll_service.create_roll(
        db,
        tenant=tenant,
        user_id=user.id,
        item_id=item.id,
        warehouse_id=wh.id,
        qty="10",
        shade_band=None,
        request_id="unshaded-roll",
    )
    await db.commit()

    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        await roll_service.consume_roll(
            db,
            tenant=tenant,
            roll_id=roll.id,
            qty="1",
            required_shade_band="A",
            expected_item_id=item.id,
            expected_warehouse_id=wh.id,
        )
    assert exc.value.status_code == 409
    assert "SHADE_MISMATCH" in str(exc.value.detail)


@pytest.mark.asyncio
async def test_landed_cost_after_partial_issue_409(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_landed_cost_v1"] = True
    tenant.feature_flags = flags
    gl = await setup_inventory_gl(db, tenant.id, [item])
    credit_acc = await _credit_account(db, tenant.id)
    ALLOC = {"credit_account_id": credit_acc.id}

    from app.models.inventory import GoodsReceiving

    grn = GoodsReceiving(
        tenant_id=tenant.id,
        grn_code="GRN-LC-AFTER-ISSUE",
        status="POSTED",
        default_warehouse_id=wh.id,
    )
    db.add(grn)
    await db.flush()
    mv_in = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="IN",
        quantity=Decimal("100"),
        movement_date=date.today(),
        reference_type="GOODS_RECEIVING",
        reference_id=grn.id,
        goods_receiving_id=grn.id,
        movement_kind="GRN",
    )
    db.add(mv_in)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, mv_in, in_unit_cost=10.0)

    mv_out = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="OUT",
        quantity=Decimal("10"),
        movement_date=date.today(),
        reference_type="TEST",
        movement_kind="TEST_OUT",
    )
    db.add(mv_out)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, mv_out)
    await db.commit()

    try:
        async with await _api_client(db, tenant, user) as ac:
            create = await ac.post(
                f"{API}/landed-costs",
                json={
                    "goods_receiving_id": grn.id,
                    "lines": [{"cost_kind": "FREIGHT", "amount": "50"}],
                    "request_id": "lc-after-issue",
                },
            )
            assert create.status_code == 200, create.text
            alloc = await ac.post(f"{API}/landed-costs/{create.json()['id']}/allocate", json=ALLOC)
            assert alloc.status_code == 409, alloc.text
            assert "LANDED_COST_AFTER_ISSUE" in alloc.json()["detail"]
    finally:
        _clear()
