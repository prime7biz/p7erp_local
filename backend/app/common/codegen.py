from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession


async def next_tenant_code(
    db: AsyncSession,
    *,
    model,
    tenant_id: int,
    prefix: str,
    width: int = 4,
) -> str:
    """Generate next tenant-scoped code using max(id)+1 strategy."""
    last_id = (
        await db.execute(select(func.max(model.id)).where(model.tenant_id == tenant_id))
    ).scalar()
    return f"{prefix}{(last_id or 0) + 1:0{width}d}"
