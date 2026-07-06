"""Platform readiness integration tests."""

from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.compliance import TenantStatutoryTaxConfig


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
async def test_compliance_tax_line_calculate(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_admin_tenant_with_user(db)
    db.add(
        TenantStatutoryTaxConfig(
            tenant_id=tenant.id,
            tax_code="VAT",
            rate_pct=Decimal("15"),
            is_active=True,
        )
    )
    await db.commit()

    _override_app(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/compliance/tax/calculate-line",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={"line_amount": "100.0000", "apply_vat": True},
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["vat_amount"] == "15.0000"
        assert data["gross_with_tax"] == "115.0000"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_compliance_bonded_warehouse_create(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_admin_tenant_with_user(db)
    _override_app(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/compliance/bonded-warehouse",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "reference_no": "BW-UAT-001",
                    "entry_type": "IMPORT",
                    "ud_no": "UD-123",
                    "up_no": "UP-456",
                    "value_bdt": "50000.0000",
                },
            )
        assert r.status_code == 200, r.text
        assert r.json()["reference_no"] == "BW-UAT-001"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_data_migration_customers_dry_run(db_session_integration):
    db = db_session_integration
    tenant, user, _role = await create_admin_tenant_with_user(db)
    _override_app(db, user, tenant)
    csv_body = "code,name,email\nCUST-01,Test Buyer,buyer@example.com\n"
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/data-migration/import",
                headers={"X-Tenant-Id": str(tenant.id)},
                data={"entity_type": "customers", "dry_run": "true"},
                files={"file": ("customers.csv", csv_body, "text/csv")},
            )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok_count"] == 1
        assert data["dry_run"] is True
    finally:
        app.dependency_overrides.clear()
