from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import case, func, select
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


# Result values we treat as pass vs failed for dashboard
_RESULT_PASS = "pass"
_RESULT_FAILED = ("fail", "reject")


@router.get("/dashboard")
async def get_quality_dashboard(
    date_from: date | None = Query(default=None, description="Filter by created_at from (YYYY-MM-DD)"),
    date_to: date | None = Query(default=None, description="Filter by created_at to (YYYY-MM-DD)"),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    tid = tenant.id

    # Optional date filter: include full day for date_to
    check_base = (
        ManufacturingQualityCheck.tenant_id == tid,
        func.lower(ManufacturingQualityCheck.result).in_([_RESULT_PASS, *_RESULT_FAILED]),
    )
    ncr_base = (ManufacturingNcr.tenant_id == tid,)
    capa_base = (ManufacturingCapa.tenant_id == tid,)

    if date_from is not None:
        dt_from = datetime.combine(date_from, datetime.min.time())
        check_base = (*check_base, ManufacturingQualityCheck.created_at >= dt_from)
        ncr_base = (*ncr_base, ManufacturingNcr.created_at >= dt_from)
        capa_base = (*capa_base, ManufacturingCapa.created_at >= dt_from)
    if date_to is not None:
        dt_to = datetime.combine(date_to, datetime.max.time())
        check_base = (*check_base, ManufacturingQualityCheck.created_at <= dt_to)
        ncr_base = (*ncr_base, ManufacturingNcr.created_at <= dt_to)
        capa_base = (*capa_base, ManufacturingCapa.created_at <= dt_to)

    # (1) inspections: total, passed, failed, pass_rate
    stmt_insp = select(
        func.count(ManufacturingQualityCheck.id).label("total"),
        func.sum(case((func.lower(ManufacturingQualityCheck.result) == _RESULT_PASS, 1), else_=0)).label("passed"),
        func.sum(
            case((func.lower(ManufacturingQualityCheck.result).in_(_RESULT_FAILED), 1), else_=0)
        ).label("failed"),
    ).where(*check_base)
    row_insp = (await db.execute(stmt_insp)).one()
    total_i = row_insp.total or 0
    passed_i = row_insp.passed or 0
    failed_i = row_insp.failed or 0
    inspections = {
        "total": total_i,
        "passed": passed_i,
        "failed": failed_i,
        "pass_rate": round(passed_i / total_i, 4) if total_i else 0.0,
    }

    # (2) by_check_type
    stmt_ct = (
        select(
            ManufacturingQualityCheck.check_type,
            func.count(ManufacturingQualityCheck.id).label("total"),
            func.sum(case((func.lower(ManufacturingQualityCheck.result) == _RESULT_PASS, 1), else_=0)).label(
                "passed"
            ),
            func.sum(
                case((func.lower(ManufacturingQualityCheck.result).in_(_RESULT_FAILED), 1), else_=0)
            ).label("failed"),
        )
        .where(*check_base)
        .group_by(ManufacturingQualityCheck.check_type)
    )
    rows_ct = (await db.execute(stmt_ct)).all()
    by_check_type = []
    for r in rows_ct:
        t, passed, failed = r.total or 0, r.passed or 0, r.failed or 0
        by_check_type.append(
            {
                "check_type": r.check_type,
                "total": t,
                "passed": passed,
                "failed": failed,
                "pass_rate": round(passed / t, 4) if t else 0.0,
            }
        )

    # (3) defect_distribution: defect_code, count; only where defect_code is set; order by count desc
    stmt_def = (
        select(ManufacturingQualityCheck.defect_code, func.count(ManufacturingQualityCheck.id).label("count"))
        .where(
            ManufacturingQualityCheck.tenant_id == tid,
            ManufacturingQualityCheck.defect_code.isnot(None),
            ManufacturingQualityCheck.defect_code != "",
        )
        .group_by(ManufacturingQualityCheck.defect_code)
        .order_by(func.count(ManufacturingQualityCheck.id).desc())
    )
    if date_from is not None:
        stmt_def = stmt_def.where(ManufacturingQualityCheck.created_at >= datetime.combine(date_from, datetime.min.time()))
    if date_to is not None:
        stmt_def = stmt_def.where(ManufacturingQualityCheck.created_at <= datetime.combine(date_to, datetime.max.time()))
    rows_def = (await db.execute(stmt_def)).all()
    defect_distribution = [{"defect_code": r.defect_code, "count": r.count} for r in rows_def]

    # (4) recent_checks: last 10 with id, work_order_id, check_type, result, defect_code, created_at
    stmt_recent = (
        select(ManufacturingQualityCheck)
        .where(ManufacturingQualityCheck.tenant_id == tid)
        .order_by(ManufacturingQualityCheck.id.desc())
        .limit(10)
    )
    if date_from is not None:
        stmt_recent = stmt_recent.where(
            ManufacturingQualityCheck.created_at >= datetime.combine(date_from, datetime.min.time())
        )
    if date_to is not None:
        stmt_recent = stmt_recent.where(
            ManufacturingQualityCheck.created_at <= datetime.combine(date_to, datetime.max.time())
        )
    recent_rows = (await db.execute(stmt_recent)).scalars().all()
    recent_checks = [
        {
            "id": r.id,
            "work_order_id": r.work_order_id,
            "check_type": r.check_type,
            "result": r.result,
            "defect_code": r.defect_code,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in recent_rows
    ]

    # (5) capa: total, open, in_progress, closed
    stmt_capa_total = select(func.count(ManufacturingCapa.id)).where(*capa_base)
    capa_total = (await db.execute(stmt_capa_total)).scalar() or 0
    stmt_capa_open = select(func.count(ManufacturingCapa.id)).where(
        *capa_base, func.lower(ManufacturingCapa.status) == "open"
    )
    capa_open = (await db.execute(stmt_capa_open)).scalar() or 0
    stmt_capa_ip = select(func.count(ManufacturingCapa.id)).where(
        *capa_base, func.lower(ManufacturingCapa.status) == "in_progress"
    )
    capa_in_progress = (await db.execute(stmt_capa_ip)).scalar() or 0
    stmt_capa_closed = select(func.count(ManufacturingCapa.id)).where(
        *capa_base, func.lower(ManufacturingCapa.status).in_(["closed", "completed"])
    )
    capa_closed = (await db.execute(stmt_capa_closed)).scalar() or 0
    capa = {"total": capa_total, "open": capa_open, "in_progress": capa_in_progress, "closed": capa_closed}

    # (6) ncr: total, open, closed
    stmt_ncr_total = select(func.count(ManufacturingNcr.id)).where(*ncr_base)
    ncr_total = (await db.execute(stmt_ncr_total)).scalar() or 0
    stmt_ncr_open = select(func.count(ManufacturingNcr.id)).where(
        *ncr_base, func.lower(ManufacturingNcr.status) == "open"
    )
    ncr_open = (await db.execute(stmt_ncr_open)).scalar() or 0
    stmt_ncr_closed = select(func.count(ManufacturingNcr.id)).where(
        *ncr_base, func.lower(ManufacturingNcr.status) == "closed"
    )
    ncr_closed = (await db.execute(stmt_ncr_closed)).scalar() or 0
    ncr = {"total": ncr_total, "open": ncr_open, "closed": ncr_closed}

    return {
        "inspections": inspections,
        "by_check_type": by_check_type,
        "defect_distribution": defect_distribution,
        "recent_checks": recent_checks,
        "capa": capa,
        "ncr": ncr,
    }


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
