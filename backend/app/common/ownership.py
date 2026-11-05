"""Tenant ownership checks for client-supplied related-record IDs.

Use before persisting any foreign key that comes from a request body, import row or job payload, on
create *and* update. A record that belongs to another tenant is reported exactly like a missing one,
so the response does not reveal whether the ID exists elsewhere.
"""

from __future__ import annotations

from typing import Any, TypeVar

from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


async def ensure_owned(
    db: AsyncSession,
    model: type[T],
    obj_id: int | None,
    tenant_id: int,
    label: str,
    *,
    status_code: int = 400,
) -> T | None:
    """Return the row when `obj_id` is None-or-owned; raise HTTP `status_code` otherwise."""
    if obj_id is None:
        return None
    row: Any = await db.get(model, int(obj_id))
    if row is None or getattr(row, "tenant_id", None) != tenant_id:
        raise HTTPException(status_code=status_code, detail=f"{label} {obj_id} not found")
    return row


async def ensure_all_owned(
    db: AsyncSession,
    model: type[T],
    obj_ids: list[int | None],
    tenant_id: int,
    label: str,
    *,
    status_code: int = 400,
) -> None:
    """Validate several IDs of the same model (None entries are ignored)."""
    for obj_id in dict.fromkeys(i for i in obj_ids if i is not None):
        await ensure_owned(db, model, obj_id, tenant_id, label, status_code=status_code)
