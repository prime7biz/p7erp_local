"""ASGI + DB tests for quotation PUT money/FX governance (requires DATABASE_URL)."""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Customer, Quotation, Tenant, User
from app.models.tenant import TenantType
from app.models.user import Role


async def _seed_quotation_for_put(db):
  slug = uuid.uuid4().hex[:10]
  tenant = Tenant(
    name=f"QNorm {slug}",
    tenant_type=TenantType.both,
    is_active=True,
    company_code=f"qn{slug}"[:18],
  )
  db.add(tenant)
  await db.flush()
  role = Role(tenant_id=tenant.id, name="user", display_name="U", permissions={})
  db.add(role)
  await db.flush()
  user = User(
    tenant_id=tenant.id,
    role_id=role.id,
    username=f"qn{slug}",
    email=f"qn{slug}@e.com",
    password_hash="x",
    is_active=True,
  )
  db.add(user)
  await db.flush()
  customer = Customer(
    tenant_id=tenant.id,
    customer_code=f"N{slug}"[:10],
    name="C",
  )
  db.add(customer)
  await db.flush()
  q = Quotation(
    tenant_id=tenant.id,
    customer_id=customer.id,
    quotation_code=f"QN{slug}"[:14],
    currency="USD",
    target_price_currency="USD",
    status="DRAFT",
    material_cost="88.0000",
    manufacturing_cost="0.0000",
    other_cost="0.0000",
    total_cost="88.0000",
    cost_per_piece="0.8800",
    notes="seed",
  )
  db.add(q)
  await db.flush()
  return tenant, user, q


@pytest.mark.asyncio
async def test_put_without_cost_arrays_preserves_header_rollups(db_session_integration):
  db = db_session_integration
  tenant, user, q = await _seed_quotation_for_put(db)

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
      r = await ac.put(
        f"/api/v1/quotations/{q.id}",
        json={"notes": "updated note only"},
        headers={"X-Tenant-Id": str(tenant.id)},
      )
    assert r.status_code == 200, r.text
    await db.refresh(q)
    assert q.material_cost == "88.0000"
    assert q.total_cost == "88.0000"
    assert q.notes == "updated note only"
  finally:
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_put_fx_mismatch_without_rate_returns_422(db_session_integration):
  db = db_session_integration
  tenant, user, q = await _seed_quotation_for_put(db)

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
      r = await ac.put(
        f"/api/v1/quotations/{q.id}",
        json={
          "currency": "BDT",
          "target_price_currency": "EUR",
          "exchange_rate": "",
        },
        headers={"X-Tenant-Id": str(tenant.id)},
      )
    assert r.status_code == 422
    body = r.json()
    assert body.get("detail", {}).get("code") == "QUOTATION_FX_VALIDATION"
  finally:
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_put_invalid_material_total_amount_returns_422(db_session_integration):
  db = db_session_integration
  tenant, user, q = await _seed_quotation_for_put(db)

  async def override_db():
    yield db

  async def override_user():
    return user

  async def override_tenant():
    return tenant

  app.dependency_overrides[get_db] = override_db
  app.dependency_overrides[get_current_user] = override_user
  app.dependency_overrides[require_tenant] = override_tenant
  mat = {
    "serial_no": 1,
    "description": "Fabric",
    "unit": "YD",
    "consumption_per_dozen": "1",
    "unit_price": "1",
    "amount_per_dozen": "1",
    "total_amount": "not-a-number",
    "currency": "USD",
    "exchange_rate": "1",
    "base_amount": "0",
    "local_amount": "0",
  }
  try:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
      r = await ac.put(
        f"/api/v1/quotations/{q.id}",
        json={"materials": [mat]},
        headers={"X-Tenant-Id": str(tenant.id)},
      )
    assert r.status_code == 422
    assert r.json().get("detail", {}).get("code") == "QUOTATION_MONEY_VALIDATION"
  finally:
    app.dependency_overrides.clear()
