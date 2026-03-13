from __future__ import annotations

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AttendanceEntry,
    AttendanceHoliday,
    AttendanceRegularizationRequest,
    AttendanceRoster,
    AttendanceShift,
    Employee,
    Role,
    Tenant,
    User,
)
from app.modules.hr_attendance.schemas import (
    AttendanceEntryCreate,
    AttendanceEntryOut,
    AttendanceSummaryRow,
    AttendanceEntryUpdate,
    HolidayCreate,
    HolidayOut,
    HolidayUpdate,
    RegularizationCreate,
    RegularizationDecision,
    RegularizationOut,
    RosterCreate,
    RosterOut,
    RosterUpdate,
    ShiftCreate,
    ShiftOut,
    ShiftUpdate,
)

router = APIRouter(prefix="/hr/attendance", tags=["hr-attendance"])


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


async def _shift_or_404(db: AsyncSession, tenant_id: int, shift_id: int) -> AttendanceShift:
    row = await db.get(AttendanceShift, shift_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Shift not found")
    return row


async def _entry_or_404(db: AsyncSession, tenant_id: int, entry_id: int) -> AttendanceEntry:
    row = await db.get(AttendanceEntry, entry_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Attendance entry not found")
    return row


def _shift_out(row: AttendanceShift) -> ShiftOut:
    return ShiftOut(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        start_time=row.start_time,
        end_time=row.end_time,
        grace_in_minutes=row.grace_in_minutes,
        break_minutes=row.break_minutes,
        is_night_shift=row.is_night_shift,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _roster_out(row: AttendanceRoster) -> RosterOut:
    return RosterOut(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        roster_date=row.roster_date,
        shift_id=row.shift_id,
        is_week_off=row.is_week_off,
        note=row.note,
        created_by=row.created_by,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _holiday_out(row: AttendanceHoliday) -> HolidayOut:
    return HolidayOut(
        id=row.id,
        tenant_id=row.tenant_id,
        holiday_date=row.holiday_date,
        name=row.name,
        is_optional=row.is_optional,
        note=row.note,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _entry_out(row: AttendanceEntry) -> AttendanceEntryOut:
    return AttendanceEntryOut(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        attendance_date=row.attendance_date,
        in_time=row.in_time,
        out_time=row.out_time,
        status=row.status,
        source=row.source,
        late_minutes=row.late_minutes,
        early_out_minutes=row.early_out_minutes,
        overtime_minutes=row.overtime_minutes,
        remarks=row.remarks,
        created_by=row.created_by,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _regularization_out(row: AttendanceRegularizationRequest) -> RegularizationOut:
    return RegularizationOut(
        id=row.id,
        tenant_id=row.tenant_id,
        attendance_entry_id=row.attendance_entry_id,
        requested_in_time=row.requested_in_time,
        requested_out_time=row.requested_out_time,
        reason=row.reason,
        status=row.status,
        requested_by=row.requested_by,
        approved_by=row.approved_by,
        decision_note=row.decision_note,
        decided_at=row.decided_at.isoformat() if row.decided_at else None,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/shifts", response_model=list[ShiftOut])
async def list_shifts(
    active_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceShift).where(AttendanceShift.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(AttendanceShift.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(AttendanceShift.name))).scalars().all()
    return [_shift_out(x) for x in rows]


@router.post("/shifts", response_model=ShiftOut, status_code=status.HTTP_201_CREATED)
async def create_shift(
    body: ShiftCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = AttendanceShift(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Shift code already exists")
    await db.refresh(row)
    return _shift_out(row)


@router.patch("/shifts/{shift_id}", response_model=ShiftOut)
async def update_shift(
    shift_id: int,
    body: ShiftUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await _shift_or_404(db, tenant.id, shift_id)
    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Shift code already exists")
    await db.refresh(row)
    return _shift_out(row)


@router.get("/rosters", response_model=list[RosterOut])
async def list_rosters(
    employee_id: int | None = Query(default=None),
    roster_date: date | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceRoster).where(AttendanceRoster.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(AttendanceRoster.employee_id == employee_id)
    if roster_date:
        stmt = stmt.where(AttendanceRoster.roster_date == roster_date)
    rows = (await db.execute(stmt.order_by(AttendanceRoster.roster_date.desc(), AttendanceRoster.id.desc()))).scalars().all()
    return [_roster_out(x) for x in rows]


@router.post("/rosters", response_model=RosterOut, status_code=status.HTTP_201_CREATED)
async def create_roster(
    body: RosterCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _employee_or_404(db, tenant.id, body.employee_id)
    await _shift_or_404(db, tenant.id, body.shift_id)
    row = AttendanceRoster(tenant_id=tenant.id, created_by=user.id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Roster already exists for employee and date")
    await db.refresh(row)
    return _roster_out(row)


@router.patch("/rosters/{roster_id}", response_model=RosterOut)
async def update_roster(
    roster_id: int,
    body: RosterUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(AttendanceRoster, roster_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Roster not found")
    payload = body.model_dump(exclude_unset=True)
    if payload.get("shift_id") is not None:
        await _shift_or_404(db, tenant.id, payload["shift_id"])
    for key, value in payload.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _roster_out(row)


@router.get("/holidays", response_model=list[HolidayOut])
async def list_holidays(
    year: int | None = Query(default=None, ge=2000, le=2100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceHoliday).where(AttendanceHoliday.tenant_id == tenant.id)
    rows = (await db.execute(stmt.order_by(AttendanceHoliday.holiday_date.desc()))).scalars().all()
    if year is not None:
        rows = [x for x in rows if x.holiday_date.year == year]
    return [_holiday_out(x) for x in rows]


@router.post("/holidays", response_model=HolidayOut, status_code=status.HTTP_201_CREATED)
async def create_holiday(
    body: HolidayCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = AttendanceHoliday(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Holiday already exists for this date")
    await db.refresh(row)
    return _holiday_out(row)


@router.patch("/holidays/{holiday_id}", response_model=HolidayOut)
async def update_holiday(
    holiday_id: int,
    body: HolidayUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await db.get(AttendanceHoliday, holiday_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Holiday not found")
    payload = body.model_dump(exclude_unset=True)
    for key, value in payload.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _holiday_out(row)


@router.get("/entries", response_model=list[AttendanceEntryOut])
async def list_entries(
    employee_id: int | None = Query(default=None),
    attendance_date: date | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceEntry).where(AttendanceEntry.tenant_id == tenant.id)
    if employee_id is not None:
        stmt = stmt.where(AttendanceEntry.employee_id == employee_id)
    if attendance_date:
        stmt = stmt.where(AttendanceEntry.attendance_date == attendance_date)
    if status_filter:
        stmt = stmt.where(AttendanceEntry.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.order_by(AttendanceEntry.attendance_date.desc(), AttendanceEntry.id.desc()))).scalars().all()
    return [_entry_out(x) for x in rows]


@router.post("/entries", response_model=AttendanceEntryOut, status_code=status.HTTP_201_CREATED)
async def create_entry(
    body: AttendanceEntryCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _employee_or_404(db, tenant.id, body.employee_id)
    payload = body.model_dump()
    payload["status"] = payload["status"].strip().upper()
    payload["source"] = payload["source"].strip().upper()
    row = AttendanceEntry(tenant_id=tenant.id, created_by=user.id, **payload)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=400, detail="Attendance already exists for employee and date")
    await db.refresh(row)
    return _entry_out(row)


@router.patch("/entries/{entry_id}", response_model=AttendanceEntryOut)
async def update_entry(
    entry_id: int,
    body: AttendanceEntryUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await _entry_or_404(db, tenant.id, entry_id)
    payload = body.model_dump(exclude_unset=True)
    if payload.get("status") is not None:
        payload["status"] = payload["status"].strip().upper()
    if payload.get("source") is not None:
        payload["source"] = payload["source"].strip().upper()
    for key, value in payload.items():
        setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _entry_out(row)


@router.get("/regularizations", response_model=list[RegularizationOut])
async def list_regularizations(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceRegularizationRequest).where(AttendanceRegularizationRequest.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(AttendanceRegularizationRequest.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.order_by(AttendanceRegularizationRequest.id.desc()))).scalars().all()
    return [_regularization_out(x) for x in rows]


@router.get("/summary", response_model=list[AttendanceSummaryRow])
async def attendance_summary(
    month: str | None = Query(default=None, description="YYYY-MM"),
    department_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    employee_stmt = select(Employee).where(Employee.tenant_id == tenant.id)
    if department_id is not None:
        employee_stmt = employee_stmt.where(Employee.department_id == department_id)
    employees = (await db.execute(employee_stmt.order_by(Employee.employee_code))).scalars().all()
    if not employees:
        return []

    entries = (
        await db.execute(
            select(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant.id,
                AttendanceEntry.employee_id.in_([e.id for e in employees]),
            )
        )
    ).scalars().all()

    if month and len(month) == 7 and "-" in month:
        year_str, mon_str = month.split("-", 1)
        try:
            y = int(year_str)
            m = int(mon_str)
            entries = [x for x in entries if x.attendance_date.year == y and x.attendance_date.month == m]
        except ValueError:
            pass

    result: list[AttendanceSummaryRow] = []
    for emp in employees:
        emp_entries = [x for x in entries if x.employee_id == emp.id]
        present = sum(1 for x in emp_entries if (x.status or "").upper() in {"PRESENT", "LATE", "HALF_DAY"})
        absent = sum(1 for x in emp_entries if (x.status or "").upper() == "ABSENT")
        late = sum(1 for x in emp_entries if (x.status or "").upper() == "LATE")
        leave_days = sum(1 for x in emp_entries if (x.status or "").upper() == "LEAVE")
        full_name = f"{emp.first_name} {emp.last_name}".strip() if emp.last_name else emp.first_name
        result.append(
            AttendanceSummaryRow(
                employee_id=emp.id,
                employee_code=emp.employee_code,
                employee_name=full_name,
                present_days=present,
                absent_days=absent,
                late_days=late,
                leave_days=leave_days,
            )
        )
    return result


@router.post("/regularizations", response_model=RegularizationOut, status_code=status.HTTP_201_CREATED)
async def create_regularization(
    body: RegularizationCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _entry_or_404(db, tenant.id, body.attendance_entry_id)
    row = AttendanceRegularizationRequest(
        tenant_id=tenant.id,
        attendance_entry_id=body.attendance_entry_id,
        requested_in_time=body.requested_in_time,
        requested_out_time=body.requested_out_time,
        reason=body.reason.strip(),
        requested_by=user.id,
        status="PENDING",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _regularization_out(row)


@router.post("/regularizations/{request_id}/approve", response_model=RegularizationOut)
async def approve_regularization(
    request_id: int,
    body: RegularizationDecision,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    req = await db.get(AttendanceRegularizationRequest, request_id)
    if not req or req.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Regularization request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")
    entry = await _entry_or_404(db, tenant.id, req.attendance_entry_id)
    if req.requested_in_time is not None:
        entry.in_time = req.requested_in_time
    if req.requested_out_time is not None:
        entry.out_time = req.requested_out_time
    req.status = "APPROVED"
    req.approved_by = user.id
    req.decision_note = body.decision_note.strip() if body.decision_note else None
    req.decided_at = datetime.utcnow()
    await db.commit()
    await db.refresh(req)
    return _regularization_out(req)


@router.post("/regularizations/{request_id}/reject", response_model=RegularizationOut)
async def reject_regularization(
    request_id: int,
    body: RegularizationDecision,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    req = await db.get(AttendanceRegularizationRequest, request_id)
    if not req or req.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Regularization request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be rejected")
    req.status = "REJECTED"
    req.approved_by = user.id
    req.decision_note = body.decision_note.strip() if body.decision_note else None
    req.decided_at = datetime.utcnow()
    await db.commit()
    await db.refresh(req)
    return _regularization_out(req)
