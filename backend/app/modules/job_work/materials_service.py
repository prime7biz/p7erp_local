"""Zero-value customer material receive / consume / return (qty ledger only)."""

from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.business_date import today_local
from app.common.document_history import record_doc_event
from app.database import safe_async_session_rollback
from app.models import Tenant, User
from app.models.job_work import JobWorkMaterial, JobWorkMaterialLedger
from app.modules.job_work.access import ensure_not_closed, get_contract_for_tenant
from app.modules.job_work.contract_service import get_detail, mark_in_progress
from app.modules.job_work.money import ZERO, q4, s4
from app.modules.job_work.schemas import MaterialMovementIn
from app.modules.job_work.serializers import ledger_out, material_remaining


async def _get_material(db: AsyncSession, tenant_id: int, contract_id: int, material_id: int) -> JobWorkMaterial:
    row = await db.get(JobWorkMaterial, material_id)
    if row is None or row.tenant_id != tenant_id or row.contract_id != contract_id:
        raise HTTPException(status_code=404, detail="Material line not found")
    return row


async def _post_movement(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    contract_id: int,
    body: MaterialMovementIn,
    kind: str,
):
    try:
        contract = await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id, for_update=True)
        ensure_not_closed(contract)
        if (contract.status or "").upper() == "DRAFT":
            raise HTTPException(status_code=409, detail="Confirm the contract before material movements")

        material = await _get_material(db, tenant.id, contract.id, body.material_id)
        qty = q4(body.qty, field="qty")
        if qty <= ZERO:
            raise HTTPException(status_code=400, detail="qty must be greater than zero")

        received = q4(material.qty_received)
        consumed = q4(material.qty_consumed)
        returned = q4(material.qty_returned)
        remaining = received - consumed - returned

        if kind == "RECEIVE":
            material.qty_received = s4(received + qty)
        elif kind == "CONSUME":
            if qty > remaining:
                raise HTTPException(status_code=400, detail="Consume qty exceeds remaining material")
            material.qty_consumed = s4(consumed + qty)
        elif kind == "RETURN":
            if qty > remaining:
                raise HTTPException(status_code=400, detail="Return qty exceeds remaining material")
            material.qty_returned = s4(returned + qty)
        else:
            raise HTTPException(status_code=400, detail=f"Unsupported movement kind: {kind}")

        material.updated_at = datetime.utcnow()
        mov_date = body.movement_date or today_local(tenant)
        ledger = JobWorkMaterialLedger(
            tenant_id=tenant.id,
            contract_id=contract.id,
            material_id=material.id,
            movement_kind=kind,
            qty=qty,
            doc_no=(body.doc_no or "").strip() or None,
            movement_date=mov_date,
            note=(body.note or "").strip() or None,
            created_by_user_id=user.id,
        )
        db.add(ledger)
        await mark_in_progress(db, contract)
        await db.flush()
        await record_doc_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            doc_type="JOB_WORK_CONTRACT",
            doc_id=contract.id,
            event=f"MATERIAL_{kind}",
            summary=f"{kind} {s4(qty)} on material {material.id} for {contract.contract_no}",
            from_status=contract.status,
            to_status=contract.status,
            extra={"material_id": material.id, "qty": s4(qty)},
        )
        await db.commit()
        return await get_detail(db, tenant, contract.id)
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise


async def receive_material(db, tenant, user, contract_id, body):
    return await _post_movement(db, tenant=tenant, user=user, contract_id=contract_id, body=body, kind="RECEIVE")


async def consume_material(db, tenant, user, contract_id, body):
    return await _post_movement(db, tenant=tenant, user=user, contract_id=contract_id, body=body, kind="CONSUME")


async def return_material(db, tenant, user, contract_id, body):
    return await _post_movement(db, tenant=tenant, user=user, contract_id=contract_id, body=body, kind="RETURN")


async def list_ledger(db: AsyncSession, tenant: Tenant, contract_id: int):
    await get_contract_for_tenant(db, tenant_id=tenant.id, contract_id=contract_id)
    rows = (
        await db.execute(
            select(JobWorkMaterialLedger)
            .where(
                JobWorkMaterialLedger.tenant_id == tenant.id,
                JobWorkMaterialLedger.contract_id == contract_id,
            )
            .order_by(JobWorkMaterialLedger.id.desc())
        )
    ).scalars().all()
    return [ledger_out(r) for r in rows]


async def assert_materials_reconciled(db: AsyncSession, tenant_id: int, contract_id: int) -> list[str]:
    """Return blocker messages if any material has remaining qty."""
    mats = (
        await db.execute(
            select(JobWorkMaterial).where(
                JobWorkMaterial.tenant_id == tenant_id,
                JobWorkMaterial.contract_id == contract_id,
            )
        )
    ).scalars().all()
    blockers: list[str] = []
    for m in mats:
        rem = q4(material_remaining(m))
        if rem > ZERO:
            blockers.append(f"Material {m.id} still has remaining qty {s4(rem)}")
    return blockers
