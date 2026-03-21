from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, Query, status
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import (
    ManufacturingTnaPlan,
    ManufacturingTnaPlanTask,
    ManufacturingTnaTemplateTask,
    Order,
    OrderFollowupAction,
    Tenant,
    User,
)

router = APIRouter(prefix="/tna-unified", tags=["tna-unified"])

# Finding #3: cap in-memory fan-out before Python filters (merch join can be huge).
TNA_MERCH_FETCH_CAP = 8000
TNA_MFG_TASK_FETCH_CAP = 8000


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        from fastapi import HTTPException

        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


def _is_open_merch_status(status_value: str | None) -> bool:
    return (status_value or "").strip().lower() in {
        "pending",
        "in_progress",
        "submitted",
        "rejected",
        "resubmitted",
        "on_hold",
    }


def _is_open_mfg_status(status_value: str | None) -> bool:
    return (status_value or "").strip().lower() not in {"done", "cancelled"}


class UnifiedTnaActionOut(BaseModel):
    source_system: Literal["merch", "manufacturing"]
    source_action_id: int
    source_plan_id: int | None = None
    order_id: int | None
    order_code: str | None
    title: str
    phase: str | None
    department: str | None
    planned_date: date | None
    actual_date: date | None
    status: str
    assigned_to_id: int | None
    dependency_seq_no: int | None = None
    dependency_status: str | None = None
    dependency_ready: bool = True
    severity: str | None = None
    created_at: datetime
    updated_at: datetime


class UnifiedTnaSummaryOut(BaseModel):
    total_count: int
    open_count: int
    overdue_count: int
    completed_count: int
    merch_count: int
    manufacturing_count: int


