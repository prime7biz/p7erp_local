"""Quotation revisions (v1 -> v2): inquiry-linked revise, child cloning, guards, concurrency, tenancy.

Run:
    docker compose exec backend pytest tests/test_quotation_revisions.py -q
"""

from __future__ import annotations

import asyncio
import uuid
from contextlib import asynccontextmanager
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient
from sqlalchemy import inspect, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models import (
    Inquiry,
    Quotation,
    QuotationCostSummary,
    QuotationManufacturing,
    QuotationMaterial,
    QuotationOtherCost,
    QuotationSizeRatio,
)
from app.modules.quotations import revision_service
from tests.conftest import _async_database_url
from tests.merch_fixtures import (
    create_customer,
    create_garment_style,
    create_merch_tenant_with_user,
    create_quotation_and_order,
)

CHILD_MODELS = (
    QuotationMaterial,
    QuotationManufacturing,
    QuotationOtherCost,
    QuotationSizeRatio,
    QuotationCostSummary,
)


@asynccontextmanager
async def _api(db: AsyncSession, tenant, user):
    """HTTP client that runs the real app on the test session as ``user``."""

    async def override_db():
        yield db

    async def override_user():
        return user

    async def override_tenant():
        return tenant

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    app.dependency_overrides[require_tenant] = override_tenant
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Tenant-Id": str(tenant.id)},
        ) as client:
            yield client
    finally:
        app.dependency_overrides.clear()


async def _seed_inquiry_quotation(db: AsyncSession, *, tenant=None, user=None) -> SimpleNamespace:
    """Tenant + inquiry + SENT quotation (v1) with one or more rows in every costing child table."""
    if tenant is None:
        tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    slug = uuid.uuid4().hex[:8]
    inquiry = Inquiry(
        tenant_id=tenant.id,
        customer_id=customer.id,
        inquiry_code=f"INQ-{slug}",
        status="CONVERTED",
    )
    db.add(inquiry)
    await db.flush()
    q = Quotation(
        tenant_id=tenant.id,
        customer_id=customer.id,
        inquiry_id=inquiry.id,
        quotation_code=f"QR-{slug}",
        status="SENT",
        version_no=1,
        currency="USD",
        target_price_currency="USD",
        projected_quantity=1200,
        material_cost=Decimal("1300.0000"),
        manufacturing_cost=Decimal("500.0000"),
        other_cost=Decimal("50.0000"),
        total_cost=Decimal("1850.0000"),
        profit_percentage=Decimal("15.0000"),
        quoted_price=Decimal("2127.5000"),
        total_amount=Decimal("2127.5000"),
    )
    db.add(q)
    await db.flush()
    db.add_all(
        [
            QuotationMaterial(
                tenant_id=tenant.id,
                quotation_id=q.id,
                serial_no=1,
                description="Shell fabric",
                unit="kg",
                consumption_per_dozen=Decimal("2.500000"),
                unit_price=Decimal("4.0000"),
                amount_per_dozen=Decimal("10.0000"),
                total_amount=Decimal("1000.0000"),
                base_amount=Decimal("1000.0000"),
            ),
            QuotationMaterial(
                tenant_id=tenant.id,
                quotation_id=q.id,
                serial_no=2,
                description="Thread",
                unit="cone",
                consumption_per_dozen=Decimal("0.300000"),
                unit_price=Decimal("10.0000"),
                amount_per_dozen=Decimal("3.0000"),
                total_amount=Decimal("300.0000"),
                base_amount=Decimal("300.0000"),
            ),
            QuotationManufacturing(
                tenant_id=tenant.id,
                quotation_id=q.id,
                serial_no=1,
                style_part="Body",
                machines_required=20,
                production_per_hour=Decimal("60.000000"),
                production_per_day=Decimal("12000.000000"),
                total_order_cost=Decimal("500.0000"),
            ),
            QuotationOtherCost(
                tenant_id=tenant.id,
                quotation_id=q.id,
                serial_no=1,
                cost_head="Testing",
                cost_type="fixed",
                value=Decimal("50.0000"),
                total_amount=Decimal("50.0000"),
                calculated_amount=Decimal("50.0000"),
            ),
            QuotationSizeRatio(
                tenant_id=tenant.id,
                quotation_id=q.id,
                serial_no=1,
                size="M",
                ratio_percentage=Decimal("60.0000"),
                quantity=720,
            ),
            QuotationSizeRatio(
                tenant_id=tenant.id,
                quotation_id=q.id,
                serial_no=2,
                size="L",
                ratio_percentage=Decimal("40.0000"),
                quantity=480,
            ),
            QuotationCostSummary(
                tenant_id=tenant.id,
                quotation_id=q.id,
                category_name="Fabric",
                total_cost=Decimal("1000.0000"),
                percentage_of_total=Decimal("54.0500"),
            ),
        ]
    )
    await db.flush()
    return SimpleNamespace(tenant=tenant, user=user, customer=customer, inquiry=inquiry, quotation=q)


