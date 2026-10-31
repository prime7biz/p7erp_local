"""P2 inventory + HR integrity regressions.

Run:
docker compose exec backend pytest tests/test_inventory_hr_p2_integrity.py -q
"""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.hr_leave import LeaveBalance
from app.models.hr_payroll import PayrollApproval, PayrollRun

from tests.go_live_fixtures import (
    create_admin_tenant_with_user,
    seed_hr_leave_approval_context,
    seed_inventory_chain,
    seed_payroll_period,
)


def _override(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


def _client():
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.mark.asyncio
async def test_challan_cannot_be_created_posted_or_reopened(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "allow_negative_stock": True}
    await db.commit()
    _override(db, user, tenant)
    try:
        async with _client() as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            r = await ac.post(
                "/api/v1/inventory/delivery-challans",
                headers=h,
                json={
                    "customer_name": "Buyer",
                    "status": "POSTED",
                    "items": [{"item_id": item.id, "warehouse_id": wh.id, "quantity": "1"}],
                },
            )
            assert r.status_code == 200, r.text
            dc = r.json()
            assert dc["status"] == "DRAFT"

            reject = await ac.post(f"/api/v1/inventory/delivery-challans/{dc['id']}/status", headers=h, json={"status": "REJECTED"})
            assert reject.status_code == 200, reject.text
            bad = await ac.post(f"/api/v1/inventory/delivery-challans/{dc['id']}/status", headers=h, json={"status": "POSTED"})
            assert bad.status_code == 409, bad.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_challan_rejects_other_tenants_item(db_session_integration):
    db = db_session_integration
    tenant, user, wh, _v, _item = await seed_inventory_chain(db)
    _t2, _u2, _wh2, _v2, foreign_item = await seed_inventory_chain(db)
    await db.commit()
    _override(db, user, tenant)
    try:
        async with _client() as ac:
            r = await ac.post(
                "/api/v1/inventory/delivery-challans",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "customer_name": "Buyer",
                    "items": [{"item_id": foreign_item.id, "warehouse_id": wh.id, "quantity": "1"}],
                },
            )
        assert r.status_code == 400, r.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_pending_leave_reserves_days_and_respects_allocation(db_session_integration):
    db = db_session_integration
    tenant, user, emp, leave_type = await seed_hr_leave_approval_context(db)  # 10 days allocated
    await db.commit()
    _override(db, user, tenant)
    try:
        async with _client() as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            year = date.today().year
            body = {
                "employee_id": emp.id,
                "leave_type_id": leave_type.id,
                "from_date": f"{year}-03-01",
                "to_date": f"{year}-03-03",
                "days_requested": "3",
            }
            ok = await ac.post("/api/v1/hr/leave/requests", headers=h, json=body)
            assert ok.status_code == 201, ok.text
            too_many = await ac.post("/api/v1/hr/leave/requests", headers=h, json={**body, "days_requested": "8"})
            assert too_many.status_code == 400, too_many.text
        bal = (
            await db.execute(
                select(LeaveBalance).where(LeaveBalance.employee_id == emp.id, LeaveBalance.leave_type_id == leave_type.id)
            )
        ).scalar_one()
        assert float(bal.pending_days) == 3.0
        assert float(bal.closing_balance_days) == 7.0
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_one_payroll_run_per_period_and_no_decision_on_posted(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    period = await seed_payroll_period(db, tenant)
    posted = PayrollRun(
        tenant_id=tenant.id,
        period_id=period.id,
        run_code=f"R{uuid.uuid4().hex[:6]}",
        run_date=period.start_date,
        status="POSTED",
        created_by=user.id,
    )
    db.add(posted)
    await db.flush()
    approval = PayrollApproval(tenant_id=tenant.id, payroll_run_id=posted.id, action="APPROVED", action_by=user.id)
    db.add(approval)
    await db.commit()
    _override(db, user, tenant)
    try:
        async with _client() as ac:
            h = {"X-Tenant-Id": str(tenant.id)}
            dup = await ac.post(
                "/api/v1/hr/payroll/runs",
                headers=h,
                json={"period_id": period.id, "run_date": period.start_date.isoformat()},
            )
            assert dup.status_code == 409, dup.text
            flip = await ac.patch(
                f"/api/v1/hr/payroll/approvals/{approval.id}/decision", headers=h, json={"decision": "APPROVED"}
            )
            assert flip.status_code == 400, flip.text
    finally:
        app.dependency_overrides.clear()
