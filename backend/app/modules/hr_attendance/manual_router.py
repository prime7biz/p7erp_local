"""Two-step manual attendance: record IN now, OUT later (same attendance ledger as device punches).

POST /hr/attendance/manual/in             hr.attendance.manage  employee (id or code) + date + IN time -> OPEN entry
POST /hr/attendance/manual/out            hr.attendance.manage  adds OUT to the open entry; computes late / early / OT
GET  /hr/attendance/manual/missing-out    hr.attendance.manage  OPEN entries (IN without OUT)
GET  /hr/attendance/manual/lookup         hr.attendance.manage  find an employee by ID / scanned card

An OPEN entry is neither "present" nor "absent" for payroll; payroll finalization is refused while
the period still has OPEN entries (see hr_payroll router ``finalize_run``).
"""

from __future__ import annotations

from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.permissions import PERMISSION_HR_ATTENDANCE_MANAGE, assert_hr_manager_or_permission
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, AttendanceRoster, AttendanceShift
from app.modules.audit.service import log_action
from app.modules.hr.hr_document_generator_service import verify_employee_card_qr
from app.modules.hr_attendance.device_service import build_entry_values

router = APIRouter(prefix="/hr/attendance/manual", tags=["hr-attendance-manual"])

OPEN_STATUS = "OPEN"


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


class ManualIn(BaseModel):
    employee_id: int | None = None
    employee_code: str | None = Field(None, max_length=200, description="Employee number or scanned ID-card QR")
    work_date: date
    in_time: time
    reason: str = Field(..., min_length=2, max_length=500)

    @model_validator(mode="after")
    def _who(self) -> "ManualIn":
        if self.employee_id is None and not (self.employee_code or "").strip():
            raise ValueError("Give employee_id or employee_code")
        return self


class ManualOut(BaseModel):
    employee_id: int | None = None
    employee_code: str | None = Field(None, max_length=200)
    work_date: date
    out_time: time
    out_next_day: bool = Field(default=False, description="OUT is after midnight (night shift)")
    reason: str = Field(..., min_length=2, max_length=500)

    @model_validator(mode="after")
    def _who(self) -> "ManualOut":
        if self.employee_id is None and not (self.employee_code or "").strip():
            raise ValueError("Give employee_id or employee_code")
        return self


async def resolve_employee(db: AsyncSession, tenant_id: int, employee_id: int | None, code: str | None) -> Employee:
    if employee_id is not None:
        emp = await db.get(Employee, employee_id)
    else:
        text = (code or "").strip()
        card = verify_employee_card_qr(text) if text.startswith("P7EMP:") else None
        if text.startswith("P7EMP:") and (card is None or card[0] != tenant_id):
            raise HTTPException(status_code=404, detail="Employee not found")
        lookup = card[1] if card else text
        emp = (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, func.upper(Employee.employee_code) == lookup.upper())
            )
        ).scalar_one_or_none()
    if emp is None or emp.tenant_id != tenant_id:
        raise HTTPException(status_code=404, detail="Employee not found")
    if not emp.is_active:
        raise HTTPException(status_code=409, detail="Employee is not active")
    return emp


async def _assert_open_period(db: AsyncSession, tenant_id: int, day: date) -> None:
    from app.modules.hr_attendance.router import _assert_attendance_date_open

    await _assert_attendance_date_open(db, tenant_id, day)


async def _shift_for(db: AsyncSession, tenant_id: int, employee_id: int, day: date) -> AttendanceShift | None:
    roster = (
        await db.execute(
            select(AttendanceRoster).where(
                AttendanceRoster.tenant_id == tenant_id, AttendanceRoster.employee_id == employee_id, AttendanceRoster.roster_date == day
            )
        )
    ).scalar_one_or_none()
    if roster is None or roster.is_week_off:
        return None
    shift = await db.get(AttendanceShift, roster.shift_id)
    return shift if shift is not None and shift.tenant_id == tenant_id else None


def _entry_dict(e: AttendanceEntry, emp: Employee | None = None) -> dict:
    out = {
        "id": e.id,
        "employee_id": e.employee_id,
        "attendance_date": e.attendance_date.isoformat(),
        "in_time": e.in_time.isoformat() if e.in_time else None,
        "out_time": e.out_time.isoformat() if e.out_time else None,
        "status": e.status,
        "source": e.source,
        "late_minutes": e.late_minutes,
        "early_out_minutes": e.early_out_minutes,
        "overtime_minutes": e.overtime_minutes,
        "remarks": e.remarks,
    }
    if emp is not None:
        out["employee_code"] = emp.employee_code
        out["employee_name"] = " ".join(p for p in (emp.first_name, emp.last_name) if p)
    return out


def recompute_closed_entry(entry: AttendanceEntry, shift: AttendanceShift | None, out_next_day: bool) -> None:
    in_dt = datetime.combine(entry.attendance_date, entry.in_time)
    out_dt = datetime.combine(entry.attendance_date + timedelta(days=1 if out_next_day else 0), entry.out_time)
    if out_dt <= in_dt:
        raise HTTPException(status_code=400, detail="OUT must be after IN (tick 'next day' for a night shift)")
    if out_dt - in_dt > timedelta(hours=24):
        raise HTTPException(status_code=400, detail="A shift cannot be longer than 24 hours")
    values = build_entry_values(entry.attendance_date, [in_dt, out_dt], shift)
    for key in ("status", "late_minutes", "early_out_minutes", "overtime_minutes"):
        setattr(entry, key, values[key])


