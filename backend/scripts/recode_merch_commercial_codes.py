"""
Renumber merchandising inquiry / quotation / order codes to match the live
code generator (same prefixes and width as the API routers).

Directory: backend/scripts/
Run inside the backend container (see README / AGENTS.md):

  docker compose exec backend python -m scripts.recode_merch_commercial_codes
  docker compose exec backend python -m scripts.recode_merch_commercial_codes --dry-run
  docker compose exec backend python -m scripts.recode_merch_commercial_codes --company-code LAKH806201

What it does (per tenant, rows ordered by primary key `id`):
  - inquiries.inquiry_code   -> INQ-0001, INQ-0002, ...
  - quotations.quotation_code -> QT-0001, ...
  - orders.order_code        -> ORD-0001, ...

Also updates:
  - tenant_code_counters (entity_key inquiries / quotations / orders) so the next
    API-generated code continues after the highest assigned sequence.
  - boms.order_code_snapshot / quotation_code_snapshot from linked order/quotation.
  - vouchers.reference when it exactly matched the old order_code (same tenant).
  - orders.commercial_snapshot_json["quotation_code"] when it matched the old code.

Uses a two-phase UPDATE on each table so unique (tenant_id, *_code) constraints are
never violated during the migration.
"""
from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models import Order, Tenant


TMP_PREFIX = "@RC@"


def _fmt(prefix: str, seq: int, width: int = 4) -> str:
    return f"{prefix}{seq:0{width}d}"


async def _tenant_ids(db: AsyncSession, tenant_id: int | None, company_code: str | None) -> list[int]:
    if tenant_id is not None:
        return [tenant_id]
    if company_code:
        tid = (
            await db.execute(select(Tenant.id).where(Tenant.company_code == company_code.strip().upper()))
        ).scalar_one_or_none()
        if tid is None:
            raise SystemExit(f"No tenant with company_code={company_code!r}")
        return [int(tid)]
    rows = (await db.execute(select(Tenant.id).order_by(Tenant.id))).scalars().all()
    return [int(r) for r in rows]


async def _recode_table(
    db: AsyncSession,
    *,
    tenant_id: int,
    table: str,
    code_column: str,
    prefix: str,
    dry_run: bool,
) -> tuple[list[tuple[str, str]], int]:
    """Return (list of (old_code, new_code), row_count) for logging."""
    q_old = text(
        f"SELECT id, {code_column} AS c FROM {table} WHERE tenant_id = :tid ORDER BY id"
    )
    rows = (await db.execute(q_old, {"tid": tenant_id})).mappings().all()
    if not rows:
        return [], 0
    mapping: list[tuple[int, str, str]] = []
    for i, row in enumerate(rows, start=1):
        rid = int(row["id"])
        old = str(row["c"])
        new = _fmt(prefix, i)
        mapping.append((rid, old, new))

    changes = [(old, new) for _rid, old, new in mapping if old != new]
    if dry_run or not changes:
        return changes, len(rows)

    # Phase 1: unique temporaries (id is unique globally; still unique per tenant)
    await db.execute(
        text(f"UPDATE {table} SET {code_column} = :p || id::text WHERE tenant_id = :tid"),
        {"p": TMP_PREFIX, "tid": tenant_id},
    )

    # Phase 2: assign final codes
    for rid, _old, new in mapping:
        await db.execute(
            text(f"UPDATE {table} SET {code_column} = :c WHERE id = :id AND tenant_id = :tid"),
            {"c": new, "id": rid, "tid": tenant_id},
        )

    return changes, len(rows)


async def _upsert_counter(db: AsyncSession, tenant_id: int, entity_key: str, last_value: int, dry_run: bool) -> None:
    if dry_run or last_value <= 0:
        return
    await db.execute(
        text(
            """
            INSERT INTO tenant_code_counters (tenant_id, entity_key, last_value)
            VALUES (:tid, :ek, :lv)
            ON CONFLICT (tenant_id, entity_key)
            DO UPDATE SET last_value = GREATEST(tenant_code_counters.last_value, EXCLUDED.last_value)
            """
        ),
        {"tid": tenant_id, "ek": entity_key, "lv": last_value},
    )


