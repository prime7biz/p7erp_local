"""A16: DRAFT, CANCELLED and COMPLETED orders are not confirmed demand (NEW / CONFIRMED / IN_PROGRESS are).

Run: docker compose exec backend pytest tests/test_mfg_intelligence_confirmed_demand.py -q
"""

from __future__ import annotations

from datetime import date

import pytest
from sqlalchemy import select

from app.models import Order
from app.modules.mfg_intelligence.confirmed_demand import confirmed_status_clause, is_confirmed_status
from tests.mfg_intel_fixtures import API, FLAGS_ON, add_order, client_for, new_tenant, seed_basic_factory

WEEK = {"date_from": "2030-03-04", "date_to": "2030-03-15"}


@pytest.mark.parametrize("status", ["NEW", "CONFIRMED", "IN_PROGRESS", "new", "Confirmed", " in_progress "])
def test_confirmed_statuses(status):
    assert is_confirmed_status(status) is True


@pytest.mark.parametrize("status", ["DRAFT", "CANCELLED", "COMPLETED", "draft", "ON_HOLD", "SHIPPED", "", None, "NEWER"])
def test_everything_else_is_not_confirmed(status):
    assert is_confirmed_status(status) is False


@pytest.mark.asyncio
async def test_sql_clause_matches_the_python_rule(db_session_integration):
    db = db_session_integration
    tenant, _user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    statuses = ["NEW", "confirmed", "IN_PROGRESS", "DRAFT", "CANCELLED", "COMPLETED", "ON_HOLD"]
    orders = {s: await add_order(db, tenant, fx.customer, fx.style, status=s) for s in statuses}
    await db.flush()
    found = set(
        (await db.execute(select(Order.id).where(Order.tenant_id == tenant.id, confirmed_status_clause()))).scalars().all()
    )
    assert found == {orders[s].id for s in statuses if is_confirmed_status(s)}


@pytest.mark.asyncio
async def test_only_confirmed_orders_count_in_the_summary_and_everywhere_else(db_session_integration):
    db = db_session_integration
    tenant, user, _ = await new_tenant(db, flags=FLAGS_ON)
    fx = await seed_basic_factory(db, tenant)
    delivery = date(2030, 3, 12)
    orders = {
        s: await add_order(db, tenant, fx.customer, fx.style, status=s, delivery=delivery)
        for s in ("NEW", "CONFIRMED", "IN_PROGRESS", "DRAFT", "CANCELLED", "COMPLETED")
    }
    # pipeline_status must play no role: a DRAFT order in the "confirmed" pipeline stage is still not confirmed.
    orders["DRAFT"].pipeline_status = "ORDER_CONFIRMED"
    await db.commit()
    async with client_for(db, tenant, user) as c:
        summary = (await c.get(f"{API}/summary", params=WEEK)).json()
        assert summary["orders"]["confirmed_total"] == 3
        assert summary["orders"]["evaluated"] == 3
        for status, order in orders.items():
            readiness = (await c.get(f"{API}/orders/{order.id}/readiness")).json()
            commercial = next(d for d in readiness["dimensions"] if d["key"] == "commercially_confirmed")
            expected = "READY" if is_confirmed_status(status) else "BLOCKED"
            assert commercial["status"] == expected, status
            delivery_body = (await c.get(f"{API}/orders/{order.id}/delivery-prediction")).json()
            if not is_confirmed_status(status):
                assert delivery_body["band"] == "UNKNOWN" and delivery_body["reason_codes"] == ["ORDER_NOT_CONFIRMED"], status
