"""
Seed inventory demo data (item categories, subcategories, units, warehouses,
stock groups, items) for tenant LAKHSMA4821. Idempotent: skips if already seeded.

Run from backend dir:
  python scripts/seed_inventory_demo.py
"""
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select, func

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import (
    Tenant,
    ItemCategory,
    ItemSubcategory,
    ItemUnit,
    Warehouse,
    StockGroup,
    Item,
)

LAKHSMA_CODE = "LAKHSMA4821"
INV_DEMO_MARKER = "INV-DEMO"


async def get_lakhsma_tenant(db):
    result = await db.execute(select(Tenant).where(Tenant.company_code == LAKHSMA_CODE))
    tenant = result.scalar_one_or_none()
    if not tenant:
        return None
    return tenant


async def is_already_seeded(db, tenant_id: int) -> bool:
    """True if INV-DEMO category exists or tenant has 10+ categories."""
    marker = await db.execute(
        select(ItemCategory).where(
            ItemCategory.tenant_id == tenant_id,
            ItemCategory.category_code == INV_DEMO_MARKER,
        )
    )
    if marker.scalar_one_or_none() is not None:
        return True
    count_result = await db.execute(
        select(func.count(ItemCategory.id)).where(ItemCategory.tenant_id == tenant_id)
    )
    return (count_result.scalar() or 0) >= 10


