"""Leave requests: server-counted days, overlap, cross-year, half day; carry-forward idempotency + cap.

Run: docker compose exec backend pytest tests/test_leave_days_rules.py -q

October 2026: Fridays are 2, 9, 16, 23, 30 (default weekend = Friday only).
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import AttendanceHoliday, TenantProductionSettings
from app.models.hr import Employee
from app.models.hr_leave import LeaveBalance, LeavePolicy, LeaveType
from tests.benchmark_fixtures import api_client, seed_tenant_admin

URL = "/api/v1/hr/leave/requests"
ESS_URL = "/api/v1/hr/ess/my-leave-requests"


async def _seed(db, *, flags: dict | None = None):
    tenant, user = await seed_tenant_admin(db)
    if flags:
        tenant.feature_flags = flags
    emp = Employee(
        tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:8]}", first_name="Worker",
        is_active=True, user_id=user.id,
    )
    ltype = LeaveType(tenant_id=tenant.id, code=f"CL{uuid.uuid4().hex[:4]}", name="Casual", is_paid=True)
    db.add_all([emp, ltype])
    await db.commit()
    return tenant, user, emp, ltype


def _body(emp, ltype, start: str, end: str, days: str = "1") -> dict:
    return {"employee_id": emp.id, "leave_type_id": ltype.id, "from_date": start, "to_date": end, "days_requested": days}


@pytest.mark.asyncio
async def test_days_skip_weekend_and_holidays(db_session_integration):
    db = db_session_integration
    tenant, user, emp, ltype = await _seed(db)
    db.add_all(
        [
            AttendanceHoliday(tenant_id=tenant.id, holiday_date=date(2026, 10, 13), name="Holiday"),
            AttendanceHoliday(tenant_id=tenant.id, holiday_date=date(2026, 10, 14), name="Optional", is_optional=True),
        ]
    )
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        # Mon 5 .. Sun 11: 7 days minus Friday 9 = 6 (the client's "1" is ignored).
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-05", "2026-10-11"))
        assert r.status_code == 201, r.text
        assert Decimal(r.json()["days_requested"]) == Decimal("6")
        # Mon 12 .. Thu 15: holiday on 13 is skipped, optional holiday on 14 still counts.
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-12", "2026-10-15"))
        assert r.status_code == 201, r.text
        assert Decimal(r.json()["days_requested"]) == Decimal("3")


@pytest.mark.asyncio
async def test_weekend_comes_from_factory_calendar_or_hr_override(db_session_integration):
    db = db_session_integration
    tenant, user, emp, ltype = await _seed(db)
    db.add(TenantProductionSettings(tenant_id=tenant.id, weekend_days=["friday", "saturday"]))
    await db.commit()
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-05", "2026-10-11"))
        assert r.status_code == 201, r.text
        assert Decimal(r.json()["days_requested"]) == Decimal("5")

    tenant2, user2, emp2, ltype2 = await _seed(db, flags={"hr_weekend_days": ["sunday"]})
    async with api_client(db, tenant2, user2) as ac:
        r = await ac.post(URL, json=_body(emp2, ltype2, "2026-10-05", "2026-10-11"))
        assert r.status_code == 201, r.text
        assert Decimal(r.json()["days_requested"]) == Decimal("6")


@pytest.mark.asyncio
async def test_half_day_only_for_a_single_working_day(db_session_integration):
    db = db_session_integration
    tenant, user, emp, ltype = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-06", "2026-10-06", days="0.5"))
        assert r.status_code == 201, r.text
        assert Decimal(r.json()["days_requested"]) == Decimal("0.5")
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-19", "2026-10-20", days="0.5"))
        assert r.status_code == 201, r.text
        assert Decimal(r.json()["days_requested"]) == Decimal("2")


@pytest.mark.asyncio
async def test_bad_dates_are_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, emp, ltype = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-08", "2026-10-06"))
        assert r.status_code == 400 and "on or after" in r.json()["detail"], r.text
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-09", "2026-10-09"))  # Friday only
        assert r.status_code == 400 and "weekends or holidays" in r.json()["detail"], r.text
        r = await ac.post(URL, json=_body(emp, ltype, "2026-12-30", "2027-01-03"))
        assert r.status_code == 400 and "cross the year end" in r.json()["detail"], r.text


@pytest.mark.asyncio
async def test_overlap_with_pending_or_approved_leave_is_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, emp, ltype = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        first = await ac.post(URL, json=_body(emp, ltype, "2026-10-19", "2026-10-21"))
        assert first.status_code == 201, first.text
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-21", "2026-10-22"))
        assert r.status_code == 409 and "overlap" in r.json()["detail"], r.text
        ok = await ac.post(URL, json=_body(emp, ltype, "2026-10-22", "2026-10-22"))
        assert ok.status_code == 201, ok.text
        # Moving the second request onto the first one's dates is refused too.
        r = await ac.patch(f"{URL}/{ok.json()['id']}", json={"from_date": "2026-10-20"})
        assert r.status_code == 409, r.text
        # A rejected request no longer blocks the dates.
        rej = await ac.post(f"{URL}/{first.json()['id']}/reject", json={"note": "no"})
        assert rej.status_code == 200, rej.text
        again = await ac.post(URL, json=_body(emp, ltype, "2026-10-19", "2026-10-21"))
        assert again.status_code == 201, again.text


@pytest.mark.asyncio
async def test_patch_recalculates_days(db_session_integration):
    db = db_session_integration
    tenant, user, emp, ltype = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(URL, json=_body(emp, ltype, "2026-10-05", "2026-10-06"))
        assert r.status_code == 201, r.text
        r = await ac.patch(f"{URL}/{r.json()['id']}", json={"to_date": "2026-10-11", "days_requested": "99"})
        assert r.status_code == 200, r.text
        assert Decimal(r.json()["days_requested"]) == Decimal("6")


@pytest.mark.asyncio
async def test_ess_apply_uses_the_same_rules(db_session_integration):
    db = db_session_integration
    tenant, user, emp, ltype = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(ESS_URL, json={"leave_type_id": ltype.id, "from_date": "2026-10-05", "to_date": "2026-10-11"})
        assert r.status_code == 201, r.text
        assert r.json()["days_count"] == 6.0
        r = await ac.post(ESS_URL, json={"leave_type_id": ltype.id, "from_date": "2026-10-09", "to_date": "2026-10-09"})
        assert r.status_code == 400, r.text
        r = await ac.post(ESS_URL, json={"leave_type_id": ltype.id, "from_date": "2026-12-31", "to_date": "2027-01-01"})
        assert r.status_code == 400, r.text
        # A pending HR request blocks overlapping ESS requests.
        hr = await ac.post(URL, json=_body(emp, ltype, "2026-10-26", "2026-10-27"))
        assert hr.status_code == 201, hr.text
        r = await ac.post(ESS_URL, json={"leave_type_id": ltype.id, "from_date": "2026-10-27", "to_date": "2026-10-28"})
        assert r.status_code == 409, r.text
        # Two overlapping drafts are allowed, but only one can be submitted.
        d1 = await ac.post(ESS_URL, json={"leave_type_id": ltype.id, "from_date": "2026-11-02", "to_date": "2026-11-03"})
        d2 = await ac.post(ESS_URL, json={"leave_type_id": ltype.id, "from_date": "2026-11-03", "to_date": "2026-11-04"})
        assert d1.status_code == 201 and d2.status_code == 201, (d1.text, d2.text)
        s1 = await ac.post(f"{URL}/{d1.json()['id']}/submit")
        assert s1.status_code == 200, s1.text
        s2 = await ac.post(f"{URL}/{d2.json()['id']}/submit")
        assert s2.status_code == 409, s2.text


@pytest.mark.asyncio
async def test_carry_forward_is_idempotent_and_capped(db_session_integration):
    db = db_session_integration
    tenant, user, emp, annual = await _seed(db)
    casual = LeaveType(tenant_id=tenant.id, code=f"NP{uuid.uuid4().hex[:4]}", name="No policy", is_paid=True)
    db.add(casual)
    await db.flush()
    db.add(
        LeavePolicy(
            tenant_id=tenant.id, leave_type_id=annual.id, annual_quota_days=Decimal("20"),
            max_carry_forward_days=Decimal("10"), effective_from=date(2025, 1, 1),
        )
    )
    db.add_all(
        [
            LeaveBalance(
                tenant_id=tenant.id, employee_id=emp.id, leave_type_id=annual.id, balance_year=2025,
                allocated_days=Decimal("20"), used_days=Decimal("8"), pending_days=Decimal("0"),
                closing_balance_days=Decimal("12"),
            ),
            LeaveBalance(
                tenant_id=tenant.id, employee_id=emp.id, leave_type_id=casual.id, balance_year=2025,
                allocated_days=Decimal("5"), used_days=Decimal("2"), pending_days=Decimal("0"),
                closing_balance_days=Decimal("3"),
            ),
            # The new year's allocation already exists for the annual leave type.
            LeaveBalance(
                tenant_id=tenant.id, employee_id=emp.id, leave_type_id=annual.id, balance_year=2026,
                allocated_days=Decimal("20"), used_days=Decimal("1"), pending_days=Decimal("0"),
                closing_balance_days=Decimal("19"),
            ),
        ]
    )
    await db.commit()

    async with api_client(db, tenant, user) as ac:
        body = {"from_year": 2025, "to_year": 2026}
        first = await ac.post("/api/v1/hr/leave/balances/carry-forward", json=body)
        assert first.status_code == 200, first.text
        assert first.json()["carried"] == 2 and first.json()["capped"] == 1
        second = await ac.post("/api/v1/hr/leave/balances/carry-forward", json=body)
        assert second.status_code == 200, second.text
        assert second.json()["carried"] == 0 and second.json()["skipped_already_carried"] == 2
        bad = await ac.post("/api/v1/hr/leave/balances/carry-forward", json={"from_year": 2026, "to_year": 2026})
        assert bad.status_code == 400, bad.text

    rows = (
        await db.execute(
            select(LeaveBalance).where(LeaveBalance.employee_id == emp.id, LeaveBalance.balance_year == 2026)
        )
    ).scalars().all()
    by_type = {r.leave_type_id: r for r in rows}
    await db.refresh(by_type[annual.id])
    assert Decimal(str(by_type[annual.id].allocated_days)) == Decimal("30")  # 20 + capped 10, once
    assert Decimal(str(by_type[annual.id].closing_balance_days)) == Decimal("29")
    assert Decimal(str(by_type[casual.id].allocated_days)) == Decimal("3")  # no policy: uncapped
