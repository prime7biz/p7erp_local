"""KPI engine HTTP API. Flag-gated; server-side sensitivity filtering."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.ownership import ensure_owned
from app.common.pagination import MAX_PAGE_SIZE
from app.common.permissions import require_internal_permission, soft_permission_denied
from app.database import get_db
from app.models import Tenant, User
from app.modules.kpi_engine.commitment_service import backfill_open_orders, list_revisions
from app.modules.kpi_engine.compute.service import compute_kpi
from app.modules.kpi_engine.evidence_service import evidence_for_kpi
from app.modules.kpi_engine.predictive_service import score_order_delay_risk
from app.modules.kpi_engine.recalc_service import enqueue_recalc, run_job
from app.modules.kpi_engine.registry_service import (
    build_cards,
    definition_to_dict,
    get_definition_by_code,
    list_definitions,
)
from app.modules.kpi_engine.schemas import RecalcEnqueueIn, SeedResultOut
from app.modules.kpi_engine.security import (
    PERMISSION_KPI_MANAGE,
    PERMISSION_KPI_READ,
    can_view_definition,
    get_user_role,
    require_kpi_engine,
    require_kpi_predictive,
)
from app.modules.kpi_engine.seed import seed_kpi_definitions

router = APIRouter(
    prefix="/kpi",
    tags=["kpi-engine"],
    dependencies=[Depends(require_internal_permission(PERMISSION_KPI_READ))],
)


def _is_adminish(user: User) -> bool:
    if bool(getattr(user, "is_tenant_super_admin", False)):
        return True
    role = (getattr(getattr(user, "role", None), "name", None) or "").lower()
    return role in {"admin", "manager", "super_admin", "superadmin", "owner"}


@router.get("/definitions")
async def get_definitions(
    module: str | None = None,
    dashboard: str | None = None,
    limit: int = Query(200, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await get_user_role(db, user, tenant)
    if soft_permission_denied(role=role, permission_key=PERMISSION_KPI_READ):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    rows = await list_definitions(
        db, tenant, user=user, role=role, module=module, dashboard=dashboard, limit=limit
    )
    return {"items": [definition_to_dict(r) for r in rows]}


@router.get("/definitions/{code}")
async def get_definition(
    code: str,
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await get_user_role(db, user, tenant)
    row = await get_definition_by_code(db, tenant.id, code)
    if not row or not can_view_definition(user=user, tenant=tenant, role=role, sensitivity=row.sensitivity):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KPI not found")
    return definition_to_dict(row)


@router.post("/seed", response_model=SeedResultOut)
async def seed_definitions(
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await get_user_role(db, user, tenant)
    if not _is_adminish(user) and soft_permission_denied(role=role, permission_key=PERMISSION_KPI_MANAGE):
        if not (role and isinstance(role.permissions, dict) and role.permissions.get(PERMISSION_KPI_MANAGE) is True):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    result = await seed_kpi_definitions(db, tenant.id)
    await db.commit()
    return result


@router.get("/cards")
async def get_cards(
    dashboard: str = Query(..., min_length=2, max_length=64),
    as_of: date | None = None,
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await get_user_role(db, user, tenant)
    cards = await build_cards(db, tenant, user=user, role=role, dashboard=dashboard, as_of=as_of)
    return {"dashboard": dashboard, "items": cards}


@router.get("/{code}/value")
async def get_value(
    code: str,
    as_of: date | None = None,
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await get_user_role(db, user, tenant)
    row = await get_definition_by_code(db, tenant.id, code)
    if not row or not can_view_definition(user=user, tenant=tenant, role=role, sensitivity=row.sensitivity):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KPI not found")
    value = await compute_kpi(db, tenant.id, row, as_of=as_of)
    return {"definition": definition_to_dict(row), "value": value.to_dict()}


@router.get("/{code}/evidence")
async def get_evidence(
    code: str,
    as_of: date | None = None,
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    role = await get_user_role(db, user, tenant)
    row = await get_definition_by_code(db, tenant.id, code)
    if not row or not can_view_definition(user=user, tenant=tenant, role=role, sensitivity=row.sensitivity):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="KPI not found")
    return await evidence_for_kpi(db, tenant.id, row, as_of=as_of, limit=limit, offset=offset)


@router.get("/orders/{order_id}/commitment-revisions")
async def get_commitment_revisions(
    order_id: int,
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.merch import Order

    await ensure_owned(db, Order, order_id, tenant.id, "Order", status_code=404)
    revs = await list_revisions(db, tenant.id, order_id)
    return {
        "order_id": order_id,
        "items": [
            {
                "id": r.id,
                "order_id": r.order_id,
                "revision_no": r.revision_no,
                "committed_date": r.committed_date.isoformat() if r.committed_date else None,
                "committed_qty": format(r.committed_qty, "f") if r.committed_qty is not None else None,
                "reason": r.reason,
                "source": r.source,
                "changed_by": r.changed_by,
                "changed_at": r.changed_at.isoformat() + "Z",
                "backfilled": r.backfilled,
            }
            for r in revs
        ],
    }


@router.post("/orders/commitment-revisions/backfill")
async def backfill_commitments(
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _is_adminish(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    created = await backfill_open_orders(db, tenant.id, user_id=user.id)
    await db.commit()
    return {"created": created}


@router.post("/recalculate")
async def enqueue_recalculation(
    body: RecalcEnqueueIn,
    tenant: Tenant = Depends(require_kpi_engine),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not _is_adminish(user):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Permission denied")
    if body.date_to < body.date_from:
        raise HTTPException(status_code=400, detail="date_to before date_from")
    if (body.date_to - body.date_from).days > 31:
        raise HTTPException(status_code=400, detail="Recalculation window max 31 days")
    kpi_id = None
    if body.kpi_code:
        row = await get_definition_by_code(db, tenant.id, body.kpi_code)
        if not row:
            raise HTTPException(status_code=404, detail="KPI not found")
        kpi_id = row.id
    job = await enqueue_recalc(
        db,
        tenant_id=tenant.id,
        date_from=body.date_from,
        date_to=body.date_to,
        kpi_definition_id=kpi_id,
        reason=body.reason,
    )
    await run_job(db, job)
    await db.commit()
    return {"job_id": job.id, "status": job.status, "error": job.error}


@router.post("/predictive/orders/{order_id}/delay-risk")
async def predictive_order_delay(
    order_id: int,
    tenant: Tenant = Depends(require_kpi_predictive),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.models.merch import Order

    await ensure_owned(db, Order, order_id, tenant.id, "Order", status_code=404)
    result = await score_order_delay_risk(db, tenant.id, order_id)
    await db.commit()
    return result
