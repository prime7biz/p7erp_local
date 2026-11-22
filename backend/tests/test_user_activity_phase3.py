"""Phase 3 User Activity: report views, order actions, voucher events already in audit_logs.

Run:
  docker compose exec backend pytest tests/test_user_activity_phase3.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import hash_password
from app.database import get_db
from app.main import app
from app.models import AuditLog, Customer, Role, Tenant, User
from app.models.tenant import TenantType
from app.modules.audit.service import log_report_activity
from app.modules.finance.voucher_history import record_voucher_event


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    cc = f"p3{slug}"[:18]
    tenant = Tenant(
        name=f"Phase3 {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=cc,
        feature_flags={
            "finance_statements_v2": True,
            "mis_reports_enabled": True,
        },
    )
    db.add(tenant)
    await db.flush()
    admin_role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(admin_role)
    await db.flush()
    pwd = await hash_password("Phase3Activity123!")
    admin = User(
        tenant_id=tenant.id,
        role_id=admin_role.id,
        email=f"admin_{slug}@example.com",
        username=f"admin_{slug}",
        first_name="Pat",
        last_name="Admin",
        password_hash=pwd,
        is_active=True,
    )
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"C-{slug[:8]}",
        name=f"Customer {slug}",
        status="active",
    )
    db.add(admin)
    db.add(customer)
    await db.commit()
    return tenant, admin, customer, "Phase3Activity123!"


@pytest.mark.asyncio
async def test_report_and_voucher_events_show_on_activity_list(db_session_integration):
    db = db_session_integration
    tenant, admin, _customer, password = await _seed(db)

    await log_report_activity(
        db,
        tenant_id=tenant.id,
        user_id=admin.id,
        report_name="trial-balance",
        filters_summary="2026-01-01..2026-12-31",
    )
    await log_report_activity(
        db,
        tenant_id=tenant.id,
        user_id=admin.id,
        report_name="profit-loss",
        exported=True,
        filters_summary="format=xlsx",
    )
    await record_voucher_event(
        db,
        tenant_id=tenant.id,
        user_id=admin.id,
        voucher_id=999001,
        event="status",
        summary="CHECKED → RECOMMENDED",
        from_status="CHECKED",
        to_status="RECOMMENDED",
    )
    await db.commit()

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
            assert login.status_code == 200, login.text
            headers = {
                "Authorization": f"Bearer {login.json()['access_token']}",
                "X-Tenant-Id": str(tenant.id),
            }
            reports = await ac.get("/api/v1/settings/audit?category=report", headers=headers)
            assert reports.status_code == 200, reports.text
            report_actions = {i["action"] for i in reports.json()["items"]}
            assert "REPORT_VIEWED" in report_actions
            assert "REPORT_EXPORTED" in report_actions

            approvals = await ac.get("/api/v1/settings/audit?category=approval", headers=headers)
            assert approvals.status_code == 200, approvals.text
            assert any(i["action"] == "voucher.status" for i in approvals.json()["items"])
    finally:
        app.dependency_overrides.pop(get_db, None)


@pytest.mark.asyncio
async def test_order_create_writes_activity(db_session_integration):
    db = db_session_integration
    tenant, admin, customer, password = await _seed(db)

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            login = await ac.post(
                "/api/v1/auth/login",
                json={
                    "company_code": tenant.company_code,
                    "email": admin.email,
                    "password": password,
                    "login_as": "admin",
                },
            )
            assert login.status_code == 200, login.text
            headers = {
                "Authorization": f"Bearer {login.json()['access_token']}",
                "X-Tenant-Id": str(tenant.id),
            }
            created = await ac.post(
                "/api/v1/orders",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "order_date": "2026-11-01",
                    "quantity": 100,
                    "status": "DRAFT",
                },
            )
            assert created.status_code == 201, created.text
            order_id = created.json()["id"]
            await db.commit()

            rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "ORDER_CREATED",
                        AuditLog.user_id == admin.id,
                    )
                )
            ).scalars().all()
            assert rows, "expected ORDER_CREATED audit row"
            assert any(f"order:{order_id}" == (r.resource or "") for r in rows)

            status = await ac.patch(
                f"/api/v1/orders/{order_id}/status",
                headers=headers,
                json={"status": "NEW"},
            )
            assert status.status_code == 200, status.text
            await db.commit()
            changed = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "ORDER_STATUS_CHANGED",
                        AuditLog.user_id == admin.id,
                    )
                )
            ).scalars().all()
            assert changed
    finally:
        app.dependency_overrides.pop(get_db, None)
