"""PostgreSQL Row-Level Security (RLS) session context — finding SEC-04.

What this does (plain words)
----------------------------
Migration 270 puts a policy on every table that has a ``tenant_id`` column. The policy lets a
query see / write a row only when one of these is true for the current transaction:

* ``app.tenant_id`` equals the row's ``tenant_id`` (normal tenant request), or
* ``app.rls_bypass`` is ``'on'`` (login before the tenant is known, platform admin,
  background jobs that loop over tenants, seeds, startup tasks).

This module sets those two values. It is OFF unless ``RLS_SESSION_TENANT_ENABLED=true``.

* Every new transaction starts in **bypass** (``app.rls_bypass='on'``). That keeps login,
  public pages and platform code working exactly like today.
* As soon as the request is authenticated (``get_current_user``, external portal token,
  MCP tools) or a per-tenant job starts a tenant, :func:`bind_session_tenant` pins the
  session to that tenant: ``app.tenant_id=<id>`` and ``app.rls_bypass='off'``.
* The values are set with ``set_config(..., true)`` — the same as ``SET LOCAL`` — so they end
  with the transaction. That is safe with PgBouncer in transaction mode. The ``after_begin``
  listener (registered in ``app.database``) re-applies the session's context at the start of
  every new transaction, so ``commit()`` in the middle of a request keeps the tenant.

Postgres only *enforces* the policies when the app connects as a role that does not own the
tables and is not a superuser (``p7erp_app``, see ``scripts/create_rls_app_role.sql``).
Connected as the owner (today's setup) the policies are skipped and this code changes nothing.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import text

from app.config import get_settings

RLS_TENANT_SETTING = "app.tenant_id"
RLS_BYPASS_SETTING = "app.rls_bypass"

# session.info keys. Value of _RLS_CONTEXT: an int tenant id, or missing (= bypass).
_RLS_CONTEXT = "_p7_rls_tenant_id"
# Set by app.database.get_db: that session is closed right after the request, so the
# end-of-request reset does not need a DB round-trip.
RLS_REQUEST_OWNED_SESSION = "_p7_rls_request_owned"

_SET_CONTEXT_SQL = text(
    "SELECT set_config('app.tenant_id', :tenant_id, true), set_config('app.rls_bypass', :bypass, true)"
)


def rls_session_enabled() -> bool:
    return bool(getattr(get_settings(), "rls_session_tenant_enabled", False))


def _context_params(tenant_id: int | None) -> dict[str, str]:
    if tenant_id is None:
        return {"tenant_id": "", "bypass": "on"}
    return {"tenant_id": str(int(tenant_id)), "bypass": "off"}


def apply_rls_on_begin(session: Any, _transaction: Any, connection: Any) -> None:
    """SQLAlchemy ``after_begin`` listener: send this session's tenant context to Postgres."""
    if not rls_session_enabled():
        return
    connection.execute(_SET_CONTEXT_SQL, _context_params(session.info.get(_RLS_CONTEXT)))


def session_rls_tenant_id(db: Any) -> int | None:
    """Tenant the session is pinned to, or None when it runs in bypass (or RLS is off)."""
    return db.info.get(_RLS_CONTEXT)


async def _push_context(db: Any) -> None:
    if db.in_transaction():
        conn = await db.connection()
        await conn.execute(_SET_CONTEXT_SQL, _context_params(db.info.get(_RLS_CONTEXT)))


async def bind_session_tenant(db: Any, tenant_id: int | None) -> None:
    """Pin ``db`` to one tenant for the rest of its life (now and in later transactions).

    No-op when RLS is off. ``tenant_id=None`` is ignored (keeps the current context).
    """
    if tenant_id is None or not rls_session_enabled():
        return
    db.info[_RLS_CONTEXT] = int(tenant_id)
    await _push_context(db)


async def bind_session_bypass(db: Any) -> None:
    """Run ``db`` in bypass mode (platform admin, cross-tenant jobs). No-op when RLS is off."""
    if not rls_session_enabled():
        return
    db.info.pop(_RLS_CONTEXT, None)
    await _push_context(db)


async def reset_session_context(db: Any) -> None:
    """End-of-request cleanup: drop the tenant pin so a longer-lived session is not left scoped."""
    if not rls_session_enabled() or _RLS_CONTEXT not in db.info:
        return
    db.info.pop(_RLS_CONTEXT, None)
    if db.info.get(RLS_REQUEST_OWNED_SESSION):
        return
    try:
        await _push_context(db)
    except Exception:
        # Transaction already aborted: Postgres drops the local settings with the rollback.
        pass
