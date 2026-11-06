"""Financier portal list endpoints: SQL-batched rewrite returns the same JSON as the old per-row code.

Covers /stock-collateral, /procurement-tracker, /raw-material-tracker and /order-book.
The `_old_*` functions are verbatim copies of the pre-rewrite per-row algorithms (reference only).

Run: docker compose exec backend pytest tests/test_perf_financier_equivalence.py -q
"""

from __future__ import annotations

import uuid
from contextlib import asynccontextmanager, contextmanager
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import event, select

from app.database import get_db
from app.external_access.constants import (
    FF_FINANCIER_PORTAL_ENABLED,
    PRINCIPAL_FINANCIER,
    ROLE_FINANCIER_VIEWER,
    SCOPE_FULL_FINANCIER_PORTAL,
)
from app.external_access.financier_portal import facility_selectors as fsel
from app.external_access.financier_portal.visibility_service import (
    _float_qty,
    build_order_finance_for_order,
    build_production_row_for_order,
)
from app.external_access.tokens import get_current_external_principal
from app.main import app
from app.models import BtbLc, Customer, MasterContract, Order, Tenant
from app.models.costing import Item, ItemCategory, ItemUnit
from app.models.external_access import ExternalFinancierAccess, ExternalPrincipal, ExternalPrincipalRole, ExternalRole
from app.models.facility import Facility, FacilityUtilization
from app.models.inventory import GoodsReceiving, GoodsReceivingItem, PurchaseOrder, PurchaseOrderItem, Warehouse
from app.models.production import HourlyProductionEntry, SewingLine, SewingLineStyleConfig
from app.models.tenant import TenantType

API = "/api/external/financier"


@contextmanager
def count_queries(db):
    """Count SQL statements sent to PostgreSQL while the block runs."""
    counter = {"n": 0}
    engine = db.bind.sync_engine

    def _on_execute(*_args, **_kwargs):
        counter["n"] += 1

    event.listen(engine, "before_cursor_execute", _on_execute)
    try:
        yield counter
    finally:
        event.remove(engine, "before_cursor_execute", _on_execute)


@asynccontextmanager
async def financier_client(db, principal):
    async def override_db():
        yield db

    async def override_principal():
        return principal

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_external_principal] = override_principal
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)
        app.dependency_overrides.pop(get_current_external_principal, None)


# ---------- Old (pre-rewrite) reference algorithms ----------


async def _old_procurement(db, tenant_id: int, party_id: int) -> list[dict]:
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    pos = await fsel.purchase_orders_for_btb_ids(db, tenant_id, btb_ids)
    items: list[dict] = []
    for po in pos:
        grn_rows = list(
            (
                await db.execute(
                    select(GoodsReceiving).where(
                        GoodsReceiving.tenant_id == tenant_id,
                        GoodsReceiving.purchase_order_id == po.id,
                    )
                )
            ).scalars().all()
        )
        posted = sum(1 for g in grn_rows if (g.status or "").upper() in {"POSTED", "APPROVED", "RECEIVED", "CLOSED"})
        items.append(
            {
                "purchase_order_id": po.id,
                "po_code": po.po_code,
                "supplier_name": po.supplier_name,
                "status": po.status,
                "currency": po.currency,
                "base_total_amount": float(po.base_total_amount or 0),
                "grn_count": len(grn_rows),
                "grn_posted_count": posted,
            }
        )
    return items


