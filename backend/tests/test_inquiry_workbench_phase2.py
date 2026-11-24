"""Inquiry Workbench Phase 2: product fields roundtrip + tech file MIME guard.

Run:
  docker compose exec backend pytest tests/test_inquiry_workbench_phase2.py -q
"""

from __future__ import annotations

from contextlib import asynccontextmanager
from decimal import Decimal
from io import BytesIO

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import Inquiry
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


@pytest.mark.asyncio
async def test_inquiry_product_fields_create_update_clone_roundtrip(db_session_integration):
  db = db_session_integration
  tenant, user, _ = await create_merch_tenant_with_user(db)
  customer = await create_customer(db, tenant)
  style = await create_garment_style(db, tenant, customer)

  async with _api(db, tenant, user) as client:
    created = await client.post(
      "/api/v1/inquiries",
      json={
        "customer_id": customer.id,
        "style_id": style.id,
        "style_ref": style.style_code,
        "inquiry_type": "SAMPLE_DEVELOPMENT",
        "brand": "Acme Kids",
        "season_year": "2026",
        "material_composition": "100% Cotton",
        "size_range": "2-8Y",
        "color_options": ["Navy", "White"],
        "country_of_origin": "BD",
        "special_requirements": "Azo free",
        "contact_person": "Alex Buyer",
        "department": "Kids",
      },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["inquiry_type"] == "SAMPLE_DEVELOPMENT"
    assert body["brand"] == "Acme Kids"
    assert body["season_year"] == "2026"
    assert body["material_composition"] == "100% Cotton"
    assert body["size_range"] == "2-8Y"
    assert body["color_options"] == ["Navy", "White"]
    assert body["country_of_origin"] == "BD"
    assert body["special_requirements"] == "Azo free"
    assert body["contact_person"] == "Alex Buyer"
    assert body["technical_files"] == []

    patched = await client.patch(
      f"/api/v1/inquiries/{body['id']}",
      json={
        "brand": "Acme Men",
        "inquiry_type": "QUOTATION",
        "color_options": ["Black"],
      },
    )
    assert patched.status_code == 200, patched.text
    assert patched.json()["brand"] == "Acme Men"
    assert patched.json()["inquiry_type"] == "QUOTATION"
    assert patched.json()["color_options"] == ["Black"]

    cloned = await client.post(f"/api/v1/inquiries/{body['id']}/clone")
    assert cloned.status_code == 201, cloned.text
    clone_body = cloned.json()
    assert clone_body["id"] != body["id"]
    assert clone_body["brand"] == "Acme Men"
    assert clone_body["inquiry_type"] == "QUOTATION"
    assert clone_body["material_composition"] == "100% Cotton"
    assert clone_body["color_options"] == ["Black"]
    assert clone_body["technical_files"] == []


@pytest.mark.asyncio
async def test_inquiry_tech_file_rejects_ext_mime_mismatch(db_session_integration):
  db = db_session_integration
  tenant, user, _ = await create_merch_tenant_with_user(db)
  customer = await create_customer(db, tenant)
  style = await create_garment_style(db, tenant, customer)
  inquiry = Inquiry(
    tenant_id=tenant.id,
    customer_id=customer.id,
    inquiry_code=f"INQ-P2-{customer.id}",
    style_id=style.id,
    style_ref=style.style_code,
    status="DRAFT",
    target_price=Decimal("1.0000"),
  )
  db.add(inquiry)
  await db.flush()

  async with _api(db, tenant, user) as client:
    bad = await client.post(
      f"/api/v1/inquiries/{inquiry.id}/technical-files",
      files={"file": ("notes.pdf", BytesIO(b"%PDF-1.4 fake"), "image/png")},
    )
    assert bad.status_code == 400, bad.text
    assert "match" in bad.json()["detail"].lower() or "extension" in bad.json()["detail"].lower()

    ok = await client.post(
      f"/api/v1/inquiries/{inquiry.id}/technical-files",
      files={"file": ("pack.pdf", BytesIO(b"%PDF-1.4 test content"), "application/pdf")},
    )
    assert ok.status_code == 200, ok.text
    files = ok.json()["technical_files"]
    assert len(files) == 1
    assert files[0]["filename"].endswith(".pdf")
    assert files[0]["name"] == "pack.pdf"

    deleted = await client.delete(
      f"/api/v1/inquiries/{inquiry.id}/technical-files/{files[0]['id']}"
    )
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["technical_files"] == []
