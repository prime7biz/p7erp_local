"""Notices / memos and the s.27(3A) unauthorized-absence sequence.

Run: docker compose exec backend pytest tests/test_hr_employee_cases.py -q
"""

from __future__ import annotations

from datetime import date, time

import pytest
from sqlalchemy import select

from app.common.permissions import PERMISSION_HR_DISCIPLINE_MANAGE
from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry
from app.models.hr_lifecycle import HrEmployeeCaseEvent, HrSeparation
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/cases"


async def _setup(db, role_name="manager"):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True, PERMISSION_HR_DISCIPLINE_MANAGE: True})
    role.name = role_name
    emp = Employee(tenant_id=tenant.id, employee_code="EMP-0000020", first_name="Absent", joining_date=date(2020, 1, 1), is_active=True)
    db.add(emp)
    await db.flush()
    db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 9, 30), in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"))
    await db.commit()
    return tenant, user, role, emp


async def _absence_case(c, emp):
    r = await c.post(URL, json={
        "employee_id": emp.id, "case_type": "ABSENCE", "subject": "Unauthorized absence from 01-10-2026",
        "body": "You have been absent without notice or permission since 01-10-2026.", "first_absent_date": "2026-10-01",
        "body_bn": "আপনি ০১-১০-২০২৬ থেকে অনুমতি ছাড়া অনুপস্থিত।",
    })
    assert r.status_code == 201, r.text
    return r.json()


