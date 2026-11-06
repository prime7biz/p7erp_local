"""IDT partial receipts add up qty and never carry the IDT cost more than once.

Run (Docker):
    docker compose exec backend pytest tests/test_inventory_accounting_idt_receipts.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import select

from app.common.tenant_feature_keys import INTER_DEPARTMENT_TRANSFER_ENABLED
from app.models import Item, StockMovement, Warehouse
from app.modules.inventory import idt_service
from app.modules.inventory.job_work_costing_service import receipt_cost_from_idt

from tests.go_live_fixtures import seed_inventory_chain


async def _seed_idt(db, *, is_job_work: bool):
    tenant, _user, wh, _vendor, yarn = await seed_inventory_chain(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), INTER_DEPARTMENT_TRANSFER_ENABLED: True}
    wh2 = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"KN{uuid.uuid4().hex[:4]}",
        name="Knitting floor",
        is_active=True,
    )
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
        is_job_work=is_job_work,
        job_work_cost_per_unit=Decimal("2") if is_job_work else None,
        transport_cost=Decimal("50"),
    )
    await db.flush()
    return tenant, idt, greige


async def _receipt_values(db, tenant_id: int, idt_id: int, item_id: int) -> list[Decimal]:
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
    return [Decimal(str(r.movement_value)) for r in rows]


@pytest.mark.asyncio
async def test_two_partial_receipts_accumulate_qty_and_cost_once(db_session_integration):
    db = db_session_integration
    tenant, idt, greige = await _seed_idt(db, is_job_work=True)
    # Material 100 kg x 10 = 1000, transport 50, job work 2 per kg received.

    first = await idt_service.receive_idt(db, tenant, idt.id, Decimal("40"))
    await db.flush()
    assert first.status == "RECEIVED_PARTIALLY"
    assert first.target_qty_received == Decimal("40")

    second = await idt_service.receive_idt(db, tenant, idt.id, Decimal("60"))
    await db.flush()
    assert second.status == "RECEIVED_FULLY"
    assert second.target_qty_received == Decimal("100")
    assert second.process_loss_qty == Decimal("0")
    assert second.job_work_total_cost == Decimal("200")

    values = await _receipt_values(db, tenant.id, idt.id, greige.id)
    assert values == [Decimal("1130.0000"), Decimal("120.0000")]
    # Sum equals material + transport + job work: the IDT cost is carried once, not per receipt.
    assert sum(values) == Decimal("1250")
    # Average unit cost over everything received so far.
    assert second.target_item_value == Decimal("12.5000")

    with pytest.raises(HTTPException) as exc:
        await idt_service.receive_idt(db, tenant, idt.id, Decimal("1"))
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_partial_receipts_without_job_work_sum_to_issued_cost(db_session_integration):
    db = db_session_integration
    tenant, idt, greige = await _seed_idt(db, is_job_work=False)
    await idt_service.receive_idt(db, tenant, idt.id, Decimal("25"))
    await idt_service.receive_idt(db, tenant, idt.id, Decimal("30"))
    last = await idt_service.receive_idt(db, tenant, idt.id, Decimal("42.5"))
    await db.flush()
    assert last.target_qty_received == Decimal("97.5")
    assert last.process_loss_qty == Decimal("2.5")
    assert last.status == "RECEIVED_PARTIALLY"
    values = await _receipt_values(db, tenant.id, idt.id, greige.id)
    assert len(values) == 3
    assert sum(values) == Decimal("1050")


def test_receipt_cost_single_receipt_matches_full_cost():
    class _Idt:
        source_item_cost = Decimal("150")
        source_qty_issued = Decimal("100")
        transport_cost = Decimal("200")
        other_charges = Decimal("100")
        is_job_work = True
        job_work_cost_per_unit = Decimal("20")
        job_work_total_cost = None

    idt = _Idt()
    first = receipt_cost_from_idt(idt, previously_received=Decimal("0"), received_now=Decimal("94"))
    assert first == Decimal("17180.0000")
    later = receipt_cost_from_idt(idt, previously_received=Decimal("94"), received_now=Decimal("3"))
    assert later == Decimal("60.0000")