async def _old_stock_collateral(db, tenant_id: int, party_id: int) -> list[dict]:
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    pos = await fsel.purchase_orders_for_btb_ids(db, tenant_id, btb_ids)
    po_ids = [p.id for p in pos]
    poi_rows = list(
        (
            await db.execute(
                select(PurchaseOrderItem, PurchaseOrder)
                .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
                .where(PurchaseOrderItem.purchase_order_id.in_(po_ids))
            )
        ).all()
    )
    out: list[dict] = []
    for poi, po in poi_rows[:500]:
        item = await db.get(Item, poi.item_id)
        item = item if item is not None and item.tenant_id == tenant_id else None
        btb = await db.get(BtbLc, po.btb_lc_id) if po.btb_lc_id else None
        btb = btb if btb is not None and btb.tenant_id == tenant_id else None
        wh = await db.get(Warehouse, poi.warehouse_id) if poi.warehouse_id else None
        wh = wh if wh is not None and wh.tenant_id == tenant_id else None
        received = 0.0
        grns = list(
            (
                await db.execute(
                    select(GoodsReceiving.id).where(
                        GoodsReceiving.tenant_id == tenant_id,
                        GoodsReceiving.purchase_order_id == poi.purchase_order_id,
                    )
                )
            ).scalars().all()
        )
        for gid in grns:
            for gri in (
                await db.execute(
                    select(GoodsReceivingItem).where(
                        GoodsReceivingItem.goods_receiving_id == gid,
                        GoodsReceivingItem.item_id == poi.item_id,
                    )
                )
            ).scalars().all():
                received += float(gri.quantity or 0)
        ordered = float(poi.quantity or 0)
        unit = float(poi.unit_price or 0)
        out.append(
            {
                "purchase_order_code": po.po_code,
                "btb_lc_id": po.btb_lc_id,
                "btb_lc_reference": btb.reference if btb else None,
                "warehouse_name": wh.name if wh else None,
                "unit_price": round(unit, 4),
                "item_code": item.item_code if item else None,
                "item_name": item.name if item else str(poi.item_id),
                "ordered_qty": ordered,
                "received_qty": received,
                "open_qty": max(ordered - received, 0),
                "estimated_value_open": round(max(ordered - received, 0) * unit, 2),
            }
        )
    return out


async def _old_raw_material_rows(db, tenant_id: int, party_id: int) -> list[dict]:
    btb_ids = await fsel.linked_btb_lc_ids_for_party(db, tenant_id, party_id)
    pos = await fsel.purchase_orders_for_btb_ids(db, tenant_id, btb_ids)
    btb_map = {
        b.id: b
        for b in (
            await db.execute(select(BtbLc).where(BtbLc.tenant_id == tenant_id, BtbLc.id.in_(btb_ids)))
        ).scalars().all()
    }
    po_ids = [p.id for p in pos]
    poi_rows = list(
        (
            await db.execute(
                select(PurchaseOrderItem, PurchaseOrder)
                .join(PurchaseOrder, PurchaseOrderItem.purchase_order_id == PurchaseOrder.id)
                .where(PurchaseOrderItem.purchase_order_id.in_(po_ids))
            )
        ).all()
    )
    out: list[dict] = []
    for poi, po in poi_rows[:800]:
        btb_id = po.btb_lc_id
        btb = btb_map.get(int(btb_id)) if btb_id else None
        item = await db.get(Item, poi.item_id)
        if item is not None and item.tenant_id != tenant_id:
            item = None
        cat_name = None
        if item:
            cat = await db.get(ItemCategory, item.category_id)
            cat_name = cat.name if cat and cat.tenant_id == tenant_id else None
        wh = await db.get(Warehouse, poi.warehouse_id) if poi.warehouse_id else None
        if not wh and item and item.default_warehouse_id:
            wh = await db.get(Warehouse, item.default_warehouse_id)
        if wh is not None and wh.tenant_id != tenant_id:
            wh = None
        ordered = _float_qty(poi.quantity)
        received = 0.0
        gri_rows = list(
            (
                await db.execute(
                    select(GoodsReceivingItem).where(
                        GoodsReceivingItem.tenant_id == tenant_id,
                        GoodsReceivingItem.purchase_order_line_id == poi.id,
                    )
                )
            ).scalars().all()
        )
        for gri in gri_rows:
            received += _float_qty(gri.accepted_qty) or _float_qty(gri.received_qty)
        pending = max(ordered - received, 0.0)
        if pending <= 0.001 and ordered > 0:
            in_house = "fully_received"
        elif received > 0:
            in_house = "partial"
        else:
            in_house = "pending"
        order_code = None
        if poi.source_order_id:
            o = await db.get(Order, poi.source_order_id)
            order_code = o.order_code if o and o.tenant_id == tenant_id else None
        lc_open = bool(btb and (btb.status or "").upper() not in ("DRAFT", "CANCELLED"))
        out.append(
            {
                "purchase_order_id": po.id,
                "po_code": po.po_code,
                "order_code": order_code,
                "btb_lc_id": btb.id if btb else None,
                "btb_lc_reference": btb.reference if btb else None,
                "btb_lc_status": btb.status if btb else None,
                "btb_lc_opened": lc_open,
                "supplier_name": po.supplier_name,
                "material_category": cat_name,
                "item_code": item.item_code if item else str(poi.item_id),
                "item_name": item.name if item else None,
                "qty_ordered": round(ordered, 4),
                "qty_received": round(received, 4),
                "qty_pending": round(pending, 4),
                "warehouse_name": wh.name if wh else None,
                "in_house_status": in_house,
            }
        )
    return out


