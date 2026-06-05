"""Postgres advisory locks so background jobs run once across uvicorn workers."""

from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Stable lock ids for scheduled background tasks (session-level advisory locks).
LOCK_MERCH_ALERT_SCAN = 771001
LOCK_TRADE_ALERT_SCAN = 771002
LOCK_WEEKLY_AI_REPORTS = 771003
LOCK_PLATFORM_MAINTENANCE = 771004


async def try_acquire_background_lock(db: AsyncSession, lock_id: int) -> bool:
    result = await db.execute(text("SELECT pg_try_advisory_lock(:lock_id)"), {"lock_id": lock_id})
    return bool(result.scalar())


async def release_background_lock(db: AsyncSession, lock_id: int) -> None:
    await db.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": lock_id})
