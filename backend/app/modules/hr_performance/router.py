from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    Employee,
    PerformanceCycle,
    PerformanceGoal,
    PerformanceReview,
    Role,
    Tenant,
    User,
)
from app.modules.hr_performance.schemas import (
    PerformanceCycleCreate,
    PerformanceCycleResponse,
    PerformanceCycleStatusUpdate,
    PerformanceGoalCreate,
    PerformanceGoalResponse,
    PerformanceGoalSubmit,
    PerformanceReviewCreate,
    PerformanceReviewResponse,
    PerformanceReviewSubmit,
)

router = APIRouter(prefix="/hr/performance", tags=["hr-performance"])


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


async def _get_cycle_or_404(db: AsyncSession, tenant_id: int, cycle_id: int) -> PerformanceCycle:
    row = await db.get(PerformanceCycle, cycle_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Performance cycle not found")
    return row


async def _get_goal_or_404(db: AsyncSession, tenant_id: int, goal_id: int) -> PerformanceGoal:
    row = await db.get(PerformanceGoal, goal_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Performance goal not found")
    return row


async def _get_review_or_404(db: AsyncSession, tenant_id: int, review_id: int) -> PerformanceReview:
    row = await db.get(PerformanceReview, review_id)
    if not row or row.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Performance review not found")
    return row


def _cycle_to_response(row: PerformanceCycle) -> PerformanceCycleResponse:
    return PerformanceCycleResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        name=row.name,
        description=row.description,
        start_date=row.start_date,
        end_date=row.end_date,
        status=row.status,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _goal_to_response(row: PerformanceGoal) -> PerformanceGoalResponse:
    return PerformanceGoalResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        cycle_id=row.cycle_id,
        employee_id=row.employee_id,
        title=row.title,
        description=row.description,
        weight=float(row.weight) if row.weight is not None else None,
        target_value=row.target_value,
        status=row.status,
        manager_comment=row.manager_comment,
        submitted_at=row.submitted_at,
        created_by_user_id=row.created_by_user_id,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


def _review_to_response(row: PerformanceReview) -> PerformanceReviewResponse:
    return PerformanceReviewResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        cycle_id=row.cycle_id,
        employee_id=row.employee_id,
        reviewer_employee_id=row.reviewer_employee_id,
        reviewer_user_id=row.reviewer_user_id,
        review_type=row.review_type,
        self_rating=float(row.self_rating) if row.self_rating is not None else None,
        manager_rating=float(row.manager_rating) if row.manager_rating is not None else None,
        final_rating=float(row.final_rating) if row.final_rating is not None else None,
        employee_comment=row.employee_comment,
        manager_comment=row.manager_comment,
        status=row.status,
        submitted_at=row.submitted_at,
        created_at=row.created_at.isoformat(),
        updated_at=row.updated_at.isoformat(),
    )


@router.get("/cycles", response_model=list[PerformanceCycleResponse])
async def list_cycles(
    status_filter: str | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    stmt = select(PerformanceCycle).where(PerformanceCycle.tenant_id == tenant.id)
    if status_filter and status_filter.strip():
        stmt = stmt.where(PerformanceCycle.status == status_filter.strip().lower())
    stmt = stmt.order_by(PerformanceCycle.start_date.desc())
    result = await db.execute(stmt)
    return [_cycle_to_response(row) for row in result.scalars().all()]


@router.post("/cycles", response_model=PerformanceCycleResponse, status_code=status.HTTP_201_CREATED)
async def create_cycle(
    body: PerformanceCycleCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    if body.end_date < body.start_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date cannot be earlier than start_date")
    row = PerformanceCycle(
        tenant_id=tenant.id,
        name=body.name.strip(),
        description=body.description.strip() if body.description else None,
        start_date=body.start_date,
        end_date=body.end_date,
        status="draft",
        created_by_user_id=user.id,
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cycle already exists for this start date")
    await db.refresh(row)
    return _cycle_to_response(row)


@router.post("/cycles/{cycle_id}/status", response_model=PerformanceCycleResponse)
async def update_cycle_status(
    cycle_id: int,
    body: PerformanceCycleStatusUpdate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    row = await _get_cycle_or_404(db, tenant.id, cycle_id)
    row.status = body.status.strip().lower()
    await db.commit()
    await db.refresh(row)
    return _cycle_to_response(row)


@router.get("/goals", response_model=list[PerformanceGoalResponse])
async def list_goals(
    cycle_id: int | None = Query(default=None),
    employee_id: int | None = Query(default=None),
    my_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    my_employee = await _get_employee_by_user(db, tenant.id, user.id)
    stmt = select(PerformanceGoal).where(PerformanceGoal.tenant_id == tenant.id)
    if cycle_id is not None:
        stmt = stmt.where(PerformanceGoal.cycle_id == cycle_id)
    if employee_id is not None:
        stmt = stmt.where(PerformanceGoal.employee_id == employee_id)
    if my_only:
        if not my_employee:
            return []
        stmt = stmt.where(PerformanceGoal.employee_id == my_employee.id)
    stmt = stmt.order_by(PerformanceGoal.created_at.desc())
    result = await db.execute(stmt)
    return [_goal_to_response(row) for row in result.scalars().all()]


@router.post("/goals", response_model=PerformanceGoalResponse, status_code=status.HTTP_201_CREATED)
async def create_goal(
    body: PerformanceGoalCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    cycle = await _get_cycle_or_404(db, tenant.id, body.cycle_id)
    employee = await db.get(Employee, body.employee_id)
    if not employee or employee.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    my_employee = await _get_employee_by_user(db, tenant.id, user.id)
    is_self_goal = my_employee is not None and my_employee.id == body.employee_id
    if not is_self_goal:
        await _require_manager_or_admin(db, user)
    if cycle.status == "closed":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot add goals to a closed cycle")
    row = PerformanceGoal(
        tenant_id=tenant.id,
        cycle_id=body.cycle_id,
        employee_id=body.employee_id,
        title=body.title.strip(),
        description=body.description.strip() if body.description else None,
        weight=body.weight,
        target_value=body.target_value.strip() if body.target_value else None,
        status="draft",
        created_by_user_id=user.id,
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _goal_to_response(row)


@router.post("/goals/{goal_id}/submit", response_model=PerformanceGoalResponse)
async def submit_goal(
    goal_id: int,
    body: PerformanceGoalSubmit,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    goal = await _get_goal_or_404(db, tenant.id, goal_id)
    my_employee = await _get_employee_by_user(db, tenant.id, user.id)
    is_owner = my_employee is not None and my_employee.id == goal.employee_id
    if not is_owner:
        await _require_manager_or_admin(db, user)
    goal.status = "submitted" if is_owner else "approved"
    goal.submitted_at = datetime.utcnow()
    if body.manager_comment is not None:
        goal.manager_comment = body.manager_comment.strip() if body.manager_comment else None
    await db.commit()
    await db.refresh(goal)
    return _goal_to_response(goal)


@router.get("/reviews", response_model=list[PerformanceReviewResponse])
async def list_reviews(
    cycle_id: int | None = Query(default=None),
    employee_id: int | None = Query(default=None),
    my_only: bool = Query(default=False),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    my_employee = await _get_employee_by_user(db, tenant.id, user.id)
    stmt = select(PerformanceReview).where(PerformanceReview.tenant_id == tenant.id)
    if cycle_id is not None:
        stmt = stmt.where(PerformanceReview.cycle_id == cycle_id)
    if employee_id is not None:
        stmt = stmt.where(PerformanceReview.employee_id == employee_id)
    if my_only:
        if not my_employee:
            return []
        stmt = stmt.where(PerformanceReview.employee_id == my_employee.id)
    stmt = stmt.order_by(PerformanceReview.created_at.desc())
    result = await db.execute(stmt)
    return [_review_to_response(row) for row in result.scalars().all()]


@router.post("/reviews", response_model=PerformanceReviewResponse, status_code=status.HTTP_201_CREATED)
async def create_review(
    body: PerformanceReviewCreate,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    await _require_manager_or_admin(db, user)
    await _get_cycle_or_404(db, tenant.id, body.cycle_id)
    employee = await db.get(Employee, body.employee_id)
    if not employee or employee.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Employee not found")
    if body.reviewer_employee_id is not None:
        reviewer = await db.get(Employee, body.reviewer_employee_id)
        if not reviewer or reviewer.tenant_id != tenant.id:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reviewer employee not found")
    row = PerformanceReview(
        tenant_id=tenant.id,
        cycle_id=body.cycle_id,
        employee_id=body.employee_id,
        reviewer_employee_id=body.reviewer_employee_id,
        reviewer_user_id=user.id,
        review_type=body.review_type.strip().lower(),
        self_rating=body.self_rating,
        manager_rating=body.manager_rating,
        final_rating=body.final_rating,
        employee_comment=body.employee_comment.strip() if body.employee_comment else None,
        manager_comment=body.manager_comment.strip() if body.manager_comment else None,
        status="draft",
    )
    db.add(row)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Review already exists for this type")
    await db.refresh(row)
    return _review_to_response(row)


@router.post("/reviews/{review_id}/submit", response_model=PerformanceReviewResponse)
async def submit_review(
    review_id: int,
    body: PerformanceReviewSubmit,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    review = await _get_review_or_404(db, tenant.id, review_id)
    my_employee = await _get_employee_by_user(db, tenant.id, user.id)
    is_assigned_reviewer = review.reviewer_user_id == user.id or (
        my_employee is not None and review.reviewer_employee_id == my_employee.id
    )
    if not is_assigned_reviewer:
        await _require_manager_or_admin(db, user)
    if body.manager_rating is not None:
        review.manager_rating = body.manager_rating
    if body.final_rating is not None:
        review.final_rating = body.final_rating
    if body.manager_comment is not None:
        review.manager_comment = body.manager_comment.strip() if body.manager_comment else None
    review.status = "submitted"
    review.submitted_at = datetime.utcnow()
    await db.commit()
    await db.refresh(review)
    return _review_to_response(review)


@router.get("/dashboard")
async def performance_dashboard(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_user_tenant(user, tenant)
    total_goals = (
        await db.execute(select(func.count()).select_from(PerformanceGoal).where(PerformanceGoal.tenant_id == tenant.id))
    ).scalar() or 0
    completed_goals = (
        await db.execute(
            select(func.count())
            .select_from(PerformanceGoal)
            .where(PerformanceGoal.tenant_id == tenant.id, PerformanceGoal.status.in_(["submitted", "approved", "closed"]))
        )
    ).scalar() or 0
    pending_reviews = (
        await db.execute(
            select(func.count())
            .select_from(PerformanceReview)
            .where(PerformanceReview.tenant_id == tenant.id, PerformanceReview.status.in_(["draft", "pending"]))
        )
    ).scalar() or 0
    avg_rating = (
        await db.execute(
            select(func.avg(PerformanceReview.final_rating)).where(
                PerformanceReview.tenant_id == tenant.id,
                PerformanceReview.final_rating.is_not(None),
            )
        )
    ).scalar()
    return {
        "total_goals": int(total_goals),
        "completed_goals": int(completed_goals),
        "pending_reviews": int(pending_reviews),
        "avg_rating": float(avg_rating or 0.0),
    }
