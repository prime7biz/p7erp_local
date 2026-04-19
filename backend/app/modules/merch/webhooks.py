"""
Merchandising integration hooks (Phase 8).

Register callables to be invoked when key merch events occur. Routers call
`dispatch_merch_event` after successful commits; handlers must be best-effort
and must not raise (exceptions are logged and swallowed).
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

log = logging.getLogger(__name__)

_merch_event_handlers: list[Callable[..., Any]] = []


def register_merch_event_handler(handler: Callable[..., Any]) -> None:
    """Append a handler for event dispatch (e.g. order BOM frozen)."""
    _merch_event_handlers.append(handler)


def merch_event_handlers() -> tuple[Callable[..., Any], ...]:
    """Return registered handlers (immutable view)."""
    return tuple(_merch_event_handlers)


def dispatch_merch_event(event: str, payload: dict[str, Any]) -> None:
    """Invoke registered handlers; failures are logged only."""
    for h in _merch_event_handlers:
        try:
            h(event, payload)
        except Exception:
            log.exception("merch event handler failed event=%s", event)
