"""
Merchandising integration hooks (advanced / future).

Register callables to be invoked when key merch events occur. The core router
does not dispatch yet; this module documents the extension point for Phase 8.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

_merch_event_handlers: list[Callable[..., Any]] = []


def register_merch_event_handler(handler: Callable[..., Any]) -> None:
    """Append a handler for future event dispatch (e.g. order status, BOM approved)."""
    _merch_event_handlers.append(handler)


def merch_event_handlers() -> tuple[Callable[..., Any], ...]:
    """Return registered handlers (immutable view)."""
    return tuple(_merch_event_handlers)
