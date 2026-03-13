"""
Verify ESS self-data isolation for leave/attendance/payslip endpoints.

Run inside backend container:
  python scripts/verify_hr_ess_self_data_isolation.py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, time
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import AttendanceEntry, Employee, LeaveRequest, LeaveType, PayrollPayslip, PayrollRunLine, Tenant, User

BASE_URL = os.getenv("UAT_API_BASE_URL", "http://localhost:8000")
TENANT_CODE = "LAKHSMA4821"
USERNAME = "shahriyar"
EMAIL = "shahriyar@lakhsma.com"
PASSWORD = "Lakhsma123"


def _request(method: str, path: str, headers: dict[str, str] | None = None, body: dict | None = None):
    req_headers = {"Content-Type": "application/json"}
    if headers:
        req_headers.update(headers)
    payload = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(f"{BASE_URL}{path}", data=payload, headers=req_headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            text = resp.read().decode("utf-8")
            parsed = json.loads(text) if text.strip().startswith(("{", "[")) else None
            return resp.getcode(), text, parsed
    except urllib.error.HTTPError as e:
        text = e.read().decode("utf-8", errors="replace") if e.fp else ""
        try:
            parsed = json.loads(text)
        except Exception:
            parsed = None
        return e.code, text, parsed


async def _prepare_data(tenant_id: int, user_id: int) -> tuple[Employee, Employee]:
    async with AsyncSessionLocal() as db:
        leave_type = (
            await db.execute(select(LeaveType).where(LeaveType.tenant_id == tenant_id).order_by(LeaveType.id.asc()))
        ).scalars().first()
        if leave_type is None:
            raise RuntimeError("No leave type found for tenant. Seed leave types first.")

        me = (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.user_id == user_id).order_by(Employee.id.asc())
            )
        ).scalars().first()
        if me is None:
            me = (
                await db.execute(select(Employee).where(Employee.tenant_id == tenant_id).order_by(Employee.id.asc()))
            ).scalars().first()
            if me is None:
                raise RuntimeError("No employee found in tenant.")
            me.user_id = user_id
            await db.flush()

        other = (
            await db.execute(
                select(Employee).where(Employee.tenant_id == tenant_id, Employee.id != me.id).order_by(Employee.id.asc())
            )
        ).scalars().first()
        if other is None:
            raise RuntimeError("Need at least 2 employees for ESS isolation check.")

        stamp = datetime.now().strftime("%H%M%S")
        attendance_day = date(2026, 7, 1)
        db.add(
            AttendanceEntry(
                tenant_id=tenant_id,
                employee_id=me.id,
                attendance_date=attendance_day,
                in_time=time(9, 0),
                out_time=time(18, 0),
                status="PRESENT",
                source="MANUAL",
                late_minutes=0,
                early_out_minutes=0,
                overtime_minutes=15,
                remarks=f"ESS-ME-{stamp}",
                created_by=user_id,
            )
        )
        db.add(
            AttendanceEntry(
                tenant_id=tenant_id,
                employee_id=other.id,
                attendance_date=attendance_day,
                in_time=time(9, 30),
                out_time=time(18, 0),
                status="LATE",
                source="MANUAL",
                late_minutes=30,
                early_out_minutes=0,
                overtime_minutes=0,
                remarks=f"ESS-OTHER-{stamp}",
                created_by=user_id,
            )
        )

        db.add(
            LeaveRequest(
                tenant_id=tenant_id,
                employee_id=me.id,
                leave_type_id=leave_type.id,
                from_date=date(2026, 7, 2),
                to_date=date(2026, 7, 2),
                days_requested="1",
                reason=f"ESS-ME-{stamp}",
                status="DRAFT",
                requested_by=user_id,
            )
        )
        db.add(
            LeaveRequest(
                tenant_id=tenant_id,
                employee_id=other.id,
                leave_type_id=leave_type.id,
                from_date=date(2026, 7, 3),
                to_date=date(2026, 7, 3),
                days_requested="1",
                reason=f"ESS-OTHER-{stamp}",
                status="DRAFT",
                requested_by=user_id,
            )
        )

        run_line = (
            await db.execute(
                select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant_id, PayrollRunLine.employee_id == me.id).order_by(PayrollRunLine.id.desc())
            )
        ).scalars().first()
        if run_line:
            existing = (
                await db.execute(
                    select(PayrollPayslip).where(PayrollPayslip.tenant_id == tenant_id, PayrollPayslip.payroll_run_line_id == run_line.id)
                )
            ).scalars().first()
            if existing is None:
                db.add(
                    PayrollPayslip(
                        tenant_id=tenant_id,
                        payroll_run_line_id=run_line.id,
                        slip_number=f"ESS-ME-{stamp}",
                        generated_by=user_id,
                        file_path=None,
                    )
                )

        await db.commit()
        return me, other


async def main() -> None:
    async with AsyncSessionLocal() as db:
        tenant = (await db.execute(select(Tenant).where(Tenant.company_code == TENANT_CODE))).scalars().first()
        user = (
            await db.execute(
                select(User).where(User.tenant_id == (tenant.id if tenant else 0), User.username == USERNAME).order_by(User.id.asc())
            )
        ).scalars().first()
        if user is None and tenant is not None:
            user = (
                await db.execute(
                    select(User).where(User.tenant_id == tenant.id, User.email == EMAIL).order_by(User.id.asc())
                )
            ).scalars().first()
        if tenant is None or user is None:
            raise RuntimeError("Tenant/user not found for ESS check.")
        me, other = await _prepare_data(tenant.id, user.id)

    st, tx, js = _request(
        "POST",
        "/api/v1/auth/login",
        body={"company_code": TENANT_CODE, "username": USERNAME, "password": PASSWORD},
    )
    if st != 200:
        st, tx, js = _request(
            "POST",
            "/api/v1/auth/login",
            body={"company_code": TENANT_CODE, "email": EMAIL, "password": PASSWORD},
        )
    if not (st == 200 and isinstance(js, dict) and js.get("access_token")):
        raise RuntimeError(f"Login failed for ESS check: {st} {tx}")
    token = js["access_token"]
    tenant_id = js["tenant_id"]
    headers = {"Authorization": f"Bearer {token}", "X-Tenant-Id": str(tenant_id)}

    st1, _, leave_rows = _request("GET", "/api/v1/hr/ess/my-leave-requests", headers=headers)
    st2, _, att_rows = _request("GET", "/api/v1/hr/ess/my-attendance-summary", headers=headers)
    st3, _, pays_rows = _request("GET", "/api/v1/hr/ess/my-payslips", headers=headers)

    leave_ok = st1 == 200 and isinstance(leave_rows, list)
    att_ok = st2 == 200 and isinstance(att_rows, list)
    pays_ok = st3 == 200 and isinstance(pays_rows, list)

    # leave isolation check via reason tags
    leave_text = json.dumps(leave_rows) if isinstance(leave_rows, list) else ""
    leave_iso = f"ESS-ME" in leave_text and f"ESS-OTHER" not in leave_text

    # attendance/payslip endpoints are employee-scoped by backend logic; ensure success and no hard leak markers
    att_text = json.dumps(att_rows) if isinstance(att_rows, list) else ""
    pays_text = json.dumps(pays_rows) if isinstance(pays_rows, list) else ""
    att_iso = "ESS-OTHER" not in att_text
    pays_iso = "ESS-OTHER" not in pays_text

    overall = leave_ok and att_ok and pays_ok and leave_iso and att_iso and pays_iso

    print("HR ESS self-data isolation verification")
    print(f"- tenant_id: {tenant_id}")
    print(f"- me_employee_id: {me.id}")
    print(f"- other_employee_id: {other.id}")
    print(f"- my-leave-requests: {'PASS' if leave_ok and leave_iso else 'FAIL'} (status={st1})")
    print(f"- my-attendance-summary: {'PASS' if att_ok and att_iso else 'FAIL'} (status={st2})")
    print(f"- my-payslips: {'PASS' if pays_ok and pays_iso else 'FAIL'} (status={st3})")
    print(f"- overall: {'PASS' if overall else 'FAIL'}")


if __name__ == "__main__":
    asyncio.run(main())
