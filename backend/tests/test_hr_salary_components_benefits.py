"""Employee salary components, change type, same-date correction, overtime / bill switches (migration 290).

Covers: FIXED component overrides (payroll, pay snapshot, appointment-letter pricing), the basic line
and non-monthly lines cannot be overridden, the legal gross floor counts overrides, INCREMENT vs
CORRECTION on the current start date, overtime switched off (entry create / approve, payroll, final
settlement), bill switches + own amounts + Friday (weekly holiday) bills, onboarding retry, RBAC,
tenancy and audit privacy.

Run: docker compose exec backend pytest tests/test_hr_salary_components_benefits.py -q
"""

from __future__ import annotations

from datetime import date, time
from decimal import Decimal
from types import SimpleNamespace

import pytest
from sqlalchemy import func, select

from app.models import AuditLog
from app.models.hr import Employee
from app.models.hr_allowance import HrAllowanceEntry, HrEmployeePayBenefit
from app.models.hr_attendance import AttendanceEntry, OvertimeEntry
from app.models.hr_payroll import PayrollEmployeeStructureAssignment, PayrollStructure
from app.modules.hr.generated_documents import _salary
from app.modules.hr_separation.settlement_service import compute_settlement
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user

BD = "/api/v1/hr/localization/bd-rmg"
HR = "/api/v1/hr"
PAY = "/api/v1/hr/payroll"
FLAGS = {
    "payroll_auto_calculate_enabled": True,
    "payroll_ot_from_salary_enabled": True,
    "hr_meal_night_bills_enabled": True,
}


async def _setup(db, *, code: str = "EMP-0000071", flags: dict | None = None):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.post(f"{BD}/apply")).status_code == 200
        rule_set = (await c.post(f"{BD}/rules/seed-official")).json()["rule_set"]["id"]
        assert (await c.post(f"{BD}/rules/{rule_set}/approve")).status_code == 200
    await db.refresh(tenant)
    tenant.feature_flags = {**(tenant.feature_flags or {}), **(FLAGS if flags is None else flags)}
    structure = (
        await db.execute(select(PayrollStructure).where(PayrollStructure.tenant_id == tenant.id, PayrollStructure.code == "BD-W-G4"))
    ).scalar_one()
    emp = Employee(tenant_id=tenant.id, employee_code=code, first_name="Worker", joining_date=date(2024, 1, 1), is_active=True)
    db.add(emp)
    await db.commit()
    return tenant, user, role, emp, structure


def _salary_body(structure_id: int, **extra) -> dict:
    return {"structure_id": structure_id, "base_salary": "7050", "effective_from": "2024-01-01", **extra}


async def _grade_id(c, rate_code: str = "W-G4") -> int:
    options = (await c.get(f"{HR}/compensation/options")).json()
    return next(g["id"] for g in options["wage_grades"] if g["rate_code"] == rate_code)


async def _payroll_preview(c, period_code: str = "2026-10") -> dict:
    period = (
        await c.post(f"{PAY}/periods", json={"period_code": period_code, "start_date": "2026-10-01", "end_date": "2026-10-31", "payment_date": "2026-11-07"})
    ).json()
    run = (await c.post(f"{PAY}/runs", json={"period_id": period["id"], "run_date": "2026-10-31"})).json()
    preview = await c.post(f"{PAY}/runs/{run['id']}/auto-calculate/preview")
    assert preview.status_code == 200, preview.text
    return {"run": run, "employee": preview.json()["employees"][0]}


