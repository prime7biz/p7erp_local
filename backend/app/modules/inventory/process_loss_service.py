"""Process loss standards and post-costing reports (Sprint I1)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.inventory import InterDepartmentTransfer, ProcessLossStandard, ProcessOrder
from app.models.merch import Order
from app.modules.inventory.job_work_costing_service import _d, _q, calculate_job_work_cost_from_idt

ZERO = Decimal("0")

DEFAULT_STANDARDS: list[tuple[str, Decimal]] = [
    ("Knitting", Decimal("3.00")),
    ("Dyeing", Decimal("5.00")),
    ("Cutting", Decimal("12.00")),
    ("Sewing", Decimal("3.00")),
    ("Finishing", Decimal("2.00")),
    ("Printing", Decimal("3.00")),
    ("AOP", Decimal("3.00")),
]


@dataclass
class ProcessLossReportRow:
    process_name: str
    total_issued: Decimal
    total_received: Decimal
    total_loss: Decimal
    loss_percent: Decimal
    standard_percent: Decimal
    variance_percent: Decimal
    status: str  # OK | Warning | Alert
    exception_count: int = 0


@dataclass
class ProcessLossReport:
    from_date: date
    to_date: date
    rows: list[ProcessLossReportRow] = field(default_factory=list)


@dataclass
class PostCostingStage:
    stage: str
    input_qty: Decimal | None
    output_qty: Decimal | None
    loss_percent: Decimal | None
    input_cost: Decimal | None
    job_work: Decimal | None
    output_cost_per_unit: Decimal | None
    idt_id: int | None = None
    loss_exception: bool = False


@dataclass
class PostCostingReport:
    order_id: int
    order_code: str | None
    order_qty: int | None
    stages: list[PostCostingStage] = field(default_factory=list)
    final_unit_cost: Decimal | None = None
    standard_unit_cost: Decimal | None = None
    cost_variance: Decimal | None = None
    cost_variance_pct: Decimal | None = None
    variance_drivers: list[str] = field(default_factory=list)


async def ensure_default_standards(db: AsyncSession, tenant_id: int) -> list[ProcessLossStandard]:
    existing = list(
        (
            await db.execute(
                select(ProcessLossStandard).where(
                    ProcessLossStandard.tenant_id == tenant_id,
                    ProcessLossStandard.is_active.is_(True),
                )
            )
        )
        .scalars()
        .all()
    )
    if existing:
        return existing
    created: list[ProcessLossStandard] = []
    for name, pct in DEFAULT_STANDARDS:
        row = ProcessLossStandard(
            tenant_id=tenant_id,
            process_name=name,
            standard_loss_percent=pct,
            warning_threshold_percent=Decimal("5.00"),
            is_active=True,
        )
        db.add(row)
        created.append(row)
    await db.flush()
    return created


async def get_standard_for_process(
    db: AsyncSession,
    tenant_id: int,
    process_name: str,
    item_category_id: int | None = None,
) -> ProcessLossStandard | None:
    await ensure_default_standards(db, tenant_id)
    q = select(ProcessLossStandard).where(
        ProcessLossStandard.tenant_id == tenant_id,
        ProcessLossStandard.process_name == process_name,
        ProcessLossStandard.is_active.is_(True),
    )
    if item_category_id is not None:
        specific = (
            await db.execute(q.where(ProcessLossStandard.item_category_id == item_category_id))
        ).scalars().first()
        if specific:
            return specific
    return (
        await db.execute(q.where(ProcessLossStandard.item_category_id.is_(None)))
    ).scalars().first()


async def get_process_loss_report(
    db: AsyncSession,
    tenant_id: int,
    from_date: date,
    to_date: date,
    process_name: str | None = None,
) -> ProcessLossReport:
    await ensure_default_standards(db, tenant_id)
    stmt = select(InterDepartmentTransfer).where(
        InterDepartmentTransfer.tenant_id == tenant_id,
        InterDepartmentTransfer.idt_date >= from_date,
        InterDepartmentTransfer.idt_date <= to_date,
        InterDepartmentTransfer.status.in_(
            ("RECEIVED_PARTIALLY", "RECEIVED_FULLY", "CLOSED", "ISSUED")
        ),
    )
    if process_name:
        stmt = stmt.where(InterDepartmentTransfer.process_name == process_name)
    idts = list((await db.execute(stmt)).scalars().all())

    by_process: dict[str, list[InterDepartmentTransfer]] = {}
    for idt in idts:
        if idt.target_qty_received is None:
            continue
        by_process.setdefault(idt.process_name, []).append(idt)

    standards = {
        s.process_name: s
        for s in (
            await db.execute(
                select(ProcessLossStandard).where(
                    ProcessLossStandard.tenant_id == tenant_id,
                    ProcessLossStandard.is_active.is_(True),
                    ProcessLossStandard.item_category_id.is_(None),
                )
            )
        )
        .scalars()
        .all()
    }

    rows: list[ProcessLossReportRow] = []
    for pname, group in sorted(by_process.items()):
        issued = sum((_d(i.source_qty_issued) for i in group), ZERO)
        received = sum((_d(i.target_qty_received) for i in group), ZERO)
        loss = _q(issued - received)
        loss_pct = _q((loss / issued) * 100) if issued > ZERO else ZERO
        std = standards.get(pname)
        std_pct = _d(std.standard_loss_percent) if std else ZERO
        warn = _d(std.warning_threshold_percent) if std else Decimal("5")
        variance = _q(loss_pct - std_pct)
        exceptions = sum(1 for i in group if i.loss_exception)
        if variance > warn:
            status = "Alert"
        elif variance > ZERO:
            status = "Warning"
        else:
            status = "OK"
        rows.append(
            ProcessLossReportRow(
                process_name=pname,
                total_issued=_q(issued),
                total_received=_q(received),
                total_loss=loss,
                loss_percent=loss_pct,
                standard_percent=_q(std_pct),
                variance_percent=variance,
                status=status,
                exception_count=exceptions,
            )
        )
    return ProcessLossReport(from_date=from_date, to_date=to_date, rows=rows)


async def get_post_costing_report(
    db: AsyncSession,
    tenant_id: int,
    order_id: int,
) -> PostCostingReport:
    order = await db.get(Order, order_id)
    if not order or order.tenant_id != tenant_id:
        raise ValueError("Order not found")

    idts = list(
        (
            await db.execute(
                select(InterDepartmentTransfer)
                .where(
                    InterDepartmentTransfer.tenant_id == tenant_id,
                    InterDepartmentTransfer.linked_order_id == order_id,
                )
                .order_by(InterDepartmentTransfer.idt_date.asc(), InterDepartmentTransfer.id.asc())
            )
        )
        .scalars()
        .all()
    )

    stages: list[PostCostingStage] = []
    drivers: list[str] = []
    running_unit: Decimal | None = None

    for idt in idts:
        if idt.target_qty_received is None:
            continue
        br = calculate_job_work_cost_from_idt(idt)
        stages.append(
            PostCostingStage(
                stage=idt.process_name,
                input_qty=_q(_d(idt.source_qty_issued)),
                output_qty=_q(_d(idt.target_qty_received)),
                loss_percent=_q(_d(idt.process_loss_percent)) if idt.process_loss_percent is not None else None,
                input_cost=br.material_cost,
                job_work=br.job_work_cost,
                output_cost_per_unit=br.unit_cost,
                idt_id=idt.id,
                loss_exception=bool(idt.loss_exception),
            )
        )
        running_unit = br.unit_cost
        if idt.loss_exception:
            std = _d(idt.standard_process_loss_percent)
            act = _d(idt.process_loss_percent)
            drivers.append(
                f"{idt.process_name} loss {act}% exceeds standard {std}%"
            )
        if idt.is_job_work and br.job_work_cost > ZERO:
            drivers.append(
                f"{idt.process_name} job work cost {br.job_work_cost}"
            )

    # Optional process orders for same order
    pos = list(
        (
            await db.execute(
                select(ProcessOrder).where(
                    ProcessOrder.tenant_id == tenant_id,
                    ProcessOrder.source_order_id == order_id,
                ).order_by(ProcessOrder.id.asc())
            )
        )
        .scalars()
        .all()
    )
    for po in pos:
        if any(s.stage == (po.process_stage or po.process_type) for s in stages):
            continue
        out_qty = _d(po.actual_output_qty) if po.actual_output_qty else None
        stages.append(
            PostCostingStage(
                stage=po.process_stage or po.process_type,
                input_qty=_q(_d(po.input_quantity)),
                output_qty=_q(out_qty) if out_qty is not None else None,
                loss_percent=_q(_d(po.planned_loss_pct)) if po.planned_loss_pct else None,
                input_cost=None,
                job_work=_q(_d(po.processing_charges)) if po.processing_charges else None,
                output_cost_per_unit=None,
            )
        )

    final = running_unit
    # Standard cost heuristic: sum of item default costs is not available; leave None
    report = PostCostingReport(
        order_id=order_id,
        order_code=order.order_code,
        order_qty=order.quantity,
        stages=stages,
        final_unit_cost=final,
        standard_unit_cost=None,
        cost_variance=None,
        cost_variance_pct=None,
        variance_drivers=drivers,
    )
    return report
