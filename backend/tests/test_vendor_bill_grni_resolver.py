"""FIN-05: VendorBill post debits the same GRNI account resolve_inventory_accounts returns.

Run: docker compose exec backend pytest tests/test_vendor_bill_grni_resolver.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import VoucherLine
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa
from app.services.inventory_account_resolver import resolve_inventory_accounts

from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import setup_inventory_gl


async def _api_client(db, tenant, user):
    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    return AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Tenant-Id": str(tenant.id)},
    )


def _clear():
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(require_tenant, None)


@pytest.mark.asyncio
async def test_vendor_bill_post_clears_stock_group_grni_account(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    await seed_tenant_system_coa(db, tenant.id)
    gl = await setup_inventory_gl(db, tenant.id, [item])
    await db.commit()

    resolved = await resolve_inventory_accounts(db, tenant.id, item.id)
    assert resolved["grni"] == gl.grni.id

    today = str(date.today())
    try:
        async with await _api_client(db, tenant, user) as ac:
            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                json={
                    "vendor_id": vendor.id,
                    "supplier_name": vendor.name,
                    "order_date": today,
                    "status": "APPROVED",
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "5",
                            "unit_price": "20",
                        }
                    ],
                },
            )
            assert po.status_code == 200, po.text
            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                json={
                    "purchase_order_id": po.json()["id"],
                    "received_date": today,
                    "status": "DRAFT",
                    "default_warehouse_id": wh.id,
                },
            )
            assert grn.status_code == 200, grn.text
            grn_id = grn.json()["id"]
            recv = await ac.post(f"/api/v1/inventory/goods-receiving/{grn_id}/receive")
            assert recv.status_code == 200, recv.text

            bill = await ac.post(f"/api/v1/finance/vendor-bills/from-grn/{grn_id}")
            assert bill.status_code == 201, bill.text
            bill_id = bill.json()["id"]
            patch = await ac.patch(
                f"/api/v1/finance/vendor-bills/{bill_id}",
                json={"vendor_invoice_ref": "INV-GRNI-1"},
            )
            assert patch.status_code == 200, patch.text
            posted = await ac.post(f"/api/v1/finance/vendor-bills/{bill_id}/post")
            assert posted.status_code == 200, posted.text
            voucher_id = posted.json()["voucher_id"]
    finally:
        _clear()

    lines = list(
        (
            await db.execute(
                select(VoucherLine).where(
                    VoucherLine.tenant_id == tenant.id,
                    VoucherLine.voucher_id == voucher_id,
                )
            )
        ).scalars().all()
    )
    debits = [ln for ln in lines if (ln.entry_type or "").upper() == "DEBIT"]
    assert debits, "expected GRNI clearing debit"
    assert any(int(ln.account_id) == gl.grni.id for ln in debits)
    assert sum(Decimal(str(ln.amount)) for ln in debits) == Decimal("100")


@pytest.mark.asyncio
async def test_usd_po_vendor_bill_post_clears_grni_in_base(db_session_integration):
    """RMC-05-01: from-grn + post must clear GRNI at base (unit_price × FX), not foreign."""
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    await seed_tenant_system_coa(db, tenant.id)
    gl = await setup_inventory_gl(db, tenant.id, [item])
    await db.commit()

    today = str(date.today())
    try:
        async with await _api_client(db, tenant, user) as ac:
            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                json={
                    "vendor_id": vendor.id,
                    "supplier_name": vendor.name,
                    "order_date": today,
                    "status": "APPROVED",
                    "currency": "USD",
                    "exchange_rate_to_base": 110.0,
                    "items": [
                        {
                            "item_id": item.id,
                            "warehouse_id": wh.id,
                            "quantity": "5",
                            "unit_price": "2",
                        }
                    ],
                },
            )
            assert po.status_code == 200, po.text
            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                json={
                    "purchase_order_id": po.json()["id"],
                    "received_date": today,
                    "status": "DRAFT",
                    "default_warehouse_id": wh.id,
                },
            )
            assert grn.status_code == 200, grn.text
            grn_id = grn.json()["id"]
            recv = await ac.post(f"/api/v1/inventory/goods-receiving/{grn_id}/receive")
            assert recv.status_code == 200, recv.text

            bill = await ac.post(f"/api/v1/finance/vendor-bills/from-grn/{grn_id}")
            assert bill.status_code == 201, bill.text
            bill_id = bill.json()["id"]
            detail = await ac.get(f"/api/v1/finance/vendor-bills/{bill_id}")
            assert detail.status_code == 200, detail.text
            # 5 × 2 USD × 110 = 1100 base (not 10 foreign)
            assert Decimal(str(detail.json().get("lines", [{}])[0].get("line_total") or 0)) == Decimal("1100")

            patch = await ac.patch(
                f"/api/v1/finance/vendor-bills/{bill_id}",
                json={"vendor_invoice_ref": "INV-USD-FX-1"},
            )
            assert patch.status_code == 200, patch.text
            posted = await ac.post(f"/api/v1/finance/vendor-bills/{bill_id}/post")
            assert posted.status_code == 200, posted.text
            voucher_id = posted.json()["voucher_id"]
    finally:
        _clear()

    lines = list(
        (
            await db.execute(
                select(VoucherLine).where(
                    VoucherLine.tenant_id == tenant.id,
                    VoucherLine.voucher_id == voucher_id,
                )
            )
        ).scalars().all()
    )
    debits = sum(Decimal(str(ln.amount)) for ln in lines if (ln.entry_type or "").upper() == "DEBIT")
    credits = sum(Decimal(str(ln.amount)) for ln in lines if (ln.entry_type or "").upper() == "CREDIT")
    assert debits == credits == Decimal("1100")
    assert any(
        int(ln.account_id) == gl.grni.id and (ln.entry_type or "").upper() == "DEBIT" for ln in lines
    )
