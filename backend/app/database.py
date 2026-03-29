import os

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()
# SQLAlchemy async needs postgresql+asyncpg
db_url = settings.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)

_pool_size = int(os.environ.get("DB_POOL_SIZE", "20"))
_max_overflow = int(os.environ.get("DB_MAX_OVERFLOW", "30"))
_pool_timeout = int(os.environ.get("DB_POOL_TIMEOUT", "10"))
_pool_recycle = int(os.environ.get("DB_POOL_RECYCLE", "1800"))

engine = create_async_engine(
    db_url,
    echo=False,
    pool_pre_ping=True,
    pool_size=_pool_size,
    max_overflow=_max_overflow,
    pool_timeout=_pool_timeout,
    pool_recycle=_pool_recycle,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Yield a DB session; commit only when the handler made changes.

    Skipping commit on read-only requests avoids an extra round-trip per GET.
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            if session.new or session.dirty or session.deleted:
                await session.commit()
            else:
                await session.rollback()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
