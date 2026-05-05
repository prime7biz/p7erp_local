"""
Seed default role permissions for existing tenants before RBAC enforcement.

Purpose:
- Prevent non-admin lockouts when `rbac_enforcement` is switched to "enforce".
- Only fills EMPTY role permissions; existing role permissions remain untouched.

Run (all active tenants):
  docker compose exec backend python scripts/seed_default_role_permissions.py

Run (single tenant):
  docker compose exec backend python scripts/seed_default_role_permissions.py --company-code LAKH806201
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402
from app.models import Role, Tenant  # noqa: E402


def _default_permissions_for_role_name(role_name: str) -> dict[str, bool]:
    rn = (role_name or "").strip().lower()
    if rn == "manager":
        return {
            "merch.access": True,
            "inventory.access": True,
            "production.access": True,
            "finance.access": True,
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
            "facility.access": True,
            "hr.access": True,
            "reports.access": True,
            "ai.access": True,
            "business_overview.access": True,
        }
    # Conservative fallback for custom roles: broad read-access style module keys.
    return {
        "merch.access": True,
        "inventory.access": True,
        "production.access": True,
        "finance.access": True,
        "facility.access": True,
        "hr.access": True,
        "reports.access": True,
        "ai.access": True,
        "business_overview.access": True,
    }


async def seed_default_role_permissions(company_code: str | None = None) -> dict[str, int]:
    async with AsyncSessionLocal() as db:
        tenant_query = select(Tenant).where(Tenant.is_active.is_(True), Tenant.deleted_at.is_(None))
        if company_code:
            tenant_query = tenant_query.where(Tenant.company_code == company_code.strip().upper())
        tenants = list((await db.execute(tenant_query.order_by(Tenant.id.asc()))).scalars().all())
        if not tenants:
            raise ValueError("No matching active tenant found")

        updated_roles = 0
        skipped_non_empty = 0
        skipped_admin = 0

        for tenant in tenants:
            roles = list(
                (
                    await db.execute(
                        select(Role).where(Role.tenant_id == tenant.id).order_by(Role.id.asc())
                    )
                ).scalars().all()
            )
            for role in roles:
                if (role.name or "").strip().lower() == "admin":
                    skipped_admin += 1
                    continue
                existing = role.permissions if isinstance(role.permissions, dict) else {}
                if existing:
                    skipped_non_empty += 1
                    continue
                role.permissions = _default_permissions_for_role_name(role.name or "")
                updated_roles += 1

        await db.commit()
        return {
            "tenants_scanned": len(tenants),
            "roles_updated": updated_roles,
            "roles_skipped_non_empty": skipped_non_empty,
            "roles_skipped_admin": skipped_admin,
        }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Seed default permissions for empty non-admin roles (safe/idempotent)."
    )
    parser.add_argument(
        "--company-code",
        default=None,
        help="Optional tenant company_code (default: all active tenants).",
    )
    args = parser.parse_args()

    try:
        out = asyncio.run(seed_default_role_permissions(args.company_code))
    except ValueError as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc

    print("Default role permission seeding finished.")
    for key, value in out.items():
        print(f"  {key}: {value}")


if __name__ == "__main__":
    main()
