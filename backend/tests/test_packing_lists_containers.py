"""Phase 1.1 packing lists + shipment containers."""

from __future__ import annotations

import uuid
from datetime import date

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Customer, Order, PackingList, Shipment, Tenant, TradeCase, User
from app.models.tenant import TenantType
from app.models.user import Role


async def _seed(db):
    slug = uuid.uuid4().hex[:10]
    tenant = Tenant(
        name=f"Pack {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"pk{slug}"[:18],
        feature_flags={"trade_enabled": True},
    )
    db.add(tenant)
    await db.flush()
    role = Role(tenant_id=tenant.id, name="admin", display_name="Admin", permissions={})
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        username=f"pk{slug}",
        email=f"pk{slug}@e.com",
        password_hash="x",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(tenant_id=tenant.id, customer_code=f"C{slug}"[:10], name="Buyer")
    db.add(customer)
    await db.flush()
    order = Order(
        tenant_id=tenant.id,
        customer_id=customer.id,
        order_code=f"OR{slug}"[:14],
        status="CONFIRMED",
        quantity=10,
    )
    db.add(order)
    await db.flush()
    tc = TradeCase(
        tenant_id=tenant.id,
        reference=f"TC{slug}"[:16],
        direction="EXPORT",
        status="OPEN",
        order_id=order.id,
    )
    db.add(tc)
    await db.flush()
    ship = Shipment(
        tenant_id=tenant.id,
        trade_case_id=tc.id,
        reference=f"SH{slug}"[:16],
        status="PLANNED",
    )
    db.add(ship)
    await db.flush()
    return tenant, user, order, ship


@pytest.mark.asyncio
async def test_packing_list_containers_finalize_and_weights(db_session_integration):
    db = db_session_integration
    tenant, user, order, ship = await _seed(db)

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
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            headers = {"X-Tenant-Id": str(tenant.id)}
            pl = await ac.post(
                "/api/v1/logistics/packing-lists",
                headers=headers,
                json={
                    "order_id": order.id,
                    "shipment_id": ship.id,
                    "total_cartons": 12,
                    "gross_weight_kg": 100,
                    "net_weight_kg": 90,
                    "packing_date": date.today().isoformat(),
                },
            )
            assert pl.status_code == 201, pl.text
            body = pl.json()
            assert body["packing_list_number"].startswith("PL-")
            assert body["total_cartons"] == 12
            assert body["order_id"] == order.id
            assert body["gross_weight_kg"] == 100
            assert body["net_weight"] == 90
            pl_id = body["id"]

            # Finalize without containers → rejected
            bad_fin = await ac.put(
                f"/api/v1/logistics/packing-lists/{pl_id}/finalize",
                headers=headers,
            )
            assert bad_fin.status_code == 400
            assert "container" in bad_fin.json()["detail"].lower()

            c1 = await ac.post(
                f"/api/v1/logistics/packing-lists/{pl_id}/containers",
                headers=headers,
                json={
                    "container_number": "CONT-A",
                    "container_type": "40HQ",
                    "tare_weight_kg": 2000,
                    "max_weight_kg": 28000,
                    "loading_status": "LOADING",
                },
            )
            assert c1.status_code == 201, c1.text
            c1b = c1.json()
            assert c1b["packing_list_id"] == pl_id
            assert c1b["remaining_capacity_kg"] == 26000.0  # 28000 - 2000

            c2 = await ac.post(
                f"/api/v1/logistics/packing-lists/{pl_id}/containers",
                headers=headers,
                json={
                    "container_number": "CONT-B",
                    "container_type": "20GP",
                    "loading_status": "EMPTY",
                },
            )
            assert c2.status_code == 201, c2.text

            dup_c = await ac.post(
                f"/api/v1/logistics/packing-lists/{pl_id}/containers",
                headers=headers,
                json={"container_number": "CONT-A"},
            )
            assert dup_c.status_code == 400

            detail = await ac.get(
                f"/api/v1/logistics/packing-lists/{pl_id}",
                headers=headers,
            )
            assert detail.status_code == 200
            dbody = detail.json()
            assert dbody["container_count"] == 2
            assert len(dbody["containers"]) == 2
            assert dbody["order_code"] == order.order_code

            fin = await ac.put(
                f"/api/v1/logistics/packing-lists/{pl_id}/finalize",
                headers=headers,
            )
            assert fin.status_code == 200, fin.text
            assert fin.json()["status"] == "FINALIZED"

            # Cannot add after finalize
            after = await ac.post(
                f"/api/v1/logistics/packing-lists/{pl_id}/containers",
                headers=headers,
                json={"container_number": "CONT-C"},
            )
            assert after.status_code == 400
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_packing_tenant_isolation(db_session_integration):
    db = db_session_integration
    tenant, user, order, _ship = await _seed(db)
    other = Tenant(
        name="OtherPack",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"ot{uuid.uuid4().hex[:8]}"[:18],
    )
    db.add(other)
    await db.flush()
    pl = PackingList(
        tenant_id=tenant.id,
        packing_list_number="PL-ISO-1",
        order_id=order.id,
        total_cartons=1,
        status="DRAFT",
    )
    db.add(pl)
    await db.flush()

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
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            rows = await ac.get(
                "/api/v1/logistics/packing-lists",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert rows.status_code == 200
            assert all(r["tenant_id"] == tenant.id for r in rows.json())
            assert other.id != tenant.id

            # Same packing_list_number allowed on a different tenant.
            pl2 = PackingList(
                tenant_id=other.id,
                packing_list_number="PL-ISO-1",
                total_cartons=1,
                status="DRAFT",
            )
            db.add(pl2)
            await db.flush()
            assert pl2.id != pl.id
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_finalize_requires_total_cartons(db_session_integration):
    db = db_session_integration
    tenant, user, order, ship = await _seed(db)

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
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            headers = {"X-Tenant-Id": str(tenant.id)}
            pl = await ac.post(
                "/api/v1/logistics/packing-lists",
                headers=headers,
                json={"shipment_id": ship.id, "order_id": order.id, "total_cartons": 0},
            )
            assert pl.status_code == 201
            pl_id = pl.json()["id"]
            await ac.post(
                f"/api/v1/logistics/packing-lists/{pl_id}/containers",
                headers=headers,
                json={"container_number": "Z1", "container_type": "LCL"},
            )
            fin = await ac.put(
                f"/api/v1/logistics/packing-lists/{pl_id}/finalize",
                headers=headers,
            )
            assert fin.status_code == 400
            assert "total_cartons" in fin.json()["detail"].lower()
    finally:
        app.dependency_overrides.clear()
