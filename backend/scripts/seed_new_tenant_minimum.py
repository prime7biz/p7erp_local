"""
Seed minimum operational data for a new or under-provisioned tenant.

Creates (idempotent):
- Global currencies (USD, EUR, BDT, GBP)
- Item categories and units
- One default warehouse (WH-MAIN)
- One open accounting period (current calendar month)
- Default permissions on empty non-admin roles

Also seeds system chart of accounts when missing (same as public tenant create).

Run (by company code):
  docker compose exec backend python scripts/seed_new_tenant_minimum.py --company-code ABCD123456

Run (by tenant id):
  docker compose exec backend python scripts/seed_new_tenant_minimum.py --tenant-id 42
"""

from __future__ import annotations

import argparse
import asyncio
import calendar
import sys
from datetime import date
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.common.system_roles import SYSTEM_ROLE_SEEDS  # noqa: E402
from app.database import AsyncSessionLocal  # noqa: E402
from app.models import (  # noqa: E402
    AccountingPeriod,
    Currency,
    ItemCategory,
    ItemUnit,
    Role,
    Tenant,
    Warehouse,
)
from app.modules.finance.system_coa_seeding_service import seed_tenant_system_coa  # noqa: E402

MIN_CATEGORY_CODE = "TEN-MIN"
MIN_WAREHOUSE_CODE = "WH-MAIN"
MIN_PERIOD_PREFIX = "TEN-MIN-"


