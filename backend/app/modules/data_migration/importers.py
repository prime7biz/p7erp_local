"""CSV/Excel data migration importers with dry-run validation."""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer, ItemCategory, ItemUnit, Tenant, Vendor, Warehouse
from app.models.costing import Item
from app.models.finance import AccountGroup
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa


def _row_opt(row: dict[str, str], *keys: str) -> str | None:
    for key in keys:
        raw = (row.get(key) or "").strip()
        if raw:
            return raw
    return None


def _parse_import_credit_limit(raw: str | None) -> Decimal | None:
    if not raw:
        return None
    try:
        dec = Decimal(raw.replace(",", "").replace(" ", ""))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValueError("credit_limit must be a valid decimal") from exc
    if not dec.is_finite() or dec < 0:
        raise ValueError("credit_limit must be a finite non-negative decimal")
    return dec


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
        # Normalize keys to lowercase so Excel headers stay flexible.
        norm = {str(k).strip().lower(): (v or "").strip() for k, v in row.items() if k}
        code = norm.get("code", "").strip()
        name = norm.get("name", "").strip()
        if not code or not name:
            result.error_count += 1
            result.rows.append(ImportRowResult(i, "error", "code and name required"))
            continue
        try:
            credit_limit = _parse_import_credit_limit(_row_opt(norm, "credit_limit"))
        except ValueError as exc:
            result.error_count += 1
            result.rows.append(ImportRowResult(i, "error", str(exc)))
            continue
        lead_raw = _row_opt(norm, "typical_lead_time_days")
        lead_days: int | None = None
        if lead_raw is not None:
            try:
                lead_days = int(lead_raw)
            except ValueError:
                result.error_count += 1
                result.rows.append(ImportRowResult(i, "error", "typical_lead_time_days must be an integer"))
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
        c = Customer(
            tenant_id=tenant.id,
            customer_code=code,
            name=name,
            email=_row_opt(norm, "email"),
            preferred_currency=_row_opt(norm, "preferred_currency"),
            payment_terms=_row_opt(norm, "payment_terms"),
            default_incoterm=_row_opt(norm, "default_incoterm"),
            typical_lead_time_days=lead_days,
            industry_segment=_row_opt(norm, "industry_segment"),
            compliance_level=_row_opt(norm, "compliance_level"),
            credit_limit=credit_limit,
            notes=_row_opt(norm, "notes"),
            phone=_row_opt(norm, "phone"),
            country=_row_opt(norm, "country"),
            status=_row_opt(norm, "status") or "active",
        )
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
