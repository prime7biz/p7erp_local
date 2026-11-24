"""Phase 5: job-work bond transfer + principal claim — flags, happy path, cross-tenant.

Run: docker compose exec -T backend pytest tests/test_job_work_bond_transfer.py -q
"""

from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user, hash_password
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Role, Tenant, User
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.customer import Customer
from app.models.job_work import JobWorkContract, JobWorkMaterial
from app.models.tenant import TenantType

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain

API = "/api/v1/material-control"


async def _api_client(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Tenant-Id": str(tenant.id)},
    )


def _clear():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


async def _seed_jw(db, *, physical: bool = True, jw: bool = True):
    slug = uuid.uuid4().hex[:10]
    flags = {}
    if physical:
        flags["material_physical_v1"] = True
    if jw:
        flags["inbound_job_work_v1"] = True
    tenant = Tenant(
        name=f"Bond {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"BN{slug}"[:18].upper(),
        feature_flags=flags,
        base_currency="BDT",
    )
    db.add(tenant)
    await db.flush()
    role = Role(
        tenant_id=tenant.id,
        name="admin",
        display_name="Admin",
        permissions={"*": True, "inventory.access": True},
    )
    db.add(role)
    await db.flush()
    user = User(
        tenant_id=tenant.id,
        role_id=role.id,
        email=f"bond_{slug}@example.com",
        username=f"bond_{slug}",
        password_hash=await hash_password("StrongPass123!"),
        is_active=True,
    )
    db.add(user)
    await db.flush()
    customer = Customer(
        tenant_id=tenant.id,
        customer_code=f"C{slug[:8]}",
        name=f"Principal {slug}",
        status="active",
    )
    db.add(customer)
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug[:6]}", name="Fabric")
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug[:6]}", name="Kg")
    db.add(cat)
    db.add(unit)
    await db.flush()
    item = Item(
        tenant_id=tenant.id,
        item_code=f"I{slug[:8]}",
        name="JW fabric",
        category_id=cat.id,
        unit_id=unit.id,
        default_cost=Decimal("0"),
        avg_cost=Decimal("0"),
    )
    db.add(item)
    await db.flush()
    contract = JobWorkContract(
        tenant_id=tenant.id,
        contract_no=f"JWC-{slug[:6]}",
        customer_id=customer.id,
        status="ACTIVE",
        cm_rate="0",
        currency="BDT",
        contract_date=date.today(),
        created_by_user_id=user.id,
    )
    db.add(contract)
    await db.flush()
    material = JobWorkMaterial(
        tenant_id=tenant.id,
        contract_id=contract.id,
        item_id=item.id,
        consumption_per_unit="1",
        qty_planned="100",
        qty_received="100",
    )
    db.add(material)
    await db.commit()
    return tenant, user, customer, contract, material, item


@pytest.mark.asyncio
async def test_bond_404_when_flag_off(db_session_integration):
    db = db_session_integration
    tenant, user, _c, contract, material, _i = await _seed_jw(db, physical=False, jw=True)
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/bond-transfers",
                json={
                    "contract_id": contract.id,
                    "lines": [{"material_id": material.id, "qty": "5"}],
                },
            )
            assert res.status_code == 404, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_bond_happy_path_qty_only(db_session_integration):
    db = db_session_integration
    tenant, user, customer, contract, material, _i = await _seed_jw(db)
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/bond-transfers",
                json={
                    "contract_id": contract.id,
                    "lines": [{"material_id": material.id, "qty": "8"}],
                    "request_id": "bond-1",
                },
            )
            assert res.status_code == 200, res.text
            body = res.json()
            assert body["status"] == "POSTED"
            assert body["contract_id"] == contract.id

            get_res = await ac.get(f"{API}/bond-transfers/{body['id']}")
            assert get_res.status_code == 200

            claim = await ac.post(
                f"{API}/principal-claims",
                json={
                    "customer_id": customer.id,
                    "contract_id": contract.id,
                    "amount": "100.00",
                    "request_id": "claim-1",
                },
            )
            assert claim.status_code == 200, claim.text
            settle = await ac.post(
                f"{API}/principal-claims/{claim.json()['id']}/settle",
                json={"amount": "100.00"},
            )
            assert settle.status_code == 200, settle.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_bond_cross_tenant_denied(db_session_integration):
    db = db_session_integration
    tenant, user, _c, contract, material, _i = await _seed_jw(db)
    other, other_user, _ = await create_admin_tenant_with_user(db)
    oflags = dict(other.feature_flags or {})
    oflags["material_physical_v1"] = True
    oflags["inbound_job_work_v1"] = True
    other.feature_flags = oflags
    await db.commit()

    try:
        async with await _api_client(db, other, other_user) as ac:
            res = await ac.post(
                f"{API}/bond-transfers",
                json={
                    "contract_id": contract.id,
                    "lines": [{"material_id": material.id, "qty": "1"}],
                },
            )
            assert res.status_code in (404, 400), res.text
    finally:
        _clear()
