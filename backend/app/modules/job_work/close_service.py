"""Close guards and variance warnings for inbound job work."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.document_history import record_doc_event
from app.models import Tenant, User
from app.models.job_work import JobWorkDeliverable, JobWorkMaterial
from app.modules.job_work.access import ensure_not_closed, get_contract_for_tenant
from app.modules.job_work.billing_service import open_ar_amount
from app.modules.job_work.contract_service import get_detail
from app.modules.job_work.materials_service import assert_materials_reconciled
from app.modules.job_work.money import ZERO, money2, q4, s2, s4
from app.modules.job_work.schemas import CloseReport
from app.modules.job_work.serializers import billable_qty, material_remaining


async def close_preview(db: AsyncSession, tenant: Tenant, contract_id: int) -> CloseReport:
    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    blockers: list[str] = []
    warnings: list[str] = []
    variance_notes: list[str] = []

    if (contract.status or "").upper() == "CLOSED":
        return CloseReport(
            can_close=False,
            blockers=["Contract is already closed"],
            warnings=[],
            materials_remaining="0",
            open_ar="0",
            variance_notes=[],
        )

    mat_blockers = await assert_materials_reconciled(db, tenant.id, contract.id)
    blockers.extend(mat_blockers)

    remaining_billable = q4(billable_qty(contract))
    if remaining_billable > ZERO:
        blockers.append(f"Unbilled accepted deliveries remain: {s4(remaining_billable)}")

    open_ar = await open_ar_amount(db, tenant.id, contract.id)
    if open_ar > ZERO:
        blockers.append(f"Open AR remains: {s2(open_ar)}")

    mats = (
        await db.execute(
            select(JobWorkMaterial).where(
                JobWorkMaterial.tenant_id == tenant.id,
                JobWorkMaterial.contract_id == contract.id,
            )
        )
    ).scalars().all()
    rem_total = ZERO
    produced = q4(contract.qty_produced_total)
    for m in mats:
        rem_total += q4(material_remaining(m))
        std = q4(m.consumption_per_unit) * produced
        actual = q4(m.qty_consumed)
        if std > ZERO:
            variance_pct = ((actual - std) / std) * money2("100")
            if abs(variance_pct) > money2("10"):
                warnings.append(
                    f"Material {m.id} consumption variance {s2(variance_pct)}% "
                    f"(standard {s4(std)}, actual {s4(actual)})"
                )
                variance_notes.append(
                    f"item {m.item_id}: standard {s4(std)} vs consumed {s4(actual)}"
                )

    dels = (
        await db.execute(
            select(JobWorkDeliverable).where(
                JobWorkDeliverable.tenant_id == tenant.id,
                JobWorkDeliverable.contract_id == contract.id,
            )
        )
    ).scalars().all()
    for dline in dels:
        if q4(dline.qty_rejected) > ZERO:
            variance_notes.append(
                f"Deliverable {dline.id} rejected {dline.qty_rejected} of {dline.qty_delivered}"
            )

    return CloseReport(
        can_close=len(blockers) == 0,
        blockers=blockers,
        warnings=warnings,
        materials_remaining=s4(rem_total),
        open_ar=s2(open_ar),
        variance_notes=variance_notes,
    )


async def close_contract(db: AsyncSession, tenant: Tenant, user: User, contract_id: int):
    contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id, for_update=True)
    ensure_not_closed(contract)
    preview = await close_preview(db, tenant, contract_id)
    if not preview.can_close:
        raise HTTPException(
            status_code=409,
            detail={"message": "Cannot close job work", "blockers": preview.blockers},
        )
    prev = contract.status
    contract.status = "CLOSED"
    contract.updated_by_user_id = user.id
    contract.updated_at = datetime.utcnow()
    await record_doc_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        doc_type="JOB_WORK_CONTRACT",
        doc_id=contract.id,
        event="CLOSED",
        summary=f"Closed job work {contract.contract_no}",
        from_status=prev,
        to_status="CLOSED",
        extra={"warnings": preview.warnings, "variance_notes": preview.variance_notes},
    )
    await db.commit()
    return await get_detail(db, tenant, contract.id)
