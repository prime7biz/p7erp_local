"""Two-step manual attendance: IN-only OPEN entry, later OUT, night shift, duplicates, missing-OUT
queue, payroll finalization block, device rebuild protection, locked period, permissions, tenancy.

Run: docker compose exec backend pytest tests/test_hr_manual_attendance.py -q
"""

from __future__ import annotations

from datetime import date, time

import pytest
from sqlalchemy import select

from app.common.permissions import PERMISSION_HR_ATTENDANCE_MANAGE
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, AttendanceRoster, AttendanceShift
from app.models.hr_payroll import PayrollPeriod, PayrollRun, PayrollRunLine
from app.modules.hr.hr_document_generator_service import employee_card_qr_payload
from app.modules.hr_payroll.payroll_calculation_service import count_present_days
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/attendance/manual"


async def _setup(db, role_name="clerk", perms=None):
    tenant, user, role = await create_merch_tenant_with_user(
        db, permissions=perms or {"hr.access": True, PERMISSION_HR_ATTENDANCE_MANAGE: True}
    )
    role.name = role_name
    emp = Employee(tenant_id=tenant.id, employee_code="EMP-0000010", first_name="Asha", is_active=True)
    db.add(emp)
    shift = AttendanceShift(tenant_id=tenant.id, code="DAY", name="Day", start_time=time(8), end_time=time(17), grace_in_minutes=10)
    night = AttendanceShift(tenant_id=tenant.id, code="NIGHT", name="Night", start_time=time(20), end_time=time(5), is_night_shift=True)
    db.add_all([shift, night])
    await db.flush()
    db.add(AttendanceRoster(tenant_id=tenant.id, employee_id=emp.id, roster_date=date(2026, 11, 2), shift_id=shift.id))
    db.add(AttendanceRoster(tenant_id=tenant.id, employee_id=emp.id, roster_date=date(2026, 11, 3), shift_id=night.id))
    await db.commit()
    return tenant, user, emp


@pytest.mark.asyncio
async def test_in_then_out_computes_attendance_and_counts_for_payroll(db_session_integration):
    db = db_session_integration
    tenant, user, emp = await _setup(db)
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{URL}/in", json={"employee_code": "emp-0000010", "work_date": "2026-11-02", "in_time": "08:25", "reason": "Device down"})
        assert r.status_code == 201, r.text
        assert r.json()["status"] == "OPEN" and r.json()["out_time"] is None and r.json()["late_minutes"] == 25
        dup = await c.post(f"{URL}/in", json={"employee_id": emp.id, "work_date": "2026-11-02", "in_time": "08:30", "reason": "again"})
        assert dup.status_code == 409 and "open IN" in dup.text
        assert await count_present_days(db, tenant_id=tenant.id, employee_id=emp.id, start=date(2026, 11, 1), end=date(2026, 11, 30)) == 0
        queue = (await c.get(f"{URL}/missing-out")).json()
        assert [q["employee_code"] for q in queue] == ["EMP-0000010"]
        bad = await c.post(f"{URL}/out", json={"employee_id": emp.id, "work_date": "2026-11-02", "out_time": "07:00", "reason": "Typo"})
        assert bad.status_code == 400
        out = await c.post(f"{URL}/out", json={"employee_id": emp.id, "work_date": "2026-11-02", "out_time": "19:00", "reason": "Shift end"})
        assert out.status_code == 200, out.text
        body = out.json()
        assert body["status"] == "LATE" and body["overtime_minutes"] == 120 and body["out_time"] == "19:00:00"
        assert (await c.post(f"{URL}/out", json={"employee_id": emp.id, "work_date": "2026-11-02", "out_time": "20:00", "reason": "Again"})).status_code == 409
        assert (await c.get(f"{URL}/missing-out")).json() == []
    assert await count_present_days(db, tenant_id=tenant.id, employee_id=emp.id, start=date(2026, 11, 1), end=date(2026, 11, 30)) == 1


@pytest.mark.asyncio
async def test_night_shift_and_card_scan(db_session_integration):
    db = db_session_integration
    tenant, user, emp = await _setup(db)
    card = employee_card_qr_payload(tenant.id, emp.employee_code)
    async with api_client(db, tenant, user) as c:
        assert (await c.get(f"{URL}/lookup", params={"q": card})).json()["id"] == emp.id
        await c.post(f"{URL}/in", json={"employee_code": card, "work_date": "2026-11-03", "in_time": "20:00", "reason": "Night"})
        out = await c.post(f"{URL}/out", json={"employee_code": card, "work_date": "2026-11-03", "out_time": "05:30", "reason": "Night end"})
        assert out.status_code == 200, out.text
        assert out.json()["status"] == "PRESENT" and out.json()["overtime_minutes"] == 30
        forged = card[:-1] + ("0" if card[-1] != "0" else "1")
        assert (await c.get(f"{URL}/lookup", params={"q": forged})).status_code == 404


