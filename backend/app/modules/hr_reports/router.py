from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, extract, func, or_, select
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
from app.modules.hr_attendance.router import attendance_status_counts

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
    employees_stmt = select(Employee).where(Employee.tenant_id == tenant.id)
    if department_id is not None:
        employees_stmt = employees_stmt.where(Employee.department_id == department_id)
    employees = (await db.execute(employees_stmt.order_by(Employee.employee_code).offset(offset).limit(limit))).scalars().all()
    counts = await attendance_status_counts(db, tenant.id, [e.id for e in employees], month)
    output: list[dict[str, object]] = []
    for emp in employees:
        by_status = counts.get(emp.id, {})
        full_name = f"{emp.first_name} {emp.last_name}".strip() if emp.last_name else emp.first_name
        output.append(
            {
                "employee_code": emp.employee_code,
                "employee_name": full_name,
                "present_days": sum(by_status.get(s, 0) for s in ("PRESENT", "LATE", "HALF_DAY")),
                "absent_days": by_status.get("ABSENT", 0),
                "leave_days": by_status.get("LEAVE", 0),
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
        description="Deprecated, ignored: counts are aggregated in SQL over all matching rows",
    ),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    leave_types = (
        (
            await db.execute(
                select(LeaveType)
                .where(LeaveType.tenant_id == tenant.id)
                .order_by(LeaveType.name)
                .limit(HR_LIST_MAX_LIMIT)
            )
        )
        .scalars()
        .all()
    )
    counts_stmt = select(LeaveRequest.leave_type_id, LeaveRequest.status, func.count()).where(
        LeaveRequest.tenant_id == tenant.id
    )
    if year is not None:
        counts_stmt = counts_stmt.where(
            or_(extract("year", LeaveRequest.from_date) == year, extract("year", LeaveRequest.to_date) == year)
        )
    counts_rows = await db.execute(counts_stmt.group_by(LeaveRequest.leave_type_id, LeaveRequest.status))
    counts: dict[int, dict[str, int]] = {}
    for leave_type_id, status_value, n in counts_rows.all():
        counts.setdefault(leave_type_id, {})[status_value] = int(n)
    output: list[dict[str, object]] = []
    for lt in leave_types:
        by_status = counts.get(lt.id, {})
        output.append(
            {
                "leave_type": lt.name,
                "total_requests": sum(by_status.values()),
                "approved_requests": by_status.get("APPROVED", 0),
                "pending_requests": by_status.get("PENDING", 0),
                "rejected_requests": by_status.get("REJECTED", 0),
            }
        )
    return output


@router.get("/payroll")
async def report_payroll(
    year: int | None = Query(default=None),
    runs_limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Cap payroll runs (Finding #3)"),
    lines_limit: int = Query(
        default=HR_REPORT_SUB_LIMIT,
        ge=1,
        le=HR_REPORT_SUB_MAX,
        description="Deprecated, ignored: employee counts are aggregated in SQL",
    ),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    runs = (
        await db.execute(
            select(PayrollRun).where(PayrollRun.tenant_id == tenant.id).order_by(PayrollRun.id.desc()).limit(runs_limit)
        )
    ).scalars().all()
    if not runs:
        return []
    periods = (
        await db.execute(
            select(PayrollPeriod).where(
                PayrollPeriod.tenant_id == tenant.id,
                PayrollPeriod.id.in_({run.period_id for run in runs}),
            )
        )
    ).scalars().all()
    if year is not None:
        periods = [x for x in periods if x.start_date.year == year or x.end_date.year == year]
    period_map = {p.id: p for p in periods}
    line_counts = dict(
        (
            await db.execute(
                select(PayrollRunLine.run_id, func.count())
                .where(PayrollRunLine.tenant_id == tenant.id, PayrollRunLine.run_id.in_([run.id for run in runs]))
                .group_by(PayrollRunLine.run_id)
            )
        ).all()
    )
    output: list[dict[str, object]] = []
    for run in runs:
        period = period_map.get(run.period_id)
        if not period:
            continue
        output.append(
            {
                "payroll_period": period.period_code,
                "total_employees": int(line_counts.get(run.id, 0)),
                "gross_total": float(run.gross_total or 0),
                "deduction_total": float(run.deduction_total or 0),
                "net_total": float(run.net_total or 0),
            }
        )
    return output

