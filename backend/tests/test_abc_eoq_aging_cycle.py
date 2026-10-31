"""Sprint I3: ABC analysis, EOQ, stock aging, cycle counting.

Run:
    docker compose exec backend pytest tests/test_abc_eoq_aging_cycle.py -q
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

import pytest

from app.common.permissions import (
    MATERIAL_CONTROL_GOVERNANCE_KEYS,
    PERMISSION_INVENTORY_ABC_ANALYSIS_RUN,
    PERMISSION_INVENTORY_CYCLE_COUNT_PERFORM,
    PERMISSION_INVENTORY_EOQ_VIEW,
    PERMISSION_INVENTORY_STOCK_AGING_VIEW,
)
from app.common.tenant_feature_keys import (
    CYCLE_COUNTING_ENABLED,
    is_abc_analysis_enabled,
    is_cycle_counting_enabled,
    is_eoq_calculation_enabled,
    is_stock_aging_enabled,
)
from app.models import Item, ItemCategory, ItemUnit, Tenant
from app.models.inventory import StockBatch, StockMovement, Warehouse
from app.models.tenant import TenantType
from app.modules.inventory.abc_analysis_service import classify_by_cumulative_value, run_abc_analysis
from app.modules.inventory.cycle_count_service import (
    generate_cycle_count_schedule,
    submit_cycle_count,
)
from app.modules.inventory.eoq_service import compute_eoq
from app.modules.inventory.stock_aging_service import bucket_for_days, get_stock_aging


class TestI3Flags:
    def test_defaults(self):
        assert is_abc_analysis_enabled(None) is True
        assert is_eoq_calculation_enabled({}) is True
        assert is_stock_aging_enabled({}) is True
        assert is_cycle_counting_enabled({}) is False
        assert is_abc_analysis_enabled({"abc_analysis_enabled": False}) is False
        assert is_cycle_counting_enabled({CYCLE_COUNTING_ENABLED: True}) is True

    def test_permissions_registered(self):
        keys = {row["key"] for row in MATERIAL_CONTROL_GOVERNANCE_KEYS}
        assert PERMISSION_INVENTORY_ABC_ANALYSIS_RUN in keys
        assert PERMISSION_INVENTORY_EOQ_VIEW in keys
        assert PERMISSION_INVENTORY_STOCK_AGING_VIEW in keys
        assert PERMISSION_INVENTORY_CYCLE_COUNT_PERFORM in keys


class TestClassify:
    def test_abc_value_bands(self):
        rows = [
            {"item_id": 1, "consumption_value": "700"},
            {"item_id": 2, "consumption_value": "200"},
            {"item_id": 3, "consumption_value": "100"},
        ]
        out = classify_by_cumulative_value(rows)
        assert out[0]["abc_class"] == "A"
        assert out[1]["abc_class"] == "B"
        assert out[2]["abc_class"] == "C"


class TestEoqMath:
    def test_classic_eoq(self):
        # D=1000, S=100, H=2 → EOQ = sqrt(100000) ≈ 316.23
        r = compute_eoq(Decimal("1000"), Decimal("100"), Decimal("2"))
        assert abs(float(r["eoq"]) - 316.2277) < 0.01
        assert float(r["orders_per_year"]) > 0


class TestBuckets:
    def test_bucket_edges(self):
        assert bucket_for_days(0) == "0-30"
        assert bucket_for_days(30) == "0-30"
        assert bucket_for_days(31) == "31-60"
        assert bucket_for_days(400) == "365+"


async def _seed(db, *, flags: dict | None = None):
    slug = uuid.uuid4().hex[:8]
    if flags is None:
        flags = {CYCLE_COUNTING_ENABLED: True}
    tenant = Tenant(
        name=f"I3 {slug}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=f"i3{slug}"[:18],
        feature_flags=flags,
    )
    db.add(tenant)
    await db.flush()
    cat = ItemCategory(tenant_id=tenant.id, category_code=f"C{slug}"[:10], name="Yarn")
    db.add(cat)
    await db.flush()
    unit = ItemUnit(tenant_id=tenant.id, unit_code=f"U{slug}"[:8], name="Kg")
    db.add(unit)
    await db.flush()
    wh = Warehouse(
        tenant_id=tenant.id,
        warehouse_code=f"RM{slug}"[:10],
        name="RM Store",
        is_store=True,
    )
    db.add(wh)
    await db.flush()

    items = []
    for i, (code, cost) in enumerate(
        [("A-HI", "100"), ("B-MID", "50"), ("C-LO", "10")], start=1
    ):
        it = Item(
            tenant_id=tenant.id,
            item_code=f"{code}-{slug}"[:20],
            name=code,
            category_id=cat.id,
            unit_id=unit.id,
            default_cost=Decimal(cost),
            avg_cost=Decimal(cost),
            default_warehouse_id=wh.id,
            reorder_qty=Decimal("500"),
        )
        db.add(it)
        items.append(it)
    await db.flush()
    return tenant, wh, items


@pytest.mark.asyncio
async def test_run_abc_updates_classes(db_session_integration):
    db = db_session_integration
    tenant, wh, items = await _seed(db)
    # OUT consumption: high / mid / low value
    qtys = [Decimal("70"), Decimal("40"), Decimal("10")]  # values 7000, 2000, 100
    for it, qty in zip(items, qtys):
        db.add(
            StockMovement(
                tenant_id=tenant.id,
                item_id=it.id,
                warehouse_id=wh.id,
                movement_type="OUT",
                quantity=qty,
                movement_date=date.today() - timedelta(days=10),
            )
        )
    await db.flush()

    report = await run_abc_analysis(db, tenant.id, period_months=12, update_items=True)
    await db.flush()
    assert report["total_items"] == 3
    await db.refresh(items[0])
    await db.refresh(items[1])
    await db.refresh(items[2])
    assert items[0].abc_class == "A"
    assert items[1].abc_class == "B"
    assert items[2].abc_class == "C"


@pytest.mark.asyncio
async def test_stock_aging_buckets(db_session_integration):
    db = db_session_integration
    tenant, wh, items = await _seed(db)
    old = datetime.utcnow() - timedelta(days=400)
    batch = StockBatch(
        tenant_id=tenant.id,
        stock_item_id=items[0].id,
        batch_number=f"B-{uuid.uuid4().hex[:6]}",
        current_qty=Decimal("25"),
        cost_per_unit=Decimal("100"),
        godown_id=wh.id,
        status="ACTIVE",
        created_at=old,
        manufacturing_date=old.date(),
    )
    db.add(batch)
    await db.flush()

    report = await get_stock_aging(db, tenant.id)
    assert report["line_count"] == 1
    assert report["lines"][0]["bucket"] == "365+"
    assert Decimal(report["over_365_value"]) == Decimal("2500.0000")


@pytest.mark.asyncio
async def test_cycle_count_variance(db_session_integration):
    db = db_session_integration
    tenant, wh, items = await _seed(db)
    items[0].abc_class = "A"
    # Stock on hand 100
    db.add(
        StockMovement(
            tenant_id=tenant.id,
            item_id=items[0].id,
            warehouse_id=wh.id,
            movement_type="IN",
            quantity=Decimal("100"),
            movement_date=date.today(),
        )
    )
    await db.flush()

    created = await generate_cycle_count_schedule(
        db, tenant, force_all_due=True, frequency="A"
    )
    assert len(created) >= 1
    task = created[0]
    assert task.system_qty == Decimal("100.0000") or Decimal(str(task.system_qty)) == Decimal(
        "100"
    )

    done = await submit_cycle_count(
        db, tenant, task.id, counted_qty=Decimal("95"), counted_by=None
    )
    assert done.status == "VARIANCE"
    assert done.adjustment_suggested is True
    assert Decimal(str(done.variance_qty)) == Decimal("-5.0000")
