"""GET /api/v1/commercial/lc-performance — LC value, shipped, realised, outstanding, BTB per master LC."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.commercial.lc_performance_service import lc_performance

router = APIRouter(prefix="/commercial", tags=["commercial"])


@router.get("/lc-performance")
async def get_lc_performance(
    limit: int = Query(default=200, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=403, detail="Tenant mismatch")
    return await lc_performance(db, tenant.id, limit=limit)
