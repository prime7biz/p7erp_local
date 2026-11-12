"""Consumption alert rules use a fixed number of queries, however many orders / BOM lines (RC-07).

Run:
    docker compose exec backend pytest tests/test_alert_rule_query_counts.py -q
"""

from __future__ import annotations

import uuid
from decimal import Decimal

import pytest

from app.models import BomItem, StockMovement
from app.models.costing import ItemCategory
from app.modules.merch.alert_rules import rule_trim_overconsumption_above, rule_wastage_vs_bom
from tests.go_live_fixtures import seed_inventory_chain
from tests.merch_fixtures import create_customer, create_garment_style, create_legacy_bom, create_quotation_and_order
from tests.test_perf_merch_equivalence import count_queries


async def _order_with_consumption(db, tenant, wh, item, *, issued: str) -> int:
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)  # quantity 100
    bom = await create_legacy_bom(db, tenant, style)
    db.add(
        BomItem(
            tenant_id=tenant.id,
            bom_id=bom.id,
            item_id=item.id,
            category="TRIM",
            base_consumption=Decimal("1"),
            wastage_pct=Decimal("0"),
        )
    )
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=item.id,
            warehouse_id=wh.id,
            movement_type="OUT",
            quantity=issued,
            reference_type="CONSUMPTION_ISSUE",
            reference_id=order.id,
        )
    )
    await db.flush()
    return order.id


async def _seed(db, orders: int):
    tenant, _user, wh, _vendor, item = await seed_inventory_chain(db)
    trims = ItemCategory(tenant_id=tenant.id, name="Trims", category_code=f"TRIM-{uuid.uuid4().hex[:4]}")
    db.add(trims)
    await db.flush()
    item.category_id = trims.id
    ids = [await _order_with_consumption(db, tenant, wh, item, issued="130") for _ in range(orders)]
    await db.commit()
    return tenant.id, ids


@pytest.mark.asyncio
@pytest.mark.parametrize("rule", [rule_wastage_vs_bom, rule_trim_overconsumption_above])
async def test_consumption_rules_find_overuse_with_constant_queries(db_session_integration, rule):
    db = db_session_integration
    small_tid, small_orders = await _seed(db, orders=1)
    big_tid, big_orders = await _seed(db, orders=4)

    with count_queries(db) as small_q:
        small = await rule(db, small_tid, None)
    with count_queries(db) as big_q:
        big = await rule(db, big_tid, None)

    # 130 issued vs 100 expected = +30%: above both thresholds (15% wastage, 10% trims).
    assert sorted(a["order_id"] for a in small) == sorted(small_orders)
    assert sorted(a["order_id"] for a in big) == sorted(big_orders)
    assert all(a["evidence_json"]["facts"]["wastage_pct_vs_bom"] == 30.0 for a in big)
    assert big_q["n"] == small_q["n"], (small_q["n"], big_q["n"])
    assert big_q["n"] <= 8


@pytest.mark.asyncio
async def test_only_the_latest_bom_version_counts(db_session_integration):
    """v1 says 1 per piece (130 issued = +30% -> alert); v2 says 2 per piece (-35% -> no alert)."""
    db = db_session_integration
    tenant, _user, wh, _vendor, item = await seed_inventory_chain(db)
    customer = await create_customer(db, tenant)
    style = await create_garment_style(db, tenant, customer)
    _q, order = await create_quotation_and_order(db, tenant, customer, style)
    for version, base in ((1, "1"), (2, "2")):
        bom = await create_legacy_bom(db, tenant, style)
        bom.version_no = version
        db.add(
            BomItem(
                tenant_id=tenant.id, bom_id=bom.id, item_id=item.id, category="FABRIC",
                base_consumption=Decimal(base), wastage_pct=Decimal("0"),
            )
        )
    db.add(
        StockMovement(
            tenant_id=tenant.id, item_id=item.id, warehouse_id=wh.id, movement_type="OUT", quantity="130",
            reference_type="CONSUMPTION_ISSUE", reference_id=order.id,
        )
    )
    await db.commit()
    assert await rule_wastage_vs_bom(db, tenant.id, None) == []


@pytest.mark.asyncio
async def test_rules_ignore_other_tenants_movements(db_session_integration):
    db = db_session_integration
    tid_a, orders_a = await _seed(db, orders=1)
    tid_b, _orders_b = await _seed(db, orders=2)
    alerts = await rule_wastage_vs_bom(db, tid_a, None)
    assert [a["order_id"] for a in alerts] == orders_a
    assert tid_a != tid_b
