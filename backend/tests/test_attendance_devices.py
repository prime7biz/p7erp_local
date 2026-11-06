"""Attendance devices: setup, punch import, device push and how punches become attendance.

Run: docker exec <backend> pytest tests/test_attendance_devices.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, time

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.permissions import PERMISSION_HR_ATTENDANCE_MANAGE
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import (
    AttendanceDevice,
    AttendanceEntry,
    AttendancePunch,
    AttendanceRegularizationRequest,
    AttendanceRoster,
    AttendanceShift,
    Employee,
    PayrollPeriod,
)
from app.modules.hr_attendance.device_adapters import parse_punches
from app.modules.hr_attendance.device_service import (
    PUNCH_SOURCE_IMPORT,
    generate_api_key,
    process_punches,
)
from tests.merch_fixtures import create_merch_tenant_with_user

HR_MANAGER = {"hr.access": True, PERMISSION_HR_ATTENDANCE_MANAGE: True}
API = "/api/v1/hr/attendance"


@asynccontextmanager
async def _client(db, tenant=None, user=None):
    """Staff client when tenant/user are given; otherwise an anonymous client (device push)."""

    async def o_db():
        yield db

    app.dependency_overrides[get_db] = o_db
    if user is not None:
        app.dependency_overrides[get_current_user] = lambda: user
        app.dependency_overrides[require_tenant] = lambda: tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            if tenant is not None:
                ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def _setup(db, *, permissions=None, night=False):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions=permissions or HR_MANAGER)
    slug = uuid.uuid4().hex[:6]
    shift = AttendanceShift(
        tenant_id=tenant.id,
        code=f"S{slug}",
        name="Night" if night else "Day",
        start_time=time(20, 0) if night else time(8, 0),
        end_time=time(5, 0) if night else time(17, 0),
        grace_in_minutes=10,
        break_minutes=60,
        is_night_shift=night,
        is_active=True,
    )
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{slug}", first_name="Worker")
    db.add_all([shift, emp])
    await db.flush()
    return tenant, user, role, shift, emp


async def _device(db, tenant, shift=None, *, active=True):
    key, prefix, key_hash = generate_api_key()
    device = AttendanceDevice(
        tenant_id=tenant.id,
        code=f"D{uuid.uuid4().hex[:6]}",
        name="Gate",
        device_type="ZKTECO",
        api_key_hash=key_hash,
        api_key_prefix=prefix,
        default_shift_id=shift.id if shift else None,
        is_active=active,
    )
    db.add(device)
    await db.flush()
    return device, key


async def _entries(db, emp) -> dict[date, AttendanceEntry]:
    rows = (await db.execute(select(AttendanceEntry).where(AttendanceEntry.employee_id == emp.id))).scalars().all()
    return {r.attendance_date: r for r in rows}


async def _count(db, model, *where) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*where))).scalar() or 0)


def _csv(code: str) -> str:
    return (
        "employee_code,punched_at,direction\n"
        f"{code},2026-03-02 08:05,IN\n"
        f"{code},2026-03-02 17:00,OUT\n"
        f"{code.lower()},2026-03-03 08:30,IN\n"
        f"{code},2026-03-03 16:00,OUT\n"
        f"{code},2026-03-04 07:50,IN\n"
        f"{code},2026-03-04 19:00,OUT\n"
        "NOPE,2026-03-02 08:00,IN\n"
        f"{code},not-a-time,IN\n"
    )


@pytest.mark.asyncio
async def test_device_setup_import_and_reimport_is_idempotent(db_session_integration):
    db = db_session_integration
    tenant, user, _role, shift, emp = await _setup(db)
    await db.commit()

    async with _client(db, tenant, user) as c:
        r = await c.post(f"{API}/devices", json={"code": "GATE-1", "name": "Main gate", "default_shift_id": shift.id})
        assert r.status_code == 201, r.text
        created = r.json()
        assert created["api_key"].startswith(f"p7d_{created['api_key_prefix']}_")
        device_id = created["id"]
        stored = await db.get(AttendanceDevice, device_id)
        assert created["api_key"] not in stored.api_key_hash

        r = await c.get(f"{API}/devices")
        assert r.status_code == 200
        assert "api_key" not in r.json()[0]

        files = {"file": ("punches.csv", _csv(emp.employee_code).encode(), "text/csv")}
        r = await c.post(f"{API}/devices/{device_id}/punches/import", files=files)
        assert r.status_code == 200, r.text
        first = r.json()
        assert first["received"] == 8
        assert first["inserted"] == 6
        assert first["duplicates"] == 0
        assert first["unmatched_codes"] == ["NOPE"]
        assert first["invalid_count"] == 1
        assert first["entries_created"] == 3

        entries = await _entries(db, emp)
        present = entries[date(2026, 3, 2)]
        assert (present.status, present.in_time, present.out_time, present.source) == (
            "PRESENT", time(8, 5), time(17, 0), "DEVICE"
        )
        late = entries[date(2026, 3, 3)]
        assert (late.status, late.late_minutes, late.early_out_minutes) == ("LATE", 30, 60)
        assert entries[date(2026, 3, 4)].overtime_minutes == 120

        files = {"file": ("punches.csv", _csv(emp.employee_code).encode(), "text/csv")}
        r = await c.post(f"{API}/devices/{device_id}/punches/import", files=files)
        again = r.json()
        assert (again["inserted"], again["duplicates"], again["entries_created"], again["entries_updated"]) == (0, 6, 0, 0)
        assert again["entries_unchanged"] == 3

        # A hand correction turns the entry into MANUAL, so the next import leaves it alone.
        r = await c.patch(f"{API}/entries/{present.id}", json={"in_time": "08:00:00"})
        assert r.status_code == 200 and r.json()["source"] == "MANUAL"
        r = await c.post(
            f"{API}/devices/{device_id}/punches/import",
            json={"punches": [{"employee_code": emp.employee_code, "punched_at": "2026-03-02 18:30"}]},
        )
        assert r.status_code == 200, r.text
        assert r.json()["inserted"] == 1 and r.json()["skipped_manual"] == 1
    await db.refresh(present)
    assert present.in_time == time(8, 0) and present.out_time == time(17, 0)


@pytest.mark.asyncio
async def test_manual_regularized_and_locked_days_are_not_touched(db_session_integration):
    db = db_session_integration
    tenant, user, _role, shift, emp = await _setup(db)
    device, _key = await _device(db, tenant, shift)
    manual = AttendanceEntry(
        tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 4, 1), status="ABSENT", source="MANUAL"
    )
    regularized = AttendanceEntry(
        tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 4, 2), status="PRESENT", source="DEVICE",
        in_time=time(9, 0),
    )
    db.add_all([manual, regularized])
    db.add(
        PayrollPeriod(
            tenant_id=tenant.id, period_code=f"LK{uuid.uuid4().hex[:5]}", start_date=date(2026, 4, 10),
            end_date=date(2026, 4, 20), payment_date=date(2026, 4, 21), status="FINALIZED", is_locked=True,
        )
    )
    await db.flush()
    db.add(
        AttendanceRegularizationRequest(
            tenant_id=tenant.id, attendance_entry_id=regularized.id, requested_in_time=time(9, 0), reason="Card lost",
            status="APPROVED", requested_by=user.id,
        )
    )
    await db.flush()

    code = emp.employee_code
    text = f"{code},2026-04-01 08:00\n{code},2026-04-02 08:00\n{code},2026-04-15 08:00\n{code},2026-04-15 17:00\n"
    summary = await process_punches(
        db, tenant_id=tenant.id, device=device, parsed=parse_punches("csv", text), source=PUNCH_SOURCE_IMPORT
    )
    assert summary.inserted == 4
    assert summary.skipped_manual == 2
    assert summary.skipped_locked == 1
    assert summary.entries_created == 0
    entries = await _entries(db, emp)
    assert entries[date(2026, 4, 1)].status == "ABSENT"
    assert entries[date(2026, 4, 2)].in_time == time(9, 0)
    assert date(2026, 4, 15) not in entries
    # The punches are still stored, so the day can be rebuilt once the period is reopened.
    assert await _count(db, AttendancePunch, AttendancePunch.employee_id == emp.id) == 4


@pytest.mark.asyncio
async def test_night_shift_morning_punch_belongs_to_previous_day(db_session_integration):
    db = db_session_integration
    tenant, user, _role, night, emp = await _setup(db, night=True)
    device, _key = await _device(db, tenant)
    db.add(AttendanceRoster(tenant_id=tenant.id, employee_id=emp.id, roster_date=date(2026, 5, 4), shift_id=night.id))
    await db.flush()
    code = emp.employee_code
    text = f"{code}\t2026-05-04 20:25:00\t0\n{code}\t2026-05-05 05:30:00\t1\n"
    summary = await process_punches(
        db, tenant_id=tenant.id, device=device, parsed=parse_punches("zkteco", text), source=PUNCH_SOURCE_IMPORT
    )
    assert summary.entries_created == 1
    entries = await _entries(db, emp)
    assert list(entries) == [date(2026, 5, 4)]
    entry = entries[date(2026, 5, 4)]
    assert (entry.in_time, entry.out_time, entry.status) == (time(20, 25), time(5, 30), "LATE")
    assert (entry.late_minutes, entry.overtime_minutes, entry.early_out_minutes) == (25, 30, 0)


@pytest.mark.asyncio
async def test_non_hr_manager_cannot_configure_or_import(db_session_integration):
    db = db_session_integration
    tenant, clerk, _role, shift, _emp = await _setup(db, permissions={"hr.access": True})
    device, _key = await _device(db, tenant, shift)
    await db.commit()
    async with _client(db, tenant, clerk) as c:
        assert (await c.get(f"{API}/devices")).status_code == 403
        assert (await c.post(f"{API}/devices", json={"code": "X1", "name": "X"})).status_code == 403
        assert (await c.patch(f"{API}/devices/{device.id}", json={"is_active": False})).status_code == 403
        assert (await c.post(f"{API}/devices/{device.id}/rotate-key")).status_code == 403
        r = await c.post(f"{API}/devices/{device.id}/punches/import", json={"punches": []})
        assert r.status_code == 403
    assert await _count(db, AttendanceDevice, AttendanceDevice.tenant_id == tenant.id) == 1


@pytest.mark.asyncio
async def test_device_push_key_auth_and_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, _r, shift_a, emp_a = await _setup(db)
    tenant_b, _user_b, _r2, _shift_b, emp_b = await _setup(db)
    device, key = await _device(db, tenant_a, shift_a)
    inactive, inactive_key = await _device(db, tenant_a, active=False)
    await db.commit()

    body = [
        {"employee_code": emp_a.employee_code, "punched_at": "2026-06-01 08:00"},
        {"employee_code": emp_b.employee_code, "punched_at": "2026-06-01 08:00"},
    ]
    async with _client(db) as c:
        assert (await c.post(f"{API}/device-push", json=body)).status_code == 401
        assert (await c.post(f"{API}/device-push", json=body, headers={"X-Device-Key": "p7d_bad"})).status_code == 401
        wrong_secret = key[:-4] + "zzzz"
        assert (await c.post(f"{API}/device-push", json=body, headers={"X-Device-Key": wrong_secret})).status_code == 401
        r = await c.post(f"{API}/device-push", json=body, headers={"X-Device-Key": inactive_key})
        assert r.status_code == 401

        # The company comes from the device: tenant B's employee code is unknown here, header ignored.
        r = await c.post(
            f"{API}/device-push", json=body, headers={"X-Device-Key": key, "X-Tenant-Id": str(tenant_b.id)}
        )
        assert r.status_code == 200, r.text
        result = r.json()
        assert result["inserted"] == 1 and result["entries_created"] == 1
        assert result["unmatched_codes"] == [emp_b.employee_code]

        attlog = f"{emp_a.employee_code}\t2026-06-01 17:05:00\t1\t1\t0\t0\n"
        r = await c.post(
            f"{API}/device-push", content=attlog.encode(), headers={"X-Device-Key": key, "Content-Type": "text/plain"}
        )
        assert r.status_code == 200, r.text
        assert r.json()["entries_updated"] == 1

    assert await _count(db, AttendanceEntry, AttendanceEntry.tenant_id == tenant_b.id) == 0
    assert await _count(db, AttendancePunch, AttendancePunch.tenant_id == tenant_b.id) == 0
    await db.refresh(device)
    assert device.last_seen_at is not None
    entry = (await _entries(db, emp_a))[date(2026, 6, 1)]
    assert (entry.in_time, entry.out_time) == (time(8, 0), time(17, 5))

    async with _client(db, tenant_a, user_a) as c:
        r = await c.post(f"{API}/devices/{device.id}/rotate-key")
        assert r.status_code == 200
        new_key = r.json()["api_key"]
    async with _client(db) as c:
        assert (await c.post(f"{API}/device-push", json=[], headers={"X-Device-Key": key})).status_code == 401
        r = await c.post(f"{API}/device-push", json=[], headers={"X-Device-Key": new_key})
        assert r.status_code == 200 and r.json()["received"] == 0


@pytest.mark.asyncio
async def test_device_shift_must_belong_to_tenant(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, _r, _shift_a, _emp = await _setup(db)
    _tenant_b, _u, _r2, shift_b, _emp_b = await _setup(db)
    await db.commit()
    async with _client(db, tenant_a, user_a) as c:
        r = await c.post(f"{API}/devices", json={"code": "G2", "name": "Gate", "default_shift_id": shift_b.id})
        assert r.status_code == 400
        r = await c.post(f"{API}/devices", json={"code": "G2", "name": "Gate", "device_type": "UNKNOWN"})
        assert r.status_code == 400
        r = await c.post(f"{API}/devices", json={"code": "G2", "name": "Gate"})
        device_id = r.json()["id"]
        r = await c.patch(f"{API}/devices/{device_id}", json={"is_active": False, "name": "Old gate"})
        assert r.status_code == 200 and r.json()["is_active"] is False
        assert datetime.fromisoformat(r.json()["updated_at"])
        # Last step: the duplicate-code error rolls back this test's transaction.
        r = await c.post(f"{API}/devices", json={"code": "G2", "name": "Again"})
        assert r.status_code == 400 and "already exists" in r.text
