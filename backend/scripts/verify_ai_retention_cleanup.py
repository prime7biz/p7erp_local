"""
Verify retention cleanup behavior and remaining counts.

Examples:
  python scripts/verify_ai_retention_cleanup.py
  python scripts/verify_ai_retention_cleanup.py --tenant-id 1 --retention-days 180
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from datetime import datetime, timedelta
from pathlib import Path

from sqlalchemy import func, select

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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Verify AI retention cleanup")
    parser.add_argument("--tenant-id", type=int, default=None, help="Optional tenant scope")
    parser.add_argument("--retention-days", type=int, default=180, help="Retention horizon to validate")
    return parser.parse_args()


async def _count(db, model, date_col, tenant_id: int | None, older_than: datetime) -> int:
    clauses = [date_col < older_than]
    if tenant_id is not None:
        clauses.append(model.tenant_id == tenant_id)
    value = (await db.execute(select(func.count(model.id)).where(*clauses))).scalar_one()
    return int(value or 0)


async def main() -> None:
    args = parse_args()
    cutoff = datetime.utcnow() - timedelta(days=max(1, args.retention_days))
    print(f"Verification cutoff: {cutoff.isoformat()} (older than {args.retention_days} days)")
    if args.tenant_id is not None:
        print(f"Tenant scope: {args.tenant_id}")
    print("Rows still older than cutoff:")

    async with AsyncSessionLocal() as db:
        for table_name, model, date_col in TABLES:
            count = await _count(db, model, date_col, args.tenant_id, cutoff)
            status = "PASS" if count == 0 else "WARN"
            print(f"- {table_name}: {status} | remaining_old_rows={count}")


if __name__ == "__main__":
    asyncio.run(main())
