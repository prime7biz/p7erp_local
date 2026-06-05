"""Shared seeds for go-live HTTP integration tests (HR, trade, inventory)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, Order, Tenant, User, Warehouse, Vendor
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.hr import Employee
from app.models.hr_leave import LeaveBalance, LeaveType
from app.models.hr_payroll import PayrollPeriod
from app.models.tenant import TenantType
from app.models.user import Role

from tests.merch_fixtures import _create_role_for_tenant, create_customer, create_garment_style, create_quotation_and_order


async def create_admin_tenant_with_user(
    db: AsyncSession,
    *,
    tenant_type: TenantType = TenantType.both,
    permissions: dict | None = None,
) -> tuple[Tenant, User, Role | object]:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"GoLive {slug}",
        tenant_type=tenant_type,
        is_active=True,
        company_code=f"gl{slug}"[:18],
        feature_flags={"trade_enabled": True},
    )
    db.add(tenant)
    await db.flush()
    perms = permissions if permissions is not None else {"*": True}
    role = await _create_role_for_tenant(
        db,
        tenant_id=tenant.id,
        name="admin",
        display_name="Admin",
        permissions=perms,
    )
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"glu{slug}",
        email=f"glu{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user, role


async def seed_hr_leave_approval_context(db: AsyncSession) -> tuple[Tenant, User, Employee, LeaveType]:
    tenant, user, _ = await create_admin_tenant_with_user(db)
    emp = Employee(
        tenant_id=tenant.id,
        employee_code=f"E{uuid.uuid4().hex[:6]}",
        first_name="Test",
        last_name="Worker",
        is_active=True,
    )
    db.add(emp)
    await db.flush()
    leave_type = LeaveType(
        tenant_id=tenant.id,
        code="AL",
        name="Annual",
        requires_approval=True,
        is_active=True,
    )
    db.add(leave_type)
    await db.flush()
    db.add(
        LeaveBalance(
            tenant_id=tenant.id,
            employee_id=emp.id,
            leave_type_id=leave_type.id,
            balance_year=date.today().year,
            allocated_days="10",
            used_days="0",
            pending_days="0",
            closing_balance_days="10",
        )
    )
    await db.flush()
    return tenant, user, emp, leave_type


async def seed_payroll_period(db: AsyncSession, tenant: Tenant) -> PayrollPeriod:
    start = date.today().replace(day=1)
    end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    period = PayrollPeriod(
        tenant_id=tenant.id,
        period_code=f"P{uuid.uuid4().hex[:6]}",
        start_date=start,
        end_date=end,
        payment_date=end,
        is_locked=False,
        status="OPEN",
    )
    db.add(period)
    await db.flush()
    return period


async def seed_inventory_chain(db: AsyncSession) -> tuple[Tenant, User, Warehouse, Vendor, Item]:
    tenant, user, _ = await create_admin_tenant_with_user(db)
    wh = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"WH{uuid.uuid4().hex[:4]}",
        name="Main WH",
        is_active=True,
    )
    db.add(wh)
    await db.flush()
    tenant.default_rm_warehouse_id = wh.id
    cat = ItemCategory(
        tenant_id=tenant.id,
        category_code=f"C{uuid.uuid4().hex[:4]}",
        name="Fabric",
        is_active=True,
    )
    db.add(cat)
    await db.flush()
    unit = ItemUnit(
        tenant_id=tenant.id,
        unit_code="PCS",
        name="Pieces",
        is_active=True,
    )
    db.add(unit)
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"I{uuid.uuid4().hex[:6]}",
        name="Cotton Roll",
        category_id=cat.id,
        unit_id=unit.id,
        default_warehouse_id=wh.id,
        default_cost=Decimal("10"),
        is_active=True,
    )
    db.add(item)
    vendor = Vendor(
        tenant_id=tenant.id,
        vendor_code=f"V{uuid.uuid4().hex[:4]}",
        name="Supplier A",
        is_active=True,
    )
    db.add(vendor)
    await db.flush()
    return tenant, user, wh, vendor, item


async def seed_order_for_trade(db: AsyncSession, tenant: Tenant) -> Order:
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    return order
