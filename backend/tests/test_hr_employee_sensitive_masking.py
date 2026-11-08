"""Employee onboarding fields: who may see and change identity / family / address and bank data.

Run: docker compose exec backend pytest tests/test_hr_employee_sensitive_masking.py -q
"""

from __future__ import annotations

import pytest
from sqlalchemy import select

from app.models import AuditLog
from app.models.hr import Employee
from app.modules.hr.employee_service import IDENTITY_PROFILE_FIELDS, PAYMENT_FIELDS
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

HR = "/api/v1/hr"

FULL = {
    "first_name": "Rahima",
    "phone": "01712345678",
    "national_id": "1234567890",
    "father_name": "Abdul Karim",
    "mother_name": "Rokeya Begum",
    "religion": "Islam",
    "nationality": "Bangladeshi",
    "present_address_line": "House 4, Road 2",
    "present_city": "Gazipur",
    "present_district": "Gazipur",
    "present_country": "Bangladesh",
    "permanent_address_line": "Village Char",
    "permanent_district": "Bhola",
    "emergency_contact_relation": "Mother",
    "mobile_is_bkash": True,
    "salary_payment_method": "bank",
    "bank_account_name": "Rahima",
    "bank_account_number": "0012345678901",
    "bank_name": "Dutch-Bangla Bank",
    "probation_months": 6,
    "facilities": ["Lunch", "Transport", "Lunch"],
}


async def _tenant(db, *, role_name="manager", perms=None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions=perms or {"hr.access": True})
    role.name = role_name
    await db.commit()
    return tenant, user, role


async def _as(db, role, *, name, perms):
    role.name, role.permissions = name, perms
    await db.commit()


async def _reload(db, emp_id: int) -> Employee:
    return (
        await db.execute(select(Employee).where(Employee.id == emp_id).execution_options(populate_existing=True))
    ).scalar_one()


@pytest.mark.asyncio
async def test_employee_sensitive_fields_masked_on_list_detail_and_update(db_session_integration):
    db = db_session_integration
    tenant, user, role = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{HR}/employees", json=FULL)
        assert r.status_code == 201, r.text
        created = r.json()
    emp_id = created["id"]
    assert created["masked_fields"] == []
    assert created["facilities"] == ["Lunch", "Transport"]  # trimmed, de-duplicated
    assert (created["address_line"], created["city"], created["country"]) == ("House 4, Road 2", "Gazipur", "Bangladesh")
    audit = (
        await db.execute(select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "HR_EMPLOYEE_CREATED"))
    ).scalars().all()
    assert [a.resource for a in audit] == [f"hr.employee:{emp_id}"]

    # HR clerk with module access: sees identity / family / address, not bank or payment details.
    await _as(db, role, name="clerk", perms={"hr.access": True})
    async with api_client(db, tenant, user) as c:
        detail = (await c.get(f"{HR}/employees/{emp_id}")).json()
        listed = next(e for e in (await c.get(f"{HR}/employees")).json() if e["id"] == emp_id)
        for view in (detail, listed):
            assert view["father_name"] == "Abdul Karim" and view["present_district"] == "Gazipur"
            for field in PAYMENT_FIELDS:
                assert view[field] is None and field in view["masked_fields"]
        # Resubmitting the masked (null) bank fields from the form does not wipe the real values.
        resubmit = await c.patch(f"{HR}/employees/{emp_id}", json={**{f: None for f in PAYMENT_FIELDS}, "first_name": "Rahima A."})
        assert resubmit.status_code == 200, resubmit.text
        assert resubmit.json()["bank_account_number"] is None
        # Unchanged identity values pass; changing them needs hr.identity.manage.
        same = await c.patch(f"{HR}/employees/{emp_id}", json={"father_name": "Abdul Karim"})
        assert same.status_code == 200
        changed = await c.patch(f"{HR}/employees/{emp_id}", json={"father_name": "Someone Else"})
        assert changed.status_code == 403 and "hr.identity.manage" in changed.text
        new_bank = await c.post(f"{HR}/employees", json={"first_name": "X", "bank_account_number": "99"})
        assert new_bank.status_code == 403 and "hr.payroll.manage" in new_bank.text
        new_family = await c.post(f"{HR}/employees", json={"first_name": "X", "father_name": "Y"})
        assert new_family.status_code == 403
    emp = await _reload(db, emp_id)
    assert emp.first_name == "Rahima A." and emp.bank_account_number == "0012345678901"
    assert emp.father_name == "Abdul Karim" and emp.salary_payment_method == "bank"

    # No HR grant at all: every sensitive field is masked and ignored on resubmit.
    await _as(db, role, name="viewer", perms={})
    async with api_client(db, tenant, user) as c:
        detail = (await c.get(f"{HR}/employees/{emp_id}")).json()
        for field in (*IDENTITY_PROFILE_FIELDS, *PAYMENT_FIELDS, "national_id", "date_of_birth", "address_line", "city", "country"):
            assert detail[field] is None, field
        r = await c.patch(f"{HR}/employees/{emp_id}", json={"father_name": "Hacker", "present_city": "X", "bank_name": "Y"})
        assert r.status_code == 200
    emp = await _reload(db, emp_id)
    assert (emp.father_name, emp.present_city, emp.bank_name) == ("Abdul Karim", "Gazipur", "Dutch-Bangla Bank")

    # Identity manager may change family / address; the present address is mirrored to the legacy columns.
    await _as(db, role, name="clerk", perms={"hr.access": True, "hr.identity.manage": True})
    async with api_client(db, tenant, user) as c:
        r = await c.patch(f"{HR}/employees/{emp_id}", json={"father_name": "Abdul K.", "present_city": "Dhaka"})
        assert r.status_code == 200, r.text
        assert r.json()["city"] == "Dhaka"
        assert (await c.patch(f"{HR}/employees/{emp_id}", json={"bank_name": "Other"})).status_code == 200  # masked: ignored
    emp = await _reload(db, emp_id)
    assert (emp.father_name, emp.present_city, emp.city, emp.bank_name) == ("Abdul K.", "Dhaka", "Dhaka", "Dutch-Bangla Bank")
    sensitive_audit = (
        await db.execute(
            select(AuditLog).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "HR_EMPLOYEE_SENSITIVE_UPDATED")
        )
    ).scalars().all()
    assert sensitive_audit and all(a.resource == f"hr.employee:{emp_id}" for a in sensitive_audit)

    # Payroll manager may change bank details.
    await _as(db, role, name="clerk", perms={"hr.access": True, "hr.payroll.manage": True})
    async with api_client(db, tenant, user) as c:
        r = await c.patch(f"{HR}/employees/{emp_id}", json={"bank_name": "Other Bank", "salary_payment_method": "bkash"})
        assert r.status_code == 200, r.text
        assert r.json()["bank_name"] == "Other Bank" and r.json()["masked_fields"] == []
        assert (await c.patch(f"{HR}/employees/{emp_id}", json={"salary_payment_method": "cheque"})).status_code == 422
        access = (await c.get(f"{HR}/employee-access")).json()
        assert access["can_manage_payroll"] is True and access["can_manage_identity"] is False


