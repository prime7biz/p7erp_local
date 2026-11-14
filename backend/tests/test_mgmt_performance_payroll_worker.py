"""Management Performance: payroll accrual + projection (totals only), payroll run wins, daily scan job fails closed.

Run: docker compose exec -T backend sh -c "pytest tests/test_mgmt_performance_payroll_worker.py -q -p no:warnings"
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import func, select

from app.models.hr import Employee
from app.models.hr_attendance import AttendanceEntry, OvertimeEntry
from app.models.hr_payroll import (
    PayrollComponent,
    PayrollEmployeeStructureAssignment,
    PayrollPeriod,
    PayrollRun,
    PayrollStructure,
    PayrollStructureLine,
)
from app.models.mgmt_performance import BudgetException
from app.modules.finance.mgmt_performance.payroll_forecast_service import payroll_projection
from tests.mgmt_performance_fixtures import TODAY, FLAG, budget, cash_account, cost_center, expense_account, mp_tenant, spend

D = Decimal
MARCH = date(2030, 3, 1)


async def _employee(db, tenant, basic: str, *, joining: date | None = None) -> Employee:
    slug = uuid.uuid4().hex[:6]
    emp = Employee(tenant_id=tenant.id, employee_code=f"E{slug}", first_name="Worker", joining_date=joining, is_active=True)
    db.add(emp)
    await db.flush()
    comp = PayrollComponent(tenant_id=tenant.id, code=f"BASIC{slug}"[:24], name="Basic", component_type="EARNING",
                            calculation_type="PERCENT_OF_BASE")
    house = PayrollComponent(tenant_id=tenant.id, code=f"HR{slug}", name="House rent", component_type="EARNING",
                             calculation_type="FIXED")
    st = PayrollStructure(tenant_id=tenant.id, code=f"S{slug}", name="Std")
    db.add_all([comp, house, st])
    await db.flush()
    db.add_all([
        PayrollStructureLine(tenant_id=tenant.id, structure_id=st.id, component_id=comp.id, amount=D("100"), sort_order=1),
        PayrollStructureLine(tenant_id=tenant.id, structure_id=st.id, component_id=house.id, amount=D("1000"), sort_order=2),
        PayrollEmployeeStructureAssignment(tenant_id=tenant.id, employee_id=emp.id, structure_id=st.id,
                                           effective_from=date(2029, 1, 1), base_salary=D(basic)),
    ])
    await db.flush()
    return emp


async def test_payroll_accrual_mid_month_with_absence_and_overtime(db_session_integration):
    db = db_session_integration
    tenant, _u, _ = await mp_tenant(db)
    emp = await _employee(db, tenant, "30000")  # gross 31,000
    db.add(Employee(tenant_id=tenant.id, employee_code=f"N{uuid.uuid4().hex[:6]}", first_name="No structure", is_active=True))
    db.add(AttendanceEntry(tenant_id=tenant.id, employee_id=emp.id, attendance_date=date(2030, 3, 4), status="ABSENT"))
    db.add(OvertimeEntry(tenant_id=tenant.id, employee_id=emp.id, work_date=date(2030, 3, 5), ot_hours=D("2"),
                         amount=D("500"), status="APPROVED"))
    db.add(OvertimeEntry(tenant_id=tenant.id, employee_id=emp.id, work_date=date(2030, 3, 6), ot_hours=D("2"),
                         amount=D("900"), status="PENDING"))
    await db.flush()
    p = await payroll_projection(db, tenant.id, MARCH, TODAY)
    assert p.source == "ATTENDANCE_ACCRUAL"
    assert p.earned_to_date == (D("31000") * D(15) / D(31)).quantize(D("0.0001"))  # 16 days so far - 1 absent
    assert p.remaining == (D("31000") * D(15) / D(31)).quantize(D("0.0001"))
    assert p.overtime == D("500")
    assert p.amount == p.earned_to_date + p.remaining + p.overtime
    assert p.employees == 2 and p.employees_without_structure == 1
    assert "EMPLOYEE_WITHOUT_STRUCTURE" in p.reason_codes


async def test_finalised_payroll_run_replaces_the_estimate(db_session_integration):
    db = db_session_integration
    tenant, _u, _ = await mp_tenant(db)
    await _employee(db, tenant, "30000")
    period = PayrollPeriod(tenant_id=tenant.id, period_code=f"P{uuid.uuid4().hex[:6]}", start_date=MARCH,
                           end_date=date(2030, 3, 31), payment_date=date(2030, 4, 7))
    db.add(period)
    await db.flush()
    db.add_all([
        PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code=f"R{uuid.uuid4().hex[:6]}", run_date=MARCH,
                   status="DRAFT", gross_total=D("1")),
        PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code=f"R{uuid.uuid4().hex[:6]}", run_date=MARCH,
                   status="FINALIZED", gross_total=D("29999.5")),
    ])
    await db.flush()
    p = await payroll_projection(db, tenant.id, MARCH, TODAY)
    assert (p.source, p.amount) == ("PAYROLL_RUN", D("29999.5000"))


async def test_daily_scan_skips_flag_off_and_isolates_failures(db_session_integration, monkeypatch):
    from app.workers import mgmt_performance_worker as w

    db = db_session_integration
    on, _u, _ = await mp_tenant(db)
    off, _u2, _ = await mp_tenant(db, flags={})
    broken, _u3, _ = await mp_tenant(db)
    for tenant in (on, off):
        cash = await cash_account(db, tenant)
        util = await expense_account(db, tenant, "UTILITIES")
        cc = await cost_center(db, tenant)
        await budget(db, tenant, [(cc, util, "2030-03", "100")])
        await spend(db, tenant, util, cash, date(2030, 3, 2), "500", cc=cc)
    await db.commit()
    tenant_rows = [(t.id, dict(t.feature_flags)) for t in (broken, on, off)]
    on_id, off_id, broken_id = on.id, off.id, broken.id
    assert FLAG in tenant_rows[1][1]

    async def rows(_db):
        return tenant_rows

    from app.modules.finance.mgmt_performance import exception_service

    real_scan = exception_service.scan_tenant

    async def scan(db_, tenant, **kw):
        if tenant.id == broken_id:
            raise RuntimeError("boom")
        return await real_scan(db_, tenant, **kw)

    monkeypatch.setattr(w, "active_tenant_rows", rows)
    monkeypatch.setattr(exception_service, "scan_tenant", scan)
    out = await w.run_scan_all_tenants(db, today=TODAY)
    by = {r["tenant_id"]: r for r in out["results"]}
    assert off_id not in by
    assert by[broken_id] == {"tenant_id": broken_id, "error": True}
    assert by[on_id]["created"] >= 1  # the failure before it did not stop the job
    n_off = await db.scalar(select(func.count()).select_from(BudgetException).where(BudgetException.tenant_id == off_id))
    assert n_off == 0
