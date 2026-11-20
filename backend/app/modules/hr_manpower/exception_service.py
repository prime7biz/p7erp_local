"""Quota exception workflow: request, approve/reject (four-eyes), cancel, list."""

from __future__ import annotations

from datetime import date, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.ownership import ensure_owned
from app.common.permissions import PERMISSION_HR_MANPOWER_EXCEPTION_APPROVE, explicit_permission_granted
from app.models import User
from app.models.hr import Department, Designation
from app.models.hr_manpower import HrManpowerQuotaException
from app.modules.audit.service import log_action
from app.modules.hr_manpower.quota_guard import _active_consumptions_for_exception


def _out(row: HrManpowerQuotaException, *, slots_used: int = 0) -> dict:
    return {
        "id": row.id,
        "department_id": row.department_id,
        "designation_id": row.designation_id,
        "extra_slots": row.extra_slots,
        "slots_used": slots_used,
        "slots_remaining": max(0, row.extra_slots - slots_used),
        "reason": row.reason,
        "status": row.status,
        "request_id": row.request_id,
        "requested_by": row.requested_by,
        "requested_at": row.requested_at.isoformat() if row.requested_at else None,
        "approved_by": row.approved_by,
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
        "decision_note": row.decision_note,
        "expires_on": row.expires_on.isoformat() if row.expires_on else None,
        "created_at": row.created_at.isoformat() if row.created_at else None,
    }


