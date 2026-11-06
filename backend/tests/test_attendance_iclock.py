"""ZKTeco cloud push (/iclock): device = serial number + allowed IPs; PIN -> employee mapping.

Run: docker compose exec backend pytest tests/test_attendance_iclock.py -q
"""

from __future__ import annotations

import uuid
from datetime import datetime

import pytest
from sqlalchemy import select

from app.config import get_settings
from app.models import AttendancePunch, Employee
from app.modules.hr_attendance.device_service import (
    ip_is_allowed,
    match_employee_codes,
    normalize_allowed_ips,
)
from tests.test_attendance_devices import API, _client, _count, _device, _setup

FACTORY_IP = "103.4.145.10"
OTHER_IP = "182.48.70.5"


def _serial() -> str:
    return f"CKJ{uuid.uuid4().hex[:9].upper()}"


def _from(ip: str) -> dict[str, str]:
    return {"X-Forwarded-For": ip}


async def _iclock_device(db, tenant, shift=None, *, serial=None, allowed=FACTORY_IP, active=True):
    device, _key = await _device(db, tenant, shift, active=active)
    device.serial_number = serial or _serial()
    device.push_allowed_ips = allowed
    await db.flush()
    return device


def test_allowed_ip_parsing():
    assert normalize_allowed_ips(" 203.0.113.7 ; 198.51.100.0/24,203.0.113.7 ") == "203.0.113.7/32,198.51.100.0/24"
    assert normalize_allowed_ips("") is None
    with pytest.raises(ValueError):
        normalize_allowed_ips("203.0.113.300")
    assert ip_is_allowed("198.51.100.0/24", "198.51.100.99")
    assert not ip_is_allowed("198.51.100.0/24", "198.51.101.1")
    assert not ip_is_allowed("198.51.100.0/24", "unknown")
    assert not ip_is_allowed(None, FACTORY_IP)


@pytest.mark.asyncio
async def test_handshake_and_attlog_upload_with_pin_mapping(db_session_integration):
    db = db_session_integration
    tenant, _user, _role, shift, emp_code = await _setup(db)
    emp_pin = Employee(
        tenant_id=tenant.id,
        employee_code=f"P{uuid.uuid4().hex[:6]}",
        first_name="Pin",
        attendance_device_pin="101",
    )
    db.add(emp_pin)
    device = await _iclock_device(db, tenant, shift)
    sn = device.serial_number
    await db.commit()

    async with _client(db) as c:
        r = await c.get("/iclock/cdata", params={"SN": sn.lower(), "options": "all"}, headers=_from(FACTORY_IP))
        assert r.status_code == 200, r.text
        assert r.headers["content-type"].startswith("text/plain")
        assert r.text.startswith(f"GET OPTION FROM: {sn}\n")
        assert "ATTLOGStamp=None" in r.text and "TransFlag=TransData AttLog" in r.text

        attlog = (
            "101\t2026-06-01 08:00:00\t0\t1\t0\t0\t0\n"
            f"{emp_code.employee_code}\t2026-06-01 08:02:00\t0\t1\t0\t0\t0\n"
            "999999\t2026-06-01 08:03:00\t0\t1\t0\t0\t0\n"
        )
        r = await c.post(
            "/iclock/cdata",
            params={"SN": sn, "table": "ATTLOG", "Stamp": "123456"},
            content=attlog.encode(),
            headers=_from(FACTORY_IP),
        )
        assert r.status_code == 200, r.text
        assert r.text == "OK: 3"

        r = await c.get("/iclock/cdata", params={"SN": sn}, headers=_from(FACTORY_IP))
        assert "ATTLOGStamp=123456" in r.text
        r = await c.post(
            "/iclock/cdata",
            params={"SN": sn, "table": "OPERLOG", "Stamp": "1"},
            content=b"OPLOG 4\t0\t2026-06-01 08:00:00\t0\t0\t0\t0\n",
            headers=_from(FACTORY_IP),
        )
        assert (r.status_code, r.text) == (200, "OK")
        r = await c.get("/iclock/getrequest", params={"SN": sn}, headers=_from(FACTORY_IP))
        assert (r.status_code, r.text) == (200, "OK")

    punches = (await db.execute(select(AttendancePunch).where(AttendancePunch.device_id == device.id))).scalars().all()
    by_emp = {p.employee_id: p for p in punches}
    assert set(by_emp) == {emp_pin.id, emp_code.id}
    assert by_emp[emp_pin.id].device_user_code == "101"
    assert by_emp[emp_pin.id].source == "PUSH"
    assert by_emp[emp_pin.id].punched_at == datetime(2026, 6, 1, 8, 0)
    await db.refresh(device)
    assert device.last_seen_at is not None
    assert device.iclock_attlog_stamp == "123456"


