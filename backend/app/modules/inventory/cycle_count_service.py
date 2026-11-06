"""Cycle counting schedule and submission (Sprint I3)."""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import tenant_today, today_local
from app.models import Tenant
from app.models.costing import Item
from app.models.inventory import CycleCountTask, StockMovement, Warehouse

logger = logging.getLogger(__name__)

ZERO = Decimal("0")
Q4 = Decimal("0.0001")

ABC_FREQUENCY_DAYS = {"A": 7, "B": 30, "C": 90}


def _d(v: Any) -> Decimal:
    if v is None:
        return ZERO
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v))
    except Exception:
        return ZERO


def _q(v: Decimal) -> Decimal:
    return v.quantize(Q4, rounding=ROUND_HALF_UP)


async def _on_hand(
    db: AsyncSession,
    tenant_id: int,
    item_id: int,
    warehouse_id: int | None,
) -> Decimal:
    stmt = select(StockMovement).where(
        StockMovement.tenant_id == tenant_id, StockMovement.item_id == item_id
    )
    if warehouse_id is None:
        stmt = stmt.where(StockMovement.warehouse_id.is_(None))
    else:
        stmt = stmt.where(StockMovement.warehouse_id == warehouse_id)
    rows = list((await db.execute(stmt)).scalars().all())
    inn = sum((_d(r.quantity) for r in rows if r.movement_type == "IN"), ZERO)
    out = sum((_d(r.quantity) for r in rows if r.movement_type == "OUT"), ZERO)
    return _q(inn - out)


def _due_today(abc: str, today: date, *, anchor: date | None = None) -> bool:
    """Simple calendar rule: A every 7 days from epoch-ish weekday, B day-of-month 1, C quarter starts."""
    cls = (abc or "C").upper()
    if cls == "A":
        # Monday or every 7 days from anchor
        return today.weekday() == 0
    if cls == "B":
        return today.day == 1
    # C quarterly: Jan/Apr/Jul/Oct 1st
    return today.day == 1 and today.month in (1, 4, 7, 10)


