"""
Seed the Bangladesh garment factory inventory master data for ONE tenant.

What it creates (all master data, zero opening stock):
- Units of measure (reuses existing units such as "Pcs" or "Yard" instead of duplicating)
- Item categories and subcategories
- Stock groups (stock_nature: RAW_MATERIAL / WORK_IN_PROCESS / FINISHED_GOODS / OTHER)
- 9 godowns (raw-material godowns are bonded)
- Items from bd_garment_inventory_catalog.py

Safe to run again: it only ADDS records that are missing (matched by their code).
It never changes or deletes existing records, so a tenant's own edits are kept.

Run (by company code):
  docker compose exec backend python scripts/seed_bd_garment_inventory.py --company-code ABCD123456

Preview only (nothing is saved):
  docker compose exec backend python scripts/seed_bd_garment_inventory.py --company-code ABCD123456 --dry-run

Run (by tenant id):
  docker compose exec backend python scripts/seed_bd_garment_inventory.py --tenant-id 42
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import re
import sys
from collections import defaultdict
from decimal import Decimal
from pathlib import Path
from typing import Iterator

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))
scripts_dir = Path(__file__).resolve().parent
if str(scripts_dir) not in sys.path:
    sys.path.insert(0, str(scripts_dir))

from app.common.rls import bind_session_tenant  # noqa: E402
from app.database import AsyncSessionLocal, safe_async_session_rollback  # noqa: E402
from app.models import (  # noqa: E402
    Item,
    ItemCategory,
    ItemSubcategory,
    ItemUnit,
    StockGroup,
    Tenant,
    Warehouse,
)
from bd_garment_inventory_catalog import (  # noqa: E402
    CATEGORIES,
    GODOWNS,
    STOCK_GROUPS,
    SUBCATEGORIES,
    UNIT_ALIASES,
    UNIT_NAMES,
)

# Item codes are stored in items.item_code (String 32).
MAX_ITEM_CODE_LEN = 32


def build_item_code(subcategory_code: str, item_name: str) -> str:
    """Stable, readable code: SUBCODE-NAME-IN-CAPITALS. Long names get a short hash suffix.

    The same name always gives the same code, so re-running the seed never duplicates items.
    """
    slug = re.sub(r"[^A-Z0-9]+", "-", item_name.upper()).strip("-")
    code = f"{subcategory_code}-{slug}"
    if len(code) <= MAX_ITEM_CODE_LEN:
        return code
    digest = hashlib.sha1(item_name.encode("utf-8")).hexdigest()[:6].upper()
    keep = MAX_ITEM_CODE_LEN - len(subcategory_code) - len(digest) - 2
    return f"{subcategory_code}-{slug[:keep].rstrip('-')}-{digest}"


def iter_catalog_items() -> Iterator[dict]:
    """Every catalog item with its final values (subcategory defaults + per-item overrides)."""
    for sub in SUBCATEGORIES:
        for entry in sub["items"]:
            spec = entry if isinstance(entry, dict) else {"name": entry}
            name = spec["name"]
            yield {
                "subcategory": sub,
                "name": name,
                "item_code": build_item_code(sub["code"], name),
                "unit": spec.get("unit", sub["unit"]),
                "hsn": spec.get("hsn", sub["hsn"]),
                "description": spec.get("description", sub.get("description")),
            }


async def _resolve_tenant(db, *, tenant_id: int | None, company_code: str | None) -> Tenant:
    if tenant_id is not None:
        tenant = await db.get(Tenant, tenant_id)
        if not tenant:
            raise ValueError(f"Tenant id={tenant_id} not found")
        return tenant
    code = (company_code or "").strip().upper()
    if not code:
        raise ValueError("Provide --tenant-id or --company-code")
    tenant = (await db.execute(select(Tenant).where(Tenant.company_code == code))).scalar_one_or_none()
    if not tenant:
        raise ValueError(f"Tenant company_code={code!r} not found")
    return tenant


async def _existing_by_key(db, model, tenant_id: int, key_attr: str) -> dict:
    rows = (await db.execute(select(model).where(model.tenant_id == tenant_id))).scalars().all()
    return {getattr(row, key_attr): row for row in rows}


async def _seed_units(db, tenant_id: int, counts: dict) -> dict[str, ItemUnit]:
    """Return canonical unit code -> ItemUnit. Reuses an existing unit when its code or an alias matches."""
    existing = list((await db.execute(select(ItemUnit).where(ItemUnit.tenant_id == tenant_id))).scalars().all())
    resolved: dict[str, ItemUnit] = {}
    for code, name in UNIT_NAMES.items():
        wanted = {code.upper(), *(alias.upper() for alias in UNIT_ALIASES.get(code, []))}
        match = next((u for u in existing if u.unit_code == code), None) or next(
            (u for u in existing if u.unit_code.upper() in wanted), None
        )
        if match is None:
            match = ItemUnit(tenant_id=tenant_id, unit_code=code, name=name, is_active=True)
            db.add(match)
            existing.append(match)
            counts["units_added"] += 1
        elif match.unit_code != code:
            counts["units_reused_by_alias"] += 1
        resolved[code] = match
    await db.flush()
    return resolved


async def _seed_categories(db, tenant_id: int, counts: dict) -> dict[str, ItemCategory]:
    categories = await _existing_by_key(db, ItemCategory, tenant_id, "category_code")
    for code, name, description in CATEGORIES:
        if code in categories:
            counts["categories_existing"] += 1
            continue
        obj = ItemCategory(
            tenant_id=tenant_id, category_code=code, name=name, description=description, is_active=True
        )
        db.add(obj)
        categories[code] = obj
        counts["categories_added"] += 1
    await db.flush()
    return categories


async def _seed_subcategories(db, tenant_id: int, categories: dict, counts: dict) -> dict[str, ItemSubcategory]:
    subcategories = await _existing_by_key(db, ItemSubcategory, tenant_id, "subcategory_code")
    for sub in SUBCATEGORIES:
        if sub["code"] in subcategories:
            counts["subcategories_existing"] += 1
            continue
        obj = ItemSubcategory(
            tenant_id=tenant_id,
            category_id=categories[sub["category"]].id,
            subcategory_code=sub["code"],
            name=sub["name"],
            description=sub.get("description"),
            is_active=True,
        )
        db.add(obj)
        subcategories[sub["code"]] = obj
        counts["subcategories_added"] += 1
    await db.flush()
    return subcategories


async def _seed_stock_groups(db, tenant_id: int, counts: dict) -> dict[str, StockGroup]:
    groups = await _existing_by_key(db, StockGroup, tenant_id, "group_code")
    for code, name, parent_code, stock_nature in STOCK_GROUPS:
        if code in groups:
            counts["stock_groups_existing"] += 1
            continue
        parent = groups.get(parent_code) if parent_code else None
        if parent_code and parent is None:
            raise ValueError(f"Stock group {code} needs parent {parent_code} to be listed first")
        obj = StockGroup(
            tenant_id=tenant_id,
            group_code=code,
            name=name,
            parent_id=parent.id if parent else None,
            is_active=True,
            stock_nature=stock_nature,
        )
        db.add(obj)
        await db.flush()  # children need the parent id
        groups[code] = obj
        counts["stock_groups_added"] += 1
    return groups


async def _seed_godowns(db, tenant_id: int, counts: dict) -> dict[str, Warehouse]:
    godowns = await _existing_by_key(db, Warehouse, tenant_id, "warehouse_code")
    for code, name, is_bonded, address in GODOWNS:
        if code in godowns:
            counts["godowns_existing"] += 1
            continue
        obj = Warehouse(
            tenant_id=tenant_id,
            warehouse_code=code,
            name=name,
            address=address,
            is_active=True,
            is_store=True,
            is_bonded=is_bonded,
        )
        db.add(obj)
        godowns[code] = obj
        counts["godowns_added"] += 1
    await db.flush()
    return godowns


async def _seed_items(
    db,
    tenant_id: int,
    *,
    units: dict[str, ItemUnit],
    categories: dict[str, ItemCategory],
    subcategories: dict[str, ItemSubcategory],
    groups: dict[str, StockGroup],
    godowns: dict[str, Warehouse],
    counts: dict,
) -> None:
    existing_codes = set((await db.execute(select(Item.item_code).where(Item.tenant_id == tenant_id))).scalars().all())
    for entry in iter_catalog_items():
        if entry["item_code"] in existing_codes:
            counts["items_existing"] += 1
            continue
        sub = entry["subcategory"]
        unit = units[entry["unit"]]
        db.add(
            Item(
                tenant_id=tenant_id,
                item_code=entry["item_code"],
                name=entry["name"],
                description=entry["description"],
                category_id=categories[sub["category"]].id,
                subcategory_id=subcategories[sub["code"]].id,
                unit_id=unit.id,
                default_warehouse_id=godowns[sub["godown"]].id,
                stock_group_id=groups[sub["stock_group"]].id,
                default_cost=Decimal("0"),
                base_unit=unit.unit_code,
                current_stock=Decimal("0"),
                current_value=Decimal("0"),
                avg_cost=Decimal("0"),
                batch_tracking=bool(sub["batch"]),
                expiry_tracking=bool(sub["expiry"]),
                gst_applicable=False,
                hsn_code=entry["hsn"],
                default_valuation_method="FIFO",
                serial_tracking_enabled=False,
                is_active=True,
            )
        )
        existing_codes.add(entry["item_code"])
        counts["items_added"] += 1
    await db.flush()


async def seed_bd_garment_inventory(db, tenant_id: int) -> dict[str, int]:
    """Add every missing master record for one tenant. Does NOT commit; the caller decides."""
    counts: dict[str, int] = defaultdict(int)
    units = await _seed_units(db, tenant_id, counts)
    categories = await _seed_categories(db, tenant_id, counts)
    subcategories = await _seed_subcategories(db, tenant_id, categories, counts)
    groups = await _seed_stock_groups(db, tenant_id, counts)
    godowns = await _seed_godowns(db, tenant_id, counts)
    await _seed_items(
        db,
        tenant_id,
        units=units,
        categories=categories,
        subcategories=subcategories,
        groups=groups,
        godowns=godowns,
        counts=counts,
    )
    return dict(counts)


async def run_seed(
    *,
    tenant_id: int | None = None,
    company_code: str | None = None,
    dry_run: bool = False,
) -> dict[str, int | str | bool]:
    async with AsyncSessionLocal() as db:
        try:
            tenant = await _resolve_tenant(db, tenant_id=tenant_id, company_code=company_code)
            # Read these before commit/rollback: rollback expires ORM objects.
            resolved_id = tenant.id
            resolved_code = tenant.company_code or ""
            await bind_session_tenant(db, resolved_id)
            counts = await seed_bd_garment_inventory(db, resolved_id)
            if dry_run:
                await db.rollback()
            else:
                await db.commit()
        except Exception:
            await safe_async_session_rollback(db)
            raise
    return {"tenant_id": resolved_id, "company_code": resolved_code, "dry_run": dry_run, **counts}


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed BD garment factory inventory master data (idempotent).")
    parser.add_argument("--tenant-id", type=int, default=None, help="Target tenant id.")
    parser.add_argument("--company-code", default=None, help="Target tenant company_code.")
    parser.add_argument("--dry-run", action="store_true", help="Show what would be added, save nothing.")
    args = parser.parse_args()

    if args.tenant_id is None and not args.company_code:
        parser.error("Provide --tenant-id or --company-code")

    try:
        out = asyncio.run(
            run_seed(tenant_id=args.tenant_id, company_code=args.company_code, dry_run=args.dry_run)
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    title = "Dry run finished (nothing saved)." if out.get("dry_run") else "BD garment inventory seed finished."
    print(title)
    for key, value in out.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
