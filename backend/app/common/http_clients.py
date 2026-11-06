"""Shared httpx clients so repeated AI provider calls reuse open connections.

Usage:
    client = get_shared_async_client("openrouter", timeout=60.0)
    resp = await client.post(url, json=body)

Do not use ``async with`` on the returned client: it is shared and must stay open.
Call ``close_shared_http_clients()`` once on app shutdown.
"""

from __future__ import annotations

import asyncio
import logging

import httpx

logger = logging.getLogger(__name__)

# (name, timeout) -> (client, event loop the client was created on)
_clients: dict[tuple[str, float], tuple[httpx.AsyncClient, asyncio.AbstractEventLoop]] = {}


def get_shared_async_client(name: str, *, timeout: float) -> httpx.AsyncClient:
    """Return a long-lived client for ``name`` (e.g. "openrouter") with the given default timeout.

    An httpx client only works on the event loop that created it. Celery jobs run every task in a
    fresh loop (see ``app.workers.async_runner.run_async``), so a new client is created whenever
    the running loop changes.
    """
    loop = asyncio.get_running_loop()
    key = (name, float(timeout))
    entry = _clients.get(key)
    if entry is not None:
        client, client_loop = entry
        if client_loop is loop and not client.is_closed:
            return client
    client = httpx.AsyncClient(timeout=timeout)
    _clients[key] = (client, loop)
    return client


async def close_shared_http_clients() -> None:
    """Close every shared client created on the current event loop and forget all of them."""
    loop = asyncio.get_running_loop()
    entries = list(_clients.values())
    _clients.clear()
    for client, client_loop in entries:
        # Clients from an older (already closed) loop cannot be closed from this loop.
        if client_loop is not loop or client.is_closed:
            continue
        try:
            await client.aclose()
        except Exception as exc:
            logger.warning("shared_http_client_close_failed: %s", type(exc).__name__)
