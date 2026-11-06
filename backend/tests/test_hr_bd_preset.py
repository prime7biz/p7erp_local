"""Phase A Bangladesh RMG preset: add-only, idempotent, tenant-scoped, permission-gated.

Run: docker compose exec backend pytest tests/test_hr_bd_preset.py -q
"""

from __future__ import annotations

import asyncio
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.common.permissions import PERMISSION_HR_PAYROLL_MANAGE
from app.models import Tenant, User
from app.models.hr import Designation, Employee
from app.models.hr_leave import LeavePolicy, LeaveType
from app.models.hr_payroll import (
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollStructure,
    PayrollStructureLine,
)
from app.modules.hr_localization import bd_rmg_catalog as cat
from app.modules.hr_localization.enforcement_flags import ENFORCEMENT_FLAGS, enforcement_state, is_enforced
from app.modules.hr_localization.preset_router import apply as apply_route
from app.modules.hr_localization.preset_service import COMPONENTS, LEAVES, PRESET_MARKER_KEY
from tests.bd_hr_fixtures import api_client, real_db  # noqa: F401
from tests.merch_fixtures import create_merch_tenant_with_user

URL = "/api/v1/hr/localization/bd-rmg"
N_DESIGNATIONS = sum(len(r.designations) for r in cat.WAGE_RATES)


async def _count(db, model, tenant_id):
    return (await db.execute(select(func.count()).select_from(model).where(model.tenant_id == tenant_id))).scalar_one()


async def _manager(db, **flags):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    tenant.feature_flags = flags or None
    await db.commit()
    return tenant, user


@pytest.mark.asyncio
async def test_first_apply_creates_everything_and_status_is_complete(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db, vat_bin="123456789")
    async with api_client(db, tenant, user) as c:
        before = (await c.get(f"{URL}/status")).json()
        assert before["complete"] is False and before["counts"]["missing"] > 0
        assert before["can_apply"] is True
        r = await c.post(f"{URL}/apply")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"]["complete"] is True
        assert body["status"]["counts"]["missing"] == 0
        caps = {cap["area"]: cap["state"] for cap in body["status"]["capabilities"]}
        assert caps["maternity"] == "preview_only" and caps["festival_bonus"] == "unsupported"
        assert "compliant" not in r.text.lower()

    assert await _count(db, Designation, tenant.id) == N_DESIGNATIONS
    assert await _count(db, PayrollComponent, tenant.id) == len(COMPONENTS)
    assert await _count(db, PayrollStructure, tenant.id) == len(cat.WAGE_RATES)
    assert await _count(db, PayrollStructureLine, tenant.id) == len(cat.WAGE_RATES) * len(COMPONENTS)
    assert await _count(db, LeaveType, tenant.id) == len(LEAVES)
    assert await _count(db, LeavePolicy, tenant.id) == 3  # maternity has its own workflow

    await db.refresh(tenant)
    flags = tenant.feature_flags
    assert flags["vat_bin"] == "123456789"  # unrelated flags untouched
    assert flags["hr_weekend_days"] == ["friday"] and flags["payroll_ot_from_salary_enabled"] is True
    assert flags["hr_ot_hours_per_month"] == 208 and flags["hr_ot_multiplier"] == 2
    assert flags[PRESET_MARKER_KEY]["catalog_version"] == cat.CATALOG_VERSION
    assert flags[PRESET_MARKER_KEY]["applied_by"] == user.id
    assert tenant.country_code == "BD" and tenant.timezone == "Asia/Dhaka"
    assert not any(flags.get(k) for k in ENFORCEMENT_FLAGS)


