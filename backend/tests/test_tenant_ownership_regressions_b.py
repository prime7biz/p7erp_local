"""Regression tests (batch B): client-supplied related-record IDs must belong to the caller's tenant.

Each case checks that a cross-tenant ID is rejected, nothing is persisted or changed, and the same
operation with the caller's own record still works.

Run: docker compose exec backend pytest tests/test_tenant_ownership_regressions_b.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import (
    AccountGroup,
    BankAccount,
    ChartOfAccount,
    Employee,
    ExportCase,
    Item,
    ItemCategory,
    ItemUnit,
    LeaveRequest,
    LeaveType,
    ManufacturingProductionPlanLine,
    MerchSampleRequest,
    StockGroup,
    TradeCase,
)
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


async def _two_tenants(db):
    t_a, u_a, _ = await create_merch_tenant_with_user(db)
    t_b, u_b, _ = await create_merch_tenant_with_user(db)
    return t_a, u_a, t_b, u_b


async def _order_for(db, tenant):
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    return order, style, customer


async def _ledger_for(db, tenant) -> ChartOfAccount:
    grp = AccountGroup(tenant_id=tenant.id, name="Test", code=f"G{uuid.uuid4().hex[:5]}", nature="asset")
    db.add(grp)
    await db.flush()
    acc = ChartOfAccount(tenant_id=tenant.id, account_number=f"9{uuid.uuid4().hex[:6]}", name="Acc", group_id=grp.id)
    db.add(acc)
    await db.flush()
    return acc


async def _item_for(db, tenant) -> Item:
    slug = uuid.uuid4().hex[:8]
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Cat")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Pcs")
    db.add_all([cat, unit])
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"IT{slug}"[:20],
        name=f"Item {slug}",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("1"),
    )
    db.add(item)
    await db.flush()
    return item


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


async def _count(db, model, *where) -> int:
    return int((await db.execute(select(func.count()).select_from(model).where(*where))).scalar() or 0)


# --- Inventory: stock group sales / purchase ledgers ---


@pytest.mark.asyncio
async def test_stock_group_rejects_foreign_sales_and_purchase_accounts(db_session_integration):
    db = db_session_integration
    t_a, _u_a, t_b, u_b = await _two_tenants(db)
    acc_a = await _ledger_for(db, t_a)
    acc_b = await _ledger_for(db, t_b)
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        for bad in ({"sales_account_id": acc_a.id}, {"purchase_account_id": acc_a.id}):
            r = await c.post("/api/v1/inventory/stock-groups", json={"name": "Grp", **bad})
            assert r.status_code == 400, r.text
        assert await _count(db, StockGroup, StockGroup.tenant_id == t_b.id) == 0

        r = await c.post(
            "/api/v1/inventory/stock-groups",
            json={"name": "Grp", "sales_account_id": acc_b.id, "purchase_account_id": acc_b.id},
        )
        assert r.status_code == 200, r.text
        group_id = r.json()["id"]

        r = await c.patch(f"/api/v1/inventory/stock-groups/{group_id}", json={"name": "Grp", "sales_account_id": acc_a.id})
        assert r.status_code == 400, r.text
        row = await db.get(StockGroup, group_id)
        await db.refresh(row)
        assert row.sales_account_id == acc_b.id


# --- Finance: bank account GL ledger ---


@pytest.mark.asyncio
async def test_bank_account_rejects_foreign_gl_account(db_session_integration):
    db = db_session_integration
    t_a, _u_a, t_b, u_b = await _two_tenants(db)
    acc_a = await _ledger_for(db, t_a)
    acc_b = await _ledger_for(db, t_b)
    await db.commit()
    body = {"account_name": "Main", "bank_name": "Bank", "account_number": uuid.uuid4().hex[:10]}
    async with _client(db, t_b, u_b) as c:
        r = await c.post("/api/v1/finance/banking/accounts", json={**body, "gl_account_id": acc_a.id})
        assert r.status_code == 400, r.text
        assert await _count(db, BankAccount, BankAccount.tenant_id == t_b.id) == 0

        r = await c.post("/api/v1/finance/banking/accounts", json={**body, "gl_account_id": acc_b.id})
        assert r.status_code == 200, r.text
        bank_id = r.json()["id"]

        r = await c.patch(f"/api/v1/finance/banking/accounts/{bank_id}", json={**body, "gl_account_id": acc_a.id})
        assert r.status_code == 400, r.text
        row = await db.get(BankAccount, bank_id)
        await db.refresh(row)
        assert row.gl_account_id == acc_b.id


# --- Manufacturing planning: production plan line order ---


@pytest.mark.asyncio
async def test_production_plan_rejects_foreign_order(db_session_integration):
    db = db_session_integration
    t_a, _u_a, t_b, u_b = await _two_tenants(db)
    order_a, _, _ = await _order_for(db, t_a)
    order_b, _, _ = await _order_for(db, t_b)
    item_b = await _item_for(db, t_b)
    await db.commit()
    today = date.today().isoformat()
    line = {"item_id": item_b.id, "planned_qty": 10}
    async with _client(db, t_b, u_b) as c:
        r = await c.post(
            "/api/v1/manufacturing/planning/production-plans",
            json={"period_start": today, "period_end": today, "lines": [{**line, "order_id": order_a.id}]},
        )
        assert r.status_code == 404, r.text
        assert (
            await _count(db, ManufacturingProductionPlanLine, ManufacturingProductionPlanLine.order_id == order_a.id)
            == 0
        )

        r = await c.post(
            "/api/v1/manufacturing/planning/production-plans",
            json={"period_start": today, "period_end": today, "lines": [{**line, "order_id": order_b.id}]},
        )
        assert r.status_code == 201, r.text


# --- Commercial: export case trade case ---


@pytest.mark.asyncio
async def test_export_case_rejects_foreign_trade_case(db_session_integration):
    db = db_session_integration
    t_a, _u_a, t_b, u_b = await _two_tenants(db)
    tc_a = TradeCase(tenant_id=t_a.id, reference=f"TC-{uuid.uuid4().hex[:6]}")
    tc_b = TradeCase(tenant_id=t_b.id, reference=f"TC-{uuid.uuid4().hex[:6]}")
    db.add_all([tc_a, tc_b])
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        r = await c.post("/api/v1/commercial/export-cases", json={"reference": "EXP-B", "trade_case_id": tc_a.id})
        assert r.status_code == 400, r.text
        assert await _count(db, ExportCase, ExportCase.tenant_id == t_b.id) == 0

        r = await c.post("/api/v1/commercial/export-cases", json={"reference": "EXP-B", "trade_case_id": tc_b.id})
        assert r.status_code == 201, r.text
        case_id = r.json()["id"]

        r = await c.patch(f"/api/v1/commercial/export-cases/{case_id}", json={"trade_case_id": tc_a.id})
        assert r.status_code == 400, r.text
        row = await db.get(ExportCase, case_id)
        await db.refresh(row)
        assert row.trade_case_id == tc_b.id


# --- Merch styles: PATCH buyer customer ---


@pytest.mark.asyncio
async def test_style_patch_rejects_foreign_buyer(db_session_integration):
    db = db_session_integration
    t_a, _u_a, t_b, u_b = await _two_tenants(db)
    cust_a = await create_customer(db, t_a)
    cust_b = await create_customer(db, t_b)
    style_b = await create_garment_style(db, t_b)
    await db.commit()
    async with _client(db, t_b, u_b) as c:
        r = await c.patch(f"/api/v1/merch/styles/{style_b.id}", json={"buyer_customer_id": cust_a.id})
        assert r.status_code == 404, r.text
        await db.refresh(style_b)
        assert style_b.buyer_customer_id is None

        r = await c.patch(f"/api/v1/merch/styles/{style_b.id}", json={"buyer_customer_id": cust_b.id})
        assert r.status_code == 200, r.text
        assert r.json()["buyer_customer_id"] == cust_b.id


# --- Merch samples: assignee user ---


@pytest.mark.asyncio
async def test_sample_rejects_foreign_assignee(db_session_integration):
    db = db_session_integration
    t_a, u_a, t_b, u_b = await _two_tenants(db)
    style_b = await create_garment_style(db, t_b)
    await db.commit()
    body = {"style_id": style_b.id, "sample_type": "proto"}
    async with _client(db, t_b, u_b) as c:
        r = await c.post("/api/v1/merch/samples", json={**body, "assigned_to_id": u_a.id})
        assert r.status_code == 404, r.text
        assert await _count(db, MerchSampleRequest, MerchSampleRequest.tenant_id == t_b.id) == 0

        r = await c.post("/api/v1/merch/samples", json={**body, "assigned_to_id": u_b.id})
        assert r.status_code == 201, r.text


# --- HR ESS: leave type on own leave request ---


@pytest.mark.asyncio
async def test_ess_leave_request_rejects_foreign_leave_type(db_session_integration):
    db = db_session_integration
    t_a, _u_a, t_b, u_b = await _two_tenants(db)
    lt_a = LeaveType(tenant_id=t_a.id, code=f"L{uuid.uuid4().hex[:5]}", name="Casual")
    lt_b = LeaveType(tenant_id=t_b.id, code=f"L{uuid.uuid4().hex[:5]}", name="Casual")
    emp_b = Employee(tenant_id=t_b.id, employee_code=f"E{uuid.uuid4().hex[:6]}", first_name="Ess", user_id=u_b.id)
    db.add_all([lt_a, lt_b, emp_b])
    await db.commit()
    workday = "2026-10-06"  # a Tuesday: a weekend-only request would be refused as 0 leave days
    body = {"from_date": workday, "to_date": workday}
    async with _client(db, t_b, u_b) as c:
        r = await c.post("/api/v1/hr/ess/my-leave-requests", json={**body, "leave_type_id": lt_a.id})
        assert r.status_code == 400, r.text
        assert await _count(db, LeaveRequest, LeaveRequest.employee_id == emp_b.id) == 0

        r = await c.post("/api/v1/hr/ess/my-leave-requests", json={**body, "leave_type_id": lt_b.id})
        assert r.status_code == 201, r.text
    assert await _count(db, LeaveRequest, LeaveRequest.employee_id == emp_b.id, LeaveRequest.leave_type_id == lt_b.id) == 1
