"""HR attendance / leave / payroll reports: counts are aggregated in SQL.

Old behaviour: a row cap (entries_limit / requests_limit / lines_limit) was applied BEFORE the
month / year filter, so busy tenants got silently wrong (too low) counts.
- Below the cap, the new SQL result must equal the old algorithm exactly.
- Above the cap (we pass a tiny *_limit), the new result must equal the old algorithm run with
  no cap (the true answer) and differ from the old capped answer.

The `_old_*` functions are copies of the pre-rewrite algorithms (reference only).

Run: docker compose exec backend pytest tests/test_perf_hr_reports_equivalence.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import AttendanceEntry, Employee, LeaveRequest, LeaveType, PayrollPeriod, PayrollRun, PayrollRunLine
from app.models.hr import Department

from tests.benchmark_fixtures import api_client, seed_tenant_admin

NO_CAP = 10**9


def _full_name(emp: Employee) -> str:
    return f"{emp.first_name} {emp.last_name}".strip() if emp.last_name else emp.first_name


async def _old_attendance_rows(db, tenant_id, *, month=None, department_id=None, limit=100, offset=0, entries_limit=500):
    """Old /hr/attendance/summary and /hr/reports/attendance algorithm (cap first, then month filter)."""
    stmt = select(Employee).where(Employee.tenant_id == tenant_id)
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == department_id)
    employees = (await db.execute(stmt.order_by(Employee.employee_code).offset(offset).limit(limit))).scalars().all()
    if not employees:
        return []
    entries = (
        await db.execute(
            select(AttendanceEntry)
            .where(AttendanceEntry.tenant_id == tenant_id, AttendanceEntry.employee_id.in_([e.id for e in employees]))
            .order_by(AttendanceEntry.attendance_date.desc(), AttendanceEntry.id.desc())
            .limit(entries_limit)
        )
    ).scalars().all()
    if month and len(month) == 7 and "-" in month:
        y_s, m_s = month.split("-", 1)
        try:
            y, m = int(y_s), int(m_s)
            entries = [x for x in entries if x.attendance_date.year == y and x.attendance_date.month == m]
        except ValueError:
            pass
    out = []
    for emp in employees:
        rows = [x for x in entries if x.employee_id == emp.id]
        out.append(
            {
                "employee_id": emp.id,
                "employee_code": emp.employee_code,
                "employee_name": _full_name(emp),
                "present_days": sum(1 for x in rows if (x.status or "").upper() in {"PRESENT", "LATE", "HALF_DAY"}),
                "absent_days": sum(1 for x in rows if (x.status or "").upper() == "ABSENT"),
                "late_days": sum(1 for x in rows if (x.status or "").upper() == "LATE"),
                "leave_days": sum(1 for x in rows if (x.status or "").upper() == "LEAVE"),
            }
        )
    return out


def _as_report_rows(summary_rows: list[dict]) -> list[dict]:
    """/hr/reports/attendance returns a subset of the summary columns."""
    keys = ("employee_code", "employee_name", "present_days", "absent_days", "leave_days")
    return [{k: r[k] for k in keys} for r in summary_rows]


async def _old_leave_rows(db, tenant_id, *, year=None, requests_limit=500):
    leave_types = (
        await db.execute(select(LeaveType).where(LeaveType.tenant_id == tenant_id).order_by(LeaveType.name).limit(1000))
    ).scalars().all()
    requests = (
        await db.execute(
            select(LeaveRequest).where(LeaveRequest.tenant_id == tenant_id).order_by(LeaveRequest.id.desc()).limit(requests_limit)
        )
    ).scalars().all()
    if year is not None:
        requests = [x for x in requests if x.from_date.year == year or x.to_date.year == year]
    out = []
    for lt in leave_types:
        rows = [x for x in requests if x.leave_type_id == lt.id]
        out.append(
            {
                "leave_type": lt.name,
                "total_requests": len(rows),
                "approved_requests": len([x for x in rows if x.status == "APPROVED"]),
                "pending_requests": len([x for x in rows if x.status == "PENDING"]),
                "rejected_requests": len([x for x in rows if x.status == "REJECTED"]),
            }
        )
    return out


async def _old_payroll_rows(db, tenant_id, *, year=None, runs_limit=100, lines_limit=500):
    periods = (
        await db.execute(
            select(PayrollPeriod).where(PayrollPeriod.tenant_id == tenant_id).order_by(PayrollPeriod.id.desc()).limit(1000)
        )
    ).scalars().all()
    runs = (
        await db.execute(select(PayrollRun).where(PayrollRun.tenant_id == tenant_id).order_by(PayrollRun.id.desc()).limit(runs_limit))
    ).scalars().all()
    lines = (
        await db.execute(
            select(PayrollRunLine).where(PayrollRunLine.tenant_id == tenant_id).order_by(PayrollRunLine.id.asc()).limit(lines_limit)
        )
    ).scalars().all()
    if year is not None:
        periods = [x for x in periods if x.start_date.year == year or x.end_date.year == year]
    period_map = {p.id: p for p in periods}
    out = []
    for run in runs:
        period = period_map.get(run.period_id)
        if not period:
            continue
        out.append(
            {
                "payroll_period": period.period_code,
                "total_employees": len([x for x in lines if x.run_id == run.id]),
                "gross_total": float(run.gross_total or 0),
                "deduction_total": float(run.deduction_total or 0),
                "net_total": float(run.net_total or 0),
            }
        )
    return out


async def _seed_hr(db, tenant, user):
    slug = uuid.uuid4().hex[:6]
    dept = Department(tenant_id=tenant.id, code=f"D{slug}", name="Sewing")
    db.add(dept)
    await db.flush()
    e1 = Employee(tenant_id=tenant.id, employee_code=f"A{slug}", first_name="Rina", last_name="Akter", department_id=dept.id)
    e2 = Employee(tenant_id=tenant.id, employee_code=f"B{slug}", first_name="Karim", last_name="", department_id=dept.id)
    e3 = Employee(tenant_id=tenant.id, employee_code=f"C{slug}", first_name="Solo")
    db.add_all([e1, e2, e3])
    await db.flush()

    def _att(emp, d, status):
        return AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=d, status=status)

    db.add_all(
        [
            _att(e1, date(2026, 10, 1), "PRESENT"),
            _att(e1, date(2026, 10, 2), "late"),
            _att(e1, date(2026, 10, 3), "HALF_DAY"),
            _att(e1, date(2026, 10, 4), "ABSENT"),
            _att(e1, date(2026, 10, 5), "LEAVE"),
            _att(e1, date(2026, 10, 6), "WFH"),
            _att(e1, date(2026, 10, 31), "Present"),
            _att(e1, date(2026, 9, 10), "PRESENT"),
            _att(e1, date(2026, 9, 11), "ABSENT"),
            _att(e1, date(2025, 10, 1), "PRESENT"),
            _att(e2, date(2026, 10, 1), "ABSENT"),
            _att(e2, date(2026, 10, 2), "ABSENT"),
            _att(e2, date(2026, 11, 1), "PRESENT"),
        ]
        + [_att(e2, date(2026, 9, d), "PRESENT") for d in range(1, 6)]
    )

    annual = LeaveType(tenant_id=tenant.id, code=f"AL{slug}", name="Annual")
    sick = LeaveType(tenant_id=tenant.id, code=f"SL{slug}", name="Sick")
    unused = LeaveType(tenant_id=tenant.id, code=f"UL{slug}", name="Unused")
    db.add_all([annual, sick, unused])
    await db.flush()

    def _leave(emp, lt, start, end, status):
        return LeaveRequest(tenant_id=tenant.id, employee_id=emp.id, leave_type_id=lt.id, from_date=start, to_date=end,
                            days_requested=Decimal((end - start).days + 1), status=status, requested_by=user.id)

    db.add_all(
        [
            _leave(e1, annual, date(2026, 1, 5), date(2026, 1, 6), "APPROVED"),
            _leave(e1, annual, date(2025, 12, 30), date(2026, 1, 2), "PENDING"),
            _leave(e2, annual, date(2025, 6, 1), date(2025, 6, 2), "REJECTED"),
            _leave(e2, sick, date(2026, 3, 1), date(2026, 3, 1), "APPROVED"),
            _leave(e2, sick, date(2026, 3, 9), date(2026, 3, 9), "DRAFT"),
            _leave(e3, sick, date(2026, 4, 1), date(2026, 4, 2), "PENDING"),
        ]
    )

    def _period(code, start, end):
        return PayrollPeriod(tenant_id=tenant.id, period_code=code, start_date=start, end_date=end, payment_date=end)

    p_sep = _period(f"S{slug}", date(2026, 9, 1), date(2026, 9, 30))
    p_oct = _period(f"O{slug}", date(2026, 10, 1), date(2026, 10, 31))
    p_dec = _period(f"D{slug}", date(2025, 12, 1), date(2025, 12, 31))
    db.add_all([p_sep, p_oct, p_dec])
    await db.flush()

    def _run(code, period, gross):
        return PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code=f"{code}{slug}", run_date=period.end_date,
                          gross_total=Decimal(gross), deduction_total=Decimal("10.5"), net_total=Decimal(gross) - Decimal("10.5"))

    r_sep, r_oct, r_oct2, r_dec = _run("RS", p_sep, "1000"), _run("RO", p_oct, "2000.25"), _run("RO2", p_oct, "0"), _run("RD", p_dec, "500")
    db.add_all([r_sep, r_oct, r_oct2, r_dec])
    await db.flush()
    lines = [(r_sep, e1), (r_sep, e2), (r_sep, e3), (r_oct, e1), (r_oct, e2), (r_dec, e1)]
    db.add_all([PayrollRunLine(tenant_id=tenant.id, run_id=r.id, employee_id=e.id, gross_pay=Decimal("1")) for r, e in lines])
    await db.flush()
    return {"dept": dept, "employees": [e1, e2, e3]}


ATTENDANCE_CASES = [
    {},
    {"month": "2026-10"},
    {"month": "2026-09"},
    {"month": "2025-10"},
    {"month": "2026-13"},
    {"month": "2026-1x"},
    {"month": "2026/10"},
    {"month": "0000-10"},
    {"month": "2026-10", "limit": 1, "offset": 1},
    {"month": "2026-10", "department": True},
]


@pytest.mark.asyncio
async def test_hr_reports_match_old_algorithm_below_cap_and_fix_it_above(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    other, other_user = await seed_tenant_admin(db)
    seeded = await _seed_hr(db, tenant, user)
    await _seed_hr(db, other, other_user)
    await db.commit()
    dept_id = seeded["dept"].id

    async with api_client(db, tenant, user) as ac:
        for case in ATTENDANCE_CASES:
            params = {k: v for k, v in case.items() if k != "department"}
            old_kwargs = dict(params)
            if case.get("department"):
                params["department_id"] = old_kwargs["department_id"] = dept_id
            expected = await _old_attendance_rows(db, tenant.id, **old_kwargs)

            r = await ac.get("/api/v1/hr/attendance/summary", params=params)
            assert r.status_code == 200, (case, r.text)
            assert r.json() == expected, case

            r = await ac.get("/api/v1/hr/reports/attendance", params=params)
            assert r.status_code == 200, (case, r.text)
            assert r.json() == _as_report_rows(expected), case

        oct_rows = {x["employee_name"]: x for x in (await ac.get("/api/v1/hr/attendance/summary", params={"month": "2026-10"})).json()}
        assert oct_rows["Rina Akter"] == {**oct_rows["Rina Akter"], "present_days": 4, "absent_days": 1, "late_days": 1, "leave_days": 1}
        assert oct_rows["Karim"]["absent_days"] == 2 and oct_rows["Solo"]["present_days"] == 0

        # Above the cap: 3 newest rows are all Oct/Nov, so the old code reported zero for September.
        capped = {"month": "2026-09", "entries_limit": 3}
        truth = await _old_attendance_rows(db, tenant.id, month="2026-09", entries_limit=NO_CAP)
        old_capped = await _old_attendance_rows(db, tenant.id, month="2026-09", entries_limit=3)
        assert truth != old_capped
        assert all(x["present_days"] == 0 for x in old_capped)
        r = await ac.get("/api/v1/hr/attendance/summary", params=capped)
        assert r.json() == truth
        assert {x["employee_name"]: x["present_days"] for x in r.json()} == {"Rina Akter": 1, "Karim": 5, "Solo": 0}
        r = await ac.get("/api/v1/hr/reports/attendance", params=capped)
        assert r.json() == _as_report_rows(truth)

        # Leave report.
        for year in (None, 2025, 2026, 2024):
            params = {"year": year} if year else {}
            r = await ac.get("/api/v1/hr/reports/leave", params=params)
            assert r.status_code == 200, r.text
            assert r.json() == await _old_leave_rows(db, tenant.id, year=year), year
        leave_2026 = {x["leave_type"]: x for x in (await ac.get("/api/v1/hr/reports/leave", params={"year": 2026})).json()}
        assert leave_2026["Annual"] == {"leave_type": "Annual", "total_requests": 2, "approved_requests": 1, "pending_requests": 1, "rejected_requests": 0}
        assert leave_2026["Unused"]["total_requests"] == 0
        old_capped_leave = await _old_leave_rows(db, tenant.id, year=2026, requests_limit=2)
        truth_leave = await _old_leave_rows(db, tenant.id, year=2026, requests_limit=NO_CAP)
        assert old_capped_leave != truth_leave
        r = await ac.get("/api/v1/hr/reports/leave", params={"year": 2026, "requests_limit": 2})
        assert r.json() == truth_leave

        # Payroll report.
        for params in ({}, {"year": 2026}, {"year": 2025}, {"year": 2027}, {"runs_limit": 2}):
            r = await ac.get("/api/v1/hr/reports/payroll", params=params)
            assert r.status_code == 200, r.text
            assert r.json() == await _old_payroll_rows(db, tenant.id, **params), params
        payroll = (await ac.get("/api/v1/hr/reports/payroll")).json()
        assert [x["total_employees"] for x in payroll] == [1, 0, 2, 3]
        assert payroll[2]["gross_total"] == 2000.25 and payroll[2]["net_total"] == 1989.75
        old_capped_pay = await _old_payroll_rows(db, tenant.id, lines_limit=2)
        truth_pay = await _old_payroll_rows(db, tenant.id, lines_limit=NO_CAP)
        assert [x["total_employees"] for x in old_capped_pay] == [0, 0, 0, 2]
        r = await ac.get("/api/v1/hr/reports/payroll", params={"lines_limit": 2})
        assert r.json() == truth_pay

    async with api_client(db, other, other_user) as ac:
        r = await ac.get("/api/v1/hr/attendance/summary", params={"month": "2026-10"})
        assert {x["employee_id"] for x in r.json()} == {
            e.id for e in (await db.execute(select(Employee).where(Employee.tenant_id == other.id))).scalars()
        }
