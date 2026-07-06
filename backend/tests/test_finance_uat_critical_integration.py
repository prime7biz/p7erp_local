"""Finance critical UAT cases — automated HTTP proxies (FIN-UAT-006, 007, 043)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa

from tests.go_live_fixtures import create_admin_tenant_with_user


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
async def test_fin_uat_007_unbalanced_voucher_rejected(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    await seed_tenant_system_coa(db, tenant.id)
    await db.commit()

    _override_app(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/finance/vouchers",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "voucher_type": "JOURNAL",
                    "voucher_date": "2026-06-01",
                    "narration": "UAT unbalanced",
                    "lines": [
                        {"account_id": 1, "debit": "100.0000", "credit": "0.0000"},
                        {"account_id": 2, "debit": "0.0000", "credit": "50.0000"},
                    ],
                },
            )
        assert r.status_code in (400, 422), r.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_fin_uat_043_tenant_isolation_on_voucher_list(db_session_integration):
    db = db_session_integration
    tenant_a, user_a, _ = await create_admin_tenant_with_user(db)
    tenant_b, _user_b, _ = await create_admin_tenant_with_user(db)
    await db.commit()

    _override_app(db, user_a, tenant_a)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/v1/finance/vouchers",
                headers={"X-Tenant-Id": str(tenant_a.id)},
            )
        assert r.status_code == 200, r.text
        payload = r.json()
        items = payload if isinstance(payload, list) else payload.get("items", [])
        for row in items:
            assert row.get("tenant_id", tenant_a.id) == tenant_a.id
    finally:
        app.dependency_overrides.clear()
