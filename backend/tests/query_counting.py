"""Helpers for tests that count SQL statements (query-count / N+1 ceilings).

With RLS_SESSION_TENANT_ENABLED=true every transaction starts with one
``SELECT set_config('app.tenant_id', ...), set_config('app.rls_bypass', ...)`` and auth pins the
tenant with another (``app.common.rls``). That is a constant per-request cost, not an N+1, so
query counters skip it and the same ceilings hold with RLS on and off.
"""

from __future__ import annotations

_RLS_SETTINGS = ("set_config('app.tenant_id'", "set_config('app.rls_bypass'")


def is_rls_housekeeping(statement: str | None) -> bool:
    text = statement or ""
    return text.lstrip().upper().startswith("SELECT SET_CONFIG(") and any(s in text for s in _RLS_SETTINGS)
