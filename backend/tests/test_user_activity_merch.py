"""Merch User Activity: inquiry and quotation create write audit rows.

Run:
  docker compose exec backend pytest tests/test_user_activity_merch.py -q
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import AuditLog
from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style


@pytest.mark.asyncio
async def test_inquiry_and_quotation_create_write_activity(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    await db.commit()

    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        headers = {"X-Tenant-Id": str(tenant.id)}
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            inq = await ac.post(
                "/api/v1/inquiries",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "style_id": style.id,
                    "style_ref": style.style_code or "STY-ACT",
                    "quantity": 100,
                },
            )
            assert inq.status_code == 201, inq.text
            inq_id = inq.json()["id"]

            inq_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "INQUIRY_CREATED",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"inquiry:{inq_id}" for r in inq_rows)

            quo = await ac.post(
                "/api/v1/quotations",
                headers=headers,
                json={
                    "customer_id": customer.id,
                    "inquiry_id": inq_id,
                    "style_id": style.id,
                    "style_ref": style.style_code or "STY-ACT",
                    "currency": "USD",
                    "total_amount": "10.00",
                },
            )
            assert quo.status_code == 201, quo.text
            quo_id = quo.json()["id"]

            quo_rows = (
                await db.execute(
                    select(AuditLog).where(
                        AuditLog.tenant_id == tenant.id,
                        AuditLog.action == "QUOTATION_CREATED",
                        AuditLog.user_id == user.id,
                    )
                )
            ).scalars().all()
            assert any(r.resource == f"quotation:{quo_id}" for r in quo_rows)
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
