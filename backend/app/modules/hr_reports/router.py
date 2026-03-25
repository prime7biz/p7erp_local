from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import (
    HR_LIST_DEFAULT_LIMIT,
    HR_LIST_MAX_LIMIT,
    HR_REPORT_SUB_LIMIT,
    HR_REPORT_SUB_MAX,
)
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import AttendanceEntry, Employee, LeaveRequest, LeaveType, PayrollPeriod, PayrollRun, PayrollRunLine, Tenant, User

router = APIRouter(prefix="/hr/reports", tags=["hr-reports"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("/summary")
async def report_summary(
    month: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    total_employees = int(
        await db.scalar(select(func.count()).select_from(Employee).where(Employee.tenant_id == tenant.id)) or 0
    )
    pending_leave = int(
        await db.scalar(
            select(func.count()).select_from(LeaveRequest).where(
                LeaveRequest.tenant_id == tenant.id,
                LeaveRequest.status == "PENDING",
            )
        )
        or 0
    )

    att_base = AttendanceEntry.tenant_id == tenant.id
    run_base = PayrollRun.tenant_id == tenant.id
    if month and len(month) == 7 and "-" in month:
        y_s, m_s = month.split("-", 1)
        try:
            y = int(y_s)
            m = int(m_s)
            att_base = and_(att_base, extract("year", AttendanceEntry.attendance_date) == y, extract("month", AttendanceEntry.attendance_date) == m)
            run_base = and_(run_base, extract("year", PayrollRun.run_date) == y, extract("month", PayrollRun.run_date) == m)
        except ValueError:
            pass

    total_att = int(await db.scalar(select(func.count()).select_from(AttendanceEntry).where(att_base)) or 0)
    present_att = int(
        await db.scalar(
            select(func.count()).select_from(AttendanceEntry).where(
                att_base,
                func.upper(func.coalesce(AttendanceEntry.status, "")) != "ABSENT",
            )
        )
        or 0
    )
    # Match original: present = not ABSENT (includes PRESENT, LATE, HALF_DAY, LEAVE, etc.)
    attendance_rate_percent = (present_att / total_att * 100.0) if total_att else 0.0
    runs_count = int(await db.scalar(select(func.count()).select_from(PayrollRun).where(run_base)) or 0)

    return {
        "total_employees": total_employees,
        "attendance_rate_percent": round(attendance_rate_percent, 2),
        "pending_leave_requests": pending_leave,
        "payroll_runs_this_month": runs_count,
    }


@router.get("/attendance")
async def report_attendance(
    month: str | None = Query(default=None),
    department_id: int | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Max employees (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    entries_limit: int = Query(default=HR_REPORT_SUB_LIMIT, ge=1, le=HR_REPORT_SUB_MAX, description="Cap attendance rows loaded"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    employees_stmt = select(Employee).where(Employee.tenant_id == tenant.id)
    if department_id is not None:
        employees_stmt = employees_stmt.where(Employee.department_id == department_id)
    employees = (await db.execute(employees_stmt.order_by(Employee.employee_code).offset(offset).limit(limit))).scalars().all()
    att_entries = (
        await db.execute(
            select(AttendanceEntry)
            .where(
                AttendanceEntry.tenant_id == tenant.id,
                AttendanceEntry.employee_id.in_([e.id for e in employees]) if employees else False,
            )
            .order_by(AttendanceEntry.attendance_date.desc(), AttendanceEntry.id.desc())
            .limit(entries_limit)
        )
    ).scalars().all()
    if month and len(month) == 7 and "-" in month:
        y_s, m_s = month.split("-", 1)
        try:
            y = int(y_s)
            m = int(m_s)
            att_entries = [x for x in att_entries if x.attendance_date.year == y and x.attendance_date.month == m]
        except ValueError:
            pass
    output: list[dict[str, object]] = []
    for emp in employees:
        rows = [x for x in att_entries if x.employee_id == emp.id]
        full_name = f"{emp.first_name} {emp.last_name}".strip() if emp.last_name else emp.first_name
        output.append(
            {
                "employee_code": emp.employee_code,
                "employee_name": full_name,
                "present_days": sum(1 for x in rows if (x.status or "").upper() in {"PRESENT", "LATE", "HALF_DAY"}),
                "absent_days": sum(1 for x in rows if (x.status or "").upper() == "ABSENT"),
                "leave_days": sum(1 for x in rows if (x.status or "").upper() == "LEAVE"),
            }
        )
    return output


@router.get("/leave")
async def report_leave(
    year: int | None = Query(default=None),
    requests_limit: int = Query(
        default=HR_REPORT_SUB_LIMIT,
        ge=1,
        le=HR_REPORT_SUB_MAX,
        description="Cap leave requests scanned for aggregation (Finding #3)",
    ),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    leave_types = (await db.execute(select(LeaveType).where(LeaveType.tenant_id == tenant.id).order_by(LeaveType.name))).scalars().all()
    requests = (
        await db.execute(
            select(LeaveRequest)
            .where(LeaveRequest.tenant_id == tenant.id)
            .order_by(LeaveRequest.id.desc())
            .limit(requests_limit)
        )
    ).scalars().all()
    if year is not None:
        requests = [x for x in requests if x.from_date.year == year or x.to_date.year == year]
    output: list[dict[str, object]] = []
    for lt in leave_types:
        rows = [x for x in requests if x.leave_type_id == lt.id]
        output.append(
            {
                "leave_type": lt.name,
                "total_requests": len(rows),
                "approved_requests": len([x for x in rows if x.status == "APPROVED"]),
                "pending_requests": len([x for x in rows if x.status == "PENDING"]),
                "rejected_requests": len([x for x in rows if x.status == "REJECTED"]),
            }
        )
    return output


@router.get("/payroll")
async def report_payroll(
    year: int | None = Query(default=None),
    runs_limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Cap payroll runs (Finding #3)"),
    lines_limit: int = Query(default=HR_REPORT_SUB_LIMIT, ge=1, le=HR_REPORT_SUB_MAX, description="Cap payroll run lines loaded"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    periods = (await db.execute(select(PayrollPeriod).where(PayrollPeriod.tenant_id == tenant.id))).scalars().all()
    runs = (
        await db.execute(
            select(PayrollRun).where(PayrollRun.tenant_id == tenant.id).order_by(PayrollRun.id.desc()).limit(runs_limit)
        )
    ).scalars().all()
    lines = (
        await db.execute(
            select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant.id).order_by(PayrollRunLine.id.asc()).limit(lines_limit)
        )
    ).scalars().all()
    if year is not None:
        periods = [x for x in periods if x.start_date.year == year or x.end_date.year == year]
    period_map = {p.id: p for p in periods}
    output: list[dict[str, object]] = []
    for run in runs:
        period = period_map.get(run.period_id)
        if not period:
            continue
        run_lines = [x for x in lines if x.run_id == run.id]
        output.append(
            {
                "payroll_period": period.period_code,
                "total_employees": len(run_lines),
                "gross_total": float(run.gross_total or 0),
                "deduction_total": float(run.deduction_total or 0),
                "net_total": float(run.net_total or 0),
            }
        )
    return output

