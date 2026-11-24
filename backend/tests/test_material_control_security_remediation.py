"""MC-SEC remediations: DN finance gate, RTV request_id replay, claim settle terminal.

Run: docker compose exec -T backend pytest tests/test_material_control_security_remediation.py -q
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.inventory import StockMovement
from app.models.material_control_alloc import PrincipalMaterialClaim
from app.services.fifo_inventory import finalize_movement_fifo

from tests.go_live_fixtures import create_admin_tenant_with_user, seed_inventory_chain
from tests.mfg_alloc_fixtures import add_grn_line, add_po

API = "/api/v1/material-control"


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


async def _seed_stock(db, tenant, wh, item, qty: str = "50"):
    mv = StockMovement(
        tenant_id=tenant.id,
        item_id=item.id,
        warehouse_id=wh.id,
        movement_type="IN",
        quantity=Decimal(qty),
        movement_date=date.today(),
        reference_type="TEST",
        movement_kind="TEST_IN",
    )
    db.add(mv)
    await db.flush()
    await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=10.0)
    return mv


@pytest.mark.asyncio
async def test_draft_dn_stub_ok_without_finance_fields(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    po, po_line = await add_po(db, tenant, vendor, item, "5")
    grn_line = await add_grn_line(db, tenant, po, po_line, wh, received="5", accepted="5")
    grn_id = grn_line.goods_receiving_id  # real GRN of this tenant (the draft DN refuses unknown GRNs)
    flags = dict(tenant.feature_flags or {})
    flags["material_inbound_v2"] = True
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/draft-dn-from-grn-reject",
                json={"grn_id": grn_id, "rejected_qty": "2", "amount": "0"},
            )
            assert res.status_code == 200, res.text
            assert res.json()["status"] == "DRAFT_STUB"
            assert res.json()["voucher_id"] is None
    finally:
        _clear()


@pytest.mark.asyncio
async def test_draft_dn_create_requires_credit_debit_flag(db_session_integration):
    """Inventory admin without credit_debit_note_enabled cannot mint a DN voucher."""
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    po, po_line = await add_po(db, tenant, vendor, item, "5")
    grn_line = await add_grn_line(db, tenant, po, po_line, wh, received="5", accepted="5")
    grn_id = grn_line.goods_receiving_id  # real GRN of this tenant
    flags = dict(tenant.feature_flags or {})
    flags["material_inbound_v2"] = True
    flags.pop("credit_debit_note_enabled", None)
    tenant.feature_flags = flags
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/draft-dn-from-grn-reject",
                json={
                    "grn_id": grn_id,
                    "rejected_qty": "2",
                    "amount": "10",
                    "party_ledger_id": 1,
                    "original_bill_id": 1,
                    "revenue_or_purchase_account_id": 1,
                },
            )
            assert res.status_code == 403, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_rtv_request_id_replay_same_row(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_returns_v1"] = True
    tenant.feature_flags = flags
    await _seed_stock(db, tenant, wh, item, "20")
    await db.commit()
    payload = {
        "vendor_id": vendor.id,
        "warehouse_id": wh.id,
        "lines": [{"item_id": item.id, "qty": "2"}],
        "request_id": "rtv-sec-replay-1",
    }
    try:
        async with await _api_client(db, tenant, user) as ac:
            r1 = await ac.post(f"{API}/rtv", json=payload)
            assert r1.status_code == 200, r1.text
            r2 = await ac.post(f"{API}/rtv", json=payload)
            assert r2.status_code == 200, r2.text
            assert r1.json()["id"] == r2.json()["id"]
    finally:
        _clear()


@pytest.mark.asyncio
async def test_draft_dn_denied_without_finance_module_under_authority(db_session_integration):
    """MC-SEC-R01: inventory grant alone must not mint DN when authority classes are on."""
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    flags = dict(tenant.feature_flags or {})
    flags["material_inbound_v2"] = True
    flags["credit_debit_note_enabled"] = True
    flags["user_authority_classes_v1"] = True
    tenant.feature_flags = flags
    user.is_tenant_super_admin = False
    user.authority_class = "CLASS_3"
    await db.flush()
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            res = await ac.post(
                f"{API}/draft-dn-from-grn-reject",
                json={
                    "grn_id": 1,
                    "rejected_qty": "2",
                    "amount": "10",
                    "party_ledger_id": 1,
                    "original_bill_id": 1,
                    "revenue_or_purchase_account_id": 1,
                },
            )
            assert res.status_code == 403, res.text
    finally:
        _clear()


@pytest.mark.asyncio
async def test_claim_settle_twice_409(db_session_integration):
    db = db_session_integration
    tenant, user, *_ = await seed_inventory_chain(db)
    from app.models.customer import Customer

    flags = dict(tenant.feature_flags or {})
    flags["material_physical_v1"] = True
    tenant.feature_flags = flags
    cust = Customer(tenant_id=tenant.id, name="Principal Factory", customer_code="PF-SEC-1")
    db.add(cust)
    await db.flush()
    await db.commit()
    try:
        async with await _api_client(db, tenant, user) as ac:
            created = await ac.post(
                f"{API}/principal-claims",
                json={"customer_id": cust.id, "amount": "100", "request_id": "claim-sec-1"},
            )
            assert created.status_code == 200, created.text
            cid = created.json()["id"]
            s1 = await ac.post(f"{API}/principal-claims/{cid}/settle", json={"amount": "100"})
            assert s1.status_code == 200, s1.text
            s2 = await ac.post(f"{API}/principal-claims/{cid}/settle", json={"amount": "50"})
            assert s2.status_code == 409, s2.text
            row = await db.get(PrincipalMaterialClaim, cid)
            assert row is not None and row.status == "SETTLED"
    finally:
        _clear()