@pytest.mark.asyncio
async def test_iclock_is_off_unless_serial_and_allowed_ip_match(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, *_ = await _setup(db)
    ready = await _iclock_device(db, tenant)
    no_ips = await _iclock_device(db, tenant, allowed=None)
    inactive = await _iclock_device(db, tenant, active=False)
    await db.commit()

    async with _client(db) as c:
        assert (await c.get("/iclock/cdata", params={"SN": ready.serial_number}, headers=_from(FACTORY_IP))).status_code == 200
        for params, ip in (
            ({"SN": ready.serial_number}, OTHER_IP),  # wrong IP
            ({"SN": no_ips.serial_number}, FACTORY_IP),  # serial but no allow-list
            ({"SN": inactive.serial_number}, FACTORY_IP),
            ({"SN": _serial()}, FACTORY_IP),  # unknown serial
            ({}, FACTORY_IP),  # no serial at all
        ):
            r = await c.get("/iclock/cdata", params=params, headers=_from(ip))
            assert r.status_code == 401, (params, ip, r.text)
            r = await c.post(
                "/iclock/cdata",
                params={**params, "table": "ATTLOG"},
                content=b"1\t2026-06-01 08:00:00\t0\t1\n",
                headers=_from(ip),
            )
            assert r.status_code == 401
        # Spoofed left-most X-Forwarded-For entries are ignored (right-most public hop wins).
        r = await c.get(
            "/iclock/cdata", params={"SN": ready.serial_number}, headers={"X-Forwarded-For": f"{FACTORY_IP}, {OTHER_IP}"}
        )
        assert r.status_code == 401

        monkeypatch.setattr(get_settings(), "attendance_iclock_enabled", False)
        r = await c.get("/iclock/cdata", params={"SN": ready.serial_number}, headers=_from(FACTORY_IP))
        assert r.status_code == 404
    assert await _count(db, AttendancePunch, AttendancePunch.tenant_id == tenant.id) == 0


@pytest.mark.asyncio
async def test_same_serial_in_two_companies_resolves_by_ip_and_stays_isolated(db_session_integration):
    db = db_session_integration
    tenant_a, _ua, _ra, _sa, emp_a = await _setup(db)
    tenant_b, _ub, _rb, _sb, emp_b = await _setup(db)
    emp_b.attendance_device_pin = "777"
    serial = _serial()
    dev_a = await _iclock_device(db, tenant_a, serial=serial, allowed=FACTORY_IP)
    dev_b = await _iclock_device(db, tenant_b, serial=serial, allowed=OTHER_IP)
    await db.commit()

    body = f"777\t2026-06-02 08:00:00\t0\t1\n{emp_a.employee_code}\t2026-06-02 08:01:00\t0\t1\n".encode()
    async with _client(db) as c:
        r = await c.post(
            "/iclock/cdata",
            params={"SN": serial, "table": "ATTLOG"},
            content=body,
            headers={**_from(FACTORY_IP), "X-Tenant-Id": str(tenant_b.id)},
        )
        assert r.status_code == 200, r.text
    rows = (
        await db.execute(
            select(AttendancePunch.tenant_id, AttendancePunch.device_id, AttendancePunch.employee_id).where(
                AttendancePunch.device_id.in_([dev_a.id, dev_b.id])
            )
        )
    ).all()
    # Tenant B's PIN 777 is unknown to tenant A's device; nothing reaches tenant B.
    assert [tuple(r) for r in rows] == [(tenant_a.id, dev_a.id, emp_a.id)]
    assert emp_b.id not in {r[2] for r in rows}

    # Both companies allowing the same IP for the same serial is ambiguous: refused.
    dev_b.push_allowed_ips = FACTORY_IP
    await db.commit()
    async with _client(db) as c:
        r = await c.get("/iclock/cdata", params={"SN": serial}, headers=_from(FACTORY_IP))
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_iclock_rate_limit_per_device(db_session_integration, monkeypatch):
    db = db_session_integration
    tenant, *_ = await _setup(db)
    device = await _iclock_device(db, tenant)
    await db.commit()
    monkeypatch.setattr(get_settings(), "attendance_iclock_rate_limit_per_device_per_minute", 2)
    async with _client(db) as c:
        codes = [
            (await c.get("/iclock/getrequest", params={"SN": device.serial_number}, headers=_from(FACTORY_IP))).status_code
            for _ in range(3)
        ]
    assert codes[:2] == [200, 200]
    assert codes[2] == 429


@pytest.mark.asyncio
async def test_device_settings_api_validates_serial_and_allowed_ips(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await _setup(db)
    other_tenant, *_ = await _setup(db)
    serial = _serial()
    await _iclock_device(db, other_tenant, serial=serial)  # another company may use the same serial
    await db.commit()
    async with _client(db, tenant, user) as c:
        r = await c.post(
            f"{API}/devices",
            json={"code": "ZK1", "name": "Gate", "serial_number": f" {serial.lower()} ", "push_allowed_ips": "103.4.145.0/24"},
        )
        assert r.status_code == 201, r.text
        out = r.json()
        assert out["serial_number"] == serial
        assert out["push_allowed_ips"] == "103.4.145.0/24"
        assert out["iclock_ready"] is True
        r = await c.patch(f"{API}/devices/{out['id']}", json={"push_allowed_ips": "not-an-ip"})
        assert r.status_code == 400 and "not an IP address" in r.text
        r = await c.patch(f"{API}/devices/{out['id']}", json={"push_allowed_ips": ""})
        assert r.status_code == 200 and r.json()["iclock_ready"] is False
        # Last step: the duplicate-serial error rolls back this test's transaction.
        r = await c.post(f"{API}/devices", json={"code": "ZK2", "name": "Gate 2", "serial_number": serial})
        assert r.status_code == 400 and "serial number already exists" in r.text


@pytest.mark.asyncio
async def test_employee_api_saves_device_pin_unique_per_company(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await _setup(db)
    other_tenant, *_ = await _setup(db)
    db.add(Employee(tenant_id=other_tenant.id, employee_code=f"O{uuid.uuid4().hex[:6]}", first_name="Other", attendance_device_pin="55"))
    await db.commit()
    async with _client(db, tenant, user) as c:
        r = await c.post("/api/v1/hr/employees", json={"first_name": "Rahim", "attendance_device_pin": " 55 "})
        assert r.status_code == 201, r.text
        first = r.json()
        assert first["attendance_device_pin"] == "55"
        r = await c.patch(f"/api/v1/hr/employees/{first['id']}", json={"attendance_device_pin": ""})
        assert r.status_code == 200 and r.json()["attendance_device_pin"] is None
        r = await c.patch(f"/api/v1/hr/employees/{first['id']}", json={"attendance_device_pin": "55"})
        assert r.status_code == 200
        # Last step: the duplicate-PIN error rolls back this test's transaction.
        r = await c.post("/api/v1/hr/employees", json={"first_name": "Karim", "attendance_device_pin": "55"})
        assert r.status_code == 400 and "attendance device PIN already exists" in r.text


@pytest.mark.asyncio
async def test_pin_wins_over_employee_code_and_code_is_the_fallback(db_session_integration):
    db = db_session_integration
    tenant, *_ = await _setup(db)
    slug = uuid.uuid4().hex[:5]
    by_code = Employee(tenant_id=tenant.id, employee_code=f"C{slug}", first_name="Code")
    pinned = Employee(tenant_id=tenant.id, employee_code=f"X{slug}", first_name="Pin", attendance_device_pin=f"c{slug}")
    plain = Employee(tenant_id=tenant.id, employee_code=f"Y{slug}", first_name="Plain")
    db.add_all([by_code, pinned, plain])
    await db.flush()
    got = await match_employee_codes(db, tenant.id, {f"C{slug}", f"Y{slug}", "nobody"})
    # "C..." equals by_code's code but pinned's PIN (case-insensitive): the PIN wins.
    assert got == {f"C{slug}": pinned.id, f"Y{slug}": plain.id}