async def _child_snapshot(db: AsyncSession, model, quotation_id: int) -> list[tuple]:
    """Comparable values of one child table for one quotation (ids/timestamps excluded)."""
    rows = (
        await db.execute(
            select(model)
            .where(model.quotation_id == quotation_id)
            .order_by(model.id)
            .execution_options(populate_existing=True)
        )
    ).scalars().all()
    keys = [
        a.key
        for a in inspect(model).column_attrs
        if a.key not in {"id", "quotation_id", "created_at", "updated_at"}
    ]
    return [tuple(getattr(r, k) for k in keys) for r in rows]


@pytest.mark.asyncio
async def test_revise_inquiry_linked_quotation_creates_v2(db_session_integration):
    db = db_session_integration
    seed = await _seed_inquiry_quotation(db)
    q = seed.quotation

    async with _api(db, seed.tenant, seed.user) as client:
        r = await client.post(f"/api/v1/quotations/{q.id}/revise")
        assert r.status_code == 201, r.text
        body = r.json()
        assert body["inquiry_id"] == seed.inquiry.id
        assert body["version_no"] == 2
        assert body["status"] == "DRAFT"
        assert body["root_quotation_id"] == q.id
        assert body["revision_of_id"] == q.id
        assert body["is_latest_revision"] is True
        assert body["superseded_at"] is None
        assert body["quotation_code"] != q.quotation_code

        old = await client.get(f"/api/v1/quotations/{q.id}")
        assert old.status_code == 200, old.text
        assert old.json()["is_latest_revision"] is False
        assert old.json()["superseded_at"] is not None

    await db.refresh(q)
    assert q.superseded_at is not None


@pytest.mark.asyncio
async def test_revise_clones_costing_children_independently(db_session_integration):
    db = db_session_integration
    seed = await _seed_inquiry_quotation(db)
    q = seed.quotation

    async with _api(db, seed.tenant, seed.user) as client:
        r = await client.post(f"/api/v1/quotations/{q.id}/revise")
        assert r.status_code == 201, r.text
        new_id = r.json()["id"]

        source_before = {m: await _child_snapshot(db, m, q.id) for m in CHILD_MODELS}
        for model in CHILD_MODELS:
            clone_rows = await _child_snapshot(db, model, new_id)
            assert len(source_before[model]) > 0
            # Same values (incl. tenant_id, serial_no, amounts), just a different quotation_id.
            assert clone_rows == source_before[model], model.__name__

        detail = await client.get(f"/api/v1/quotations/{new_id}")
        assert detail.status_code == 200, detail.text
        assert [m["total_amount"] for m in detail.json()["materials"]] == ["1000.0000", "300.0000"]

        edit = await client.put(
            f"/api/v1/quotations/{new_id}",
            json={
                "materials": [
                    {
                        "serial_no": 1,
                        "description": "Changed fabric",
                        "unit": "kg",
                        "consumption_per_dozen": "3",
                        "unit_price": "5",
                        "amount_per_dozen": "15",
                        "total_amount": "1500",
                        "currency": "USD",
                        "exchange_rate": "1",
                        "base_amount": "1500",
                        "local_amount": "0",
                    }
                ]
            },
        )
        assert edit.status_code == 200, edit.text
        assert [m["description"] for m in edit.json()["materials"]] == ["Changed fabric"]

    for model in CHILD_MODELS:
        assert await _child_snapshot(db, model, q.id) == source_before[model], model.__name__


@pytest.mark.asyncio
async def test_superseded_quotation_is_read_only(db_session_integration):
    db = db_session_integration
    seed = await _seed_inquiry_quotation(db)
    q = seed.quotation

    async with _api(db, seed.tenant, seed.user) as client:
        r = await client.post(f"/api/v1/quotations/{q.id}/revise")
        assert r.status_code == 201, r.text

        again = await client.post(f"/api/v1/quotations/{q.id}/revise")
        assert again.status_code == 409, again.text
        assert again.json()["detail"]["code"] == revision_service.QUOTATION_SUPERSEDED

        for action in ("submit", "approve", "send"):
            res = await client.post(f"/api/v1/quotations/{q.id}/{action}")
            assert res.status_code == 409, (action, res.text)
            assert res.json()["detail"]["code"] == revision_service.QUOTATION_SUPERSEDED

        patch = await client.patch(f"/api/v1/quotations/{q.id}", json={"notes": "x"})
        assert patch.status_code == 409, patch.text
        put = await client.put(f"/api/v1/quotations/{q.id}", json={"notes": "x"})
        assert put.status_code == 409, put.text


