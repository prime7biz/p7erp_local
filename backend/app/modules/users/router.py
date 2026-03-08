from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User, Role
from app.modules.users.schemas import RoleResponse, UserWithRoleResponse

router = APIRouter(prefix="/users", tags=["users"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.get("", response_model=list[UserWithRoleResponse])
async def list_users(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List users for the current tenant."""
    _ensure_user_tenant(user, tenant)
    result = await db.execute(
        select(User, Role).join(Role, User.role_id == Role.id).where(User.tenant_id == tenant.id)
    )
    rows = result.all()
    return [
        UserWithRoleResponse(
            id=u.id,
            tenant_id=u.tenant_id,
            role_id=u.role_id,
            email=u.email,
            username=u.username,
            first_name=u.first_name,
            last_name=u.last_name,
            is_active=u.is_active,
            role_name=r.display_name,
        )
        for u, r in rows
    ]


@router.get("/me", response_model=UserWithRoleResponse)
async def get_me(
    tenant: Tenant = Depends(require_tenant),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Get current user with role. X-Tenant-Id must match user's tenant."""
    _ensure_user_tenant(current_user, tenant)
    role_result = await db.execute(select(Role).where(Role.id == current_user.role_id))
    role = role_result.scalar_one()
    return UserWithRoleResponse(
        id=current_user.id,
        tenant_id=current_user.tenant_id,
        role_id=current_user.role_id,
        email=current_user.email,
        username=current_user.username,
        first_name=current_user.first_name,
        last_name=current_user.last_name,
        is_active=current_user.is_active,
        role_name=role.display_name,
    )
