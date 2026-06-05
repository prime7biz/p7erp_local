"""HR happy-path HTTP tests for go-live readiness."""

from __future__ import annotations

from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.hr_leave import LeaveRequest

from tests.go_live_fixtures import seed_hr_leave_approval_context, seed_payroll_period


def _override_app(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


@pytest.mark.asyncio
async def test_leave_request_approve_happy_path(db_session_integration):
    db = db_session_integration
    tenant, user, emp, leave_type = await seed_hr_leave_approval_context(db)
    req = LeaveRequest(
        tenant_id=tenant.id,
        employee_id=emp.id,
        leave_type_id=leave_type.id,
        from_date=date.today(),
        to_date=date.today(),
        days_requested="1",
        status="PENDING",
        requested_by=user.id,
    )
    db.add(req)
    await db.commit()

    _override_app(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                f"/api/v1/hr/leave/requests/{req.id}/approve",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"note": "UAT approve"},
            )
        assert r.status_code == 200, r.text
        assert r.json().get("status") == "APPROVED"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_payroll_run_finalize_and_approve(db_session_integration):
    db = db_session_integration
    tenant, user, emp, _ = await seed_hr_leave_approval_context(db)
    period = await seed_payroll_period(db, tenant)
    from app.models.finance import AccountingPeriod
    from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

    await seed_tenant_system_coa(db, tenant.id)
    db.add(
        AccountingPeriod(
            tenant_id=tenant.id,
            period_name=f"GL-{period.period_code}",
            start_date=period.start_date,
            end_date=period.end_date,
            is_closed=False,
        )
    )
    await db.commit()

    _override_app(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            headers = {"X-Tenant-Id": str(tenant.id)}
            cr = await ac.post(
                "/api/v1/hr/payroll/runs",
                headers=headers,
                json={"period_id": period.id, "run_date": str(period.start_date)},
            )
            assert cr.status_code == 201, cr.text
            run_id = cr.json()["id"]
            ur = await ac.post(
                f"/api/v1/hr/payroll/runs/{run_id}/lines/upsert",
                headers=headers,
                json={
                    "employee_id": emp.id,
                    "gross_pay": "10000",
                    "deductions": "0",
                    "net_pay": "10000",
                },
            )
            assert ur.status_code == 200, ur.text
            fr = await ac.post(f"/api/v1/hr/payroll/runs/{run_id}/finalize", headers=headers)
            assert fr.status_code == 200, fr.text
            ar = await ac.post(f"/api/v1/hr/payroll/runs/{run_id}/approve", headers=headers, json={"note": "ok"})
            assert ar.status_code == 200, ar.text
            assert ar.json().get("status") == "APPROVED"
            pr = await ac.post(
                f"/api/v1/hr/payroll/runs/{run_id}/post",
                headers=headers,
                json={"note": "post to finance"},
            )
            assert pr.status_code == 200, pr.text
            assert pr.json().get("voucher_id") is not None
    finally:
        app.dependency_overrides.clear()
