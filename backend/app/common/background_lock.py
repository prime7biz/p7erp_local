"""Postgres advisory locks so background jobs run once across uvicorn workers."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Stable lock ids for scheduled background tasks.
LOCK_MERCH_ALERT_SCAN = 771001
LOCK_TRADE_ALERT_SCAN = 771002
LOCK_WEEKLY_AI_REPORTS = 771003
LOCK_PLATFORM_MAINTENANCE = 771004
LOCK_SYSTEM_COA_SEED = 771005


@asynccontextmanager
async def background_job_lock(lock_id: int) -> AsyncIterator[bool]:
    """Hold a transaction-scoped advisory lock on a dedicated connection for the job's duration.

    Yields True if this process won the lock. The job must use its own session for work:
    the lock connection stays inside one open transaction (so PgBouncer cannot reassign
    it) and the lock is released automatically when that transaction ends, even on crash.
    """
    from app.database import engine

    async with engine.connect() as conn:
        got = bool(
            (await conn.execute(text("SELECT pg_try_advisory_xact_lock(:lock_id)"), {"lock_id": lock_id})).scalar()
        )
        try:
            yield got
        finally:
            await conn.rollback()


async def try_acquire_background_lock(db: AsyncSession, lock_id: int) -> bool:
    """Deprecated: session-level lock can leak when the pooled connection changes between
    commits. Use ``background_job_lock`` instead."""
    result = await db.execute(text("SELECT pg_try_advisory_lock(:lock_id)"), {"lock_id": lock_id})
    return bool(result.scalar())


async def release_background_lock(db: AsyncSession, lock_id: int) -> None:
    await db.execute(text("SELECT pg_advisory_unlock(:lock_id)"), {"lock_id": lock_id})
