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
