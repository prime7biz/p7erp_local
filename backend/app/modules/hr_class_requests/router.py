"""HR class-request API under /api/v1/hr/class-requests (+ ESS helpers)."""

from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.authority.hr_policy import load_linked_employee_for_ess, require_ess_access
from app.common.pagination import MAX_PAGE_SIZE
from app.common.tenant import require_tenant
from app.database import get_db, safe_async_session_rollback
from app.models import Tenant, User
from app.modules.hr_class_requests import (
    analytics_service,
    clearance_service,
    delegation_service,
    letters_service,
    preview_service,
    service,
    service_record_service,
)
from app.modules.hr_class_requests.schemas import (
    ClearanceWaiveBody,
    DelegationCreate,
    EssCorrectionSubmit,
    EssLeaveSubmit,
    EssResignationSubmit,
    HrClassActionBody,
    HrClassLetterBody,
    HrClassPreviewBody,
    HrClassRequestCreate,
    HrClassRequestUpdate,
)

router = APIRouter(prefix="/hr/class-requests", tags=["hr-class-requests"])
ess_router = APIRouter(prefix="/hr/ess", tags=["hr-ess-class-requests"])


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _out(db: AsyncSession, tenant: Tenant, user: User, row):
    flags = await service.viewer_flags(db, user, tenant)
    return service.request_out(row, can_view_pay=flags["can_view_pay"], can_view_identity=flags["can_view_identity"])


