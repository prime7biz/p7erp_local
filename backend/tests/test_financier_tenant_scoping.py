"""Financier portal: another tenant's buyer names and master-contract dates never leak.

The seed links tenant A records to tenant B rows on purpose (an order whose customer_id and a BTB LC
whose master_contract_id point into tenant B). Every financier screen must show "no value" there,
never tenant B's data. The second test proves the batched ``order_btb_links_for_party`` returns the
same mapping as the old one-query-per-BTB-LC version.

Run: docker compose exec backend pytest tests/test_financier_tenant_scoping.py -q
"""

from __future__ import annotations

import uuid
from collections import defaultdict
from datetime import date, datetime

import pytest
from sqlalchemy import select

from app.external_access.constants import PRINCIPAL_FINANCIER, SCOPE_FULL_FINANCIER_PORTAL
from app.external_access.financier_portal import facility_selectors as fsel
from app.models import BtbLc, Customer, MasterContract, Order
from app.models.external_access import ExternalFinancierAccess, ExternalPrincipal, ExternalPrincipalRole
from app.models.facility import Facility, FacilityUtilization
from app.models.inventory import PurchaseOrder
from tests.test_perf_financier_equivalence import (
    _ensure_financier_role,
    _new_tenant,
    count_queries,
    financier_client,
)

API = "/api/external/financier"
SECRET_EXPIRY = date(2031, 7, 19)
OWN_EXPIRY = date(2030, 1, 15)


async def _old_order_btb_links_for_party(db, tenant_id: int, btb_rows: list[BtbLc]) -> dict[int, set[int]]:
    """Frozen copy of the pre-batching algorithm (one query per BTB LC). Reference only."""
    out: dict[int, set[int]] = defaultdict(set)
    if not btb_rows:
        return dict(out)
    btb_ids = [b.id for b in btb_rows]
    for b in btb_rows:
        if b.master_contract_id:
            r = await db.execute(
                select(Order.id).where(
                    Order.tenant_id == tenant_id,
                    Order.master_contract_id == b.master_contract_id,
                )
            )
            for (oid,) in r.all():
                out[int(oid)].add(int(b.id))
    pr = await db.execute(
        select(PurchaseOrder.source_order_id, PurchaseOrder.btb_lc_id).where(
            PurchaseOrder.tenant_id == tenant_id,
            PurchaseOrder.btb_lc_id.in_(btb_ids),
            PurchaseOrder.source_order_id.isnot(None),
        )
    )
    for soid, bid in pr.all():
        if soid and bid:
            out[int(soid)].add(int(bid))
    return dict(out)


