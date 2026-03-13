from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Candidate,
    Department,
    Employee,
    Interview,
    JobRequisition,
    Offer,
    Role,
    Tenant,
    User,
)
from app.modules.hr_recruitment.schemas import (
    CandidateCreate,
    CandidateResponse,
    CandidateStageUpdate,
    InterviewCreate,
    InterviewResponse,
    InterviewStatusUpdate,
    OfferCreate,
    OfferResponse,
    OfferStatusUpdate,
    RequisitionCreate,
    RequisitionResponse,
    RequisitionStatusUpdate,
)

router = APIRouter(prefix="/hr/recruitment", tags=["hr-recruitment"])


def _ensure_user_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


async def _require_manager_or_admin(db: AsyncSession, user: User) -> None:
    role = await db.get(Role, user.role_id)
    role_name = (role.name if role else "").strip().lower()
    if role_name not in {"admin", "manager", "super_admin", "superadmin", "owner"}:
        raise HTTPException(status_code=403, detail="Only manager/admin can perform this action")


async def _get_employee_by_user(db: AsyncSession, tenant_id: int, user_id: int) -> Employee | None:
    result = await db.execute(
        select(Employee).where(Employee.tenant_id == tenant_id, Employee.user_id == user_id)
    )
    return result.scalar_one_or_none()


