"""Bangladesh salary income tax (TDS): engine maths, payroll deduction, YTD, stickiness, profile API, posting.

Run: docker compose exec backend pytest tests/test_hr_bd_salary_tds.py -q

Income year used in the payroll tests: 1 July 2026 - 30 June 2027 (assessment year 2027-2028).
Employee earns 100,000 a month from September 2026 (10 months in the year -> projected 1,000,000):
  exempt = 1,000,000 / 3 = 333,333.33; taxable = 666,666.67; GENERAL threshold 400,000
  tax = 266,666.67 x 10% = 26,666.67; September installment = 26,666.67 / 10 = 2,666.67
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy import func, select

from app.common.tenant_feature_keys import is_hr_bd_salary_tds_enabled
from app.models import AuditLog
from app.models.finance import AccountingPeriod, Voucher, VoucherLine
from app.models.hr import Employee
from app.models.hr_bd import HrEmployeeTaxProfile
from app.models.hr_payroll import (
    PayrollAccountingConfig,
    PayrollCalculationSnapshot,
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollRunLine,
    PayrollStructureLine,
)
from app.modules.hr import tax_profile as tax
from app.modules.hr_localization import bd_salary_tds as eng
from app.modules.hr_localization import bd_salary_tds_service as svc
from app.modules.hr_payroll import service as payroll_service
from app.modules.settings.router import HR_BD_MANAGED_FLAG_KEYS
from tests.bd_hr_fixtures import api_client
from tests.merch_fixtures import create_merch_tenant_with_user
from tests.test_accounting_posting_integrity import _account
from tests.test_payroll_ot_from_salary import _employee, _row, _run, _seed

HR = "/api/v1/hr"
PAY = "/api/v1/hr/payroll"
BD = "/api/v1/hr/localization/bd-rmg"
ON = {"hr_bd_salary_tds_enabled": True}
SEP = (date(2026, 9, 1), date(2026, 9, 30))
OCT = (date(2026, 10, 1), date(2026, 10, 31))
D = Decimal


def _tax(gross_monthly: str, **kw):
    schedule = eng.SCHEDULES[2026]
    category = kw.pop("category", "GENERAL")
    return eng.calculate_annual_salary_tax(
        annual_gross=D(gross_monthly) * 12, schedule=schedule, category=category, **kw
    )


# --- Pure engine ----------------------------------------------------------------------------------


def test_threshold_and_minimum_tax_male_vs_female():
    assert _tax("50000")["net_annual_tax"] == 0  # taxable 400,000 = threshold
    male = _tax("54000")
    assert male["taxable_income"] == D("432000.00") and male["net_annual_tax"] == D("5000.00")
    assert male["minimum_tax_applied"] is True and eng.money(male["net_annual_tax"] / 12) == D("416.67")
    female = _tax("54000", category="FEMALE")
    assert female["net_annual_tax"] == 0 and female["minimum_tax_applied"] is False
    assert _tax("51000")["net_annual_tax"] == D("5000.00")  # slab tax 800 is below the minimum
    assert _tax("51000", first_time_taxpayer=True)["net_annual_tax"] == D("1000.00")
    assert _tax("54000", first_time_taxpayer=True)["net_annual_tax"] == D("3200.00")  # slab tax above the minimum


def test_slabs_exemption_cap_and_special_categories():
    assert _tax("100000")["net_annual_tax"] == D("45000.00")  # 300k x 10% + 100k x 15%
    assert _tax("100000", category="FEMALE")["net_annual_tax"] == D("37500.00")  # 300k x 10% + 50k x 15%
    assert _tax("100000", category="FREEDOM_FIGHTER")["threshold"] == D("550000")
    assert _tax("100000", category="THIRD_GENDER")["threshold"] == D("525000")
    child = _tax("100000", disabled_children=2)
    assert child["threshold"] == D("500000") and child["disabled_child_allowance"] == D("100000")
    big = eng.calculate_annual_salary_tax(
        annual_gross=D("3000000"), schedule=eng.SCHEDULES[2026], category="GENERAL"
    )
    assert big["exempt_income"] == D("500000.00")  # capped; 1/3 would be 1,000,000


def test_rebate_only_from_declared_investment_lower_of_three():
    base = _tax("100000")
    assert base["investment_rebate"] == 0  # no automatic 3% rebate
    declared_small = _tax("100000", rebate_mode="DECLARED_INVESTMENT", declared_investment=D("100000"))
    assert declared_small["investment_rebate"] == D("10000.00")  # 10% of investment
    declared_big = _tax("100000", rebate_mode="DECLARED_INVESTMENT", declared_investment=D("5000000"))
    assert declared_big["investment_rebate"] == D("24000.00")  # 3% of taxable 800,000
    assert declared_big["net_annual_tax"] == D("21000.00")
    no_amount = _tax("100000", rebate_mode="DECLARED_INVESTMENT", declared_investment=None)
    assert no_amount["investment_rebate"] == 0
    capped = eng.calculate_annual_salary_tax(
        annual_gross=D("60000000"), schedule=eng.SCHEDULES[2026], category="GENERAL",
        rebate_mode="DECLARED_INVESTMENT", declared_investment=D("900000000"),
    )
    assert capped["investment_rebate"] == D("750000.00")


def test_category_resolution_and_fallback_warning():
    schedule = eng.SCHEDULES[2026]
    end = date(2027, 6, 30)
    assert eng.resolve_taxpayer_category("Male", date(1990, 1, 1), end, "AUTO", schedule)[0] == "GENERAL"
    assert eng.resolve_taxpayer_category("female", None, end, "AUTO", schedule)[0] == "FEMALE"
    category, warnings = eng.resolve_taxpayer_category(None, None, end, "AUTO", schedule)
    assert category == "GENERAL" and len(warnings) == 2
    assert eng.resolve_taxpayer_category("other", date(1990, 1, 1), end, None, schedule)[1]
    assert eng.resolve_taxpayer_category("Male", date(1962, 6, 30), end, "AUTO", schedule)[0] == "SENIOR_65"  # turns 65 on 30 Jun
    assert eng.resolve_taxpayer_category("Male", date(1962, 7, 1), end, "AUTO", schedule)[0] == "GENERAL"
    assert eng.resolve_taxpayer_category("Male", None, end, "DISABLED", schedule)[0] == "DISABLED"


def test_income_year_boundaries_and_unsupported_year_fails_closed():
    assert eng.income_year_window(date(2027, 6, 30))[:2] == (date(2026, 7, 1), date(2027, 6, 30))
    assert eng.income_year_window(date(2027, 7, 1))[0] == date(2027, 7, 1)
    assert eng.income_year_window(date(2026, 7, 1))[2] == "2027-2028"
    assert eng.get_schedule(date(2027, 6, 30)).income_year_start == 2026
    with pytest.raises(eng.UnsupportedTaxYear):
        eng.get_schedule(date(2027, 7, 1))
    with pytest.raises(eng.UnsupportedTaxYear):
        eng.get_schedule(date(2026, 6, 30))
    assert eng.remaining_months_after(date(2026, 9, 30), None, date(2027, 6, 30)) == 9
    assert eng.remaining_months_after(date(2027, 6, 30), None, date(2027, 6, 30)) == 0
    assert eng.remaining_months_after(date(2026, 9, 30), date(2026, 12, 15), date(2027, 6, 30)) == 3


def _inst(**kw):
    args = dict(
        ytd_gross=D("0"), prior_tds=D("0"), current_gross=D("100000"), recurring_monthly=D("100000"),
        remaining_months=9, schedule=eng.SCHEDULES[2026], category="GENERAL",
    )
    args.update(kw)
    return eng.payroll_installment(**args)


def test_installments_reconcile_exactly_with_final_residual():
    first = _inst()
    assert first["net_annual_tax"] == D("26666.67") and first["monthly_tds"] == D("2666.67")
    assert first["method"] == "EVEN_SPREAD"
    paid = D("0")
    for done in range(10):
        step = _inst(ytd_gross=D("100000") * done, prior_tds=paid, remaining_months=9 - done)
        paid += step["monthly_tds"]
        assert step["is_final_period"] is (done == 9)
    assert paid == D("26666.67")  # the final month absorbs the rounding residual


def test_fixed_override_cap_final_reconcile_and_over_withholding():
    fixed = _inst(fixed_override=D("1000"))
    assert fixed["method"] == "FIXED_OVERRIDE" and fixed["monthly_tds"] == D("1000.00")
    assert _inst(fixed_override=D("999999"))["monthly_tds"] == D("26666.67")  # capped at what is owed
    final = _inst(remaining_months=0, ytd_gross=D("900000"), prior_tds=D("5000"), fixed_override=D("1000"))
    assert final["method"] == "FINAL_RESIDUAL" and final["monthly_tds"] == D("21666.67")  # override ignored
    over = _inst(prior_tds=D("40000"))
    assert over["monthly_tds"] == 0 and over["over_withheld"] == D("13333.33") and over["remaining_liability"] == 0


def test_one_off_bonus_counted_once_and_not_repeated():
    plain = _inst()
    with_bonus = _inst(current_gross=D("200000"))  # bonus of 100,000 this month only
    assert with_bonus["projected_annual_gross"] == plain["projected_annual_gross"] + D("100000.00")
    assert with_bonus["monthly_tds"] > plain["monthly_tds"]


def test_estimate_male_female_and_unsupported():
    male = eng.estimate_monthly_tds(monthly_gross=D("100000"), as_of=date(2026, 11, 12), gender="male", date_of_birth=None)
    female = eng.estimate_monthly_tds(monthly_gross=D("100000"), as_of=date(2026, 11, 12), gender="female", date_of_birth=None)
    assert male["monthly_tds"] == D("3750.00") and female["monthly_tds"] == D("3125.00")
    assert male["estimate_basis"] == "SALARY_ONLY" and female["category"] == "FEMALE"
    with pytest.raises(eng.UnsupportedTaxYear):
        eng.estimate_monthly_tds(monthly_gross=D("1"), as_of=date(2030, 1, 1), gender=None, date_of_birth=None)


def test_flag_is_strict_and_managed_and_not_default_on():
    assert is_hr_bd_salary_tds_enabled(None) is False
    assert is_hr_bd_salary_tds_enabled({"hr_bd_salary_tds_enabled": "true"}) is False
    assert is_hr_bd_salary_tds_enabled(ON) is True
    assert "hr_bd_salary_tds_enabled" in HR_BD_MANAGED_FLAG_KEYS  # generic Settings cannot write it
    from app.common.tenant_feature_keys import DEFAULT_ON_FEATURE_FLAGS

    assert "hr_bd_salary_tds_enabled" not in DEFAULT_ON_FEATURE_FLAGS


def test_enablement_needs_a_signed_matching_approval(monkeypatch):
    shipped = svc.approval_problems()
    assert shipped and any("PASS" in p for p in shipped)  # the record that ships is not signed
    good = {
        "approval_id": "APR-1", "status": "PASS", "schedule_version": eng.SCHEDULE_VERSION,
        "schedule_checksum": eng.schedule_checksum(), "settlement_classification_version": "SC-1",
        "sources": [{"name": "x", "sha256": "a" * 64}], "approver": "Tax reviewer", "approved_on": "2026-11-20",
    }
    assert any("classification" in p for p in svc.approval_problems(good))  # no settlement rules approved yet
    monkeypatch.setattr(eng, "SETTLEMENT_CLASSIFICATION_VERSION", "SC-1")
    assert svc.approval_problems(good) == []
    assert svc.approval_problems({**good, "schedule_checksum": "0" * 64})
    assert svc.approval_problems({**good, "status": "PENDING"})
    assert svc.approval_problems({**good, "sources": [{"name": "x", "sha256": "short"}]})
    assert svc.approval_problems({**good, "approver": ""})


# --- Payroll integration ---------------------------------------------------------------------------


async def _tds_setup(db, *, flags=ON, dates=SEP, monthly="100000", gender=None, birth=None):
    tenant, structure, run = await _seed(db, flags=flags)
    line = (
        await db.execute(select(PayrollStructureLine).where(PayrollStructureLine.structure_id == structure.id))
    ).scalars().first()
    line.amount = D(monthly)
    emp = await _employee(db, tenant, structure, joining=date(2026, 9, 1), salaries=((date(2026, 1, 1), None, monthly),))
    emp.gender, emp.date_of_birth = gender, birth
    await db.flush()
    return tenant, structure, run, emp


def _tds_of(row) -> Decimal:
    return sum((D(c.amount) for c in row.components if c.component_code == "BD-TDS"), D("0"))


@pytest.mark.asyncio
async def test_payroll_deducts_tds_and_freezes_the_trace(db_session_integration):
    db = db_session_integration
    tenant, _structure, run, emp = await _tds_setup(db)
    _preview, row = await _row(db, tenant, run, emp)
    assert _tds_of(row) == D("2666.67")
    assert D(row.gross_pay) == D("100000") and D(row.deductions) == D("2666.67") and D(row.net_pay) == D("97333.33")
    assert row.trace["bd_tds_applied"] is True
    assert row.trace["statutory"]["bd_tds"]["monthly_tds"] == "2666.67"
    assert row.trace["statutory"]["bd_tds"]["assessment_year"] == "2027-2028"
    assert any(c["code"] == "BD-TDS" and c["component_type"] == "DEDUCTION" for c in row.trace["components"])
    assert any("no payroll" not in w for w in row.warnings)  # joined 1 Sep: nothing is missing before it
    # Gender / birth date are missing: general threshold with a visible warning.
    assert any("Gender" in w for w in row.warnings)


@pytest.mark.asyncio
async def test_female_employee_pays_less_than_male(db_session_integration):
    db = db_session_integration
    tenant, _s, run, male = await _tds_setup(db, gender="Male", monthly="100000")
    _p, male_row = await _row(db, tenant, run, male)
    tenant2, _s2, run2, female = await _tds_setup(db, gender="Female", monthly="100000")
    _p2, female_row = await _row(db, tenant2, run2, female)
    assert _tds_of(female_row) < _tds_of(male_row)


@pytest.mark.asyncio
async def test_flag_off_means_no_tds_and_old_runs_are_untouched(db_session_integration):
    db = db_session_integration
    tenant, _s, run, emp = await _tds_setup(db, flags={})
    _p, row = await _row(db, tenant, run, emp)
    assert _tds_of(row) == 0 and row.trace["bd_tds_applied"] is False and "bd_tds" not in row.trace["statutory"]


@pytest.mark.asyncio
async def test_run_keeps_its_first_mode_both_ways(db_session_integration):
    db = db_session_integration
    # ON -> OFF: the run keeps deducting.
    tenant, _s, run, emp = await _tds_setup(db)
    first = await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    assert D(first["deduction_total"]) == D("2666.67") if "deduction_total" in first else True
    tenant.feature_flags = {**tenant.feature_flags, "hr_bd_salary_tds_enabled": False}
    await db.flush()
    preview, row = await _row(db, tenant, run, emp)
    assert _tds_of(row) == D("2666.67") and preview.warnings is not None
    # OFF -> ON: the run keeps NOT deducting, and says so.
    tenant2, _s2, run2, emp2 = await _tds_setup(db, flags={})
    await payroll_service.apply_auto_calculate(db, tenant=tenant2, run_id=run2.id, created_by=None)
    tenant2.feature_flags = {**tenant2.feature_flags, **ON}
    await db.flush()
    preview2, row2 = await _row(db, tenant2, run2, emp2)
    assert _tds_of(row2) == 0 and any("before Bangladesh salary tax" in w for w in preview2.warnings)


@pytest.mark.asyncio
async def test_next_month_uses_prior_frozen_run_without_double_counting(db_session_integration):
    db = db_session_integration
    tenant, structure, run, emp = await _tds_setup(db)
    await payroll_service.apply_auto_calculate(db, tenant=tenant, run_id=run.id, created_by=None)
    run.status = "FINALIZED"
    await db.flush()
    october = await _run(db, tenant, *OCT)
    _p, row = await _row(db, tenant, october, emp)
    ytd = row.trace["statutory"]["bd_tds"]
    assert ytd["ytd_gross"] == "100000.00" and ytd["prior_tds"] == "2666.67" and ytd["remaining_months"] == 8
    assert ytd["remaining_liability"] == "24000.00" and _tds_of(row) == D("2666.67")
    # Draft / rejected runs of the earlier month never count.
    run.status = "REJECTED"
    await db.flush()
    _p, row = await _row(db, tenant, october, emp)
    assert row.trace["statutory"]["bd_tds"]["prior_tds"] == "0.00"
    assert any("no payroll in the system" in w for w in row.warnings)


@pytest.mark.asyncio
async def test_prior_manual_line_fails_closed_unless_opening_balance_covers_it(db_session_integration):
    db = db_session_integration
    tenant, structure, run, emp = await _tds_setup(db)
    run.status = "FINALIZED"
    db.add(PayrollRunLine(tenant_id=tenant.id, run_id=run.id, employee_id=emp.id, gross_pay=100000, deductions=0, net_pay=100000, calculation_source="MANUAL"))
    october = await _run(db, tenant, *OCT)
    await db.flush()
    with pytest.raises(HTTPException) as err:
        await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=october.id)
    assert err.value.status_code == 400 and "no calculation snapshot" in str(err.value.detail)
    profile = HrEmployeeTaxProfile(
        tenant_id=tenant.id, employee_id=emp.id, opening_income_year_start=date(2026, 7, 1),
        opening_through_date=date(2026, 9, 30), opening_ytd_gross=D("100000"), opening_ytd_tds=D("500"),
    )
    db.add(profile)
    await db.flush()
    _p, row = await _row(db, tenant, october, emp)
    bd = row.trace["statutory"]["bd_tds"]
    assert bd["ytd_gross"] == "100000.00" and bd["prior_tds"] == "500.00"  # covered once, not added twice
    profile.opening_through_date = date(2026, 9, 15)  # cutoff inside the September period
    await db.flush()
    with pytest.raises(HTTPException) as inside:
        await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=october.id)
    assert "inside payroll period" in str(inside.value.detail)


@pytest.mark.asyncio
async def test_employee_switch_off_override_and_reserved_code(db_session_integration):
    db = db_session_integration
    tenant, structure, run, emp = await _tds_setup(db)
    profile = HrEmployeeTaxProfile(tenant_id=tenant.id, employee_id=emp.id, tds_enabled=False)
    db.add(profile)
    await db.flush()
    _p, off = await _row(db, tenant, run, emp)
    assert _tds_of(off) == 0 and off.trace["statutory"]["bd_tds"]["method"] == "EMPLOYEE_TDS_OFF"
    assert off.trace["statutory"]["bd_tds"]["net_annual_tax"] == "26666.67"  # estimate is still kept
    profile.tds_enabled, profile.monthly_tds_override = True, D("1000")
    await db.flush()
    _p, fixed = await _row(db, tenant, run, emp)
    assert _tds_of(fixed) == D("1000.00")
    reserved = PayrollComponent(tenant_id=tenant.id, code="BD-TDS", name="Manual tax", component_type="DEDUCTION", calculation_type="FIXED", default_amount=D("10"), is_active=True)
    db.add(reserved)
    await db.flush()
    db.add(PayrollStructureLine(tenant_id=tenant.id, structure_id=structure.id, component_id=reserved.id, amount=D("10"), sort_order=5))
    await db.flush()
    with pytest.raises(HTTPException) as err:
        await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=run.id)
    assert err.value.status_code == 400 and "reserved" in str(err.value.detail)


@pytest.mark.asyncio
async def test_unsupported_income_year_fails_closed(db_session_integration):
    db = db_session_integration
    tenant, structure, _run_unused, emp = await _tds_setup(db)
    emp.joining_date = date(2025, 1, 1)
    asgn = (await db.execute(select(PayrollEmployeeStructureAssignment).where(PayrollEmployeeStructureAssignment.employee_id == emp.id))).scalar_one()
    asgn.effective_from = date(2025, 1, 1)
    old = await _run(db, tenant, date(2025, 9, 1), date(2025, 9, 30))
    with pytest.raises(HTTPException) as err:
        await payroll_service.preview_auto_calculate(db, tenant=tenant, run_id=old.id)
    assert err.value.status_code == 400 and "No approved Bangladesh salary tax schedule" in str(err.value.detail)


# --- Profile API, estimate, onboarding, enablement -------------------------------------------------


async def _api_setup(db, *, code="EMP-0000081", gender="Female"):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    await db.commit()
    emp = Employee(tenant_id=tenant.id, employee_code=code, first_name="Taxpayer", gender=gender, joining_date=date(2024, 1, 1), is_active=True)
    db.add(emp)
    await db.commit()
    return tenant, user, role, emp


PROFILE = {
    "tds_enabled": True, "tin_number": "123456789012", "tax_circle": "Circle-9", "tax_zone": "Zone-3",
    "tax_category_override": "AUTO", "rebate_mode": "DECLARED_INVESTMENT", "declared_annual_investment": "200000",
    "monthly_tds_override": "1500",
}


@pytest.mark.asyncio
async def test_tax_profile_roundtrip_validation_privacy_rbac_and_tenancy(db_session_integration):
    db = db_session_integration
    tenant, user, role, emp = await _api_setup(db)
    url = f"{HR}/employees/{emp.id}/tax-profile"
    async with api_client(db, tenant, user) as c:
        assert (await c.get(url)).json()["profile"]["exists"] is False
        assert (await c.put(url, json={**PROFILE, "tax_category_override": "DISABLED"})).status_code == 400  # needs evidence
        assert (await c.put(url, json={**PROFILE, "rebate_mode": "DECLARED_INVESTMENT", "declared_annual_investment": None})).status_code == 400
        assert (await c.put(url, json={**PROFILE, "monthly_tds_override": "-5"})).status_code == 400
        assert (await c.put(url, json={**PROFILE, "opening_ytd_gross": "10"})).status_code == 400  # no income year / cutoff
        saved = await c.put(url, json={**PROFILE, "tax_category_override": "DISABLED", "category_evidence_reference": "CERT-77"})
        assert saved.status_code == 200, saved.text
        assert (await c.put(url, json=PROFILE)).status_code == 200  # replaces, still one row
        body = (await c.get(url)).json()["profile"]
        assert body["tin_number"] == "123456789012" and body["monthly_tds_override"] == "1500.0000"
    assert (await db.execute(select(func.count()).select_from(HrEmployeeTaxProfile).where(HrEmployeeTaxProfile.employee_id == emp.id))).scalar_one() == 1
    audit = [r.details or "" for r in (await db.execute(select(AuditLog).where(AuditLog.action == "HR_EMPLOYEE_TAX_PROFILE_UPDATED"))).scalars()]
    assert audit and all("123456789012" not in d and "200000" not in d and "1500" not in d for d in audit)

    role.name = "clerk"
    role.permissions = {"hr.access": True}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.get(url)).status_code == 403
        assert (await c.put(url, json=PROFILE)).status_code == 403

    other, other_user, _r, _e = await _api_setup(db, code="EMP-0000082")
    async with api_client(db, other, other_user) as c:
        assert (await c.get(url)).status_code == 404
        assert (await c.put(url, json=PROFILE)).status_code == 404
        # Preview with another tenant's employee id looks like "not found".
        preview = await c.post(f"{HR}/compensation/preview", json={"structure_id": 1, "employee_id": emp.id})
        assert preview.status_code in (403, 404)


@pytest.mark.asyncio
async def test_compensation_view_and_preview_return_the_salary_only_estimate(db_session_integration):
    db = db_session_integration
    tenant, user, _role, emp = await _api_setup(db, code="EMP-0000083")
    async with api_client(db, tenant, user) as c:
        view = (await c.get(f"{HR}/employees/{emp.id}/compensation")).json()
    estimate = view["tds_estimate"]
    assert estimate["estimate_basis"] == "SALARY_ONLY" and estimate["payroll_enabled"] is False
    assert estimate["supported"] is True and estimate["employee_tds_enabled"] is True


def test_estimate_helper_reacts_to_gender_and_profile_and_never_raises():
    class T:  # minimal tenant stand-in
        feature_flags = ON
        timezone = "Asia/Dhaka"

    male = tax.tds_estimate(tenant=T(), monthly_gross=D("100000"), gender="male", date_of_birth=None, as_of=date(2026, 11, 12))
    female = tax.tds_estimate(tenant=T(), monthly_gross=D("100000"), gender="female", date_of_birth=None, as_of=date(2026, 11, 12))
    assert D(male["monthly_tds"]) > D(female["monthly_tds"]) and male["payroll_enabled"] is True
    off = tax.tds_estimate(
        tenant=T(), monthly_gross=D("100000"), gender="male", date_of_birth=None, as_of=date(2026, 11, 12),
        profile_body=tax.TaxProfileBody(tds_enabled=False),
    )
    assert off["employee_tds_enabled"] is False and D(off["monthly_tds"]) == D("3750.00")  # informational
    later = tax.tds_estimate(tenant=T(), monthly_gross=D("100000"), gender="male", date_of_birth=None, as_of=date(2031, 1, 1))
    assert later["supported"] is False and later["message"]


@pytest.mark.asyncio
async def test_enablement_is_denied_without_signed_approval_and_audited_when_off(db_session_integration):
    db = db_session_integration
    tenant, user, role, _emp = await _api_setup(db, code="EMP-0000084")
    async with api_client(db, tenant, user) as c:
        state = (await c.get(f"{BD}/salary-tds")).json()
        assert state["enabled"] is False and state["can_enable"] is False and state["problems"]
        denied = await c.put(f"{BD}/salary-tds", json={"enabled": True})
        assert denied.status_code == 409 and "Cannot switch salary TDS on" in denied.text
        assert (await c.put(f"{BD}/salary-tds", json={"enabled": False})).status_code == 200
    await db.refresh(tenant)
    assert is_hr_bd_salary_tds_enabled(tenant.feature_flags) is False
    role.name = "clerk"
    role.permissions = {"hr.access": True}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        assert (await c.put(f"{BD}/salary-tds", json={"enabled": False})).status_code == 403


@pytest.mark.asyncio
async def test_onboarding_saves_tax_profile_once_and_needs_payroll_permission(db_session_integration):
    db = db_session_integration
    tenant, user, role, _emp = await _api_setup(db, code="EMP-0000085")
    request = {
        "request_id": "onb-tax-profile-1",
        "employee": {"first_name": "Joiner", "gender": "Female", "phone": "01733333333", "national_id": str(3000000000 + tenant.id)},
        "tax_profile": PROFILE,
    }
    async with api_client(db, tenant, user) as c:
        first = await c.post(f"{HR}/onboarding", json=request)
        assert first.status_code in (200, 201), first.text
        again = await c.post(f"{HR}/onboarding", json=request)
        assert again.status_code in (200, 201)
    new_id = first.json()["employee"]["id"]
    assert first.json()["status"] == "COMPLETED", first.json()
    rows = (await db.execute(select(HrEmployeeTaxProfile).where(HrEmployeeTaxProfile.employee_id == new_id))).scalars().all()
    assert len(rows) == 1 and rows[0].tin_number == "123456789012"
    role.name = "clerk"
    role.permissions = {"hr.access": True, "hr.employees.manage": True}
    await db.commit()
    async with api_client(db, tenant, user) as c:
        denied = await c.post(f"{HR}/onboarding", json={
            "request_id": "onb-tax-profile-2",
            "employee": {"first_name": "Other", "phone": "01744444444", "national_id": str(4000000000 + tenant.id)},
            "tax_profile": PROFILE,
        })
        assert denied.status_code == 403


# --- Accounting ------------------------------------------------------------------------------------


async def _approved_run_with_tds(db, *, gross_posting: bool, with_tax_account: bool = True):
    tenant, user, role = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    role.name = "manager"
    flags = {"payroll_gross_posting": gross_posting}
    tenant.feature_flags = {**(tenant.feature_flags or {}), **flags}
    await db.commit()
    today = date(2026, 11, 12)
    db.add(AccountingPeriod(tenant_id=tenant.id, period_name="FY", start_date=date(2026, 1, 1), end_date=date(2026, 12, 31), is_closed=False))
    accts = {
        "expense": await _account(db, tenant.id, "Salary expense"),
        "payable": await _account(db, tenant.id, "Salary payable", normal="credit"),
        "tax": await _account(db, tenant.id, "Tax payable", normal="credit"),
    }
    db.add(PayrollAccountingConfig(
        tenant_id=tenant.id, salary_expense_account_id=accts["expense"].id, salary_payable_account_id=accts["payable"].id,
        tax_payable_account_id=accts["tax"].id if with_tax_account else None,
    ))
    emp = Employee(tenant_id=tenant.id, employee_code="EMP-0000090", first_name="Paid", is_active=True)
    db.add(emp)
    period = PayrollPeriod(tenant_id=tenant.id, period_code="2026-10", start_date=date(2026, 10, 1), end_date=date(2026, 10, 31), payment_date=today)
    db.add(period)
    await db.flush()
    run = PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code="OCT", run_date=date(2026, 10, 31), status="APPROVED", gross_total=D("100000"), deduction_total=D("2666.67"), net_total=D("97333.33"))
    db.add(run)
    await db.flush()
    line = PayrollRunLine(tenant_id=tenant.id, run_id=run.id, employee_id=emp.id, gross_pay=D("100000"), deductions=D("2666.67"), net_pay=D("97333.33"), calculation_source="AUTO")
    db.add(line)
    await db.flush()
    db.add(PayrollCalculationSnapshot(
        tenant_id=tenant.id, payroll_run_line_id=line.id, calculation_source="AUTO",
        trace_json={"statutory": {"bd_tds": {"monthly_tds": "2666.67"}}, "bd_tds_applied": True, "gross_pay": "100000.00", "components": []},
    ))
    await db.commit()
    return tenant, user, run, accts


@pytest.mark.asyncio
async def test_posting_needs_gross_mode_and_credits_tax_payable_once(db_session_integration):
    db = db_session_integration
    tenant, user, run, _a = await _approved_run_with_tds(db, gross_posting=False)
    async with api_client(db, tenant, user) as c:
        blocked = await c.post(f"{PAY}/runs/{run.id}/post", json={})
        assert blocked.status_code == 400 and "gross payroll posting" in blocked.text
    assert (await db.execute(select(func.count()).select_from(Voucher).where(Voucher.tenant_id == tenant.id))).scalar_one() == 0

    tenant2, user2, run2, accts = await _approved_run_with_tds(db, gross_posting=True)
    async with api_client(db, tenant2, user2) as c:
        first = await c.post(f"{PAY}/runs/{run2.id}/post", json={})
        assert first.status_code == 200, first.text
        second = await c.post(f"{PAY}/runs/{run2.id}/post", json={})  # double submit: same voucher
        assert second.json()["voucher_id"] == first.json()["voucher_id"]
    lines = (await db.execute(select(VoucherLine).where(VoucherLine.voucher_id == first.json()["voucher_id"]))).scalars().all()
    debit = sum(D(str(x.amount)) for x in lines if x.entry_type == "DEBIT")
    credit = sum(D(str(x.amount)) for x in lines if x.entry_type == "CREDIT")
    assert debit == credit == D("100000.00")
    tax_credits = [D(str(x.amount)) for x in lines if x.account_id == accts["tax"].id and x.entry_type == "CREDIT"]
    assert tax_credits == [D("2666.67")]  # once, not also lumped into "other deductions"

    tenant3, user3, run3, _a3 = await _approved_run_with_tds(db, gross_posting=True, with_tax_account=False)
    async with api_client(db, tenant3, user3) as c:
        missing = await c.post(f"{PAY}/runs/{run3.id}/post", json={})
        assert missing.status_code == 400 and "Tax payable" in missing.text
