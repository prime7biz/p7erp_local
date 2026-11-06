"""Public (no login) QR verification: /api/v1/public/verify/* and the old-link redirect.

Run (Docker):
    docker compose exec backend pytest tests/test_public_document_verify.py -q
"""

from __future__ import annotations

import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

import app.modules.document_verify.public_router as public_router
from app.common.document_signature import compute_signature_hash
from app.common.tenant_feature_keys import PUBLIC_DOCUMENT_VERIFICATION_ENABLED
from app.database import get_db
from app.main import app
from app.models import Warehouse
from app.models.commercial import ProformaInvoice
from app.models.finance import Voucher, VoucherLine
from app.models.inventory import (
    DeliveryChallan,
    DeliveryChallanItem,
    EnhancedGatePass,
    GoodsReceiving,
    GoodsReceivingItem,
    ProcessOrder,
    ProductionMaterialIssue,
    ProductionMaterialIssueLine,
    WarehouseTransfer,
    WarehouseTransferLine,
)
from app.models.merch import BomItem
from app.modules.finance.voucher_signature import apply_voucher_signature
from app.modules.inventory.document_qr_service import (
    delivery_challan_payload,
    rebuild_payload_for_verify,
    sign_delivery_challan,
    sign_gate_pass,
    sign_goods_receiving,
    sign_process_order,
    sign_production_material_issue,
    sign_warehouse_transfer,
    warehouse_transfer_payload,
)
from tests.go_live_fixtures import seed_inventory_chain
from tests.inventory_gl_fixtures import _account, add_stock, api_client, setup_inventory_gl
from tests.merch_fixtures import create_customer, create_garment_style, create_legacy_bom, create_quotation_and_order

DOC = "/api/v1/public/verify/document"
FORBIDDEN_KEYS = {"signature_hash", "recalculated_hash", "tenant_id", "document_id", "voucher_id", "lines"}


@pytest.fixture(autouse=True)
def _no_public_rate_limit(monkeypatch):
    # The whole suite shares one client IP; the limit itself is covered by enforce_ip_rate_limit tests.
    monkeypatch.setattr(public_router, "PUBLIC_VERIFY_LIMIT_PER_MINUTE", 0)


@asynccontextmanager
async def public_client(db):
    """No login: only the DB session is shared with the test."""

    async def override_db():
        yield db

    app.dependency_overrides[get_db] = override_db
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)


async def _enable(db, tenant, on: bool = True) -> None:
    tenant.feature_flags = {**(tenant.feature_flags or {}), PUBLIC_DOCUMENT_VERIFICATION_ENABLED: on}
    await db.flush()


async def _signed_voucher(db, tenant_id: int) -> tuple[Voucher, list[VoucherLine]]:
    debit = await _account(db, tenant_id, "Expense")
    credit = await _account(db, tenant_id, "Bank", normal="credit")
    v = Voucher(
        tenant_id=tenant_id,
        voucher_number=f"PV-{uuid.uuid4().hex[:8]}",
        voucher_type="PAYMENT",
        voucher_date=date(2026, 11, 1),
        status="POSTED",
    )
    db.add(v)
    await db.flush()
    lines = [
        VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=debit.id, entry_type="DEBIT",
                    amount=Decimal("1250.50"), base_amount=Decimal("1250.50"), exchange_rate=Decimal("1")),
        VoucherLine(tenant_id=tenant_id, voucher_id=v.id, account_id=credit.id, entry_type="CREDIT",
                    amount=Decimal("1250.50"), base_amount=Decimal("1250.50"), exchange_rate=Decimal("1")),
    ]
    db.add_all(lines)
    await db.flush()
    apply_voucher_signature(v, lines)
    await db.flush()
    return v, lines


