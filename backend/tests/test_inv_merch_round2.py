"""Round 2 inventory / merchandising / manufacturing / procurement race and bulk fixes.

Concurrency tests use two (or three) real sessions that really commit, then delete the test tenant.
Run in Docker: docker compose exec backend pytest tests/test_inv_merch_round2.py -q
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import date
from decimal import Decimal

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import (
    Bom,
    BomItem,
    GoodsReceiving,
    ManufacturingProductionPlan,
    ManufacturingWorkOrder,
    OrderAmendment,
    PurchaseOrder,
    PurchaseOrderItem,
    Tenant,
    User,
)
from app.models.inventory import Vendor
from app.models.procurement import (
    PurchaseRequisition,
    PurchaseRequisitionLine,
    SupplierQuotation,
    SupplierQuotationLine,
)
from tests.benchmark_fixtures import api_client, seed_item, seed_tenant_admin
from tests.conftest import _async_database_url
from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)


# ---------------------------------------------------------------------------
# Real-commit sessions (for concurrency) + cleanup
# ---------------------------------------------------------------------------


# Rows that block "DELETE FROM tenants" through ON DELETE RESTRICT links (deleted first, children first).
_RESTRICT_CHILD_TABLES = (
    "supplier_quotation_lines",
    "supplier_quotations",
    "purchase_requisition_lines",
    "purchase_requisitions",
    "purchase_order_items",
    "purchase_orders",
    "bom_items",
    "boms",
    "mfg_work_orders",
)


async def _purge_tenant(engine, tenant_id: int) -> None:
    """Delete one test tenant; everything else goes through ON DELETE CASCADE from tenants."""
    async with engine.begin() as conn:
        for table in _RESTRICT_CHILD_TABLES:
            await conn.execute(text(f"DELETE FROM {table} WHERE tenant_id = :t"), {"t": tenant_id})
        await conn.execute(text("DELETE FROM tenants WHERE id = :t"), {"t": tenant_id})


@pytest_asyncio.fixture
async def real_db():
    url = _async_database_url()
    if not url:
        pytest.skip("DATABASE_URL not set — run pytest inside the backend container with compose.")
    engine = create_async_engine(url, pool_size=6)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)
    tenant_ids: list[int] = []
    try:
        yield factory, tenant_ids.append
    finally:
        for tid in tenant_ids:
            await _purge_tenant(engine, tid)
        await engine.dispose()


async def _tenant_user(s: AsyncSession, tenant_id: int, user_id: int) -> tuple[Tenant, User]:
    return await s.get(Tenant, tenant_id), await s.get(User, user_id)


async def _seed_order(s: AsyncSession):
    tenant, user, _role = await create_merch_tenant_with_user(s)
    customer = await create_customer(s, tenant)
    style = await create_garment_style(s, tenant, customer)
    quotation, order = await create_quotation_and_order(s, tenant, customer, style)
    return tenant, user, style, quotation, order


# ---------------------------------------------------------------------------
# 1. Order amendment numbers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_order_amendments_get_distinct_numbers(real_db):
    from app.modules.orders.router import OrderAmendmentCreate, create_order_amendment

    factory, register = real_db
    async with factory() as s:
        tenant, user, _style, _q, order = await _seed_order(s)
        await s.commit()
        tenant_id, user_id, order_id = tenant.id, user.id, order.id
    register(tenant_id)

    async def attempt(n: int) -> int:
        async with factory() as s:
            t, u = await _tenant_user(s, tenant_id, user_id)
            row = await create_order_amendment(
                order_id, OrderAmendmentCreate(field_changed=f"field{n}"), tenant=t, user=u, db=s
            )
            await s.commit()
            return row.amendment_no

    numbers = await asyncio.gather(attempt(1), attempt(2), attempt(3))
    assert sorted(numbers) == [1, 2, 3]


@pytest.mark.asyncio
async def test_amendment_number_unique_index(db_session_integration):
    db = db_session_integration
    tenant, _user, _style, _q, order = await _seed_order(db)
    db.add(OrderAmendment(tenant_id=tenant.id, order_id=order.id, amendment_no=1, field_changed="a"))
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(OrderAmendment(tenant_id=tenant.id, order_id=order.id, amendment_no=1, field_changed="b"))
            await db.flush()


# ---------------------------------------------------------------------------
# 2. One active BOM per order
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_concurrent_bom_from_order_creates_one_active_bom(real_db):
    from app.modules.merch.routers.boms import CreateBomFromOrderBody, create_bom_from_order

    factory, register = real_db
    async with factory() as s:
        tenant, user, _style, _q, order = await _seed_order(s)
        await s.commit()
        tenant_id, user_id, order_id = tenant.id, user.id, order.id
    register(tenant_id)

    async def attempt():
        async with factory() as s:
            t, u = await _tenant_user(s, tenant_id, user_id)
            try:
                await create_bom_from_order(CreateBomFromOrderBody(order_id=order_id), tenant=t, user=u, db=s)
                await s.commit()
                return "created"
            except HTTPException as exc:
                await s.rollback()
                return exc

    results = await asyncio.gather(attempt(), attempt())
    errors = [r for r in results if isinstance(r, HTTPException)]
    assert len(errors) == 1, results
    assert errors[0].status_code in (400, 409)
    async with factory() as s:
        active = (
            await s.execute(
                select(func.count()).select_from(Bom).where(
                    Bom.tenant_id == tenant_id, Bom.order_id == order_id, Bom.is_active.is_(True)
                )
            )
        ).scalar()
    assert active == 1


@pytest.mark.asyncio
async def test_active_bom_partial_unique_index(db_session_integration):
    """Backstop index uq_boms_tenant_order_active (migration 154) behind the app-level order lock."""
    db = db_session_integration
    tenant, _user, style, _q, order = await _seed_order(db)

    def bom(active: bool) -> Bom:
        return Bom(
            tenant_id=tenant.id, style_id=style.id, order_id=order.id, status="DRAFT",
            is_active=active, bom_code=f"T-{uuid.uuid4().hex[:8]}",
        )

    db.add_all([bom(True), bom(False), bom(False)])
    await db.flush()
    # Style-only (classic) BOMs without an order are not limited.
    db.add_all([Bom(tenant_id=tenant.id, style_id=style.id, status="DRAFT", is_active=True) for _ in range(2)])
    await db.flush()
    with pytest.raises(IntegrityError):
        async with db.begin_nested():
            db.add(bom(True))
            await db.flush()


# ---------------------------------------------------------------------------
# 3. Manufacturing document codes
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_mfg_code_skips_manually_used_code(db_session_integration):
    from app.modules.manufacturing.codes import next_mfg_code

    db = db_session_integration
    tenant, _user = await seed_tenant_admin(db)

    async def next_code() -> str:
        return await next_mfg_code(
            db,
            model=ManufacturingProductionPlan,
            code_column=ManufacturingProductionPlan.plan_code,
            tenant_id=tenant.id,
            prefix="PLAN-",
        )

    first = await next_code()
    n = int(first.split("-")[1])
    db.add(
        ManufacturingProductionPlan(
            tenant_id=tenant.id, plan_code=f"PLAN-{n + 1:04d}", period_start=date(2026, 1, 1),
            period_end=date(2026, 1, 31), status="draft",
        )
    )
    await db.flush()
    assert await next_code() == f"PLAN-{n + 2:04d}"


@pytest.mark.asyncio
async def test_duplicate_manual_plan_code_returns_409_not_500(db_session_integration):
    # The duplicate request rolls the test transaction back, so it must be the last call.
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    body = {"plan_code": "PLAN-DUP", "period_start": "2026-01-01", "period_end": "2026-01-31", "lines": []}
    async with api_client(db, tenant, user) as ac:
        first = await ac.post("/api/v1/manufacturing/planning/production-plans", json=body)
        assert first.status_code == 201, first.text
        auto = await ac.post(
            "/api/v1/manufacturing/planning/production-plans",
            json={"period_start": "2026-01-01", "period_end": "2026-01-31", "lines": []},
        )
        assert auto.status_code == 201, auto.text
        assert auto.json()["plan_code"].startswith("PLAN-")
        dup = await ac.post("/api/v1/manufacturing/planning/production-plans", json=body)
        assert dup.status_code == 409, dup.text


@pytest.mark.asyncio
async def test_duplicate_manual_ncr_code_returns_409_not_500(db_session_integration):
    db = db_session_integration
    tenant, user = await seed_tenant_admin(db)
    item, _wh, _u = await seed_item(db, tenant.id, code="WO-ITEM")
    wo = ManufacturingWorkOrder(tenant_id=tenant.id, mo_number="MWO-MANUAL", item_id=item.id, qty_planned=10)
    db.add(wo)
    await db.flush()
    ncr_body = {"ncr_code": "NCR-DUP", "work_order_id": wo.id, "defect_code": "D1", "severity": "minor"}
    async with api_client(db, tenant, user) as ac:
        first = await ac.post("/api/v1/manufacturing/quality/ncrs", json=ncr_body)
        assert first.status_code == 201, first.text
        auto = await ac.post("/api/v1/manufacturing/quality/ncrs", json={**ncr_body, "ncr_code": None})
        assert auto.status_code == 201, auto.text
        assert auto.json()["ncr_code"].startswith("NCR-")
        dup = await ac.post("/api/v1/manufacturing/quality/ncrs", json=ncr_body)
        assert dup.status_code == 409, dup.text


@pytest.mark.asyncio
async def test_concurrent_auto_codes_are_distinct(real_db):
    from app.modules.manufacturing.planning_router import create_production_plan
    from app.modules.manufacturing.schemas import ProductionPlanCreate

    factory, register = real_db
    async with factory() as s:
        tenant, user = await seed_tenant_admin(s)
        await s.commit()
        tenant_id, user_id = tenant.id, user.id
    register(tenant_id)

    async def attempt() -> str:
        async with factory() as s:
            t, u = await _tenant_user(s, tenant_id, user_id)
            body = ProductionPlanCreate(period_start=date(2026, 1, 1), period_end=date(2026, 1, 31))
            out = await create_production_plan(body, tenant=t, user=u, db=s)
            return out.plan_code

    codes = await asyncio.gather(attempt(), attempt(), attempt())
    assert len(set(codes)) == 3, codes


# ---------------------------------------------------------------------------
# 4. Bulk PO from BOM / requisition -> PO
# ---------------------------------------------------------------------------


async def _seed_bom_with_lines(s: AsyncSession):
    tenant, user, style, quotation, order = await _seed_order(s)
    tenant.feature_flags = {**(tenant.feature_flags or {}), "procurement_cs_enabled": True}
    fabric, _wh, _u = await seed_item(s, tenant.id, code=f"F-{uuid.uuid4().hex[:4]}")
    trims, _wh2, _u2 = await seed_item(s, tenant.id, code=f"T-{uuid.uuid4().hex[:4]}")
    v1 = Vendor(tenant_id=tenant.id, vendor_code=f"V1{uuid.uuid4().hex[:4]}", name="Mill one")
    v2 = Vendor(tenant_id=tenant.id, vendor_code=f"V2{uuid.uuid4().hex[:4]}", name="Mill two")
    s.add_all([v1, v2])
    await s.flush()
    bom = Bom(
        tenant_id=tenant.id, style_id=style.id, order_id=order.id, quotation_id=quotation.id,
        status="APPROVED", is_active=True, bom_code=f"B-{uuid.uuid4().hex[:6]}", order_qty_snapshot=100,
    )
    s.add(bom)
    await s.flush()
    lines = [
        BomItem(
            tenant_id=tenant.id, bom_id=bom.id, item_id=fabric.id, category="FABRIC", base_consumption=Decimal("1"),
            required_gross_qty=Decimal("120"), bom_expected_unit_price=Decimal("2.5"), preferred_vendor_id=v1.id,
        ),
        BomItem(
            tenant_id=tenant.id, bom_id=bom.id, item_id=trims.id, category="TRIMS", base_consumption=Decimal("2"),
            required_gross_qty=Decimal("200"), bom_expected_unit_price=Decimal("0.1"), preferred_vendor_id=v2.id,
        ),
    ]
    s.add_all(lines)
    await s.flush()
    return tenant, user, bom, lines, (v1, v2), (fabric, trims)


async def _bom_po_lines(s: AsyncSession, tenant_id: int, bom_id: int) -> list[tuple[int, str]]:
    rows = await s.execute(
        select(PurchaseOrderItem.source_bom_line_id, PurchaseOrderItem.quantity).where(
            PurchaseOrderItem.tenant_id == tenant_id, PurchaseOrderItem.source_bom_id == bom_id
        )
    )
    return sorted((int(a), str(b)) for a, b in rows.all())


@pytest.mark.asyncio
async def test_bulk_po_creates_no_empty_draft_pos(db_session_integration):
    from app.modules.merch import bom_procurement_service as proc_svc

    db = db_session_integration
    tenant, _user, bom, lines, (v1, _v2), _items = await _seed_bom_with_lines(db)
    # The fabric line (vendor 1) is already fully ordered.
    old_po = PurchaseOrder(tenant_id=tenant.id, po_code=f"PO-X{uuid.uuid4().hex[:5]}", vendor_id=v1.id,
                           supplier_name="Mill one", status="DRAFT", source_bom_id=bom.id)
    db.add(old_po)
    await db.flush()
    db.add(PurchaseOrderItem(tenant_id=tenant.id, purchase_order_id=old_po.id, item_id=lines[0].item_id,
                             quantity="120", unit_price="2.5", source_bom_id=bom.id, source_bom_line_id=lines[0].id))
    await db.flush()

    created = await proc_svc.bulk_create_pos_by_vendor(db, tenant_id=tenant.id, bom=bom, lines=lines)
    assert [len(pois) for _po, pois in created] == [1]
    assert created[0][1][0].source_bom_line_id == lines[1].id

    again = await proc_svc.bulk_create_pos_by_vendor(db, tenant_id=tenant.id, bom=bom, lines=lines)
    assert again == []
    po_count = (
        await db.execute(select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.source_bom_id == bom.id))
    ).scalar()
    assert po_count == 2


@pytest.mark.asyncio
async def test_concurrent_bulk_po_from_bom_orders_once(real_db):
    from app.modules.merch import bom_procurement_service as proc_svc

    factory, register = real_db
    async with factory() as s:
        tenant, _user, bom, lines, _vendors, _items = await _seed_bom_with_lines(s)
        await s.commit()
        tenant_id, bom_id = tenant.id, bom.id
    register(tenant_id)

    async def attempt() -> int:
        async with factory() as s:
            b = await s.get(Bom, bom_id)
            ls = list((await s.execute(select(BomItem).where(BomItem.bom_id == bom_id))).scalars())
            created = await proc_svc.bulk_create_pos_by_vendor(s, tenant_id=tenant_id, bom=b, lines=ls)
            await s.commit()
            return len(created)

    results = await asyncio.gather(attempt(), attempt())
    assert sorted(results) == [0, 2]
    async with factory() as s:
        po_lines = await _bom_po_lines(s, tenant_id, bom_id)
        empty_pos = (
            await s.execute(
                select(func.count()).select_from(PurchaseOrder).where(
                    PurchaseOrder.source_bom_id == bom_id,
                    ~select(PurchaseOrderItem.id).where(PurchaseOrderItem.purchase_order_id == PurchaseOrder.id).exists(),
                )
            )
        ).scalar()
    assert len(po_lines) == 2 and len({lid for lid, _q in po_lines}) == 2, po_lines
    assert empty_pos == 0


@pytest.mark.asyncio
async def test_concurrent_requisition_create_po_makes_one_po(real_db):
    from app.modules.procurement.router import create_po_from_selection

    factory, register = real_db
    async with factory() as s:
        tenant, user = await seed_tenant_admin(s)
        tenant.feature_flags = {"procurement_cs_enabled": True}
        item, wh, _u = await seed_item(s, tenant.id, code="RQ-FAB")
        vendor = Vendor(tenant_id=tenant.id, vendor_code="RQ-V", name="RQ Mill")
        s.add(vendor)
        await s.flush()
        pr = PurchaseRequisition(tenant_id=tenant.id, pr_code=f"PR-{uuid.uuid4().hex[:6]}", status="CS_SELECTED",
                                 selection_reason="cheapest")
        s.add(pr)
        await s.flush()
        line = PurchaseRequisitionLine(tenant_id=tenant.id, requisition_id=pr.id, item_id=item.id,
                                       warehouse_id=wh.id, quantity=Decimal("50"))
        quote = SupplierQuotation(tenant_id=tenant.id, requisition_id=pr.id, vendor_id=vendor.id, currency="USD")
        s.add_all([line, quote])
        await s.flush()
        s.add(SupplierQuotationLine(tenant_id=tenant.id, quotation_id=quote.id, requisition_line_id=line.id,
                                    unit_price=Decimal("3")))
        pr.selected_quotation_id = quote.id
        await s.commit()
        tenant_id, user_id, pr_id, vendor_id = tenant.id, user.id, pr.id, vendor.id
    register(tenant_id)

    async def attempt():
        async with factory() as s:
            t, u = await _tenant_user(s, tenant_id, user_id)
            try:
                return await create_po_from_selection(pr_id, None, tenant=t, user=u, db=s)
            except HTTPException as exc:
                await s.rollback()
                return exc

    results = await asyncio.gather(attempt(), attempt())
    errors = [r for r in results if isinstance(r, HTTPException)]
    assert len(errors) == 1 and errors[0].status_code == 409, results
    async with factory() as s:
        pos = (
            await s.execute(select(func.count()).select_from(PurchaseOrder).where(PurchaseOrder.vendor_id == vendor_id))
        ).scalar()
        pr_row = await s.get(PurchaseRequisition, pr_id)
    assert pos == 1
    assert pr_row.status == "PO_CREATED" and pr_row.purchase_order_id is not None


# ---------------------------------------------------------------------------
# 5. Bulk GRN receive
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_bulk_grn_receive_continues_after_a_failure(db_session_integration):
    db = db_session_integration
    tenant, user, wh, vendor, item = await seed_inventory_chain(db)
    empty = GoodsReceiving(tenant_id=tenant.id, grn_code=f"GRN-E{uuid.uuid4().hex[:5]}", status="DRAFT")
    db.add(empty)
    await db.flush()
    today = str(date.today())
    async with api_client(db, tenant, user) as ac:
        grn_ids = []
        for _ in range(2):
            po = await ac.post(
                "/api/v1/inventory/purchase-orders",
                json={"vendor_id": vendor.id, "order_date": today, "status": "APPROVED",
                      "items": [{"item_id": item.id, "warehouse_id": wh.id, "quantity": "10", "unit_price": "5"}]},
            )
            assert po.status_code == 200, po.text
            grn = await ac.post(
                "/api/v1/inventory/goods-receiving",
                json={"purchase_order_id": po.json()["id"], "received_date": today, "status": "DRAFT",
                      "default_warehouse_id": wh.id},
            )
            assert grn.status_code == 200, grn.text
            grn_ids.append(grn.json()["id"])

        r = await ac.post(
            "/api/v1/inventory/goods-receiving/bulk-receive",
            json={"ids": [empty.id, grn_ids[0], 999999999, grn_ids[1], grn_ids[0]]},
        )
        assert r.status_code == 200, r.text
        by_id = {row["id"]: row for row in r.json()}
    assert by_id[empty.id]["ok"] is False and "no items" in by_id[empty.id]["detail"]
    assert by_id[999999999]["ok"] is False
    assert by_id[grn_ids[0]]["ok"] is True and by_id[grn_ids[1]]["ok"] is True
    assert len(r.json()) == 4  # duplicate id handled once
    statuses = (
        await db.execute(select(GoodsReceiving.status).where(GoodsReceiving.id.in_(grn_ids)))
    ).scalars().all()
    assert set(statuses) == {"RECEIVED"}
