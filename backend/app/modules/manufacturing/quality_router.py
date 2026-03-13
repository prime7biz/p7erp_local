from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from fastapi import APIRouter, Depends, HTTPException, Query, status
from app.models import (
    ManufacturingCapa,
    ManufacturingNcr,
    ManufacturingQualityCheck,
    ManufacturingWorkOrder,
    Tenant,
    User,
)
from app.modules.manufacturing.schemas import (
    CapaCreate,
    CapaResponse,
    CapaStatusUpdate,
    NcrCreate,
    NcrResponse,
    NcrStatusUpdate,
    QualityCheckCreate,
    QualityCheckResponse,
)

router = APIRouter(prefix="/manufacturing/quality", tags=["manufacturing-quality"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _to_ncr_response(row: ManufacturingNcr) -> NcrResponse:
    return NcrResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        ncr_code=row.ncr_code,
        work_order_id=row.work_order_id,
        work_order_operation_id=row.work_order_operation_id,
        defect_code=row.defect_code,
        severity=row.severity,
        status=row.status,
        description=row.description,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _to_capa_response(row: ManufacturingCapa) -> CapaResponse:
    return CapaResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        ncr_id=row.ncr_id,
        owner_user_id=row.owner_user_id,
        corrective_action=row.corrective_action,
        preventive_action=row.preventive_action,
        due_date=row.due_date,
        status=row.status,
        closure_note=row.closure_note,
        closed_at=row.closed_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _append_audit_note(existing: str | None, actor_user_id: int, action: str, note: str | None) -> str:
    base = existing or ""
    detail = (note or "").strip()
    line = f"[{datetime.utcnow().isoformat()}] [{action} by user #{actor_user_id}]"
    if detail:
        line = f"{line} {detail}"
    if not base:
        return line
    return f"{base}\n{line}"


@router.get("/checks", response_model=list[QualityCheckResponse])
async def list_quality_checks(
    work_order_id: int | None = Query(default=None),
    check_type: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingQualityCheck).where(ManufacturingQualityCheck.tenant_id == tenant.id)
    if work_order_id is not None:
        stmt = stmt.where(ManufacturingQualityCheck.work_order_id == work_order_id)
    if check_type is not None and check_type.strip():
        stmt = stmt.where(ManufacturingQualityCheck.check_type == check_type.strip().lower())
    result = await db.execute(stmt.order_by(ManufacturingQualityCheck.id.desc()))
    rows = result.scalars().all()
    return [
        QualityCheckResponse(
            id=row.id,
            tenant_id=row.tenant_id,
            work_order_id=row.work_order_id,
            work_order_operation_id=row.work_order_operation_id,
            check_type=row.check_type,
            result=row.result,
            defect_code=row.defect_code,
            remarks=row.remarks,
            checked_by_user_id=row.checked_by_user_id,
            created_at=row.created_at,
        )
        for row in rows
    ]


@router.post("/checks", response_model=QualityCheckResponse, status_code=status.HTTP_201_CREATED)
async def create_quality_check(
    body: QualityCheckCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo = await db.get(ManufacturingWorkOrder, body.work_order_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    row = ManufacturingQualityCheck(
        tenant_id=tenant.id,
        work_order_id=body.work_order_id,
        work_order_operation_id=body.work_order_operation_id,
        check_type=body.check_type.strip().lower(),
        result=body.result.strip().lower(),
        defect_code=body.defect_code.strip().upper() if body.defect_code else None,
        remarks=body.remarks.strip() if body.remarks else None,
        checked_by_user_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return QualityCheckResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        work_order_id=row.work_order_id,
        work_order_operation_id=row.work_order_operation_id,
        check_type=row.check_type,
        result=row.result,
        defect_code=row.defect_code,
        remarks=row.remarks,
        checked_by_user_id=row.checked_by_user_id,
        created_at=row.created_at,
    )


@router.get("/ncrs", response_model=list[NcrResponse])
async def list_ncrs(
    status_filter: str | None = Query(default=None),
    work_order_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingNcr).where(ManufacturingNcr.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(ManufacturingNcr.status == status_filter.strip().lower())
    if work_order_id is not None:
        stmt = stmt.where(ManufacturingNcr.work_order_id == work_order_id)
    rows = (await db.execute(stmt.order_by(ManufacturingNcr.id.desc()))).scalars().all()
    return [_to_ncr_response(row) for row in rows]


@router.post("/ncrs", response_model=NcrResponse, status_code=status.HTTP_201_CREATED)
async def create_ncr(
    body: NcrCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    wo = await db.get(ManufacturingWorkOrder, body.work_order_id)
    if not wo or wo.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="Work order not found")
    if body.ncr_code:
        ncr_code = body.ncr_code.strip().upper()
    else:
        last_id = (await db.execute(select(func.max(ManufacturingNcr.id)).where(ManufacturingNcr.tenant_id == tenant.id))).scalar()
        ncr_code = f"NCR-{(last_id or 0) + 1:04d}"
    row = ManufacturingNcr(
        tenant_id=tenant.id,
        ncr_code=ncr_code,
        work_order_id=body.work_order_id,
        work_order_operation_id=body.work_order_operation_id,
        defect_code=body.defect_code.strip().upper(),
        severity=body.severity.strip().lower(),
        status="open",
        description=body.description.strip() if body.description else None,
        created_by_user_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_ncr_response(row)


@router.post("/ncrs/{ncr_id}/status", response_model=NcrResponse)
async def update_ncr_status(
    ncr_id: int,
    body: NcrStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingNcr, ncr_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="NCR not found")
    next_status = body.status.strip().lower()
    if next_status in {"reopen", "reopened"}:
        if not (body.note or "").strip():
            raise HTTPException(status_code=400, detail="Reopen note is required")
        next_status = "open"
    row.status = next_status
    if body.note is not None:
        row.description = _append_audit_note(row.description, user.id, f"ncr_status={next_status}", body.note)
    await db.commit()
    await db.refresh(row)
    return _to_ncr_response(row)


@router.get("/capas", response_model=list[CapaResponse])
async def list_capas(
    status_filter: str | None = Query(default=None),
    ncr_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    stmt = select(ManufacturingCapa).where(ManufacturingCapa.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(ManufacturingCapa.status == status_filter.strip().lower())
    if ncr_id is not None:
        stmt = stmt.where(ManufacturingCapa.ncr_id == ncr_id)
    rows = (await db.execute(stmt.order_by(ManufacturingCapa.id.desc()))).scalars().all()
    return [_to_capa_response(row) for row in rows]


@router.post("/capas", response_model=CapaResponse, status_code=status.HTTP_201_CREATED)
async def create_capa(
    body: CapaCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    ncr = await db.get(ManufacturingNcr, body.ncr_id)
    if not ncr or ncr.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="NCR not found")
    if body.owner_user_id is not None:
        owner = await db.get(User, body.owner_user_id)
        if not owner or owner.tenant_id != tenant.id:
            raise HTTPException(status_code=404, detail="Owner user not found")
    row = ManufacturingCapa(
        tenant_id=tenant.id,
        ncr_id=body.ncr_id,
        owner_user_id=body.owner_user_id,
        corrective_action=body.corrective_action.strip(),
        preventive_action=body.preventive_action.strip() if body.preventive_action else None,
        due_date=body.due_date,
        status="open",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _to_capa_response(row)


@router.post("/capas/{capa_id}/status", response_model=CapaResponse)
async def update_capa_status(
    capa_id: int,
    body: CapaStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await db.get(ManufacturingCapa, capa_id)
    if not row or row.tenant_id != tenant.id:
        raise HTTPException(status_code=404, detail="CAPA not found")
    next_status = body.status.strip().lower()
    if next_status in {"reopen", "reopened"}:
        if not (body.note or "").strip():
            raise HTTPException(status_code=400, detail="Reopen note is required")
        next_status = "open"
    row.status = next_status
    if next_status in {"closed", "completed"}:
        row.closed_at = func.now()
        row.closure_note = body.closure_note.strip() if body.closure_note else None
    else:
        row.closed_at = None
    if body.note is not None:
        row.closure_note = _append_audit_note(row.closure_note, user.id, f"capa_status={next_status}", body.note)
    await db.commit()
    await db.refresh(row)
    return _to_capa_response(row)