async def _seed(db):
    slug = uuid.uuid4().hex[:8]
    role = await _ensure_financier_role(db)
    ta = await _new_tenant(db, slug, "TA")
    tb = await _new_tenant(db, slug, "TB")

    principal = ExternalPrincipal(
        tenant_id=ta.id,
        principal_type=PRINCIPAL_FINANCIER,
        email=f"scope.{slug}@test.local",
        password_hash="x",
        full_name="Scope Financier",
        is_active=True,
        accepted_at=datetime.utcnow(),
    )
    db.add(principal)
    await db.flush()
    party_id = principal.id
    db.add(ExternalPrincipalRole(external_principal_id=principal.id, role_id=role.id))
    db.add(
        ExternalFinancierAccess(
            tenant_id=ta.id,
            external_principal_id=principal.id,
            financier_party_id=party_id,
            access_scope=SCOPE_FULL_FINANCIER_PORTAL,
        )
    )

    secret_buyer = f"Secret Buyer B {slug}"
    secret_mc_ref = f"MC-SECRET-{slug}"
    cust_b = Customer(tenant_id=tb.id, customer_code=f"CB{slug}", name=secret_buyer, status="active")
    cust_a = Customer(tenant_id=ta.id, customer_code=f"CA{slug}", name=f"Buyer A {slug}", status="active")
    db.add_all([cust_a, cust_b])
    await db.flush()
    mc_b = MasterContract(
        tenant_id=tb.id, reference=secret_mc_ref, status="OPEN", contract_type="EXPORT_LC",
        amount=1, currency="USD", expiry_date=SECRET_EXPIRY,
    )
    mc_a = MasterContract(
        tenant_id=ta.id, reference=f"MC-A-{slug}", status="OPEN", contract_type="EXPORT_LC",
        amount=1000, currency="USD", expiry_date=OWN_EXPIRY,
    )
    db.add_all([mc_a, mc_b])
    await db.flush()

    # Tenant B order on its own contract: must never show up for tenant A's financier.
    db.add(Order(tenant_id=tb.id, customer_id=cust_b.id, order_code=f"ORD-B-{slug}", status="CONFIRMED",
                 master_contract_id=mc_b.id, quantity=10))
    o_leak = Order(tenant_id=ta.id, customer_id=cust_b.id, order_code=f"ORD-LEAK-{slug}", status="CONFIRMED",
                   master_contract_id=mc_a.id, quantity=100)
    o_ok = Order(tenant_id=ta.id, customer_id=cust_a.id, order_code=f"ORD-OK-{slug}", status="CONFIRMED",
                 master_contract_id=mc_a.id, quantity=200)
    db.add_all([o_leak, o_ok])
    await db.flush()

    # btb_cross points at tenant B's master contract; btb_own at tenant A's.
    btb_cross = BtbLc(tenant_id=ta.id, reference=f"BTB-X-{slug}", status="OPEN", amount=50, currency="USD",
                      master_contract_id=mc_b.id)
    btb_own = BtbLc(tenant_id=ta.id, reference=f"BTB-A-{slug}", status="OPEN", amount=80, currency="USD",
                    master_contract_id=mc_a.id)
    db.add_all([btb_cross, btb_own])
    await db.flush()
    fac = Facility(tenant_id=ta.id, facility_code=f"FS{slug}", facility_type="btb_finance",
                   financier_party_id=party_id, linked_btb_lc_id=btb_cross.id,
                   linked_master_contract_id=mc_b.id, status="active")
    db.add(fac)
    await db.flush()
    db.add(FacilityUtilization(tenant_id=ta.id, facility_id=fac.id, utilization_code=f"US{slug}",
                               linked_btb_lc_id=btb_own.id, principal_amount=500, outstanding_principal=200,
                               currency="USD"))
    await db.flush()
    await db.commit()
    return {
        "tenant": ta, "tenant_b": tb, "principal": principal, "party_id": party_id,
        "o_leak": o_leak, "o_ok": o_ok, "btb_cross": btb_cross, "btb_own": btb_own,
        "secret_buyer": secret_buyer, "secret_mc_ref": secret_mc_ref, "buyer_a": cust_a.name,
    }


def _assert_no_secrets(text: str, s: dict) -> None:
    assert s["secret_buyer"] not in text
    assert s["secret_mc_ref"] not in text
    assert SECRET_EXPIRY.isoformat() not in text


