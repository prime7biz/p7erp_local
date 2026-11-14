"""GET /hr/employees/{id}/overview: read-only information center, own tenant only, blocks gated by permission.

Run: docker compose exec backend pytest tests/test_hr_employee_overview.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, time, timedelta
from decimal import Decimal

import pytest

from app.models import Employee
from app.models.hr_attendance import AttendanceEntry
from app.models.hr_leave import LeaveBalance, LeaveRequest, LeaveType
from app.models.hr_lifecycle import HrEmployeeCase
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

HR = "/api/v1/hr"


async def _employee(db, tenant, **kw) -> Employee:
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Rahima", is_active=True, **kw)
    db.add(emp)
    await db.flush()
    return emp


async def _seed(db, tenant, user, emp) -> None:
    today = date.today()
    lt = LeaveType(tenant_id=tenant.id, code=f"AL{uuid.uuid4().hex[:4]}", name="Annual leave")
    db.add(lt)
    await db.flush()
    db.add(
        LeaveBalance(
            tenant_id=tenant.id, employee_id=emp.id, leave_type_id=lt.id, balance_year=today.year,
            allocated_days=Decimal("14"), used_days=Decimal("3"), pending_days=Decimal("0"), closing_balance_days=Decimal("11"),
        )
    )
    for i in range(25):
        start = today - timedelta(days=40 + i)
        db.add(
            LeaveRequest(
                tenant_id=tenant.id, employee_id=emp.id, leave_type_id=lt.id, from_date=start, to_date=start,
                days_requested=Decimal("1"), status="APPROVED", requested_by=user.id,
            )
        )
    db.add(
        AttendanceEntry(
            tenant_id=tenant.id, employee_id=emp.id, attendance_date=today.replace(day=1), status="PRESENT",
            in_time=time(8, 20), late_minutes=20,
        )
    )
    db.add(
        HrEmployeeCase(
            tenant_id=tenant.id, case_no=f"CASE-{uuid.uuid4().hex[:6]}", employee_id=emp.id, case_type="MEMO",
            subject="Late arrival", body="Please explain", status="ISSUED",
        )
    )
    await db.flush()


@pytest.mark.asyncio
async def test_manager_sees_every_block_with_bounded_lists(db_session_integration):
    db = db_session_integration
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    emp = await _employee(db, tenant)
    await _seed(db, tenant, user, emp)
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{HR}/employees/{emp.id}/overview")
    assert r.status_code == 200, r.text
    body = r.json()
    leave = body["leave"]
    assert leave["allowed"] and leave["requests_total"] == 25 and len(leave["requests"]) == body["recent_limit"] == 20
    assert leave["balances"][0]["remaining_days"] == "11.0000"
    assert body["attendance"]["this_month"]["late_days"] == 1
    assert body["attendance"]["recent_late"][0]["late_minutes"] == 20
    assert body["discipline"]["allowed"] and body["discipline"]["open"] == 1
    assert body["discipline"]["cases"][0]["case_type"] == "MEMO"
    for block in ("salary", "bonuses", "payslips", "gate_passes", "separations", "documents", "status_history", "reviews"):
        assert body[block]["allowed"] is True, block


@pytest.mark.asyncio
async def test_hr_clerk_gets_hidden_blocks_without_data(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    emp = await _employee(db, tenant)
    await _seed(db, tenant, user, emp)
    await db.commit()

    async with api_client(db, tenant, user) as c:
        body = (await c.get(f"{HR}/employees/{emp.id}/overview")).json()
    for block in ("discipline", "salary", "bonuses", "payslips", "gate_passes", "separations"):
        assert body[block] == {"allowed": False}, block
    assert body["leave"]["allowed"] and body["attendance"]["allowed"]


@pytest.mark.asyncio
async def test_payroll_key_opens_salary_but_not_discipline(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(
        db, permissions={"hr.access": True, "hr.payroll.manage": True}
    )
    emp = await _employee(db, tenant)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        body = (await c.get(f"{HR}/employees/{emp.id}/overview")).json()
    assert body["salary"]["allowed"] and body["payslips"]["allowed"] and body["bonuses"]["allowed"]
    assert body["discipline"] == {"allowed": False}


@pytest.mark.asyncio
async def test_other_tenant_employee_is_not_found(db_session_integration):
    db = db_session_integration
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    other, other_user, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    foreign = await _employee(db, other)
    await _seed(db, other, other_user, foreign)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{HR}/employees/{foreign.id}/overview")
    assert r.status_code == 404
