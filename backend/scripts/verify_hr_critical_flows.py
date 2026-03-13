"""
Critical HR backend flow smoke checks.

Run inside backend container:
  python scripts/verify_hr_critical_flows.py
"""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.main import app
from app.models import (
    AttendanceEntry,
    AttendanceRegularizationRequest,
    LeaveRequest,
    PayrollApproval,
    PayrollPayslip,
    PayrollPosting,
    PayrollRun,
    Tenant,
)

LAKHSMA_CODE = "LAKHSMA4821"


def _route_exists(path: str) -> bool:
    return any(r.path == path for r in app.routes)


async def _get_tenant() -> Tenant:
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))).scalar_one_or_none()
        if tenant:
            return tenant
        tenant = (await db.execute(select(Tenant).order_by(Tenant.id.asc()))).scalar_one_or_none()
        if not tenant:
            raise RuntimeError("No tenant found.")
        return tenant


async def main() -> None:
    tenant = await _get_tenant()
    results: list[tuple[str, str, str]] = []

    async with AsyncSessionLocal() as db:
        att_entry = (
            await db.execute(
                select(AttendanceEntry).where(AttendanceEntry.tenant_id == tenant.id).order_by(AttendanceEntry.id.desc())
            )
        ).scalars().first()
        results.append(
            (
                "HR-UAT-022",
                "Pass" if att_entry is not None else "Fail",
                "Attendance entry exists" if att_entry else "No attendance entry found",
            )
        )

        reg = (
            await db.execute(
                select(AttendanceRegularizationRequest)
                .where(AttendanceRegularizationRequest.tenant_id == tenant.id)
                .order_by(AttendanceRegularizationRequest.id.desc())
            )
        ).scalars().first()
        reg_ok = reg is not None and reg.status in {"APPROVED", "REJECTED", "PENDING"}
        results.append(
            (
                "HR-UAT-023",
                "Pass" if reg_ok else "Fail",
                f"Regularization status={reg.status}" if reg else "No regularization found",
            )
        )

        leave_req = (
            await db.execute(
                select(LeaveRequest).where(LeaveRequest.tenant_id == tenant.id).order_by(LeaveRequest.id.desc())
            )
        ).scalars().first()
        leave_ok = leave_req is not None and leave_req.status in {"APPROVED", "REJECTED", "SUBMITTED", "DRAFT"}
        results.append(
            (
                "HR-UAT-025",
                "Pass" if leave_ok else "Fail",
                f"Leave status={leave_req.status}" if leave_req else "No leave request found",
            )
        )

        run = (
            await db.execute(select(PayrollRun).where(PayrollRun.tenant_id == tenant.id).order_by(PayrollRun.id.desc()))
        ).scalars().first()
        approval = (
            await db.execute(
                select(PayrollApproval).where(PayrollApproval.tenant_id == tenant.id).order_by(PayrollApproval.id.desc())
            )
        ).scalars().first()
        lifecycle_ok = run is not None and approval is not None and run.status in {"FINALIZED", "APPROVED", "POSTED"}
        results.append(
            (
                "HR-UAT-028",
                "Pass" if lifecycle_ok else "Fail",
                f"Run status={run.status}, approval={approval.action}" if lifecycle_ok else "Run lifecycle evidence missing",
            )
        )

        posting = (
            await db.execute(
                select(PayrollPosting).where(PayrollPosting.tenant_id == tenant.id).order_by(PayrollPosting.id.desc())
            )
        ).scalars().first()
        payslip = (
            await db.execute(
                select(PayrollPayslip).where(PayrollPayslip.tenant_id == tenant.id).order_by(PayrollPayslip.id.desc())
            )
        ).scalars().first()
        post_ok = posting is not None and posting.status == "POSTED"
        results.append(
            (
                "HR-UAT-029-PRECHECK",
                "Pass" if post_ok else "Fail",
                "Posting exists; voucher linkage still requires explicit API/UI validation",
            )
        )
        results.append(
            (
                "HR-UAT-031",
                "Pass" if payslip is not None else "Fail",
                "Payslip exists" if payslip else "No payslip found",
            )
        )

    ess_route_ok = _route_exists("/api/v1/hr/ess/my-profile")
    results.append(
        (
            "HR-UAT-034-PRECHECK",
            "Pass" if ess_route_ok else "Fail",
            "ESS route is registered; self-data isolation still requires authenticated validation",
        )
    )

    print("HR critical flow smoke")
    print(f"Tenant: {tenant.id} ({tenant.company_code or tenant.name})")
    for test_id, status, note in results:
        print(f"- {test_id}: {status} | {note}")


if __name__ == "__main__":
    asyncio.run(main())