@router.get("/actions", response_model=list[UnifiedTnaActionOut])
async def list_unified_actions(
    order_id: int | None = Query(default=None),
    status_filter: str | None = Query(default=None),
    source: Literal["all", "merch", "manufacturing"] = Query(default="all"),
    overdue_only: bool = Query(default=False),
    limit: int = Query(default=200, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    today = date.today()
    normalized_filter = (status_filter or "").strip().lower() or None
    rows: list[UnifiedTnaActionOut] = []

    if source in {"all", "merch"}:
        merch_stmt = (
            select(OrderFollowupAction, Order.order_code)
            .join(Order, OrderFollowupAction.order_id == Order.id)
            .where(
                OrderFollowupAction.tenant_id == tenant.id,
                Order.tenant_id == tenant.id,
            )
        )
        if order_id is not None:
            merch_stmt = merch_stmt.where(OrderFollowupAction.order_id == order_id)
        merch_result = await db.execute(
            merch_stmt.order_by(
                OrderFollowupAction.planned_date.asc().nullslast(), OrderFollowupAction.id.asc()
            ).limit(TNA_MERCH_FETCH_CAP)
        )
        for action, order_code in merch_result.all():
            action_status = (action.status or "").strip().lower()
            is_open = _is_open_merch_status(action_status)
            is_overdue = action.planned_date is not None and action.planned_date < today and is_open
            if normalized_filter and action_status != normalized_filter:
                continue
            if overdue_only and not is_overdue:
                continue
            rows.append(
                UnifiedTnaActionOut(
                    source_system="merch",
                    source_action_id=action.id,
                    order_id=action.order_id,
                    order_code=order_code,
                    title=action.title,
                    phase=action.phase,
                    department=None,
                    planned_date=action.planned_date,
                    actual_date=action.actual_completion_date or action.actual_submission_date,
                    status=action_status or "pending",
                    assigned_to_id=action.assigned_to_id,
                    severity=action.severity,
                    created_at=action.created_at,
                    updated_at=action.updated_at,
                )
            )

    if source in {"all", "manufacturing"}:
        plan_stmt = select(ManufacturingTnaPlan).where(ManufacturingTnaPlan.tenant_id == tenant.id)
        if order_id is not None:
            plan_stmt = plan_stmt.where(ManufacturingTnaPlan.order_id == order_id)
        plans = (await db.execute(plan_stmt)).scalars().all()
        if plans:
            plan_ids = [plan.id for plan in plans]
            plan_by_id = {plan.id: plan for plan in plans}
            tasks = (
                await db.execute(
                    select(ManufacturingTnaPlanTask)
                    .where(
                        ManufacturingTnaPlanTask.tenant_id == tenant.id,
                        ManufacturingTnaPlanTask.plan_id.in_(plan_ids),
                    )
                    .limit(TNA_MFG_TASK_FETCH_CAP)
                )
            ).scalars().all()
            template_task_ids = [t.template_task_id for t in tasks if t.template_task_id is not None]
            template_map: dict[int, ManufacturingTnaTemplateTask] = {}
            if template_task_ids:
                template_tasks = (
                    await db.execute(
                        select(ManufacturingTnaTemplateTask).where(
                            ManufacturingTnaTemplateTask.tenant_id == tenant.id,
                            ManufacturingTnaTemplateTask.id.in_(template_task_ids),
                        )
                    )
                ).scalars().all()
                template_map = {t.id: t for t in template_tasks}
            task_by_plan_seq: dict[tuple[int, int], ManufacturingTnaPlanTask] = {
                (task.plan_id, task.seq_no): task for task in tasks
            }
            order_ids = [plan.order_id for plan in plans if plan.order_id is not None]
            order_code_map: dict[int, str] = {}
            if order_ids:
                order_rows = (
                    await db.execute(
                        select(Order.id, Order.order_code).where(
                            Order.tenant_id == tenant.id,
                            Order.id.in_(order_ids),
                        )
                    )
                ).all()
                order_code_map = {oid: ocode for oid, ocode in order_rows}

            for task in tasks:
                task_status = (task.status or "").strip().lower()
                is_open = _is_open_mfg_status(task_status)
                is_overdue = task.planned_date is not None and task.planned_date < today and is_open
                if normalized_filter and task_status != normalized_filter:
                    continue
                if overdue_only and not is_overdue:
                    continue

                template_task = template_map.get(task.template_task_id) if task.template_task_id is not None else None
                depends_on_seq = template_task.depends_on_seq if template_task else None
                predecessor = (
                    task_by_plan_seq.get((task.plan_id, depends_on_seq))
                    if depends_on_seq is not None
                    else None
                )
                dependency_status = predecessor.status if predecessor is not None else None
                dependency_ready = (
                    depends_on_seq is None
                    or (predecessor is not None and (predecessor.status or "").strip().lower() == "done")
                )
                plan = plan_by_id.get(task.plan_id)
                linked_order_id = plan.order_id if plan is not None else None
                linked_order_code = order_code_map.get(linked_order_id) if linked_order_id is not None else None
                rows.append(
                    UnifiedTnaActionOut(
                        source_system="manufacturing",
                        source_action_id=task.id,
                        source_plan_id=task.plan_id,
                        order_id=linked_order_id,
                        order_code=linked_order_code,
                        title=task.task_name,
                        phase="manufacturing",
                        department=task.department,
                        planned_date=task.planned_date,
                        actual_date=task.actual_date,
                        status=task_status or "not_started",
                        assigned_to_id=task.owner_user_id,
                        dependency_seq_no=depends_on_seq,
                        dependency_status=dependency_status,
                        dependency_ready=dependency_ready,
                        created_at=task.created_at,
                        updated_at=task.updated_at,
                    )
                )

    rows.sort(
        key=lambda row: (
            row.planned_date or date.max,
            row.order_code or "",
            row.source_system,
            row.source_action_id,
        )
    )
    return rows[offset : offset + limit]


@router.get("/summary", response_model=UnifiedTnaSummaryOut)
async def get_unified_summary(
    order_id: int | None = Query(default=None),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    today = date.today()

    merch_base = OrderFollowupAction.tenant_id == tenant.id
    if order_id is not None:
        merch_base = and_(merch_base, OrderFollowupAction.order_id == order_id)

    merch_lv = func.lower(func.coalesce(OrderFollowupAction.status, ""))
    merch_open_statuses = (
        "pending",
        "in_progress",
        "submitted",
        "rejected",
        "resubmitted",
        "on_hold",
    )
    merch_completed_statuses = ("completed", "approved", "cancelled")

    merch_count = int(
        await db.scalar(select(func.count()).select_from(OrderFollowupAction).where(merch_base)) or 0
    )
    merch_open = int(
        await db.scalar(
            select(func.count()).select_from(OrderFollowupAction).where(
                merch_base,
                merch_lv.in_(merch_open_statuses),
            )
        )
        or 0
    )
    merch_overdue = int(
        await db.scalar(
            select(func.count()).select_from(OrderFollowupAction).where(
                merch_base,
                merch_lv.in_(merch_open_statuses),
                OrderFollowupAction.planned_date.isnot(None),
                OrderFollowupAction.planned_date < today,
            )
        )
        or 0
    )
    merch_completed = int(
        await db.scalar(
            select(func.count()).select_from(OrderFollowupAction).where(
                merch_base,
                merch_lv.in_(merch_completed_statuses),
            )
        )
        or 0
    )

    plan_base = ManufacturingTnaPlan.tenant_id == tenant.id
    if order_id is not None:
        plan_base = and_(plan_base, ManufacturingTnaPlan.order_id == order_id)
    plan_ids = list((await db.execute(select(ManufacturingTnaPlan.id).where(plan_base))).scalars().all())

    manufacturing_count = 0
    mfg_open = 0
    mfg_overdue = 0
    mfg_completed = 0
    if plan_ids:
        mfg_where = and_(
            ManufacturingTnaPlanTask.tenant_id == tenant.id,
            ManufacturingTnaPlanTask.plan_id.in_(plan_ids),
        )
        mv = func.lower(func.coalesce(ManufacturingTnaPlanTask.status, ""))
        manufacturing_count = int(
            await db.scalar(select(func.count()).select_from(ManufacturingTnaPlanTask).where(mfg_where)) or 0
        )
        mfg_open = int(
            await db.scalar(
                select(func.count()).select_from(ManufacturingTnaPlanTask).where(
                    mfg_where,
                    ~mv.in_(("done", "cancelled")),
                )
            )
            or 0
        )
        mfg_overdue = int(
            await db.scalar(
                select(func.count()).select_from(ManufacturingTnaPlanTask).where(
                    mfg_where,
                    ~mv.in_(("done", "cancelled")),
                    ManufacturingTnaPlanTask.planned_date.isnot(None),
                    ManufacturingTnaPlanTask.planned_date < today,
                )
            )
            or 0
        )
        mfg_completed = int(
            await db.scalar(
                select(func.count()).select_from(ManufacturingTnaPlanTask).where(
                    mfg_where,
                    mv.in_(("done", "cancelled")),
                )
            )
            or 0
        )

    return UnifiedTnaSummaryOut(
        total_count=merch_count + manufacturing_count,
        open_count=merch_open + mfg_open,
        overdue_count=merch_overdue + mfg_overdue,
        completed_count=merch_completed + mfg_completed,
        merch_count=merch_count,
        manufacturing_count=manufacturing_count,
    )
