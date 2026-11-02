"""Supplier portal: invite → accept → login → only own vendors' non-draft POs, responses, guards, isolation."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user, hash_password
from app.common.tenant import require_tenant
from app.database import get_db
from app.external_access.auth.service import issue_tokens_for_principal
from app.external_access.constants import FF_CUSTOMER_PORTAL_ENABLED, FF_SUPPLIER_PORTAL_ENABLED, PRINCIPAL_CUSTOMER
from app.external_access.feature_flags import require_portal_enabled
from app.main import app
from app.models import ExternalPrincipal, Vendor
from app.models.inventory import PurchaseOrder, PurchaseOrderItem
from app.models.notification import UserNotification

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain


def test_unknown_principal_type_fails_closed():
    from fastapi import HTTPException

    class T:
        feature_flags = {FF_SUPPLIER_PORTAL_ENABLED: True}

    with pytest.raises(HTTPException) as exc:
        require_portal_enabled(tenant=T(), principal_type="partner")
    assert exc.value.status_code == 403


@pytest.mark.asyncio
async def test_supplier_portal_end_to_end(db_session_integration, monkeypatch):
    db = db_session_integration

    async def _no_smtp(**_kwargs):
        raise RuntimeError("smtp disabled in tests")

    monkeypatch.setattr("app.external_access.admin.router.send_external_invitation_email", _no_smtp)

    tenant, admin, wh, vendor_a, item = await seed_inventory_chain(db)
    slug = uuid.uuid4().hex[:6]
    vendor_b = Vendor(tenant_id=tenant.id, vendor_code=f"VB{slug}", name="Other Mill", is_active=True)
    db.add(vendor_b)
    other_tenant, other_admin, _ = await create_admin_tenant_with_user(db)
    foreign_vendor = Vendor(tenant_id=other_tenant.id, vendor_code=f"VF{slug}", name="Foreign", is_active=True)
    db.add(foreign_vendor)
    await db.flush()

    def po(code: str, vendor_id: int, status: str, expected: date | None = None) -> PurchaseOrder:
        return PurchaseOrder(
            tenant_id=tenant.id, po_code=code, vendor_id=vendor_id, supplier_name="x", status=status, currency="USD", expected_date=expected
        )

    approved = po(f"PO-{slug}-A", vendor_a.id, "APPROVED", date.today() + timedelta(days=5))
    draft = po(f"PO-{slug}-D", vendor_a.id, "DRAFT")
    closed = po(f"PO-{slug}-C", vendor_a.id, "CLOSED")
    other_vendor_po = po(f"PO-{slug}-B", vendor_b.id, "APPROVED")
    db.add_all([approved, draft, closed, other_vendor_po])
    await db.flush()
    db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=approved.id, item_id=item.id, quantity=Decimal("1000"), unit_price=Decimal("2.5")))
    customer_principal = ExternalPrincipal(
        tenant_id=tenant.id,
        principal_type=PRINCIPAL_CUSTOMER,
        email=f"buyer_{slug}@example.com",
        password_hash=await hash_password("Buyer123!x"),
        full_name="Buyer",
        is_active=True,
    )
    db.add(customer_principal)
    await db.commit()
    ids = {
        "approved": approved.id, "draft": draft.id, "closed": closed.id, "other": other_vendor_po.id,
        "va": vendor_a.id, "vb": vendor_b.id, "vf": foreign_vendor.id, "admin": admin.id,
    }

    async def override_db():
        yield db

    def as_admin(user, t):
        async def u():
            return user

        async def tt():
            return t

        app.dependency_overrides[get_current_user] = u
        app.dependency_overrides[require_tenant] = tt

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            as_admin(admin, tenant)
            invite = {"email": f"mill_{slug}@example.com", "full_name": "Mill Rep", "vendor_ids": [ids["va"]]}
            assert (await ac.post("/api/v1/settings/external-access/suppliers/invite", json=invite)).status_code == 403

            r = await ac.patch("/api/v1/settings/external-access/feature-flags", json={"supplier_portal_enabled": True})
            assert r.status_code == 200 and r.json()["supplier_portal_enabled"] is True
            bad = {**invite, "vendor_ids": [ids["vf"]]}
            assert (await ac.post("/api/v1/settings/external-access/suppliers/invite", json=bad)).status_code == 400
            r = await ac.post("/api/v1/settings/external-access/suppliers/invite", json=invite)
            assert r.status_code == 200, r.text
            token = r.json()["invite_token"]
            assert token

            r = await ac.post("/api/external/auth/accept-invite", json={"token": token, "full_name": "Mill Rep", "password": "Supplier123!"})
            assert r.status_code == 200, r.text
            assert r.json()["principal_type"] == "supplier"
            r = await ac.post(
                "/api/external/auth/login",
                json={"company_code": tenant.company_code, "email": invite["email"], "password": "Supplier123!", "principal_type": "supplier"},
            )
            assert r.status_code == 200, r.text
            h = {"Authorization": f"Bearer {r.json()['access_token']}"}

            me = (await ac.get("/api/external/auth/me", headers=h)).json()
            assert me["principal_type"] == "supplier" and "supplier_user" in me["role_codes"]

            dash = (await ac.get("/api/external/supplier/dashboard", headers=h)).json()
            assert dash["open_po_count"] == 1 and dash["awaiting_confirmation_count"] == 1 and dash["due_next_14_days"] == 1
            listed = (await ac.get("/api/external/supplier/purchase-orders", params={"status": "all"}, headers=h)).json()
            assert {i["id"] for i in listed["items"]} == {ids["approved"], ids["closed"]}

            # Drafts, other vendors and missing ids all look the same.
            for hidden in (ids["draft"], ids["other"], 999_999_999):
                assert (await ac.get(f"/api/external/supplier/purchase-orders/{hidden}", headers=h)).status_code == 404
                assert (await ac.post(f"/api/external/supplier/purchase-orders/{hidden}/updates", json={"kind": "CONFIRMED"}, headers=h)).status_code == 404

            detail = (await ac.get(f"/api/external/supplier/purchase-orders/{ids['approved']}", headers=h)).json()
            assert detail["can_respond"] is True and Decimal(detail["total_amount"]) == Decimal("2500.00")
            assert Decimal(detail["lines"][0]["pending_qty"]) == Decimal("1000")

            url = f"/api/external/supplier/purchase-orders/{ids['approved']}/updates"
            assert (await ac.post(url, json={"kind": "DECLINED"}, headers=h)).status_code == 400
            assert (await ac.post(url, json={"kind": "SHIP_DATE"}, headers=h)).status_code == 400
            ship = (date.today() + timedelta(days=9)).isoformat()
            r = await ac.post(url, json={"kind": "CONFIRMED", "expected_ship_date": ship, "message": "Will ship by sea"}, headers=h)
            assert r.status_code == 201, r.text
            assert (await ac.post(f"/api/external/supplier/purchase-orders/{ids['closed']}/updates", json={"kind": "NOTE", "message": "hi"}, headers=h)).status_code == 409

            listed = (await ac.get("/api/external/supplier/purchase-orders", headers=h)).json()
            assert listed["items"][0]["supplier_status"] == "CONFIRMED" and listed["items"][0]["promised_ship_date"] == ship

            notes = (await db.execute(select(UserNotification).where(UserNotification.user_id == ids["admin"]))).scalars().all()
            assert any("confirmed PO" in n.title for n in notes)

            internal = (await ac.get(f"/api/v1/inventory/purchase-orders/{ids['approved']}/supplier-updates")).json()
            assert internal[0]["kind"] == "CONFIRMED" and internal[0]["supplier_user"] == "Mill Rep"

            # A customer token cannot use the supplier portal, and the supplier token cannot use the customer portal.
            tenant.feature_flags = {**(tenant.feature_flags or {}), FF_CUSTOMER_PORTAL_ENABLED: True}
            await db.commit()
            cust_access, _ = await issue_tokens_for_principal(customer_principal)
            assert (await ac.get("/api/external/supplier/dashboard", headers={"Authorization": f"Bearer {cust_access}"})).status_code == 403
            assert (await ac.get("/api/external/customer/dashboard", headers=h)).status_code == 403

            # Admin can change vendors (own tenant only); turning the portal off blocks existing sessions.
            sup_id = me["principal_id"]
            assert (await ac.patch(f"/api/v1/settings/external-access/suppliers/{sup_id}", json={"vendor_ids": [ids["vf"]]})).status_code == 400
            r = await ac.patch(f"/api/v1/settings/external-access/suppliers/{sup_id}", json={"vendor_ids": [ids["vb"]]})
            assert r.status_code == 200 and r.json()["vendor_ids"] == [ids["vb"]]
            assert (await ac.patch(f"/api/v1/settings/external-access/customers/{sup_id}", json={"full_name": "x"})).status_code == 404
            listed = (await ac.get("/api/external/supplier/purchase-orders", headers=h)).json()
            assert [i["id"] for i in listed["items"]] == [ids["other"]]

            await ac.patch("/api/v1/settings/external-access/feature-flags", json={"supplier_portal_enabled": False})
            assert (await ac.get("/api/external/supplier/dashboard", headers=h)).status_code == 403

            as_admin(other_admin, other_tenant)
            assert (await ac.get("/api/v1/settings/external-access/suppliers")).json()["items"] == []
            assert (await ac.get(f"/api/v1/inventory/purchase-orders/{ids['approved']}/supplier-updates")).status_code == 404
    finally:
        app.dependency_overrides.clear()
