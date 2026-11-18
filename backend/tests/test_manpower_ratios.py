"""Phase 5: manpower ratio KPIs."""

from __future__ import annotations

import uuid

import pytest

from app.models.hr import Department, Designation, Employee
from app.models.hr_manpower import HrManpowerDepartmentGroup, HrManpowerSettings
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

MP = "/api/v1/hr/manpower"


@pytest.mark.asyncio
async def test_ratios_unclassified_and_dept_groups(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(
        db,
        permissions={"hr.access": True, "hr.manpower.read": True},
    )
    tenant.feature_flags = {
        **(tenant.feature_flags or {}),
        "manpower_control_v1": True,
        "manpower_smv_panel_v1": True,
        "manpower_floor_suggested_v1": True,
    }
    dept = Department(tenant_id=tenant.id, code=f"D{uuid.uuid4().hex[:6]}", name="Sew", is_active=True)
    desig = Designation(tenant_id=tenant.id, code=f"G{uuid.uuid4().hex[:6]}", title="Op", is_active=True)
    db.add_all([dept, desig])
    await db.flush()
    db.add(
        HrManpowerDepartmentGroup(
            tenant_id=tenant.id, department_id=dept.id, group_key="SEWING"
        )
    )
    db.add(
        HrManpowerSettings(
            tenant_id=tenant.id,
            targets={"staff_to_workers": "1:10"},
            allow_unmapped_hire=False,
        )
    )
    db.add(
        Employee(
            tenant_id=tenant.id,
            employee_code=f"W{uuid.uuid4().hex[:6]}",
            first_name="Worker",
            department_id=dept.id,
            designation_id=desig.id,
            employee_category="WORKER",
            is_active=True,
        )
    )
    db.add(
        Employee(
            tenant_id=tenant.id,
            employee_code=f"U{uuid.uuid4().hex[:6]}",
            first_name="Unknown",
            department_id=dept.id,
            designation_id=desig.id,
            employee_category=None,
            is_active=True,
        )
    )
    await db.commit()

    async with api_client(db, tenant, user) as c:
        r = await c.get(f"{MP}/ratios")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["by_category"]["WORKER"] == 1
        assert body["by_category"]["Unclassified"] == 1
        assert body["data_quality"]["warning"]
        assert body["by_department_group"]["SEWING"] == 2
        names = {x["name"] for x in body["ratios"]}
        assert "staff_to_workers" in names
        assert "sewing_cutting_finishing" in names
