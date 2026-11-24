"""BD garment inventory seed: catalog checks (no DB) and seed behaviour (integration).

Run:
  docker compose exec backend pytest tests/test_seed_bd_garment_inventory.py -q
"""

from __future__ import annotations

import sys
import uuid
from pathlib import Path

import pytest
from sqlalchemy import select

SCRIPTS_DIR = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

import bd_garment_inventory_catalog as catalog  # noqa: E402
import seed_bd_garment_inventory as seed  # noqa: E402

from app.models import Item, ItemCategory, ItemSubcategory, ItemUnit, StockGroup, Tenant, Warehouse  # noqa: E402
from app.models.tenant import TenantType  # noqa: E402


def _all_items() -> list[dict]:
    return list(seed.iter_catalog_items())


# ---------------------------------------------------------------------------
# Catalog checks (pure data, no database)
# ---------------------------------------------------------------------------


def test_catalog_item_codes_are_unique_and_fit_column():
    codes = [entry["item_code"] for entry in _all_items()]
    assert len(codes) == len(set(codes)), "two catalog items would get the same item_code"
    assert all(len(code) <= seed.MAX_ITEM_CODE_LEN for code in codes)


def test_catalog_has_no_duplicate_names_inside_a_subcategory():
    for sub in catalog.SUBCATEGORIES:
        names = [e["name"] if isinstance(e, dict) else e for e in sub["items"]]
        assert len(names) == len(set(names)), f"duplicate item name in {sub['code']}"


def test_catalog_references_point_to_defined_records():
    category_codes = {code for code, _, _ in catalog.CATEGORIES}
    group_codes = {code for code, _, _, _ in catalog.STOCK_GROUPS}
    godown_codes = {code for code, _, _, _ in catalog.GODOWNS}
    sub_codes = [sub["code"] for sub in catalog.SUBCATEGORIES]

    assert len(sub_codes) == len(set(sub_codes)), "duplicate subcategory code"
    assert len(godown_codes) == len(catalog.GODOWNS), "duplicate godown code"
    for sub in catalog.SUBCATEGORIES:
        assert sub["category"] in category_codes, sub["code"]
        assert sub["stock_group"] in group_codes, sub["code"]
        assert sub["godown"] in godown_codes, sub["code"]
        assert sub["unit"] in catalog.UNIT_NAMES, sub["code"]
    for entry in _all_items():
        assert entry["unit"] in catalog.UNIT_NAMES, entry["item_code"]


def test_stock_group_parents_are_listed_before_children():
    seen: set[str] = set()
    for code, _name, parent, _nature in catalog.STOCK_GROUPS:
        if parent is not None:
            assert parent in seen, f"{code} lists parent {parent} too late"
        seen.add(code)


def test_only_raw_material_godowns_are_bonded():
    bonded = {code for code, _, is_bonded, _ in catalog.GODOWNS if is_bonded}
    assert bonded == {
        "YARN-GODOWN", "KNIT-GODOWN", "FABRIC-GODOWN", "ACC-GODOWN", "PACK-GODOWN", "CHEM-GODOWN",
    }


def test_batch_and_expiry_tracking_follow_the_plan():
    for sub in catalog.SUBCATEGORIES:
        if sub["category"] in {"YARN", "FABRIC", "DYE"}:
            assert sub["batch"] is True, sub["code"]
        else:
            assert sub["batch"] is False, sub["code"]
        assert sub["expiry"] is (sub["category"] == "DYE"), sub["code"]


def test_catalog_is_large_enough_for_a_factory_database():
    assert len(_all_items()) >= 240


# ---------------------------------------------------------------------------
# Seed behaviour (integration; rolled back by the db_session_integration fixture)
# ---------------------------------------------------------------------------


async def _make_tenant(db, label: str) -> Tenant:
    code = f"BD{uuid.uuid4().hex[:12]}".upper()
    tenant = Tenant(
        name=f"BD garment seed {label} {code}",
        tenant_type=TenantType.manufacturer,
        is_active=True,
        company_code=code,
        feature_flags={},
        base_currency="BDT",
    )
    db.add(tenant)
    await db.flush()
    return tenant


async def _count(db, model, tenant_id: int) -> int:
    return len((await db.execute(select(model.id).where(model.tenant_id == tenant_id))).scalars().all())


