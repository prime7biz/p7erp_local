"""Tiffin / dinner / night bills, production bonus and festival bonus: flags, attendance eligibility,
correction, approval, payroll inclusion once, permissions and tenancy.

Run: docker compose exec backend pytest tests/test_hr_allowances_bonuses.py -q
"""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from unittest.mock import patch

import pytest
from sqlalchemy import select

from app.common.permissions import PERMISSION_HR_ALLOWANCE_MANAGE
from app.models.hr import Employee
from app.models.hr_allowance import HrAllowanceEntry, HrBonusAllocationLine, HrProductionBonusEntry
from app.models.hr_attendance import AttendanceEntry
from app.models.hr_payroll import PayrollStructure
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

BD = "/api/v1/hr/localization/bd-rmg"
HR = "/api/v1/hr"
PAY = "/api/v1/hr/payroll"
ALL_ON = {
    "hr_meal_night_bills_enabled": True,
    "hr_production_bonus_enabled": True,
    "hr_festival_bonus_enabled": True,
    "payroll_auto_calculate_enabled": True,
}


async def _setup(db, flags=None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{BD}/apply")).status_code == 200
    await db.refresh(tenant)
    tenant.feature_flags = {**(tenant.feature_flags or {}), **(flags or {})}
    st = (await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G4"))).scalar_one()
    emp = Employee(tenant_id=tenant.id, employee_code="EMP-0000040", first_name="Worker", joining_date=date(2024, 1, 1), is_active=True)
    db.add(emp)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": st.id, "effective_from": "2024-01-01", "base_salary": "6700"})).status_code == 201
    return tenant, user, role, emp


async def _payroll_components(c, period_code="2026-10"):
    period = (await c.post(f"{PAY}/periods", json={"period_code": period_code, "start_date": "2026-10-01", "end_date": "2026-10-31", "payment_date": "2026-11-07"})).json()
    run = (await c.post(f"{PAY}/runs", json={"period_id": period["id"], "run_date": "2026-10-31"})).json()
    prev = (await c.post(f"{PAY}/runs/{run['id']}/auto-calculate/preview")).json()
    applied = await c.post(f"{PAY}/runs/{run['id']}/auto-calculate/apply", json={})
    assert applied.status_code == 200, applied.text
    emp = prev["employees"][0]
    return {x["component_code"]: Decimal(x["amount"]) for x in emp["components"]}, Decimal(emp["gross_pay"]), run


@pytest.mark.asyncio
async def test_meal_night_bills_flow_into_payroll_once(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _setup(db, ALL_ON)
    db.add_all([
        AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 10, 5), in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"),
        AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 10, 6), in_time=time(8), out_time=time(19, 30), status="PRESENT", source="MANUAL", overtime_minutes=150),
        AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 10, 7), in_time=time(8), status="OPEN", source="MANUAL"),
    ])
    await db.commit()
    async with api_client(db, tenant, user) as c:
        t = (await c.post(f"{HR}/allowances/rules", json={"code": "TIFFIN", "name": "Tiffin", "bill_type": "TIFFIN", "eligibility_basis": "PRESENT", "amount": "30", "effective_from": "2026-01-01"})).json()
        d = (await c.post(f"{HR}/allowances/rules", json={"code": "DINNER", "name": "Dinner", "bill_type": "DINNER", "eligibility_basis": "MIN_OT_MINUTES", "threshold_minutes": 120, "amount": "80", "effective_from": "2026-01-01"})).json()
        assert (await c.post(f"{HR}/allowances/generate", json={"from_date": "2026-10-01", "to_date": "2026-10-31"})).json()["created"] == 0  # rules not approved
        for rid in (t["id"], d["id"]):
            assert (await c.post(f"{HR}/allowances/rules/{rid}/approve")).status_code == 200
        prev = (await c.post(f"{HR}/allowances/preview", json={"from_date": "2026-10-01", "to_date": "2026-10-31"})).json()
        assert prev["eligible"] == 3 and prev["totals"] == {"TIFFIN": "60.0000", "DINNER": "80.0000"}
        assert (await c.post(f"{HR}/allowances/generate", json={"from_date": "2026-10-01", "to_date": "2026-10-31"})).json()["created"] == 3
        assert (await c.post(f"{HR}/allowances/generate", json={"from_date": "2026-10-01", "to_date": "2026-10-31"})).json()["created"] == 0
        entries = (await c.get(f"{HR}/allowances/entries")).json()
        dinner = next(e for e in entries if e["rule_id"] == d["id"])
        r = await c.post(f"{HR}/allowances/entries/{dinner['id']}/correct", json={"amount": "100", "reason": "Two meals served"})
        assert r.status_code == 200 and Decimal(r.json()["amount"]) == 100
        assert (await c.post(f"{HR}/allowances/entries/approve", json={"ids": [e["id"] for e in entries]})).json()["approved"] == 3
        comps, gross, _run = await _payroll_components(c)
        assert comps["BD-TIFFIN"] == Decimal("60") and comps["BD-DINNER"] == Decimal("100")
        assert gross == Decimal("12500") + Decimal("160")
    rows = (await db.execute(select(HrAllowanceEntry).where(HrAllowanceEntry.employee_id == emp.id))).scalars().all()
    assert all(r.payroll_run_line_id is not None and r.final_settlement_id is None for r in rows)


