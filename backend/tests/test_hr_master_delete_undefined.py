"""Delete a department / section and move its records to "Undefined" (empty link).

Run: docker compose exec backend pytest tests/test_hr_master_delete_undefined.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AuditLog, Department, Designation, Employee, HrSection
from tests.merch_fixtures import create_merch_tenant_with_user


@asynccontextmanager
async def _client(db, tenant, user):
    async def o_db():
        yield db

    async def o_user():
        return user

    async def o_tenant():
        return tenant

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = o_user
    app.dependency_overrides[require_tenant] = o_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def _manager(db):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"*": True})
    role.name = "manager"
    await db.flush()
    return tenant, user


async def _department(db, tenant) -> Department:
    slug = uuid.uuid4().hex[:6]
    row = Department(tenant_id=tenant.id, code=f"D{slug}", name=f"Dept {slug}", is_active=True)
    db.add(row)
    await db.flush()
    return row


async def _section(db, tenant, **kw) -> HrSection:
    slug = uuid.uuid4().hex[:6]
    row = HrSection(tenant_id=tenant.id, code=f"S{slug}", name=f"Line {slug}", section_type="LINE", is_active=True, **kw)
    db.add(row)
    await db.flush()
    return row


async def _employee(db, tenant, **kw) -> Employee:
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Worker", **kw)
    db.add(emp)
    await db.flush()
    return emp


@pytest.mark.asyncio
async def test_department_delete_moves_links_to_undefined_and_audits(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    dept = await _department(db, tenant)
    desig = Designation(tenant_id=tenant.id, department_id=dept.id, code=f"G{uuid.uuid4().hex[:6]}", title="Operator", is_active=True)
    db.add(desig)
    sec = await _section(db, tenant, department_id=dept.id)
    e1 = await _employee(db, tenant, department_id=dept.id)
    e2 = await _employee(db, tenant, department_id=dept.id)
    await db.commit()
    dept_id, e_ids, desig_id, sec_id, tenant_id = dept.id, (e1.id, e2.id), desig.id, sec.id, tenant.id

    async with _client(db, tenant, user) as c:
        impact = await c.get(f"/api/v1/hr/departments/{dept_id}/delete-impact")
        assert impact.status_code == 200, impact.text
        assert impact.json() == {"employees": 2, "designations": 1, "sections": 1, "requisitions": 0}

        # Old behaviour without the parameter: refused while in use.
        blocked = await c.delete(f"/api/v1/hr/departments/{dept_id}")
        assert blocked.status_code == 400

        r = await c.delete(f"/api/v1/hr/departments/{dept_id}", params={"move_to_undefined": "true"})
    assert r.status_code == 200, r.text
    assert r.json()["moved_to_undefined"]["employees"] == 2

    db.expire_all()
    assert await db.get(Department, dept_id) is None
    rows = (await db.execute(select(Employee.department_id).where(Employee.id.in_(e_ids)))).scalars().all()
    assert rows == [None, None]
    assert (await db.get(Designation, desig_id)).department_id is None
    assert (await db.get(HrSection, sec_id)).department_id is None
    audit = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant_id, AuditLog.action == "HR_DEPARTMENT_DELETED")
        )
    ).scalars().all()
    assert len(audit) == 1


@pytest.mark.asyncio
async def test_section_delete_clears_employees_and_child_sections(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    parent = await _section(db, tenant)
    child = await _section(db, tenant, parent_section_id=parent.id)
    emp = await _employee(db, tenant, section_id=parent.id)
    await db.commit()
    parent_id, child_id, emp_id = parent.id, child.id, emp.id

    async with _client(db, tenant, user) as c:
        impact = await c.get(f"/api/v1/hr/sections/{parent_id}/delete-impact")
        assert impact.json() == {"employees": 1, "child_sections": 1}
        r = await c.delete(f"/api/v1/hr/sections/{parent_id}")
    assert r.status_code == 200, r.text

    db.expire_all()
    assert await db.get(HrSection, parent_id) is None
    assert (await db.get(Employee, emp_id)).section_id is None
    assert (await db.get(HrSection, child_id)).parent_section_id is None


@pytest.mark.asyncio
async def test_other_tenant_records_look_not_found_and_are_untouched(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    other, _other_user = await _manager(db)
    foreign_dept = await _department(db, other)
    foreign_sec = await _section(db, other)
    foreign_emp = await _employee(db, other, department_id=foreign_dept.id, section_id=foreign_sec.id)
    await db.commit()
    dept_id, sec_id, emp_id = foreign_dept.id, foreign_sec.id, foreign_emp.id

    async with _client(db, tenant, user) as c:
        assert (await c.get(f"/api/v1/hr/departments/{dept_id}/delete-impact")).status_code == 404
        assert (
            await c.delete(f"/api/v1/hr/departments/{dept_id}", params={"move_to_undefined": "true"})
        ).status_code == 404
        assert (await c.get(f"/api/v1/hr/sections/{sec_id}/delete-impact")).status_code == 404
        assert (await c.delete(f"/api/v1/hr/sections/{sec_id}")).status_code == 404

    db.expire_all()
    row = await db.get(Employee, emp_id)
    assert row.department_id == dept_id
    assert row.section_id == sec_id


@pytest.mark.asyncio
async def test_non_manager_cannot_delete(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_merch_tenant_with_user(db, permissions={"*": True})
    dept = await _department(db, tenant)
    sec = await _section(db, tenant)
    await db.commit()
    dept_id, sec_id = dept.id, sec.id

    async with _client(db, tenant, user) as c:
        assert (await c.get(f"/api/v1/hr/departments/{dept_id}/delete-impact")).status_code == 403
        assert (
            await c.delete(f"/api/v1/hr/departments/{dept_id}", params={"move_to_undefined": "true"})
        ).status_code == 403
        assert (await c.delete(f"/api/v1/hr/sections/{sec_id}")).status_code == 403

    db.expire_all()
    assert await db.get(Department, dept_id) is not None
    assert await db.get(HrSection, sec_id) is not None