async def _old_order_book(db, tenant_id: int, party_id: int, limit: int, offset: int) -> tuple[list[dict], int]:
    btb_rows = await fsel.party_btb_lc_rows(db, tenant_id, party_id)
    order_btbs = await fsel.order_btb_links_for_party(db, tenant_id, btb_rows)
    oids = sorted(order_btbs.keys(), reverse=True)
    total = len(oids)
    items: list[dict] = []
    for oid in oids[offset : offset + limit]:
        fetched = (
            await db.execute(
                select(Order, Customer.name)
                .outerjoin(Customer, Order.customer_id == Customer.id)
                .where(Order.tenant_id == tenant_id, Order.id == oid)
            )
        ).first()
        if not fetched:
            continue
        o, name = fetched[0], fetched[1]
        prod = await build_production_row_for_order(db, tenant_id=tenant_id, order=o, buyer_name=name)
        fin = await build_order_finance_for_order(
            db, tenant_id=tenant_id, party_id=party_id, order_id=oid, order_btbs=order_btbs
        )
        items.append(
            {
                "id": o.id,
                "order_code": o.order_code,
                "buyer_name": name,
                "status": o.status,
                "quantity": o.quantity,
                "planned_shipment": None,
                "expected_delivery": o.delivery_date.isoformat() if o.delivery_date else None,
                "execution_status": o.status,
                "pipeline_status": o.pipeline_status,
                "sewing_pct": prod.get("sewing_pct"),
                "outstanding_finance": fin.get("outstanding_finance_amount") if fin else None,
                "finance_currency": fin.get("finance_currency") if fin else None,
            }
        )
    return items, total


# ---------- Seed ----------


async def _ensure_financier_role(db) -> ExternalRole:
    role = (await db.execute(select(ExternalRole).where(ExternalRole.code == ROLE_FINANCIER_VIEWER))).scalar_one_or_none()
    if role is None:
        role = ExternalRole(code=ROLE_FINANCIER_VIEWER, name="Financier viewer", principal_type=PRINCIPAL_FINANCIER)
        db.add(role)
        await db.flush()
    return role


async def _new_tenant(db, slug: str, suffix: str) -> Tenant:
    t = Tenant(
        name=f"Fin perf {suffix} {slug}",
        tenant_type=TenantType.both,
        is_active=True,
        company_code=f"FP{suffix}{slug}"[:18].upper(),
        feature_flags={FF_FINANCIER_PORTAL_ENABLED: True},
    )
    db.add(t)
    await db.flush()
    return t