@pytest.mark.asyncio
async def test_flags_off_and_permissions(db_session_integration):
    db = db_session_integration
    tenant, user, role, _emp = await _setup(db, {"payroll_auto_calculate_enabled": True})
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{HR}/allowances/generate", json={"from_date": "2026-10-01", "to_date": "2026-10-31"})).status_code == 409
        assert (await c.post(f"{HR}/production-bonus/generate", json={"scheme_id": 1, "period_code": "X", "period_start": "2026-10-01", "period_end": "2026-10-31"})).status_code == 409
        assert (await c.post(f"{HR}/allowances/generate", json={"from_date": "2026-01-01", "to_date": "2026-12-31"})).status_code in (400, 409)
    role.name = "clerk"
    role.permissions = {"hr.access": True, PERMISSION_HR_ALLOWANCE_MANAGE: True}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        r = (await c.post(f"{HR}/allowances/rules", json={"code": "NIGHT", "name": "Night", "bill_type": "NIGHT", "eligibility_basis": "NIGHT_SHIFT", "amount": "100", "effective_from": "2026-01-01"})).json()
        assert (await c.post(f"{HR}/allowances/rules/{r['id']}/approve")).status_code == 403
        assert (await c.get(f"{HR}/production-bonus/schemes")).status_code == 403
    other, other_user, _r, _e = await _setup(db)
    async with api_client(db, other, other_user) as c:
        assert (await c.post(f"{HR}/allowances/rules/{r['id']}/approve")).status_code == 404


@pytest.mark.asyncio
async def test_production_bonus_piece_with_cap_and_payroll(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _setup(db, ALL_ON)
    async with api_client(db, tenant, user) as c:
        bad = await c.post(f"{HR}/production-bonus/schemes", json={"code": "PC", "name": "Piece", "basis": "PIECE", "effective_from": "2026-01-01"})
        assert bad.status_code == 400
        s = (await c.post(f"{HR}/production-bonus/schemes", json={"code": "PC", "name": "Piece", "basis": "PIECE", "rate_per_piece": "2", "cap_amount": "800", "effective_from": "2026-01-01"})).json()
        body = {"scheme_id": s["id"], "period_code": "2026-10", "period_start": "2026-10-01", "period_end": "2026-10-31"}
        assert (await c.post(f"{HR}/production-bonus/generate", json=body)).status_code == 409  # scheme not approved
        await c.post(f"{HR}/production-bonus/schemes/{s['id']}/approve")
        with patch("app.modules.hr_allowances.router.piece_output_in_period", return_value=(Decimal("500"), Decimal("400"))):
            assert (await c.post(f"{HR}/production-bonus/generate", json=body)).json()["created"] == 1
            assert (await c.post(f"{HR}/production-bonus/generate", json=body)).json()["created"] == 0
        entry = (await c.get(f"{HR}/production-bonus/entries")).json()[0]
        assert Decimal(entry["amount"]) == Decimal("800") and entry["trace_json"]["rule"] == "500 pieces x 2"
        await c.post(f"{HR}/production-bonus/entries/approve", json={"ids": [entry["id"]]})
        comps, _gross, _run = await _payroll_components(c)
        assert comps["BD-PROD-BONUS"] == Decimal("800")
    row = (await db.execute(select(HrProductionBonusEntry).where(HrProductionBonusEntry.id == entry["id"]))).scalar_one()
    assert row.payroll_run_line_id is not None


@pytest.mark.asyncio
async def test_festival_bonus_one_year_rule_and_payroll(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _setup(db, ALL_ON)
    st = (await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G4"))).scalar_one()
    newbie = Employee(tenant_id=tenant.id, employee_code="EMP-0000041", first_name="New", joining_date=date(2026, 6, 1), is_active=True)
    db.add(newbie)
    await db.commit()
    async with api_client(db, tenant, user) as c:
        await c.post(f"{PAY}/assignments", json={"employee_id": newbie.id, "structure_id": st.id, "effective_from": "2026-06-01", "base_salary": "6700"})
        dec = (await c.post(f"{PAY}/bonuses", json={"bonus_type": "FESTIVAL", "period_code": "EID-2026", "title": "Eid-ul-Adha 2026"})).json()
        assert (await c.post(f"{HR}/festival-bonus/{dec['id']}/allocate", json={"cutoff_date": "2026-10-15", "percent_of_basic": "150"})).status_code == 422
        r = await c.post(f"{HR}/festival-bonus/{dec['id']}/allocate", json={"cutoff_date": "2026-10-15"})
        assert r.status_code == 200 and r.json()["eligible"] == 1
        lines = {l["employee_id"]: l for l in (await c.get(f"{HR}/festival-bonus/{dec['id']}/lines")).json()}
        assert Decimal(lines[emp.id]["amount"]) == Decimal("6700") and lines[newbie.id]["status"] == "EXCLUDED"
        ok = await c.post(f"{HR}/festival-bonus/{dec['id']}/approve")
        assert ok.status_code == 200 and ok.json()["total"] == "6700.00"
        assert (await c.post(f"{HR}/festival-bonus/{dec['id']}/allocate", json={"cutoff_date": "2026-10-15"})).status_code == 409
        comps, _gross, _run = await _payroll_components(c)
        assert comps["BD-FESTIVAL-BONUS"] == Decimal("6700")
    line = (await db.execute(select(HrBonusAllocationLine).where(HrBonusAllocationLine.employee_id == emp.id))).scalar_one()
    assert line.payroll_run_line_id is not None
