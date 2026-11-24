"""Inquiry Workbench Phase 1: ownership, terminal locks, clone, convert Decimal.

Run:
  docker compose exec backend pytest tests/test_inquiry_workbench_phase1.py -q
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Inquiry, InquiryItem
from tests.merch_fixtures import (
  create_customer,
  create_garment_style,
  create_merch_tenant_with_user,
)


@asynccontextmanager
async def _api(db, tenant, user):
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
    async with AsyncClient(
      transport=ASGITransport(app=app),
      base_url="http://test",
      headers={"X-Tenant-Id": str(tenant.id)},
    ) as client:
      yield client
  finally:
    app.dependency_overrides.clear()


async def _seed_open_inquiry(
  db, *, tenant=None, user=None, with_items: bool = True, status: str = "DRAFT"
):
  if tenant is None:
    tenant, user, _ = await create_merch_tenant_with_user(db)
  customer = await create_customer(db, tenant)
  style = await create_garment_style(db, tenant, customer)
  inquiry = Inquiry(
    tenant_id=tenant.id,
    customer_id=customer.id,
    inquiry_code=f"INQ-P1-{customer.id}",
    style_id=style.id,
    style_ref=style.style_code,
    season="SS26",
    quantity=500,
    target_price=Decimal("10.0000"),
    target_price_currency="EUR",
    currency="EUR",
    status=status,
    notes="Base notes",
  )
  db.add(inquiry)
  await db.flush()
  if with_items:
    db.add(
      InquiryItem(
        tenant_id=tenant.id,
        inquiry_id=inquiry.id,
        item_name="Tee",
        description="Basic tee",
        quantity=100,
        sort_order=1,
      )
    )
    await db.flush()
  return tenant, user, customer, style, inquiry


@pytest.mark.asyncio
async def test_create_inquiry_rejects_foreign_customer_and_style(db_session_integration):
  db = db_session_integration
  tenant, user, _ = await create_merch_tenant_with_user(db)
  other, _, _ = await create_merch_tenant_with_user(db)
  own_customer = await create_customer(db, tenant)
  own_style = await create_garment_style(db, tenant, own_customer)
  foreign_customer = await create_customer(db, other)
  foreign_style = await create_garment_style(db, other, foreign_customer)

  async with _api(db, tenant, user) as client:
    bad_customer = await client.post(
      "/api/v1/inquiries",
      json={
        "customer_id": foreign_customer.id,
        "style_id": own_style.id,
        "style_ref": "X",
      },
    )
    assert bad_customer.status_code == 404, bad_customer.text

    bad_style = await client.post(
      "/api/v1/inquiries",
      json={
        "customer_id": own_customer.id,
        "style_id": foreign_style.id,
        "style_ref": "X",
      },
    )
    assert bad_style.status_code == 404, bad_style.text


@pytest.mark.asyncio
async def test_update_blocks_status_and_terminal_inquiries(db_session_integration):
  db = db_session_integration
  tenant, user, _customer, _style, inquiry = await _seed_open_inquiry(db)

  async with _api(db, tenant, user) as client:
    status_via_patch = await client.patch(
      f"/api/v1/inquiries/{inquiry.id}",
      json={"status": "OPEN"},
    )
    assert status_via_patch.status_code == 400, status_via_patch.text
    assert "status" in status_via_patch.json()["detail"].lower()

    converted_block = await client.patch(
      f"/api/v1/inquiries/{inquiry.id}/status",
      json={"status": "CONVERTED"},
    )
    assert converted_block.status_code == 400, converted_block.text

  inquiry.status = "LOST"
  await db.flush()

  async with _api(db, tenant, user) as client:
    edit_terminal = await client.patch(
      f"/api/v1/inquiries/{inquiry.id}",
      json={"season": "FW26"},
    )
    assert edit_terminal.status_code == 409, edit_terminal.text


@pytest.mark.asyncio
async def test_clone_inquiry_copies_fields_and_items(db_session_integration):
  db = db_session_integration
  tenant, user, _customer, _style, inquiry = await _seed_open_inquiry(db)

  async with _api(db, tenant, user) as client:
    res = await client.post(f"/api/v1/inquiries/{inquiry.id}/clone")
    assert res.status_code == 201, res.text
    body = res.json()
    assert body["id"] != inquiry.id
    assert body["status"] == "DRAFT"
    assert body["inquiry_code"] != inquiry.inquiry_code
    assert body["customer_id"] == inquiry.customer_id
    assert body["style_id"] == inquiry.style_id
    assert body["season"] == "SS26"
    assert body["target_price_currency"] == "EUR"
    assert len(body["items"]) == 1
    assert body["items"][0]["item_name"] == "Tee"
    assert body["is_converted_to_quotation"] is False


@pytest.mark.asyncio
async def test_convert_from_inquiry_decimal_notes_and_idempotent(db_session_integration):
  db = db_session_integration
  tenant, user, _customer, _style, inquiry = await _seed_open_inquiry(
    db, status="SUBMITTED"
  )

  async with _api(db, tenant, user) as client:
    first = await client.post(f"/api/v1/quotations/from-inquiry/{inquiry.id}")
    assert first.status_code == 201, first.text
    q = first.json()
    assert Decimal(q["quoted_price"]) == Decimal("11.5000")
    assert "Base notes" in (q.get("notes") or "")
    assert "Season: SS26" in (q.get("notes") or "")
    assert "Tee" in (q.get("notes") or "")

    second = await client.post(f"/api/v1/quotations/from-inquiry/{inquiry.id}")
    assert second.status_code == 200, second.text
    assert second.json()["id"] == q["id"]

  await db.refresh(inquiry)
  assert inquiry.status == "CONVERTED"


@pytest.mark.asyncio
async def test_convert_rejects_cross_tenant_inquiry(db_session_integration):
  db = db_session_integration
  tenant_a, user_a, _c, _s, inquiry = await _seed_open_inquiry(db, status="SUBMITTED")
  tenant_b, user_b, _ = await create_merch_tenant_with_user(db)

  async with _api(db, tenant_b, user_b) as client:
    res = await client.post(f"/api/v1/quotations/from-inquiry/{inquiry.id}")
    assert res.status_code == 404, res.text

  async with _api(db, tenant_a, user_a) as client:
    # Still convertible by owner
    ok = await client.post(f"/api/v1/quotations/from-inquiry/{inquiry.id}")
    assert ok.status_code == 201, ok.text