@pytest.mark.asyncio
async def test_revise_order_linked_quotation_returns_409(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_merch_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    q, order = await create_quotation_and_order(db, tenant, customer, style)

    async with _api(db, tenant, user) as client:
        r = await client.post(f"/api/v1/quotations/{q.id}/revise")
    assert r.status_code == 409, r.text
    detail = r.json()["detail"]
    assert detail["code"] == revision_service.QUOTATION_LINKED_TO_ORDER
    assert order.order_code in detail["message"]
    await db.refresh(q)
    assert q.superseded_at is None


@pytest.mark.asyncio
async def test_revisions_endpoint_lists_lineage_in_version_order(db_session_integration):
    db = db_session_integration
    seed = await _seed_inquiry_quotation(db)
    q = seed.quotation

    async with _api(db, seed.tenant, seed.user) as client:
        v2 = (await client.post(f"/api/v1/quotations/{q.id}/revise")).json()
        v3_res = await client.post(f"/api/v1/quotations/{v2['id']}/revise")
        assert v3_res.status_code == 201, v3_res.text
        v3 = v3_res.json()
        assert v3["version_no"] == 3
        assert v3["root_quotation_id"] == q.id
        assert v3["revision_of_id"] == v2["id"]

        for any_id in (q.id, v2["id"], v3["id"]):
            res = await client.get(f"/api/v1/quotations/{any_id}/revisions")
            assert res.status_code == 200, res.text
            rows = res.json()
            assert [r["id"] for r in rows] == [q.id, v2["id"], v3["id"]]
            assert [r["version_no"] for r in rows] == [1, 2, 3]
            assert [r["is_latest_revision"] for r in rows] == [False, False, True]

        latest = await client.get("/api/v1/quotations/paginated", params={"latest_only": "true", "page_size": 500})
        assert latest.status_code == 200, latest.text
        ids = {r["id"] for r in latest.json()["items"]}
        assert v3["id"] in ids and q.id not in ids and v2["id"] not in ids

        all_rows = await client.get("/api/v1/quotations/paginated", params={"page_size": 500})
        all_ids = {r["id"] for r in all_rows.json()["items"]}
        assert {q.id, v2["id"], v3["id"]} <= all_ids


@pytest.mark.asyncio
async def test_from_inquiry_inquiry_and_pipeline_return_latest_revision(db_session_integration):
    db = db_session_integration
    seed = await _seed_inquiry_quotation(db)
    q = seed.quotation

    async with _api(db, seed.tenant, seed.user) as client:
        v2 = (await client.post(f"/api/v1/quotations/{q.id}/revise")).json()

        conv = await client.post(f"/api/v1/quotations/from-inquiry/{seed.inquiry.id}")
        assert conv.status_code == 200, conv.text
        assert conv.json()["id"] == v2["id"]

        inq = await client.get(f"/api/v1/inquiries/{seed.inquiry.id}")
        assert inq.status_code == 200, inq.text
        assert inq.json()["converted_quotation_id"] == v2["id"]

        inq_list = await client.get("/api/v1/inquiries")
        assert inq_list.status_code == 200, inq_list.text
        row = next(r for r in inq_list.json() if r["id"] == seed.inquiry.id)
        assert row["converted_quotation_id"] == v2["id"]

        board = await client.get("/api/v1/merch/pipeline/full", params={"document_type": "quotation"})
        assert board.status_code == 200, board.text
        board_ids = {i["id"] for i in board.json()["items"] if i["document_type"] == "quotation"}
        assert v2["id"] in board_ids and q.id not in board_ids


@pytest.mark.asyncio
async def test_deleting_current_revision_restores_previous(db_session_integration):
    db = db_session_integration
    seed = await _seed_inquiry_quotation(db)
    q = seed.quotation

    async with _api(db, seed.tenant, seed.user) as client:
        v2 = (await client.post(f"/api/v1/quotations/{q.id}/revise")).json()
        res = await client.delete(f"/api/v1/quotations/{v2['id']}")
        assert res.status_code == 204, res.text

    await db.refresh(q)
    assert q.superseded_at is None


@pytest.mark.asyncio
async def test_revision_tenant_isolation(db_session_integration):
    db = db_session_integration
    seed_a = await _seed_inquiry_quotation(db)
    tenant_b, user_b, _ = await create_merch_tenant_with_user(db)
    q = seed_a.quotation

    async with _api(db, tenant_b, user_b) as client_b:
        assert (await client_b.post(f"/api/v1/quotations/{q.id}/revise")).status_code == 404
        assert (await client_b.get(f"/api/v1/quotations/{q.id}/revisions")).status_code == 404
        assert (await client_b.get(f"/api/v1/quotations/{q.id}")).status_code == 404
    await db.refresh(q)
    assert q.superseded_at is None

    async with _api(db, seed_a.tenant, seed_a.user) as client_a:
        v2 = (await client_a.post(f"/api/v1/quotations/{q.id}/revise")).json()

    async with _api(db, tenant_b, user_b) as client_b:
        assert (await client_b.get(f"/api/v1/quotations/{v2['id']}/revisions")).status_code == 404

    for model in CHILD_MODELS:
        tenants = (
            await db.execute(select(model.tenant_id).where(model.quotation_id == v2["id"]))
        ).scalars().all()
        assert tenants and set(tenants) == {seed_a.tenant.id}, model.__name__


@pytest.mark.asyncio
async def test_convert_superseded_quotation_to_order_returns_409(db_session_integration):
    db = db_session_integration
    seed = await _seed_inquiry_quotation(db)
    q = seed.quotation

    async with _api(db, seed.tenant, seed.user) as client:
        assert (await client.post(f"/api/v1/quotations/{q.id}/revise")).status_code == 201

        res = await client.post(f"/api/v1/orders/from-quotation/{q.id}")
        assert res.status_code == 409, res.text
        assert res.json()["detail"]["code"] == revision_service.QUOTATION_SUPERSEDED

        res2 = await client.post(
            "/api/v1/orders",
            json={"customer_id": seed.customer.id, "quotation_id": q.id},
        )
        assert res2.status_code == 409, res2.text
        assert res2.json()["detail"]["code"] == revision_service.QUOTATION_SUPERSEDED


async def _delete_tenant_rows(session: AsyncSession, tenant_id: int) -> None:
    for sql in (
        "DELETE FROM quotations WHERE tenant_id = :t",
        "DELETE FROM inquiries WHERE tenant_id = :t",
        "DELETE FROM customers WHERE tenant_id = :t",
        "DELETE FROM users WHERE tenant_id = :t",
        "DELETE FROM roles WHERE tenant_id = :t",
        "DELETE FROM tenants WHERE id = :t",
    ):
        await session.execute(text(sql), {"t": tenant_id})
    await session.commit()


@pytest.mark.asyncio
async def test_concurrent_revise_creates_exactly_one_v2():
    """Two sessions revise the same quotation at once: the row lock lets only one win."""
    url = _async_database_url()
    if not url:
        pytest.skip("DATABASE_URL not set — run pytest inside the backend container with compose.")
    engine = create_async_engine(url)
    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False, autoflush=False)
    tenant_id: int | None = None
    try:
        async with factory() as s:
            seed = await _seed_inquiry_quotation(s)
            await s.commit()
            tenant_id = seed.tenant.id
            qid = seed.quotation.id

        async def attempt():
            async with factory() as s:
                try:
                    revised = await revision_service.revise_quotation(s, tenant_id=tenant_id, quotation_id=qid)
                    await s.commit()
                    return revised.id
                except HTTPException as exc:
                    await s.rollback()
                    return exc

        results = await asyncio.gather(attempt(), attempt())
        wins = [r for r in results if isinstance(r, int)]
        losses = [r for r in results if isinstance(r, HTTPException)]
        assert len(wins) == 1 and len(losses) == 1, results
        assert losses[0].status_code == 409
        assert losses[0].detail["code"] in {
            revision_service.QUOTATION_SUPERSEDED,
            revision_service.QUOTATION_REVISION_CONFLICT,
        }

        async with factory() as s:
            versions = (
                await s.execute(
                    select(Quotation.version_no).where(
                        Quotation.tenant_id == tenant_id,
                        or_(Quotation.id == qid, Quotation.root_quotation_id == qid),
                    )
                )
            ).scalars().all()
            assert sorted(versions) == [1, 2]
    finally:
        if tenant_id is not None:
            async with factory() as s:
                await _delete_tenant_rows(s, tenant_id)
        await engine.dispose()
