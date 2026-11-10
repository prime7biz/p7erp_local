from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.common.auth import get_current_user
from app.common.business_date import today_local
from app.common.ownership import ensure_owned
from app.common.pagination import HR_LIST_DEFAULT_LIMIT, HR_LIST_MAX_LIMIT
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    AttendanceEntry,
    Employee,
    EmployeeTicket,
    EssPreference,
    LeaveRequest,
    LeaveType,
    PayrollPayslip,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    Tenant,
    User,
)
from app.modules.hr_ess.schemas import (
    AttendanceSummaryResponse,
    EssPreferenceResponse,
    EssPreferenceUpdate,
    LeaveRequestCreate,
    LeaveRequestResponse,
    MyProfileResponse,
    MyProfileUpdate,
    PayslipResponse,
)
from app.modules.hr_leave.leave_days import validate_leave_request
from app.modules.hr_payroll.formula_engine import quantize_money

router = APIRouter(prefix="/hr/ess", tags=["hr-ess"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _get_my_employee_or_404(db: AsyncSession, tenant_id: int, user_id: int) -> Employee:
    result = await db.execute(
        select(Employee)
        .options(selectinload(Employee.department), selectinload(Employee.designation))
        .where(Employee.tenant_id == tenant_id, Employee.user_id == user_id)
    )
    employee = result.scalar_one_or_none()
    if not employee:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Employee profile not linked with current user",
        )
    return employee


async def _get_or_create_pref(db: AsyncSession, tenant_id: int, employee_id: int) -> EssPreference:
    result = await db.execute(
        select(EssPreference).where(
            EssPreference.tenant_id == tenant_id,
            EssPreference.employee_id == employee_id,
        )
    )
    pref = result.scalar_one_or_none()
    if pref:
        return pref
    pref = EssPreference(
        tenant_id=tenant_id,
        employee_id=employee_id,
        preferred_language="en",
        time_zone="Asia/Dhaka",
        date_format="DD-MM-YYYY",
        email_notifications=True,
        push_notifications=False,
    )
    db.add(pref)
    await db.commit()
    await db.refresh(pref)
    return pref


def _pref_to_response(pref: EssPreference) -> EssPreferenceResponse:
    return EssPreferenceResponse(
        preferred_language=pref.preferred_language,
        time_zone=pref.time_zone,
        date_format=pref.date_format,
        email_notifications=pref.email_notifications,
        push_notifications=pref.push_notifications,
    )


def _employee_to_profile_response(employee: Employee, pref: EssPreference) -> MyProfileResponse:
    full_name = f"{employee.first_name} {employee.last_name}".strip() if employee.last_name else employee.first_name
    return MyProfileResponse(
        employee_id=employee.id,
        employee_code=employee.employee_code,
        full_name=full_name,
        email=employee.email,
        phone=employee.phone,
        address_line=employee.address_line,
        department=employee.department.name if employee.department else None,
        designation=employee.designation.title if employee.designation else None,
        department_id=employee.department_id,
        designation_id=employee.designation_id,
        joining_date=employee.joining_date,
        preference=_pref_to_response(pref),
    )


@router.get("/my-profile", response_model=MyProfileResponse)
async def my_profile(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    pref = await _get_or_create_pref(db, tenant.id, employee.id)
    return _employee_to_profile_response(employee, pref)


@router.patch("/my-profile", response_model=MyProfileResponse)
async def update_my_profile(
    body: MyProfileUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    pref = await _get_or_create_pref(db, tenant.id, employee.id)
    payload = body.model_dump(exclude_unset=True)
    if "email" in payload:
        employee.email = payload["email"].strip() if payload["email"] else None
    if "phone" in payload:
        employee.phone = payload["phone"].strip() if payload["phone"] else None
    if "address_line" in payload:
        employee.address_line = payload["address_line"].strip() if payload["address_line"] else None
    await db.commit()
    await db.refresh(employee)
    return _employee_to_profile_response(employee, pref)


@router.patch("/my-profile/preferences", response_model=EssPreferenceResponse)
async def update_preferences(
    body: EssPreferenceUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    pref = await _get_or_create_pref(db, tenant.id, employee.id)
    payload = body.model_dump(exclude_unset=True)
    if "preferred_language" in payload:
        pref.preferred_language = payload["preferred_language"].strip()
    if "time_zone" in payload:
        pref.time_zone = payload["time_zone"].strip()
    if "date_format" in payload:
        pref.date_format = payload["date_format"].strip()
    if "email_notifications" in payload:
        pref.email_notifications = bool(payload["email_notifications"])
    if "push_notifications" in payload:
        pref.push_notifications = bool(payload["push_notifications"])
    await db.commit()
    await db.refresh(pref)
    return _pref_to_response(pref)


@router.get("/my-leave-requests", response_model=list[LeaveRequestResponse])
async def my_leave_requests(
    status_filter: str | None = Query(default=None),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    stmt = select(LeaveRequest).where(
        LeaveRequest.tenant_id == tenant.id,
        LeaveRequest.employee_id == employee.id,
    )
    if status_filter and status_filter.strip():
        stmt = stmt.where(LeaveRequest.status == status_filter.strip().upper())
    stmt = stmt.order_by(LeaveRequest.created_at.desc()).offset(offset).limit(limit)
    result = await db.execute(stmt)
    rows = result.scalars().all()
    return [
        LeaveRequestResponse(
            id=row.id,
            leave_type=str(row.leave_type_id),
            start_date=row.from_date,
            end_date=row.to_date,
            days_count=float(row.days_requested),
            reason=row.reason,
            status=row.status,
            approved_at=row.approved_at.isoformat() if row.approved_at else None,
            created_at=row.created_at.isoformat(),
        )
        for row in rows
    ]


@router.post("/my-leave-requests", response_model=LeaveRequestResponse, status_code=status.HTTP_201_CREATED)
async def create_my_leave_request(
    body: LeaveRequestCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    await ensure_owned(db, LeaveType, body.leave_type_id, tenant.id, "Leave type")
    # Same rules as HR leave: server-counted days (weekends / holidays skipped), no overlap, one year.
    days_requested = await validate_leave_request(
        db,
        tenant=tenant,
        employee_id=employee.id,
        from_date=body.from_date,
        to_date=body.to_date,
        requested_days=body.days_requested,
    )
    row = LeaveRequest(
        tenant_id=tenant.id,
        employee_id=employee.id,
        leave_type_id=body.leave_type_id,
        from_date=body.from_date,
        to_date=body.to_date,
        days_requested=days_requested,
        reason=body.reason.strip() if body.reason else None,
        status="DRAFT",
        requested_by=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return LeaveRequestResponse(
        id=row.id,
        leave_type=str(row.leave_type_id),
        start_date=row.from_date,
        end_date=row.to_date,
        days_count=float(row.days_requested),
        reason=row.reason,
        status=row.status,
        approved_at=row.approved_at.isoformat() if row.approved_at else None,
        created_at=row.created_at.isoformat(),
    )


@router.get("/my-attendance-summary", response_model=list[AttendanceSummaryResponse])
async def my_attendance_summary(
    year: int | None = Query(default=None, ge=2000, le=2200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    stmt = select(AttendanceEntry).where(
        AttendanceEntry.tenant_id == tenant.id,
        AttendanceEntry.employee_id == employee.id,
    )
    stmt = stmt.order_by(AttendanceEntry.attendance_date.desc())
    result = await db.execute(stmt)
    rows = result.scalars().all()
    summary_map: dict[tuple[int, int], AttendanceSummaryResponse] = {}
    for row in rows:
        if year is not None and row.attendance_date.year != year:
            continue
        key = (row.attendance_date.year, row.attendance_date.month)
        item = summary_map.get(key)
        if item is None:
            item = AttendanceSummaryResponse(
                year=key[0],
                month=key[1],
                present_days=0,
                absent_days=0,
                late_days=0,
                overtime_hours=0.0,
            )
            summary_map[key] = item
        status_upper = (row.status or "").upper()
        if status_upper == "ABSENT":
            item.absent_days += 1
        else:
            item.present_days += 1
        if status_upper == "LATE" or row.late_minutes > 0:
            item.late_days += 1
        item.overtime_hours += (row.overtime_minutes or 0) / 60.0
    if summary_map:
        return sorted(summary_map.values(), key=lambda x: (x.year, x.month), reverse=True)
    now = today_local(tenant)
    return [
        AttendanceSummaryResponse(
            year=year or now.year,
            month=now.month,
            present_days=0,
            absent_days=0,
            late_days=0,
            overtime_hours=0.0,
        )
    ]


@router.get("/my-payslips", response_model=list[PayslipResponse])
async def my_payslips(
    year: int | None = Query(default=None, ge=2000, le=2200),
    limit: int = Query(default=HR_LIST_DEFAULT_LIMIT, ge=1, le=HR_LIST_MAX_LIMIT, description="Safety cap (Finding #3)"),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    # The payslip month is the payroll period's month (October payroll paid in November is "October").
    stmt = (
        select(PayrollPayslip, PayrollRunLine, PayrollPeriod.start_date)
        .join(PayrollRunLine, PayrollRunLine.id == PayrollPayslip.payroll_run_line_id)
        .join(PayrollRun, and_(PayrollRun.id == PayrollRunLine.run_id, PayrollRun.tenant_id == tenant.id))
        .join(PayrollPeriod, and_(PayrollPeriod.id == PayrollRun.period_id, PayrollPeriod.tenant_id == tenant.id))
        .where(
            PayrollPayslip.tenant_id == tenant.id,
            PayrollRunLine.tenant_id == tenant.id,
            PayrollRunLine.employee_id == employee.id,
        )
    )
    if year is not None:
        stmt = stmt.where(PayrollPeriod.start_date >= date(year, 1, 1), PayrollPeriod.start_date < date(year + 1, 1, 1))
    stmt = (
        stmt.order_by(PayrollPeriod.start_date.desc(), PayrollPayslip.generated_at.desc())
        .offset(offset)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return [
        PayslipResponse(
            id=payslip.id,
            period_year=period_start.year,
            period_month=period_start.month,
            gross_pay=quantize_money(Decimal(run_line.gross_pay or 0)),
            deductions=quantize_money(Decimal(run_line.deductions or 0)),
            net_pay=quantize_money(Decimal(run_line.net_pay or 0)),
            currency="BDT",
            status="generated",
            issued_at=payslip.generated_at.isoformat() if payslip.generated_at else None,
            download_url=None,
        )
        for payslip, run_line, period_start in rows
    ]


@router.get("/my-tickets", response_model=list[dict])
async def my_tickets(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    rows = (
        await db.execute(
            select(EmployeeTicket)
            .where(EmployeeTicket.tenant_id == tenant.id, EmployeeTicket.employee_id == employee.id)
            .order_by(EmployeeTicket.created_at.desc())
            .limit(200)
        )
    ).scalars().all()
    return [
        {
            "id": r.id,
            "category": r.category,
            "subject": r.subject,
            "status": r.status,
            "priority": r.priority,
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.post("/my-tickets", status_code=status.HTTP_201_CREATED)
async def create_my_ticket(
    body: dict,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    employee = await _get_my_employee_or_404(db, tenant.id, user.id)
    row = EmployeeTicket(
        tenant_id=tenant.id,
        employee_id=employee.id,
        category=str(body.get("category", "general")),
        subject=str(body.get("subject", "Ticket")),
        description=str(body.get("description") or "") or None,
        priority=str(body.get("priority", "medium")),
        status="open",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"id": row.id, "ok": True}
