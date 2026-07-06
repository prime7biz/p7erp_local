"""CSV/Excel data migration importers with dry-run validation."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, ItemCategory, ItemUnit, Tenant, Vendor, Warehouse
from app.models.costing import Item
from app.models.finance import AccountGroup
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa


@dataclass
class ImportRowResult:
    row_number: int
    status: str  # ok | skip | error
    message: str
    entity_id: int | None = None


@dataclass
class ImportBatchResult:
    entity_type: str
    dry_run: bool
    total_rows: int = 0
    ok_count: int = 0
    skip_count: int = 0
    error_count: int = 0
    rows: list[ImportRowResult] = field(default_factory=list)


REQUIRED_COLUMNS: dict[str, list[str]] = {
    "customers": ["code", "name"],
    "vendors": ["code", "name"],
    "items": ["code", "name", "unit_code"],
    "employees": ["employee_code", "first_name"],
    "chart_of_accounts": ["account_number", "name", "group_name"],
}


def parse_csv_text(text: str) -> list[dict[str, str]]:
    reader = csv.DictReader(io.StringIO(text.strip()))
    if not reader.fieldnames:
        return []
    return [{k.strip(): (v or "").strip() for k, v in row.items() if k} for row in reader]


def validate_columns(entity_type: str, rows: list[dict[str, str]]) -> list[str]:
    required = REQUIRED_COLUMNS.get(entity_type, [])
    if not rows:
        return ["No data rows found"]
    headers = {k.lower() for k in rows[0].keys()}
    missing = [c for c in required if c not in headers]
    return [f"Missing required column: {c}" for c in missing]


async def _ensure_default_masters(db: AsyncSession, tenant_id: int) -> tuple[int | None, int | None]:
    cat = (
        await db.execute(
            select(ItemCategory).where(
                ItemCategory.tenant_id == tenant_id, ItemCategory.category_code == "MIG-DEF"
            )
        )
    ).scalar_one_or_none()
    if not cat:
        cat = ItemCategory(tenant_id=tenant_id, category_code="MIG-DEF", name="Migration Default")
        db.add(cat)
        await db.flush()
    unit = (
        await db.execute(
            select(ItemUnit).where(ItemUnit.tenant_id == tenant_id, ItemUnit.unit_code == "PCS")
        )
    ).scalar_one_or_none()
    if not unit:
        unit = ItemUnit(tenant_id=tenant_id, unit_code="PCS", name="Pieces")
        db.add(unit)
        await db.flush()
    return cat.id, unit.id


async def import_customers(
    db: AsyncSession,
    tenant: Tenant,
    rows: list[dict[str, str]],
    *,
    dry_run: bool = True,
) -> ImportBatchResult:
    result = ImportBatchResult(entity_type="customers", dry_run=dry_run, total_rows=len(rows))
    for i, row in enumerate(rows, start=2):
        code = row.get("code", "").strip()
        name = row.get("name", "").strip()
        if not code or not name:
            result.error_count += 1
            result.rows.append(ImportRowResult(i, "error", "code and name required"))
            continue
        existing = (
            await db.execute(
                select(Customer).where(Customer.tenant_id == tenant.id, Customer.customer_code == code)
            )
        ).scalar_one_or_none()
        if existing:
            result.skip_count += 1
            result.rows.append(ImportRowResult(i, "skip", "customer exists", existing.id))
            continue
        if dry_run:
            result.ok_count += 1
            result.rows.append(ImportRowResult(i, "ok", "would create"))
            continue
        c = Customer(tenant_id=tenant.id, customer_code=code, name=name, email=row.get("email") or None)
        db.add(c)
        await db.flush()
        result.ok_count += 1
        result.rows.append(ImportRowResult(i, "ok", "created", c.id))
    if not dry_run:
        await db.commit()
    return result


async def import_vendors(
    db: AsyncSession,
    tenant: Tenant,
    rows: list[dict[str, str]],
    *,
    dry_run: bool = True,
) -> ImportBatchResult:
    result = ImportBatchResult(entity_type="vendors", dry_run=dry_run, total_rows=len(rows))
    for i, row in enumerate(rows, start=2):
        code = row.get("code", "").strip()
        name = row.get("name", "").strip()
        if not code or not name:
            result.error_count += 1
            result.rows.append(ImportRowResult(i, "error", "code and name required"))
            continue
        existing = (
            await db.execute(select(Vendor).where(Vendor.tenant_id == tenant.id, Vendor.vendor_code == code))
        ).scalar_one_or_none()
        if existing:
            result.skip_count += 1
            result.rows.append(ImportRowResult(i, "skip", "vendor exists", existing.id))
            continue
        if dry_run:
            result.ok_count += 1
            result.rows.append(ImportRowResult(i, "ok", "would create"))
            continue
        v = Vendor(tenant_id=tenant.id, vendor_code=code, name=name)
        db.add(v)
        await db.flush()
        result.ok_count += 1
        result.rows.append(ImportRowResult(i, "ok", "created", v.id))
    if not dry_run:
        await db.commit()
    return result


async def import_items(
    db: AsyncSession,
    tenant: Tenant,
    rows: list[dict[str, str]],
    *,
    dry_run: bool = True,
) -> ImportBatchResult:
    result = ImportBatchResult(entity_type="items", dry_run=dry_run, total_rows=len(rows))
    cat_id, unit_id = await _ensure_default_masters(db, tenant.id)
    wh = (
        await db.execute(select(Warehouse).where(Warehouse.tenant_id == tenant.id).limit(1))
    ).scalar_one_or_none()
    for i, row in enumerate(rows, start=2):
        code = row.get("code", "").strip()
        name = row.get("name", "").strip()
        if not code or not name:
            result.error_count += 1
            result.rows.append(ImportRowResult(i, "error", "code and name required"))
            continue
        existing = (
            await db.execute(select(Item).where(Item.tenant_id == tenant.id, Item.item_code == code))
        ).scalar_one_or_none()
        if existing:
            result.skip_count += 1
            result.rows.append(ImportRowResult(i, "skip", "item exists", existing.id))
            continue
        if dry_run:
            result.ok_count += 1
            result.rows.append(ImportRowResult(i, "ok", "would create"))
            continue
        item = Item(
            tenant_id=tenant.id,
            item_code=code,
            name=name,
            category_id=cat_id,
            unit_id=unit_id,
            default_warehouse_id=wh.id if wh else None,
        )
        db.add(item)
        await db.flush()
        result.ok_count += 1
        result.rows.append(ImportRowResult(i, "ok", "created", item.id))
    if not dry_run:
        await db.commit()
    return result


IMPORTERS = {
    "customers": import_customers,
    "vendors": import_vendors,
    "items": import_items,
}


async def run_import(
    db: AsyncSession,
    tenant: Tenant,
    entity_type: str,
    csv_text: str,
    *,
    dry_run: bool = True,
) -> dict[str, Any]:
    if entity_type == "chart_of_accounts":
        if dry_run:
            return {"entity_type": entity_type, "dry_run": True, "message": "Would seed system COA if missing"}
        existing_count = (
            await db.execute(
                select(func.count()).select_from(AccountGroup).where(AccountGroup.tenant_id == tenant.id)
            )
        ).scalar_one()
        if existing_count and int(existing_count) > 0:
            return {
                "entity_type": entity_type,
                "dry_run": False,
                "message": "System COA already present (skipped)",
                "ok_count": 0,
                "skip_count": 1,
                "error_count": 0,
            }
        await seed_tenant_system_coa(db, tenant.id)
        await db.commit()
        return {"entity_type": entity_type, "dry_run": False, "message": "System COA seeded", "ok_count": 1}
    rows = parse_csv_text(csv_text)
    col_errors = validate_columns(entity_type, rows)
    if col_errors:
        return {"entity_type": entity_type, "dry_run": dry_run, "errors": col_errors}
    importer = IMPORTERS.get(entity_type)
    if not importer:
        return {"entity_type": entity_type, "dry_run": dry_run, "errors": [f"Unknown entity_type: {entity_type}"]}
    batch = await importer(db, tenant, rows, dry_run=dry_run)
    return {
        "entity_type": batch.entity_type,
        "dry_run": batch.dry_run,
        "total_rows": batch.total_rows,
        "ok_count": batch.ok_count,
        "skip_count": batch.skip_count,
        "error_count": batch.error_count,
        "rows": [{"row_number": r.row_number, "status": r.status, "message": r.message, "entity_id": r.entity_id} for r in batch.rows[:200]],
    }
