from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Employee,
    LeaveApproval,
    LeaveBalance,
    LeavePolicy,
    LeaveRequest,
    LeaveType,
    Role,
    Tenant,
    User,
)
from app.modules.hr_leave.schemas import (
    LeaveBalanceOut,
    LeaveBalanceUpsert,
    LeaveDecision,
    LeavePolicyCreate,
    LeavePolicyOut,
    LeavePolicyUpdate,
    LeaveRequestCreate,
    LeaveRequestOut,
    LeaveRequestUpdate,
    LeaveTypeCreate,
    LeaveTypeOut,
    LeaveTypeUpdate,
)

router = APIRouter(prefix="/hr/leave", tags=["hr-leave"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_manager_or_admin(db: AsyncSession, user: User) -> None:
    role = await db.get(Role, user.role_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


async def _employee_or_404(db: AsyncSession, tenant_id: int, employee_id: int) -> Employee:
    row = await db.get(Employee, employee_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Employee not found")
    return row


async def _leave_type_or_404(db: AsyncSession, tenant_id: int, leave_type_id: int) -> LeaveType:
    row = await db.get(LeaveType, leave_type_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Leave type not found")
    return row


def _to_float(value: str | None) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _fmt(value: float) -> str:
    return f"{value:.2f}"


async def _get_or_create_balance(
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


def _leave_type_out(row: LeaveType) -> LeaveTypeOut:
    return LeaveTypeOut(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        is_paid=row.is_paid,
        requires_approval=row.requires_approval,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _leave_policy_out(row: LeavePolicy) -> LeavePolicyOut:
    return LeavePolicyOut(
        id=row.id,
        tenant_id=row.tenant_id,
        leave_type_id=row.leave_type_id,
        employment_type=row.employment_type,
        annual_quota_days=row.annual_quota_days,
        max_carry_forward_days=row.max_carry_forward_days,
        effective_from=row.effective_from,
        effective_to=row.effective_to,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _leave_balance_out(row: LeaveBalance) -> LeaveBalanceOut:
    return LeaveBalanceOut(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        leave_type_id=row.leave_type_id,
        balance_year=row.balance_year,
        allocated_days=row.allocated_days,
        used_days=row.used_days,
        pending_days=row.pending_days,
        closing_balance_days=row.closing_balance_days,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _leave_request_out(row: LeaveRequest) -> LeaveRequestOut:
    return LeaveRequestOut(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        leave_type_id=row.leave_type_id,
        from_date=row.from_date,
        to_date=row.to_date,
        days_requested=row.days_requested,
        reason=row.reason,
        status=row.status,
        requested_by=row.requested_by,
        approved_by=row.approved_by,
        approved_at=row.approved_at.isoformat() if row.approved_at else None,
        approval_note=row.approval_note,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/types", response_model=list[LeaveTypeOut])
async def list_leave_types(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(LeaveType).where(LeaveType.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(LeaveType.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(LeaveType.name))).scalars().all()
    return [_leave_type_out(x) for x in rows]


@router.post("/types", response_model=LeaveTypeOut, status_code=status.HTTP_201_CREATED)
async def create_leave_type(
    body: LeaveTypeCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = LeaveType(tenant_id=tenant.id, code=body.code.strip().upper(), name=body.name.strip(), is_paid=body.is_paid, requires_approval=body.requires_approval, is_active=body.is_active)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Leave type code already exists")
    await db.refresh(row)
    return _leave_type_out(row)


@router.patch("/types/{leave_type_id}", response_model=LeaveTypeOut)
async def update_leave_type(
    leave_type_id: int,
    body: LeaveTypeUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await _leave_type_or_404(db, tenant.id, leave_type_id)
    payload = body.model_dump(exclude_unset=True)
    if payload.get("code") is not None:
        payload["code"] = payload["code"].strip().upper()
    if payload.get("name") is not None:
        payload["name"] = payload["name"].strip()
    for key, value in payload.items():
        setattr(row, key, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Leave type code already exists")
    await db.refresh(row)
    return _leave_type_out(row)


@router.get("/policies", response_model=list[LeavePolicyOut])
async def list_leave_policies(
    leave_type_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(LeavePolicy).where(LeavePolicy.tenant_id == tenant.id)
    if leave_type_id is not None:
        stmt = stmt.where(LeavePolicy.leave_type_id == leave_type_id)
    rows = (await db.execute(stmt.order_by(LeavePolicy.id.desc()))).scalars().all()
    return [_leave_policy_out(x) for x in rows]


@router.post("/policies", response_model=LeavePolicyOut, status_code=status.HTTP_201_CREATED)
async def create_leave_policy(
    body: LeavePolicyCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    await _leave_type_or_404(db, tenant.id, body.leave_type_id)
    row = LeavePolicy(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _leave_policy_out(row)


@router.patch("/policies/{policy_id}", response_model=LeavePolicyOut)
async def update_leave_policy(
    policy_id: int,
    body: LeavePolicyUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(LeavePolicy, policy_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Leave policy not found")
    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _leave_policy_out(row)


@router.get("/balances", response_model=list[LeaveBalanceOut])
async def list_leave_balances(
    employee_id: int | None = Query(default=None),
    balance_year: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(LeaveBalance).where(LeaveBalance.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(LeaveBalance.employee_id == employee_id)
    if balance_year is not None:
        stmt = stmt.where(LeaveBalance.balance_year == balance_year)
    rows = (await db.execute(stmt.order_by(LeaveBalance.balance_year.desc(), LeaveBalance.id.desc()))).scalars().all()
    return [_leave_balance_out(x) for x in rows]


@router.post("/balances/upsert", response_model=LeaveBalanceOut)
async def upsert_leave_balance(
    body: LeaveBalanceUpsert,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    await _employee_or_404(db, tenant.id, body.employee_id)
    await _leave_type_or_404(db, tenant.id, body.leave_type_id)
    existing = (
        await db.execute(
            select(LeaveBalance).where(
                LeaveBalance.tenant_id == tenant.id,
                LeaveBalance.employee_id == body.employee_id,
                LeaveBalance.leave_type_id == body.leave_type_id,
                LeaveBalance.balance_year == body.balance_year,
            )
        )
    ).scalar_one_or_none()
    if existing:
        existing.allocated_days = body.allocated_days
        existing.used_days = body.used_days
        existing.pending_days = body.pending_days
        existing.closing_balance_days = body.closing_balance_days
        await db.commit()
        await db.refresh(existing)
        return _leave_balance_out(existing)
    row = LeaveBalance(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _leave_balance_out(row)


@router.get("/requests", response_model=list[LeaveRequestOut])
async def list_leave_requests(
    employee_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(LeaveRequest).where(LeaveRequest.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(LeaveRequest.employee_id == employee_id)
    if status_filter:
        stmt = stmt.where(LeaveRequest.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.order_by(LeaveRequest.id.desc()))).scalars().all()
    return [_leave_request_out(x) for x in rows]


@router.post("/requests", response_model=LeaveRequestOut, status_code=status.HTTP_201_CREATED)
async def create_leave_request(
    body: LeaveRequestCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _employee_or_404(db, tenant.id, body.employee_id)
    leave_type = await _leave_type_or_404(db, tenant.id, body.leave_type_id)
    initial_status = "PENDING" if leave_type.requires_approval else "APPROVED"
    row = LeaveRequest(
        tenant_id=tenant.id,
        employee_id=body.employee_id,
        leave_type_id=body.leave_type_id,
        from_date=body.from_date,
        to_date=body.to_date,
        days_requested=body.days_requested,
        reason=body.reason.strip() if body.reason else None,
        status=initial_status,
        requested_by=user.id,
        approved_by=user.id if initial_status == "APPROVED" else None,
        approved_at=datetime.utcnow() if initial_status == "APPROVED" else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    if initial_status == "APPROVED":
        db.add(
            LeaveApproval(
                tenant_id=tenant.id,
                leave_request_id=row.id,
                action="AUTO_APPROVED",
                action_by=user.id,
                note="Auto approved because leave type does not require approval",
            )
        )
        await db.commit()
    return _leave_request_out(row)


@router.patch("/requests/{request_id}", response_model=LeaveRequestOut)
async def update_leave_request(
    request_id: int,
    body: LeaveRequestUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(LeaveRequest, request_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if row.status not in {"DRAFT", "PENDING"}:
        raise HTTPException(status_code=400, detail="Only draft/pending requests can be edited")
    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _leave_request_out(row)


@router.post("/requests/{request_id}/submit", response_model=LeaveRequestOut)
async def submit_leave_request(
    request_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(LeaveRequest, request_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if row.status not in {"DRAFT", "PENDING"}:
        raise HTTPException(status_code=400, detail="Only draft/pending requests can be submitted")
    if row.status == "DRAFT":
        bal = await _get_or_create_balance(
            db,
            tenant_id=tenant.id,
            employee_id=row.employee_id,
            leave_type_id=row.leave_type_id,
            balance_year=row.from_date.year,
        )
        days = _to_float(row.days_requested)
        pending = _to_float(bal.pending_days) + days
        used = _to_float(bal.used_days)
        allocated = _to_float(bal.allocated_days)
        bal.pending_days = _fmt(pending)
        bal.closing_balance_days = _fmt(allocated - used - pending)
    row.status = "PENDING"
    await db.commit()
    await db.refresh(row)
    return _leave_request_out(row)


@router.post("/requests/{request_id}/approve", response_model=LeaveRequestOut)
async def approve_leave_request(
    request_id: int,
    body: LeaveDecision,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(LeaveRequest, request_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")
    row.status = "APPROVED"
    row.approved_by = user.id
    row.approved_at = datetime.utcnow()
    row.approval_note = body.note.strip() if body.note else None
    bal = await _get_or_create_balance(
        db,
        tenant_id=tenant.id,
        employee_id=row.employee_id,
        leave_type_id=row.leave_type_id,
        balance_year=row.from_date.year,
    )
    days = _to_float(row.days_requested)
    pending = max(_to_float(bal.pending_days) - days, 0.0)
    used = _to_float(bal.used_days) + days
    allocated = _to_float(bal.allocated_days)
    bal.pending_days = _fmt(pending)
    bal.used_days = _fmt(used)
    bal.closing_balance_days = _fmt(allocated - used - pending)
    db.add(
        LeaveApproval(
            tenant_id=tenant.id,
            leave_request_id=row.id,
            action="APPROVED",
            action_by=user.id,
            note=row.approval_note,
        )
    )
    await db.commit()
    await db.refresh(row)
    return _leave_request_out(row)


@router.post("/requests/{request_id}/reject", response_model=LeaveRequestOut)
async def reject_leave_request(
    request_id: int,
    body: LeaveDecision,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(LeaveRequest, request_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Leave request not found")
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")
    row.status = "REJECTED"
    row.approved_by = user.id
    row.approved_at = datetime.utcnow()
    row.approval_note = body.note.strip() if body.note else None
    bal = await _get_or_create_balance(
        db,
        tenant_id=tenant.id,
        employee_id=row.employee_id,
        leave_type_id=row.leave_type_id,
        balance_year=row.from_date.year,
    )
    days = _to_float(row.days_requested)
    pending = max(_to_float(bal.pending_days) - days, 0.0)
    used = _to_float(bal.used_days)
    allocated = _to_float(bal.allocated_days)
    bal.pending_days = _fmt(pending)
    bal.closing_balance_days = _fmt(allocated - used - pending)
    db.add(
        LeaveApproval(
            tenant_id=tenant.id,
            leave_request_id=row.id,
            action="REJECTED",
            action_by=user.id,
            note=row.approval_note,
        )
    )
    await db.commit()
    await db.refresh(row)
    return _leave_request_out(row)