@pytest.mark.asyncio
async def test_reapply_creates_nothing_and_preserves_edits_and_locale(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    tenant.country_code = "IN"
    tenant.timezone = "Asia/Kolkata"
    tenant.feature_flags = {"hr_ot_multiplier": 1.5}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{URL}/apply")).status_code == 200
        # Edit a preset row, then reapply.
        comp = (
            await db.execute(select(PayrollComponent).where(PayrollComponent.tenant_id == tenant.id, PayrollComponent.code == "BD-FOOD"))
        ).scalar_one()
        comp.name = "Food (company)"
        cl = (await db.execute(select(LeaveType).where(LeaveType.tenant_id == tenant.id, LeaveType.code == "BD-CL"))).scalar_one()
        policy = (await db.execute(select(LeavePolicy).where(LeavePolicy.leave_type_id == cl.id))).scalar_one()
        policy.annual_quota_days = Decimal("12")
        await db.commit()
        r = await c.post(f"{URL}/apply")
        assert r.status_code == 200
        assert r.json()["created"] == [
            item for item in r.json()["created"] if item["area"] == "settings"
        ] == []
        status = r.json()["status"]
        states = {(i["area"], i["code"]): i["state"] for i in status["items"]}
        assert states[("leave", "BD-CL")] == "edited"
        assert states[("locale", "country_code")] == "edited"
        assert states[("settings", "hr_ot_multiplier")] == "edited"
    await db.refresh(tenant)
    assert tenant.country_code == "IN" and tenant.timezone == "Asia/Kolkata"
    assert tenant.feature_flags["hr_ot_multiplier"] == 1.5
    await db.refresh(comp)
    await db.refresh(policy)
    assert comp.name == "Food (company)" and policy.annual_quota_days == Decimal("12")
    assert await _count(db, Designation, tenant.id) == N_DESIGNATIONS
    assert await _count(db, PayrollStructureLine, tenant.id) == len(cat.WAGE_RATES) * len(COMPONENTS)


@pytest.mark.asyncio
async def test_title_conflict_is_reported_not_overwritten(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    db.add(Designation(tenant_id=tenant.id, code="MY-OP", title="Operator (all machines)", is_active=True))
    await db.commit()
    async with api_client(db, tenant, user) as c:
        r = await c.post(f"{URL}/apply")
        assert r.status_code == 200, r.text
        conflicts = r.json()["conflicts"]
        assert any(x["label"] == "Operator (all machines)" for x in conflicts)
        assert r.json()["status"]["complete"] is False
    assert await _count(db, Designation, tenant.id) == N_DESIGNATIONS  # 1 own + N-1 created


@pytest.mark.asyncio
async def test_stale_or_malformed_marker_does_not_mean_complete(db_session_integration):
    db = db_session_integration
    tenant, user = await _manager(db)
    tenant.feature_flags = {PRESET_MARKER_KEY: "garbage"}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        body = (await c.get(f"{URL}/status")).json()
        assert body["complete"] is False and body["marker"] is None
        tenant.feature_flags = {PRESET_MARKER_KEY: {"catalog_version": cat.CATALOG_VERSION}}
        await db.commit()
        assert (await c.get(f"{URL}/status")).json()["complete"] is False


@pytest.mark.asyncio
async def test_permission_denied_without_payroll_manage(db_session_integration):
    db = db_session_integration
    tenant, clerk, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    await db.commit()
    async with api_client(db, tenant, clerk) as c:
        assert (await c.get(f"{URL}/status")).json()["can_apply"] is False
        assert (await c.post(f"{URL}/apply")).status_code == 403
    assert await _count(db, Designation, tenant.id) == 0
    tenant2, delegate, _ = await create_merch_tenant_with_user(
        db, permissions={"hr.access": True, PERMISSION_HR_PAYROLL_MANAGE: True}
    )
    await db.commit()
    async with api_client(db, tenant2, delegate) as c:
        assert (await c.post(f"{URL}/apply")).status_code == 200


@pytest.mark.asyncio
async def test_apply_never_touches_another_tenant(db_session_integration):
    db = db_session_integration
    tenant_a, user_a = await _manager(db)
    tenant_b, _user_b = await _manager(db)
    async with api_client(db, tenant_a, user_a) as c:
        assert (await c.post(f"{URL}/apply")).status_code == 200
    for model in (Designation, PayrollComponent, PayrollStructure, LeaveType):
        assert await _count(db, model, tenant_b.id) == 0
    await db.refresh(tenant_b)
    assert not (tenant_b.feature_flags or {}).get(PRESET_MARKER_KEY)


@pytest.mark.asyncio
async def test_injected_failure_leaves_zero_partial_rows(real_db):  # noqa: F811
    factory, register = real_db
    async with factory() as s:
        tenant, user, role = await create_merch_tenant_with_user(s, permissions={"hr.access": True})
        role.name = "manager"
        await s.commit()
        tenant_id, user_id = tenant.id, user.id
    register(tenant_id)
    async with factory() as s:
        t, u = await s.get(Tenant, tenant_id), await s.get(User, user_id)
        with patch("app.modules.hr_localization.preset_router.log_action", side_effect=RuntimeError("boom")):
            with pytest.raises(HTTPException) as exc:
                await apply_route(tenant=t, user=u, db=s)
        assert exc.value.status_code == 500
    async with factory() as s:
        for model in (Designation, PayrollComponent, PayrollStructure, PayrollStructureLine, LeaveType):
            assert await _count(s, model, tenant_id) == 0
        t = await s.get(Tenant, tenant_id)
        assert not (t.feature_flags or {}).get(PRESET_MARKER_KEY)


@pytest.mark.asyncio
async def test_concurrent_apply_creates_each_row_once(real_db):  # noqa: F811
    factory, register = real_db
    async with factory() as s:
        tenant, user, role = await create_merch_tenant_with_user(s, permissions={"hr.access": True})
        role.name = "manager"
        await s.commit()
        tenant_id, user_id = tenant.id, user.id
    register(tenant_id)

    async def attempt():
        async with factory() as s:
            t, u = await s.get(Tenant, tenant_id), await s.get(User, user_id)
            return await apply_route(tenant=t, user=u, db=s)

    results = await asyncio.gather(attempt(), attempt())
    created = sorted(len(r["created"]) for r in results)
    assert created[0] == 0 and created[1] > 0
    async with factory() as s:
        assert await _count(s, Designation, tenant_id) == N_DESIGNATIONS
        assert await _count(s, PayrollStructureLine, tenant_id) == len(cat.WAGE_RATES) * len(COMPONENTS)


@pytest.mark.asyncio
async def test_preset_structure_calculates_gazette_gross(db_session_integration):
    """Real payroll engine: grade-4 worker with basic 6,700 earns the Gazette gross 12,500."""
    from app.modules.hr_payroll.payroll_calculation_service import calculate_employee_payroll

    db = db_session_integration
    tenant, user = await _manager(db)
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{URL}/apply")).status_code == 200
    structure = (
        await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G4"))
    ).scalar_one()
    emp = Employee(tenant_id=tenant.id, employee_code="BDT-1", first_name="Rina", joining_date=date(2025, 1, 1), is_active=True)
    db.add(emp)
    await db.flush()
    db.add(
        PayrollEmployeeStructureAssignment(
            tenant_id=tenant.id,
            employee_id=emp.id,
            structure_id=structure.id,
            effective_from=date(2025, 1, 1),
            base_salary=Decimal("6700"),
        )
    )
    period = PayrollPeriod(
        tenant_id=tenant.id, period_code="2026-10", start_date=date(2026, 10, 1), end_date=date(2026, 10, 31),
        payment_date=date(2026, 11, 7), status="OPEN", is_locked=False,
    )
    db.add(period)
    await db.flush()
    preview = await calculate_employee_payroll(db, tenant_id=tenant.id, employee=emp, period=period)
    amounts = {c.component_code: Decimal(c.amount) for c in preview.components}
    assert amounts["BD-BASIC"] == Decimal("6700") and amounts["BD-HRENT"] == Decimal("3350")
    assert Decimal(preview.gross_pay) == Decimal("12500")


def test_enforcement_flags_are_strict_default_off():
    from app.common.tenant_feature_keys import DEFAULT_ON_FEATURE_FLAGS

    for key in ENFORCEMENT_FLAGS:
        assert key not in DEFAULT_ON_FEATURE_FLAGS
        assert is_enforced(None, key) is False
        assert is_enforced({}, key) is False
        assert is_enforced({key: False}, key) is False
        assert is_enforced({key: "true"}, key) is False  # malformed
        assert is_enforced({key: 1}, key) is False
        assert is_enforced({key: True}, key) is True
    assert not any(enforcement_state({}).values())