@pytest.mark.asyncio
async def test_second_run_adds_nothing(db_session_integration):
    db = db_session_integration
    tenant = await _make_tenant(db, "rerun")
    total = len(_all_items())

    first = await seed.seed_bd_garment_inventory(db, tenant.id)
    await db.flush()
    assert first["items_added"] == total
    assert first["godowns_added"] == len(catalog.GODOWNS)

    second = await seed.seed_bd_garment_inventory(db, tenant.id)
    await db.flush()
    assert second.get("items_added", 0) == 0
    assert second["items_existing"] == total
    assert second.get("units_added", 0) == 0
    assert second.get("categories_added", 0) == 0
    assert second.get("stock_groups_added", 0) == 0

    assert await _count(db, Item, tenant.id) == total
    assert await _count(db, Warehouse, tenant.id) == len(catalog.GODOWNS)
    assert await _count(db, StockGroup, tenant.id) == len(catalog.STOCK_GROUPS)
    assert await _count(db, ItemCategory, tenant.id) == len(catalog.CATEGORIES)
    assert await _count(db, ItemSubcategory, tenant.id) == len(catalog.SUBCATEGORIES)


@pytest.mark.asyncio
async def test_existing_units_are_reused_not_duplicated(db_session_integration):
    db = db_session_integration
    tenant = await _make_tenant(db, "units")
    # Units an older tenant may already have (from seed_new_tenant_minimum / seed_inventory_demo).
    existing = {
        "Pcs": ItemUnit(tenant_id=tenant.id, unit_code="Pcs", name="Pieces", is_active=True),
        "Yard": ItemUnit(tenant_id=tenant.id, unit_code="Yard", name="Yard", is_active=True),
        "M": ItemUnit(tenant_id=tenant.id, unit_code="M", name="Metre", is_active=True),
    }
    db.add_all(existing.values())
    await db.flush()

    await seed.seed_bd_garment_inventory(db, tenant.id)
    await db.flush()

    units = (await db.execute(select(ItemUnit).where(ItemUnit.tenant_id == tenant.id))).scalars().all()
    upper_codes = [u.unit_code.upper() for u in units]
    # "Pcs", "Yard" and "M" stand in for PCS, YD and MTR, so no second unit with those meanings is created.
    assert upper_codes.count("PCS") == 1
    assert "YD" not in upper_codes
    assert "MTR" not in upper_codes
    assert {"Pcs", "Yard", "M"} <= {u.unit_code for u in units}

    pcs_items = (
        await db.execute(select(Item).where(Item.tenant_id == tenant.id, Item.unit_id == existing["Pcs"].id))
    ).scalars().all()
    assert len(pcs_items) > 0, "catalog items in pieces should use the tenant's existing Pcs unit"


@pytest.mark.asyncio
async def test_tenants_do_not_share_units_or_items(db_session_integration):
    db = db_session_integration
    tenant_a = await _make_tenant(db, "a")
    tenant_b = await _make_tenant(db, "b")
    total = len(_all_items())

    counts_a = await seed.seed_bd_garment_inventory(db, tenant_a.id)
    await db.flush()
    counts_b = await seed.seed_bd_garment_inventory(db, tenant_b.id)
    await db.flush()

    # Tenant B must get its own full set, not reuse tenant A's rows.
    assert counts_a["items_added"] == total
    assert counts_b["items_added"] == total
    assert await _count(db, Item, tenant_a.id) == total
    assert await _count(db, Item, tenant_b.id) == total
    assert await _count(db, ItemUnit, tenant_b.id) == len(catalog.UNIT_NAMES)


@pytest.mark.asyncio
async def test_item_links_stay_inside_the_same_tenant(db_session_integration):
    db = db_session_integration
    tenant = await _make_tenant(db, "links")
    other = await _make_tenant(db, "other")
    await seed.seed_bd_garment_inventory(db, other.id)
    await seed.seed_bd_garment_inventory(db, tenant.id)
    await db.flush()

    own = {
        "unit": {u.id for u in (await db.execute(select(ItemUnit).where(ItemUnit.tenant_id == tenant.id))).scalars()},
        "category": {c.id for c in (await db.execute(select(ItemCategory).where(ItemCategory.tenant_id == tenant.id))).scalars()},
        "subcategory": {s.id for s in (await db.execute(select(ItemSubcategory).where(ItemSubcategory.tenant_id == tenant.id))).scalars()},
        "group": {g.id for g in (await db.execute(select(StockGroup).where(StockGroup.tenant_id == tenant.id))).scalars()},
        "godown": {w.id for w in (await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id))).scalars()},
    }
    items = (await db.execute(select(Item).where(Item.tenant_id == tenant.id))).scalars().all()
    assert items
    for item in items:
        assert item.unit_id in own["unit"], item.item_code
        assert item.category_id in own["category"], item.item_code
        assert item.subcategory_id in own["subcategory"], item.item_code
        assert item.stock_group_id in own["group"], item.item_code
        assert item.default_warehouse_id in own["godown"], item.item_code
        assert item.current_stock == 0, "seed must not create opening stock"
