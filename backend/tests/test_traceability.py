"""Traceability: certificate validity, fabric lots on cut tickets, order report gaps, flag and tenant guards."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import TRACEABILITY_ENABLED
from app.database import get_db
from app.main import app
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, StockBatch
from app.models.production import CutTicket, CuttingBundle, LayPlan, MarkerPlan
from app.models.traceability import MaterialCertificate
from app.modules.traceability.router import validity

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


def test_validity_windows():
    today = date(2026, 11, 1)
    cert = MaterialCertificate(valid_from=date(2026, 1, 1), valid_until=date(2026, 11, 20))
    assert validity(cert, today) == "expiring"
    assert validity(cert, date(2026, 6, 1)) == "valid"
    assert validity(cert, date(2026, 12, 1)) == "expired"
    assert validity(cert, date(2025, 12, 31)) == "not_yet_valid"
    assert validity(MaterialCertificate(), today) == "valid"


def _as(db, user, tenant):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant


@pytest.mark.asyncio
async def test_traceability_report_end_to_end(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    slug = uuid.uuid4().hex[:6]
    received = date.today() - timedelta(days=10)
    grn = GoodsReceiving(tenant_id=tenant.id, grn_code=f"GRN-{slug}", status="RECEIVED", vendor_id=vendor.id, received_date=received)
    db.add(grn)
    await db.flush()
    gri = GoodsReceivingItem(tenant_id=tenant.id, goods_receiving_id=grn.id, item_id=item.id, warehouse_id=wh.id, quantity=Decimal("500"))
    db.add(gri)
    await db.flush()
    lot = StockBatch(tenant_id=tenant.id, stock_item_id=item.id, batch_number=f"LOT-{slug}", goods_receiving_item_id=gri.id, current_qty=Decimal("500"))
    marker = MarkerPlan(tenant_id=tenant.id, marker_code=f"MK-{slug}")
    db.add_all([lot, marker])
    await db.flush()
    lay = LayPlan(tenant_id=tenant.id, marker_plan_id=marker.id, lay_code=f"LAY-{slug}")
    db.add(lay)
    await db.flush()
    t1 = CutTicket(tenant_id=tenant.id, order_id=order.id, lay_plan_id=lay.id, ticket_code=f"CT-{slug}-1", total_pcs_cut=120)
    t2 = CutTicket(tenant_id=tenant.id, order_id=order.id, lay_plan_id=lay.id, ticket_code=f"CT-{slug}-2")
    db.add_all([t1, t2])
    await db.flush()
    db.add_all(
        [
            CuttingBundle(tenant_id=tenant.id, cut_ticket_id=t1.id, order_id=order.id, bundle_no="B1", barcode=f"BC{slug}1", qty_in_bundle=60),
            CuttingBundle(tenant_id=tenant.id, cut_ticket_id=t1.id, order_id=order.id, bundle_no="B2", barcode=f"BC{slug}2", qty_in_bundle=60),
        ]
    )
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    await db.commit()
    ids = {"vendor": vendor.id, "item": item.id, "lot": lot.id, "t1": t1.id, "order": order.id, "lot_no": lot.batch_number}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            tenant.feature_flags = {**(tenant.feature_flags or {}), TRACEABILITY_ENABLED: False}
            _as(db, user, tenant)
            assert (await ac.get("/api/v1/traceability/certificates")).status_code == 403
            tenant.feature_flags = {**(tenant.feature_flags or {}), TRACEABILITY_ENABLED: True}
            await db.commit()

            assert (await ac.post("/api/v1/traceability/certificates", json={"cert_type": "GOTS", "certificate_number": "X"})).status_code == 400
            bad_dates = {"cert_type": "GOTS", "certificate_number": "X", "vendor_id": ids["vendor"], "valid_from": "2026-05-01", "valid_until": "2026-01-01"}
            assert (await ac.post("/api/v1/traceability/certificates", json=bad_dates)).status_code == 400

            r = await ac.post(f"/api/v1/traceability/cut-tickets/{ids['t1']}/fabric-lots", json={"stock_batch_id": ids["lot"], "qty_used": "180.5", "roll_numbers": "R1, R2"})
            assert r.status_code == 201, r.text
            assert r.json()["grn_code"].startswith("GRN-") and r.json()["supplier_name"]
            assert (await ac.post(f"/api/v1/traceability/cut-tickets/{ids['t1']}/fabric-lots", json={"stock_batch_id": ids["lot"]})).status_code == 409

            report = (await ac.get(f"/api/v1/traceability/orders/{ids['order']}")).json()
            assert [c["bundle_count"] for c in report["cut_tickets"]] == [2, 0]
            assert report["cut_tickets"][0]["bundle_pcs"] == 120
            assert any("has no certificate" in g for g in report["gaps"])
            assert any("CT-" in g and "no fabric lot" in g for g in report["gaps"])

            # A certificate that expired before the receipt date is flagged; a valid one clears the gap.
            expired = {"cert_type": "GOTS", "certificate_number": "CU-OLD", "vendor_id": ids["vendor"], "valid_until": (received - timedelta(days=1)).isoformat()}
            assert (await ac.post("/api/v1/traceability/certificates", json=expired)).status_code == 201
            report = (await ac.get(f"/api/v1/traceability/orders/{ids['order']}")).json()
            assert report["fabric_lots"][0]["certificates"][0]["status_on_receipt"] == "expired"
            assert any("no certificate was valid" in g for g in report["gaps"])
            good = {"cert_type": "OEKO_TEX_100", "certificate_number": "OT-1", "item_id": ids["item"], "valid_until": (date.today() + timedelta(days=200)).isoformat()}
            r = await ac.post("/api/v1/traceability/certificates", json=good)
            assert r.status_code == 201 and r.json()["status"] == "valid"
            report = (await ac.get(f"/api/v1/traceability/orders/{ids['order']}")).json()
            assert not any(ids["lot_no"] in g for g in report["gaps"])
            assert {c["cert_type"] for c in report["fabric_lots"][0]["certificates"]} == {"GOTS", "OEKO_TEX_100"}

            expiring = (await ac.get("/api/v1/traceability/certificates", params={"status": "expired"})).json()
            assert [c["certificate_number"] for c in expiring] == ["CU-OLD"]

            _as(db, outsider, other_tenant)
            other_tenant.feature_flags = {TRACEABILITY_ENABLED: True}
            await db.commit()
            assert (await ac.get(f"/api/v1/traceability/orders/{ids['order']}")).status_code == 404
            assert (await ac.get(f"/api/v1/traceability/cut-tickets/{ids['t1']}/fabric-lots")).status_code == 404
            assert (await ac.get("/api/v1/traceability/certificates")).json() == []
            assert (await ac.get("/api/v1/traceability/fabric-lots")).json() == []
    finally:
        app.dependency_overrides.clear()
