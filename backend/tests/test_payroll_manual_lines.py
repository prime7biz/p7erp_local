"""Manual payroll run lines: amounts must be valid, non-negative and net = gross - deductions.

Run: docker compose exec backend pytest tests/test_payroll_manual_lines.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest

from app.models.hr import Employee
from app.models.hr_payroll import PayrollPeriod, PayrollRun
from tests.benchmark_fixtures import api_client, seed_tenant_admin


async def _seed(db, employees: int = 1):
    tenant, user = await seed_tenant_admin(db)
    emps = []
    for _ in range(employees):
        emp = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:8]}", first_name="Worker", is_active=True)
        db.add(emp)
        emps.append(emp)
    period = PayrollPeriod(
        tenant_id=tenant.id, period_code=f"P{uuid.uuid4().hex[:6]}", start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30), payment_date=date(2026, 9, 30), status="OPEN", is_locked=False,
    )
    db.add(period)
    await db.flush()
    run = PayrollRun(tenant_id=tenant.id, period_id=period.id, status="DRAFT", run_code=f"R{uuid.uuid4().hex[:6]}", run_date=date(2026, 9, 30))
    db.add(run)
    await db.commit()
    return tenant, user, emps, run


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "amounts",
    [
        {"gross_pay": "-100", "deductions": "0", "net_pay": "-100"},  # negative
        {"gross_pay": "1000", "deductions": "-50", "net_pay": "1050"},  # negative deduction
        {"gross_pay": "1000", "deductions": "100", "net_pay": "950"},  # net does not match
        {"gross_pay": "abc", "deductions": "0", "net_pay": "0"},  # garbage text
        {"gross_pay": "NaN", "deductions": "0", "net_pay": "0"},
        {"gross_pay": "Infinity", "deductions": "0"},
        {"gross_pay": True, "deductions": "0"},
        {"gross_pay": "100", "deductions": "200"},  # deductions above gross
    ],
)
async def test_bad_manual_line_is_rejected(db_session_integration, amounts):
    db = db_session_integration
    tenant, user, (emp,), run = await _seed(db)
    async with api_client(db, tenant, user) as ac:
        r = await ac.post(f"/api/v1/hr/payroll/runs/{run.id}/lines/upsert", json={"employee_id": emp.id, **amounts})
    assert r.status_code == 422, r.text


@pytest.mark.asyncio
async def test_numbers_strings_and_missing_net_are_accepted(db_session_integration):
    db = db_session_integration
    tenant, user, (a, b, c), run = await _seed(db, employees=3)
    async with api_client(db, tenant, user) as ac:
        url = f"/api/v1/hr/payroll/runs/{run.id}/lines/upsert"
        r1 = await ac.post(url, json={"employee_id": a.id, "gross_pay": 1000, "deductions": 100.5, "net_pay": 899.5})
        assert r1.status_code == 200, r1.text
        r2 = await ac.post(url, json={"employee_id": b.id, "gross_pay": "2,000.25", "deductions": "0.25"})
        assert r2.status_code == 200, r2.text
        assert r2.json()["net_pay"] == "2000.0000"
        # Within the 0.01 rounding tolerance.
        r3 = await ac.post(url, json={"employee_id": c.id, "gross_pay": "10.005", "deductions": "0", "net_pay": "10.00"})
        assert r3.status_code == 200, r3.text


@pytest.mark.asyncio
async def test_finalize_sums_lines_exactly(db_session_integration):
    db = db_session_integration
    tenant, user, emps, run = await _seed(db, employees=3)
    grosses = ["12345678901.2345", "98765432109.8765", "0.0003"]
    async with api_client(db, tenant, user) as ac:
        for emp, gross in zip(emps, grosses):
            r = await ac.post(
                f"/api/v1/hr/payroll/runs/{run.id}/lines/upsert",
                json={"employee_id": emp.id, "gross_pay": gross, "deductions": "0.0001"},
            )
            assert r.status_code == 200, r.text
        fr = await ac.post(f"/api/v1/hr/payroll/runs/{run.id}/finalize")
    assert fr.status_code == 200, fr.text
    body = fr.json()
    expected_gross = sum((Decimal(g) for g in grosses), Decimal("0"))
    assert Decimal(body["gross_total"]) == expected_gross
    assert Decimal(body["deduction_total"]) == Decimal("0.0003")
    assert Decimal(body["net_total"]) == expected_gross - Decimal("0.0003")
