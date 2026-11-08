"""The legacy POST /hr/employees contract and the recruitment hire flow keep working unchanged.

Run: docker compose exec backend pytest tests/test_hr_recruitment_onboarding_compat.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import func, select

from app.models import Candidate
from app.models.hr import Employee
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

HR = "/api/v1/hr"

LEGACY_RESPONSE_KEYS = {
    "id", "tenant_id", "employee_code", "first_name", "last_name", "email", "phone", "joining_date",
    "date_of_birth", "gender", "marital_status", "blood_group", "emergency_contact_name",
    "emergency_contact_phone", "address_line", "city", "country", "national_id", "employment_type",
    "confirmation_date", "exit_date", "department_id", "designation_id", "section_id", "employee_category",
    "reporting_manager_id", "user_id", "is_active", "created_at", "updated_at", "attendance_device_pin",
    "birth_registration_no", "has_photo",
}


@pytest.mark.asyncio
async def test_recruitment_and_legacy_employee_create_contract_unchanged(db_session_integration):
    db = db_session_integration
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    await db.commit()
    cand = Candidate(tenant_id=tenant.id, full_name="Shirin Akter", phone="01712345678", stage="offer", status="active")
    db.add(cand)
    await db.commit()
    cand_id, tenant_id = cand.id, tenant.id

    async with api_client(db, tenant, user) as c:
        legacy = await c.post(f"{HR}/employees", json={
            "first_name": "Legacy", "address_line": "Old road", "city": "Khulna", "country": "Bangladesh",
        })
        assert legacy.status_code == 201, legacy.text
        body = legacy.json()
        assert LEGACY_RESPONSE_KEYS <= set(body)
        assert body["employee_code"] and body["is_active"] is True
        assert (body["address_line"], body["city"], body["country"]) == ("Old road", "Khulna", "Bangladesh")
        assert body["present_address_line"] is None and body["pay_snapshot"] is None

        hired = await c.post(f"{HR}/recruitment/candidates/{cand_id}/hire", json={"joining_date": "2026-11-10"})
        assert hired.status_code == 201, hired.text
        out = hired.json()
        assert set(out) == {"employee_id", "employee_code", "candidate_id"}
        again = await c.post(f"{HR}/recruitment/candidates/{cand_id}/hire", json={"joining_date": "2026-11-10"})
        assert again.status_code == 409

    count = (await db.execute(select(func.count()).select_from(Employee).where(Employee.tenant_id == tenant_id))).scalar_one()
    assert count == 2
    emp = await db.get(Employee, out["employee_id"])
    assert emp.first_name == "Shirin" and emp.last_name == "Akter" and emp.joining_date.isoformat() == "2026-11-10"