@pytest.mark.asyncio
async def test_component_override_is_fixed_and_paid_everywhere(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, structure = await _setup(db)
    async with api_client(db, tenant, user) as c:
        options = (await c.get(f"{HR}/compensation/options")).json()
        lines = next(s for s in options["structures"] if s["id"] == structure.id)["lines"]
        by_code = {line["code"]: line for line in lines}
        assert by_code["BD-BASIC"]["is_basic"] and not by_code["BD-BASIC"]["editable"]
        assert by_code["BD-HRENT"]["editable"] and by_code["BD-MEDICAL"]["editable"]
        assert options["annual_increment_pct"] == "5"
        assert all("annual_increment_pct" in g for g in options["wage_grades"])

        # Preview shows the priced components with the typed amount.
        prev = (await c.post(f"{HR}/compensation/preview", json={**_salary_body(structure.id), "component_overrides": {"BD-MEDICAL": "1000"}})).json()
        medical = next(x for x in prev["components"] if x["code"] == "BD-MEDICAL")
        assert medical["overridden"] and Decimal(medical["amount"]) == 1000 and Decimal(medical["standard_amount"]) == 750
        assert Decimal(prev["gross"]) == Decimal("7050") + Decimal("3525") + 1000 + 450 + 1250

        r = await c.put(
            f"{HR}/employees/{emp.id}/compensation",
            json=_salary_body(structure.id, component_overrides={"BD-MEDICAL": "1000"}, change_type="INCREMENT", change_note="Private note 9911"),
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["structure_assignments"][0]["component_overrides"] == {"BD-MEDICAL": "1000.00"}
        assert body["structure_assignments"][0]["change_type"] == "INCREMENT"
        assert body["snapshot"]["component_overrides"] == {"BD-MEDICAL": "1000.00"}
        assert Decimal(body["snapshot"]["gross"]) == Decimal("13275")
        current = {x["code"]: x for x in body["snapshot"]["components"]}
        assert set(current) == {"BD-BASIC", "BD-HRENT", "BD-MEDICAL", "BD-TRANSPORT", "BD-FOOD"}
        assert Decimal(current["BD-BASIC"]["amount"]) == 7050 and current["BD-BASIC"]["is_basic"]
        assert current["BD-MEDICAL"]["overridden"] and Decimal(current["BD-MEDICAL"]["amount"]) == 1000
        assert sum(Decimal(x["amount"]) for x in current.values()) == Decimal("13275")

        payroll = await _payroll_preview(c)
        comps = {x["component_code"]: Decimal(x["amount"]) for x in payroll["employee"]["components"]}
        assert comps["BD-MEDICAL"] == 1000 and comps["BD-HRENT"] == Decimal("3525")
        assert Decimal(payroll["employee"]["gross_pay"]) == Decimal("13275")

    row = (await db.execute(select(PayrollEmployeeStructureAssignment).where(PayrollEmployeeStructureAssignment.employee_id == emp.id))).scalar_one()
    assert row.component_overrides == {"BD-MEDICAL": {"amount": "1000.00", "formula_type": "FIXED"}}
    letter = await _salary(db, tenant, emp)
    assert letter["gross"] == "13275.00"
    assert {"name": "Medical allowance", "amount": "1000.00"} in letter["components"]

    audit = (await db.execute(select(AuditLog.details).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "HR_EMPLOYEE_COMPENSATION_REPLACED"))).scalars().all()
    assert audit and all("1000" not in d and "9911" not in d and "7050" not in d for d in audit)
    assert any("BD-MEDICAL" in d and "INCREMENT" in d for d in audit)


@pytest.mark.asyncio
async def test_basic_line_unknown_code_and_gross_floor_are_refused(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, structure = await _setup(db)
    async with api_client(db, tenant, user) as c:
        url = f"{HR}/employees/{emp.id}/compensation"
        for bad in ({"BD-BASIC": "9000"}, {"NOPE": "10"}, {"BD-MEDICAL": "-1"}, {"BD-MEDICAL": "abc"}):
            r = await c.put(url, json=_salary_body(structure.id, component_overrides=bad))
            assert r.status_code == 400, (bad, r.text)
        grade = await _grade_id(c)
        # The grade's legal gross is 12500: dropping food and transport to 0 falls below it.
        low = {"BD-FOOD": "0", "BD-TRANSPORT": "0"}
        r = await c.put(url, json={**_salary_body(structure.id, component_overrides=low), "bd_wage_rate_id": grade})
        assert r.status_code == 400 and "minimum gross" in r.json()["detail"]
        prev = (await c.post(f"{HR}/compensation/preview", json={**_salary_body(structure.id, component_overrides=low), "bd_wage_rate_id": grade})).json()
        assert prev["meets_minimum"] is False and Decimal(prev["gross"]) == Decimal("11325")
        # Legacy assignment endpoint cannot override the basic line either.
        legacy = await c.post(f"{PAY}/assignments", json={"employee_id": emp.id, "structure_id": structure.id, "effective_from": "2024-01-01",
                                                         "base_salary": "7050", "component_overrides": {"BD-BASIC": "1"}})
        assert legacy.status_code == 400
    assert (await db.execute(select(func.count()).select_from(PayrollEmployeeStructureAssignment).where(
        PayrollEmployeeStructureAssignment.employee_id == emp.id))).scalar_one() == 0


@pytest.mark.asyncio
async def test_same_date_correction_fixes_in_place_until_payroll_runs(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, structure = await _setup(db)
    async with api_client(db, tenant, user) as c:
        url = f"{HR}/employees/{emp.id}/compensation"
        assert (await c.put(url, json=_salary_body(structure.id))).status_code == 200
        same_day_increment = await c.put(url, json=_salary_body(structure.id, base_salary="8000", change_type="INCREMENT"))
        assert same_day_increment.status_code == 409 and "Correction" in same_day_increment.json()["detail"]
        fixed = await c.put(url, json=_salary_body(structure.id, base_salary="8000", change_type="CORRECTION",
                                                      component_overrides={"BD-HRENT": "4500"}))
        assert fixed.status_code == 200, fixed.text
        rows = fixed.json()["structure_assignments"]
        assert len(rows) == 1 and Decimal(rows[0]["base_salary"]) == 8000 and rows[0]["change_type"] == "CORRECTION"
        assert rows[0]["component_overrides"] == {"BD-HRENT": "4500.00"}
        # Once payroll covers that date, the correction must be dated later.
        payroll = await _payroll_preview(c)
        assert (await c.post(f"{PAY}/runs/{payroll['run']['id']}/auto-calculate/apply", json={})).status_code == 200
        blocked = await c.put(url, json=_salary_body(structure.id, base_salary="8100", change_type="CORRECTION"))
        assert blocked.status_code == 409 and "Payroll has already been calculated" in blocked.json()["detail"]


@pytest.mark.asyncio
async def test_pay_benefits_api_rbac_tenancy_and_idempotency(db_session_integration):
    db = db_session_integration
    tenant, user, role, emp, _structure = await _setup(db)
    url = f"{HR}/employees/{emp.id}/pay-benefits"
    async with api_client(db, tenant, user) as c:
        view = (await c.get(url)).json()
        assert [b["benefit_code"] for b in view["benefits"]] == ["OVERTIME", "FRIDAY", "TIFFIN", "LUNCH", "DINNER", "NIGHT"]
        assert all(b["enabled"] and b["is_default"] and b["amount_override"] is None for b in view["benefits"])
        assert (await c.put(url, json={"benefits": [{"benefit_code": "OVERTIME", "enabled": True, "amount_override": "10"}]})).status_code == 400
        assert (await c.put(url, json={"benefits": [{"benefit_code": "LUNCH", "enabled": True, "amount_override": "-5"}]})).status_code == 400
        dup = [{"benefit_code": "LUNCH", "enabled": True}, {"benefit_code": "LUNCH", "enabled": False}]
        assert (await c.put(url, json={"benefits": dup})).status_code == 400
        body = {"benefits": [{"benefit_code": "OVERTIME", "enabled": False}, {"benefit_code": "LUNCH", "enabled": True, "amount_override": "80"}]}
        first = await c.put(url, json=body)
        second = await c.put(url, json=body)
        assert first.status_code == second.status_code == 200 and first.json() == second.json()
        saved = {b["benefit_code"]: b for b in second.json()["benefits"]}
        assert saved["OVERTIME"]["enabled"] is False and saved["LUNCH"]["amount_override"] == "80.00" and saved["TIFFIN"]["is_default"]
    assert (await db.execute(select(func.count()).select_from(HrEmployeePayBenefit).where(HrEmployeePayBenefit.employee_id == emp.id))).scalar_one() == 2
    audit = (await db.execute(select(AuditLog.details).where(AuditLog.tenant_id == tenant.id, AuditLog.action == "HR_EMPLOYEE_PAY_BENEFITS_UPDATED"))).scalars().all()
    assert audit and all("80" not in d for d in audit)

    role.name = "clerk"
    role.permissions = {"hr.access": True}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.get(url)).status_code == 403
        assert (await c.put(url, json=body)).status_code == 403
        assert (await c.post(f"{HR}/compensation/preview", json=_salary_body(_structure.id))).status_code == 403

    other, other_user, _r, _e, _s = await _setup(db, code="EMP-0000072")
    async with api_client(db, other, other_user) as c:
        assert (await c.get(url)).status_code == 404
        assert (await c.put(url, json=body)).status_code == 404
        assert (await c.put(f"{HR}/employees/{emp.id}/compensation", json=_salary_body(_s.id))).status_code == 404


@pytest.mark.asyncio
async def test_overtime_switch_blocks_entries_payroll_and_settlement(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, structure = await _setup(db)
    off = {"benefits": [{"benefit_code": "OVERTIME", "enabled": False}]}
    on = {"benefits": [{"benefit_code": "OVERTIME", "enabled": True}]}
    async with api_client(db, tenant, user) as c:
        assert (await c.put(f"{HR}/employees/{emp.id}/compensation", json=_salary_body(structure.id))).status_code == 200
        entry = await c.post(f"{HR}/attendance/overtime", json={"employee_id": emp.id, "work_date": "2026-10-06", "ot_hours": "3"})
        assert entry.status_code == 201, entry.text
        assert (await c.put(f"{HR}/employees/{emp.id}/pay-benefits", json=off)).status_code == 200
        approve = await c.post(f"{HR}/attendance/overtime/{entry.json()['id']}/approve")
        assert approve.status_code == 400 and "not activated" in approve.json()["detail"]
        assert (await c.post(f"{HR}/attendance/overtime", json={"employee_id": emp.id, "work_date": "2026-10-07", "ot_hours": "2"})).status_code == 400
        assert (await c.put(f"{HR}/employees/{emp.id}/pay-benefits", json=on)).status_code == 200
        assert (await c.post(f"{HR}/attendance/overtime/{entry.json()['id']}/approve")).status_code == 200

        paid = await _payroll_preview(c, "2026-10")
        assert Decimal(paid["employee"]["overtime_amount"]) > 0

        assert (await c.put(f"{HR}/employees/{emp.id}/pay-benefits", json=off)).status_code == 200
        unpaid = (await c.post(f"{PAY}/runs/{paid['run']['id']}/auto-calculate/preview")).json()["employees"][0]
        assert Decimal(unpaid["overtime_amount"]) == 0
        assert Decimal(unpaid["gross_pay"]) < Decimal(paid["employee"]["gross_pay"])
        assert any("Overtime is switched off" in w for w in unpaid["warnings"])

    sep = SimpleNamespace(
        id=None, last_working_date=date(2026, 10, 20), effective_date=date(2026, 10, 20), separation_type="RESIGNATION",
        permanent=True, death_at_work=False, misconduct_no_compensation=False, monthly_rated=True, notice_days_served=60,
    )
    blocked = await compute_settlement(db, tenant, sep, emp)
    assert blocked.values["overtime_amount"] == 0 and any("Overtime is switched off" in w for w in blocked.warnings)
    benefit = (await db.execute(select(HrEmployeePayBenefit).where(HrEmployeePayBenefit.employee_id == emp.id, HrEmployeePayBenefit.benefit_code == "OVERTIME"))).scalar_one()
    benefit.enabled = True
    await db.commit()
    allowed = await compute_settlement(db, tenant, sep, emp)
    assert allowed.values["overtime_amount"] > 0


@pytest.mark.asyncio
async def test_bill_switches_own_amount_and_friday_allowance(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp, _structure = await _setup(db)
    other = Employee(tenant_id=tenant.id, employee_code="EMP-0000073", first_name="Second", joining_date=date(2024, 1, 1), is_active=True)
    db.add(other)
    await db.commit()
    # 2026-10-02 and 2026-10-09 are Fridays; 2026-10-05 is a Monday. One manual row has no clock times.
    db.add_all([
        AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 10, 2), in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"),
        AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 10, 5), in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"),
        AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2026, 10, 9), status="PRESENT", source="MANUAL"),
        AttendanceEntry(tenant_id=tenant.id, employee_id=other.id, attendance_date=date(2026, 10, 2), in_time=time(8), out_time=time(17), status="PRESENT", source="MANUAL"),
    ])
    await db.commit()
    async with api_client(db, tenant, user) as c:
        rules = [
            {"code": "LUNCH", "name": "Lunch", "bill_type": "LUNCH", "eligibility_basis": "PRESENT", "amount": "60"},
            {"code": "LUNCH2", "name": "Lunch 2", "bill_type": "LUNCH", "eligibility_basis": "PRESENT", "amount": "10"},
            {"code": "FRI", "name": "Friday", "bill_type": "FRIDAY", "eligibility_basis": "WEEKLY_HOLIDAY", "amount": "200"},
        ]
        for rule in rules:
            created = await c.post(f"{HR}/allowances/rules", json={**rule, "effective_from": "2026-01-01"})
            assert created.status_code == 201, created.text
            assert (await c.post(f"{HR}/allowances/rules/{created.json()['id']}/approve")).status_code == 200
        options = (await c.get(f"{HR}/compensation/options")).json()
        assert {r["bill_type"] for r in options["bill_rules"]} == {"LUNCH", "FRIDAY"}

        # emp: own lunch amount 80 (paid once per day even with two lunch rules); other: Friday allowance off.
        put = await c.put(f"{HR}/employees/{emp.id}/pay-benefits", json={"benefits": [{"benefit_code": "LUNCH", "enabled": True, "amount_override": "80"}]})
        assert put.status_code == 200
        assert (await c.put(f"{HR}/employees/{other.id}/pay-benefits", json={"benefits": [{"benefit_code": "FRIDAY", "enabled": False}]})).status_code == 200

        body = {"from_date": "2026-10-01", "to_date": "2026-10-31"}
        prev = (await c.post(f"{HR}/allowances/preview", json=body)).json()
        # emp: 3 days x own lunch 80 (not 60 + 10) + 2 Fridays x 200; other: lunch 60 + 10 on 2 Oct, Friday off.
        assert {k: Decimal(v) for k, v in prev["totals"].items()} == {"LUNCH": Decimal("310"), "FRIDAY": Decimal("400")}
        assert (await c.post(f"{HR}/allowances/generate", json=body)).json()["created"] == prev["eligible"] == 7
        assert (await c.post(f"{HR}/allowances/generate", json=body)).json()["created"] == 0
        entries = (await c.get(f"{HR}/allowances/entries")).json()
        assert (await c.post(f"{HR}/allowances/entries/approve", json={"ids": [e["id"] for e in entries]})).status_code == 200
        assert (await c.put(f"{HR}/employees/{emp.id}/compensation", json=_salary_body(_structure.id))).status_code == 200
        payroll = await _payroll_preview(c)
        run_id = payroll["run"]["id"]
        employees = (await c.post(f"{PAY}/runs/{run_id}/auto-calculate/preview")).json()["employees"]
    rows = (await db.execute(select(HrAllowanceEntry).where(HrAllowanceEntry.employee_id == other.id))).scalars().all()
    assert sorted(Decimal(r.amount) for r in rows) == [Decimal("10"), Decimal("60")]
    emp_rows = (await db.execute(select(HrAllowanceEntry).where(HrAllowanceEntry.employee_id == emp.id))).scalars().all()
    assert sorted(Decimal(r.amount) for r in emp_rows) == [Decimal("80")] * 3 + [Decimal("200")] * 2
    mine = next(e for e in employees if e["employee_id"] == emp.id)
    comps = {x["component_code"]: Decimal(x["amount"]) for x in mine["components"]}
    assert comps["BD-LUNCH"] == Decimal("240") and comps["BD-FRIDAY"] == Decimal("400")


