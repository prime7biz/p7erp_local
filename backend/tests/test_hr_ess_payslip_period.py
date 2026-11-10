"""GET /hr/ess/my-payslips reports the payroll period's month (not the generation date), own payslips only.

Run: docker compose exec backend pytest tests/test_hr_ess_payslip_period.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Employee, PayrollPayslip, PayrollPeriod, PayrollRun, PayrollRunLine
from tests.merch_fixtures import create_merch_tenant_with_user


@asynccontextmanager
async def _client(db, tenant, user):
    async def o_db():
        yield db

    async def o_user():
        return user

    async def o_tenant():
        return tenant

    app.dependency_overrides[get_db] = o_db
    app.dependency_overrides[get_current_user] = o_user
    app.dependency_overrides[require_tenant] = o_tenant
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        for dep in (get_db, get_current_user, require_tenant):
            app.dependency_overrides.pop(dep, None)


async def _payslip(db, tenant, emp, *, start: date, generated: datetime, net: str) -> PayrollPayslip:
    period = PayrollPeriod(
        tenant_id=tenant.id, period_code=f"P{uuid.uuid4().hex[:6]}", start_date=start,
        end_date=start.replace(day=28), payment_date=start.replace(day=28),
    )
    db.add(period)
    await db.flush()
    run = PayrollRun(tenant_id=tenant.id, period_id=period.id, run_code=f"R{uuid.uuid4().hex[:6]}", run_date=start, status="APPROVED")
    db.add(run)
    await db.flush()
    line = PayrollRunLine(tenant_id=tenant.id, run_id=run.id, employee_id=emp.id, gross_pay=Decimal(net), deductions=Decimal("0"), net_pay=Decimal(net))
    db.add(line)
    await db.flush()
    slip = PayrollPayslip(tenant_id=tenant.id, payroll_run_line_id=line.id, slip_number=f"S{uuid.uuid4().hex[:6]}", generated_at=generated)
    db.add(slip)
    await db.flush()
    return slip


@pytest.mark.asyncio
async def test_my_payslips_use_payroll_period_month_and_stay_own(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    other_tenant, other_user, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    me = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Me", user_id=user.id)
    colleague = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Colleague")
    stranger = Employee(tenant_id=other_tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="X", user_id=other_user.id)
    db.add_all([me, colleague, stranger])
    await db.flush()
    # October 2026 payroll, payslip generated on 3 November.
    oct_slip = await _payslip(db, tenant, me, start=date(2026, 10, 1), generated=datetime(2026, 11, 3, 10, 0), net="9000")
    # December 2025 payroll generated in January 2026 belongs to year 2025.
    dec_slip = await _payslip(db, tenant, me, start=date(2025, 12, 1), generated=datetime(2026, 1, 4, 9, 0), net="8000")
    colleague_slip = await _payslip(db, tenant, colleague, start=date(2026, 10, 1), generated=datetime(2026, 11, 3), net="1")
    foreign_slip = await _payslip(db, other_tenant, stranger, start=date(2026, 10, 1), generated=datetime(2026, 11, 3), net="1")
    await db.commit()

    async with _client(db, tenant, user) as c:
        rows = (await c.get("/api/v1/hr/ess/my-payslips")).json()
        by_id = {r["id"]: r for r in rows}
        assert set(by_id) == {oct_slip.id, dec_slip.id}
        assert colleague_slip.id not in by_id and foreign_slip.id not in by_id
        assert (by_id[oct_slip.id]["period_year"], by_id[oct_slip.id]["period_month"]) == (2026, 10)
        assert (by_id[dec_slip.id]["period_year"], by_id[dec_slip.id]["period_month"]) == (2025, 12)
        # Newest payroll period first.
        assert [r["id"] for r in rows] == [oct_slip.id, dec_slip.id]

        only_2025 = (await c.get("/api/v1/hr/ess/my-payslips", params={"year": 2025})).json()
        assert [r["id"] for r in only_2025] == [dec_slip.id]
        only_2026 = (await c.get("/api/v1/hr/ess/my-payslips", params={"year": 2026})).json()
        assert [r["id"] for r in only_2026] == [oct_slip.id]


@pytest.mark.asyncio
async def test_my_payslips_send_exact_money_text_and_no_server_path(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db, permissions={"hr.access": True})
    me = Employee(tenant_id=tenant.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Me", user_id=user.id)
    db.add(me)
    await db.flush()
    slip = await _payslip(db, tenant, me, start=date(2026, 10, 1), generated=datetime(2026, 11, 3), net="15000.5")
    slip.file_path = "/app/media/payslips/secret-internal-path.pdf"
    line = await db.get(PayrollRunLine, slip.payroll_run_line_id)
    line.gross_pay = Decimal("15500.10")
    line.deductions = Decimal("499.60")
    await db.commit()

    async with _client(db, tenant, user) as c:
        rows = (await c.get("/api/v1/hr/ess/my-payslips")).json()
    assert len(rows) == 1
    row = rows[0]
    # Same 4-decimal money text as the rest of the payroll API (never a float).
    assert row["gross_pay"] == "15500.1000"
    assert row["deductions"] == "499.6000"
    assert row["net_pay"] == "15000.5000"
    assert row["download_url"] is None
