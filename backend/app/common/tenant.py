from typing import Annotated
from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models import Tenant, TenantType


async def get_tenant_id_from_header(x_tenant_id: Annotated[str | None, Header()] = None) -> int | None:
    """Resolve tenant ID from X-Tenant-Id header. Used when TENANT_STRATEGY=header."""
    if not x_tenant_id:
        return None
    try:
        return int(x_tenant_id)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid X-Tenant-Id",
        )


async def get_tenant(
    db: AsyncSession,
    tenant_id: int | None,
) -> Tenant | None:
    """Load tenant by ID. Returns None if tenant_id is None."""
    if tenant_id is None:
        return None
    result = await db.execute(select(Tenant).where(Tenant.id == tenant_id, Tenant.is_active.is_(True)))
    tenant = result.scalar_one_or_none()
    return tenant


async def require_tenant(
    tenant_id: Annotated[int | None, Depends(get_tenant_id_from_header)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Tenant:
    """Dependency: resolve and return the current tenant. Raises 404 if not found or not provided."""
    tenant = await get_tenant(db, tenant_id)
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found or X-Tenant-Id missing",
        )
    return tenant


def tenant_can_access_manufacturing(tenant_type: TenantType) -> bool:
    return tenant_type in (TenantType.manufacturer, TenantType.both)


def tenant_can_access_buying_house(tenant_type: TenantType) -> bool:
    return tenant_type in (TenantType.buying_house, TenantType.both)