@pytest.mark.asyncio
async def test_clerk_can_save_contact_on_a_legacy_employee_and_audit_lists_only_real_changes(db_session_integration):
    db = db_session_integration
    tenant, user, role = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        emp_id = (await c.post(f"{HR}/employees", json={
            "first_name": "Legacy", "phone": "01711111111", "address_line": "Old road", "city": "Khulna", "country": "Bangladesh",
        })).json()["id"]
    await _as(db, role, name="clerk", perms={"hr.access": True})
    async with api_client(db, tenant, user) as c:
        # The workspace sends only changed fields: a phone change on an employee with a legacy address saves.
        r = await c.patch(f"{HR}/employees/{emp_id}", json={"phone": "01722222222"})
        assert r.status_code == 200, r.text
        # Re-sending the stored present address unchanged (null) is not a change either.
        assert (await c.patch(f"{HR}/employees/{emp_id}", json={"present_city": None, "father_name": ""})).status_code == 200
    emp = await _reload(db, emp_id)
    assert (emp.phone, emp.city, emp.address_line) == ("01722222222", "Khulna", "Old road")
    await _as(db, role, name="clerk", perms={"hr.access": True, "hr.identity.manage": True})
    async with api_client(db, tenant, user) as c:
        # The workspace sends the whole present group when one part changes; it replaces the legacy address.
        r = await c.patch(f"{HR}/employees/{emp_id}", json={
            "present_address_line": "Old road", "present_city": "Jessore", "present_district": None,
            "present_postal_code": None, "present_country": "Bangladesh",
        })
        assert r.status_code == 200, r.text
    emp = await _reload(db, emp_id)
    assert (emp.address_line, emp.city, emp.country, emp.present_city) == ("Old road", "Jessore", "Bangladesh", "Jessore")
    async with api_client(db, tenant, user) as c:
        # Deliberately clearing the present address also clears its legacy copy (no stale address on letters).
        r = await c.patch(f"{HR}/employees/{emp_id}", json={k: None for k in (
            "present_address_line", "present_city", "present_district", "present_postal_code", "present_country",
        )})
        assert r.status_code == 200, r.text
    emp = await _reload(db, emp_id)
    assert (emp.address_line, emp.city, emp.country, emp.present_city) == (None, None, None, None)
    audits = (
        await db.execute(
            select(AuditLog)
            .where(
                AuditLog.tenant_id == tenant.id,
                AuditLog.action == "HR_EMPLOYEE_SENSITIVE_UPDATED",
            )
            .order_by(AuditLog.id)
        )
    ).scalars().all()
    # The phone change and the no-op resubmit logged nothing; each address change lists only what changed.
    assert len(audits) == 2
    assert set(audits[0].details.split(",")) == {"city", "present_address_line", "present_city", "present_country"}
    assert set(audits[1].details.split(",")) == {
        "address_line", "city", "country", "present_address_line", "present_city", "present_country",
    }


@pytest.mark.asyncio
async def test_employee_validation_bounds(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{HR}/employees", json={"first_name": "A", "probation_months": 30})).status_code == 422
        assert (await c.post(f"{HR}/employees", json={"first_name": "A", "facilities": ["x" * 65]})).status_code == 422
        assert (await c.post(f"{HR}/employees", json={"first_name": "A", "facilities": [f"f{i}" for i in range(21)]})).status_code == 422
        assert (await c.post(f"{HR}/employees", json={"first_name": "A", "father_name": "x" * 129})).status_code == 422


@pytest.mark.asyncio
async def test_employee_fields_are_tenant_scoped(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await _tenant(db)
    other, other_user, _ = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        emp_id = (await c.post(f"{HR}/employees", json=FULL)).json()["id"]
    async with api_client(db, other, other_user) as c:
        assert (await c.get(f"{HR}/employees/{emp_id}")).status_code == 404
        assert (await c.patch(f"{HR}/employees/{emp_id}", json={"father_name": "X"})).status_code == 404
        assert all(e["id"] != emp_id for e in (await c.get(f"{HR}/employees")).json())