async def create_exception(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    department_id: int,
    designation_id: int,
    extra_slots: int,
    reason: str,
    request_id: str,
    expires_on: date | None = None,
) -> dict:
    # Idempotent replay
    existing = (
        await db.execute(
            select(HrManpowerQuotaException).where(
                HrManpowerQuotaException.tenant_id == tenant_id,
                HrManpowerQuotaException.request_id == request_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        used = await _active_consumptions_for_exception(db, existing) if existing.status == "APPROVED" else 0
        return _out(existing, slots_used=used)

    dept = await ensure_owned(db, Department, department_id, tenant_id, "Department")
    desig = await ensure_owned(db, Designation, designation_id, tenant_id, "Designation")
    assert dept is not None and desig is not None
    if desig.department_id is not None and desig.department_id != department_id:
        raise HTTPException(status_code=400, detail="Designation belongs to a different department")
    if extra_slots < 1:
        raise HTTPException(status_code=400, detail="extra_slots must be at least 1")

    now = datetime.utcnow()
    row = HrManpowerQuotaException(
        tenant_id=tenant_id,
        department_id=department_id,
        designation_id=designation_id,
        extra_slots=extra_slots,
        reason=reason.strip(),
        status="PENDING",
        request_id=request_id,
        requested_by=user.id,
        requested_at=now,
        expires_on=expires_on,
        created_at=now,
        updated_at=now,
    )
    db.add(row)
    try:
        await db.flush()
    except Exception as exc:  # unique pending / request_id
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A pending exception already exists for this department and designation, or request_id was reused.",
        ) from exc

    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="HR_MANPOWER_EXCEPTION_REQUESTED",
        resource=f"hr_manpower_quota_exceptions:{row.id}",
        details=f"slots={extra_slots} dept={department_id} desig={designation_id}",
    )
    await db.commit()
    await db.refresh(row)
    return _out(row, slots_used=0)


async def list_exceptions(
    db: AsyncSession,
    tenant_id: int,
    *,
    status_filter: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> list[dict]:
    q = select(HrManpowerQuotaException).where(HrManpowerQuotaException.tenant_id == tenant_id)
    if status_filter:
        q = q.where(HrManpowerQuotaException.status == status_filter)
    q = q.order_by(HrManpowerQuotaException.id.desc()).limit(limit).offset(offset)
    rows = list((await db.execute(q)).scalars().all())
    out: list[dict] = []
    for row in rows:
        used = await _active_consumptions_for_exception(db, row) if row.status == "APPROVED" else 0
        out.append(_out(row, slots_used=used))
    return out


async def get_exception(
    db: AsyncSession,
    tenant_id: int,
    exception_id: int,
    *,
    for_update: bool = False,
) -> HrManpowerQuotaException:
    q = select(HrManpowerQuotaException).where(
        HrManpowerQuotaException.id == exception_id,
        HrManpowerQuotaException.tenant_id == tenant_id,
    )
    if for_update:
        q = q.with_for_update()
    row = (await db.execute(q)).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Exception not found")
    return row


async def decide_exception(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    exception_id: int,
    decision: str,
    note: str | None,
) -> dict:
    # Row lock so concurrent approve/reject cannot both pass the PENDING guard.
    row = await get_exception(db, tenant_id, exception_id, for_update=True)
    if row.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Exception is already {row.status}")

    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    if not explicit_permission_granted(role=role, permission_key=PERMISSION_HR_MANPOWER_EXCEPTION_APPROVE):
        raise HTTPException(
            status_code=403,
            detail="Requires explicit permission 'hr.manpower.exception.approve' (no admin bypass)",
        )
    # Skip self-approval check only when requester was deleted (ON DELETE SET NULL).
    # Prefer keeping requested_by populated; do not treat NULL as "anyone may approve as requester".
    if row.requested_by is not None and row.requested_by == user.id:
        raise HTTPException(status_code=403, detail="You cannot approve or reject your own exception request")

    decision = decision.upper().strip()
    if decision not in ("APPROVE", "REJECT"):
        raise HTTPException(status_code=400, detail="decision must be APPROVE or REJECT")

    now = datetime.utcnow()
    new_status = "APPROVED" if decision == "APPROVE" else "REJECTED"
    note_clean = (note or "").strip() or None
    # Compare-and-swap: only one concurrent writer can flip PENDING → decided.
    result = await db.execute(
        update(HrManpowerQuotaException)
        .where(
            HrManpowerQuotaException.id == row.id,
            HrManpowerQuotaException.tenant_id == tenant_id,
            HrManpowerQuotaException.status == "PENDING",
        )
        .values(
            status=new_status,
            approved_by=user.id,
            decided_at=now,
            decision_note=note_clean,
            updated_at=now,
        )
    )
    if result.rowcount != 1:
        raise HTTPException(status_code=409, detail="Exception is already decided")

    await db.refresh(row)
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="HR_MANPOWER_EXCEPTION_APPROVED" if new_status == "APPROVED" else "HR_MANPOWER_EXCEPTION_REJECTED",
        resource=f"hr_manpower_quota_exceptions:{row.id}",
        details=note_clean,
    )
    await db.commit()
    await db.refresh(row)
    used = await _active_consumptions_for_exception(db, row) if row.status == "APPROVED" else 0
    return _out(row, slots_used=used)


async def cancel_exception(
    db: AsyncSession,
    *,
    tenant_id: int,
    user: User,
    exception_id: int,
) -> dict:
    row = await get_exception(db, tenant_id, exception_id, for_update=True)
    if row.status != "PENDING":
        raise HTTPException(status_code=409, detail=f"Exception is already {row.status}")
    if row.requested_by is not None and row.requested_by != user.id:
        # Requester or someone with manage — keep simple: requester only for cancel
        raise HTTPException(status_code=403, detail="Only the requester can cancel a pending exception")
    now = datetime.utcnow()
    result = await db.execute(
        update(HrManpowerQuotaException)
        .where(
            HrManpowerQuotaException.id == row.id,
            HrManpowerQuotaException.tenant_id == tenant_id,
            HrManpowerQuotaException.status == "PENDING",
        )
        .values(status="CANCELLED", updated_at=now)
    )
    if result.rowcount != 1:
        raise HTTPException(status_code=409, detail="Exception is already decided")
    await db.refresh(row)
    await log_action(
        db,
        tenant_id=tenant_id,
        user_id=user.id,
        action="HR_MANPOWER_EXCEPTION_CANCELLED",
        resource=f"hr_manpower_quota_exceptions:{row.id}",
        details=None,
    )
    await db.commit()
    await db.refresh(row)
    return _out(row, slots_used=0)
