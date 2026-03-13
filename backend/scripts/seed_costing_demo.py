"""
Seed costing engine master data (item categories, item units, items, currencies)
for use in quotation costing. Safe to run after migration 006.
Currencies are global; item categories, units, and items are tenant-scoped (Lakhsma).

Run from backend dir:
  python scripts/seed_costing_demo.py
"""
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import Currency, Item, ItemCategory, ItemUnit, Tenant

LAKHSMA_CODE = "LAKHSMA4821"


async def get_lakhsma_tenant(db):
    result = await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))
    tenant = result.scalar_one_or_none()
    if not tenant:
        raise RuntimeError("Lakhsma tenant not found. Run seed_lakhsma.py first.")
    return tenant


async def seed_costing(db) -> None:
    tenant = await get_lakhsma_tenant(db)

    # Currencies (global)
    existing_curr = await db.execute(select(Currency).where(Currency.code == "USD"))
    if existing_curr.scalar_one_or_none() is None:
        for row in [
            ("USD", "US Dollar"),
            ("EUR", "Euro"),
            ("BDT", "Bangladeshi Taka"),
            ("GBP", "British Pound"),
        ]:
            db.add(Currency(code=row[0], name=row[1]))
        await db.flush()

    # Item categories (tenant)
    existing_cat = await db.execute(
        select(ItemCategory).where(
            ItemCategory.tenant_id == tenant.id,
            ItemCategory.category_code == "FABRIC",
        )
    )
    if existing_cat.scalar_one_or_none() is None:
        for code, name in [
            ("FABRIC", "Fabric"),
            ("TRIM", "Trim"),
            ("PACK", "Packaging"),
            ("OTHER", "Other"),
        ]:
            db.add(
                ItemCategory(
                    tenant_id=tenant.id,
                    category_code=code,
                    name=name,
                    description=f"{name} category for costing",
                )
            )
        await db.flush()

    cats = (
        await db.execute(
            select(ItemCategory).where(ItemCategory.tenant_id == tenant.id).order_by(ItemCategory.category_code)
        )
    ).scalars().all()
    fabric_cat = next((c for c in cats if c.category_code == "FABRIC"), None)
    trim_cat = next((c for c in cats if c.category_code == "TRIM"), None)
    if not fabric_cat or not trim_cat:
        await db.rollback()
        raise RuntimeError("Item categories not found after insert.")

    # Item units (tenant)
    existing_unit = await db.execute(
        select(ItemUnit).where(
            ItemUnit.tenant_id == tenant.id,
            ItemUnit.unit_code == "KG",
        )
    )
    if existing_unit.scalar_one_or_none() is None:
        for code, name in [
            ("KG", "Kilogram"),
            ("Yard", "Yard"),
            ("M", "Metre"),
            ("Pcs", "Pieces"),
            ("Dz", "Dozen"),
        ]:
            db.add(
                ItemUnit(
                    tenant_id=tenant.id,
                    unit_code=code,
                    name=name,
                )
            )
        await db.flush()

    units = (
        await db.execute(
            select(ItemUnit).where(ItemUnit.tenant_id == tenant.id).order_by(ItemUnit.unit_code)
        )
    ).scalars().all()
    kg_unit = next((u for u in units if u.unit_code == "KG"), None)
    yard_unit = next((u for u in units if u.unit_code == "Yard"), None)
    pcs_unit = next((u for u in units if u.unit_code == "Pcs"), None)
    if not kg_unit or not yard_unit:
        await db.rollback()
        raise RuntimeError("Item units not found after insert.")

    # Items (tenant) – for material dropdown
    existing_item = await db.execute(
        select(Item).where(
            Item.tenant_id == tenant.id,
            Item.item_code == "FAB-160GSM",
        )
    )
    if existing_item.scalar_one_or_none() is None:
        db.add(
            Item(
                tenant_id=tenant.id,
                item_code="FAB-160GSM",
                name="160 GSM Cotton Jersey",
                category_id=fabric_cat.id,
                unit_id=kg_unit.id,
                default_cost="3.50",
            )
        )
        db.add(
            Item(
                tenant_id=tenant.id,
                item_code="FAB-220GSM",
                name="220 GSM Fleece",
                category_id=fabric_cat.id,
                unit_id=kg_unit.id,
                default_cost="4.20",
            )
        )
        db.add(
            Item(
                tenant_id=tenant.id,
                item_code="TRIM-RIB",
                name="1x1 Neck Rib",
                category_id=trim_cat.id,
                unit_id=yard_unit.id if yard_unit else kg_unit.id,
                default_cost="0.80",
            )
        )
        if pcs_unit:
            db.add(
                Item(
                    tenant_id=tenant.id,
                    item_code="TRIM-LABEL",
                    name="Care Label",
                    category_id=trim_cat.id,
                    unit_id=pcs_unit.id,
                    default_cost="0.05",
                )
            )
        await db.flush()

    await db.commit()
    print("Costing demo data (currencies, item categories, units, items) seeded.")


async def main() -> None:
    async with AsyncSessionLocal() as db:
        await seed_costing(db)


if __name__ == "__main__":
    asyncio.run(main())
