#!/usr/bin/env python3
"""Delete expired customer AI suggestion/trace batches (CASCADE removes items).

Run inside the backend container (Docker-first project):

    docker compose exec backend python scripts/cleanup_customer_ai_suggestion_batches.py
    docker compose exec backend python scripts/cleanup_customer_ai_suggestion_batches.py --dry-run

Retention window is set when each batch is created (default 90 days, config
CUSTOMER_AI_BATCH_RETENTION_DAYS). This job only removes rows whose expires_at
is in the past.

What is deleted: rows in customer_ai_suggestion_batches (and child
customer_ai_suggestion_items). ai_audit_log rows are NOT deleted — historical
audit lines remain for compliance.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

# Ensure /app (backend root) is on path when run as `python scripts/...`
_BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if _BACKEND_ROOT not in sys.path:
    sys.path.insert(0, _BACKEND_ROOT)


async def _main() -> int:
    parser = argparse.ArgumentParser(description="Cleanup expired customer AI batches.")
    parser.add_argument("--dry-run", action="store_true", help="Count rows only; do not delete.")
    args = parser.parse_args()

    from sqlalchemy.ext.asyncio import AsyncSession

    from app.database import AsyncSessionLocal
    from app.modules.customers.customer_ai_batches import cleanup_expired_customer_ai_batches

    async with AsyncSessionLocal() as db:  # type: AsyncSession
        stats = await cleanup_expired_customer_ai_batches(db, dry_run=args.dry_run)
        if args.dry_run:
            print(f"Would delete {stats['would_delete']} batch row(s).")
        else:
            await db.commit()
            print(f"Deleted {stats['deleted']} expired batch row(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
