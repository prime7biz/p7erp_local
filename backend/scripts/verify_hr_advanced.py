"""
Quick verification checks for advanced HR module readiness.

Run inside backend container:
  python scripts/verify_hr_advanced.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import func, select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.main import app
from app.models import (
    AttendanceEntry,
    AttendanceHoliday,
    AttendanceRegularizationRequest,
    AttendanceRoster,
    AttendanceShift,
    Candidate,
    Department,
    Designation,
    Employee,
    EssPreference,
    Interview,
    JobRequisition,
    LeaveBalance,
    LeavePolicy,
    LeaveRequest,
    LeaveType,
    Offer,
    PayrollApproval,
    PayrollComponent,
    PayrollPayslip,
    PayrollPeriod,
    PayrollPosting,
    PayrollRun,
    PayrollRunLine,
    PayrollStructure,
    PerformanceCycle,
    PerformanceGoal,
    PerformanceReview,
    Tenant,
)

LAKHSMA_CODE = "LAKHSMA4821"


async def _get_tenant_id() -> tuple[int, str]:
    async with AsyncSessionLocal() as db:
        tenant = (
            await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))
        ).scalar_one_or_none()
        if not tenant:
            tenant = (await db.execute(select(Tenant).order_by(Tenant.id.asc()))).scalar_one_or_none()
        if not tenant:
            raise RuntimeError("No tenant found.")
        return tenant.id, tenant.company_code or f"TENANT-{tenant.id}"


async def _count_for_tenant(tenant_id: int, model) -> int:
    async with AsyncSessionLocal() as db:
        return (
            await db.execute(select(func.count()).select_from(model).where(model.tenant_id == tenant_id))
        ).scalar() or 0


def _route_exists(path: str) -> bool:
    return any(r.path == path for r in app.routes)


async def main() -> None:
    tenant_id, company_code = await _get_tenant_id()

    checks: list[tuple[str, int]] = []
    for label, model in [
        ("departments", Department),
        ("designations", Designation),
        ("employees", Employee),
        ("attendance_shifts", AttendanceShift),
        ("attendance_rosters", AttendanceRoster),
        ("attendance_holidays", AttendanceHoliday),
        ("attendance_entries", AttendanceEntry),
        ("attendance_regularizations", AttendanceRegularizationRequest),
        ("leave_types", LeaveType),
        ("leave_policies", LeavePolicy),
        ("leave_balances", LeaveBalance),
        ("leave_requests", LeaveRequest),
        ("payroll_components", PayrollComponent),
        ("payroll_structures", PayrollStructure),
        ("payroll_periods", PayrollPeriod),
        ("payroll_runs", PayrollRun),
        ("payroll_run_lines", PayrollRunLine),
        ("payroll_approvals", PayrollApproval),
        ("payroll_postings", PayrollPosting),
        ("payroll_payslips", PayrollPayslip),
        ("performance_cycles", PerformanceCycle),
        ("performance_goals", PerformanceGoal),
        ("performance_reviews", PerformanceReview),
        ("recruitment_requisitions", JobRequisition),
        ("recruitment_candidates", Candidate),
        ("recruitment_interviews", Interview),
        ("recruitment_offers", Offer),
        ("ess_preferences", EssPreference),
    ]:
        checks.append((label, await _count_for_tenant(tenant_id, model)))

    required_routes = [
        "/api/v1/hr/departments",
        "/api/v1/hr/attendance/entries",
        "/api/v1/hr/attendance/summary",
        "/api/v1/hr/leave/requests",
        "/api/v1/hr/payroll/runs",
        "/api/v1/hr/payroll/runs/{run_id}/post",
        "/api/v1/hr/performance/dashboard",
        "/api/v1/hr/recruitment/requisitions",
        "/api/v1/hr/ess/my-profile",
        "/api/v1/hr/reports/summary",
    ]

    print("Advanced HR verification")
    print(f"Tenant: {tenant_id} ({company_code})")
    print("Data counts:")
    for label, value in checks:
        print(f"- {label}: {value}")

    print("Route checks:")
    for route in required_routes:
        print(f"- {route}: {'OK' if _route_exists(route) else 'MISSING'}")

    print("Verification complete.")


if __name__ == "__main__":
    asyncio.run(main())

