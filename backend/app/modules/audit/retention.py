"""Purge old technical audit rows (API_REQUEST / API_ERROR only).

Business and security audit rows are never deleted here. Default dry-run logs
what would be deleted until ``AUDIT_API_PURGE_DRY_RUN=false``.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings

logger = logging.getLogger(__name__)

TECHNICAL_ACTIONS = ("API_REQUEST", "API_ERROR")
MAX_BATCHES_PER_TENANT = 50

_COUNT_SQL = text(
    """
    SELECT COUNT(*) FROM audit_logs
    WHERE tenant_id = :tenant_id
      AND action IN ('API_REQUEST', 'API_ERROR')
      AND created_at < :cutoff
    """
)

_SELECT_BATCH_SQL = text(
    """
    SELECT id FROM audit_logs
    WHERE tenant_id = :tenant_id
      AND action IN ('API_REQUEST', 'API_ERROR')
      AND created_at < :cutoff
    ORDER BY id
    LIMIT :batch_size
    FOR UPDATE SKIP LOCKED
    """
)

_DELETE_BATCH_SQL = text(
    """
    DELETE FROM audit_logs
    WHERE id = ANY(:ids)
      AND tenant_id = :tenant_id
      AND action IN ('API_REQUEST', 'API_ERROR')
      AND created_at < :cutoff
    """
)


def retention_cutoff(*, now: datetime | None = None, retention_days: int | None = None) -> datetime | None:
    settings = get_settings()
    days = settings.audit_api_retention_days if retention_days is None else retention_days
    if days <= 0:
        return None
    stamp = now or datetime.now(timezone.utc).replace(tzinfo=None)
    return stamp - timedelta(days=days)


async def purge_technical_audit_for_tenant(
    db: AsyncSession,
    *,
    tenant_id: int,
    cutoff: datetime,
    batch_size: int,
    dry_run: bool,
) -> dict[str, Any]:
    """Delete (or count) expired technical audit rows for one tenant. Commits each delete batch."""
    if dry_run:
        would_delete = int(
            (
                await db.execute(
                    _COUNT_SQL,
                    {"tenant_id": tenant_id, "cutoff": cutoff},
                )
            ).scalar_one()
            or 0
        )
        return {
            "tenant_id": tenant_id,
            "deleted": 0,
            "would_delete": would_delete,
            "dry_run": True,
        }

    deleted = 0
    for _ in range(MAX_BATCHES_PER_TENANT):
        rows = (
            await db.execute(
                _SELECT_BATCH_SQL,
                {
                    "tenant_id": tenant_id,
                    "cutoff": cutoff,
                    "batch_size": batch_size,
                },
            )
        ).scalars().all()
        ids = [int(i) for i in rows]
        if not ids:
            break
        result = await db.execute(
            _DELETE_BATCH_SQL,
            {
                "ids": ids,
                "tenant_id": tenant_id,
                "cutoff": cutoff,
            },
        )
        await db.commit()
        deleted += int(result.rowcount or 0)
        if len(ids) < batch_size:
            break
    return {
        "tenant_id": tenant_id,
        "deleted": deleted,
        "would_delete": 0,
        "dry_run": False,
    }
