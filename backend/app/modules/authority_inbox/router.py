"""Authority inbox + change-request API (flag-gated)."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.authority_inbox import service as svc

router = APIRouter(prefix="/authority", tags=["authority-inbox"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException

        raise HTTPException(status_code=403, detail="Tenant mismatch")


class ChangeRequestCreateBody(BaseModel):
    request_id: str | None = Field(default=None, max_length=64)
    module_code: str = Field(default="finance", max_length=32)
    resource_type: str = Field(..., max_length=64)
    resource_id: int | None = None
    action: str = Field(..., max_length=16)
    proposed_snapshot: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(..., min_length=3, max_length=4000)


class ChangeRequestDecisionBody(BaseModel):
    decision: str = Field(..., max_length=16)
    note: str | None = Field(default=None, max_length=4000)


@router.get("/inbox")
async def get_authority_inbox(
    limit: int = Query(default=50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await svc.build_inbox(
        db, tenant_id=tenant.id, user=user, feature_flags=tenant.feature_flags, limit=limit
    )


@router.get("/change-requests")
async def list_authority_change_requests(
    scope: str = Query(default="waiting", max_length=32),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = await svc.list_change_requests(
        db,
        tenant_id=tenant.id,
        user=user,
        feature_flags=tenant.feature_flags,
        scope=scope,
        limit=limit,
        offset=offset,
    )
    return {"items": [svc._row_out(r) for r in rows]}


@router.post("/change-requests", status_code=201)
async def create_authority_change_request(
    body: ChangeRequestCreateBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await svc.submit_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        feature_flags=tenant.feature_flags,
        request_id=body.request_id,
        module_code=body.module_code,
        resource_type=body.resource_type,
        resource_id=body.resource_id,
        action=body.action,
        proposed_snapshot=body.proposed_snapshot,
        reason=body.reason,
    )
    await db.commit()
    await db.refresh(row)
    return svc._row_out(row)


@router.post("/change-requests/{request_pk}/decision")
async def decide_authority_change_request(
    request_pk: int,
    body: ChangeRequestDecisionBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await svc.decide_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        feature_flags=tenant.feature_flags,
        request_pk=request_pk,
        decision=body.decision,
        note=body.note,
    )
    await db.commit()
    await db.refresh(row)
    return svc._row_out(row)
