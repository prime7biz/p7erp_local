"""Retention for ``alert_scan_log`` (one row per alert rule per scan; ~100/day/tenant).

Called from platform maintenance (hourly). Deletes in small committed batches so the table
is never locked for long and WAL stays small. The "last scan" timestamp shown in the UI only
needs recent completed rows, which the retention window keeps.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

logger = logging.getLogger(__name__)

# Upper bound per maintenance run so one run cannot hold the job lock for a long time.
MAX_BATCHES_PER_RUN = 100

_DELETE_BATCH_SQL = text(
    """
    DELETE FROM alert_scan_log
    WHERE id IN (
        SELECT id FROM alert_scan_log
        WHERE started_at < :cutoff
        LIMIT :batch_size
    )
    """
)


async def purge_old_alert_scan_logs(
    db: AsyncSession,
    *,
    retention_days: int | None = None,
    batch_size: int | None = None,
    now: datetime | None = None,
) -> int:
    """Delete rows older than the retention window. Commits after each batch. Returns rows deleted."""
    settings = get_settings()
    days = settings.alert_scan_log_retention_days if retention_days is None else retention_days
    size = settings.alert_scan_log_purge_batch_size if batch_size is None else batch_size
    if days <= 0 or size <= 0:
        return 0
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=days)
    total = 0
    for _ in range(MAX_BATCHES_PER_RUN):
        result = await db.execute(_DELETE_BATCH_SQL, {"cutoff": cutoff, "batch_size": size})
        await db.commit()
        deleted = int(result.rowcount or 0)
        total += deleted
        if deleted < size:
            break
    if total:
        logger.info("alert_scan_log retention: deleted %s rows older than %s days", total, days)
    return total