@pytest.mark.asyncio
async def test_onboarding_saves_overrides_and_switches_once(db_session_integration):
    db = db_session_integration
    tenant, user, role, _emp, structure = await _setup(db)
    request = {
        "request_id": "onb-salary-components-1",
        "employee": {"first_name": "Joiner", "joining_date": "2026-11-01", "phone": "01711111111", "national_id": str(1000000000 + tenant.id)},
        "compensation": {"structure_id": structure.id, "base_salary": "7050", "component_overrides": {"BD-FOOD": "1500"}},
        "pay_benefits": [{"benefit_code": "OVERTIME", "enabled": False}, {"benefit_code": "TIFFIN", "enabled": True, "amount_override": "35"}],
    }
    async with api_client(db, tenant, user) as c:
        first = await c.post(f"{HR}/onboarding", json=request)
        assert first.status_code in (200, 201), first.text
        again = await c.post(f"{HR}/onboarding", json=request)
        assert again.status_code in (200, 201) and again.json()["employee"]["id"] == first.json()["employee"]["id"]
    assert first.json()["status"] == "COMPLETED", first.json()
    new_id = first.json()["employee"]["id"]
    asgn = (await db.execute(select(PayrollEmployeeStructureAssignment).where(PayrollEmployeeStructureAssignment.employee_id == new_id))).scalars().all()
    assert len(asgn) == 1 and asgn[0].change_type == "JOINING" and asgn[0].effective_from == date(2026, 11, 1)
    assert asgn[0].component_overrides == {"BD-FOOD": {"amount": "1500.00", "formula_type": "FIXED"}}
    switches = {b.benefit_code: b for b in (await db.execute(select(HrEmployeePayBenefit).where(HrEmployeePayBenefit.employee_id == new_id))).scalars()}
    assert switches["OVERTIME"].enabled is False and Decimal(switches["TIFFIN"].amount_override) == 35
    assert (await db.execute(select(func.count()).select_from(OvertimeEntry).where(OvertimeEntry.employee_id == new_id))).scalar_one() == 0

    # Switches alone still need the payroll permission.
    role.name = "clerk"
    role.permissions = {"hr.access": True, "hr.employees.manage": True}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        denied = await c.post(f"{HR}/onboarding", json={
            "request_id": "onb-salary-components-2",
            "employee": {"first_name": "Other", "phone": "01722222222", "national_id": str(2000000000 + tenant.id)},
            "pay_benefits": [{"benefit_code": "OVERTIME", "enabled": False}],
        })
        assert denied.status_code == 403
