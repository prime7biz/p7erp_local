"""
Bulk provision platform tenants from a CSV file.

CSV columns: name,tenant_type
Example:
  name,tenant_type
  Lakhsma Knit Ltd,manufacturer
  Metro Buying House,buying_house

Run:
  docker compose exec backend python scripts/bulk_provision_tenants.py --csv /app/scripts/bulk_tenants_sample.csv --plan-id 1
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from pathlib import Path

from sqlalchemy import select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402
from app.models import PlatformPlan, Tenant  # noqa: E402
from app.modules.admin.tenant_provisioning import provision_tenant_row  # noqa: E402
from app.models.tenant import TenantType  # noqa: E402


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", required=True, help="Path to CSV with name,tenant_type columns")
    parser.add_argument("--plan-id", type=int, default=None)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    path = Path(args.csv)
    if not path.exists():
        raise SystemExit(f"CSV not found: {path}")

    rows: list[dict[str, str]] = []
    with path.open(newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append({k.strip().lower(): (v or "").strip() for k, v in row.items() if k})

    if not rows:
        raise SystemExit("No rows in CSV")

    async with AsyncSessionLocal() as db:
        if args.plan_id:
            plan = await db.get(PlatformPlan, args.plan_id)
            if not plan:
                raise SystemExit(f"Plan id {args.plan_id} not found")

        created = []
        for row in rows:
            name = row.get("name", "")
            tt_raw = (row.get("tenant_type") or "manufacturer").lower()
            if not name:
                continue
            try:
                tt = TenantType(tt_raw)
            except ValueError:
                tt = TenantType.manufacturer
            if args.dry_run:
                created.append({"name": name, "tenant_type": tt.value, "dry_run": True})
                continue
            tenant = await provision_tenant_row(
                db,
                name=name,
                tenant_type=tt,
                domain=None,
                plan_id=args.plan_id,
            )
            created.append({"id": tenant.id, "company_code": tenant.company_code, "name": tenant.name})
        if not args.dry_run:
            await db.commit()

    print(f"Processed {len(created)} tenant(s)")
    for item in created[:20]:
        print(item)
    if len(created) > 20:
        print(f"... and {len(created) - 20} more")


if __name__ == "__main__":
    asyncio.run(main())