async def _sync_bom_snapshots(db: AsyncSession, tenant_id: int, dry_run: bool) -> int:
    if dry_run:
        return 0
    r1 = await db.execute(
        text(
            """
            UPDATE boms b
            SET order_code_snapshot = o.order_code,
                quotation_code_snapshot = COALESCE(
                    (
                        SELECT q.quotation_code
                        FROM quotations q
                        WHERE q.id = b.quotation_id AND q.tenant_id = b.tenant_id
                        LIMIT 1
                    ),
                    b.quotation_code_snapshot
                )
            FROM orders o
            WHERE b.tenant_id = :tid
              AND b.order_id IS NOT NULL
              AND b.order_id = o.id
              AND o.tenant_id = b.tenant_id
            """
        ),
        {"tid": tenant_id},
    )
    r2 = await db.execute(
        text(
            """
            UPDATE boms b
            SET quotation_code_snapshot = q.quotation_code
            FROM quotations q
            WHERE b.tenant_id = :tid
              AND b.quotation_id IS NOT NULL
              AND b.quotation_id = q.id
              AND q.tenant_id = b.tenant_id
            """
        ),
        {"tid": tenant_id},
    )
    return (r1.rowcount or 0) + (r2.rowcount or 0)


async def _patch_voucher_references(
    db: AsyncSession,
    tenant_id: int,
    order_replacements: list[tuple[str, str]],
    dry_run: bool,
) -> int:
    if dry_run or not order_replacements:
        return 0
    total = 0
    for old, new in order_replacements:
        if old == new:
            continue
        r = await db.execute(
            text(
                """
                UPDATE vouchers
                SET reference = :new
                WHERE tenant_id = :tid AND reference = :old
                """
            ),
            {"new": new, "tid": tenant_id, "old": old},
        )
        total += r.rowcount or 0
    return total


async def _patch_commercial_snapshots(
    db: AsyncSession,
    tenant_id: int,
    quotation_replacements: list[tuple[str, str]],
    dry_run: bool,
) -> int:
    if dry_run or not quotation_replacements:
        return 0
    qmap = {old: new for old, new in quotation_replacements if old != new}
    if not qmap:
        return 0
    rows = (
        await db.execute(select(Order).where(Order.tenant_id == tenant_id, Order.commercial_snapshot_json.isnot(None)))
    ).scalars().all()
    updated = 0
    for order_row in rows:
        snap = order_row.commercial_snapshot_json
        if not isinstance(snap, dict):
            continue
        qc = snap.get("quotation_code")
        if not isinstance(qc, str) or qc not in qmap:
            continue
        order_row.commercial_snapshot_json = {**snap, "quotation_code": qmap[qc]}
        updated += 1
    return updated


async def run_one_tenant(
    db: AsyncSession,
    *,
    tenant_id: int,
    dry_run: bool,
) -> None:
    inq_changes, inq_n = await _recode_table(
        db, tenant_id=tenant_id, table="inquiries", code_column="inquiry_code", prefix="INQ-", dry_run=dry_run
    )
    quo_changes, quo_n = await _recode_table(
        db, tenant_id=tenant_id, table="quotations", code_column="quotation_code", prefix="QT-", dry_run=dry_run
    )
    ord_changes, ord_n = await _recode_table(
        db, tenant_id=tenant_id, table="orders", code_column="order_code", prefix="ORD-", dry_run=dry_run
    )

    await _upsert_counter(db, tenant_id, "inquiries", inq_n, dry_run)
    await _upsert_counter(db, tenant_id, "quotations", quo_n, dry_run)
    await _upsert_counter(db, tenant_id, "orders", ord_n, dry_run)

    vouch_n = await _patch_voucher_references(db, tenant_id, ord_changes, dry_run)
    snap_n = await _patch_commercial_snapshots(db, tenant_id, quo_changes, dry_run)
    bom_n = await _sync_bom_snapshots(db, tenant_id, dry_run)

    print(
        f"tenant_id={tenant_id}: inquiries={inq_n} ({len(inq_changes)} code changes), "
        f"quotations={quo_n} ({len(quo_changes)}), orders={ord_n} ({len(ord_changes)}); "
        f"vouchers.reference patches={vouch_n}, commercial_snapshot_json={snap_n}, boms synced={bom_n}"
    )


async def _async_main(args: argparse.Namespace) -> None:
    async with AsyncSessionLocal() as db:
        tenants = await _tenant_ids(db, args.tenant_id, args.company_code)
        if args.dry_run:
            print("DRY RUN — no commits.")
        for tid in tenants:
            try:
                await run_one_tenant(db, tenant_id=tid, dry_run=bool(args.dry_run))
                if not args.dry_run:
                    await db.commit()
            except Exception:
                await db.rollback()
                raise


def main() -> None:
    p = argparse.ArgumentParser(description="Renumber INQ/QT/ORD codes to match next_tenant_code prefixes.")
    p.add_argument("--dry-run", action="store_true", help="Print counts only; do not modify the database.")
    p.add_argument("--tenant-id", type=int, default=None, help="Limit to a single tenant id.")
    p.add_argument("--company-code", type=str, default=None, help="Limit to tenant with this company code.")
    args = p.parse_args()
    if args.tenant_id is not None and args.company_code:
        p.error("Use only one of --tenant-id or --company-code")
    asyncio.run(_async_main(args))


if __name__ == "__main__":
    main()
