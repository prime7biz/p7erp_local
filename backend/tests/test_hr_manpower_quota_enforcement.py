"""Phase 2: over-quota hire block + exception four-eyes.

Run: docker compose exec backend pytest tests/test_hr_manpower_quota_enforcement.py -q
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from sqlalchemy import select

from app.models.hr import Department, Designation, Employee
from app.models.hr_manpower import HrManpowerQuotaException, HrManpowerQuotaExceptionConsumption
from app.models import User
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import _create_role_for_tenant, create_merch_tenant_with_user

HR = "/api/v1/hr"
MP = "/api/v1/hr/manpower"
APPROVE = "hr.manpower.exception.approve"
REQUEST = "hr.manpower.exception.request"


async def _user(db, tenant, name: str, permissions: dict) -> User:
    role = await _create_role_for_tenant(
        db,
        tenant_id=tenant.id,
        name=f"r_{name}_{uuid.uuid4().hex[:4]}",
        display_name=name,
        permissions=permissions,
    )
    slug = uuid.uuid4().hex[:8]
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"{name}{slug}",
        email=f"{name}{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


async def _setup(db, *, enforce: bool = True):
    flags = {
        "manpower_control_v1": True,
        "manpower_quota_enforcement_v1": enforce,
    }
    tenant, maker, _role = await create_merch_tenant_with_user(
        db,
        permissions={
            "hr.access": True,
            "hr.manpower.manage": True,
            "hr.manpower.read": True,
            REQUEST: True,
        },
    )
    tenant.feature_flags = {**(tenant.feature_flags or {}), **flags}
    approver = await _user(
        db,
        tenant,
        "approver",
        {"hr.access": True, "hr.manpower.read": True, APPROVE: True},
    )
    dept = Department(tenant_id=tenant.id, code=f"D{uuid.uuid4().hex[:6]}", name="Sewing", is_active=True)
    desig = Designation(tenant_id=tenant.id, code=f"G{uuid.uuid4().hex[:6]}", title="Operator", is_active=True)
    db.add_all([dept, desig])
    await db.flush()
    desig.department_id = dept.id
    await db.commit()
    return tenant, maker, approver, dept, desig


async def _set_quota(c, dept_id: int, desig_id: int, quota: int):
    r = await c.put(
        f"{MP}/sanctioned",
        json={
            "department_id": dept_id,
            "designation_id": desig_id,
            "approved_quota": quota,
            "effective_from": date.today().isoformat(),
        },
    )
    assert r.status_code == 200, r.text


def _emp_body(dept_id: int, desig_id: int, first: str = "Karim") -> dict:
    return {
        "first_name": first,
        "department_id": dept_id,
        "designation_id": desig_id,
        "is_active": True,
    }


def _detail_code(resp) -> str | None:
    detail = resp.json().get("detail")
    if isinstance(detail, dict):
        return detail.get("code")
    if isinstance(detail, str) and "MANPOWER_QUOTA" in detail:
        return "MANPOWER_QUOTA_EXCEEDED" if "EXCEEDED" in detail else "MANPOWER_QUOTA_UNDEFINED"
    return None


async def _revive(db, *objs) -> None:
    """Reload ORM rows after safe_async_session_rollback expires them (409 paths)."""
    for obj in objs:
        if obj is not None:
            await db.refresh(obj)


@pytest.mark.asyncio
async def test_flag_off_allows_hire(db_session_integration):
    db = db_session_integration
    tenant, maker, _, dept, desig = await _setup(db, enforce=False)
    dept_id, desig_id = dept.id, desig.id
    async with api_client(db, tenant, maker) as c:
        await _set_quota(c, dept_id, desig_id, 0)
        r = await c.post(f"{HR}/employees", json=_emp_body(dept_id, desig_id))
        assert r.status_code == 201, r.text


@pytest.mark.asyncio
async def test_over_quota_create_blocked_then_exception_allows(db_session_integration):
    db = db_session_integration
    tenant, maker, approver, dept, desig = await _setup(db)
    dept_id, desig_id, tenant_id = dept.id, desig.id, tenant.id

    async with api_client(db, tenant, maker) as c:
        await _set_quota(c, dept_id, desig_id, 1)
        ok = await c.post(f"{HR}/employees", json=_emp_body(dept_id, desig_id, "One"))
        assert ok.status_code == 201, ok.text
        blocked = await c.post(f"{HR}/employees", json=_emp_body(dept_id, desig_id, "Two"))
        assert blocked.status_code == 409
        assert _detail_code(blocked) == "MANPOWER_QUOTA_EXCEEDED"

    await _revive(db, tenant, maker, approver)
    req_id = f"req-{uuid.uuid4().hex[:12]}"
    async with api_client(db, tenant, maker) as c:
        exc = await c.post(
            f"{MP}/exceptions",
            json={
                "department_id": dept_id,
                "designation_id": desig_id,
                "extra_slots": 1,
                "reason": "Rush order needs one more operator",
                "request_id": req_id,
            },
        )
        assert exc.status_code == 201, exc.text
        exc_id = exc.json()["id"]
        replay = await c.post(
            f"{MP}/exceptions",
            json={
                "department_id": dept_id,
                "designation_id": desig_id,
                "extra_slots": 1,
                "reason": "Rush order needs one more operator",
                "request_id": req_id,
            },
        )
        assert replay.status_code == 201
        assert replay.json()["id"] == exc_id

    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        deny = await c.post(f"{MP}/exceptions/{exc_id}/decision", json={"decision": "APPROVE"})
        assert deny.status_code == 403

    await _revive(db, tenant, maker, approver)
    async with api_client(db, tenant, approver) as c:
        yes = await c.post(f"{MP}/exceptions/{exc_id}/decision", json={"decision": "APPROVE", "note": "ok"})
        assert yes.status_code == 200, yes.text
        assert yes.json()["status"] == "APPROVED"

    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        allowed = await c.post(f"{HR}/employees", json=_emp_body(dept_id, desig_id, "Two"))
        assert allowed.status_code == 201, allowed.text

    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        again = await c.post(f"{HR}/employees", json=_emp_body(dept_id, desig_id, "Three"))
        assert again.status_code == 409

    cons = (
        await db.execute(
            select(HrManpowerQuotaExceptionConsumption).where(
                HrManpowerQuotaExceptionConsumption.tenant_id == tenant_id
            )
        )
    ).scalars().all()
    assert len(cons) == 1


@pytest.mark.asyncio
async def test_undefined_quota_and_null_dept(db_session_integration):
    db = db_session_integration
    tenant, maker, _, dept, desig = await _setup(db)
    dept_id, desig_id = dept.id, desig.id
    async with api_client(db, tenant, maker) as c:
        r = await c.post(f"{HR}/employees", json=_emp_body(dept_id, desig_id))
        assert r.status_code == 409
        assert _detail_code(r) == "MANPOWER_QUOTA_UNDEFINED"
    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        null_dept = await c.post(f"{HR}/employees", json={"first_name": "NoDept", "is_active": True})
        assert null_dept.status_code == 409
        assert _detail_code(null_dept) == "MANPOWER_QUOTA_UNDEFINED"


@pytest.mark.asyncio
async def test_activate_blocked_when_cell_full(db_session_integration):
    db = db_session_integration
    tenant, maker, _, dept, desig = await _setup(db)
    from app.models import Role

    # Activate endpoint requires manager/admin role name.
    role_row = await db.get(Role, maker.role_id)
    assert role_row is not None
    role_row.name = "manager"
    await db.commit()
    dept_id, desig_id = dept.id, desig.id
    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        await _set_quota(c, dept_id, desig_id, 1)
        a = await c.post(f"{HR}/employees", json=_emp_body(dept_id, desig_id, "Active"))
        assert a.status_code == 201
    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        b = await c.post(
            f"{HR}/employees",
            json={**_emp_body(dept_id, desig_id, "Inactive"), "is_active": False},
        )
        assert b.status_code == 201, b.text
        emp_b = b.json()["id"]
    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        act = await c.post(f"{HR}/employees/{emp_b}/activate")
        assert act.status_code == 409
        assert _detail_code(act) == "MANPOWER_QUOTA_EXCEEDED"


@pytest.mark.asyncio
async def test_admin_cannot_approve_without_explicit_key(db_session_integration):
    db = db_session_integration
    tenant, maker, _, dept, desig = await _setup(db)
    from app.models import Role

    admin = await _user(
        db,
        tenant,
        "adminuser",
        {"hr.access": True, "hr.manpower.read": True, "*": True},
    )
    role_row = await db.get(Role, admin.role_id)
    assert role_row is not None
    role_row.name = "admin"
    await db.commit()

    dept_id, desig_id = dept.id, desig.id
    await _revive(db, tenant, maker, admin)
    async with api_client(db, tenant, maker) as c:
        await _set_quota(c, dept_id, desig_id, 0)
        exc = await c.post(
            f"{MP}/exceptions",
            json={
                "department_id": dept_id,
                "designation_id": desig_id,
                "extra_slots": 1,
                "reason": "Need one",
                "request_id": f"req-{uuid.uuid4().hex[:12]}",
            },
        )
        assert exc.status_code == 201
        exc_id = exc.json()["id"]

    await _revive(db, tenant, admin)
    async with api_client(db, tenant, admin) as c:
        r = await c.post(f"{MP}/exceptions/{exc_id}/decision", json={"decision": "APPROVE"})
        assert r.status_code == 403


@pytest.mark.asyncio
async def test_reassign_rebinds_consumption_to_new_exception(db_session_integration):
    """F1 follow-up: moving cells updates the consumption row so the old slot frees."""
    db = db_session_integration
    tenant, maker, approver, dept_a, desig_a = await _setup(db)
    dept_b = Department(
        tenant_id=tenant.id, code=f"D{uuid.uuid4().hex[:6]}", name="Finishing", is_active=True
    )
    desig_b = Designation(
        tenant_id=tenant.id, code=f"G{uuid.uuid4().hex[:6]}", title="Finisher", is_active=True
    )
    db.add_all([dept_b, desig_b])
    await db.flush()
    desig_b.department_id = dept_b.id
    await db.commit()

    a_dept, a_desig = dept_a.id, desig_a.id
    b_dept, b_desig = dept_b.id, desig_b.id
    await _revive(db, tenant, maker, approver)

    async with api_client(db, tenant, maker) as c:
        await _set_quota(c, a_dept, a_desig, 0)
        await _set_quota(c, b_dept, b_desig, 0)
        ex_a = await c.post(
            f"{MP}/exceptions",
            json={
                "department_id": a_dept,
                "designation_id": a_desig,
                "extra_slots": 1,
                "reason": "Slot for cell A",
                "request_id": f"req-a-{uuid.uuid4().hex[:10]}",
            },
        )
        assert ex_a.status_code == 201, ex_a.text
        ex_a_id = ex_a.json()["id"]
        ex_b = await c.post(
            f"{MP}/exceptions",
            json={
                "department_id": b_dept,
                "designation_id": b_desig,
                "extra_slots": 1,
                "reason": "Slot for cell B",
                "request_id": f"req-b-{uuid.uuid4().hex[:10]}",
            },
        )
        assert ex_b.status_code == 201, ex_b.text
        ex_b_id = ex_b.json()["id"]

    await _revive(db, tenant, approver)
    async with api_client(db, tenant, approver) as c:
        assert (
            await c.post(f"{MP}/exceptions/{ex_a_id}/decision", json={"decision": "APPROVE"})
        ).status_code == 200
        assert (
            await c.post(f"{MP}/exceptions/{ex_b_id}/decision", json={"decision": "APPROVE"})
        ).status_code == 200

    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        hired = await c.post(f"{HR}/employees", json=_emp_body(a_dept, a_desig, "MoveMe"))
        assert hired.status_code == 201, hired.text
        emp_id = hired.json()["id"]
        moved = await c.patch(
            f"{HR}/employees/{emp_id}",
            json={"department_id": b_dept, "designation_id": b_desig},
        )
        assert moved.status_code == 200, moved.text

    cons = (
        await db.execute(
            select(HrManpowerQuotaExceptionConsumption).where(
                HrManpowerQuotaExceptionConsumption.tenant_id == tenant.id,
                HrManpowerQuotaExceptionConsumption.employee_id == emp_id,
            )
        )
    ).scalar_one()
    assert cons.exception_id == ex_b_id

    await _revive(db, tenant, maker)
    async with api_client(db, tenant, maker) as c:
        # Cell A slot freed → another hire into A should succeed.
        again = await c.post(f"{HR}/employees", json=_emp_body(a_dept, a_desig, "Backfill"))
        assert again.status_code == 201, again.text
