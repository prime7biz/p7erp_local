from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Role, Tenant, User
from app.modules.users.schemas import RoleResponse

router = APIRouter(prefix="/roles", tags=["roles"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("", response_model=list[RoleResponse])
async def list_roles(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List roles for the current tenant."""
    _ensure_user_tenant(user, tenant)
    result = await db.execute(select(Role).where(Role.tenant_id == tenant.id))
    rows = result.scalars().all()
    return [
        RoleResponse(id=r.id, tenant_id=r.tenant_id, name=r.name, display_name=r.display_name)
        for r in rows
    ]
