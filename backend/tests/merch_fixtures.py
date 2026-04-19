"""Shared seeds for merchandising integration tests.

Run tests with DATABASE_URL (e.g. docker compose exec backend pytest tests/test_merch_tenant_isolation.py -q).
If `roles.is_system` is missing (DB before migration 160), Role ORM insert is retried with raw SQL.
"""

from __future__ import annotations

import json
import uuid
from types import SimpleNamespace
from typing import Any

import sqlalchemy as sa
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Bom, Customer, GarmentStyle, Order, Quotation, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role


async def _create_role_for_tenant(
    db: AsyncSession,
    *,
    tenant_id: int,
    name: str,
    display_name: str,
    permissions: dict,
) -> Role | Any:
    try:
        async with db.begin_nested():
            role = Role(
                tenant_id=tenant_id,
                name=name,
                display_name=display_name,
                is_system=False,
                permissions=permissions,
            )
            db.add(role)
            await db.flush()
            return role
    except Exception as e:
        # asyncpg may wrap UndefinedColumnError; match message for pre-migration DBs.
        msg = str(e).lower()
        if "is_system" not in msg:
            raise
        res = await db.execute(
            sa.text(
                """
                INSERT INTO roles (tenant_id, name, display_name, permissions)
                VALUES (:tid, :nm, :dn, CAST(:perm AS JSON))
                RETURNING id
                """
            ),
            {
                "tid": tenant_id,
                "nm": name,
                "dn": display_name,
                "perm": json.dumps(permissions),
            },
        )
        role_id = res.scalar_one()
        # Do not db.get(Role): ORM SELECT includes is_system and fails if column missing.
        return SimpleNamespace(id=role_id)


async def create_merch_tenant_with_user(
    db: AsyncSession,
    *,
    permissions: dict | None = None,
) -> tuple[Tenant, User, Role | Any]:
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"MerchTest {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"mt{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    perms = permissions if permissions is not None else {"*": True}
    role = await _create_role_for_tenant(
        db,
        tenant_id=tenant.id,
        name="merch_tester",
        display_name="Merch Tester",
        permissions=perms,
    )
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"mtu{slug}",
        email=f"mtu{slug}@example.com",
        password_hash="unused",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user, role


async def create_customer(db: AsyncSession, tenant: Tenant) -> Customer:
    slug = uuid.uuid4().hex[:6]
    c = Customer(
        tenant_id=tenant.id,
        customer_code=f"MC{slug}"[:12],
        name=f"Buyer {slug}",
        status="active",
    )
    db.add(c)
    await db.flush()
    return c


async def create_garment_style(db: AsyncSession, tenant: Tenant, customer: Customer | None = None) -> GarmentStyle:
    slug = uuid.uuid4().hex[:6]
    s = GarmentStyle(
        tenant_id=tenant.id,
        style_code=f"ST-{slug}",
        name=f"Style {slug}",
        buyer_customer_id=customer.id if customer else None,
        status="ACTIVE",
    )
    db.add(s)
    await db.flush()
    return s


async def create_legacy_bom(
    db: AsyncSession,
    tenant: Tenant,
    style: GarmentStyle,
    *,
    status: str = "DRAFT",
    customer: Customer | None = None,
) -> Bom:
    b = Bom(
        tenant_id=tenant.id,
        style_id=style.id,
        status=status,
        is_legacy=True,
        is_active=True,
        customer_id=customer.id if customer else None,
        bom_code=f"BOM-{uuid.uuid4().hex[:8]}",
    )
    db.add(b)
    await db.flush()
    return b


async def create_quotation_and_order(
    db: AsyncSession,
    tenant: Tenant,
    customer: Customer,
    style: GarmentStyle,
) -> tuple[Quotation, Order]:
    slug = uuid.uuid4().hex[:8]
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_code=f"Q-{slug}"[:16],
        style_id=style.id,
        status="NEW",
        currency="USD",
    )
    db.add(q)
    await db.flush()
    o = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        quotation_id=q.id,
        order_code=f"O-{slug}"[:16],
        style_id=style.id,
        status="NEW",
        quantity=100,
    )
    db.add(o)
    await db.flush()
    return q, o
