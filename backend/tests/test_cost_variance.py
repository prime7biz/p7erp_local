"""Owner cost visibility: variance math + tenant isolation for cost-variance APIs."""

from __future__ import annotations

from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Bom, BomItem, PurchaseOrder, PurchaseOrderItem
from app.models.costing import Item, ItemCategory, ItemUnit
from app.modules.merch.costing_variance_service import (
  build_order_cost_variance,
  compute_variance,
  variance_status,
)
from tests.merch_fixtures import (
  create_customer,
  create_garment_style,
  create_merch_tenant_with_user,
  create_quotation_and_order,
)


def test_variance_status_bands():
  assert variance_status(0) == "green"
  assert variance_status(3.0) == "green"
  assert variance_status(3.01) == "yellow"
  assert variance_status(10.0) == "yellow"
  assert variance_status(10.01) == "red"
  assert variance_status(-15.0) == "red"
  assert variance_status(None) == "unknown"


def test_compute_variance_basic():
  amount, pct, status = compute_variance(100.0, 112.0)
  assert amount == pytest.approx(12.0)
  assert pct == pytest.approx(12.0)
  assert status == "red"

  amount2, pct2, status2 = compute_variance(100.0, 102.0)
  assert status2 == "green"
  assert pct2 == pytest.approx(2.0)


async def _seed_item(db, tenant):
  slug = str(tenant.id)
  cat = ItemCategory(
    tenant_id=tenant.id,
    category_code=f"c{slug}"[:10],
    name="Fabric",
    is_active=True,
  )
  db.add(cat)
  await db.flush()
  unit = ItemUnit(
    tenant_id=tenant.id,
    unit_code=f"u{slug}"[:8],
    name="Yds",
    is_active=True,
  )
  db.add(unit)
  await db.flush()
  item = Item(
    tenant_id=tenant.id,
    item_code=f"IT{slug}"[:12],
    name="Main fabric",
    category_id=cat.id,
    unit_id=unit.id,
    default_cost=Decimal("1"),
    is_active=True,
  )
  db.add(item)
  await db.flush()
  return item


@pytest.mark.asyncio
async def test_cost_variance_calculation_and_tenant_isolation(db_session_integration):
  db = db_session_integration
  t1, u1, _ = await create_merch_tenant_with_user(db)
  t2, u2, _ = await create_merch_tenant_with_user(db)
  c1 = await create_customer(db, t1)
  c2 = await create_customer(db, t2)
  s1 = await create_garment_style(db, t1, c1)
  s2 = await create_garment_style(db, t2, c2)
  _q1, o1 = await create_quotation_and_order(db, t1, c1, s1)
  _q2, o2 = await create_quotation_and_order(db, t2, c2, s2)

  o1.commercial_snapshot_json = {
    "total_cost": "100.00",
    "quoted_price": "150.00",
    "profit_percentage": "50.00",
  }
  item = await _seed_item(db, t1)

  bom = Bom(
    tenant_id=t1.id,
    style_id=s1.id,
    order_id=o1.id,
    status="APPROVED",
    is_active=True,
    is_legacy=False,
    bom_code=f"BOM-{o1.id}",
  )
  db.add(bom)
  await db.flush()
  bi = BomItem(
    tenant_id=t1.id,
    bom_id=bom.id,
    item_id=item.id,
    category="FABRIC",
    item_code=item.item_code,
    description="Main fabric",
    base_consumption=Decimal("1"),
    quoted_unit_price=10.0,
    quoted_total_cost=100.0,
    required_gross_qty=10.0,
    sort_order=0,
  )
  db.add(bi)
  await db.flush()

  po = PurchaseOrder(
    tenant_id=t1.id,
    po_code=f"PO-{o1.id}",
    supplier_name="Vendor A",
    status="APPROVED",
    source_order_id=o1.id,
    source_bom_id=bom.id,
  )
  db.add(po)
  await db.flush()
  # Actual 120 vs tentative 100 → 20% → red
  poi = PurchaseOrderItem(
    tenant_id=t1.id,
    purchase_order_id=po.id,
    item_id=item.id,
    quantity=Decimal("10"),
    unit_price=Decimal("12"),
    source_order_id=o1.id,
    source_bom_id=bom.id,
    source_bom_line_id=bi.id,
  )
  db.add(poi)
  await db.flush()

  payload = await build_order_cost_variance(db, tenant_id=t1.id, order_id=o1.id)
  assert payload is not None
  assert payload["totals"]["status"] == "red"
  assert payload["totals"]["tentative_cost"] == pytest.approx(100.0)
  assert payload["totals"]["actual_cost"] == pytest.approx(120.0)
  assert payload["margin_impact"]["snapshot_quoted_price"] == pytest.approx(150.0)
  assert payload["margin_impact"]["estimated_margin_at_quote"] == pytest.approx(50.0)

  # Wrong tenant must not see the order
  assert await build_order_cost_variance(db, tenant_id=t2.id, order_id=o1.id) is None

  async def override_db():
    yield db

  async def override_user_t1():
    return u1

  async def override_tenant_t1():
    return t1

  app.dependency_overrides[get_db] = override_db
  app.dependency_overrides[get_current_user] = override_user_t1
  app.dependency_overrides[require_tenant] = override_tenant_t1
  try:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
      r = await client.get(f"/api/v1/orders/{o1.id}/cost-variance")
      assert r.status_code == 200, r.text
      body = r.json()
      assert body["totals"]["status"] == "red"
      assert len(body["rows"]) >= 1

      r_sum = await client.get("/api/v1/orders/profitability-summary")
      assert r_sum.status_code == 200, r_sum.text
      ids = {x["order_id"] for x in r_sum.json()["items"]}
      assert o1.id in ids
      assert o2.id not in ids

      r_pend = await client.get("/api/v1/orders/pending-price-verifications")
      assert r_pend.status_code == 200, r_pend.text
      pend_ids = {x["order_id"] for x in r_pend.json()}
      assert o1.id in pend_ids
      assert o2.id not in pend_ids

      # Cross-tenant order id → 404
      r404 = await client.get(f"/api/v1/orders/{o2.id}/cost-variance")
      assert r404.status_code == 404
  finally:
    app.dependency_overrides.clear()

  async def override_user_t2():
    return u2

  async def override_tenant_t2():
    return t2

  app.dependency_overrides[get_db] = override_db
  app.dependency_overrides[get_current_user] = override_user_t2
  app.dependency_overrides[require_tenant] = override_tenant_t2
  try:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
      r = await client.get(f"/api/v1/orders/{o1.id}/cost-variance")
      assert r.status_code == 404
  finally:
    app.dependency_overrides.clear()
