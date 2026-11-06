"""Attendance device push with Row-Level Security on (non-owner role + RLS_SESSION_TENANT_ENABLED).

The device key is looked up before any company is known, so that lookup runs in bypass; the
rest of the request must only see the device's own company.

Run: docker compose exec backend pytest tests/test_attendance_device_push_rls.py -q
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

import app.modules.hr_attendance.device_router as device_router
from app.common import rls
from app.database import get_db
from app.main import app
from tests.test_attendance_devices import _device, _setup
from tests.test_rls_policies import _become_probe_role, _db_context, owner_session, rls_flag_on  # noqa: F401

API = "/api/v1/hr/attendance"


async def _push(db, **kwargs):
    async def o_db():
        yield db

    app.dependency_overrides[get_db] = o_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            return await ac.post(f"{API}/device-push", **kwargs)
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_device_push_under_rls_pins_device_tenant(owner_session, rls_flag_on, monkeypatch):  # noqa: F811
    db = owner_session
    tenant_a, _ua, _ra, shift_a, emp_a = await _setup(db)
    tenant_b, _ub, _rb, _shift_b, emp_b = await _setup(db)
    device_a, key_a = await _device(db, tenant_a, shift_a)
    device_b, _key_b = await _device(db, tenant_b)
    await db.flush()
    await _become_probe_role(db)
    await rls.bind_session_tenant(db, tenant_b.id)  # stale pin from "another request" must not matter

    seen: dict = {}
    real_process = device_router.process_punches

    async def spying_process(session, **kwargs):
        seen["context"] = await _db_context(session)
        seen["employees"] = set(
            (
                await session.execute(
                    text("SELECT id FROM hr_employees WHERE id IN (:a, :b)"), {"a": emp_a.id, "b": emp_b.id}
                )
            ).scalars()
        )
        seen["devices"] = set(
            (
                await session.execute(
                    text("SELECT id FROM hr_attendance_devices WHERE id IN (:a, :b)"),
                    {"a": device_a.id, "b": device_b.id},
                )
            ).scalars()
        )
        return await real_process(session, **kwargs)

    monkeypatch.setattr(device_router, "process_punches", spying_process)
    body = [
        {"employee_code": emp_a.employee_code, "punched_at": "2026-06-01 08:00"},
        {"employee_code": emp_b.employee_code, "punched_at": "2026-06-01 08:01"},
    ]
    r = await _push(db, json=body, headers={"X-Device-Key": key_a, "X-Tenant-Id": str(tenant_b.id)})
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["inserted"] == 1 and result["entries_created"] == 1
    assert result["unmatched_codes"] == [emp_b.employee_code]

    # During processing the session was pinned to the device's company, not bypass / tenant B.
    assert seen["context"] == (str(tenant_a.id), "off")
    assert seen["employees"] == {emp_a.id}
    assert seen["devices"] == {device_a.id}
    # After the request the pin is dropped again (back to bypass for the next request).
    assert rls.session_rls_tenant_id(db) is None
    assert await _db_context(db) == ("", "on")

    counts = (
        await db.execute(
            text(
                "SELECT tenant_id, count(*) FROM hr_attendance_punches WHERE tenant_id IN (:a, :b) GROUP BY tenant_id"
            ),
            {"a": tenant_a.id, "b": tenant_b.id},
        )
    ).all()
    assert dict(counts) == {tenant_a.id: 1}


@pytest.mark.asyncio
async def test_device_push_under_rls_rejects_bad_key(owner_session, rls_flag_on):  # noqa: F811
    db = owner_session
    tenant_a, _ua, _ra, _shift_a, _emp_a = await _setup(db)
    _device_a, key_a = await _device(db, tenant_a)
    await db.flush()
    await _become_probe_role(db)
    bad = key_a[:-4] + "zzzz"
    r = await _push(db, json=[], headers={"X-Device-Key": bad})
    assert r.status_code == 401
    assert rls.session_rls_tenant_id(db) is None
