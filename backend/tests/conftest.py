"""Shared pytest fixtures. DB integration tests need DATABASE_URL (e.g. docker compose exec backend pytest)."""

from __future__ import annotations

import os

# The whole suite runs from one client address; the per-IP limit for anonymous API calls
# would otherwise trip on login-heavy tests. tests/test_security_round2_auth.py covers it.
os.environ.setdefault("ANON_RATE_LIMIT_REQUESTS_PER_MINUTE", "0")

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _rls_app_role_mode() -> bool:
    """RLS test mode: the app (and this fixture) connect as the non-owner role, as in production."""
    flag = (os.environ.get("RLS_SESSION_TENANT_ENABLED") or "").strip().lower() in {"1", "true", "yes", "on"}
    return flag and bool((os.environ.get("DATABASE_URL_APP") or "").strip())


def _async_database_url() -> str | None:
    raw = (os.environ.get("DATABASE_URL_APP") if _rls_app_role_mode() else os.environ.get("DATABASE_URL")) or ""
    raw = raw.strip()
    if not raw:
        return None
    if raw.startswith("postgresql://"):
        return raw.replace("postgresql://", "postgresql+asyncpg://", 1)
    return raw


@pytest.fixture(scope="session", autouse=True)
def _rls_pin_stubbed_auth():
    """RLS test mode only: tests that stub ``get_current_user`` (or the external principal) still
    pin the request session to that user's tenant, as the real dependency does."""
    if not _rls_app_role_mode():
        yield
        return
    import inspect

    from fastapi import Depends

    from app.common.auth import get_current_user
    from app.common.rls import bind_session_tenant
    from app.database import get_db, rls_request_scope
    from app.external_access.tokens import get_current_external_principal
    from app.main import app

    targets = {get_current_user, get_current_external_principal}

    def pin(stub):
        if getattr(stub, "_p7_rls_pinned", False) or inspect.signature(stub).parameters:
            return stub

        async def pinned(db=Depends(get_db), _scope=Depends(rls_request_scope)):
            value = stub()
            if inspect.isawaitable(value):
                value = await value
            await bind_session_tenant(db, getattr(value, "tenant_id", None))
            return value

        pinned._p7_rls_pinned = True
        return pinned

    class _PinningOverrides(dict):
        def __setitem__(self, key, value):
            super().__setitem__(key, pin(value) if key in targets else value)

        def update(self, *args, **kwargs):
            for key, value in dict(*args, **kwargs).items():
                self[key] = value

    original = app.dependency_overrides
    app.dependency_overrides = _PinningOverrides(original)
    try:
        yield
    finally:
        app.dependency_overrides = original


@pytest_asyncio.fixture
async def db_session_integration() -> AsyncSession:
    url = _async_database_url()
    if not url:
        pytest.skip("DATABASE_URL not set — run pytest inside the backend container with compose.")

    engine = create_async_engine(url, echo=False)
    async with engine.connect() as conn:
        trans = await conn.begin()
        session_factory = async_sessionmaker(
            bind=conn,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
            autocommit=False,
        )
        async with session_factory() as session:
            try:
                yield session
            finally:
                await session.close()
        await trans.rollback()
    await engine.dispose()
