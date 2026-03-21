"""Map database integrity errors to HTTP responses for tenant-scoped document codes."""

from __future__ import annotations

from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

DUPLICATE_DOCUMENT_CODE_DETAIL = "Duplicate document code"


def is_duplicate_document_code_violation(exc: IntegrityError) -> bool:
    """True for unique violations on uq_* constraints or duplicate-key errors (PostgreSQL/SQLite)."""
    parts: list[str] = [str(exc)]
    if exc.orig is not None:
        parts.append(str(exc.orig))
    text = " ".join(parts)
    tl = text.lower()
    orig = exc.orig
    if orig is not None:
        if getattr(orig, "pgcode", None) == "23505":
            return True
        if getattr(orig, "sqlstate", None) == "23505":
            return True
    if "uq_" in text:
        return True
    if "duplicate key" in tl:
        return True
    if "unique constraint failed" in tl:
        return True
    return False


def raise_duplicate_document_code_if_unique_violation(exc: IntegrityError) -> None:
    """Raise HTTP 409 for document-code races; re-raise other integrity errors."""
    if is_duplicate_document_code_violation(exc):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=DUPLICATE_DOCUMENT_CODE_DETAIL,
        ) from exc
    raise exc


async def commit_handling_duplicate_document_code(db: AsyncSession) -> None:
    try:
        await db.commit()
    except IntegrityError as e:
        await db.rollback()
        raise_duplicate_document_code_if_unique_violation(e)


async def flush_handling_duplicate_document_code(db: AsyncSession) -> None:
    try:
        await db.flush()
    except IntegrityError as e:
        await db.rollback()
        raise_duplicate_document_code_if_unique_violation(e)