@router.get("")
async def list_class_requests(
    status_filter: str | None = Query(None, alias="status"),
    kind: str | None = None,
    employee_id: int | None = None,
    view: str | None = None,
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    offset: int = Query(0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    rows = await service.list_requests(
        db,
        tenant=tenant,
        user=user,
        status_filter=status_filter,
        kind=kind,
        employee_id=employee_id,
        view=view,
        limit=limit,
        offset=offset,
    )
    return [await _out(db, tenant, user, r) for r in rows]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_class_request(
    body: HrClassRequestCreate,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        # Staff API never accepts client-supplied ESS provenance (ESS uses /hr/ess/*).
        row, created = await service.create_draft(
            db,
            tenant=tenant,
            user=user,
            kind=body.kind,
            request_id=body.request_id,
            employee_id=body.employee_id,
            payload=body.payload,
            reason=body.reason,
            source="HR_ENTRY",
            lines=body.lines,
        )
        await db.commit()
        await db.refresh(row)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    if not created:
        response.status_code = status.HTTP_200_OK
    return await _out(db, tenant, user, row)


@router.get("/{request_pk}")
async def get_class_request(
    request_pk: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    row = await service.get_request(db, tenant.id, request_pk)
    return await _out(db, tenant, user, row)


@router.patch("/{request_pk}")
async def update_class_request(
    request_pk: int,
    body: HrClassRequestUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        row = await service.update_draft(
            db,
            tenant=tenant,
            user=user,
            request_pk=request_pk,
            payload=body.payload,
            reason=body.reason,
            employee_id=body.employee_id,
            lines=body.lines,
        )
        await db.commit()
        await db.refresh(row)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return await _out(db, tenant, user, row)


async def _action(db, tenant, user, request_pk, fn, body: HrClassActionBody | None = None):
    try:
        row = await fn(db, tenant=tenant, user=user, request_pk=request_pk, note=(body.note if body else None))
        await db.commit()
        await db.refresh(row)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return await _out(db, tenant, user, row)


@router.post("/{request_pk}/submit")
async def submit_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _action(db, tenant, user, request_pk, service.submit, body)


@router.post("/{request_pk}/resubmit")
async def resubmit_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)

    async def _fn(db, *, tenant, user, request_pk, note):
        return await service.submit(db, tenant=tenant, user=user, request_pk=request_pk, note=note, resubmit=True)

    return await _action(db, tenant, user, request_pk, _fn, body)


@router.post("/{request_pk}/recommend")
async def recommend_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _action(db, tenant, user, request_pk, service.recommend, body)


@router.post("/{request_pk}/return")
async def return_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _action(db, tenant, user, request_pk, service.return_request, body)


@router.post("/{request_pk}/reject")
async def reject_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _action(db, tenant, user, request_pk, service.reject, body)


@router.post("/{request_pk}/approve")
async def approve_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _action(db, tenant, user, request_pk, service.approve, body)


@router.post("/{request_pk}/retry")
async def retry_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _action(db, tenant, user, request_pk, service.retry_apply, body)


@router.post("/{request_pk}/cancel")
async def cancel_class_request(
    request_pk: int,
    body: HrClassActionBody | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await _action(db, tenant, user, request_pk, service.cancel, body)


@router.post("/preview")
async def preview_impact(
    body: HrClassPreviewBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await preview_service.preview(
        db, tenant=tenant, user=user, kind=body.kind, employee_id=body.employee_id, payload=body.payload
    )


@router.post("/{request_pk}/letters")
async def issue_letter(
    request_pk: int,
    body: HrClassLetterBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        out = await letters_service.issue_letter(
            db,
            tenant=tenant,
            user=user,
            request_pk=request_pk,
            document_type=body.document_type,
            generation_request_id=body.request_id,
        )
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return out


@router.get("/employees/{employee_id}/service-record")
async def service_record(
    employee_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await service_record_service.build_service_record(db, tenant=tenant, user=user, employee_id=employee_id)


@router.get("/analytics/summary")
async def analytics_summary(
    from_date: date | None = None,
    to_date: date | None = None,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    return await analytics_service.analytics_summary(
        db, tenant=tenant, user=user, from_date=from_date, to_date=to_date
    )


@router.post("/delegations", status_code=status.HTTP_201_CREATED)
async def create_delegation(
    body: DelegationCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        row = await delegation_service.create_delegation(
            db,
            tenant=tenant,
            actor=user,
            delegate_user_id=body.delegate_user_id,
            step=body.step,
            starts_at=body.starts_at,
            ends_at=body.ends_at,
            reason=body.reason,
        )
        await db.commit()
        await db.refresh(row)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return {
        "id": row.id,
        "delegate_user_id": row.delegate_user_id,
        "step": row.step,
        "starts_at": row.starts_at.isoformat(),
        "ends_at": row.ends_at.isoformat(),
        "reason": row.reason,
    }


@router.post("/delegations/{delegation_id}/revoke")
async def revoke_delegation(
    delegation_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        row = await delegation_service.revoke_delegation(db, tenant=tenant, actor=user, delegation_id=delegation_id)
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return {"id": row.id, "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None}


@router.post("/clearance-items/{item_id}/waive")
async def waive_clearance(
    item_id: int,
    body: ClearanceWaiveBody,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    try:
        item = await clearance_service.waive_item(db, tenant=tenant, actor=user, item_id=item_id, note=body.note)
        await db.commit()
    except Exception:
        await safe_async_session_rollback(db)
        raise
    return {"id": item.id, "status": item.status}


# --- ESS surface (mounted with require_ess_access) -------------------------------------------------


@ess_router.get("/leave-types")
async def ess_leave_types(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_ess_access()),
):
    from app.models import LeaveType
    from sqlalchemy import select

    _ensure_tenant(user, tenant)
    rows = (
        await db.execute(
            select(LeaveType).where(LeaveType.tenant_id == tenant.id, LeaveType.is_active.is_(True)).order_by(LeaveType.code)
        )
    ).scalars().all()
    return [{"id": r.id, "code": r.code, "name": r.name, "is_paid": r.is_paid} for r in rows]


@ess_router.get("/my-payslips/{payslip_id}/pdf")
async def ess_payslip_pdf(
    payslip_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_ess_access()),
):
    from fastapi import Response as FastResponse
    from app.models import PayrollPayslip
    from app.common.ownership import ensure_owned

    from app.models import PayrollRun, PayrollRunLine
    from app.modules.hr.hr_document_generator_service import generate_payslip_pdf

    _ensure_tenant(user, tenant)
    emp = await load_linked_employee_for_ess(db, tenant=tenant, user=user)
    slip = await ensure_owned(db, PayrollPayslip, payslip_id, tenant.id, "Payslip", status_code=404)
    if slip is None or slip.employee_id != emp.id:
        raise HTTPException(status_code=404, detail="Payslip not found")
    run = await db.get(PayrollRun, slip.payroll_run_id) if getattr(slip, "payroll_run_id", None) else None
    if run is not None and run.tenant_id != tenant.id:
        run = None
    line = None
    if run is not None:
        line = (
            await db.execute(
                select(PayrollRunLine).where(
                    PayrollRunLine.tenant_id == tenant.id,
                    PayrollRunLine.payroll_run_id == run.id,
                    PayrollRunLine.employee_id == emp.id,
                ).limit(1)
            )
        ).scalar_one_or_none()
    body = generate_payslip_pdf(
        emp, run=run, line=line, payslip=slip, company_name=tenant.name or "Company"
    )
    return FastResponse(
        content=body,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="payslip-{payslip_id}.pdf"'},
    )


@ess_router.get("/my-requests")
async def ess_my_requests(
    limit: int = Query(50, ge=1, le=MAX_PAGE_SIZE),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_ess_access()),
):
    _ensure_tenant(user, tenant)
    emp = await load_linked_employee_for_ess(db, tenant=tenant, user=user)
    rows = await service.list_requests(
        db, tenant=tenant, user=user, employee_id=emp.id, view="mine", limit=limit, offset=0
    )
    # Also include requests entered by this user from ESS even if employee_id differs (NEW_EMPLOYEE N/A)
    return [await _out(db, tenant, user, r) for r in rows]


@ess_router.post("/submit-leave", status_code=status.HTTP_201_CREATED)
async def ess_submit_leave(
    body: EssLeaveSubmit,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_ess_access()),
):
    _ensure_tenant(user, tenant)
    emp = await load_linked_employee_for_ess(db, tenant=tenant, user=user)
    try:
        row, created = await service.create_draft(
            db,
            tenant=tenant,
            user=user,
            kind="LEAVE",
            request_id=body.request_id,
            employee_id=emp.id,
            payload={
                "leave_type_id": body.leave_type_id,
                "from_date": body.from_date,
                "to_date": body.to_date,
                "days_requested": body.days_requested,
                "reason": body.reason,
            },
            reason=body.reason or "ESS leave",
            source="ESS",
        )
        row = await service.submit(db, tenant=tenant, user=user, request_pk=row.id)
        await db.commit()
        await db.refresh(row)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    if not created:
        response.status_code = status.HTTP_200_OK
    return await _out(db, tenant, user, row)


@ess_router.post("/submit-correction", status_code=status.HTTP_201_CREATED)
async def ess_submit_correction(
    body: EssCorrectionSubmit,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_ess_access()),
):
    _ensure_tenant(user, tenant)
    emp = await load_linked_employee_for_ess(db, tenant=tenant, user=user)
    try:
        row, created = await service.create_draft(
            db,
            tenant=tenant,
            user=user,
            kind="CORRECTION",
            request_id=body.request_id,
            employee_id=emp.id,
            payload=body.payload,
            reason=body.reason,
            source="ESS",
        )
        row = await service.submit(db, tenant=tenant, user=user, request_pk=row.id)
        await db.commit()
        await db.refresh(row)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    if not created:
        response.status_code = status.HTTP_200_OK
    return await _out(db, tenant, user, row)


@ess_router.post("/submit-resignation", status_code=status.HTTP_201_CREATED)
async def ess_submit_resignation(
    body: EssResignationSubmit,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = Depends(require_ess_access()),
):
    _ensure_tenant(user, tenant)
    emp = await load_linked_employee_for_ess(db, tenant=tenant, user=user)
    try:
        row, created = await service.create_draft(
            db,
            tenant=tenant,
            user=user,
            kind="RESIGNATION",
            request_id=body.request_id,
            employee_id=emp.id,
            payload={
                "last_working_date": body.last_working_date,
                "effective_date": body.effective_date,
                "reason": body.reason,
            },
            reason=body.reason,
            source="ESS",
        )
        row = await service.submit(db, tenant=tenant, user=user, request_pk=row.id)
        await db.commit()
        await db.refresh(row)
    except Exception:
        await safe_async_session_rollback(db)
        raise
    if not created:
        response.status_code = status.HTTP_200_OK
    return await _out(db, tenant, user, row)
