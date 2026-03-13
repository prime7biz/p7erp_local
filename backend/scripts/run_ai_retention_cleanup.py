"""
Run bounded cleanup for AI high-volume tables.

Examples:
  python scripts/run_ai_retention_cleanup.py --dry-run
  python scripts/run_ai_retention_cleanup.py --tenant-id 1 --retention-days 90 --batch-size 500 --max-delete 5000
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import delete, func, select

backend = Path(__file__).resolve().parent.parent
if str(backend) not in sys.path:
    sys.path.insert(0, str(backend))

from app.database import AsyncSessionLocal
from app.models.ai_tool import AiActionRun, AiAuditLog, AiAnomalyEvent, AiMessage, AiToolInvocation


TABLES = [
    ("ai_audit_logs", AiAuditLog, AiAuditLog.created_at),
    ("ai_messages", AiMessage, AiMessage.created_at),
    ("ai_tool_invocations", AiToolInvocation, AiToolInvocation.started_at),
    ("ai_action_runs", AiActionRun, AiActionRun.created_at),
    ("ai_anomaly_events", AiAnomalyEvent, AiAnomalyEvent.created_at),
]


async def _count_rows(db, model, date_col, tenant_id: int | None, cutoff: datetime) -> int:
    clauses = [date_col < cutoff]
    if tenant_id is not None:
        clauses.append(model.tenant_id == tenant_id)
    value = (await db.execute(select(func.count(model.id)).where(*clauses))).scalar_one()
    return int(value or 0)


async def _delete_rows(db, model, date_col, tenant_id: int | None, cutoff: datetime, limit: int) -> int:
    pk_query = select(model.id).where(date_col < cutoff).order_by(model.id.asc()).limit(limit)
    if tenant_id is not None:
        pk_query = pk_query.where(model.tenant_id == tenant_id)
    ids = [int(x) for x in (await db.execute(pk_query)).scalars().all()]
    if not ids:
        return 0
    await db.execute(delete(model).where(model.id.in_(ids)))
    return len(ids)


async def run_cleanup(
    *,
    tenant_id: int | None,
    retention_days: int,
    batch_size: int,
    max_delete: int,
    dry_run: bool,
) -> None:
    cutoff = datetime.utcnow() - timedelta(days=retention_days)
    deleted_total = 0
    print(f"Retention cutoff: {cutoff.isoformat()} (older than {retention_days} days)")
    if tenant_id is not None:
        print(f"Tenant scope: {tenant_id}")
    print(f"Mode: {'DRY RUN' if dry_run else 'DELETE'} | batch_size={batch_size} | max_delete={max_delete}")

    async with AsyncSessionLocal() as db:
        for table_name, model, date_col in TABLES:
            count = await _count_rows(db, model, date_col, tenant_id, cutoff)
            print(f"- {table_name}: candidates={count}")
            if dry_run or count == 0:
                continue

            deleted_for_table = 0
            while deleted_total < max_delete:
                budget_left = max_delete - deleted_total
                step = min(batch_size, budget_left)
                if step <= 0:
                    break
                deleted = await _delete_rows(db, model, date_col, tenant_id, cutoff, step)
                if deleted == 0:
                    break
                deleted_for_table += deleted
                deleted_total += deleted
                await db.commit()
                if deleted_total >= max_delete:
                    break
            print(f"  deleted={deleted_for_table}")
            if deleted_total >= max_delete:
                print("Max delete limit reached; stopping cleanup.")
                break

    print(f"Cleanup complete. total_deleted={deleted_total}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="AI retention cleanup")
    parser.add_argument("--tenant-id", type=int, default=None, help="Optional tenant scope")
    parser.add_argument("--retention-days", type=int, default=180, help="Delete rows older than this many days")
    parser.add_argument("--batch-size", type=int, default=500, help="Rows per delete batch")
    parser.add_argument("--max-delete", type=int, default=5000, help="Safety cap for total delete count")
    parser.add_argument("--dry-run", action="store_true", help="Only print candidate counts, do not delete")
    args = parser.parse_args()
    if args.retention_days < 1:
        raise SystemExit("--retention-days must be >= 1")
    if args.batch_size < 1:
        raise SystemExit("--batch-size must be >= 1")
    if args.max_delete < 1:
        raise SystemExit("--max-delete must be >= 1")
    return args


async def main() -> None:
    args = parse_args()
    await run_cleanup(
        tenant_id=args.tenant_id,
        retention_days=args.retention_days,
        batch_size=args.batch_size,
        max_delete=args.max_delete,
        dry_run=args.dry_run,
    )


if __name__ == "__main__":
    asyncio.run(main())
