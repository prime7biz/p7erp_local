"""Inquiry Workbench Phase 3: related endpoint, samples filter, global search.

Run:
  docker compose exec backend pytest tests/test_inquiry_workbench_phase3.py -q
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
from app.models import Inquiry, InquiryEvent, Quotation
from app.models.merch import MerchSampleRequest
from tests.merch_fixtures import (
  create_customer,
  create_garment_style,
  create_legacy_bom,
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


async def _seed_inquiry(db, tenant, customer, style, *, brand: str = "Phase3Brand", code_suffix: str | None = None):
  import uuid

  suffix = code_suffix or uuid.uuid4().hex[:8]
  inquiry = Inquiry(
    tenant_id=tenant.id,
    customer_id=customer.id,
    style_id=style.id,
    inquiry_code=f"INQ-P3-{suffix}"[:32],
    style_ref=style.style_code,
    brand=brand,
    season="SS26",
    department="Kids",
    quantity=1200,
    status="DRAFT",
  )
  db.add(inquiry)
  await db.flush()
  db.add(
    InquiryEvent(
      tenant_id=tenant.id,
      inquiry_id=inquiry.id,
      event_type="CREATED",
      to_status="DRAFT",
      notes="seed",
    )
  )
  await db.flush()
  return inquiry


@pytest.mark.asyncio
async def test_inquiry_related_payload_and_cross_tenant_404(db_session_integration):
  db = db_session_integration
  tenant, user, _ = await create_merch_tenant_with_user(db)
  customer = await create_customer(db, tenant)
  style = await create_garment_style(db, tenant, customer)
  style.standard_smv = Decimal("12.5000")
  style.standard_smv_confidence = "HIGH"
  await db.flush()
  bom = await create_legacy_bom(db, tenant, style, status="APPROVED", customer=customer)
  inquiry = await _seed_inquiry(db, tenant, customer, style)

  quotation = Quotation(
    tenant_id=tenant.id,
    customer_id=customer.id,
    inquiry_id=inquiry.id,
    quotation_code=f"Q-P3-{inquiry.id}",
    style_id=style.id,
    status="DRAFT",
    currency="USD",
    quoted_price=Decimal("4.2500"),
    version_no=1,
  )
  db.add(quotation)
  await db.flush()

  sample = MerchSampleRequest(
    tenant_id=tenant.id,
    style_id=style.id,
    inquiry_id=inquiry.id,
    sample_code=f"SMP-P3-{inquiry.id}",
    sample_type="proto",
    status="requested",
  )
  db.add(sample)
  await db.flush()

  other_tenant, other_user, _ = await create_merch_tenant_with_user(db)
  await db.commit()

  async with _api(db, tenant, user) as client:
    res = await client.get(f"/api/v1/inquiries/{inquiry.id}/related")
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["customer"]["id"] == customer.id
    assert body["customer"]["customer_code"] == customer.customer_code
    assert body["style"]["id"] == style.id
    assert body["style"]["bom_count"] >= 1
    assert body["style"]["latest_bom_id"] == bom.id
    assert body["style"]["latest_bom_status"] == "APPROVED"
    assert body["style"]["estimated_sah"] is not None
    assert Decimal(body["style"]["estimated_sah"]) == Decimal("250.0000")  # 1200 * 12.5 / 60
    assert len(body["quotations"]) == 1
    assert body["quotations"][0]["quotation_code"] == quotation.quotation_code
    assert body["quotations"][0]["quoted_price"] == "4.2500"
    assert len(body["samples"]) == 1
    assert body["samples"][0]["sample_code"] == sample.sample_code
    assert body["can_view_tentative_bookings"] is False
    assert body["tentative_bookings"] == []
    assert len(body["timeline"]) >= 1

  async with _api(db, other_tenant, other_user) as client:
    denied = await client.get(f"/api/v1/inquiries/{inquiry.id}/related")
    assert denied.status_code == 404


@pytest.mark.asyncio
async def test_samples_filter_by_inquiry_id(db_session_integration):
  db = db_session_integration
  tenant, user, _ = await create_merch_tenant_with_user(db)
  customer = await create_customer(db, tenant)
  style = await create_garment_style(db, tenant, customer)
  inquiry = await _seed_inquiry(db, tenant, customer, style, brand="SampleFilter", code_suffix="sf1")
  other = await _seed_inquiry(db, tenant, customer, style, brand="Other", code_suffix="sf2")

  match = MerchSampleRequest(
    tenant_id=tenant.id,
    style_id=style.id,
    inquiry_id=inquiry.id,
    sample_code=f"SMP-MATCH-{inquiry.id}",
    sample_type="proto",
    status="requested",
  )
  other_sample = MerchSampleRequest(
    tenant_id=tenant.id,
    style_id=style.id,
    inquiry_id=other.id,
    sample_code=f"SMP-OTHER-{other.id}",
    sample_type="proto",
    status="requested",
  )
  db.add_all([match, other_sample])
  await db.commit()

  async with _api(db, tenant, user) as client:
    res = await client.get(f"/api/v1/merch/samples?inquiry_id={inquiry.id}")
    assert res.status_code == 200, res.text
    rows = res.json()
    assert len(rows) == 1
    assert rows[0]["id"] == match.id
    assert rows[0]["inquiry_id"] == inquiry.id


@pytest.mark.asyncio
async def test_global_search_finds_inquiry_by_brand(db_session_integration):
  db = db_session_integration
  tenant, user, _ = await create_merch_tenant_with_user(db)
  customer = await create_customer(db, tenant)
  style = await create_garment_style(db, tenant, customer)
  brand_tag = f"P3Brand{tenant.id}"
  inquiry = await _seed_inquiry(db, tenant, customer, style, brand=brand_tag)
  await db.commit()

  async with _api(db, tenant, user) as client:
    res = await client.get("/api/v1/search", params={"q": brand_tag})
    assert res.status_code == 200, res.text
    groups = res.json().get("groups") or []
    inquiry_group = next((g for g in groups if g.get("kind") == "inquiry"), None)
    assert inquiry_group is not None, res.text
    hit_ids = {h["id"] for h in inquiry_group.get("hits") or []}
    assert inquiry.id in hit_ids
    assert any(h.get("href") == f"/app/inquiries/{inquiry.id}" for h in inquiry_group["hits"])


@pytest.mark.asyncio
async def test_paginated_list_filters_inquiry_type_and_dates(db_session_integration):
  from datetime import date, datetime, timedelta

  db = db_session_integration
  tenant, user, _ = await create_merch_tenant_with_user(db)
  customer = await create_customer(db, tenant)
  style = await create_garment_style(db, tenant, customer)
  match = await _seed_inquiry(db, tenant, customer, style, brand="ListFilter", code_suffix="lf1")
  match.inquiry_type = "QUOTATION"
  match.created_at = datetime.utcnow() - timedelta(days=1)
  other = await _seed_inquiry(db, tenant, customer, style, brand="ListOther", code_suffix="lf2")
  other.inquiry_type = "REPEAT_ORDER"
  await db.commit()

  async with _api(db, tenant, user) as client:
    by_type = await client.get(
      "/api/v1/inquiries/paginated",
      params={"inquiry_type": "QUOTATION", "page": 1, "page_size": 50},
    )
    assert by_type.status_code == 200, by_type.text
    type_ids = {row["id"] for row in by_type.json()["items"]}
    assert match.id in type_ids
    assert other.id not in type_ids

    day = (datetime.utcnow() - timedelta(days=1)).date().isoformat()
    by_date = await client.get(
      "/api/v1/inquiries/paginated",
      params={"created_from": day, "created_to": day, "page": 1, "page_size": 50},
    )
    assert by_date.status_code == 200, by_date.text
    date_ids = {row["id"] for row in by_date.json()["items"]}
    assert match.id in date_ids
