import os
import re

from sqlalchemy import event, text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase, Session
from sqlalchemy.sql.dml import Delete, Insert, Update
from sqlalchemy.sql.elements import TextClause
from app.config import get_settings

# get_db() skips commit on read-only requests. After flush(), new/dirty/deleted are
# cleared even though the transaction still holds uncommitted writes — track those paths.
_P7_NEEDS_COMMIT = "_p7_needs_commit"
_P7_TEXT_WRITE_RE = re.compile(r"(INSERT|UPDATE|DELETE|MERGE|REPLACE)\b", re.IGNORECASE)


def _p7_is_sql_word_char(char: str) -> bool:
    return char.isalnum() or char == "_"


def _p7_skip_sql_string(sql: str, start: int, quote: str) -> int:
    pos = start + 1
    while pos < len(sql):
        if sql[pos] == quote:
            if pos + 1 < len(sql) and sql[pos + 1] == quote:
                pos += 2
                continue
            return pos + 1
        pos += 1
    return len(sql)


def _p7_skip_sql_leading_noise(sql: str, start: int = 0) -> int:
    pos = start
    while pos < len(sql):
        while pos < len(sql) and sql[pos].isspace():
            pos += 1
        if sql.startswith("--", pos):
            newline = sql.find("\n", pos + 2)
            pos = len(sql) if newline == -1 else newline + 1
            continue
        if sql.startswith("/*", pos):
            comment_end = sql.find("*/", pos + 2)
            pos = len(sql) if comment_end == -1 else comment_end + 2
            continue
        break
    return pos


def _p7_read_sql_keyword(sql: str, start: int = 0) -> tuple[str | None, int]:
    pos = _p7_skip_sql_leading_noise(sql, start)
    match = re.match(r"[A-Za-z_][A-Za-z0-9_]*", sql[pos:])
    if not match:
        return None, pos
    return match.group(0).upper(), pos + match.end()


def _p7_find_top_level_keyword(sql: str, keyword: str, start: int = 0) -> int | None:
    pos = start
    upper_keyword = keyword.upper()
    keyword_len = len(upper_keyword)
    while pos < len(sql):
        pos = _p7_skip_sql_leading_noise(sql, pos)
        if pos >= len(sql):
            return None
        char = sql[pos]
        if char in {"'", '"'}:
            pos = _p7_skip_sql_string(sql, pos, char)
            continue
        if char == "(":
            pos = _p7_scan_sql_group(sql, pos)
            continue
        if sql[pos : pos + keyword_len].upper() == upper_keyword:
            before_ok = pos == 0 or not _p7_is_sql_word_char(sql[pos - 1])
            after_pos = pos + keyword_len
            after_ok = after_pos >= len(sql) or not _p7_is_sql_word_char(sql[after_pos])
            if before_ok and after_ok:
                return pos
        pos += 1
    return None


def _p7_scan_sql_group(sql: str, start: int) -> int:
    """Return the index after a balanced (...) group, honoring strings/comments."""
    pos = start
    depth = 0
    while pos < len(sql):
        pos = _p7_skip_sql_leading_noise(sql, pos)
        if pos >= len(sql):
            return len(sql)
        char = sql[pos]
        if char in {"'", '"'}:
            pos = _p7_skip_sql_string(sql, pos, char)
            continue
        if char == "(":
            depth += 1
            pos += 1
            continue
        if char == ")":
            depth -= 1
            pos += 1
            if depth == 0:
                return pos
            continue
        pos += 1
    return len(sql)


def _p7_cte_statement_needs_commit(sql: str) -> bool:
    keyword, pos = _p7_read_sql_keyword(sql)
    if keyword != "WITH":
        return False

    keyword, pos = _p7_read_sql_keyword(sql, pos)
    if keyword == "RECURSIVE":
        _, pos = _p7_read_sql_keyword(sql, pos)

    while pos < len(sql):
        as_pos = _p7_find_top_level_keyword(sql, "AS", pos)
        if as_pos is None:
            return False
        pos = _p7_skip_sql_leading_noise(sql, as_pos + 2)
        if pos >= len(sql) or sql[pos] != "(":
            return False
        pos = _p7_scan_sql_group(sql, pos)
        pos = _p7_skip_sql_leading_noise(sql, pos)
        if pos < len(sql) and sql[pos] == ",":
            pos += 1
            continue
        break

    keyword, _ = _p7_read_sql_keyword(sql, pos)
    return bool(keyword and _P7_TEXT_WRITE_RE.fullmatch(keyword))


def _p7_statement_needs_commit(statement: object) -> bool:
    if isinstance(statement, (Insert, Update, Delete)):
        return True
    if isinstance(statement, TextClause):
        sql = statement.text or ""
        pos = _p7_skip_sql_leading_noise(sql)
        first_keyword, _ = _p7_read_sql_keyword(sql, pos)
        if first_keyword and _P7_TEXT_WRITE_RE.fullmatch(first_keyword):
            return True
        return _p7_cte_statement_needs_commit(sql)
    return False


@event.listens_for(Session, "after_flush")
def _p7_after_flush(session: Session, _flush_context) -> None:
    session.info[_P7_NEEDS_COMMIT] = True


@event.listens_for(Session, "do_orm_execute")
def _p7_do_orm_execute(orm_execute_state) -> None:
    if (
        orm_execute_state.is_insert
        or orm_execute_state.is_update
        or orm_execute_state.is_delete
        or _p7_statement_needs_commit(orm_execute_state.statement)
    ):
        orm_execute_state.session.info[_P7_NEEDS_COMMIT] = True

settings = get_settings()
# SQLAlchemy async needs postgresql+asyncpg
_effective_db_url = settings.database_url_pgbouncer if settings.use_pgbouncer else settings.database_url
db_url = _effective_db_url.replace("postgresql://", "postgresql+asyncpg://", 1)

_connect_args: dict = {}
if settings.use_pgbouncer:
    # Required for PgBouncer transaction pooling with asyncpg prepared statements.
    _connect_args["statement_cache_size"] = 0

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
    connect_args=_connect_args,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


async def safe_async_session_rollback(session: AsyncSession) -> None:
    """End a failed PostgreSQL transaction so the same session can run more queries.

    After any caught DB error, Postgres leaves the connection in "aborted transaction" until
    ROLLBACK. Broad ``except Exception`` handlers must call this before returning or the next
    ``execute()`` will raise InFailedSQLTransactionError and look like unrelated slow/failed reads.
    """
    try:
        await session.rollback()
    except Exception:
        pass


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """Yield a DB session; commit only when the handler made changes.

    Skipping commit on read-only requests avoids an extra round-trip per GET.
    """
    async with AsyncSessionLocal() as session:
        try:
            _perf = get_settings()
            _stmt_ms = int(getattr(_perf, "perf_session_statement_timeout_ms", 0) or 0)
            if _stmt_ms > 0:
                await session.execute(text(f"SET LOCAL statement_timeout = {_stmt_ms}"))
            _lock_ms = int(getattr(_perf, "perf_session_lock_timeout_ms", 0) or 0)
            if _lock_ms > 0:
                await session.execute(text(f"SET LOCAL lock_timeout = {_lock_ms}"))
            yield session
            if (
                session.new
                or session.dirty
                or session.deleted
                or session.info.get(_P7_NEEDS_COMMIT)
            ):
                await session.commit()
            else:
                await session.rollback()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()
