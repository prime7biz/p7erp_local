from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def next_tenant_code(
    db: AsyncSession,
    *,
    model,
    tenant_id: int,
    prefix: str,
    width: int = 4,
) -> str:
    """Generate next tenant-scoped code using atomic tenant/entity counters."""
    entity_key = getattr(model, "__tablename__", model.__name__).lower()
    result = await db.execute(
        text(
            """
            INSERT INTO tenant_code_counters (tenant_id, entity_key, last_value)
            VALUES (:tenant_id, :entity_key, 1)
            ON CONFLICT (tenant_id, entity_key)
            DO UPDATE SET last_value = tenant_code_counters.last_value + 1
            RETURNING last_value
            """
        ),
        {"tenant_id": tenant_id, "entity_key": entity_key},
    )
    next_value = result.scalar_one()
    return f"{prefix}{next_value:0{width}d}"
