"""Read-only "information center" for one employee: leave, attendance / late, discipline, salary history,
bonuses, payslips, gate passes, documents, status history, separations and reviews.

Every query is filtered by ``tenant_id`` and bounded (``RECENT_LIMIT`` newest rows per list). Each block is
checked against the permission its own screen uses; without it the block is ``{"allowed": False}`` and
carries no data. Nothing here writes.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.authz import get_user_role_scoped_to_tenant
from app.common.business_date import today_local
from app.common.permissions import (
    PERMISSION_HR_ALLOWANCE_MANAGE,
    PERMISSION_HR_BONUS_MANAGE,
    PERMISSION_HR_DISCIPLINE_MANAGE,
    PERMISSION_HR_FINAL_SETTLEMENT_MANAGE,
    PERMISSION_HR_GATE_PASS_MANAGE,
    PERMISSION_HR_PAYROLL_MANAGE,
    PERMISSION_HR_PRODUCTION_BONUS_MANAGE,
    internal_permission_granted,
)
from app.models import Tenant, User
from app.models.hr import Employee, EmployeeDocument, EmployeeStatusHistory
from app.models.hr_allowance import HrAllowanceEntry, HrAllowanceRule, HrBonusAllocationLine, HrProductionBonusEntry
from app.models.hr_attendance import AttendanceEntry, OvertimeEntry
from app.models.hr_leave import LeaveBalance, LeaveRequest, LeaveType
from app.models.hr_lifecycle import HrEmployeeCase, HrEmployeeGatePass, HrSeparation
from app.models.hr_payroll import (
    BonusDeclaration,
    PayrollEmployeeStructureAssignment,
    PayrollPayslip,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
)
from app.models.hr_performance import PerformanceReview

RECENT_LIMIT = 20
OPEN_CASE_STATUSES = ("DRAFT", "ISSUED", "RESPONDED", "DEFENCE_NOTICE", "HEARING")
HIDDEN = {"allowed": False}


def _money(value: Decimal | None) -> str | None:
    return None if value is None else format(Decimal(value).quantize(Decimal("0.01")), "f")


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


class _Access:
    def __init__(self, role: Any, *, manager: bool) -> None:
        self.role = role
        self.manager = manager

    def granted(self, *keys: str) -> bool:
        return self.manager or any(internal_permission_granted(role=self.role, permission_key=k) for k in keys)


async def _leave(db: AsyncSession, tenant_id: int, employee_id: int, year: int) -> dict[str, Any]:
    balances = (
        await db.execute(
            select(LeaveBalance, LeaveType.code, LeaveType.name)
            .join(LeaveType, LeaveType.id == LeaveBalance.leave_type_id)
            .where(
                LeaveBalance.tenant_id == tenant_id,
                LeaveType.tenant_id == tenant_id,
                LeaveBalance.employee_id == employee_id,
                LeaveBalance.balance_year == year,
            )
            .order_by(LeaveType.code)
        )
    ).all()
    requests = (
        await db.execute(
            select(LeaveRequest, LeaveType.code, LeaveType.name)
            .join(LeaveType, LeaveType.id == LeaveRequest.leave_type_id)
            .where(
                LeaveRequest.tenant_id == tenant_id,
                LeaveType.tenant_id == tenant_id,
                LeaveRequest.employee_id == employee_id,
            )
            .order_by(LeaveRequest.from_date.desc(), LeaveRequest.id.desc())
            .limit(RECENT_LIMIT)
        )
    ).all()
    total = (
        await db.execute(
            select(func.count()).select_from(LeaveRequest).where(
                LeaveRequest.tenant_id == tenant_id, LeaveRequest.employee_id == employee_id
            )
        )
    ).scalar_one()
    return {
        "allowed": True,
        "year": year,
        "balances": [
            {
                "leave_type": code,
                "leave_type_name": name,
                "allocated_days": format(b.allocated_days, "f"),
                "used_days": format(b.used_days, "f"),
                "pending_days": format(b.pending_days, "f"),
                "remaining_days": format(b.closing_balance_days, "f"),
            }
            for b, code, name in balances
        ],
        "requests_total": int(total or 0),
        "requests": [
            {
                "id": r.id,
                "leave_type": code,
                "leave_type_name": name,
                "from_date": _iso(r.from_date),
                "to_date": _iso(r.to_date),
                "days": format(r.days_requested, "f"),
                "status": r.status,
                "reason": r.reason,
            }
            for r, code, name in requests
        ],
    }


async def _attendance(db: AsyncSession, tenant_id: int, employee_id: int, today: date) -> dict[str, Any]:
    month_start = today.replace(day=1)
    year_start = today.replace(month=1, day=1)

    async def summary(start: date) -> dict[str, Any]:
        row = (
            await db.execute(
                select(
                    func.count().label("days"),
                    func.count().filter(AttendanceEntry.status == "PRESENT").label("present"),
                    func.count().filter(AttendanceEntry.status == "ABSENT").label("absent"),
                    func.count().filter(AttendanceEntry.late_minutes > 0).label("late_days"),
                    func.coalesce(func.sum(AttendanceEntry.late_minutes), 0).label("late_minutes"),
                    func.coalesce(func.sum(AttendanceEntry.overtime_minutes), 0).label("overtime_minutes"),
                ).where(
                    AttendanceEntry.tenant_id == tenant_id,
                    AttendanceEntry.employee_id == employee_id,
                    AttendanceEntry.attendance_date >= start,
                    AttendanceEntry.attendance_date <= today,
                )
            )
        ).one()
        return {
            "from_date": start.isoformat(),
            "days_recorded": int(row.days or 0),
            "present": int(row.present or 0),
            "absent": int(row.absent or 0),
            "late_days": int(row.late_days or 0),
            "late_minutes": int(row.late_minutes or 0),
            "overtime_minutes": int(row.overtime_minutes or 0),
        }

    late = (
        await db.execute(
            select(AttendanceEntry)
            .where(
                AttendanceEntry.tenant_id == tenant_id,
                AttendanceEntry.employee_id == employee_id,
                AttendanceEntry.late_minutes > 0,
            )
            .order_by(AttendanceEntry.attendance_date.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    ot_hours = (
        await db.execute(
            select(func.coalesce(func.sum(OvertimeEntry.ot_hours), 0)).where(
                OvertimeEntry.tenant_id == tenant_id,
                OvertimeEntry.employee_id == employee_id,
                OvertimeEntry.work_date >= year_start,
                OvertimeEntry.status == "APPROVED",
            )
        )
    ).scalar_one()
    return {
        "allowed": True,
        "this_month": await summary(month_start),
        "this_year": await summary(year_start),
        "approved_overtime_hours_this_year": format(Decimal(ot_hours or 0), "f"),
        "recent_late": [
            {
                "date": _iso(a.attendance_date),
                "in_time": a.in_time.strftime("%H:%M") if a.in_time else None,
                "late_minutes": a.late_minutes,
                "status": a.status,
            }
            for a in late
        ],
    }


async def _discipline(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(HrEmployeeCase)
            .where(HrEmployeeCase.tenant_id == tenant_id, HrEmployeeCase.employee_id == employee_id)
            .order_by(HrEmployeeCase.created_at.desc(), HrEmployeeCase.id.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    counts = (
        await db.execute(
            select(
                func.count().label("total"),
                func.count().filter(HrEmployeeCase.status.in_(OPEN_CASE_STATUSES)).label("open"),
            ).where(HrEmployeeCase.tenant_id == tenant_id, HrEmployeeCase.employee_id == employee_id)
        )
    ).one()
    return {
        "allowed": True,
        "total": int(counts.total or 0),
        "open": int(counts.open or 0),
        "cases": [
            {
                "id": c.id,
                "case_no": c.case_no,
                "case_type": c.case_type,
                "subject": c.subject,
                "status": c.status,
                "issue_date": _iso(c.issue_date),
                "decision": c.decision,
            }
            for c in rows
        ],
    }


async def _salary(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(PayrollEmployeeStructureAssignment, PayrollStructure.code)
            .join(PayrollStructure, PayrollStructure.id == PayrollEmployeeStructureAssignment.structure_id)
            .where(
                PayrollEmployeeStructureAssignment.tenant_id == tenant_id,
                PayrollEmployeeStructureAssignment.employee_id == employee_id,
            )
            .order_by(PayrollEmployeeStructureAssignment.effective_from.desc())
            .limit(RECENT_LIMIT)
        )
    ).all()
    return {
        "allowed": True,
        "history": [
            {
                "id": a.id,
                "structure_code": code,
                "change_type": a.change_type,
                "effective_from": _iso(a.effective_from),
                "effective_to": _iso(a.effective_to),
                "basic": _money(a.base_salary),
            }
            for a, code in rows
        ],
    }


async def _bonuses(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    festival = (
        await db.execute(
            select(HrBonusAllocationLine, BonusDeclaration.title, BonusDeclaration.period_code)
            .join(BonusDeclaration, BonusDeclaration.id == HrBonusAllocationLine.bonus_declaration_id)
            .where(
                HrBonusAllocationLine.tenant_id == tenant_id,
                BonusDeclaration.tenant_id == tenant_id,
                HrBonusAllocationLine.employee_id == employee_id,
            )
            .order_by(HrBonusAllocationLine.created_at.desc())
            .limit(RECENT_LIMIT)
        )
    ).all()
    production = (
        await db.execute(
            select(HrProductionBonusEntry)
            .where(HrProductionBonusEntry.tenant_id == tenant_id, HrProductionBonusEntry.employee_id == employee_id)
            .order_by(HrProductionBonusEntry.period_start.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    month = func.date_trunc(literal_column("'month'"), HrAllowanceEntry.work_date).label("month")
    allowances = (
        await db.execute(
            select(
                month,
                HrAllowanceRule.code,
                func.count().label("days"),
                func.coalesce(func.sum(HrAllowanceEntry.amount), 0).label("amount"),
            )
            .join(HrAllowanceRule, HrAllowanceRule.id == HrAllowanceEntry.rule_id)
            .where(
                HrAllowanceEntry.tenant_id == tenant_id,
                HrAllowanceRule.tenant_id == tenant_id,
                HrAllowanceEntry.employee_id == employee_id,
                HrAllowanceEntry.status.in_(("APPROVED", "PAID")),
            )
            .group_by(month, HrAllowanceRule.code)
            .order_by(month.desc(), HrAllowanceRule.code)
            .limit(RECENT_LIMIT)
        )
    ).all()
    return {
        "allowed": True,
        "festival": [
            {"title": title, "period_code": period, "amount": _money(b.amount), "status": b.status, "eligible": b.eligible}
            for b, title, period in festival
        ],
        "production": [
            {"period_code": p.period_code, "amount": _money(p.amount), "status": p.status} for p in production
        ],
        "allowances_by_month": [
            {
                "month": r.month.strftime("%Y-%m") if r.month else None,
                "rule_code": r.code,
                "days": int(r.days or 0),
                "amount": _money(Decimal(r.amount or 0)),
            }
            for r in allowances
        ],
    }


async def _payslips(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(PayrollRunLine, PayrollRun.status, PayrollPeriod.period_code, PayrollPayslip.slip_number)
            .join(PayrollRun, PayrollRun.id == PayrollRunLine.run_id)
            .join(PayrollPeriod, PayrollPeriod.id == PayrollRun.period_id)
            .outerjoin(
                PayrollPayslip,
                (PayrollPayslip.payroll_run_line_id == PayrollRunLine.id) & (PayrollPayslip.tenant_id == tenant_id),
            )
            .where(
                PayrollRunLine.tenant_id == tenant_id,
                PayrollRun.tenant_id == tenant_id,
                PayrollRunLine.employee_id == employee_id,
                PayrollRun.status.in_(("FINALIZED", "APPROVED", "POSTED")),
            )
            .order_by(PayrollPeriod.start_date.desc(), PayrollRun.id.desc())
            .limit(RECENT_LIMIT)
        )
    ).all()
    return {
        "allowed": True,
        "lines": [
            {
                "run_id": line.run_id,
                "period_code": period_code,
                "run_status": run_status,
                "gross_pay": _money(line.gross_pay),
                "deductions": _money(line.deductions),
                "net_pay": _money(line.net_pay),
                "slip_number": slip,
            }
            for line, run_status, period_code, slip in rows
        ],
    }


async def _gate_passes(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(HrEmployeeGatePass)
            .where(HrEmployeeGatePass.tenant_id == tenant_id, HrEmployeeGatePass.employee_id == employee_id)
            .order_by(HrEmployeeGatePass.valid_from.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    return {
        "allowed": True,
        "passes": [
            {
                "id": p.id,
                "pass_code": p.pass_code,
                "status": p.status,
                "valid_from": _iso(p.valid_from),
                "valid_to": _iso(p.valid_to),
                "purpose": p.purpose,
            }
            for p in rows
        ],
    }


async def _documents(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(EmployeeDocument)
            .where(EmployeeDocument.tenant_id == tenant_id, EmployeeDocument.employee_id == employee_id)
            .order_by(EmployeeDocument.created_at.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    return {
        "allowed": True,
        "documents": [
            {
                "id": d.id,
                "document_type": d.document_type,
                "document_number": d.document_number,
                "issue_date": _iso(d.issue_date),
                "expiry_date": _iso(d.expiry_date),
            }
            for d in rows
        ],
    }


async def _status_history(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(EmployeeStatusHistory)
            .where(EmployeeStatusHistory.tenant_id == tenant_id, EmployeeStatusHistory.employee_id == employee_id)
            .order_by(EmployeeStatusHistory.effective_date.desc(), EmployeeStatusHistory.id.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    return {
        "allowed": True,
        "entries": [{"status": s.status, "effective_date": _iso(s.effective_date), "remarks": s.remarks} for s in rows],
    }


async def _separations(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(HrSeparation)
            .where(HrSeparation.tenant_id == tenant_id, HrSeparation.employee_id == employee_id)
            .order_by(HrSeparation.request_date.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    return {
        "allowed": True,
        "separations": [
            {
                "id": s.id,
                "separation_type": s.separation_type,
                "status": s.status,
                "request_date": _iso(s.request_date),
                "last_working_date": _iso(s.last_working_date),
            }
            for s in rows
        ],
    }


async def _reviews(db: AsyncSession, tenant_id: int, employee_id: int) -> dict[str, Any]:
    rows = (
        await db.execute(
            select(PerformanceReview)
            .where(PerformanceReview.tenant_id == tenant_id, PerformanceReview.employee_id == employee_id)
            .order_by(PerformanceReview.created_at.desc())
            .limit(RECENT_LIMIT)
        )
    ).scalars().all()
    return {
        "allowed": True,
        "reviews": [
            {
                "id": r.id,
                "review_type": r.review_type,
                "status": r.status,
                "final_rating": None if r.final_rating is None else format(Decimal(str(r.final_rating)), "f"),
                "submitted_at": _iso(r.submitted_at),
            }
            for r in rows
        ],
    }


async def employee_overview(db: AsyncSession, *, tenant: Tenant, user: User, employee: Employee) -> dict[str, Any]:
    """``employee`` must already be checked to belong to ``tenant``."""
    tenant_id, employee_id = tenant.id, employee.id
    from app.common.permissions import is_hr_manager_equivalent

    role = await get_user_role_scoped_to_tenant(db, user, tenant_id)
    access = _Access(role, manager=await is_hr_manager_equivalent(db, user, tenant_id))
    today = today_local(tenant)
    payroll = access.granted(PERMISSION_HR_PAYROLL_MANAGE)
    return {
        "employee_id": employee_id,
        "as_of": today.isoformat(),
        "recent_limit": RECENT_LIMIT,
        "leave": await _leave(db, tenant_id, employee_id, today.year),
        "attendance": await _attendance(db, tenant_id, employee_id, today),
        "discipline": (
            await _discipline(db, tenant_id, employee_id) if access.granted(PERMISSION_HR_DISCIPLINE_MANAGE) else HIDDEN
        ),
        "salary": await _salary(db, tenant_id, employee_id) if payroll else HIDDEN,
        "bonuses": (
            await _bonuses(db, tenant_id, employee_id)
            if access.granted(
                PERMISSION_HR_PAYROLL_MANAGE,
                PERMISSION_HR_BONUS_MANAGE,
                PERMISSION_HR_ALLOWANCE_MANAGE,
                PERMISSION_HR_PRODUCTION_BONUS_MANAGE,
            )
            else HIDDEN
        ),
        "payslips": await _payslips(db, tenant_id, employee_id) if payroll else HIDDEN,
        "gate_passes": (
            await _gate_passes(db, tenant_id, employee_id) if access.granted(PERMISSION_HR_GATE_PASS_MANAGE) else HIDDEN
        ),
        "documents": await _documents(db, tenant_id, employee_id),
        "status_history": await _status_history(db, tenant_id, employee_id),
        "separations": (
            await _separations(db, tenant_id, employee_id)
            if access.granted(PERMISSION_HR_FINAL_SETTLEMENT_MANAGE)
            else HIDDEN
        ),
        "reviews": await _reviews(db, tenant_id, employee_id),
    }