async def _seed(db, *, extra_po_lines: int = 0):
    """Tenant A with a financier principal + BTB chain; tenant B reuses A's party id to prove isolation."""
    slug = uuid.uuid4().hex[:8]
    today = date.today()
    role = await _ensure_financier_role(db)
    ta = await _new_tenant(db, slug, "A")
    tb = await _new_tenant(db, slug, "B")

    principal = ExternalPrincipal(
        tenant_id=ta.id,
        principal_type=PRINCIPAL_FINANCIER,
        email=f"fin.{slug}@test.local",
        password_hash="x",
        full_name="Perf Financier",
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

    # Tenant B master data (used for cross-tenant references and isolation rows).
    cat_b = ItemCategory(tenant_id=tb.id, category_code=f"CB{slug}", name="B category")
    unit_b = ItemUnit(tenant_id=tb.id, unit_code=f"UB{slug}", name="Pcs")
    wh_b = Warehouse(tenant_id=tb.id, warehouse_code=f"WB{slug}", name="B store")
    db.add_all([cat_b, unit_b, wh_b])
    await db.flush()
    item_b = Item(tenant_id=tb.id, item_code=f"IB{slug}", name="B item", category_id=cat_b.id, unit_id=unit_b.id)
    db.add(item_b)
    await db.flush()

    cat1 = ItemCategory(tenant_id=ta.id, category_code=f"C1{slug}", name="Fabric")
    cat2 = ItemCategory(tenant_id=ta.id, category_code=f"C2{slug}", name="Trims")
    unit = ItemUnit(tenant_id=ta.id, unit_code=f"U{slug}", name="Yard")
    w1 = Warehouse(tenant_id=ta.id, warehouse_code=f"W1{slug}", name="Main store")
    w2 = Warehouse(tenant_id=ta.id, warehouse_code=f"W2{slug}", name="Default store")
    db.add_all([cat1, cat2, unit, w1, w2])
    await db.flush()
    i1 = Item(tenant_id=ta.id, item_code=f"I1{slug}", name="Twill", category_id=cat1.id, unit_id=unit.id, default_warehouse_id=w2.id)
    i2 = Item(tenant_id=ta.id, item_code=f"I2{slug}", name="Button", category_id=cat2.id, unit_id=unit.id)
    i3 = Item(tenant_id=ta.id, item_code=f"I3{slug}", name="Odd cat", category_id=cat_b.id, unit_id=unit.id)
    db.add_all([i1, i2, i3])
    await db.flush()

    cust = Customer(tenant_id=ta.id, customer_code=f"CU{slug}", name="Buyer One", status="active")
    db.add(cust)
    await db.flush()
    mc = MasterContract(tenant_id=ta.id, reference=f"MC-{slug}", status="OPEN", contract_type="EXPORT_LC", amount=1000, currency="USD")
    db.add(mc)
    await db.flush()
    orders = []
    for n in range(4):
        o = Order(
            tenant_id=ta.id,
            customer_id=cust.id,
            order_code=f"ORD{n}-{slug}",
            status="CONFIRMED",
            pipeline_status="ORDER_CONFIRMED",
            master_contract_id=mc.id if n < 2 else None,
            order_date=today,
            delivery_date=today + timedelta(days=30 + n) if n != 1 else None,
            quantity=1000 if n != 3 else 0,
        )
        db.add(o)
        orders.append(o)
    await db.flush()
    o1, o2, o3, o4 = orders

    btb1 = BtbLc(tenant_id=ta.id, reference=f"BTB1-{slug}", status="OPEN", amount=500, currency="USD", master_contract_id=mc.id)
    btb2 = BtbLc(tenant_id=ta.id, reference=f"BTB2-{slug}", status="draft", amount=300, currency="USD")
    btb3 = BtbLc(tenant_id=ta.id, reference=f"BTB3-{slug}", status="OPEN", amount=100, currency="USD")
    db.add_all([btb1, btb2, btb3])
    await db.flush()

    fac = Facility(
        tenant_id=ta.id,
        facility_code=f"F{slug}",
        facility_type="btb_finance",
        financier_party_id=party_id,
        linked_btb_lc_id=btb1.id,
        status="active",
    )
    db.add(fac)
    await db.flush()
    db.add_all(
        [
            FacilityUtilization(
                tenant_id=ta.id, facility_id=fac.id, utilization_code=f"U1{slug}", linked_btb_lc_id=btb2.id,
                principal_amount=1000, outstanding_principal=400, currency="USD",
            ),
            FacilityUtilization(
                tenant_id=ta.id, facility_id=fac.id, utilization_code=f"U2{slug}", linked_btb_lc_id=btb1.id,
                principal_amount=500, outstanding_principal=500, currency=None,
            ),
            FacilityUtilization(
                tenant_id=ta.id, facility_id=fac.id, utilization_code=f"U3{slug}", linked_btb_lc_id=btb1.id,
                principal_amount=Decimal("250.50"), outstanding_principal=Decimal("100.25"), currency="EUR",
            ),
        ]
    )

    def _po(code, btb, source_order=None, status="APPROVED", total=None):
        return PurchaseOrder(
            tenant_id=ta.id,
            po_code=f"{code}-{slug}",
            supplier_name=f"Supplier {code}",
            status=status,
            btb_lc_id=btb.id if btb else None,
            source_order_id=source_order.id if source_order else None,
            base_total_amount=total,
        )

    po1 = _po("PO1", btb1, o1, total=Decimal("1234.50"))
    po2 = _po("PO2", btb2, o3, status="DRAFT")
    po3 = _po("PO3", btb1)
    po4 = _po("PO4", btb3)
    db.add_all([po1, po2, po3, po4])
    await db.flush()

    def _line(po, item, qty, price="0", wh=None, source_order=None):
        return PurchaseOrderItem(
            tenant_id=ta.id,
            purchase_order_id=po.id,
            item_id=item.id,
            warehouse_id=wh.id if wh else None,
            quantity=Decimal(qty),
            unit_price=Decimal(price),
            source_order_id=source_order.id if source_order else None,
        )

    def _grn(code, po, status, tenant=ta):
        return GoodsReceiving(tenant_id=tenant.id, grn_code=f"{code}-{slug}", purchase_order_id=po.id, status=status)

    l1 = _line(po1, i1, "100", "2.5", w1, o1)
    l2 = _line(po1, i2, "50", "0.75", None, o1)
    l3 = _line(po1, i1, "10", "2.5", None)
    l4 = _line(po2, i3, "200", "1.125", wh_b, o3)
    l5 = _line(po2, item_b, "5", "9", w1, o4)
    l6 = _line(po3, i2, "0", "1")
    l7 = _line(po4, i1, "999", "1", w1)
    db.add_all([l1, l2, l3, l4, l5, l6, l7])
    for n in range(extra_po_lines):
        # Each extra line gets its own financed order and PO so every list grows by one row.
        extra_order = Order(tenant_id=ta.id, customer_id=cust.id, order_code=f"OX{n}-{slug}", status="CONFIRMED",
                            master_contract_id=mc.id, quantity=100 * (n + 1))
        db.add(extra_order)
        await db.flush()
        extra_po = _po(f"PX{n}", btb1, extra_order)
        db.add(extra_po)
        await db.flush()
        db.add(_line(extra_po, i2 if n % 2 else i1, str(10 * (n + 1)), "0.5", w1 if n % 3 else None, extra_order))
        db.add(_grn(f"GX{n}", extra_po, "POSTED"))
    await db.flush()

    g1 = _grn("G1", po1, "POSTED")
    g2 = _grn("G2", po1, "DRAFT")
    g3 = _grn("G3", po2, "approved")
    g4 = _grn("G4", po3, "RECEIVED")
    g_other = _grn("GB", po1, "POSTED", tenant=tb)
    db.add_all([g1, g2, g3, g4, g_other])
    await db.flush()

    def _gri(grn, item, qty, line, accepted=None, received=None, tenant=ta):
        return GoodsReceivingItem(
            tenant_id=tenant.id,
            goods_receiving_id=grn.id,
            item_id=item.id,
            warehouse_id=w1.id,
            quantity=Decimal(qty),
            purchase_order_line_id=line.id if line else None,
            accepted_qty=accepted,
            received_qty=received,
        )

    db.add_all(
        [
            _gri(g1, i1, "60.5", l1, accepted="60.5", received="61"),
            _gri(g1, i1, "20", l3, accepted=None, received="1,000.25"),
            _gri(g2, i2, "50", l2, accepted="abc", received="50"),
            _gri(g3, i3, "0.25", l4, accepted="0", received="0.25"),
            _gri(g4, i1, "7", None),
            _gri(g_other, i1, "999", l1, accepted="999", tenant=tb),
        ]
    )

    line = SewingLine(tenant_id=ta.id, line_code=f"L{slug}", name="Line 1")
    db.add(line)
    await db.flush()
    db.add_all(
        [
            SewingLineStyleConfig(tenant_id=ta.id, line_id=line.id, order_id=o1.id, start_date=today,
                                  status="running", planned_qty=1000, completed_qty=250),
            SewingLineStyleConfig(tenant_id=ta.id, line_id=line.id, order_id=o1.id, start_date=today,
                                  status="completed", planned_qty=0, completed_qty=0),
            SewingLineStyleConfig(tenant_id=ta.id, line_id=line.id, order_id=o3.id, start_date=today,
                                  status="Completed", planned_qty=500, completed_qty=600),
            HourlyProductionEntry(tenant_id=ta.id, department_type="sewing", order_id=o2.id,
                                  production_date=today, hour_slot=1, good_qty=120),
            HourlyProductionEntry(tenant_id=ta.id, department_type="SEW", order_id=o2.id,
                                  production_date=today, hour_slot=2, good_qty=180),
            HourlyProductionEntry(tenant_id=ta.id, department_type="finishing", order_id=o2.id,
                                  production_date=today, hour_slot=1, good_qty=100),
        ]
    )

    # Tenant B: same party id on its own facility / BTB / PO. None of this may leak into tenant A.
    btb_b = BtbLc(tenant_id=tb.id, reference=f"BTBB-{slug}", status="OPEN", amount=1, currency="USD")
    db.add(btb_b)
    await db.flush()
    fac_b = Facility(tenant_id=tb.id, facility_code=f"FB{slug}", facility_type="btb_finance",
                     financier_party_id=party_id, linked_btb_lc_id=btb_b.id, status="active")
    db.add(fac_b)
    po_b = PurchaseOrder(tenant_id=tb.id, po_code=f"POB-{slug}", supplier_name="B supplier", status="APPROVED", btb_lc_id=btb_b.id)
    db.add(po_b)
    await db.flush()
    db.add(PurchaseOrderItem(tenant_id=tb.id, purchase_order_id=po_b.id, item_id=item_b.id, quantity=Decimal("3")))
    await db.flush()
    await db.commit()
    return {
        "tenant": ta,
        "principal": principal,
        "party_id": party_id,
        "orders": orders,
        "pos": [po1, po2, po3, po4],
        "po_b": po_b,
    }


def _json(rows):
    """Round-trip helper so old (Python) rows compare like HTTP JSON."""
    import json

    return json.loads(json.dumps(rows, default=str))


@pytest.mark.asyncio
async def test_financier_lists_match_old_algorithm(db_session_integration):
    db = db_session_integration
    s = await _seed(db)
    tid, party_id = s["tenant"].id, s["party_id"]
    po1, po2, po3, po4 = s["pos"]

    async with financier_client(db, s["principal"]) as ac:
        r = await ac.get(f"{API}/procurement-tracker")
        assert r.status_code == 200, r.text
        proc = r.json()["items"]
        assert proc == _json(await _old_procurement(db, tid, party_id))
        by_code = {p["po_code"]: p for p in proc}
        assert set(by_code) == {po1.po_code, po2.po_code, po3.po_code}
        assert (by_code[po1.po_code]["grn_count"], by_code[po1.po_code]["grn_posted_count"]) == (2, 1)
        assert (by_code[po2.po_code]["grn_count"], by_code[po2.po_code]["grn_posted_count"]) == (1, 1)
        assert by_code[po1.po_code]["base_total_amount"] == 1234.5

        r = await ac.get(f"{API}/stock-collateral")
        assert r.status_code == 200, r.text
        coll = r.json()["items"]
        assert coll == _json(await _old_stock_collateral(db, tid, party_id))
        assert len(coll) == 6
        assert all(c["purchase_order_code"] != s["po_b"].po_code for c in coll)
        po1_twill = [c for c in coll if c["purchase_order_code"] == po1.po_code and c["item_name"] == "Twill"]
        assert [c["received_qty"] for c in po1_twill] == [80.5, 80.5]
        assert sorted(c["open_qty"] for c in po1_twill) == [0, 19.5]
        cross = [c for c in coll if c["purchase_order_code"] == po2.po_code]
        assert {c["warehouse_name"] for c in cross} == {None, "Main store"}
        assert any(c["item_code"] is None for c in cross)

        r = await ac.get(f"{API}/raw-material-tracker")
        assert r.status_code == 200, r.text
        raw = r.json()
        assert raw["note"] is None
        assert raw["items"] == _json(await _old_raw_material_rows(db, tid, party_id))
        by_qty = {(x["po_code"], x["qty_ordered"]): x for x in raw["items"]}
        assert by_qty[(po1.po_code, 100.0)]["qty_received"] == 60.5
        assert by_qty[(po1.po_code, 100.0)]["in_house_status"] == "partial"
        assert by_qty[(po1.po_code, 10.0)]["warehouse_name"] == "Default store"
        assert by_qty[(po1.po_code, 10.0)]["in_house_status"] == "fully_received"
        assert by_qty[(po1.po_code, 50.0)]["qty_received"] == 50.0
        assert by_qty[(po2.po_code, 200.0)]["material_category"] is None
        assert by_qty[(po2.po_code, 200.0)]["btb_lc_opened"] is False
        assert by_qty[(po2.po_code, 5.0)]["item_name"] is None
        assert by_qty[(po3.po_code, 0.0)]["in_house_status"] == "pending"

        for limit, offset in ((50, 0), (2, 0), (2, 1), (5, 10)):
            r = await ac.get(f"{API}/order-book", params={"limit": limit, "offset": offset})
            assert r.status_code == 200, r.text
            old_items, old_total = await _old_order_book(db, tid, party_id, limit, offset)
            body = r.json()
            assert body["total"] == old_total
            got = [{k: v for k, v in row.items() if k in old_items[0]} for row in body["items"]] if old_items else body["items"]
            assert got == _json(old_items)

        r = await ac.get(f"{API}/order-book")
        book = {row["order_code"]: row for row in r.json()["items"]}
        o1, o2, o3, o4 = s["orders"]
        assert set(book) == {o1.order_code, o2.order_code, o3.order_code}
        assert book[o1.order_code]["sewing_pct"] == 25.0
        assert book[o2.order_code]["sewing_pct"] == 30.0
        assert book[o3.order_code]["sewing_pct"] == 100.0
        assert book[o1.order_code]["outstanding_finance"] == 600.25
        assert book[o1.order_code]["finance_currency"] == "EUR"
        assert book[o3.order_code]["outstanding_finance"] == 400.0


@pytest.mark.asyncio
async def test_financier_query_counts(db_session_integration):
    """Query count must not grow with the number of PO lines / orders."""
    db = db_session_integration
    counts: dict[str, list[int]] = {}
    for extra in (0, 10):
        s = await _seed(db, extra_po_lines=extra)
        async with financier_client(db, s["principal"]) as ac:
            for path in ("stock-collateral", "raw-material-tracker", "procurement-tracker", "order-book"):
                db.expunge_all()
                with count_queries(db) as c:
                    r = await ac.get(f"{API}/{path}")
                assert r.status_code == 200, r.text
                counts.setdefault(path, []).append(c["n"])
    print("financier query counts (base seed, base + 10 POs/orders):", counts)
    for path, (small, large) in counts.items():
        assert large == small, f"{path}: {small} -> {large} queries"
