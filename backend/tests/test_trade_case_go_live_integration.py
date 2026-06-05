"""Trade case happy-path HTTP test for go-live readiness."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_order_for_trade


@pytest.mark.asyncio
async def test_trade_case_create_transition_and_document(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    order = await seed_order_for_trade(db, tenant)
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
        transport = ASGITransport(app=app)
        headers = {"X-Tenant-Id": str(tenant.id)}
        ref = f"UAT-{uuid.uuid4().hex[:6]}"
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            cr = await ac.post(
                "/api/v1/trade-cases",
                headers=headers,
                json={
                    "direction": "EXPORT",
                    "reference": ref,
                    "order_id": order.id,
                    "current_stage": "DRAFT",
                },
            )
            assert cr.status_code == 201, cr.text
            case_id = cr.json()["id"]
            assert cr.json().get("current_stage") == "DRAFT"

            doc = await ac.post(
                f"/api/v1/trade-cases/{case_id}/documents",
                headers=headers,
                data={"document_type": "PI"},
                files={"file": ("pi.pdf", b"%PDF-1.4 test", "application/pdf")},
            )
            assert doc.status_code == 201, doc.text

            tr = await ac.post(
                f"/api/v1/trade-cases/{case_id}/transition",
                headers=headers,
                json={"to_stage": "COMMERCIAL", "notes": "UAT"},
            )
            assert tr.status_code == 200, tr.text
            assert tr.json().get("current_stage") == "COMMERCIAL"
    finally:
        app.dependency_overrides.clear()