async def seed_inventory_demo(db) -> dict:
    tenant = await get_lakhsma_tenant(db)
    if not tenant:
        print(f"Tenant with company_code '{LAKHSMA_CODE}' not found. Run seed_lakhsma.py first.")
        sys.exit(1)

    if await is_already_seeded(db, tenant.id):
        print("Already seeded.")
        return {}

    counts = {}

    # 1. ItemCategory (10+), include INV-DEMO for idempotency
    categories_data = [
        (INV_DEMO_MARKER, "Inventory Demo", "Demo categories for inventory"),
        ("FABRIC", "Fabric", "Raw fabric and textiles"),
        ("TRIM", "Trim", "Trims and accessories"),
        ("PACK", "Packaging", "Packaging materials"),
        ("DYE", "Dye & Chemical", "Dyes and chemicals"),
        ("OTHER", "Other", "Other materials"),
        ("CONSUMABLE", "Consumable", "Consumables"),
        ("SPARE", "Spare Parts", "Spare parts"),
        ("FINISHED", "Finished Goods", "Finished goods"),
        ("SEMI", "Semi-Finished", "Semi-finished goods"),
        ("RAW", "Raw Material", "Raw materials"),
    ]
    for code, name, desc in categories_data:
        db.add(
            ItemCategory(
                tenant_id=tenant.id,
                category_code=code,
                name=name,
                description=desc,
            )
        )
    await db.flush()
    counts["ItemCategory"] = len(categories_data)

    # Load category IDs for subcategories and items
    cats_result = (
        await db.execute(
            select(ItemCategory).where(ItemCategory.tenant_id == tenant.id).order_by(ItemCategory.category_code)
        )
    ).scalars().all()
    cat_by_code = {c.category_code: c for c in cats_result}
    fabric_cat = cat_by_code.get("FABRIC")
    trim_cat = cat_by_code.get("TRIM")
    pack_cat = cat_by_code.get("PACK")
    other_cat = cat_by_code.get("OTHER")

    # 2. ItemSubcategory (10+)
    subcategories_data = [
        (fabric_cat, "FAB-COTTON", "Cotton"),
        (fabric_cat, "FAB-POLY", "Polyester"),
        (fabric_cat, "FAB-BLEND", "Blend"),
        (trim_cat, "TRIM-RIB", "Rib"),
        (trim_cat, "TRIM-LABEL", "Label"),
        (trim_cat, "TRIM-BUTTON", "Button"),
        (trim_cat, "TRIM-ZIP", "Zipper"),
        (pack_cat, "PACK-BOX", "Box"),
        (pack_cat, "PACK-POLY", "Polybag"),
        (other_cat, "OTH-MISC", "Miscellaneous"),
        (fabric_cat, "FAB-JERSEY", "Jersey"),
        (trim_cat, "TRIM-THREAD", "Thread"),
    ]
    for cat, sub_code, sub_name in subcategories_data:
        if cat is None:
            continue
        db.add(
            ItemSubcategory(
                tenant_id=tenant.id,
                category_id=cat.id,
                subcategory_code=sub_code,
                name=sub_name,
            )
        )
    await db.flush()
    counts["ItemSubcategory"] = len([t for t in subcategories_data if t[0] is not None])

    # Load subcategory IDs for items
    subs_result = (
        await db.execute(
            select(ItemSubcategory).where(ItemSubcategory.tenant_id == tenant.id).order_by(ItemSubcategory.subcategory_code)
        )
    ).scalars().all()
    sub_by_code = {s.subcategory_code: s for s in subs_result}

    # 3. ItemUnit (10+)
    units_data = [
        ("KG", "Kilogram"),
        ("Yard", "Yard"),
        ("M", "Metre"),
        ("Pcs", "Pieces"),
        ("Dz", "Dozen"),
        ("L", "Litre"),
        ("Roll", "Roll"),
        ("Box", "Box"),
        ("Set", "Set"),
        ("Pair", "Pair"),
        ("Mtr", "Metre (alt)"),
    ]
    for unit_code, unit_name in units_data:
        db.add(
            ItemUnit(
                tenant_id=tenant.id,
                unit_code=unit_code,
                name=unit_name,
            )
        )
    await db.flush()
    counts["ItemUnit"] = len(units_data)

    units_result = (
        await db.execute(
            select(ItemUnit).where(ItemUnit.tenant_id == tenant.id).order_by(ItemUnit.unit_code)
        )
    ).scalars().all()
    unit_by_code = {u.unit_code: u for u in units_result}
    kg_unit = unit_by_code.get("KG")
    yard_unit = unit_by_code.get("Yard")
    pcs_unit = unit_by_code.get("Pcs")
    m_unit = unit_by_code.get("M")

    # 4. Warehouse (10+)
    warehouses_data = [
        ("WH-MAIN", "Main Warehouse", "Building A, Ground Floor"),
        ("WH-FIN", "Finished Goods WH", "Building B"),
        ("WH-RAW", "Raw Material WH", "Building A, First Floor"),
        ("WH-TRIM", "Trim Store", "Building C"),
        ("WH-PACK", "Packaging Store", "Building C"),
        ("WH-DYE", "Dye Store", "Building D"),
        ("WH-QC", "QC Hold", "QC Section"),
        ("WH-SAMPLE", "Sample Room", "Sample Section"),
        ("WH-SCRAP", "Scrap Yard", "Yard Area"),
        ("WH-TRANSIT", "Transit", "In transit"),
        ("WH-SEC", "Secondary WH", "Off-site"),
    ]
    for wh_code, wh_name, wh_addr in warehouses_data:
        db.add(
            Warehouse(
                tenant_id=tenant.id,
                warehouse_code=wh_code,
                name=wh_name,
                address=wh_addr,
            )
        )
    await db.flush()
    counts["Warehouse"] = len(warehouses_data)

    # 5. StockGroup (10+): 3–4 roots, 6–8 children
    roots_data = [
        ("ROOT-FAB", "Fabric Stock"),
        ("ROOT-TRIM", "Trim Stock"),
        ("ROOT-FG", "Finished Goods"),
    ]
    root_objs = []
    for grp_code, grp_name in roots_data:
        g = StockGroup(
            tenant_id=tenant.id,
            group_code=grp_code,
            name=grp_name,
            parent_id=None,
        )
        db.add(g)
        root_objs.append((grp_code, g))
    await db.flush()
    root_by_code = {c: g for c, g in root_objs}

    children_data = [
        ("FAB-COTTON", "Cotton Fabric", "ROOT-FAB"),
        ("FAB-POLY", "Polyester Fabric", "ROOT-FAB"),
        ("TRIM-RIB", "Rib Stock", "ROOT-TRIM"),
        ("TRIM-LABEL", "Label Stock", "ROOT-TRIM"),
        ("FG-GARMENT", "Garment FG", "ROOT-FG"),
        ("FG-PACK", "Packed FG", "ROOT-FG"),
        ("FAB-BLEND", "Blend Fabric", "ROOT-FAB"),
        ("TRIM-BUTTON", "Button Stock", "ROOT-TRIM"),
    ]
    for grp_code, grp_name, parent_code in children_data:
        parent = root_by_code.get(parent_code)
        db.add(
            StockGroup(
                tenant_id=tenant.id,
                group_code=grp_code,
                name=grp_name,
                parent_id=parent.id if parent else None,
            )
        )
    await db.flush()
    counts["StockGroup"] = len(roots_data) + len(children_data)

    # 6. Item (10+): category_id, unit_id, optional subcategory_id
    fabric_cotton_sub = sub_by_code.get("FAB-COTTON")
    fabric_jersey_sub = sub_by_code.get("FAB-JERSEY")
    trim_rib_sub = sub_by_code.get("TRIM-RIB")
    trim_label_sub = sub_by_code.get("TRIM-LABEL")

    items_data = [
        ("INV-FAB-160", "160 GSM Cotton Jersey", fabric_cat, fabric_cotton_sub, kg_unit, "3.50"),
        ("INV-FAB-220", "220 GSM Fleece", fabric_cat, fabric_jersey_sub, kg_unit, "4.20"),
        ("INV-FAB-180", "180 GSM Single Jersey", fabric_cat, fabric_cotton_sub, kg_unit, "3.80"),
        ("INV-TRIM-RIB", "1x1 Neck Rib", trim_cat, trim_rib_sub, yard_unit or kg_unit, "0.80"),
        ("INV-TRIM-LABEL", "Care Label", trim_cat, trim_label_sub, pcs_unit, "0.05"),
        ("INV-TRIM-ZIP", "Metal Zipper", trim_cat, sub_by_code.get("TRIM-ZIP"), pcs_unit, "0.25"),
        ("INV-PACK-BOX", "Carton Box", pack_cat, sub_by_code.get("PACK-BOX"), pcs_unit, "1.20"),
        ("INV-PACK-POLY", "Polybag", pack_cat, sub_by_code.get("PACK-POLY"), pcs_unit, "0.02"),
        ("INV-RAW-YARN", "Cotton Yarn", other_cat, None, kg_unit, "2.50"),
        ("INV-DYE-WHITE", "White Dye", cat_by_code.get("DYE"), None, kg_unit, "5.00"),
        ("INV-FIN-TSHIRT", "Finished T-Shirt", cat_by_code.get("FINISHED"), None, pcs_unit, "8.00"),
        ("INV-MTR-METRE", "Fabric by Metre", fabric_cat, None, m_unit or yard_unit, "2.00"),
    ]
    for item_code, item_name, cat, subcat, unit, cost in items_data:
        if cat is None or unit is None:
            continue
        db.add(
            Item(
                tenant_id=tenant.id,
                item_code=item_code,
                name=item_name,
                category_id=cat.id,
                subcategory_id=subcat.id if subcat else None,
                unit_id=unit.id,
                default_cost=cost or "0",
            )
        )
    await db.flush()
    counts["Item"] = len([t for t in items_data if t[2] is not None and t[4] is not None])

    await db.commit()
    return counts


async def main() -> None:
    async with AsyncSessionLocal() as db:
        counts = await seed_inventory_demo(db)
        if counts:
            print("Inventory demo data seeded.")
            for entity, n in counts.items():
                print(f"  {entity}: {n}")


if __name__ == "__main__":
    asyncio.run(main())
