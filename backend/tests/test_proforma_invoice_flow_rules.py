"""Proforma invoice EXPORT vs IMPORT rules (master contract, PO exclusivity, issued order ids).

Run: docker compose exec backend pytest tests/test_proforma_invoice_flow_rules.py -q
"""

from __future__ import annotations

import uuid

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import PurchaseOrder, Vendor
from app.models.commercial import MasterContract
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


def _overrides(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


def _clear_overrides():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_export_proforma_create_without_master_contract(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    await db.commit()

    _overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/commercial/proforma-invoices",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "order_ids": [order.id],
                    "direction": "EXPORT",
                    "reference": f"PI-EX-{uuid.uuid4().hex[:8]}",
                },
            )
        assert r.status_code == 201, r.text
        data = r.json()
        assert data.get("master_contract_id") in (None, False) or data["master_contract_id"] is None
        assert data.get("purchase_order_id") in (None, False) or data["purchase_order_id"] is None
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_import_proforma_requires_master_and_po(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    slug = uuid.uuid4().hex[:8]
    v = Vendor(
        tenant_id=tenant.id,
        vendor_code=f"V-{slug}"[:12],
        name="Vendor A",
    )
    db.add(v)
    await db.flush()
    await db.commit()

    _overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/commercial/proforma-invoices",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "order_ids": [],
                    "direction": "IMPORT",
                    "vendor_id": v.id,
                    "reference": f"PI-IM-{slug}",
                },
            )
        assert r.status_code == 400, r.text
        assert "master_contract" in r.text.lower() or "purchase_order" in r.text.lower()
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_import_proforma_po_vendor_mismatch_and_exclusivity(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    slug = uuid.uuid4().hex[:8]
    v1 = Vendor(tenant_id=tenant.id, vendor_code=f"V1-{slug}"[:12], name="Vendor 1")
    v2 = Vendor(tenant_id=tenant.id, vendor_code=f"V2-{slug}"[:12], name="Vendor 2")
    db.add(v1)
    db.add(v2)
    await db.flush()
    mc = MasterContract(
        tenant_id=tenant.id,
        contract_type="EXPORT_LC",
        reference=f"MC-{slug}",
        status="DRAFT",
    )
    db.add(mc)
    await db.flush()
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"PO-{slug}",
        vendor_id=v1.id,
        supplier_name="S1",
        status="DRAFT",
    )
    db.add(po)
    await db.flush()
    await db.commit()

    _overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r_bad = await ac.post(
                "/api/v1/commercial/proforma-invoices",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "order_ids": [],
                    "direction": "IMPORT",
                    "vendor_id": v2.id,
                    "master_contract_id": mc.id,
                    "purchase_order_id": po.id,
                    "reference": f"PI-BAD-{slug}",
                },
            )
            assert r_bad.status_code == 400, r_bad.text

            r_ok = await ac.post(
                "/api/v1/commercial/proforma-invoices",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "order_ids": [],
                    "direction": "IMPORT",
                    "vendor_id": v1.id,
                    "master_contract_id": mc.id,
                    "purchase_order_id": po.id,
                    "reference": f"PI-OK-{slug}",
                },
            )
            assert r_ok.status_code == 201, r_ok.text

            r_dup = await ac.post(
                "/api/v1/commercial/proforma-invoices",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "order_ids": [],
                    "direction": "IMPORT",
                    "vendor_id": v1.id,
                    "master_contract_id": mc.id,
                    "purchase_order_id": po.id,
                    "reference": f"PI-DUP-{slug}",
                },
            )
            assert r_dup.status_code == 400, r_dup.text
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_issued_export_order_ids_endpoint(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    slug = uuid.uuid4().hex[:8]
    ref = f"PI-FIN-{slug}"
    await db.commit()

    _overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            empty = await ac.get(
                "/api/v1/commercial/proforma-invoices/issued-export-order-ids",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert empty.status_code == 200, empty.text
            assert order.id not in (empty.json().get("order_ids") or [])

            c = await ac.post(
                "/api/v1/commercial/proforma-invoices",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "order_ids": [order.id],
                    "direction": "EXPORT",
                    "reference": ref,
                },
            )
            assert c.status_code == 201, c.text
            pi_id = c.json()["id"]

            fin = await ac.post(
                f"/api/v1/commercial/proforma-invoices/{pi_id}/finalize",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert fin.status_code == 200, fin.text

            after = await ac.get(
                "/api/v1/commercial/proforma-invoices/issued-export-order-ids",
                headers={"X-Tenant-Id": str(tenant.id)},
            )
            assert after.status_code == 200, after.text
            assert order.id in (after.json().get("order_ids") or [])
    finally:
        _clear_overrides()


@pytest.mark.asyncio
async def test_export_rejects_purchase_order_id(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    slug = uuid.uuid4().hex[:8]
    v = Vendor(tenant_id=tenant.id, vendor_code=f"VX-{slug}"[:12], name="VX")
    db.add(v)
    await db.flush()
    po = PurchaseOrder(
        tenant_id=tenant.id,
        po_code=f"POX-{slug}",
        vendor_id=v.id,
        supplier_name="S",
        status="DRAFT",
    )
    db.add(po)
    await db.flush()
    await db.commit()

    _overrides(db, tenant, user)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/v1/commercial/proforma-invoices",
                headers={"X-Tenant-Id": str(tenant.id)},
                json={
                    "order_ids": [order.id],
                    "direction": "EXPORT",
                    "reference": f"PI-EXPO-{slug}",
                    "purchase_order_id": po.id,
                },
            )
        assert r.status_code == 400, r.text
    finally:
        _clear_overrides()
