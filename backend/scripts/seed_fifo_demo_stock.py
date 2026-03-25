"""
Seed 10 FIFO cost layers for manual UAT (same item, same warehouse, chronological IN).

Creates 10 stock_movements (IN) with reference_type FIFO_SEED, qty 10 each, unit costs
100.00, 110.00, ... 190.00 so the first layer is consumed first on OUT and values are easy
to check (e.g. OUT 25 → 10@100 + 10@110 + 5@120 = 2,700.00).

Prerequisites:
  - Alembic up to date (inventory_cost_layers table).
  - Tenant exists (default: LAKHSMA4821 from seed_lakhsma.py).

Run from backend directory:
  python scripts/seed_fifo_demo_stock.py

Optional:
  set COMPANY_CODE=YOUR_CODE
  python scripts/seed_fifo_demo_stock.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from datetime import date, timedelta
from pathlib import Path

from sqlalchemy import func, select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import (
    Item,
    ItemCategory,
    ItemUnit,
    StockGroup,
    StockMovement,
    Tenant,
    Warehouse,
)
from app.services.fifo_inventory import finalize_movement_fifo

DEFAULT_COMPANY_CODE = "LAKHSMA4821"
ITEM_CODE = "FIFO-DEMO-ITEM"
REF_TYPE = "FIFO_SEED"
LAYERS = 10
QTY_PER_LAYER = "10"


async def _ensure_masters(db, tenant_id: int) -> tuple[int, int, int, int]:
    """Return (category_id, unit_id, stock_group_id, warehouse_id)."""
    cat = (
        await db.execute(
            select(ItemCategory)
            .where(
                ItemCategory.tenant_id == tenant_id,
                ItemCategory.category_code == "FIFO-DEMO",
            )
            .limit(1)
        )
    ).scalars().first()
    if not cat:
        cat = ItemCategory(
            tenant_id=tenant_id,
            category_code="FIFO-DEMO",
            name="FIFO demo category",
            description="Auto-created for FIFO seed script",
        )
        db.add(cat)
        await db.flush()

    unit = (
        await db.execute(
            select(ItemUnit)
            .where(ItemUnit.tenant_id == tenant_id, ItemUnit.unit_code == "PCS")
            .limit(1)
        )
    ).scalars().first()
    if not unit:
        unit = ItemUnit(tenant_id=tenant_id, unit_code="PCS", name="Pieces")
        db.add(unit)
        await db.flush()

    sg = (
        await db.execute(
            select(StockGroup)
            .where(
                StockGroup.tenant_id == tenant_id,
                StockGroup.group_code == "ROOT-FIFO-DEMO",
            )
            .limit(1)
        )
    ).scalars().first()
    if not sg:
        sg = StockGroup(
            tenant_id=tenant_id,
            group_code="ROOT-FIFO-DEMO",
            name="FIFO demo stock group",
            parent_id=None,
        )
        db.add(sg)
        await db.flush()

    wh = (
        await db.execute(
            select(Warehouse)
            .where(
                Warehouse.tenant_id == tenant_id,
                Warehouse.warehouse_code == "WH-FIFO-DEMO",
            )
            .limit(1)
        )
    ).scalars().first()
    if not wh:
        wh = Warehouse(
            tenant_id=tenant_id,
            warehouse_code="WH-FIFO-DEMO",
            name="FIFO demo warehouse",
            address="Seed script",
        )
        db.add(wh)
        await db.flush()

    return cat.id, unit.id, sg.id, wh.id


async def _ensure_item(db, tenant_id: int, category_id: int, unit_id: int, stock_group_id: int) -> Item:
    row = (
        await db.execute(
            select(Item).where(Item.tenant_id == tenant_id, Item.item_code == ITEM_CODE).limit(1)
        )
    ).scalars().first()
    if row:
        return row
    item = Item(
        tenant_id=tenant_id,
        item_code=ITEM_CODE,
        name="FIFO demo widget (10 layers x 10 pcs)",
        category_id=category_id,
        subcategory_id=None,
        unit_id=unit_id,
        stock_group_id=stock_group_id,
        default_cost="100.00",
    )
    db.add(item)
    await db.flush()
    return item


async def seed_fifo_demo_stock(db) -> dict:
    code = (os.environ.get("COMPANY_CODE") or DEFAULT_COMPANY_CODE).strip()
    tenant = (await db.execute(select(Tenant).where(Tenant.company_code == code).limit(1))).scalars().first()
    if not tenant:
        print(f"Tenant company_code={code!r} not found. Create tenant first (e.g. seed_lakhsma.py).")
        sys.exit(1)

    existing_n = (
        await db.execute(
            select(func.count(StockMovement.id)).where(
                StockMovement.tenant_id == tenant.id,
                StockMovement.reference_type == REF_TYPE,
            )
        )
    ).scalar() or 0
    if existing_n >= LAYERS:
        print(f"Already seeded: {existing_n} {REF_TYPE} movements for tenant {code}. Skip.")
        return {"skipped": True, "movements": existing_n}

    cat_id, unit_id, sg_id, wh_id = await _ensure_masters(db, tenant.id)
    item = await _ensure_item(db, tenant.id, cat_id, unit_id, sg_id)

    base = date(2024, 1, 1)
    created = 0
    for i in range(LAYERS):
        unit_cost = 100.0 + (i * 10.0)
        mv = StockMovement(
            tenant_id=tenant.id,
            item_id=item.id,
            warehouse_id=wh_id,
            movement_type="IN",
            quantity=QTY_PER_LAYER,
            reference_type=REF_TYPE,
            reference_id=i + 1,
            movement_date=base + timedelta(days=i),
            notes=f"FIFO demo layer {i + 1}/{LAYERS} @ {unit_cost:.2f}",
        )
        db.add(mv)
        await db.flush()
        await finalize_movement_fifo(db, tenant.id, mv, in_unit_cost=unit_cost)
        created += 1

    await db.commit()
    return {
        "skipped": False,
        "tenant": code,
        "item_code": ITEM_CODE,
        "item_id": item.id,
        "warehouse_id": wh_id,
        "layers": created,
        "qty_per_layer": QTY_PER_LAYER,
        "unit_costs": [100.0 + i * 10.0 for i in range(LAYERS)],
        "hint": "On-hand qty = 100. Example OUT 25 → COGS uses 10@100 + 10@110 + 5@120.",
    }


async def main() -> None:
    async with AsyncSessionLocal() as db:
        result = await seed_fifo_demo_stock(db)
        if result.get("skipped"):
            return
        print("FIFO demo stock seeded.")
        for k, v in result.items():
            if k != "unit_costs":
                print(f"  {k}: {v}")
        print(f"  unit_costs (layer order): {result.get('unit_costs')}")


if __name__ == "__main__":
    asyncio.run(main())