def _default_permissions_for_role_name(role_name: str) -> dict[str, bool]:
    rn = (role_name or "").strip().lower()
    if rn == "manager":
        return {
            "merch.access": True,
            "inventory.access": True,
            "production.access": True,
            "finance.access": True,
            "trade.access": True,
            "facility.access": True,
            "hr.access": True,
            "reports.access": True,
            "ai.access": True,
            "business_overview.access": True,
            "settings.access": True,
        }
    if rn == "user":
        return {
            "merch.access": True,
            "inventory.access": True,
            "production.access": True,
            "finance.access": True,
            "trade.access": True,
            "facility.access": True,
            "hr.access": True,
            "reports.access": True,
            "ai.access": True,
            "business_overview.access": True,
        }
    return {
        "merch.access": True,
        "inventory.access": True,
        "production.access": True,
        "finance.access": True,
        "trade.access": True,
        "facility.access": True,
        "hr.access": True,
        "reports.access": True,
        "ai.access": True,
        "business_overview.access": True,
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


async def seed_new_tenant_minimum(
    *,
    tenant_id: int | None = None,
    company_code: str | None = None,
) -> dict[str, int | str]:
    counts: dict[str, int | str] = {}
    async with AsyncSessionLocal() as db:
        tenant = await _resolve_tenant(db, tenant_id=tenant_id, company_code=company_code)
        counts["tenant_id"] = tenant.id
        counts["company_code"] = tenant.company_code or ""

        coa_summary = await seed_tenant_system_coa(db, tenant.id)
        counts["coa_ledgers_created"] = int(coa_summary.get("created_ledgers", 0) or 0)

        for code, name in [("USD", "US Dollar"), ("EUR", "Euro"), ("BDT", "Bangladeshi Taka"), ("GBP", "British Pound")]:
            existing = (await db.execute(select(Currency).where(Currency.code == code))).scalar_one_or_none()
            if existing is None:
                db.add(Currency(code=code, name=name, is_active=True))
                counts["currencies_added"] = int(counts.get("currencies_added", 0)) + 1
        await db.flush()

        categories = [
            (MIN_CATEGORY_CODE, "Tenant Minimum", "Marker category for minimum tenant seed"),
            ("FABRIC", "Fabric", "Raw fabric and textiles"),
            ("TRIM", "Trim", "Trims and accessories"),
            ("OTHER", "Other", "Other materials"),
        ]
        for cat_code, cat_name, cat_desc in categories:
            existing = (
                await db.execute(
                    select(ItemCategory).where(
                        ItemCategory.tenant_id == tenant.id,
                        ItemCategory.category_code == cat_code,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                db.add(
                    ItemCategory(
                        tenant_id=tenant.id,
                        category_code=cat_code,
                        name=cat_name,
                        description=cat_desc,
                    )
                )
                counts["categories_added"] = int(counts.get("categories_added", 0)) + 1
        await db.flush()

        units = [("KG", "Kilogram"), ("Yard", "Yard"), ("Pcs", "Pieces"), ("M", "Metre")]
        for unit_code, unit_name in units:
            existing = (
                await db.execute(
                    select(ItemUnit).where(
                        ItemUnit.tenant_id == tenant.id,
                        ItemUnit.unit_code == unit_code,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                db.add(ItemUnit(tenant_id=tenant.id, unit_code=unit_code, name=unit_name))
                counts["units_added"] = int(counts.get("units_added", 0)) + 1
        await db.flush()

        wh = (
            await db.execute(
                select(Warehouse).where(
                    Warehouse.tenant_id == tenant.id,
                    Warehouse.warehouse_code == MIN_WAREHOUSE_CODE,
                )
            )
        ).scalar_one_or_none()
        if wh is None:
            db.add(
                Warehouse(
                    tenant_id=tenant.id,
                    warehouse_code=MIN_WAREHOUSE_CODE,
                    name="Main Warehouse",
                    address="Default warehouse (minimum seed)",
                    is_active=True,
                )
            )
            counts["warehouse_added"] = 1
        await db.flush()

        today = date.today()
        last_day = calendar.monthrange(today.year, today.month)[1]
        period_name = f"{MIN_PERIOD_PREFIX}{today.year:04d}-{today.month:02d}"
        period = (
            await db.execute(
                select(AccountingPeriod).where(
                    AccountingPeriod.tenant_id == tenant.id,
                    AccountingPeriod.period_name == period_name,
                )
            )
        ).scalar_one_or_none()
        if period is None:
            db.add(
                AccountingPeriod(
                    tenant_id=tenant.id,
                    period_name=period_name,
                    start_date=date(today.year, today.month, 1),
                    end_date=date(today.year, today.month, last_day),
                    is_closed=False,
                )
            )
            counts["accounting_period_added"] = 1
        await db.flush()

        roles = list(
            (await db.execute(select(Role).where(Role.tenant_id == tenant.id).order_by(Role.id.asc()))).scalars().all()
        )
        existing_names = {(r.name or "").strip().lower() for r in roles}
        for role_name, display_name in SYSTEM_ROLE_SEEDS:
            if role_name not in existing_names:
                db.add(
                    Role(
                        tenant_id=tenant.id,
                        name=role_name,
                        display_name=display_name,
                        permissions={},
                        is_system=True,
                    )
                )
                counts["roles_added"] = int(counts.get("roles_added", 0)) + 1
        await db.flush()

        roles = list(
            (await db.execute(select(Role).where(Role.tenant_id == tenant.id).order_by(Role.id.asc()))).scalars().all()
        )
        for role in roles:
            if (role.name or "").strip().lower() == "admin":
                continue
            existing = role.permissions if isinstance(role.permissions, dict) else {}
            if existing:
                continue
            role.permissions = _default_permissions_for_role_name(role.name or "")
            counts["roles_permissions_updated"] = int(counts.get("roles_permissions_updated", 0)) + 1

        await db.commit()
        return counts


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed minimum data for a tenant (idempotent).")
    parser.add_argument("--tenant-id", type=int, default=None, help="Target tenant id.")
    parser.add_argument("--company-code", default=None, help="Target tenant company_code.")
    args = parser.parse_args()

    if args.tenant_id is None and not args.company_code:
        parser.error("Provide --tenant-id or --company-code")

    try:
        out = asyncio.run(
            seed_new_tenant_minimum(tenant_id=args.tenant_id, company_code=args.company_code)
        )
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print("Minimum tenant seed finished.")
    for key, value in out.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
