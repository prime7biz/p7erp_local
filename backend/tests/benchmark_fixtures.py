"""Shared seeds for the Tally / Akij benchmark roadmap tests (docs/erp-benchmark/).

Run inside Docker: docker compose exec backend pytest tests/test_benchmark_*.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager

from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role


async def seed_tenant_admin(db, *, role_name: str = "admin", permissions: dict | None = None):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Bench {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"bm{slug}"[:18],
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name=role_name, display_name=role_name.title(), permissions=permissions or {})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"bm{slug}",
        email=f"bm{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return tenant, user


async def seed_item(db, tenant_id: int, *, code: str = "BM-I1", name: str = "Twill fabric"):
    """One inventory item (with category, unit) and a warehouse."""
    from app.models.costing import Item, ItemCategory, ItemUnit
    from app.models.inventory import Warehouse

    slug = uuid.uuid4().hex[:6]
    cat = ItemCategory(tenant_id=tenant_id, category_code=f"C{slug}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant_id, unit_code=f"U{slug}", name="Yard")
    wh = Warehouse(tenant_id=tenant_id, warehouse_code=f"W{slug}", name="Main store")
    db.add_all([cat, unit, wh])
    await db.flush()
    item = Item(tenant_id=tenant_id, item_code=code, name=name, category_id=cat.id, unit_id=unit.id)
    db.add(item)
    await db.flush()
    return item, wh, unit


@asynccontextmanager
async def api_client(db, tenant, user):
    """httpx client against the real app with DB / user / tenant dependencies overridden."""

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
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            ac.headers["X-Tenant-Id"] = str(tenant.id)
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_user, None)
        app.dependency_overrides.pop(require_tenant, None)
