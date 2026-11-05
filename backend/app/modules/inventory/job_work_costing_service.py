"""Job work conversion costing for IDT (Sprint I1)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InterDepartmentTransfer

ZERO = Decimal("0")
Q4 = Decimal("0.0001")


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


@dataclass
class JobWorkCostBreakdown:
    material_cost: Decimal
    job_work_cost: Decimal
    transport_cost: Decimal
    other_charges: Decimal
    total_cost: Decimal
    unit_cost: Decimal
    received_qty: Decimal


def calculate_job_work_cost_from_idt(idt: InterDepartmentTransfer) -> JobWorkCostBreakdown:
    """
    Total = material + job work + transport + other
    Unit = total / target_qty_received
    """
    received = _d(idt.target_qty_received)
    if received <= ZERO:
        received = _d(idt.target_qty_expected) or Decimal("1")

    material = _q(_d(idt.source_item_cost) * _d(idt.source_qty_issued))
    jw = ZERO
    if idt.is_job_work:
        if idt.job_work_total_cost is not None:
            jw = _q(_d(idt.job_work_total_cost))
        else:
            jw = _q(_d(idt.job_work_cost_per_unit) * received)
    transport = _q(_d(idt.transport_cost))
    other = _q(_d(idt.other_charges))
    total = _q(material + jw + transport + other)
    unit = _q(total / received) if received > ZERO else ZERO
    return JobWorkCostBreakdown(
        material_cost=material,
        job_work_cost=jw,
        transport_cost=transport,
        other_charges=other,
        total_cost=total,
        unit_cost=unit,
        received_qty=received,
    )


def receipt_cost_from_idt(
    idt: InterDepartmentTransfer,
    *,
    previously_received: Decimal,
    received_now: Decimal,
) -> Decimal:
    """Stock value carried by one IDT receipt.

    Material, transport and other charges are absorbed once, by the first receipt
    (so a single receipt is valued exactly as before, including normal process loss).
    Per-unit job-work cost follows the qty of each receipt. All receipts together
    therefore equal the IDT total cost instead of repeating it on every receipt.
    """
    first_receipt = _d(previously_received) <= ZERO
    fixed = ZERO
    if first_receipt:
        fixed = (
            _q(_d(idt.source_item_cost) * _d(idt.source_qty_issued))
            + _q(_d(idt.transport_cost))
            + _q(_d(idt.other_charges))
        )
    jw = ZERO
    if idt.is_job_work:
        if idt.job_work_cost_per_unit is not None:
            jw = _q(_d(idt.job_work_cost_per_unit) * _d(received_now))
        elif first_receipt and idt.job_work_total_cost is not None:
            jw = _q(_d(idt.job_work_total_cost))
    return _q(fixed + jw)


async def calculate_job_work_cost(
    db: AsyncSession,
    idt_id: int,
) -> JobWorkCostBreakdown:
    idt = await db.get(InterDepartmentTransfer, idt_id)
    if not idt:
        raise ValueError("IDT not found")
    return calculate_job_work_cost_from_idt(idt)
