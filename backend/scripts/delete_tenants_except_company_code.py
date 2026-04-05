"""
Delete all tenants except one identified by company_code (case-insensitive), including cascaded data.

Resolves circular FK: tenants.default_*_warehouse_id -> warehouses before DELETE.

DANGEROUS. Run only in dev/UAT when you mean it.

  docker compose exec backend python scripts/delete_tenants_except_company_code.py \\
    --keep LAKH806201 --yes
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import delete, func, select, update

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal  # noqa: E402
from app.models.commercial import ProformaInvoice  # noqa: E402
from app.models.tenant import Tenant  # noqa: E402


async def main_async(keep_code: str, yes: bool) -> None:
    keep_norm = keep_code.strip().upper()
    if not keep_norm:
        raise SystemExit("Empty --keep company code")

    async with AsyncSessionLocal() as db:
        r = await db.execute(
            select(Tenant).where(func.upper(Tenant.company_code) == keep_norm)
        )
        keep_rows = list(r.scalars().all())
        if len(keep_rows) != 1:
            raise SystemExit(
                f"Expected exactly one tenant with company_code matching {keep_norm!r}; "
                f"found {len(keep_rows)}."
            )
        keep = keep_rows[0]

        r2 = await db.execute(
            select(Tenant).where(Tenant.id != keep.id)
        )
        to_delete = list(r2.scalars().all())

        if not to_delete:
            print(f"Only tenant {keep_norm} (id={keep.id}) exists. Nothing to delete.")
            return

        print("Will DELETE these tenants and all cascaded data:")
        for t in to_delete:
            cc = (t.company_code or "").strip() or "(no code)"
            print(f"  id={t.id}  company_code={cc!r}  name={t.name!r}")

        print(f"\nKEEP: id={keep.id}  company_code={keep.company_code!r}  name={keep.name!r}")

        if not yes:
            print("\nRefusing without --yes (add --yes to confirm).")
            raise SystemExit(1)

        ids = [t.id for t in to_delete]

        await db.execute(
            update(Tenant)
            .where(Tenant.id.in_(ids))
            .values(default_rm_warehouse_id=None, default_fg_warehouse_id=None)
        )
        await db.flush()

        # proforma_invoice_orders.order_id -> orders.id is RESTRICT; remove PIs first so
        # cascade can delete orders when the tenant row is deleted.
        await db.execute(delete(ProformaInvoice).where(ProformaInvoice.tenant_id.in_(ids)))
        await db.flush()

        await db.execute(delete(Tenant).where(Tenant.id.in_(ids)))
        await db.commit()

        print(f"\nDeleted {len(ids)} tenant(s). Kept {keep_norm} (id={keep.id}).")


def main() -> None:
    p = argparse.ArgumentParser(description="Delete all tenants except --keep company_code.")
    p.add_argument(
        "--keep",
        required=True,
        help="Company code of the tenant to preserve (e.g. LAKH806201)",
    )
    p.add_argument(
        "--yes",
        action="store_true",
        help="Confirm destructive delete",
    )
    args = p.parse_args()
    asyncio.run(main_async(args.keep, args.yes))


if __name__ == "__main__":
    main()
