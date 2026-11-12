"""Global record search for the Ctrl+K palette: a few matches per module, tenant-scoped, permission-aware."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.global_search.service import (  # noqa: F401  (re-exported for existing imports)
    _SOURCES,
    SearchGroup,
    SearchHit,
    SearchResponse,
    _join,
    _like,
    search_records,
)

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def global_search(
    request: Request,
    q: str = Query(..., min_length=2, max_length=80),
    limit: int = Query(5, ge=1, le=10),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    return await search_records(db, tenant=tenant, user=user, query=q, limit=limit)
