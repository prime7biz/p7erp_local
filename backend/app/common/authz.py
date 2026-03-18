from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Role, User


def ensure_user_in_tenant(user: User, tenant_id: int) -> None:
    if user.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def ensure_user_is_tenant_admin(db: AsyncSession, user: User, tenant_id: int) -> None:
    ensure_user_in_tenant(user, tenant_id)
    result = await db.execute(
        select(Role).where(Role.id == user.role_id, Role.tenant_id == tenant_id).limit(1)
    )
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User role not found for tenant",
        )
    if role.name.lower() != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required",
        )
