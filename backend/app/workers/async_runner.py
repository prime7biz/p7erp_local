"""Run async job code from a (synchronous) Celery task."""

from __future__ import annotations

import asyncio
from collections.abc import Coroutine
from typing import Any, TypeVar

T = TypeVar("T")


def run_async(coro: Coroutine[Any, Any, T]) -> T:
    """Run ``coro`` in a fresh event loop, then close pooled DB connections before the loop ends.

    Each ``asyncio.run`` creates a new loop, but asyncpg connections stay bound to the loop that
    opened them. Left in the shared pool, the next task in the same worker process fails with
    "attached to a different loop".
    """

    async def _main() -> T:
        from app.common.http_clients import close_shared_http_clients
        from app.database import engine

        try:
            return await coro
        finally:
            await close_shared_http_clients()
            await engine.dispose()

    return asyncio.run(_main())