@pytest.mark.asyncio
async def test_payroll_finalize_blocked_by_missing_out(db_session_integration):
    db = db_session_integration
    tenant, user, emp = await _setup(db, role_name="manager")
    period = PayrollPeriod(tenant_id=tenant.id, period_code="2026-11", start_date=date(2026, 11, 1), end_date=date(2026, 11, 30), payment_date=date(2026, 12, 5))
    db.add(period)
    await db.flush()
    run = PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code="R1", run_date=date(2026, 11, 30), status="DRAFT")
    db.add(run)
    await db.flush()
    db.add(PayrollRunLine(tenant_id=tenant.id, run_id=run.id, employee_id=emp.id, gross_pay=1000, deductions=0, net_pay=1000))
    await db.commit()
    async with api_client(db, tenant, user) as c:
        await c.post(f"{URL}/in", json={"employee_id": emp.id, "work_date": "2026-11-02", "in_time": "08:00", "reason": "Manual"})
        r = await c.post(f"/api/v1/hr/payroll/runs/{run.id}/finalize")
        assert r.status_code == 409 and "Missing OUT" in r.text
        await c.post(f"{URL}/out", json={"employee_id": emp.id, "work_date": "2026-11-02", "out_time": "17:00", "reason": "Closed"})
        assert (await c.post(f"/api/v1/hr/payroll/runs/{run.id}/finalize")).status_code == 200


@pytest.mark.asyncio
async def test_locked_period_permission_and_tenant(db_session_integration):
    db = db_session_integration
    tenant, user, emp = await _setup(db)
    db.add(PayrollPeriod(tenant_id=tenant.id, period_code="2026-10", start_date=date(2026, 10, 1), end_date=date(2026, 10, 31), payment_date=date(2026, 11, 5), is_locked=True, status="FINALIZED"))
    await db.commit()
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{URL}/in", json={"employee_id": emp.id, "work_date": "2026-10-15", "in_time": "08:00", "reason": "Late entry"})
        assert r.status_code == 400 and "locked" in r.text
    other, other_user, _ = await _setup(db)
    async with api_client(db, other, other_user) as c:
        r = await c.post(f"{URL}/in", json={"employee_id": emp.id, "work_date": "2026-11-05", "in_time": "08:00", "reason": "x x"})
        assert r.status_code == 404
    viewer, viewer_user, viewer_emp = await _setup(db, perms={"hr.access": True})
    async with api_client(db, viewer, viewer_user) as c:
        r = await c.post(f"{URL}/in", json={"employee_id": viewer_emp.id, "work_date": "2026-11-05", "in_time": "08:00", "reason": "x x"})
        assert r.status_code == 403
        assert (await c.get(f"{URL}/lookup", params={"q": viewer_emp.employee_code})).status_code == 403
        assert (await c.get(f"{URL}/missing-out")).status_code == 403


@pytest.mark.asyncio
async def test_device_rebuild_does_not_overwrite_manual_entry(db_session_integration):
    from datetime import datetime

    from app.models.hr_attendance_device import AttendanceDevice
    from app.modules.hr_attendance.device_adapters import ParseResult, RawPunch
    from app.modules.hr_attendance.device_service import process_punches

    db = db_session_integration
    tenant, user, emp = await _setup(db)
    async with api_client(db, tenant, user) as c:
        await c.post(f"{URL}/in", json={"employee_id": emp.id, "work_date": "2026-11-02", "in_time": "08:00", "reason": "Manual"})
    dev = AttendanceDevice(tenant_id=tenant.id, code="D1", name="Gate", device_type="FINGERPRINT", api_key_hash="x" * 64, api_key_prefix="p7test" + emp.employee_code[-4:], is_active=True)
    db.add(dev)
    await db.flush()
    parsed = ParseResult(punches=[RawPunch(line_no=1, user_code=emp.employee_code, punched_at=datetime(2026, 11, 2, 9, 0), direction="IN")], invalid_lines=[])
    summary = await process_punches(db, tenant_id=tenant.id, device=dev, parsed=parsed, source="IMPORT", user_id=user.id)
    await db.commit()
    entry = (await db.execute(select(AttendanceEntry).where(AttendanceEntry.employee_id == emp.id))).scalar_one()
    assert entry.source == "MANUAL" and entry.in_time == time(8, 0) and entry.status == "OPEN"
    assert summary.skipped_manual >= 1
