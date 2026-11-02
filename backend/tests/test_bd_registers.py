"""BD bond / UD / Mushak registers (flag bd_bond_compliance_enabled)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import BD_BOND_COMPLIANCE_ENABLED
from app.database import get_db
from app.main import app
from app.models.commercial import CommercialInvoice
from app.models.finance import VendorBill
from app.modules.compliance.bd_registers_service import bond_register_rows, compute_utilization
from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain
from tests.merch_fixtures import create_customer


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


def test_utilization_and_bond_balance_pure():
    today = date(2026, 11, 1)
    ents = [
        {"id": 1, "item_description": "Cotton fabric", "entitled_qty": Decimal("1000"), "entitled_value_usd": Decimal("5000")},
        {"id": 2, "item_description": "Buttons", "entitled_qty": Decimal("100"), "entitled_value_usd": None},
    ]
    entries = [
        {"id": 10, "entry_type": "IMPORT", "ud_entitlement_id": 1, "ud_no": "UD-1", "item_description": "Cotton fabric",
         "quantity": Decimal("600"), "value_bdt": Decimal("60000"), "entry_date": date(2026, 10, 1)},
        {"id": 11, "entry_type": "EXPORT", "ud_entitlement_id": 1, "ud_no": "UD-1", "item_description": "Cotton fabric",
         "quantity": Decimal("250"), "value_bdt": None, "entry_date": date(2026, 10, 20)},
        # Unlinked, matched by UD number + description (case/space-insensitive).
        {"id": 12, "entry_type": "IMPORT", "ud_entitlement_id": None, "ud_no": "ud-1", "item_description": "  buttons ",
         "quantity": Decimal("150"), "value_bdt": Decimal("1500"), "entry_date": date(2026, 10, 5)},
        # Different UD — ignored.
        {"id": 13, "entry_type": "IMPORT", "ud_entitlement_id": None, "ud_no": "UD-2", "item_description": "Buttons",
         "quantity": Decimal("999"), "value_bdt": None, "entry_date": date(2026, 10, 5)},
    ]
    util = compute_utilization(
        {"ud_no": "UD-1", "expiry_date": today + timedelta(days=10), "status": "APPROVED"}, ents, entries, today=today
    )
    fabric, buttons = util["lines"]
    assert fabric["imported_qty"] == "600" and fabric["consumed_qty"] == "250"
    assert fabric["remaining_entitlement_qty"] == "400" and fabric["in_bond_qty"] == "350"
    assert fabric["utilization_pct"] == 60.0
    assert buttons["imported_qty"] == "150" and buttons["entry_count"] == 1
    kinds = sorted(w["kind"] for w in util["warnings"])
    assert kinds == ["EXPIRING", "OVER_UTILIZED"]

    reg = bond_register_rows(entries[:3], from_date=date(2026, 10, 2))
    assert reg["opening_balance_qty"] == "600"
    assert [r["id"] for r in reg["rows"]] == [12, 11]
    assert reg["rows"][1]["balance_qty"] == "350"
    assert reg["closing_balance_qty"] == "500"


@pytest.mark.asyncio
async def test_bd_registers_http_flow(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    vendor.tax_id = "BIN-123456789"
    today = date.today()
    db.add(
        VendorBill(
            tenant_id=tenant.id, bill_code=f"VB-{uuid.uuid4().hex[:6]}", vendor_id=vendor.id, bill_date=today,
            subtotal_amount=Decimal("1000"), tax_amount=Decimal("150"), total_amount=Decimal("1150"), status="POSTED",
        )
    )
    db.add(
        VendorBill(
            tenant_id=tenant.id, bill_code=f"VB-{uuid.uuid4().hex[:6]}", vendor_id=vendor.id, bill_date=today,
            subtotal_amount=Decimal("999"), tax_amount=Decimal("99"), total_amount=Decimal("1098"), status="DRAFT",
        )
    )
    db.add(
        CommercialInvoice(
            tenant_id=tenant.id, invoice_code=f"CI-{uuid.uuid4().hex[:6]}", customer_id=customer.id, invoice_date=today,
            currency="USD", total_amount=Decimal("100"), base_total_amount=Decimal("11000"), status="ISSUED",
        )
    )
    other_tenant, outsider, _ = await create_admin_tenant_with_user(db)
    other_tenant.feature_flags = {BD_BOND_COMPLIANCE_ENABLED: True}
    await db.commit()
    ud_no = f"UD-{uuid.uuid4().hex[:6]}"

    _as(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get("/api/v1/compliance/bd/ud")
            assert r.status_code == 403  # flag off

            tenant.feature_flags = {BD_BOND_COMPLIANCE_ENABLED: True}
            await db.commit()

            body = {
                "ud_no": ud_no,
                "issuer": "bgmea",
                "ud_date": today.isoformat(),
                "expiry_date": (today + timedelta(days=90)).isoformat(),
                "export_lc_no": "LC-77",
                "export_value_usd": "50000",
                "entitlements": [
                    {"item_description": "Cotton fabric", "uom": "YDS", "entitled_qty": "1000", "entitled_value_usd": "4000"},
                    {"item_description": "Buttons", "uom": "PCS", "entitled_qty": "5000"},
                ],
            }
            r = await client.post("/api/v1/compliance/bd/ud", json=body)
            assert r.status_code == 201, r.text
            ud = r.json()
            assert ud["issuer"] == "BGMEA" and ud["status"] == "DRAFT"
            fabric_id = ud["entitlements"][0]["id"]

            r = await client.post("/api/v1/compliance/bd/ud", json=body)
            assert r.status_code == 409  # duplicate UD + amendment

            dup = {**body, "ud_no": ud_no + "X", "entitlements": [body["entitlements"][0], body["entitlements"][0]]}
            r = await client.post("/api/v1/compliance/bd/ud", json=dup)
            assert r.status_code == 400

            r = await client.post(f"/api/v1/compliance/bd/ud/{ud['id']}/status", json={"status": "APPROVED"})
            assert r.status_code == 200 and r.json()["status"] == "APPROVED"
            r = await client.put(f"/api/v1/compliance/bd/ud/{ud['id']}", json=body)
            assert r.status_code == 409  # approved UDs are locked

            r = await client.post(
                "/api/v1/compliance/bd/bond-entries",
                json={"reference_no": "BE-1", "entry_type": "IMPORT", "ud_entitlement_id": fabric_id, "quantity": "700", "value_bdt": "70000"},
            )
            assert r.status_code == 201, r.text
            assert r.json()["ud_no"] == ud_no and r.json()["item_description"] == "Cotton fabric"
            r = await client.post(
                "/api/v1/compliance/bd/bond-entries",
                json={"reference_no": "BE-2", "entry_type": "EXPORT", "ud_entitlement_id": fabric_id, "quantity": "300"},
            )
            assert r.status_code == 201
            r = await client.post(
                "/api/v1/compliance/bd/bond-entries",
                json={"reference_no": "BE-3", "entry_type": "IMPORT", "quantity": "0", "item_description": "x"},
            )
            assert r.status_code == 400

            r = await client.get(f"/api/v1/compliance/bd/ud/{ud['id']}")
            fabric = r.json()["utilization"]["lines"][0]
            assert fabric["imported_qty"] == "700.0000" or Decimal(fabric["imported_qty"]) == 700
            assert Decimal(fabric["in_bond_qty"]) == 400

            r = await client.get("/api/v1/compliance/bd/bond-register", params={"ud_no": ud_no})
            reg = r.json()
            assert len(reg["rows"]) == 2 and Decimal(reg["closing_balance_qty"]) == 400

            r = await client.post(f"/api/v1/compliance/bd/ud/{ud['id']}/status", json={"status": "DRAFT"})
            assert r.status_code == 200
            r = await client.delete(f"/api/v1/compliance/bd/ud/{ud['id']}")
            assert r.status_code == 409  # bond entries linked

            r = await client.get("/api/v1/compliance/bd/mushak/6-1", params={"year": today.year, "month": today.month})
            assert r.status_code == 200, r.text
            m61 = r.json()
            assert len(m61["rows"]) == 1  # DRAFT bill excluded
            assert m61["rows"][0]["supplier_bin"] == "BIN-123456789"
            assert Decimal(m61["totals"]["vat_amount"]) == Decimal("150")

            r = await client.get("/api/v1/compliance/bd/mushak/6-2", params={"year": today.year, "month": today.month})
            m62 = r.json()
            assert len(m62["rows"]) == 1 and Decimal(m62["rows"][0]["taxable_value"]) == Decimal("11000")

        # Tenant isolation: another tenant cannot read this UD.
        _as(db, outsider, other_tenant)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            r = await client.get(f"/api/v1/compliance/bd/ud/{ud['id']}")
            assert r.status_code == 404
            r = await client.post(
                "/api/v1/compliance/bd/bond-entries",
                json={"reference_no": "X", "entry_type": "IMPORT", "ud_entitlement_id": fabric_id, "quantity": "1"},
            )
            assert r.status_code == 400
            r = await client.get("/api/v1/compliance/bd/mushak/6-1", params={"year": today.year, "month": today.month})
            assert r.json()["rows"] == []
    finally:
        app.dependency_overrides.clear()