@pytest.mark.asyncio
async def test_full_sequence_no_response_leads_to_deemed_resignation(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _setup(db)
    async with api_client(db, tenant, user) as c:
        cands = (await c.get(f"{URL}/absence-candidates", params={"as_of": "2026-10-15"})).json()
        assert [x["employee_id"] for x in cands] == [emp.id] and cands[0]["first_absent_date"] == "2026-10-01"
        case = await _absence_case(c, emp)
        too_early = await c.post(f"{URL}/{case['id']}/issue", json={"issue_date": "2026-10-09"})
        assert too_early.status_code == 400 and "more than" in too_early.text
        issued = await c.post(f"{URL}/{case['id']}/issue", json={"issue_date": "2026-10-12"})
        assert issued.status_code == 200 and issued.json()["reply_due_date"] == "2026-10-22"
        early_def = await c.post(f"{URL}/{case['id']}/defence-notice", json={"issue_date": "2026-10-20"})
        assert early_def.status_code == 400
        assert (await c.post(f"{URL}/{case['id']}/decide", json={"decision": "DEEMED_RESIGNATION", "decision_date": "2026-10-23"})).status_code == 409
        d = await c.post(f"{URL}/{case['id']}/defence-notice", json={"issue_date": "2026-10-23"})
        assert d.status_code == 200 and d.json()["defence_due_date"] == "2026-10-30"
        assert (await c.post(f"{URL}/{case['id']}/decide", json={"decision": "DEEMED_RESIGNATION", "decision_date": "2026-10-29"})).status_code == 400
        ok = await c.post(f"{URL}/{case['id']}/decide", json={"decision": "DEEMED_RESIGNATION", "decision_date": "2026-10-31"})
        assert ok.status_code == 200 and ok.json()["status"] == "DECIDED"
        detail = (await c.get(f"{URL}/{case['id']}")).json()
        assert [e["event_type"] for e in detail["events"]] == ["ISSUED", "DEFENCE_NOTICE_ISSUED", "DECISION"]
        assert detail["timeline"]["deemed_resignation_effective"] == "2026-10-01"
        pdf = await c.get(f"{URL}/{case['id']}/notice.pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")
    sep = (await db.execute(select(HrSeparation).where(HrSeparation.employee_id == emp.id))).scalar_one()
    assert sep.separation_type == "DEEMED_RESIGNATION" and sep.effective_date == date(2026, 10, 1) and sep.status == "DRAFT"


@pytest.mark.asyncio
async def test_explanation_without_rejoining_still_gets_defence_notice(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _setup(db)
    async with api_client(db, tenant, user) as c:
        case = await _absence_case(c, emp)
        await c.post(f"{URL}/{case['id']}/issue", json={"issue_date": "2026-10-12"})
        r = await c.post(f"{URL}/{case['id']}/events", json={"event_type": "RESPONSE", "event_date": "2026-10-18", "note": "Mother ill; cannot return yet"})
        assert r.json()["status"] == "RESPONDED"
        d = await c.post(f"{URL}/{case['id']}/defence-notice", json={"issue_date": "2026-10-23"})
        assert d.status_code == 200
        # A defence received after the defence notice blocks an automatic deemed resignation.
        await c.post(f"{URL}/{case['id']}/events", json={"event_type": "RESPONSE", "event_date": "2026-10-28", "note": "Medical certificate"})
        blocked = await c.post(f"{URL}/{case['id']}/decide", json={"decision": "DEEMED_RESIGNATION", "decision_date": "2026-10-31"})
        assert blocked.status_code == 409
        ok = await c.post(f"{URL}/{case['id']}/decide", json={"decision": "EXPLANATION_ACCEPTED", "decision_date": "2026-10-31"})
        assert ok.status_code == 200
    assert (await db.execute(select(HrSeparation).where(HrSeparation.employee_id == emp.id))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_rejoined_blocks_defence_and_premature_separation(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _setup(db)
    async with api_client(db, tenant, user) as c:
        case = await _absence_case(c, emp)
        await c.post(f"{URL}/{case['id']}/issue", json={"issue_date": "2026-10-12"})
        await c.post(f"{URL}/{case['id']}/events", json={"event_type": "REJOINED", "event_date": "2026-10-15"})
        assert (await c.post(f"{URL}/{case['id']}/defence-notice", json={"issue_date": "2026-10-23"})).status_code == 409
        assert (await c.post(f"{URL}/{case['id']}/decide", json={"decision": "REJOINED", "decision_date": "2026-10-16"})).status_code == 200


@pytest.mark.asyncio
async def test_attendance_during_absence_blocks_notice_and_memo_never_separates(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _setup(db)
    db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 10, 5), in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"))
    await db.commit()
    async with api_client(db, tenant, user) as c:
        case = await _absence_case(c, emp)
        assert (await c.post(f"{URL}/{case['id']}/issue", json={"issue_date": "2026-10-12"})).status_code == 409
        memo = (await c.post(URL, json={"employee_id": emp.id, "case_type": "MEMO", "subject": "Late arrival", "body": "Please arrive on time."})).json()
        await c.post(f"{URL}/{memo['id']}/issue", json={"issue_date": "2026-10-12"})
        assert (await c.post(f"{URL}/{memo['id']}/decide", json={"decision": "DISMISSAL", "decision_date": "2026-10-13"})).status_code == 400
        dis = (await c.post(URL, json={"employee_id": emp.id, "case_type": "DISCIPLINARY", "subject": "Theft", "body": "Charge sheet"})).json()
        await c.post(f"{URL}/{dis['id']}/issue", json={"issue_date": "2026-10-12", "reply_days": 7})
        assert (await c.post(f"{URL}/{dis['id']}/decide", json={"decision": "DISMISSAL", "decision_date": "2026-10-20"})).status_code == 409  # no hearing
    events = (await db.execute(select(HrEmployeeCaseEvent).where(HrEmployeeCaseEvent.tenant_id == tenant.id))).scalars().all()
    assert all(e.event_type != "DECISION" for e in events)


@pytest.mark.asyncio
async def test_permissions_and_cross_tenant(db_session_integration):
    db = db_session_integration
    tenant, user, role, emp = await _setup(db)
    async with api_client(db, tenant, user) as c:
        case = await _absence_case(c, emp)
    other, other_user, _r, _e = await _setup(db)
    async with api_client(db, other, other_user) as c:
        assert (await c.get(f"{URL}/{case['id']}")).status_code == 404
        assert (await c.post(URL, json={"employee_id": emp.id, "case_type": "MEMO", "subject": "x x x", "body": "y y y"})).status_code == 404
    role.name = "clerk"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        await c.post(f"{URL}/{case['id']}/issue", json={"issue_date": "2026-10-12"})
        assert (await c.post(f"{URL}/{case['id']}/decide", json={"decision": "EXPLANATION_ACCEPTED", "decision_date": "2026-10-20"})).status_code == 403
