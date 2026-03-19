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
    """Generate next tenant-scoped code using atomic tenant/entity counters.
    On first use for an entity type, seeds from existing max(id) to avoid duplicate codes after migration 070.
    """
    entity_key = getattr(model, "__tablename__", model.__name__).lower()
    # Table name from model (safe: internal); seed new counter from max(id) so existing data is not duplicated.
    table_name = getattr(model, "__tablename__", model.__name__.lower())
    result = await db.execute(
        text(
            """
            INSERT INTO tenant_code_counters (tenant_id, entity_key, last_value)
            SELECT :tenant_id, :entity_key, COALESCE(
                (SELECT MAX(id) FROM """
            + table_name
            + """ WHERE tenant_id = :tenant_id), 0
            ) + 1
            ON CONFLICT (tenant_id, entity_key)
            DO UPDATE SET last_value = tenant_code_counters.last_value + 1
            RETURNING last_value
            """
        ),
        {"tenant_id": tenant_id, "entity_key": entity_key},
    )
    next_value = result.scalar_one()
    return f"{prefix}{next_value:0{width}d}"
