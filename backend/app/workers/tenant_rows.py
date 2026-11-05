"""Load active tenants as plain values for per-tenant Celery loops.

After ``db.rollback()`` every ORM object in the session is expired; touching
``tenant.id`` then triggers a lazy load that fails under asyncio (MissingGreenlet)
and the job stops for all remaining tenants. Plain tuples are never expired.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant import Tenant


async def active_tenant_rows(db: AsyncSession) -> list[tuple[int, Any]]:
    """Return ``[(tenant_id, feature_flags), ...]`` for active tenants."""
    rows = (
        await db.execute(select(Tenant.id, Tenant.feature_flags).where(Tenant.is_active.is_(True)).order_by(Tenant.id))
    ).all()
    return [(int(tenant_id), flags) for tenant_id, flags in rows]
