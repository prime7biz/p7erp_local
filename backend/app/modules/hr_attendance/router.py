from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal, InvalidOperation

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, false, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.ownership import ensure_owned
from app.common.pagination import (
    HR_LIST_DEFAULT_LIMIT,
    HR_LIST_MAX_LIMIT,
    HR_REPORT_SUB_LIMIT,
    HR_REPORT_SUB_MAX,
)
from app.common.permissions import PERMISSION_HR_ATTENDANCE_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.modules.audit.service import log_action
from app.models import (
    AttendanceEntry,
    AttendanceHoliday,
    AttendanceRegularizationRequest,
    AttendanceRoster,
    AttendanceShift,
    Employee,
    OvertimeEntry,
    OvertimeRule,
    PayrollPeriod,
    Tenant,
    User,
)
from app.modules.hr_attendance.device_service import ENTRY_SOURCE_DEVICE
from app.modules.hr_attendance.schemas import (
    AttendanceBulkEntryBody,
    AttendanceEntryCreate,
    AttendanceEntryOut,
    AttendanceSummaryRow,
    AttendanceEntryUpdate,
    HolidayCreate,
    HolidayOut,
    HolidayUpdate,
    OvertimeEntryCreate,
    OvertimeEntryOut,
    OvertimeRuleCreate,
    OvertimeRuleOut,
    OvertimeRuleUpdate,
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


async def _require_manager_or_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


async def _assert_attendance_date_open(db: AsyncSession, tenant_id: int, day: date) -> None:
    """Attendance inside a locked (finalized) payroll period must not change."""
    locked = (
        await db.execute(
            select(PayrollPeriod.id).where(
                PayrollPeriod.tenant_id == tenant_id,
                PayrollPeriod.is_locked.is_(True),
                PayrollPeriod.start_date <= day,
                PayrollPeriod.end_date >= day,
            ).limit(1)
        )
    ).scalar_one_or_none()
    if locked is not None:
        raise HTTPException(status_code=400, detail="Attendance date falls in a locked payroll period")


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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceShift).where(AttendanceShift.tenant_id == tenant.id)
    if active_only:
        stmt = stmt.where(AttendanceShift.is_active.is_(True))
    rows = (await db.execute(stmt.order_by(AttendanceShift.name).offset(offset).limit(limit))).scalars().all()
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
        await safe_async_session_rollback(db)
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
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Shift code already exists")
    await db.refresh(row)
    return _shift_out(row)


