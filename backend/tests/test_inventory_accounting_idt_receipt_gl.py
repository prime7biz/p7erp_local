"""Every IDT receipt posts its own GL voucher for the value it brings into stock.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_idt_receipt_gl.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.common.tenant_feature_keys import INTER_DEPARTMENT_TRANSFER_ENABLED
from app.models import InventoryGlPosting, Item, StockMovement, Warehouse
from app.modules.inventory import idt_service
from app.services.wip_gl_service import maybe_post_idt_receive_wip

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import account_line_total, setup_inventory_gl


async def _seed_job_work_idt(db):
    tenant, _user, wh, _vendor, yarn = await seed_inventory_chain(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), INTER_DEPARTMENT_TRANSFER_ENABLED: True}
    wh2 = Warehouse(tenant_id=tenant.id, warehouse_code=f"KN{uuid.uuid4().hex[:4]}", name="Knitting", is_active=True)
    greige = Item(
        tenant_id=tenant.id,
        item_code=f"G{uuid.uuid4().hex[:6]}",
        name="Greige",
        category_id=yarn.category_id,
        unit_id=yarn.unit_id,
        default_cost=Decimal("15"),
        is_active=True,
    )
    db.add_all([wh2, greige])
    await db.flush()
    accounts = await setup_inventory_gl(db, tenant.id, [yarn, greige])
    yarn.avg_cost = Decimal("10")
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=yarn.id,
            warehouse_id=wh.id,
            movement_type="IN",
            quantity=Decimal("500"),
            notes="seed",
        )
    )
    await db.flush()
    # Material 100 kg x 10 = 1000, transport 50, job work 2 per kg received.
    idt = await idt_service.create_idt_issue(
        db,
        tenant,
        from_warehouse_id=wh.id,
        to_warehouse_id=wh2.id,
        process_name="Knitting",
        source_item_id=yarn.id,
        source_qty=Decimal("100"),
        source_qty_unit="kg",
        target_item_id=greige.id,
        target_qty_expected=Decimal("100"),
        target_qty_unit="kg",
        is_job_work=True,
        job_work_cost_per_unit=Decimal("2"),
        transport_cost=Decimal("50"),
    )
    await db.flush()
    return tenant, idt, yarn, greige, accounts


async def _receive_postings(db, tenant_id: int, idt_id: int) -> list[InventoryGlPosting]:
    rows = (
        await db.execute(
            select(InventoryGlPosting)
            .where(
                InventoryGlPosting.tenant_id == tenant_id,
                InventoryGlPosting.source_system == "IDT",
                InventoryGlPosting.source_id == idt_id,
                InventoryGlPosting.action.like("RECEIVE%"),
            )
            .order_by(InventoryGlPosting.id)
        )
    ).scalars().all()
    return list(rows)


async def _receipt_movements(db, tenant_id: int, idt_id: int, item_id: int) -> list[StockMovement]:
    rows = (
        await db.execute(
            select(StockMovement)
            .where(
                StockMovement.tenant_id == tenant_id,
                StockMovement.reference_type == "IDT",
                StockMovement.reference_id == idt_id,
                StockMovement.item_id == item_id,
                StockMovement.movement_type == "IN",
            )
            .order_by(StockMovement.id)
        )
    ).scalars().all()
    return list(rows)


@pytest.mark.asyncio
async def test_each_partial_receipt_posts_its_own_gl_voucher(db_session_integration):
    db = db_session_integration
    tenant, idt, _yarn, greige, accounts = await _seed_job_work_idt(db)

    await idt_service.receive_idt(db, tenant, idt.id, Decimal("60"))
    await idt_service.receive_idt(db, tenant, idt.id, Decimal("40"))
    await db.flush()

    receipts = await _receipt_movements(db, tenant.id, idt.id, greige.id)
    values = [Decimal(str(m.movement_value)) for m in receipts]
    # First receipt: material 1000 + transport 50 + job work 60 x 2; second: job work 40 x 2.
    assert values == [Decimal("1170.0000"), Decimal("80.0000")]

    postings = await _receive_postings(db, tenant.id, idt.id)
    assert [p.action for p in postings] == ["RECEIVE", f"RECEIVE:{receipts[1].id}"]
    assert len({p.voucher_id for p in postings}) == 2

    # GL inventory debits from the receipts == stock value received.
    assert await account_line_total(db, accounts.inventory.id, "DEBIT") == sum(values)
    # Net inventory account = stock ledger value change (yarn out 1000, greige in 1250).
    await db.refresh(accounts.inventory)
    assert Decimal(str(accounts.inventory.balance)) == sum(values) - Decimal("1000")

    # Retrying a receipt's posting is a no-op (idempotent per receipt).
    for mv in receipts:
        await maybe_post_idt_receive_wip(db, tenant, None, idt, notes="retry", movement_id=mv.id)
    await db.flush()
    assert len(await _receive_postings(db, tenant.id, idt.id)) == 2


@pytest.mark.asyncio
async def test_receive_gl_without_movement_id_keeps_first_receipt_behaviour(db_session_integration):
    db = db_session_integration
    tenant, idt, _yarn, greige, _accounts = await _seed_job_work_idt(db)
    await idt_service.receive_idt(db, tenant, idt.id, Decimal("100"))
    await db.flush()
    # Old-style call (no movement id) maps to the first receipt, which is already posted.
    await maybe_post_idt_receive_wip(db, tenant, None, idt, notes="legacy")
    await db.flush()
    postings = await _receive_postings(db, tenant.id, idt.id)
    assert [p.action for p in postings] == ["RECEIVE"]
    receipts = await _receipt_movements(db, tenant.id, idt.id, greige.id)
    assert Decimal(str(receipts[0].movement_value)) == Decimal("1250.0000")
