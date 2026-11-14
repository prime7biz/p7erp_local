"""Employee change requests (Tier 1 / Tier 2 approval). Mounted under hr.access.

POST /hr/employees/{id}/change-requests          submit (flag must be on; retry-safe by request_id)
GET  /hr/change-requests                          list (?view=tier1|tier2|mine, ?status=, ?employee_id=)
GET  /hr/change-requests/me                       what the caller may do (tier keys, pay visibility)
GET  /hr/change-requests/{id}                     one request with before / after
POST /hr/change-requests/{id}/tier1-decision      APPROVE / REJECT (strict key hr.employee.change.tier1)
POST /hr/change-requests/{id}/tier2-decision      APPROVE (applies the change) / REJECT (key ...tier2)
POST /hr/change-requests/{id}/cancel              the maker (or a manager) while it is still pending
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.common.tenant_feature_keys import is_hr_employee_change_approval_enabled
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.models.hr import Employee
from app.models.hr_change_request import CHANGE_STATUSES
from app.modules.hr import employee_service
from app.modules.hr_change_requests import service

router = APIRouter(prefix="/hr", tags=["hr-change-requests"])

ChangeKind = Literal["INFO", "COMPENSATION", "PAY_BENEFITS", "TAX_PROFILE"]


class ChangeRequestCreate(BaseModel):
    kind: ChangeKind
    payload: dict[str, Any]
    reason: str = Field(..., min_length=1, max_length=2000)
    request_id: str = Field(..., pattern=r"^[A-Za-z0-9_-]{8,64}$")


class ChangeDecision(BaseModel):
    decision: Literal["APPROVE", "REJECT"]
    note: str | None = Field(None, max_length=2000)


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _out(db: AsyncSession, tenant: Tenant, user: User, req) -> dict[str, Any]:
    rights = await service.viewer_rights(db, user, tenant.id)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    employee = await db.get(Employee, req.employee_id)
    if employee is not None and employee.tenant_id != tenant.id:
        employee = None
    return service.request_out(req, employee, can_view_pay=rights["can_view_pay"], masked_fields=access.masked_fields())


@router.get("/change-requests/me")
async def change_request_rights(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rights = await service.viewer_rights(db, user, tenant.id)
    return {"enabled": is_hr_employee_change_approval_enabled(tenant.feature_flags), "user_id": user.id, **rights}


@router.post("/employees/{employee_id}/change-requests", status_code=status.HTTP_201_CREATED)
async def submit_change_request(
    employee_id: int,
    body: ChangeRequestCreate,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        req, created = await service.submit(
            db,
            tenant=tenant,
            user=user,
            employee_id=employee_id,
            kind=body.kind,
            payload=body.payload,
            reason=body.reason,
            request_id=body.request_id,
        )
        await db.commit()
    except HTTPException:
        # Refusals happen before any write (dry runs use savepoints that are already undone).
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise
    if not created:
        response.status_code = status.HTTP_200_OK
    await db.refresh(req)
    return await _out(db, tenant, user, req)


@router.get("/change-requests")
async def list_change_requests(
    view: Literal["tier1", "tier2", "mine", "all"] = Query(default="all"),
    status_filter: str | None = Query(default=None, alias="status"),
    employee_id: int | None = Query(default=None),
    limit: int = Query(default=100, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    if status_filter and status_filter not in CHANGE_STATUSES:
        raise HTTPException(status_code=422, detail="Unknown status")
    rows = await service.list_requests(
        db, tenant_id=tenant.id, user=user, status=status_filter, employee_id=employee_id,
        view=None if view == "all" else view, limit=limit, offset=offset,
    )
    rights = await service.viewer_rights(db, user, tenant.id)
    access = await employee_service.employee_field_access(db, user, tenant.id)
    masked = access.masked_fields()
    return [service.request_out(r, e, can_view_pay=rights["can_view_pay"], masked_fields=masked) for r, e in rows]


@router.get("/change-requests/{request_id}")
async def get_change_request(
    request_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    req = await service.get_request(db, tenant.id, request_id)
    return await _out(db, tenant, user, req)


async def _decide(db: AsyncSession, tenant: Tenant, user: User, request_id: int, tier: int, body: ChangeDecision):
    try:
        req = await service.decide(
            db, tenant=tenant, user=user, request_pk=request_id, tier=tier, decision=body.decision, note=body.note
        )
        await db.commit()
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise
    await db.refresh(req)
    return await _out(db, tenant, user, req)


@router.post("/change-requests/{request_id}/tier1-decision")
async def tier1_decision(
    request_id: int,
    body: ChangeDecision,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _decide(db, tenant, user, request_id, 1, body)


@router.post("/change-requests/{request_id}/tier2-decision")
async def tier2_decision(
    request_id: int,
    body: ChangeDecision,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _decide(db, tenant, user, request_id, 2, body)


@router.post("/change-requests/{request_id}/cancel")
async def cancel_change_request(
    request_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        req = await service.cancel(db, tenant=tenant, user=user, request_pk=request_id)
        await db.commit()
    except HTTPException:
        raise
    except Exception:
        await safe_async_session_rollback(db)
        raise
    await db.refresh(req)
    return await _out(db, tenant, user, req)
