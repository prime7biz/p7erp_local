"""P5 regressions that must run through the real ``get_db`` (commit/rollback semantics)
plus cross-tenant isolation checks for finance, inventory and HR.

The real-DB test commits to the dev database and deletes its tenant afterwards.

Run:
docker compose exec backend pytest tests/test_p5_real_db_and_isolation.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import delete, select

from app.common.auth import get_current_user, hash_password
from app.common.tenant import require_tenant
from app.database import AsyncSessionLocal, get_db
from app.external_access.constants import FF_CUSTOMER_PORTAL_ENABLED, PRINCIPAL_CUSTOMER
from app.main import app
from app.models import ExternalPrincipal, Tenant
from app.models.finance import Voucher
from app.models.hr import Employee
from app.models.inventory import GoodsReceiving
from app.models.tenant import TenantType

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain


@pytest.mark.asyncio
async def test_external_failed_logins_persist_with_real_session(monkeypatch):
    """Regression: the failed-attempt counter used to be rolled back with the 401."""
    from app.config import get_settings
    from app.database import engine

    # The app engine's pool may hold connections from another test's event loop.
    await engine.dispose()
    settings = get_settings()
    monkeypatch.setattr(settings, "login_rate_limit_per_minute", 100)
    slug = uuid.uuid4().hex[:8]
    async with AsyncSessionLocal() as db:
        tenant = Tenant(
            name=f"P5 {slug}",
            tenant_type=TenantType.both,
            is_active=True,
            company_code=f"p5{slug}"[:18],
            feature_flags={FF_CUSTOMER_PORTAL_ENABLED: True},
        )
        db.add(tenant)
        await db.flush()
        principal = ExternalPrincipal(
            tenant_id=tenant.id,
            principal_type=PRINCIPAL_CUSTOMER,
            email=f"p5_{slug}@example.com",
            password_hash=await hash_password("RightPass123!"),
            full_name="P5 Buyer",
            is_active=True,
        )
        db.add(principal)
        await db.commit()
        tenant_id, principal_id, company_code, email = tenant.id, principal.id, tenant.company_code, principal.email

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            for _ in range(2):
                r = await ac.post(
                    "/api/external/auth/login",
                    json={
                        "company_code": company_code,
                        "email": email,
                        "password": "WrongPass!!",
                        "principal_type": PRINCIPAL_CUSTOMER,
                    },
                )
                assert r.status_code == 401, r.text
        async with AsyncSessionLocal() as db:
            count = (
                await db.execute(select(ExternalPrincipal.failed_login_count).where(ExternalPrincipal.id == principal_id))
            ).scalar_one()
        assert count == 2
    finally:
        async with AsyncSessionLocal() as db:
            await db.execute(delete(Tenant).where(Tenant.id == tenant_id))
            await db.commit()
        await engine.dispose()


def _as(db, user, tenant):
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
async def test_finance_inventory_hr_records_not_visible_cross_tenant(db_session_integration):
    db = db_session_integration
    t_a, _u_a, wh_a, vendor_a, _item_a = await seed_inventory_chain(db)
    t_b, u_b, _ = await create_admin_tenant_with_user(db)

    voucher = Voucher(
        tenant_id=t_a.id,
        voucher_number=f"JV-{uuid.uuid4().hex[:6]}",
        voucher_type="JOURNAL",
        voucher_date=date.today(),
        status="DRAFT",
    )
    grn = GoodsReceiving(
        tenant_id=t_a.id,
        grn_code=f"GRN-{uuid.uuid4().hex[:6]}",
        status="DRAFT",
        vendor_id=vendor_a.id,
        default_warehouse_id=wh_a.id,
        source_type="NON_PO",
    )
    emp = Employee(
        tenant_id=t_a.id,
        employee_code=f"E{uuid.uuid4().hex[:6]}",
        first_name="Iso",
        last_name="Lated",
        is_active=True,
    )
    db.add_all([voucher, grn, emp])
    await db.flush()
    await db.commit()

    _as(db, u_b, t_b)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            h = {"X-Tenant-Id": str(t_b.id)}
            for path in (
                f"/api/v1/finance/vouchers/{voucher.id}",
                f"/api/v1/inventory/goods-receiving/{grn.id}",
                f"/api/v1/hr/employees/{emp.id}",
            ):
                r = await ac.get(path, headers=h)
                assert r.status_code in (403, 404), f"{path} leaked across tenants: {r.status_code} {r.text}"
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_grn_rejects_other_tenants_item(db_session_integration):
    db = db_session_integration
    t_a, u_a, wh_a, vendor_a, _ = await seed_inventory_chain(db)
    _t_b, _u_b, _wh_b, _v_b, foreign_item = await seed_inventory_chain(db)
    await db.commit()
    _as(db, u_a, t_a)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/inventory/goods-receiving",
                headers={"X-Tenant-Id": str(t_a.id)},
                json={
                    "vendor_id": vendor_a.id,
                    "source_type": "NON_PO",
                    "non_po_reason": "test",
                    "items": [{"item_id": foreign_item.id, "warehouse_id": wh_a.id, "quantity": "1"}],
                },
            )
        assert r.status_code == 400, r.text
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_challan_list_filters_by_order_and_returns_order_ids(db_session_integration):
    from app.models import DeliveryChallan, DeliveryChallanOrder

    from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order

    db = db_session_integration
    tenant, user, _wh, _v, _item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _quote, order = await create_quotation_and_order(db, tenant, customer, style)
    linked = DeliveryChallan(tenant_id=tenant.id, challan_code=f"DC{uuid.uuid4().hex[:6]}", customer_name="B", status="DRAFT")
    other = DeliveryChallan(tenant_id=tenant.id, challan_code=f"DC{uuid.uuid4().hex[:6]}", customer_name="B", status="DRAFT")
    db.add_all([linked, other])
    await db.flush()
    db.add(DeliveryChallanOrder(tenant_id=tenant.id, delivery_challan_id=linked.id, order_id=order.id))
    await db.commit()
    _as(db, user, tenant)
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            r = await ac.get(
                f"/api/v1/inventory/delivery-challans?order_id={order.id}", headers={"X-Tenant-Id": str(tenant.id)}
            )
        assert r.status_code == 200, r.text
        rows = r.json()
        assert [row["id"] for row in rows] == [linked.id]
        assert rows[0]["order_ids"] == [order.id]
    finally:
        app.dependency_overrides.clear()


def test_decimal_passthrough_keeps_strings():
    from app.common.orm_numeric import decimal_money_passthrough

    assert decimal_money_passthrough(Decimal("5")) == "5.0000"
    assert decimal_money_passthrough("7.5") == "7.5"
    assert decimal_money_passthrough(None) is None
