"""Helpers for tenant-scoped inventory rules (e.g. negative stock)."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Tenant


async def tenant_allows_negative_stock(db: AsyncSession, tenant_id: int) -> bool:
    row = await db.get(Tenant, tenant_id)
    if row is None:
        return True
    return bool(getattr(row, "allow_negative_stock", True))