@pytest.mark.asyncio
async def test_voucher_verifies_without_login_and_detects_tampering(db_session_integration):
    db = db_session_integration
    tenant, _user, _wh, _vendor, _item = await seed_inventory_chain(db)
    await _enable(db, tenant)
    voucher, lines = await _signed_voucher(db, tenant.id)

    async with public_client(db) as ac:
        r = await ac.get(f"{DOC}/{voucher.verification_id}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["is_valid"] is True
        assert body["document_type"] == "VOUCHER"
        assert body["document_number"] == voucher.voucher_number
        assert body["amount"] == "1250.50"
        assert body["company_name"] == tenant.name
        assert body["status"] == "POSTED"
        assert not FORBIDDEN_KEYS & set(body)

        # Lower-case id from a hand-typed URL still resolves.
        assert (await ac.get(f"{DOC}/{voucher.verification_id.lower()}")).status_code == 200

        lines[0].amount = Decimal("9999.00")
        await db.flush()
        tampered = await ac.get(f"{DOC}/{voucher.verification_id}")
        assert tampered.status_code == 200
        assert tampered.json()["is_valid"] is False


@pytest.mark.asyncio
async def test_unknown_malformed_and_disabled_all_look_the_same(db_session_integration):
    db = db_session_integration
    tenant, _user, _wh, _vendor, _item = await seed_inventory_chain(db)
    voucher, _lines = await _signed_voucher(db, tenant.id)  # flag left OFF (default)

    async with public_client(db) as ac:
        disabled = await ac.get(f"{DOC}/{voucher.verification_id}")
        unknown = await ac.get(f"{DOC}/VFY-{secrets.token_hex(8).upper()}")
        malformed = await ac.get(f"{DOC}/not-a-code")
    for r in (disabled, unknown, malformed):
        assert r.status_code == 404
        assert r.json()["detail"] == "Verification record not found"


@pytest.mark.asyncio
async def test_every_inventory_document_type_verifies(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    await _enable(db, tenant)
    today = date.today()

    dc = DeliveryChallan(tenant_id=tenant.id, challan_code=f"DC-{uuid.uuid4().hex[:6]}", customer_name="Buyer",
                         delivery_date=today, status="POSTED")
    db.add(dc)
    await db.flush()
    dc_items = [DeliveryChallanItem(tenant_id=tenant.id, challan_id=dc.id, item_id=item.id, warehouse_id=wh.id,
                                    quantity=Decimal("7"))]
    db.add_all(dc_items)

    gp = EnhancedGatePass(tenant_id=tenant.id, gate_pass_code=f"GP-{uuid.uuid4().hex[:6]}", purpose="Delivery",
                          challan_id=dc.id, status="RELEASED")
    db.add(gp)

    grn = GoodsReceiving(tenant_id=tenant.id, grn_code=f"GRN-{uuid.uuid4().hex[:6]}", status="RECEIVED",
                         received_date=today, vendor_id=vendor.id)
    db.add(grn)
    await db.flush()
    grn_items = [GoodsReceivingItem(tenant_id=tenant.id, goods_receiving_id=grn.id, item_id=item.id,
                                    warehouse_id=wh.id, quantity=Decimal("5"), accepted_qty="4")]
    db.add_all(grn_items)

    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    bom = await create_legacy_bom(db, tenant, style, customer=customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    bom_line = BomItem(tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC",
                       base_consumption=Decimal("1"))
    db.add(bom_line)
    await db.flush()
    pmi = ProductionMaterialIssue(tenant_id=tenant.id, issue_code=f"PMI-{uuid.uuid4().hex[:6]}", order_id=order.id,
                                  bom_id=bom.id, production_stage="CUTTING", covered_order_qty=100,
                                  warehouse_id=wh.id, issue_date=today, status="POSTED")
    db.add(pmi)
    await db.flush()
    pmi_lines = [ProductionMaterialIssueLine(tenant_id=tenant.id, issue_id=pmi.id, bom_line_id=bom_line.id,
                                             item_id=item.id, actual_issue_qty=Decimal("12.5"))]
    db.add_all(pmi_lines)

    po = ProcessOrder(tenant_id=tenant.id, process_number=f"PRO-{uuid.uuid4().hex[:6]}", process_type="DYEING",
                      input_item_id=item.id, output_item_id=item.id, input_quantity=Decimal("10"),
                      expected_output_qty=Decimal("9"), status="ISSUED")
    db.add(po)

    dest = Warehouse(tenant_id=tenant.id, warehouse_code=f"D{uuid.uuid4().hex[:4]}", name="Dest", is_active=True)
    db.add(dest)
    await db.flush()
    wt = WarehouseTransfer(tenant_id=tenant.id, transfer_code=f"WT-{uuid.uuid4().hex[:6]}",
                           from_warehouse_id=wh.id, to_warehouse_id=dest.id, transfer_date=today, status="POSTED")
    db.add(wt)
    await db.flush()
    wt_lines = [WarehouseTransferLine(tenant_id=tenant.id, transfer_id=wt.id, item_id=item.id,
                                      quantity=Decimal("3"))]
    db.add_all(wt_lines)
    await db.flush()

    sign_delivery_challan(dc, dc_items, [])
    sign_gate_pass(gp)
    sign_goods_receiving(grn, grn_items)
    sign_production_material_issue(pmi, pmi_lines)
    sign_process_order(po, [])
    sign_warehouse_transfer(wt, wt_lines)
    await db.flush()

    expected = {
        dc.verification_id: ("DELIVERY_CHALLAN", "7", 1),
        gp.verification_id: ("ENHANCED_GATE_PASS", None, None),
        grn.verification_id: ("GOODS_RECEIVING", "4", 1),
        pmi.verification_id: ("PRODUCTION_MATERIAL_ISSUE", "12.5", 1),
        po.verification_id: ("PROCESS_ORDER", "9", None),
        wt.verification_id: ("WAREHOUSE_TRANSFER", "3", 1),
    }
    async with public_client(db) as ac:
        for vid, (doc_type, qty, line_count) in expected.items():
            r = await ac.get(f"{DOC}/{vid}")
            assert r.status_code == 200, (doc_type, r.text)
            body = r.json()
            assert body["is_valid"] is True, doc_type
            assert body["document_type"] == doc_type
            assert body["quantity"] == qty, doc_type
            assert body["line_count"] == line_count, doc_type
            assert body["amount"] is None
            assert body["company_name"] == tenant.name
            assert not FORBIDDEN_KEYS & set(body)


async def _strict_hash_ok(db, tenant_id: int, doc_type: str, row) -> bool:
    payload = await rebuild_payload_for_verify(db, tenant_id, doc_type, row.id)
    return payload is not None and compute_signature_hash(payload) == row.signature_hash


@pytest.mark.asyncio
async def test_posting_signs_the_final_status(db_session_integration):
    """Regression: challan and transfer used to be signed before their status became POSTED."""
    db = db_session_integration
    tenant, user, wh, _vendor, item = await seed_inventory_chain(db)
    await setup_inventory_gl(db, tenant.id, [item])
    await add_stock(db, tenant.id, item.id, wh.id, "50", 10.0)
    dest = Warehouse(tenant_id=tenant.id, warehouse_code=f"D{uuid.uuid4().hex[:4]}", name="Dest", is_active=True)
    db.add(dest)
    await db.commit()

    async with api_client(db, user, tenant) as ac:
        r = await ac.post(
            "/api/v1/inventory/delivery-challans",
            json={
                "customer_name": "Buyer",
                "delivery_date": date.today().isoformat(),
                "status": "DRAFT",
                "items": [{"item_id": item.id, "warehouse_id": wh.id, "quantity": "5"}],
            },
        )
        assert r.status_code == 200, r.text
        dc_id = r.json()["id"]
        # A non-posting status change re-signs too, so the hash keeps matching.
        assert (await ac.post(f"/api/v1/inventory/delivery-challans/{dc_id}/status", json={"status": "SUBMITTED"})).status_code == 200
        dc = await db.get(DeliveryChallan, dc_id)
        assert await _strict_hash_ok(db, tenant.id, "DELIVERY_CHALLAN", dc)
        posted = await ac.post(f"/api/v1/inventory/delivery-challans/{dc_id}/status", json={"status": "POSTED"})
        assert posted.status_code == 200, posted.text

        t = await ac.post(
            "/api/v1/inventory/warehouse-transfers",
            json={"from_warehouse_id": wh.id, "to_warehouse_id": dest.id, "items": [{"item_id": item.id, "quantity": "4"}]},
        )
        assert t.status_code == 200, t.text
        wt_id = t.json()["id"]
        assert (await ac.post(f"/api/v1/inventory/warehouse-transfers/{wt_id}/post")).status_code == 200

        gp = await ac.post("/api/v1/inventory/enhanced-gate-passes", json={"purpose": "Delivery", "challan_id": dc_id})
        assert gp.status_code == 200, gp.text
        gp_id = gp.json()["id"]
        assert (await ac.post(f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/status", json={"status": "APPROVED"})).status_code == 200
        ack = await ac.post(f"/api/v1/inventory/enhanced-gate-passes/{gp_id}/status", json={"guard_acknowledged": True})
        assert ack.status_code == 200, ack.text

    dc = await db.get(DeliveryChallan, dc_id)
    wt = await db.get(WarehouseTransfer, wt_id)
    gate = await db.get(EnhancedGatePass, gp_id)
    assert dc.status == "POSTED" and wt.status == "POSTED"
    assert await _strict_hash_ok(db, tenant.id, "DELIVERY_CHALLAN", dc)
    assert await _strict_hash_ok(db, tenant.id, "WAREHOUSE_TRANSFER", wt)
    assert await _strict_hash_ok(db, tenant.id, "ENHANCED_GATE_PASS", gate)


@pytest.mark.asyncio
async def test_old_stale_status_hashes_still_verify_but_real_edits_do_not(db_session_integration):
    db = db_session_integration
    tenant, _user, wh, _vendor, item = await seed_inventory_chain(db)
    await _enable(db, tenant)
    dc = DeliveryChallan(tenant_id=tenant.id, challan_code=f"DC-{uuid.uuid4().hex[:6]}", customer_name="Buyer",
                         delivery_date=date.today(), status="APPROVED")
    db.add(dc)
    dest = Warehouse(tenant_id=tenant.id, warehouse_code=f"D{uuid.uuid4().hex[:4]}", name="Dest", is_active=True)
    db.add(dest)
    await db.flush()
    dc_items = [DeliveryChallanItem(tenant_id=tenant.id, challan_id=dc.id, item_id=item.id, warehouse_id=wh.id,
                                    quantity=Decimal("6"))]
    wt = WarehouseTransfer(tenant_id=tenant.id, transfer_code=f"WT-{uuid.uuid4().hex[:6]}",
                           from_warehouse_id=wh.id, to_warehouse_id=dest.id, status="DRAFT")
    db.add_all([*dc_items, wt])
    await db.flush()
    wt_lines = [WarehouseTransferLine(tenant_id=tenant.id, transfer_id=wt.id, item_id=item.id, quantity=Decimal("2"))]
    db.add_all(wt_lines)
    await db.flush()

    # Old behaviour: signed with the previous status, then the status moved on.
    sign_delivery_challan(dc, dc_items, [])
    sign_warehouse_transfer(wt, wt_lines)
    dc.status = "POSTED"
    wt.status = "POSTED"
    await db.flush()
    assert compute_signature_hash(delivery_challan_payload(dc, dc_items, [])) != dc.signature_hash
    assert compute_signature_hash(warehouse_transfer_payload(wt, wt_lines)) != wt.signature_hash

    async with public_client(db) as ac:
        for vid in (dc.verification_id, wt.verification_id):
            r = await ac.get(f"{DOC}/{vid}")
            assert r.status_code == 200 and r.json()["is_valid"] is True, r.text

        dc_items[0].quantity = Decimal("60")
        wt_lines[0].quantity = Decimal("20")
        await db.flush()
        for vid in (dc.verification_id, wt.verification_id):
            assert (await ac.get(f"{DOC}/{vid}")).json()["is_valid"] is False


@pytest.mark.asyncio
async def test_old_printed_api_links_redirect_browsers_only(db_session_integration):
    db = db_session_integration
    tenant, user, _wh, _vendor, _item = await seed_inventory_chain(db)
    voucher, _lines = await _signed_voucher(db, tenant.id)
    old_voucher_url = f"/api/v1/finance/vouchers/verify/{voucher.verification_id}"
    old_inventory_url = f"/api/v1/inventory/documents/verify/{voucher.verification_id.lower()}"
    browser = {"Accept": "text/html,application/xhtml+xml,*/*;q=0.8"}

    async with public_client(db) as ac:
        for url in (old_voucher_url, old_inventory_url):
            r = await ac.get(url, headers=browser, follow_redirects=False)
            assert r.status_code == 302, r.text
            assert r.headers["location"] == f"/verify/document/{voucher.verification_id}"
        # A non-browser call without login is not redirected (still rejected as before).
        assert (await ac.get(old_voucher_url, follow_redirects=False)).status_code != 302

    async with api_client(db, user, tenant) as ac:
        r = await ac.get(old_voucher_url, headers={**browser, "Authorization": "Bearer test"}, follow_redirects=False)
        assert r.status_code == 200, r.text
        assert r.json()["is_valid"] is True and r.json()["voucher_id"] == voucher.id


@pytest.mark.asyncio
async def test_proforma_verification_is_public(db_session_integration):
    db = db_session_integration
    tenant, _user, _wh, _vendor, _item = await seed_inventory_chain(db)
    token = secrets.token_urlsafe(32)
    db.add(ProformaInvoice(tenant_id=tenant.id, reference=f"PI-{uuid.uuid4().hex[:6]}", amount=Decimal("5000"),
                           currency="USD", invoice_date=date(2026, 10, 1), verification_token=token))
    await db.flush()

    async with public_client(db) as ac:
        r = await ac.get("/api/v1/public/verify/proforma", params={"token": token})
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["valid"] is True and body["company_name"] == tenant.name and body["currency"] == "USD"
        assert body["amount"] == 5000.0
        assert (await ac.get("/api/v1/public/verify/proforma", params={"token": "nope"})).status_code == 404


@pytest.mark.asyncio
async def test_voucher_list_accepts_several_statuses(db_session_integration):
    db = db_session_integration
    tenant, user, _wh, _vendor, _item = await seed_inventory_chain(db)
    for st in ("DRAFT", "SUBMITTED", "CHECKED", "POSTED"):
        db.add(Voucher(tenant_id=tenant.id, voucher_number=f"MS-{st}-{uuid.uuid4().hex[:4]}", voucher_type="JOURNAL",
                       voucher_date=date(2026, 11, 2), status=st))
    await db.flush()

    async with api_client(db, user, tenant) as ac:
        r = await ac.get("/api/v1/finance/vouchers", params=[("status_filters", "SUBMITTED"), ("status_filters", "checked")])
        assert r.status_code == 200, r.text
        assert sorted(v["status"] for v in r.json()) == ["CHECKED", "SUBMITTED"]
        assert r.headers["X-Total-Count"] == "2"
        both = await ac.get("/api/v1/finance/vouchers", params=[("status_filter", "DRAFT"), ("status_filters", "POSTED")])
        assert both.status_code == 400
