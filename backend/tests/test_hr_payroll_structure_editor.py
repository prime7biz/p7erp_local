"""Salary structure editor APIs: PATCH structure / line, DELETE line (tenant, permission, audit, in-use guard).

Run: docker compose exec backend pytest tests/test_hr_payroll_structure_editor.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import select

from app.models import AuditLog
from app.models.hr import Employee
from app.models.hr_payroll import (
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollStructure,
    PayrollStructureLine,
)
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/payroll/structures"


async def _seed(db, *, manager: bool = True):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    if manager:
        role.name = "manager"
    comp = PayrollComponent(tenant_id=tenant.id, code="FOOD", name="Food", component_type="EARNING", calculation_type="FIXED")
    st = PayrollStructure(tenant_id=tenant.id, code="ST1", name="Structure 1")
    db.add_all([comp, st])
    await db.flush()
    line = PayrollStructureLine(tenant_id=tenant.id, structure_id=st.id, component_id=comp.id, amount=Decimal("1250"), is_gratuity_component=True)
    db.add(line)
    await db.commit()
    return tenant, user, st, line


@pytest.mark.asyncio
async def test_patch_structure_and_line_with_audit(db_session_integration):
    db = db_session_integration
    tenant, user, st, line = await _seed(db)
    async with api_client(db, tenant, user) as c:
        r = await c.patch(f"{URL}/{st.id}", json={"name": "Grade 4", "description": "Gazette", "code": "HACK"})
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "Grade 4" and r.json()["code"] == "ST1"
        r = await c.patch(f"{URL}/{st.id}/lines/{line.id}", json={"amount": "1300.50"})
        assert r.status_code == 200, r.text
        assert Decimal(r.json()["amount"]) == Decimal("1300.50")
        assert r.json()["is_gratuity_component"] is True
        listed = (await c.get(f"{URL}/{st.id}/lines")).json()
        assert listed[0]["is_gratuity_component"] is True
        assert (await c.patch(f"{URL}/{st.id}/lines/{line.id}", json={"amount": "-1"})).status_code == 422
    actions = (
        await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))
    ).scalars().all()
    assert "HR_PAYROLL_STRUCTURE_UPDATED" in actions and "HR_PAYROLL_STRUCTURE_LINE_UPDATED" in actions


@pytest.mark.asyncio
async def test_delete_line_requires_confirm_and_no_active_assignment(db_session_integration):
    db = db_session_integration
    tenant, user, st, line = await _seed(db)
    emp = Employee(tenant_id=tenant.id, employee_code="E1", first_name="A")
    db.add(emp)
    await db.flush()
    asg = PayrollEmployeeStructureAssignment(
        tenant_id=tenant.id, employee_id=emp.id, structure_id=st.id, effective_from=date(2025, 1, 1)
    )
    db.add(asg)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.delete(f"{URL}/{st.id}/lines/{line.id}")).status_code == 400
        r = await c.delete(f"{URL}/{st.id}/lines/{line.id}?confirm=true")
        assert r.status_code == 409, r.text
        asg.effective_to = date(2025, 6, 30)
        await db.commit()
        r = await c.delete(f"{URL}/{st.id}/lines/{line.id}?confirm=true")
        assert r.status_code == 204, r.text
    assert (await db.execute(select(PayrollStructureLine).where(PayrollStructureLine.id == line.id))).scalar_one_or_none() is None


@pytest.mark.asyncio
async def test_cross_tenant_and_permission_denied(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, st_a, line_a = await _seed(db)
    tenant_b, user_b, _st_b, _line_b = await _seed(db)
    async with api_client(db, tenant_b, user_b) as c:
        assert (await c.patch(f"{URL}/{st_a.id}", json={"name": "x"})).status_code == 404
        assert (await c.patch(f"{URL}/{st_a.id}/lines/{line_a.id}", json={"amount": "1"})).status_code == 404
        assert (await c.delete(f"{URL}/{st_a.id}/lines/{line_a.id}?confirm=true")).status_code == 404
    tenant_c, clerk, st_c, line_c = await _seed(db, manager=False)
    async with api_client(db, tenant_c, clerk) as c:
        assert (await c.patch(f"{URL}/{st_c.id}", json={"name": "x"})).status_code == 403
        assert (await c.patch(f"{URL}/{st_c.id}/lines/{line_c.id}", json={"amount": "1"})).status_code == 403
        assert (await c.delete(f"{URL}/{st_c.id}/lines/{line_c.id}?confirm=true")).status_code == 403
    await db.refresh(line_a)
    assert line_a.amount == Decimal("1250")
