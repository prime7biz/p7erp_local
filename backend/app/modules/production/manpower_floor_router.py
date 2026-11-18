"""Production floor suggested manpower APIs (Phase 3).

Mounted under ``/production/manpower`` without the blanket ``production.access`` gate so
HR users with ``hr.manpower.read`` can open the Floor hub tab. Either
``production.planning.read`` or ``hr.manpower.read`` (soft) is enough.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authz import get_user_role_scoped_to_tenant
from app.common.pagination import MAX_PAGE_SIZE
from app.common.permissions import (
    PERMISSION_HR_MANPOWER_READ,
    assert_soft_permission_allowed,
    soft_permission_denied,
)
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_manpower_floor_suggested_v1_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.production import manpower_floor_service as svc

router = APIRouter(prefix="/production/manpower", tags=["production-manpower"])

_PLANNING_READ = "production.planning.read"


def _require_flag(tenant: Tenant) -> None:
    if not is_manpower_floor_suggested_v1_enabled(tenant.feature_flags):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Floor suggested manpower is not enabled",
        )


async def _require_floor_read(db: AsyncSession, user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    _require_flag(tenant)
    role = await get_user_role_scoped_to_tenant(db, user, tenant.id)
    # Soft OR: production.planning.read (missing key = allow) OR hr.manpower.read.
    if not soft_permission_denied(role=role, permission_key=_PLANNING_READ):
        return
    await assert_soft_permission_allowed(
        db, user, tenant.id, permission_key=PERMISSION_HR_MANPOWER_READ
    )


@router.get("/floor-suggested")
async def floor_suggested(
    factory_unit: str | None = Query(None),
    department_type: str | None = Query(None),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_floor_read(db, user, tenant)
    try:
        return await svc.build_floor_suggested(
            db,
            tenant.id,
            factory_unit=factory_unit,
            department_type=department_type,
            limit=limit,
            offset=offset,
        )
    except Exception:
        await safe_async_session_rollback(db)
        raise


@router.get("/machine-ratio")
async def machine_ratio(
    factory_unit: str | None = Query(None),
    limit: int = Query(100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await _require_floor_read(db, user, tenant)
    try:
        return await svc.build_machine_ratio(
            db,
            tenant.id,
            factory_unit=factory_unit,
            limit=limit,
            offset=offset,
        )
    except Exception:
        await safe_async_session_rollback(db)
        raise
