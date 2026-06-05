"""DB + ASGI tests for order commercial snapshot and alignment (requires DATABASE_URL)."""

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


async def _seed_quotation_for_order(db):
  slug = uuid.uuid4().hex[:10]
  tenant = Tenant(
    name=f"Snap {slug}",
    tenant_type=TenantType.both,
    is_active=True,
    company_code=f"sn{slug}"[:18],
    feature_flags={"commercial_book_currency": "BDT"},
  )
  db.add(tenant)
  await db.flush()
  role = Role(tenant_id=tenant.id, name="user", display_name="U", permissions={})
  db.add(role)
  await db.flush()
  user = User(
    tenant_id=tenant.id,
    role_id=role.id,
    username=f"sn{slug}",
    email=f"sn{slug}@e.com",
    password_hash="x",
    is_active=True,
  )
  db.add(user)
  await db.flush()
  customer = Customer(
    tenant_id=tenant.id,
    customer_code=f"S{slug}"[:10],
    name="C",
  )
  db.add(customer)
  await db.flush()
  q = Quotation(
    tenant_id=tenant.id,
    customer_id=customer.id,
    quotation_code=f"SN{slug}"[:14],
    currency="USD",
    target_price_currency="EUR",
    exchange_rate="120",
    quoted_price="500.00",
    total_amount="500.00",
    total_cost="400.0000",
    projected_quantity=1000,
    status="SENT",
  )
  db.add(q)
  await db.flush()
  return tenant, user, q


@pytest.mark.asyncio
async def test_create_order_from_quotation_stores_snapshot_and_qty(db_session_integration):
  db = db_session_integration
  tenant, user, q = await _seed_quotation_for_order(db)

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
      r = await ac.post(
        f"/api/v1/orders/from-quotation/{q.id}",
        headers={"X-Tenant-Id": str(tenant.id)},
      )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body.get("quantity") == 1000
    snap = body.get("commercial_snapshot")
    assert isinstance(snap, dict)
    assert snap.get("document_currency") == "USD"
    assert snap.get("commercial_book_currency") == "BDT"
    assert snap.get("quoted_price") in {"500.00", "500.0000"}
  finally:
    app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_order_commercial_alignment_endpoint(db_session_integration):
  db = db_session_integration
  tenant, user, q = await _seed_quotation_for_order(db)

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
      cr = await ac.post(
        f"/api/v1/orders/from-quotation/{q.id}",
        headers={"X-Tenant-Id": str(tenant.id)},
      )
      oid = cr.json()["id"]
      ar = await ac.get(
        f"/api/v1/orders/{oid}/commercial-alignment",
        headers={"X-Tenant-Id": str(tenant.id)},
      )
    assert ar.status_code == 200
    data = ar.json()
    assert data["commercial_book_currency"] == "BDT"
    assert data["quotation_commercially_locked"] is True
    assert isinstance(data.get("frozen_at_conversion"), dict)
    assert isinstance(data.get("live_quotation"), dict)
  finally:
    app.dependency_overrides.clear()