async def _get_requisition_or_404(db: AsyncSession, tenant_id: int, requisition_id: int) -> JobRequisition:
    row = await db.get(JobRequisition, requisition_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Requisition not found")
    return row


async def _get_candidate_or_404(db: AsyncSession, tenant_id: int, candidate_id: int) -> Candidate:
    row = await db.get(Candidate, candidate_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return row


async def _get_interview_or_404(db: AsyncSession, tenant_id: int, interview_id: int) -> Interview:
    row = await db.get(Interview, interview_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interview not found")
    return row


async def _get_offer_or_404(db: AsyncSession, tenant_id: int, offer_id: int) -> Offer:
    row = await db.get(Offer, offer_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    return row


def _requisition_to_response(row: JobRequisition) -> RequisitionResponse:
    return RequisitionResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        title=row.title,
        department_id=row.department_id,
        requested_by_employee_id=row.requested_by_employee_id,
        hiring_manager_employee_id=row.hiring_manager_employee_id,
        vacancy_count=row.vacancy_count,
        employment_type=row.employment_type,
        location=row.location,
        budget_min=float(row.budget_min) if row.budget_min is not None else None,
        budget_max=float(row.budget_max) if row.budget_max is not None else None,
        description=row.description,
        status=row.status,
        opened_at=row.opened_at,
        closed_at=row.closed_at,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _candidate_to_response(row: Candidate) -> CandidateResponse:
    return CandidateResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        requisition_id=row.requisition_id,
        full_name=row.full_name,
        email=row.email,
        phone=row.phone,
        source=row.source,
        current_company=row.current_company,
        current_designation=row.current_designation,
        expected_salary=float(row.expected_salary) if row.expected_salary is not None else None,
        resume_url=row.resume_url,
        stage=row.stage,
        status=row.status,
        assigned_recruiter_user_id=row.assigned_recruiter_user_id,
        notes=row.notes,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _interview_to_response(row: Interview) -> InterviewResponse:
    return InterviewResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        candidate_id=row.candidate_id,
        requisition_id=row.requisition_id,
        interviewer_employee_id=row.interviewer_employee_id,
        interviewer_user_id=row.interviewer_user_id,
        scheduled_at=row.scheduled_at,
        mode=row.mode,
        location=row.location,
        feedback=row.feedback,
        rating=float(row.rating) if row.rating is not None else None,
        status=row.status,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _offer_to_response(row: Offer) -> OfferResponse:
    return OfferResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        candidate_id=row.candidate_id,
        requisition_id=row.requisition_id,
        offered_role=row.offered_role,
        proposed_salary=float(row.proposed_salary) if row.proposed_salary is not None else None,
        currency=row.currency,
        joining_date=row.joining_date,
        notes=row.notes,
        status=row.status,
        sent_at=row.sent_at,
        responded_at=row.responded_at,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/requisitions", response_model=list[RequisitionResponse])
async def list_requisitions(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(JobRequisition).where(JobRequisition.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(JobRequisition.status == status_filter.strip().lower())
    stmt = stmt.order_by(JobRequisition.created_at.desc())
    result = await db.execute(stmt)
    return [_requisition_to_response(row) for row in result.scalars().all()]


@router.post("/requisitions", response_model=RequisitionResponse, status_code=status.HTTP_201_CREATED)
async def create_requisition(
    body: RequisitionCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    requester = await _get_employee_by_user(db, tenant.id, user.id)
    if body.department_id is not None:
        department = await db.get(Department, body.department_id)
        if not department or department.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Department not found")
    if body.hiring_manager_employee_id is not None:
        manager = await db.get(Employee, body.hiring_manager_employee_id)
        if not manager or manager.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Hiring manager employee not found")
    row = JobRequisition(
        tenant_id=tenant.id,
        title=body.title.strip(),
        department_id=body.department_id,
        requested_by_employee_id=requester.id if requester else None,
        hiring_manager_employee_id=body.hiring_manager_employee_id,
        vacancy_count=body.vacancy_count,
        employment_type=body.employment_type.strip() if body.employment_type else None,
        location=body.location.strip() if body.location else None,
        budget_min=body.budget_min,
        budget_max=body.budget_max,
        description=body.description.strip() if body.description else None,
        status="draft",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _requisition_to_response(row)


@router.post("/requisitions/{requisition_id}/status", response_model=RequisitionResponse)
async def update_requisition_status(
    requisition_id: int,
    body: RequisitionStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await _get_requisition_or_404(db, tenant.id, requisition_id)
    next_status = body.status.strip().lower()
    row.status = next_status
    if next_status == "open" and row.opened_at is None:
        row.opened_at = date.today()
    if next_status in {"closed", "filled", "cancelled"}:
        row.closed_at = date.today()
    await db.commit()
    await db.refresh(row)
    return _requisition_to_response(row)


@router.get("/candidates", response_model=list[CandidateResponse])
async def list_candidates(
    requisition_id: int | None = Query(default=None),
    stage: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(Candidate).where(Candidate.tenant_id == tenant.id)
    if requisition_id is not None:
        stmt = stmt.where(Candidate.requisition_id == requisition_id)
    if stage and stage.strip():
        stmt = stmt.where(Candidate.stage == stage.strip().lower())
    stmt = stmt.order_by(Candidate.created_at.desc())
    result = await db.execute(stmt)
    return [_candidate_to_response(row) for row in result.scalars().all()]


@router.post("/candidates", response_model=CandidateResponse, status_code=status.HTTP_201_CREATED)
async def create_candidate(
    body: CandidateCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    if body.requisition_id is not None:
        await _get_requisition_or_404(db, tenant.id, body.requisition_id)
    row = Candidate(
        tenant_id=tenant.id,
        requisition_id=body.requisition_id,
        full_name=body.full_name.strip(),
        email=body.email.strip() if body.email else None,
        phone=body.phone.strip() if body.phone else None,
        source=body.source.strip() if body.source else None,
        current_company=body.current_company.strip() if body.current_company else None,
        current_designation=body.current_designation.strip() if body.current_designation else None,
        expected_salary=body.expected_salary,
        resume_url=body.resume_url.strip() if body.resume_url else None,
        stage="applied",
        status="active",
        assigned_recruiter_user_id=user.id,
        notes=body.notes.strip() if body.notes else None,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _candidate_to_response(row)


@router.post("/candidates/{candidate_id}/stage", response_model=CandidateResponse)
async def update_candidate_stage(
    candidate_id: int,
    body: CandidateStageUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await _get_candidate_or_404(db, tenant.id, candidate_id)
    row.stage = body.stage.strip().lower()
    if body.status is not None:
        row.status = body.status.strip().lower()
    await db.commit()
    await db.refresh(row)
    return _candidate_to_response(row)


@router.get("/interviews", response_model=list[InterviewResponse])
async def list_interviews(
    candidate_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(Interview).where(Interview.tenant_id == tenant.id)
    if candidate_id is not None:
        stmt = stmt.where(Interview.candidate_id == candidate_id)
    stmt = stmt.order_by(Interview.scheduled_at.desc())
    result = await db.execute(stmt)
    return [_interview_to_response(row) for row in result.scalars().all()]


@router.post("/interviews", response_model=InterviewResponse, status_code=status.HTTP_201_CREATED)
async def create_interview(
    body: InterviewCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    await _get_candidate_or_404(db, tenant.id, body.candidate_id)
    if body.requisition_id is not None:
        await _get_requisition_or_404(db, tenant.id, body.requisition_id)
    if body.interviewer_employee_id is not None:
        interviewer = await db.get(Employee, body.interviewer_employee_id)
        if not interviewer or interviewer.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Interviewer employee not found")
    row = Interview(
        tenant_id=tenant.id,
        candidate_id=body.candidate_id,
        requisition_id=body.requisition_id,
        interviewer_employee_id=body.interviewer_employee_id,
        interviewer_user_id=user.id,
        scheduled_at=body.scheduled_at,
        mode=body.mode.strip() if body.mode else None,
        location=body.location.strip() if body.location else None,
        status="scheduled",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _interview_to_response(row)


@router.post("/interviews/{interview_id}/status", response_model=InterviewResponse)
async def update_interview_status(
    interview_id: int,
    body: InterviewStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    row = await _get_interview_or_404(db, tenant.id, interview_id)
    is_interviewer = row.interviewer_user_id == user.id
    if not is_interviewer:
        await _require_manager_or_admin(db, user)
    row.status = body.status.strip().lower()
    if body.feedback is not None:
        row.feedback = body.feedback.strip() if body.feedback else None
    if body.rating is not None:
        row.rating = body.rating
    await db.commit()
    await db.refresh(row)
    return _interview_to_response(row)


@router.get("/offers", response_model=list[OfferResponse])
async def list_offers(
    candidate_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(Offer).where(Offer.tenant_id == tenant.id)
    if candidate_id is not None:
        stmt = stmt.where(Offer.candidate_id == candidate_id)
    stmt = stmt.order_by(Offer.created_at.desc())
    result = await db.execute(stmt)
    return [_offer_to_response(row) for row in result.scalars().all()]


@router.post("/offers", response_model=OfferResponse, status_code=status.HTTP_201_CREATED)
async def create_offer(
    body: OfferCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    await _get_candidate_or_404(db, tenant.id, body.candidate_id)
    if body.requisition_id is not None:
        await _get_requisition_or_404(db, tenant.id, body.requisition_id)
    row = Offer(
        tenant_id=tenant.id,
        candidate_id=body.candidate_id,
        requisition_id=body.requisition_id,
        offered_role=body.offered_role.strip(),
        proposed_salary=body.proposed_salary,
        currency=body.currency.strip().upper(),
        joining_date=body.joining_date,
        notes=body.notes.strip() if body.notes else None,
        status="draft",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _offer_to_response(row)


@router.post("/offers/{offer_id}/status", response_model=OfferResponse)
async def update_offer_status(
    offer_id: int,
    body: OfferStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await _get_offer_or_404(db, tenant.id, offer_id)
    next_status = body.status.strip().lower()
    row.status = next_status
    if next_status == "sent":
        row.sent_at = datetime.utcnow()
    if next_status in {"accepted", "rejected", "withdrawn"}:
        row.responded_at = datetime.utcnow()
    await db.commit()
    await db.refresh(row)
    return _offer_to_response(row)
