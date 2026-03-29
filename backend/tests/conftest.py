"""Shared pytest fixtures. DB integration tests need DATABASE_URL (e.g. docker compose exec backend pytest)."""

from __future__ import annotations

import os

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


def _async_database_url() -> str | None:
    raw = (os.environ.get("DATABASE_URL") or "").strip()
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