async def generate_cycle_count_schedule(
    db: AsyncSession,
    tenant: Tenant,
    *,
    frequency: str | None = None,
    for_date: date | None = None,
    force_all_due: bool = False,
) -> list[CycleCountTask]:
    """
    Create SCHEDULED tasks for items due by ABC frequency.
    frequency: optional filter A|B|C|ALL
    """
    today = for_date or today_local(tenant)
    freq = (frequency or "ALL").upper()

    items = list(
        (
            await db.execute(
                select(Item).where(Item.tenant_id == tenant.id, Item.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    warehouses = list(
        (
            await db.execute(
                select(Warehouse).where(
                    Warehouse.tenant_id == tenant.id,
                    Warehouse.is_active.is_(True),
                    Warehouse.is_store.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    # Prefer non-quarantine / non-rejected
    warehouses = [
        w
        for w in warehouses
        if not getattr(w, "is_quarantine", False) and not getattr(w, "is_rejected", False)
    ]
    if not warehouses:
        warehouses = list(
            (
                await db.execute(
                    select(Warehouse).where(
                        Warehouse.tenant_id == tenant.id, Warehouse.is_active.is_(True)
                    )
                )
            )
            .scalars()
            .all()
        )

    created: list[CycleCountTask] = []
    for item in items:
        abc = (item.abc_class or "C").upper()
        if freq not in ("ALL", "") and abc != freq:
            continue
        if not force_all_due and not _due_today(abc, today):
            continue

        wh_id = item.default_warehouse_id or (warehouses[0].id if warehouses else None)
        if not wh_id:
            continue

        existing = (
            await db.execute(
                select(CycleCountTask).where(
                    CycleCountTask.tenant_id == tenant.id,
                    CycleCountTask.item_id == item.id,
                    CycleCountTask.warehouse_id == wh_id,
                    CycleCountTask.scheduled_date == today,
                )
            )
        ).scalar_one_or_none()
        if existing:
            continue

        system = await _on_hand(db, tenant.id, item.id, wh_id)
        task = CycleCountTask(
            tenant_id=tenant.id,
            item_id=item.id,
            warehouse_id=wh_id,
            scheduled_date=today,
            status="SCHEDULED",
            system_qty=_q(system),
            abc_class=abc,
        )
        db.add(task)
        created.append(task)

    await db.flush()
    logger.info(
        "cycle_count_schedule tenant=%s date=%s created=%s",
        tenant.id,
        today,
        len(created),
    )
    return created


async def list_cycle_count_tasks(
    db: AsyncSession,
    tenant_id: int,
    *,
    for_date: date | None = None,
    status: str | None = None,
    history_days: int | None = None,
    limit: int = 200,
) -> list[CycleCountTask]:
    q = select(CycleCountTask).where(CycleCountTask.tenant_id == tenant_id)
    if for_date is not None:
        q = q.where(CycleCountTask.scheduled_date == for_date)
    if status:
        q = q.where(CycleCountTask.status == status.upper())
    if history_days is not None:
        cutoff = await tenant_today(db, tenant_id) - timedelta(days=history_days)
        q = q.where(CycleCountTask.scheduled_date >= cutoff)
    q = q.order_by(CycleCountTask.scheduled_date.desc(), CycleCountTask.id.desc()).limit(limit)
    return list((await db.execute(q)).scalars().all())


async def submit_cycle_count(
    db: AsyncSession,
    tenant: Tenant,
    task_id: int,
    *,
    counted_qty: Decimal,
    counted_by: int | None = None,
    notes: str | None = None,
    create_adjustment: bool = False,
) -> CycleCountTask:
    task = await db.get(CycleCountTask, task_id)
    if not task or task.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Cycle count task not found")
    if task.status in ("COMPLETED",):
        raise HTTPException(status_code=400, detail="Task already completed")

    # Refresh system qty at submit time
    system = await _on_hand(db, tenant.id, task.item_id, task.warehouse_id)
    counted = _q(_d(counted_qty))
    variance = _q(counted - system)
    item = await db.get(Item, task.item_id)
    unit = _d(item.avg_cost) if item else ZERO
    if unit <= ZERO and item:
        unit = _d(item.default_cost)
    variance_value = _q(variance * unit)

    task.system_qty = _q(system)
    task.counted_qty = counted
    task.variance_qty = variance
    task.variance_value = variance_value
    task.notes = notes
    task.counted_by = counted_by
    task.counted_at = datetime.utcnow()
    task.updated_at = datetime.utcnow()

    if abs(variance) > Decimal("0.0001"):
        task.status = "VARIANCE"
        task.adjustment_suggested = True
    else:
        task.status = "COMPLETED"
        task.adjustment_suggested = False

    await db.flush()
    return task


async def task_to_dict(
    db: AsyncSession,
    task: CycleCountTask,
) -> dict[str, Any]:
    item = await db.get(Item, task.item_id)
    wh = await db.get(Warehouse, task.warehouse_id)
    return {
        "id": task.id,
        "item_id": task.item_id,
        "item_code": item.item_code if item else None,
        "item_name": item.name if item else None,
        "warehouse_id": task.warehouse_id,
        "warehouse_name": wh.name if wh else None,
        "scheduled_date": task.scheduled_date.isoformat() if task.scheduled_date else None,
        "status": task.status,
        "system_qty": str(_q(_d(task.system_qty))),
        "counted_qty": str(_q(_d(task.counted_qty))) if task.counted_qty is not None else None,
        "variance_qty": str(_q(_d(task.variance_qty))) if task.variance_qty is not None else None,
        "variance_value": str(_q(_d(task.variance_value))) if task.variance_value is not None else None,
        "abc_class": task.abc_class,
        "adjustment_suggested": bool(task.adjustment_suggested),
        "notes": task.notes,
        "counted_by": task.counted_by,
        "counted_at": task.counted_at.isoformat() if task.counted_at else None,
        "adjustment_href": (
            f"/app/inventory/stock-adjustments?item_id={task.item_id}&warehouse_id={task.warehouse_id}"
            if task.adjustment_suggested
            else None
        ),
    }