@pytest.mark.asyncio
async def test_financier_screens_never_show_other_tenant_buyer_or_contract(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    o_leak, o_ok = s["o_leak"], s["o_ok"]

    async with financier_client(db, s["principal"]) as ac:
        r = await ac.get(f"{API}/production-tracker")
        assert r.status_code == 200, r.text
        _assert_no_secrets(r.text, s)
        rows = {x["order_code"]: x for x in r.json()["items"]}
        assert rows[o_leak.order_code]["buyer_name"] is None
        assert rows[o_ok.order_code]["buyer_name"] == s["buyer_a"]

        r = await ac.get(f"{API}/financial-visibility")
        assert r.status_code == 200, r.text
        _assert_no_secrets(r.text, s)
        by_btb = {x["btb_lc_id"]: x for x in r.json()["items"]}
        assert by_btb[s["btb_cross"].id]["expected_collection_date"] is None
        assert by_btb[s["btb_own"].id]["expected_collection_date"] == OWN_EXPIRY.isoformat()

        r = await ac.get(f"{API}/order-finance")
        assert r.status_code == 200, r.text
        _assert_no_secrets(r.text, s)
        rows = {x["order_code"]: x for x in r.json()["items"]}
        assert rows[o_leak.order_code]["buyer_name"] is None
        assert rows[o_ok.order_code]["buyer_name"] == s["buyer_a"]

        r = await ac.get(f"{API}/order-book")
        assert r.status_code == 200, r.text
        _assert_no_secrets(r.text, s)
        rows = {x["order_code"]: x for x in r.json()["items"]}
        assert set(rows) == {o_leak.order_code, o_ok.order_code}
        assert rows[o_leak.order_code]["buyer_name"] is None

        for oid in (o_leak.id, o_ok.id):
            r = await ac.get(f"{API}/orders/{oid}", params={"include_production_detail": "true"})
            assert r.status_code == 200, r.text
            _assert_no_secrets(r.text, s)
        assert (await ac.get(f"{API}/orders/{o_leak.id}")).json()["buyer_name"] is None

        r = await ac.get(f"{API}/credit-lines")
        assert r.status_code == 200, r.text
        _assert_no_secrets(r.text, s)
        assert r.json()["items"][0]["master_contract_reference"] is None

        for path in ("recovery-outlook", "btb-liabilities", "alerts", "dashboard"):
            r = await ac.get(f"{API}/{path}")
            assert r.status_code == 200, (path, r.text)
            _assert_no_secrets(r.text, s)


@pytest.mark.asyncio
async def test_order_btb_links_batched_matches_old_and_uses_two_queries(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    tid, party_id = s["tenant"].id, s["party_id"]
    ta_id = tid
    o_leak, o_ok = s["o_leak"], s["o_ok"]

    # More shapes: two BTB LCs on one contract, a BTB LC without contract, PO links (one overlapping
    # a contract link), a PO without source order and a tenant B PO on tenant A's BTB LC.
    mc_id = s["btb_own"].master_contract_id
    btb_same_mc = BtbLc(tenant_id=ta_id, reference=f"BTB-S-{uuid.uuid4().hex[:6]}", status="OPEN",
                        amount=1, currency="USD", master_contract_id=mc_id)
    btb_no_mc = BtbLc(tenant_id=ta_id, reference=f"BTB-N-{uuid.uuid4().hex[:6]}", status="OPEN",
                      amount=1, currency="USD")
    db.add_all([btb_same_mc, btb_no_mc])
    await db.flush()
    o_po = Order(tenant_id=ta_id, customer_id=o_ok.customer_id, order_code=f"ORD-PO-{uuid.uuid4().hex[:6]}",
                 status="CONFIRMED", quantity=5)
    db.add(o_po)
    await db.flush()
    db.add_all(
        [
            PurchaseOrder(tenant_id=ta_id, po_code=f"P1-{o_po.id}", supplier_name="S", status="APPROVED",
                          btb_lc_id=btb_no_mc.id, source_order_id=o_po.id),
            PurchaseOrder(tenant_id=ta_id, po_code=f"P2-{o_po.id}", supplier_name="S", status="APPROVED",
                          btb_lc_id=btb_no_mc.id, source_order_id=o_ok.id),
            PurchaseOrder(tenant_id=ta_id, po_code=f"P3-{o_po.id}", supplier_name="S", status="APPROVED",
                          btb_lc_id=btb_no_mc.id, source_order_id=None),
            PurchaseOrder(tenant_id=s["tenant_b"].id, po_code=f"P4-{o_po.id}", supplier_name="S",
                          status="APPROVED", btb_lc_id=btb_same_mc.id, source_order_id=o_leak.id),
        ]
    )
    await db.flush()

    btb_rows = await fsel.party_btb_lc_rows(db, tid, party_id) + [btb_same_mc, btb_no_mc]
    old = await _old_order_btb_links_for_party(db, tid, btb_rows)
    with count_queries(db) as c:
        new = await fsel.order_btb_links_for_party(db, tid, btb_rows)
    assert new == old
    assert c["n"] == 2
    assert new[o_ok.id] == {s["btb_own"].id, btb_same_mc.id, btb_no_mc.id}
    assert new[o_po.id] == {btb_no_mc.id}

    assert await fsel.order_btb_links_for_party(db, tid, []) == await _old_order_btb_links_for_party(db, tid, []) == {}
    only_no_mc = [btb_no_mc]
    assert await fsel.order_btb_links_for_party(db, tid, only_no_mc) == await _old_order_btb_links_for_party(
        db, tid, only_no_mc
    )
