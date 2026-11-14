"""Tier 1 / Tier 2 approval of employee changes (tenant flag hr_employee_change_approval, migration 303).

Run: docker compose exec backend pytest tests/test_hr_change_requests.py -q
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import select

from app.models import AuditLog, Employee, User
from app.models.hr_change_request import HrEmployeeChangeRequest
from app.modules.settings.router import _employee_change_tier_holders
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import _create_role_for_tenant, create_merch_tenant_with_user

HR = "/api/v1/hr"
ON = {"hr_employee_change_approval": True}
T1 = "hr.employee.change.tier1"
T2 = "hr.employee.change.tier2"


async def _user(db, tenant, name: str, permissions: dict, role_name: str | None = None) -> User:
    role = await _create_role_for_tenant(
        db, tenant_id=tenant.id, name=role_name or f"r_{name}_{uuid.uuid4().hex[:4]}", display_name=name, permissions=permissions
    )
    slug = uuid.uuid4().hex[:8]
    user = User(
        tenant_id=tenant.id, role_id=role.id, username=f"{name}{slug}", email=f"{name}{slug}@example.com",
        password_hash="unused", is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _setup(db, *, flags: dict | None = None):
    tenant, maker, _role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    tenant.feature_flags = {**(tenant.feature_flags or {}), **(ON if flags is None else flags)}
    tier1 = await _user(db, tenant, "tier1", {"hr.access": True, T1: True})
    tier2 = await _user(db, tenant, "tier2", {"hr.access": True, T2: True})
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Karim", is_active=True)
    db.add(emp)
    await db.commit()
    return tenant, maker, tier1, tier2, emp


def _info(first_name: str = "Rahim", request_id: str | None = None) -> dict:
    return {
        "kind": "INFO",
        "payload": {"first_name": first_name, "employment_type": "temporary"},
        "reason": "Name spelled wrong on joining",
        "request_id": request_id or f"req-{uuid.uuid4().hex[:12]}",
    }


async def _first_name(db, emp_id: int) -> str:
    # A column select always reads the database row (no identity-map cache).
    return (await db.execute(select(Employee.first_name).where(Employee.id == emp_id))).scalar_one()


@pytest.mark.asyncio
async def test_full_flow_tier1_then_tier2_applies_the_change(db_session_integration):
    db = db_session_integration
    tenant, maker, tier1, tier2, emp = await _setup(db)
    emp_id, tenant_id = emp.id, tenant.id

    async with api_client(db, tenant, maker) as c:
        direct = await c.patch(f"{HR}/employees/{emp_id}", json={"first_name": "Direct"})
        assert direct.status_code == 409 and "CHANGE_APPROVAL_REQUIRED" in direct.json()["detail"]
        r = await c.post(f"{HR}/employees/{emp_id}/change-requests", json=_info())
        assert r.status_code == 201, r.text
        req = r.json()
    assert req["status"] == "PENDING_TIER1" and req["before"]["first_name"] == "Karim"
    assert await _first_name(db, emp_id) == "Karim"  # nothing applied yet

    async with api_client(db, tenant, tier1) as c:
        queue = (await c.get(f"{HR}/change-requests", params={"view": "tier1"})).json()
        assert [x["id"] for x in queue] == [req["id"]]
        r1 = await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "APPROVE"})
        assert r1.status_code == 200 and r1.json()["status"] == "PENDING_TIER2"
    assert await _first_name(db, emp_id) == "Karim"

    async with api_client(db, tenant, tier2) as c:
        r2 = await c.post(f"{HR}/change-requests/{req['id']}/tier2-decision", json={"decision": "APPROVE", "note": "ok"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["status"] == "APPLIED"
    assert await _first_name(db, emp_id) == "Rahim"
    actions = set(
        (await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant_id))).scalars().all()
    )
    assert {"HR_CHANGE_REQUESTED", "HR_CHANGE_TIER1_APPROVED", "HR_CHANGE_TIER2_APPROVED", "HR_CHANGE_APPLIED"} <= actions


@pytest.mark.asyncio
async def test_separation_of_duties_and_strict_keys(db_session_integration):
    db = db_session_integration
    tenant, maker, tier1, tier2, emp = await _setup(db)
    both = await _user(db, tenant, "both", {"hr.access": True, T1: True, T2: True})
    admin = await _user(db, tenant, "adm", {"*": True}, role_name="admin")
    await db.commit()

    async with api_client(db, tenant, both) as c:
        req = (await c.post(f"{HR}/employees/{emp.id}/change-requests", json=_info())).json()
        own = await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "APPROVE"})
        assert own.status_code == 403  # the maker can never approve
    async with api_client(db, tenant, admin) as c:
        r = await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "APPROVE"})
        assert r.status_code == 403  # admin role / "*" is not a tier key
    async with api_client(db, tenant, tier2) as c:
        r = await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "APPROVE"})
        assert r.status_code == 403  # Tier 2 key is not Tier 1
    async with api_client(db, tenant, tier1) as c:
        assert (await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "APPROVE"})).status_code == 200
    async with api_client(db, tenant, tier2) as c:
        done = await c.post(f"{HR}/change-requests/{req['id']}/tier2-decision", json={"decision": "APPROVE"})
        assert done.status_code == 200 and done.json()["status"] == "APPLIED"
    # A user holding both keys who gave Tier 1 cannot also give Tier 2.
    other = await _user(db, tenant, "other", {"hr.access": True, T1: True, T2: True})
    await db.commit()
    async with api_client(db, tenant, other) as c:
        req2 = (await c.post(f"{HR}/employees/{emp.id}/change-requests", json={**_info(), "kind": "INFO", "payload": {"last_name": "X"}})).json()
    async with api_client(db, tenant, both) as c:
        assert (await c.post(f"{HR}/change-requests/{req2['id']}/tier1-decision", json={"decision": "APPROVE"})).status_code == 200
        r = await c.post(f"{HR}/change-requests/{req2['id']}/tier2-decision", json={"decision": "APPROVE"})
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_reject_needs_a_reason_and_changes_nothing(db_session_integration):
    db = db_session_integration
    tenant, maker, tier1, _tier2, emp = await _setup(db)
    async with api_client(db, tenant, maker) as c:
        req = (await c.post(f"{HR}/employees/{emp.id}/change-requests", json=_info())).json()
    async with api_client(db, tenant, tier1) as c:
        assert (await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "REJECT"})).status_code == 400
        r = await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "REJECT", "note": "Wrong person"})
        assert r.status_code == 200 and r.json()["status"] == "REJECTED"
    assert await _first_name(db, emp.id) == "Karim"


@pytest.mark.asyncio
async def test_retry_and_double_click_are_safe_and_one_open_request_per_kind(db_session_integration):
    db = db_session_integration
    tenant, maker, tier1, _tier2, emp = await _setup(db)
    body = _info(request_id="retry-same-0001")
    async with api_client(db, tenant, maker) as c:
        first = await c.post(f"{HR}/employees/{emp.id}/change-requests", json=body)
        again = await c.post(f"{HR}/employees/{emp.id}/change-requests", json=body)
        assert first.status_code == 201 and again.status_code == 200 and first.json()["id"] == again.json()["id"]
        second_open = await c.post(f"{HR}/employees/{emp.id}/change-requests", json=_info("Other"))
        assert second_open.status_code == 409
    rid = first.json()["id"]
    async with api_client(db, tenant, tier1) as c:
        a = await c.post(f"{HR}/change-requests/{rid}/tier1-decision", json={"decision": "APPROVE"})
        b = await c.post(f"{HR}/change-requests/{rid}/tier1-decision", json={"decision": "APPROVE"})
        assert a.status_code == b.status_code == 200 and b.json()["status"] == "PENDING_TIER2"
    count = (
        await db.execute(select(HrEmployeeChangeRequest.id).where(HrEmployeeChangeRequest.employee_id == emp.id))
    ).scalars().all()
    assert len(count) == 1


@pytest.mark.asyncio
async def test_stale_request_fails_without_overwriting(db_session_integration):
    db = db_session_integration
    tenant, maker, tier1, tier2, emp = await _setup(db)
    async with api_client(db, tenant, maker) as c:
        req = (await c.post(f"{HR}/employees/{emp.id}/change-requests", json=_info())).json()
    async with api_client(db, tenant, tier1) as c:
        await c.post(f"{HR}/change-requests/{req['id']}/tier1-decision", json={"decision": "APPROVE"})
    row = await db.get(Employee, emp.id)
    row.first_name = "Changed meanwhile"
    await db.commit()
    async with api_client(db, tenant, tier2) as c:
        r = await c.post(f"{HR}/change-requests/{req['id']}/tier2-decision", json={"decision": "APPROVE"})
    assert r.status_code == 200 and r.json()["status"] == "FAILED"
    assert "changed since the request" in r.json()["failure_reason"]
    assert await _first_name(db, emp.id) == "Changed meanwhile"


@pytest.mark.asyncio
async def test_invalid_change_is_refused_at_submit(db_session_integration):
    db = db_session_integration
    tenant, maker, _t1, _t2, emp = await _setup(db)
    async with api_client(db, tenant, maker) as c:
        bad_fk = await c.post(
            f"{HR}/employees/{emp.id}/change-requests",
            json={**_info(), "payload": {"department_id": 999999999}},
        )
        assert bad_fk.status_code in (400, 404)
        pay = await c.post(
            f"{HR}/employees/{emp.id}/change-requests",
            json={"kind": "PAY_BENEFITS", "payload": {"benefits": []}, "reason": "x", "request_id": "pay-benefits-01"},
        )
        assert pay.status_code == 403  # pay changes need hr.payroll.manage
        empty = await c.post(f"{HR}/employees/{emp.id}/change-requests", json={**_info(), "payload": {}})
        assert empty.status_code == 400
    assert (await db.execute(select(HrEmployeeChangeRequest.id).where(HrEmployeeChangeRequest.employee_id == emp.id))).first() is None


@pytest.mark.asyncio
async def test_other_tenant_and_flag_off(db_session_integration):
    db = db_session_integration
    tenant, maker, tier1, _t2, emp = await _setup(db)
    other_tenant, other_maker, _o1, _o2, other_emp = await _setup(db)
    async with api_client(db, other_tenant, other_maker) as c:
        foreign_req = (await c.post(f"{HR}/employees/{other_emp.id}/change-requests", json=_info())).json()
    async with api_client(db, tenant, maker) as c:
        assert (await c.post(f"{HR}/employees/{other_emp.id}/change-requests", json=_info())).status_code == 404
        assert (await c.get(f"{HR}/change-requests/{foreign_req['id']}")).status_code == 404
    async with api_client(db, tenant, tier1) as c:
        r = await c.post(f"{HR}/change-requests/{foreign_req['id']}/tier1-decision", json={"decision": "APPROVE"})
        assert r.status_code == 404

    tenant.feature_flags = {**tenant.feature_flags, "hr_employee_change_approval": False}
    await db.commit()
    async with api_client(db, tenant, maker) as c:
        assert (await c.post(f"{HR}/employees/{emp.id}/change-requests", json=_info())).status_code == 409
        direct = await c.patch(f"{HR}/employees/{emp.id}", json={"first_name": "Direct"})
        assert direct.status_code == 200, direct.text
    assert await _first_name(db, emp.id) == "Direct"


@pytest.mark.asyncio
async def test_every_direct_write_path_is_closed_while_the_flag_is_on(db_session_integration):
    db = db_session_integration
    tenant, _maker, _t1, _t2, emp = await _setup(db)
    manager = await _user(db, tenant, "mgr", {"hr.access": True}, role_name="manager")
    await db.commit()
    PAY = f"{HR}/payroll"
    BD = f"{HR}/localization/bd-rmg"
    async with api_client(db, tenant, manager) as c:
        calls = [
            await c.patch(f"{HR}/employees/{emp.id}", json={"first_name": "X"}),
            await c.post(f"{HR}/employees/{emp.id}/activate"),
            await c.post(f"{HR}/employees/{emp.id}/deactivate"),
            await c.put(f"{HR}/employees/{emp.id}/compensation", json={"structure_id": 1, "effective_from": "2026-12-01"}),
            await c.put(f"{HR}/employees/{emp.id}/pay-benefits", json={"benefits": []}),
            await c.put(f"{HR}/employees/{emp.id}/tax-profile", json={}),
            await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": 1, "effective_from": "2026-12-01"}),
            await c.post(f"{PAY}/assignments/1/end", json={"effective_to": "2026-12-31"}),
            await c.post(f"{BD}/wage-assignments", json={"employee_id": emp.id, "wage_rate_id": 1, "effective_from": "2026-12-01"}),
            await c.post(f"{BD}/wage-assignments/1/end", json={"effective_to": "2026-12-31"}),
        ]
    for r in calls:
        assert r.status_code == 409, (r.request.url, r.status_code, r.text)
        assert "CHANGE_APPROVAL_REQUIRED" in r.json()["detail"]
    assert await _first_name(db, emp.id) == "Karim"
    # Existing-row Excel import must refuse updates (no silent overwrite) while the flag is on.
    from io import BytesIO

    from openpyxl import Workbook
    from starlette.datastructures import UploadFile

    from app.modules.hr.service import import_employees_excel

    wb = Workbook()
    ws = wb.active
    ws.append(
        [
            "employee_code",
            "first_name",
            "last_name",
            "email",
            "phone",
            "department_id",
            "designation_id",
            "section_id",
            "employee_category",
            "joining_date",
            "employment_type",
            "is_active",
            "date_of_birth",
        ]
    )
    ws.append([emp.employee_code, "ImportOverwrite", "", "", "", "", "", "", "WORKER", "", "", "Y", ""])
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)
    result = await import_employees_excel(db, tenant, manager, UploadFile(filename="emps.xlsx", file=buf))
    assert result["updated"] == 0
    assert any("Tier 1 / Tier 2" in e for e in result["errors"])
    assert await _first_name(db, emp.id) == "Karim"


def _config_body(flags: dict) -> dict:
    return {"company_name": "Change Approval Co", "tenant_type": "manufacturer", "feature_flags": flags}


@pytest.mark.asyncio
async def test_settings_needs_two_people_holding_the_tier_keys(db_session_integration):
    db = db_session_integration
    tenant, _maker, tier1, tier2, _emp = await _setup(db, flags={})
    t1, t2 = await _employee_change_tier_holders(db, tenant.id)
    assert t1 == {tier1.id} and t2 == {tier2.id}
    lonely, lonely_admin, lonely_role = await create_merch_tenant_with_user(db, permissions={"*": True})
    lonely_role.name = "admin"
    await db.commit()
    assert await _employee_change_tier_holders(db, lonely.id) == (set(), set())  # "*" does not count
    async with api_client(db, lonely, lonely_admin) as c:
        refused = await c.put("/api/v1/settings/config", json=_config_body(ON))
    assert refused.status_code == 400
    assert "Tier 1" in refused.json()["detail"]
    await db.refresh(lonely)
    assert (lonely.feature_flags or {}).get("hr_employee_change_approval") is not True

    # Same tenant with both tier holders can switch the flag on.
    admin = await _user(db, tenant, "admin", {"*": True}, role_name="admin")
    await db.commit()
    async with api_client(db, tenant, admin) as c:
        ok = await c.put("/api/v1/settings/config", json=_config_body(ON))
        assert ok.status_code == 200, ok.text
        assert ok.json()["feature_flags"]["hr_employee_change_approval"] is True
    await db.refresh(tenant)
    assert tenant.feature_flags["hr_employee_change_approval"] is True