@router.get("/rosters", response_model=list[RosterOut])
async def list_rosters(
    employee_id: int | None = Query(default=None),
    roster_date: date | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
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
    rows = (
        await db.execute(stmt.order_by(AttendanceRoster.roster_date.desc(), AttendanceRoster.id.desc()).offset(offset).limit(limit))
    ).scalars().all()
    return [_roster_out(x) for x in rows]


@router.post("/rosters", response_model=RosterOut, status_code=status.HTTP_201_CREATED)
async def create_roster(
    body: RosterCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    await _employee_or_404(db, tenant.id, body.employee_id)
    await _shift_or_404(db, tenant.id, body.shift_id)
    row = AttendanceRoster(tenant_id=tenant.id, created_by=user.id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
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
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceHoliday).where(AttendanceHoliday.tenant_id == tenant.id)
    rows = (await db.execute(stmt.order_by(AttendanceHoliday.holiday_date.desc()).offset(offset).limit(limit))).scalars().all()
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
    await _require_manager_or_admin(db, user, tenant.id)
    row = AttendanceHoliday(tenant_id=tenant.id, **body.model_dump())
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
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
    await _require_manager_or_admin(db, user, tenant.id)
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
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
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
    rows = (
        await db.execute(stmt.order_by(AttendanceEntry.attendance_date.desc(), AttendanceEntry.id.desc()).offset(offset).limit(limit))
    ).scalars().all()
    return [_entry_out(x) for x in rows]


@router.post("/entries", response_model=AttendanceEntryOut, status_code=status.HTTP_201_CREATED)
async def create_entry(
    body: AttendanceEntryCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    await _employee_or_404(db, tenant.id, body.employee_id)
    await _assert_attendance_date_open(db, tenant.id, body.attendance_date)
    payload = body.model_dump()
    payload["status"] = payload["status"].strip().upper()
    payload["source"] = payload["source"].strip().upper()
    row = AttendanceEntry(tenant_id=tenant.id, created_by=user.id, **payload)
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
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
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    row = await _entry_or_404(db, tenant.id, entry_id)
    await _assert_attendance_date_open(db, tenant.id, row.attendance_date)
    payload = body.model_dump(exclude_unset=True)
    if payload.get("attendance_date") is not None:
        await _assert_attendance_date_open(db, tenant.id, payload["attendance_date"])
    if payload.get("status") is not None:
        payload["status"] = payload["status"].strip().upper()
    if payload.get("source") is not None:
        payload["source"] = payload["source"].strip().upper()
    hand_edited = any(k in payload and getattr(row, k) != payload[k] for k in ("in_time", "out_time", "status"))
    if hand_edited and (row.source or "").upper() == ENTRY_SOURCE_DEVICE and payload.get("source") is None:
        # Device imports never overwrite non-DEVICE entries, so the correction survives re-imports.
        payload["source"] = "MANUAL"
    changes = {k: (str(getattr(row, k, None)), str(v)) for k, v in payload.items() if getattr(row, k, None) != v}
    for key, value in payload.items():
        setattr(row, key, value)
    if changes:
        await log_action(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            action="ATTENDANCE_ENTRY_EDITED",
            resource="hr.attendance",
            details=f"entry:{row.id} " + "; ".join(f"{k}: {a} -> {b}" for k, (a, b) in changes.items()),
        )
    await db.commit()
    await db.refresh(row)
    return _entry_out(row)


@router.get("/regularizations", response_model=list[RegularizationOut])
async def list_regularizations(
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(AttendanceRegularizationRequest).where(AttendanceRegularizationRequest.tenant_id == tenant.id)
    if status_filter:
        stmt = stmt.where(AttendanceRegularizationRequest.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.order_by(AttendanceRegularizationRequest.id.desc()).offset(offset).limit(limit))).scalars().all()
    return [_regularization_out(x) for x in rows]


def month_date_condition(column, month: str | None):
    """SQL filter for a "YYYY-MM" month on a date column. None means "no month filter"."""
    if not (month and len(month) == 7 and "-" in month):
        return None
    year_str, mon_str = month.split("-", 1)
    try:
        y = int(year_str)
        m = int(mon_str)
    except ValueError:
        return None
    if not (1 <= y <= 9998 and 1 <= m <= 12):
        return false()
    start = date(y, m, 1)
    end = date(y + 1, 1, 1) if m == 12 else date(y, m + 1, 1)
    return and_(column >= start, column < end)


async def attendance_status_counts(
    db: AsyncSession, tenant_id: int, employee_ids: list[int], month: str | None
) -> dict[int, dict[str, int]]:
    """{employee_id: {UPPER(status): number of attendance rows}} for the given employees (and month)."""
    if not employee_ids:
        return {}
    status_upper = func.upper(AttendanceEntry.status)
    stmt = select(AttendanceEntry.employee_id, status_upper, func.count()).where(
        AttendanceEntry.tenant_id == tenant_id,
        AttendanceEntry.employee_id.in_(employee_ids),
    )
    month_filter = month_date_condition(AttendanceEntry.attendance_date, month)
    if month_filter is not None:
        stmt = stmt.where(month_filter)
    rows = await db.execute(stmt.group_by(AttendanceEntry.employee_id, status_upper))
    counts: dict[int, dict[str, int]] = {}
    for employee_id, status_value, n in rows.all():
        counts.setdefault(employee_id, {})[status_value or ""] = int(n)
    return counts


@router.get("/summary", response_model=list[AttendanceSummaryRow])
async def attendance_summary(
    month: str | None = Query(default=None, description="YYYY-MM"),
    department_id: int | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Max employees in summary (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    entries_limit: int = Query(
        default=HR_REPORT_SUB_LIMIT,
        ge=1,
        le=HR_REPORT_SUB_MAX,
        description="Deprecated, ignored: counts are aggregated in SQL over all matching rows",
    ),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    employee_stmt = select(Employee).where(Employee.tenant_id == tenant.id)
    if department_id is not None:
        employee_stmt = employee_stmt.where(Employee.department_id == department_id)
    employees = (
        await db.execute(employee_stmt.order_by(Employee.employee_code).offset(offset).limit(limit))
    ).scalars().all()
    if not employees:
        return []

    counts = await attendance_status_counts(db, tenant.id, [e.id for e in employees], month)

    result: list[AttendanceSummaryRow] = []
    for emp in employees:
        by_status = counts.get(emp.id, {})
        present = sum(by_status.get(s, 0) for s in ("PRESENT", "LATE", "HALF_DAY"))
        absent = by_status.get("ABSENT", 0)
        late = by_status.get("LATE", 0)
        leave_days = by_status.get("LEAVE", 0)
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
    await _require_manager_or_admin(db, user, tenant.id)
    req = await db.get(AttendanceRegularizationRequest, request_id)
    if not req or req.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Regularization request not found")
    if req.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending requests can be approved")
    entry = await _entry_or_404(db, tenant.id, req.attendance_entry_id)
    await _assert_attendance_date_open(db, tenant.id, entry.attendance_date)
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
    await _require_manager_or_admin(db, user, tenant.id)
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


def _ot_rule_out(row: OvertimeRule) -> OvertimeRuleOut:
    return OvertimeRuleOut(
        id=row.id,
        tenant_id=row.tenant_id,
        code=row.code,
        name=row.name,
        employee_category=row.employee_category,
        max_ot_hours_per_day=row.max_ot_hours_per_day,
        weekday_multiplier=row.weekday_multiplier,
        weekend_multiplier=row.weekend_multiplier,
        holiday_multiplier=row.holiday_multiplier,
        is_active=row.is_active,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _ot_entry_out(row: OvertimeEntry) -> OvertimeEntryOut:
    return OvertimeEntryOut(
        id=row.id,
        tenant_id=row.tenant_id,
        employee_id=row.employee_id,
        work_date=row.work_date,
        ot_hours=str(row.ot_hours),
        ot_type=row.ot_type,
        rate_multiplier=str(row.rate_multiplier),
        amount=str(row.amount) if row.amount is not None else None,
        rule_id=row.rule_id,
        status=row.status,
        approved_by=row.approved_by,
        approved_at=row.approved_at.isoformat() if row.approved_at else None,
        remarks=row.remarks,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/overtime-rules", response_model=list[OvertimeRuleOut])
async def list_overtime_rules(
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(
            select(OvertimeRule)
            .where(OvertimeRule.tenant_id == tenant.id)
            .order_by(OvertimeRule.code)
            .offset(offset)
            .limit(limit)
        )
    ).scalars().all()
    return [_ot_rule_out(r) for r in rows]


@router.post("/overtime-rules", response_model=OvertimeRuleOut, status_code=status.HTTP_201_CREATED)
async def create_overtime_rule(
    body: OvertimeRuleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    code = body.code.strip()
    row = OvertimeRule(
        tenant_id=tenant.id,
        code=code,
        name=body.name.strip(),
        employee_category=body.employee_category.strip() if body.employee_category else None,
        max_ot_hours_per_day=body.max_ot_hours_per_day,
        weekday_multiplier=body.weekday_multiplier,
        weekend_multiplier=body.weekend_multiplier,
        holiday_multiplier=body.holiday_multiplier,
        is_active=body.is_active,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Overtime rule code already exists")
    await db.refresh(row)
    return _ot_rule_out(row)


@router.patch("/overtime-rules/{rule_id}", response_model=OvertimeRuleOut)
async def update_overtime_rule(
    rule_id: int,
    body: OvertimeRuleUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = await db.get(OvertimeRule, rule_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Rule not found")
    payload = body.model_dump(exclude_unset=True)
    for k, v in payload.items():
        if v is None:
            continue
        if k in {"code", "name"} and isinstance(v, str):
            setattr(row, k, v.strip())
        elif k == "employee_category" and isinstance(v, str):
            row.employee_category = v.strip() or None
        else:
            setattr(row, k, v)
    try:
        await db.commit()
    except IntegrityError:
        await safe_async_session_rollback(db)
        raise HTTPException(status_code=400, detail="Overtime rule code already exists")
    await db.refresh(row)
    return _ot_rule_out(row)


@router.get("/overtime", response_model=list[OvertimeEntryOut])
async def list_overtime_entries(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(OvertimeEntry).where(OvertimeEntry.tenant_id == tenant.id).order_by(OvertimeEntry.work_date.desc())
    if status_filter:
        stmt = stmt.where(OvertimeEntry.status == status_filter.strip().upper())
    rows = (await db.execute(stmt.limit(500))).scalars().all()
    return [_ot_entry_out(r) for r in rows]


@router.post("/overtime", response_model=OvertimeEntryOut, status_code=status.HTTP_201_CREATED)
async def create_overtime_entry(
    body: OvertimeEntryCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    await _employee_or_404(db, tenant.id, body.employee_id)
    await ensure_owned(db, OvertimeRule, body.rule_id, tenant.id, "Overtime rule")
    try:
        ot_hours = Decimal(str(body.ot_hours).strip())
        rate_multiplier = Decimal(str(body.rate_multiplier).strip())
    except InvalidOperation:
        raise HTTPException(status_code=400, detail="ot_hours and rate_multiplier must be numbers")
    if not ot_hours.is_finite() or not rate_multiplier.is_finite() or ot_hours < 0 or rate_multiplier < 0:
        raise HTTPException(status_code=400, detail="ot_hours and rate_multiplier must be non-negative numbers")
    row = OvertimeEntry(
        tenant_id=tenant.id,
        employee_id=body.employee_id,
        work_date=body.work_date,
        ot_hours=ot_hours,
        ot_type=body.ot_type,
        rate_multiplier=rate_multiplier,
        amount=None,
        rule_id=body.rule_id,
        status="PENDING",
        remarks=body.remarks.strip() if body.remarks else None,
        created_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _ot_entry_out(row)


@router.post("/overtime/{entry_id}/approve", response_model=OvertimeEntryOut)
async def approve_overtime_entry(
    entry_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    row = await db.get(OvertimeEntry, entry_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Overtime entry not found")
    if row.status != "PENDING":
        raise HTTPException(status_code=400, detail="Only pending entries can be approved")
    row.status = "APPROVED"
    row.approved_by = user.id
    row.approved_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _ot_entry_out(row)


@router.post("/entries/bulk", response_model=dict)
async def bulk_create_entries(
    body: AttendanceBulkEntryBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await _require_manager_or_admin(db, user, tenant.id)
    from sqlalchemy.dialects.postgresql import insert as pg_insert

    n = 0
    for r in body.rows:
        await _employee_or_404(db, tenant.id, r.employee_id)
        await _assert_attendance_date_open(db, tenant.id, r.attendance_date)
        values = {
            "tenant_id": tenant.id,
            "employee_id": r.employee_id,
            "attendance_date": r.attendance_date,
            "in_time": r.in_time,
            "out_time": r.out_time,
            "status": (r.status or "PRESENT").strip().upper(),
            "source": (r.source or "MANUAL").strip().upper(),
            "overtime_minutes": r.overtime_minutes,
            "remarks": r.remarks,
            "created_by": user.id,
        }
        # Re-importing a day updates it instead of failing the whole batch on the unique key.
        stmt = pg_insert(AttendanceEntry).values(**values)
        stmt = stmt.on_conflict_do_update(
            constraint="uq_hr_attendance_entries_employee_date",
            set_={k: stmt.excluded[k] for k in ("in_time", "out_time", "status", "source", "overtime_minutes", "remarks")},
        )
        await db.execute(stmt)
        n += 1
    await db.commit()
    return {"ok": True, "created": n}
