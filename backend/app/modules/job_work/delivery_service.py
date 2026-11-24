"""Production qty updates and job-work delivery notes (no stock / COGS)."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.codegen import next_tenant_code
from app.common.document_history import record_doc_event
from app.models import Tenant, User
from app.models.job_work import JobWorkDeliverable, JobWorkDelivery, JobWorkDeliveryLine
from app.modules.job_work.access import ensure_not_closed, get_contract_for_tenant
from app.modules.job_work.contract_service import get_detail, mark_in_progress
from app.modules.job_work.money import ZERO, q4, s4
from app.modules.job_work.schemas import DeliveryCreate, ProduceIn
from app.modules.job_work.serializers import delivery_out


async def update_produced(db: AsyncSession, tenant: Tenant, user: User, contract_id: int, body: ProduceIn):
    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id, for_update=True)
    ensure_not_closed(contract)
    if (contract.status or "").upper() == "DRAFT":
        raise HTTPException(status_code=409, detail="Confirm the contract before recording production")
    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one production line is required")

    produced_total = ZERO
    # One query for all deliverables of this contract (same tenant + contract filter as the checks below).
    wanted_ids = {line.deliverable_id for line in body.lines}
    deliverables_by_id = {
        d.id: d
        for d in (
            await db.execute(
                select(JobWorkDeliverable).where(
                    JobWorkDeliverable.tenant_id == tenant.id,
                    JobWorkDeliverable.contract_id == contract.id,
                    JobWorkDeliverable.id.in_(wanted_ids),
                )
            )
        ).scalars()
    }
    for line in body.lines:
        row = deliverables_by_id.get(line.deliverable_id)
        if row is None or row.tenant_id != tenant.id or row.contract_id != contract.id:
            raise HTTPException(status_code=404, detail="Deliverable not found")
        qty = q4(line.qty_produced, field="qty_produced")
        if qty < ZERO:
            raise HTTPException(status_code=400, detail="qty_produced cannot be negative")
        row.qty_produced = s4(qty)
        row.updated_at = datetime.utcnow()

    all_rows = (
        await db.execute(
            select(JobWorkDeliverable).where(
                JobWorkDeliverable.tenant_id == tenant.id,
                JobWorkDeliverable.contract_id == contract.id,
            )
        )
    ).scalars().all()
    for r in all_rows:
        produced_total += q4(r.qty_produced)
    contract.qty_produced_total = s4(produced_total)
    contract.updated_by_user_id = user.id
    await mark_in_progress(db, contract)
    await record_doc_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        doc_type="JOB_WORK_CONTRACT",
        doc_id=contract.id,
        event="PRODUCTION_UPDATED",
        summary=f"Updated produced qty on {contract.contract_no}",
        from_status=contract.status,
        to_status=contract.status,
    )
    await db.commit()
    return await get_detail(db, tenant, contract.id)


async def create_delivery(db: AsyncSession, tenant: Tenant, user: User, contract_id: int, body: DeliveryCreate):
    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id, for_update=True)
    ensure_not_closed(contract)
    if (contract.status or "").upper() == "DRAFT":
        raise HTTPException(status_code=409, detail="Confirm the contract before delivery")
    if not body.lines:
        raise HTTPException(status_code=400, detail="At least one delivery line is required")

    delivery_no = await next_tenant_code(
        db, model=JobWorkDelivery, tenant_id=tenant.id, prefix="JWD-", width=4
    )
    tot_del = ZERO
    tot_rej = ZERO
    line_rows: list[JobWorkDeliveryLine] = []

    delivery = JobWorkDelivery(
        tenant_id=tenant.id,
        contract_id=contract.id,
        delivery_no=delivery_no,
        delivery_date=body.delivery_date or today_local(tenant),
        reference_doc=(body.reference_doc or "").strip() or None,
        notes=(body.notes or "").strip() or None,
        created_by_user_id=user.id,
    )
    db.add(delivery)
    await db.flush()

    # One query for all referenced deliverables of this contract (same tenant + contract filter as below).
    wanted_ids = {ln.deliverable_id for ln in body.lines if ln.deliverable_id is not None}
    deliverables_by_id = {}
    if wanted_ids:
        deliverables_by_id = {
            d.id: d
            for d in (
                await db.execute(
                    select(JobWorkDeliverable).where(
                        JobWorkDeliverable.tenant_id == tenant.id,
                        JobWorkDeliverable.contract_id == contract.id,
                        JobWorkDeliverable.id.in_(wanted_ids),
                    )
                )
            ).scalars()
        }

    for ln in body.lines:
        qty_d = q4(ln.qty_delivered, field="qty_delivered")
        qty_r = q4(ln.qty_rejected, field="qty_rejected")
        if qty_d < ZERO or qty_r < ZERO:
            raise HTTPException(status_code=400, detail="Delivery quantities cannot be negative")
        if qty_r > qty_d:
            raise HTTPException(status_code=400, detail="Rejected qty cannot exceed delivered qty")
        style = (ln.style_ref or "").strip() or None
        color = (ln.color or "").strip() or None
        size = (ln.size or "").strip() or None
        deliverable = None
        if ln.deliverable_id is not None:
            deliverable = deliverables_by_id.get(ln.deliverable_id)
            if deliverable is None or deliverable.tenant_id != tenant.id or deliverable.contract_id != contract.id:
                raise HTTPException(status_code=404, detail="Deliverable not found")
            deliverable.qty_delivered = s4(q4(deliverable.qty_delivered) + qty_d)
            deliverable.qty_rejected = s4(q4(deliverable.qty_rejected) + qty_r)
            deliverable.updated_at = datetime.utcnow()
            style = style or deliverable.style_ref
            color = color or deliverable.color
            size = size or deliverable.size
        tot_del += qty_d
        tot_rej += qty_r
        line_rows.append(
            JobWorkDeliveryLine(
                tenant_id=tenant.id,
                delivery_id=delivery.id,
                deliverable_id=deliverable.id if deliverable else None,
                style_ref=style,
                color=color,
                size=size,
                qty_delivered=s4(qty_d),
                qty_rejected=s4(qty_r),
            )
        )

    for lr in line_rows:
        db.add(lr)

    accepted = tot_del - tot_rej
    delivery.qty_delivered = s4(tot_del)
    delivery.qty_rejected = s4(tot_rej)
    delivery.qty_accepted = s4(accepted)

    contract.qty_delivered_accepted = s4(q4(contract.qty_delivered_accepted) + accepted)
    contract.qty_rejected_total = s4(q4(contract.qty_rejected_total) + tot_rej)
    contract.updated_by_user_id = user.id
    await mark_in_progress(db, contract)
    if q4(contract.qty_delivered_accepted) > ZERO and (contract.status or "").upper() not in {"BILLED", "CLOSED"}:
        contract.status = "DELIVERED"

    await db.flush()
    await record_doc_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        doc_type="JOB_WORK_CONTRACT",
        doc_id=contract.id,
        event="DELIVERED",
        summary=f"Delivery {delivery_no}: accepted {s4(accepted)} on {contract.contract_no}",
        from_status=contract.status,
        to_status=contract.status,
        extra={"delivery_id": delivery.id, "qty_accepted": s4(accepted)},
    )
    await db.commit()
    return await get_delivery(db, tenant, contract.id, delivery.id)


async def get_delivery(db: AsyncSession, tenant: Tenant, contract_id: int, delivery_id: int):
    await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    row = await db.get(JobWorkDelivery, delivery_id)
    if row is None or row.tenant_id != tenant.id or row.contract_id != contract_id:
        raise HTTPException(status_code=404, detail="Delivery not found")
    lines = (
        await db.execute(
            select(JobWorkDeliveryLine).where(
                JobWorkDeliveryLine.tenant_id == tenant.id,
                JobWorkDeliveryLine.delivery_id == row.id,
            )
        )
    ).scalars().all()
    return delivery_out(row, list(lines))


async def list_deliveries(db: AsyncSession, tenant: Tenant, contract_id: int):
    await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    rows = (
        await db.execute(
            select(JobWorkDelivery)
            .where(JobWorkDelivery.tenant_id == tenant.id, JobWorkDelivery.contract_id == contract_id)
            .order_by(JobWorkDelivery.id.desc())
        )
    ).scalars().all()
    # One query for the lines of all deliveries (same tenant filter), grouped per delivery.
    lines_by_delivery: dict[int, list[JobWorkDeliveryLine]] = {}
    if rows:
        for ln in (
            await db.execute(
                select(JobWorkDeliveryLine).where(
                    JobWorkDeliveryLine.tenant_id == tenant.id,
                    JobWorkDeliveryLine.delivery_id.in_([r.id for r in rows]),
                )
            )
        ).scalars():
            lines_by_delivery.setdefault(ln.delivery_id, []).append(ln)
    out = []
    for row in rows:
        out.append(delivery_out(row, lines_by_delivery.get(row.id, [])))
    return out


async def delivery_print_payload(db: AsyncSession, tenant: Tenant, contract_id: int, delivery_id: int) -> dict:
    detail = await get_delivery(db, tenant, contract_id, delivery_id)
    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    return {
        "document_type": "JOB_WORK_DELIVERY_NOTE",
        "contract_no": contract.contract_no,
        "delivery": detail.model_dump(),
        "customer_id": contract.customer_id,
        "note": "Customer job-work delivery — no inventory stock or COGS posting",
    }
