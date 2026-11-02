"""Multi-factory planning board: factory units on lines + conflict warnings."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

import pytest
from httpx import ASGITransport, AsyncClient

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.main import app
from app.models.production import SewingLine, SewingLineStyleConfig
from app.modules.production.plan_conflicts import compute_plan_conflicts, summarize_factory_load
from tests.go_live_fixtures import create_admin_tenant_with_user
from tests.merch_fixtures import create_customer, create_garment_style, create_quotation_and_order


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


def test_conflict_rules_pure():
    d0 = date(2026, 11, 1)
    items = [
        {"id": 1, "line_id": 10, "order_id": 100, "start_date": d0, "planned_end_date": d0 + timedelta(days=5), "status": "planned"},
        {"id": 2, "line_id": 10, "order_id": 101, "start_date": d0 + timedelta(days=3), "planned_end_date": d0 + timedelta(days=8), "status": "active"},
        {"id": 3, "line_id": 10, "order_id": None, "start_date": d0 + timedelta(days=20), "planned_end_date": None, "status": "planned"},
        {"id": 4, "line_id": 11, "order_id": 100, "start_date": d0, "planned_end_date": d0 + timedelta(days=4), "status": "completed"},
        {"id": 5, "line_id": 12, "order_id": None, "start_date": d0, "planned_end_date": d0, "status": "planned"},
    ]
    lines = {
        10: {"line_code": "L1", "is_active": True, "factory_unit": "Unit A"},
        11: {"line_code": "L2", "is_active": True, "factory_unit": None},
        12: {"line_code": "L3", "is_active": False, "factory_unit": "Unit A"},
    }
    orders = {100: {"order_code": "ORD-100", "delivery_date": d0 + timedelta(days=4)}, 101: {"order_code": "ORD-101", "delivery_date": None}}

    out = compute_plan_conflicts(items, lines, orders)
    kinds = sorted((c["kind"], tuple(c["config_ids"])) for c in out)
    assert ("LINE_OVERLAP", (1, 2)) in kinds
    assert ("LATE_DELIVERY", (1,)) in kinds
    assert ("INACTIVE_LINE", (5,)) in kinds
    # Completed plan 4 is ignored even though it would be late; plan 3 does not overlap.
    assert all(4 not in c["config_ids"] for c in out)
    assert all(3 not in c["config_ids"] for c in out)
    assert len(out) == 3

    load = {u["factory_unit"]: u for u in summarize_factory_load(items, lines)}
    assert load["Unit A"]["line_count"] == 1  # inactive L3 not counted
    assert load["Unit A"]["plan_count"] == 4  # plans 1, 2, 3 on L1 + plan 5 on L3
    assert load["Main factory"]["plan_count"] == 0  # plan 4 completed


@pytest.mark.asyncio
async def test_plan_board_returns_conflicts_and_factory(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await create_admin_tenant_with_user(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _, order = await create_quotation_and_order(db, tenant, customer, style)
    start = date.today()
    order.delivery_date = start + timedelta(days=3)
    slug = uuid.uuid4().hex[:6]
    line_a = SewingLine(tenant_id=tenant.id, line_code=f"A{slug}", name="A", factory_unit="Unit 2")
    line_b = SewingLine(tenant_id=tenant.id, line_code=f"B{slug}", name="B")
    db.add_all([line_a, line_b])
    await db.flush()
    db.add_all(
        [
            SewingLineStyleConfig(
                tenant_id=tenant.id, line_id=line_a.id, order_id=order.id, start_date=start,
                planned_end_date=start + timedelta(days=6), planned_qty=1000,
            ),
            SewingLineStyleConfig(
                tenant_id=tenant.id, line_id=line_a.id, start_date=start + timedelta(days=2),
                planned_end_date=start + timedelta(days=4), planned_qty=200,
            ),
            SewingLineStyleConfig(
                tenant_id=tenant.id, line_id=line_b.id, start_date=start,
                planned_end_date=start + timedelta(days=1), planned_qty=50,
            ),
        ]
    )
    await db.commit()
    ids = {"a": line_a.id, "b": line_b.id, "order_code": order.order_code}

    _as(db, user, tenant)
    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            r = await client.get(
                "/api/v1/production/plan-board",
                params={"from_date": start.isoformat(), "to_date": (start + timedelta(days=10)).isoformat()},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert len(body["items"]) == 3
            kinds = sorted(c["kind"] for c in body["conflicts"])
            assert kinds == ["LATE_DELIVERY", "LINE_OVERLAP"]
            late = next(c for c in body["conflicts"] if c["kind"] == "LATE_DELIVERY")
            assert ids["order_code"] in late["message"]
            units = {u["factory_unit"]: u for u in body["factory_load"]}
            assert units["Unit 2"]["plan_count"] == 2
            assert units["Main factory"]["plan_count"] == 1
            with_order = next(i for i in body["items"] if i["order_id"])
            assert with_order["factory_unit"] == "Unit 2"
            assert with_order["order_code"] == ids["order_code"]

            r = await client.patch(f"/api/v1/production/sewing-lines/{ids['b']}", json={"factory_unit": "  Unit 3 "})
            assert r.status_code == 200, r.text
            assert r.json()["factory_unit"] == "Unit 3"
            r = await client.patch(f"/api/v1/production/sewing-lines/{ids['b']}", json={"factory_unit": "  "})
            assert r.json()["factory_unit"] is None
    finally:
        app.dependency_overrides.clear()
