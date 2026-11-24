"""No-commit leave request helpers shared by /hr/leave routes and HR class requests.

Routers own ``commit``. Behaviour matches the legacy leave router paths.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.money import safe_decimal
from app.models import LeaveApproval, LeaveBalance, LeaveRequest, LeaveType, Tenant, User
from app.modules.hr_leave.leave_days import validate_leave_request
from decimal import Decimal


def _to_float(value: str | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _fmt(value: float) -> str:
    return f"{value:.2f}"


def _days(value: Any) -> Decimal:
    return safe_decimal(value, default=Decimal("0"))


async def get_or_create_balance(
    db: AsyncSession,
    tenant_id: int,
    employee_id: int,
    leave_type_id: int,
    balance_year: int,
) -> LeaveBalance:
    row = (
        await db.execute(
            select(LeaveBalance).where(
                LeaveBalance.tenant_id == tenant_id,
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.leave_type_id == leave_type_id,
                LeaveBalance.balance_year == balance_year,
            )
        )
    ).scalar_one_or_none()
    if row:
        return row
    row = LeaveBalance(
        tenant_id=tenant_id,
        employee_id=employee_id,
        leave_type_id=leave_type_id,
        balance_year=balance_year,
        allocated_days="0",
        used_days="0",
        pending_days="0",
        closing_balance_days="0",
    )
    db.add(row)
    await db.flush()
    return row


async def adjust_leave_balance(
    db: AsyncSession,
    req: LeaveRequest,
    *,
    pending_delta: float = 0.0,
    used_delta: float = 0.0,
    validate: bool = False,
    is_paid: bool = True,
) -> None:
    """Move days between pending/used under a row lock and recompute closing."""
    bal = await get_or_create_balance(
        db,
        tenant_id=req.tenant_id,
        employee_id=req.employee_id,
        leave_type_id=req.leave_type_id,
        balance_year=req.from_date.year,
    )
    bal = (
        await db.execute(
            select(LeaveBalance)
            .where(LeaveBalance.id == bal.id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    allocated = _to_float(bal.allocated_days)
    used = _to_float(bal.used_days)
    pending = _to_float(bal.pending_days)
    if validate and is_paid and allocated > 0:
        available = allocated - used - pending
        need = pending_delta + used_delta
        if need > available + 1e-9:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient leave balance: available {available:.2f} day(s), requested {need:.2f}",
            )
    pending = max(pending + pending_delta, 0.0)
    used = max(used + used_delta, 0.0)
    bal.pending_days = _fmt(pending)
    bal.used_days = _fmt(used)
    bal.closing_balance_days = _fmt(allocated - used - pending)


async def lock_leave_request(db: AsyncSession, tenant_id: int, request_id: int) -> LeaveRequest:
    row = (
        await db.execute(
            select(LeaveRequest)
            .where(LeaveRequest.id == request_id, LeaveRequest.tenant_id == tenant_id)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if not row:
        raise HTTPException(status_code=404, detail="Leave request not found")
    return row


async def leave_type_or_404(db: AsyncSession, tenant_id: int, leave_type_id: int) -> LeaveType:
    row = await db.get(LeaveType, leave_type_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Leave type not found")
    return row


async def create_leave_request_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    employee_id: int,
    leave_type_id: int,
    from_date,
    to_date,
    days_requested,
    reason: str | None,
    force_pending: bool = False,
) -> LeaveRequest:
    """Create a leave request and reserve balance. Does not commit.

    When ``force_pending`` is True (HR class request path), auto-approve leave types
    still start as PENDING so the Class chain owns approval.
    """
    leave_type = await leave_type_or_404(db, tenant.id, leave_type_id)
    days = await validate_leave_request(
        db,
        tenant=tenant,
        employee_id=employee_id,
        from_date=from_date,
        to_date=to_date,
        requested_days=days_requested,
    )
    if force_pending:
        initial_status = "PENDING"
    else:
        initial_status = "PENDING" if leave_type.requires_approval else "APPROVED"
    row = LeaveRequest(
        tenant_id=tenant.id,
        employee_id=employee_id,
        leave_type_id=leave_type_id,
        from_date=from_date,
        to_date=to_date,
        days_requested=days,
        reason=reason.strip() if reason else None,
        status=initial_status,
        requested_by=actor.id,
        approved_by=actor.id if initial_status == "APPROVED" else None,
        approved_at=datetime.utcnow() if initial_status == "APPROVED" else None,
    )
    db.add(row)
    await db.flush()
    day_f = _to_float(str(row.days_requested) if row.days_requested is not None else "0")
    if initial_status == "PENDING":
        await adjust_leave_balance(db, row, pending_delta=day_f, validate=True, is_paid=leave_type.is_paid)
    else:
        await adjust_leave_balance(db, row, used_delta=day_f, validate=True, is_paid=leave_type.is_paid)
        db.add(
            LeaveApproval(
                tenant_id=tenant.id,
                leave_request_id=row.id,
                action="AUTO_APPROVED",
                action_by=actor.id,
                note="Auto approved because leave type does not require approval",
            )
        )
    return row


async def submit_leave_request_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    row: LeaveRequest,
    exclude_request_id: int | None = None,
) -> LeaveRequest:
    """Move DRAFT → PENDING and reserve balance. Idempotent if already PENDING."""
    if row.status not in {"DRAFT", "PENDING"}:
        raise HTTPException(status_code=400, detail="Only draft/pending requests can be submitted")
    if row.status == "DRAFT":
        row.days_requested = await validate_leave_request(
            db,
            tenant=tenant,
            employee_id=row.employee_id,
            from_date=row.from_date,
            to_date=row.to_date,
            requested_days=row.days_requested,
            exclude_request_id=exclude_request_id or row.id,
        )
        lt = await leave_type_or_404(db, tenant.id, row.leave_type_id)
        await adjust_leave_balance(
            db, row, pending_delta=_to_float(str(row.days_requested)), validate=True, is_paid=lt.is_paid
        )
    row.status = "PENDING"
    return row


async def approve_leave_request_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    row: LeaveRequest,
    note: str | None = None,
) -> LeaveRequest:
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")
    row.status = "APPROVED"
    row.approved_by = actor.id
    row.approved_at = datetime.utcnow()
    row.approval_note = note.strip() if note else None
    days = _to_float(str(row.days_requested))
    await adjust_leave_balance(db, row, pending_delta=-days, used_delta=days)
    db.add(
        LeaveApproval(
            tenant_id=tenant.id,
            leave_request_id=row.id,
            action="APPROVED",
            action_by=actor.id,
            note=row.approval_note,
        )
    )
    return row


async def reject_leave_request_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    actor: User,
    row: LeaveRequest,
    note: str | None = None,
) -> LeaveRequest:
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")
    row.status = "REJECTED"
    row.approved_by = actor.id
    row.approved_at = datetime.utcnow()
    row.approval_note = note.strip() if note else None
    await adjust_leave_balance(db, row, pending_delta=-_to_float(str(row.days_requested)))
    db.add(
        LeaveApproval(
            tenant_id=tenant.id,
            leave_request_id=row.id,
            action="REJECTED",
            action_by=actor.id,
            note=row.approval_note,
        )
    )
    return row


async def return_leave_to_draft_core(
    db: AsyncSession,
    *,
    tenant: Tenant,
    row: LeaveRequest,
) -> LeaveRequest:
    """Release pending balance only while still PENDING, then set DRAFT (idempotent)."""
    if row.status == "PENDING":
        await adjust_leave_balance(db, row, pending_delta=-_to_float(str(row.days_requested)))
        row.status = "DRAFT"
        row.approved_by = None
        row.approved_at = None
        row.approval_note = None
    elif row.status != "DRAFT":
        raise HTTPException(status_code=400, detail="Only pending leave can be returned to draft")
    return row

