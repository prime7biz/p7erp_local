"""REST API for commercial change requests (orders / quotations)."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.orders.change_request_schemas import (
    CommercialChangePendingSummaryOut,
    CommercialChangeRequestCreate,
    CommercialChangeRequestOut,
    CommercialChangeRequestReviewBody,
)
from app.modules.orders.change_request_service import (
    approve_change_request,
    apply_change_request,
    cancel_change_request,
    count_pending_approvals,
    create_change_request,
    cr_to_out,
    get_change_request,
    list_change_requests,
    reject_change_request,
)
from app.modules.orders.commercial_change_authz import require_commercial_capability

router = APIRouter(tags=["commercial-change"])


@router.post("/change-requests", response_model=CommercialChangeRequestOut, status_code=status.HTTP_201_CREATED)
async def post_change_request(
    body: CommercialChangeRequestCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "propose_change")
    cr = await create_change_request(
        db,
        tenant_id=tenant.id,
        user=user,
        entity_type=body.entity_type,
        entity_id=body.entity_id,
        field_key=body.field_key,
        new_value=body.new_value,
        reason=body.reason,
        source=body.source,
        source_ref=body.source_ref,
    )
    await db.commit()
    await db.refresh(cr)
    return CommercialChangeRequestOut.model_validate(cr_to_out(cr))


@router.get("/change-requests/pending-summary", response_model=CommercialChangePendingSummaryOut)
async def get_pending_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "view_changes")
    n = await count_pending_approvals(db, tenant_id=tenant.id)
    return CommercialChangePendingSummaryOut(pending_approval_count=n)


@router.get("/change-requests/{cr_id}", response_model=CommercialChangeRequestOut)
async def get_one_change_request(
    cr_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "view_changes")
    cr = await get_change_request(db, tenant_id=tenant.id, cr_id=cr_id)
    if not cr:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Change request not found")
    return CommercialChangeRequestOut.model_validate(cr_to_out(cr))


@router.get("/orders/{order_id}/change-requests", response_model=list[CommercialChangeRequestOut])
async def list_order_change_requests(
    order_id: int,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "view_changes")
    from app.models import Order

    o = await db.get(Order, order_id)
    if not o or o.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    rows = await list_change_requests(
        db,
        tenant_id=tenant.id,
        entity_type="order",
        entity_id=order_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    return [CommercialChangeRequestOut.model_validate(cr_to_out(r)) for r in rows]


@router.get("/quotations/{quotation_id}/change-requests", response_model=list[CommercialChangeRequestOut])
async def list_quotation_change_requests(
    quotation_id: int,
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "view_changes")
    from app.models import Quotation

    q = await db.get(Quotation, quotation_id)
    if not q or q.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    rows = await list_change_requests(
        db,
        tenant_id=tenant.id,
        entity_type="quotation",
        entity_id=quotation_id,
        status_filter=status_filter,
        limit=limit,
        offset=offset,
    )
    return [CommercialChangeRequestOut.model_validate(cr_to_out(r)) for r in rows]


@router.post("/change-requests/{cr_id}/approve", response_model=CommercialChangeRequestOut)
async def post_approve(
    cr_id: int,
    body: CommercialChangeRequestReviewBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "approve_change")
    note = body.note if body else None
    cr = await approve_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr_id, note=note)
    await db.commit()
    await db.refresh(cr)
    return CommercialChangeRequestOut.model_validate(cr_to_out(cr))


@router.post("/change-requests/{cr_id}/reject", response_model=CommercialChangeRequestOut)
async def post_reject(
    cr_id: int,
    body: CommercialChangeRequestReviewBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "reject_change")
    note = body.note if body else None
    cr = await reject_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr_id, note=note)
    await db.commit()
    await db.refresh(cr)
    return CommercialChangeRequestOut.model_validate(cr_to_out(cr))


@router.post("/change-requests/{cr_id}/apply", response_model=CommercialChangeRequestOut)
async def post_apply(
    cr_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "apply_change")
    cr = await apply_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr_id)
    await db.commit()
    await db.refresh(cr)
    return CommercialChangeRequestOut.model_validate(cr_to_out(cr))


@router.post("/change-requests/{cr_id}/cancel", response_model=CommercialChangeRequestOut)
async def post_cancel(
    cr_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")
    await require_commercial_capability(db, user, "propose_change")
    cr = await cancel_change_request(db, tenant_id=tenant.id, user=user, cr_id=cr_id)
    await db.commit()
    await db.refresh(cr)
    return CommercialChangeRequestOut.model_validate(cr_to_out(cr))
