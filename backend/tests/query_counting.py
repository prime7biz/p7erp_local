"""Helpers for tests that count SQL statements (query-count / N+1 ceilings).

With RLS_SESSION_TENANT_ENABLED=true every transaction starts with one
``SELECT set_config('app.tenant_id', ...), set_config('app.rls_bypass', ...)`` and auth pins the
tenant with another (``app.common.rls``). That is a constant per-request cost, not an N+1, so
query counters skip it and the same ceilings hold with RLS on and off.

The shared ``db_session_integration`` fixture runs app commits/rollbacks as savepoints
(``SAVEPOINT`` / ``RELEASE SAVEPOINT`` / ``ROLLBACK TO SAVEPOINT``), so counters skip savepoint
statements. Note: app code also uses savepoints (``begin_nested``) for optional steps; those are not
counted either, so a ceiling here does not catch a savepoint opened per row.
"""

from __future__ import annotations

_RLS_SETTINGS = ("set_config('app.tenant_id'", "set_config('app.rls_bypass'")
_SAVEPOINT_PREFIXES = ("SAVEPOINT ", "RELEASE SAVEPOINT ", "ROLLBACK TO SAVEPOINT ")


def is_rls_housekeeping(statement: str | None) -> bool:
    text = (statement or "").lstrip()
    upper = text.upper()
    if upper.startswith(_SAVEPOINT_PREFIXES):
        return True
    return upper.startswith("SELECT SET_CONFIG(") and any(s in text for s in _RLS_SETTINGS)
