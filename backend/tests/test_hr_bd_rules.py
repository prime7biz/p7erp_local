"""Phase B rule sets + previews and the enforcement switch.

Run: docker compose exec backend pytest tests/test_hr_bd_rules.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE
from app.models import AuditLog, Tenant, User
from app.models.hr import Employee
from app.models.hr_bd import HrBdRuleSet, HrBdWageScheduleRate
from app.models.hr_payroll import PayrollEmployeeStructureAssignment, PayrollStructure
from app.modules.hr_localization.enforcement_flags import HR_BD_MATERNITY_ENFORCEMENT_ENABLED
from app.modules.hr_localization.rules_router import approve_rule_set
from tests.bd_hr_fixtures import api_client, real_db  # noqa: F401
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/localization/bd-rmg"


async def _tenant(db, role_name="manager", perms=None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions=perms or {"hr.access": True})
    role.name = role_name
    await db.commit()
    return tenant, user


@pytest.mark.asyncio
async def test_seed_patch_approve_and_overlap(db_session_integration):
    db = db_session_integration
    tenant, user = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{URL}/rules/seed-official")
        assert r.status_code == 201 and r.json()["created"] is True
        rs_id = r.json()["rule_set"]["id"]
        assert (await c.post(f"{URL}/rules/seed-official")).json()["created"] is False
        detail = (await c.get(f"{URL}/rules/{rs_id}")).json()
        assert len(detail["rates"]) == 10
        assert {x["rate_code"] for x in detail["rates"] if x["employment_stage"] == "APPRENTICE"} == {"W-APP", "E-APP"}

        bad = await c.patch(f"{URL}/rules/{rs_id}", json={"rules": {"maternity_total_days": 100}})
        assert bad.status_code == 400 and "less favourable" in bad.text
        assert (await c.patch(f"{URL}/rules/{rs_id}", json={"rules": {"retirement_age": 65}})).status_code == 400
        assert (await c.patch(f"{URL}/rules/{rs_id}", json={"rules": {"nonsense": 1}})).status_code == 400
        ok = await c.patch(f"{URL}/rules/{rs_id}", json={"rules": {"casual_leave_days": 12, "gratuity_scheme_enabled": True}})
        assert ok.status_code == 200 and ok.json()["rules_json"]["casual_leave_days"] == 12

        assert (await c.post(f"{URL}/rules/{rs_id}/approve")).status_code == 200
        assert (await c.patch(f"{URL}/rules/{rs_id}", json={"rules": {"casual_leave_days": 13}})).status_code == 409

    # A second approved set with the same code and overlapping dates is refused.
    other = HrBdRuleSet(
        tenant_id=tenant.id, code="BD-RMG", catalog_version="BD-RMG-2027.1", effective_from=date(2026, 1, 1),
        status="DRAFT", source_manifest_sha256="x" * 64, source_refs={}, rules_json={},
    )
    db.add(other)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{URL}/rules/{other.id}/approve")
        assert r.status_code == 409, r.text
    actions = set((await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))).scalars())
    assert {"HR_BD_RULE_SET_SEEDED", "HR_BD_RULE_SET_UPDATED", "HR_BD_RULE_SET_APPROVED"} <= actions


@pytest.mark.asyncio
async def test_permissions_and_cross_tenant(db_session_integration):
    db = db_session_integration
    tenant_a, mgr_a = await _tenant(db)
    async with api_client(db, tenant_a, mgr_a) as c:
        rs_id = (await c.post(f"{URL}/rules/seed-official")).json()["rule_set"]["id"]
    tenant_b, mgr_b = await _tenant(db)
    async with api_client(db, tenant_b, mgr_b) as c:
        assert (await c.get(f"{URL}/rules/{rs_id}")).status_code == 404
        assert (await c.post(f"{URL}/rules/{rs_id}/approve")).status_code == 404
        assert (await c.patch(f"{URL}/rules/{rs_id}", json={"rules": {}})).status_code == 404
    tenant_c, delegate = await _tenant(db, role_name="clerk", perms={"hr.access": True, PERMISSION_HR_PAYROLL_MANAGE: True})
    async with api_client(db, tenant_c, delegate) as c:
        rs_c = (await c.post(f"{URL}/rules/seed-official")).json()["rule_set"]["id"]
        assert (await c.post(f"{URL}/rules/{rs_c}/approve")).status_code == 403  # approval is manager/admin only
        assert (await c.put(f"{URL}/enforcement", json={"flags": {HR_BD_MATERNITY_ENFORCEMENT_ENABLED: True}})).status_code == 403
    tenant_d, clerk = await _tenant(db, role_name="clerk")
    async with api_client(db, tenant_d, clerk) as c:
        assert (await c.post(f"{URL}/rules/seed-official")).status_code == 403
        assert (await c.get(f"{URL}/rules/preview/minimum-wage")).status_code == 403


@pytest.mark.asyncio
async def test_enforcement_requires_approved_rule_set_and_is_audited(db_session_integration):
    db = db_session_integration
    tenant, user = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        flags = (await c.get(f"{URL}/enforcement")).json()["flags"]
        assert not any(flags.values())
        r = await c.put(f"{URL}/enforcement", json={"flags": {HR_BD_MATERNITY_ENFORCEMENT_ENABLED: True}})
        assert r.status_code == 409
        assert (await c.put(f"{URL}/enforcement", json={"flags": {"made_up": True}})).status_code == 400
        rs_id = (await c.post(f"{URL}/rules/seed-official")).json()["rule_set"]["id"]
        await c.post(f"{URL}/rules/{rs_id}/approve")
        r = await c.put(f"{URL}/enforcement", json={"flags": {HR_BD_MATERNITY_ENFORCEMENT_ENABLED: True}})
        assert r.status_code == 200 and r.json()["flags"][HR_BD_MATERNITY_ENFORCEMENT_ENABLED] is True
    actions = set((await db.execute(select(AuditLog.action).where(AuditLog.tenant_id == tenant.id))).scalars())
    assert "HR_BD_ENFORCEMENT_CHANGED" in actions


@pytest.mark.asyncio
async def test_minimum_wage_and_benefit_previews_change_nothing(db_session_integration):
    db = db_session_integration
    tenant, user = await _tenant(db)
    async with api_client(db, tenant, user) as c:
        await c.post(f"{URL}/apply")
        rs_id = (await c.post(f"{URL}/rules/seed-official")).json()["rule_set"]["id"]
        await c.post(f"{URL}/rules/{rs_id}/approve")
    st = (
        await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G4"))
    ).scalar_one()
    low = Employee(tenant_id=tenant.id, employee_code="BD-LOW", first_name="Low", joining_date=date(2015, 1, 1), is_active=True)
    ok = Employee(tenant_id=tenant.id, employee_code="BD-OK", first_name="Ok", joining_date=date(2015, 1, 1), is_active=True)
    none = Employee(tenant_id=tenant.id, employee_code="BD-NONE", first_name="None", is_active=True)
    db.add_all([low, ok, none])
    await db.flush()
    for emp, basic in ((low, "6000"), (ok, "6700")):
        db.add(
            PayrollEmployeeStructureAssignment(
                tenant_id=tenant.id, employee_id=emp.id, structure_id=st.id, effective_from=date(2024, 1, 1),
                base_salary=Decimal(basic),
            )
        )
    await db.commit()
    async with api_client(db, tenant, user) as c:
        body = (await c.get(f"{URL}/rules/preview/minimum-wage")).json()
        by_code = {r["employee_code"]: r for r in body["employees"]}
        assert by_code["BD-LOW"]["status"] == "below_minimum" and Decimal(by_code["BD-LOW"]["shortfall_basic"]) == 700
        assert by_code["BD-OK"]["status"] == "ok" and by_code["BD-OK"]["gross"] == "12500.00"
        assert by_code["BD-NONE"]["status"] == "no_salary_assignment"
        assert body["warnings"] == []
        sb = (
            await c.get(
                f"{URL}/rules/preview/service-benefit",
                params={"employee_id": ok.id, "separation_type": "RESIGNATION", "separation_date": "2026-01-01"},
            )
        ).json()
        assert sb["trace"]["days_per_year"] == 30 and sb["trace"]["completed_years"] == 11
        mat = (
            await c.get(
                f"{URL}/rules/preview/maternity",
                params={"employee_id": ok.id, "expected_delivery_date": "2027-01-15", "surviving_children": 0},
            )
        ).json()
        assert mat["eligible"] is True and mat["trace"]["calendar_days"] == 120
        fest = (await c.get(f"{URL}/rules/preview/festival", params={"year": 2026})).json()
        assert fest["required_days"] == 13 and fest["warnings"]
    count = (await db.execute(select(func.count()).select_from(PayrollEmployeeStructureAssignment).where(
        PayrollEmployeeStructureAssignment.tenant_id == tenant.id))).scalar_one()
    assert count == 2


@pytest.mark.asyncio
async def test_concurrent_approve_of_overlapping_sets_only_one_wins(real_db):  # noqa: F811
    factory, register = real_db
    async with factory() as s:
        tenant, user, role = await create_merch_tenant_with_user(s, permissions={"hr.access": True})
        role.name = "manager"
        ids = []
        for version in ("V1", "V2"):
            rs = HrBdRuleSet(
                tenant_id=tenant.id, code="BD-RMG", catalog_version=version, effective_from=date(2024, 1, 1),
                status="DRAFT", source_manifest_sha256="x" * 64, source_refs={}, rules_json={},
            )
            s.add(rs)
            await s.flush()
            ids.append(rs.id)
        await s.commit()
        tenant_id, user_id = tenant.id, user.id
    register(tenant_id)

    async def attempt(rs_id):
        async with factory() as s:
            t, u = await s.get(Tenant, tenant_id), await s.get(User, user_id)
            try:
                await approve_rule_set(rs_id, tenant=t, user=u, db=s)
                return "ok"
            except HTTPException as exc:
                return exc.status_code

    results = sorted(map(str, await asyncio.gather(attempt(ids[0]), attempt(ids[1]))))
    assert results == ["409", "ok"]
    async with factory() as s:
        approved = (await s.execute(select(func.count()).select_from(HrBdRuleSet).where(
            HrBdRuleSet.tenant_id == tenant_id, HrBdRuleSet.status == "APPROVED"))).scalar_one()
        assert approved == 1
        assert (await s.execute(select(func.count()).select_from(HrBdWageScheduleRate).where(
            HrBdWageScheduleRate.tenant_id == tenant_id))).scalar_one() == 0


@pytest.mark.asyncio
async def test_settings_config_cannot_flip_managed_bd_flags(db_session_integration):
    """Settings -> Configuration saves the whole flag object; the guarded Bangladesh keys keep their value."""
    db = db_session_integration
    tenant, admin = await _tenant(db, role_name="admin")
    tenant.feature_flags = {"hr_employee_number_format": {"prefix": "EMP-", "width": 7}, "trade_enabled": True}
    await db.commit()
    body = {
        "company_name": "BD Flags Co",
        "tenant_type": "manufacturer",
        "feature_flags": {
            HR_BD_MATERNITY_ENFORCEMENT_ENABLED: True,
            "hr_bd_rmg_preset": {"catalog_version": "forged"},
            "hr_employee_number_format": {"prefix": "X-", "width": 3},
            "trade_enabled": False,
        },
    }
    async with api_client(db, tenant, admin) as c:
        r = await c.put("/api/v1/settings/config", json=body)
        assert r.status_code == 200, r.text
    await db.refresh(tenant)
    flags = tenant.feature_flags
    assert HR_BD_MATERNITY_ENFORCEMENT_ENABLED not in flags
    assert "hr_bd_rmg_preset" not in flags
    assert flags["hr_employee_number_format"] == {"prefix": "EMP-", "width": 7}
    assert flags["trade_enabled"] is False  # ordinary flags still save