@router.get("/lookup")
async def lookup_employee(
    q: str = Query(..., min_length=1, max_length=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    try:
        emp = await resolve_employee(db, tenant.id, None, q)
    except HTTPException as exc:
        if exc.status_code == 409:  # inactive looks the same as unknown here
            raise HTTPException(status_code=404, detail="Employee not found") from exc
        raise
    return {"id": emp.id, "employee_code": emp.employee_code, "name": " ".join(p for p in (emp.first_name, emp.last_name) if p)}


@router.post("/in", status_code=status.HTTP_201_CREATED)
async def manual_in(
    body: ManualIn,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    emp = await resolve_employee(db, tenant.id, body.employee_id, body.employee_code)
    await _assert_open_period(db, tenant.id, body.work_date)
    # Lock the employee row so two clerks cannot both create the day's entry.
    await db.execute(select(Employee.id).where(Employee.id == emp.id).with_for_update())
    existing = (
        await db.execute(
            select(AttendanceEntry).where(
                AttendanceEntry.tenant_id == tenant.id,
                AttendanceEntry.employee_id == emp.id,
                AttendanceEntry.attendance_date == body.work_date,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        what = "an open IN (add the OUT instead)" if existing.status == OPEN_STATUS else f"a {existing.status} entry"
        raise HTTPException(status_code=409, detail=f"{emp.employee_code} already has {what} on {body.work_date}")
    entry = AttendanceEntry(
        tenant_id=tenant.id, employee_id=emp.id, attendance_date=body.work_date, in_time=body.in_time,
        out_time=None, status=OPEN_STATUS, source="MANUAL", remarks=f"Manual IN: {body.reason.strip()}",
        created_by=user.id,
    )
    shift = await _shift_for(db, tenant.id, emp.id, body.work_date)
    if shift is not None:
        values = build_entry_values(body.work_date, [datetime.combine(body.work_date, body.in_time)], shift)
        entry.late_minutes = values["late_minutes"]
    db.add(entry)
    await db.flush()
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_ATTENDANCE_MANUAL_IN",
                     resource=f"hr.attendance:{entry.id}", details=f"{emp.employee_code} {body.work_date} IN {body.in_time}: {body.reason.strip()}")
    await db.commit()
    await db.refresh(entry)
    return _entry_dict(entry, emp)


@router.post("/out")
async def manual_out(
    body: ManualOut,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    emp = await resolve_employee(db, tenant.id, body.employee_id, body.employee_code)
    await _assert_open_period(db, tenant.id, body.work_date)
    entry = (
        await db.execute(
            select(AttendanceEntry)
            .where(
                AttendanceEntry.tenant_id == tenant.id,
                AttendanceEntry.employee_id == emp.id,
                AttendanceEntry.attendance_date == body.work_date,
            )
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one_or_none()
    if entry is None:
        raise HTTPException(status_code=404, detail=f"No IN recorded for {emp.employee_code} on {body.work_date}")
    if entry.status != OPEN_STATUS or entry.in_time is None:
        raise HTTPException(status_code=409, detail="This day is already closed; use regularization to correct it")
    before = f"IN {entry.in_time} OUT {entry.out_time} {entry.status}"
    entry.out_time = body.out_time
    shift = await _shift_for(db, tenant.id, emp.id, body.work_date)
    next_day = body.out_next_day or (shift is not None and shift.is_night_shift and body.out_time < entry.in_time)
    recompute_closed_entry(entry, shift, next_day)
    entry.remarks = ((entry.remarks or "") + f" | Manual OUT: {body.reason.strip()}")[:2000]
    await log_action(db, tenant_id=tenant.id, user_id=user.id, action="HR_ATTENDANCE_MANUAL_OUT",
                     resource=f"hr.attendance:{entry.id}",
                     details=f"{emp.employee_code} {body.work_date}: {before} -> IN {entry.in_time} OUT {entry.out_time} {entry.status}")
    await db.commit()
    await db.refresh(entry)
    return _entry_dict(entry, emp)


@router.get("/missing-out")
async def missing_out(
    date_from: date | None = None,
    date_to: date | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await assert_hr_manager_or_permission(db, user, tenant.id, permission_key=PERMISSION_HR_ATTENDANCE_MANAGE)
    stmt = (
        select(AttendanceEntry, Employee)
        .join(Employee, Employee.id == AttendanceEntry.employee_id)
        .where(AttendanceEntry.tenant_id == tenant.id, Employee.tenant_id == tenant.id, AttendanceEntry.status == OPEN_STATUS)
    )
    if date_from:
        stmt = stmt.where(AttendanceEntry.attendance_date >= date_from)
    if date_to:
        stmt = stmt.where(AttendanceEntry.attendance_date <= date_to)
    rows = (await db.execute(stmt.order_by(AttendanceEntry.attendance_date, Employee.employee_code).limit(1000))).all()
    return [_entry_dict(e, emp) for e, emp in rows]


async def count_open_entries(db: AsyncSession, tenant_id: int, start: date, end: date) -> int:
    return int(
        (
            await db.execute(
                select(func.count(AttendanceEntry.id)).where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.status == OPEN_STATUS,
                    AttendanceEntry.attendance_date >= start,
                    AttendanceEntry.attendance_date <= end,
                )
            )
        ).scalar_one()
    )
