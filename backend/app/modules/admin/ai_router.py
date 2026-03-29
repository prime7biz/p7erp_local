"""Platform admin: AI usage, budgets, kill switch."""

from __future__ import annotations

import csv
import io
from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import AiUsageLog, PlatformSettings, Tenant, TenantAiBudget
from app.models.ai_tool import (
    AiAuditLog,
    AiEmbeddingChunk,
    AiFeedback,
    AiForecastRun,
    AiIngestionJob,
    AiPermissionPolicy,
    AiSystemTask,
    AiTaskPolicy,
    AiToolInvocation,
)
from app.modules.ai_tool import repository as ai_repository
from app.modules.ai_tool.retrieval.ingestion_jobs import run_full_reindex_tracked
from app.modules.ai_tool.schemas import (
    AiAdminFeedbackReviewRequest,
    AiIngestionJobResponse,
    AiPermissionPolicyAdminCreateRequest,
    AiPermissionPolicyResponse,
    AiTaskPolicyAdminCreateRequest,
    AiTaskPolicyResponse,
)
from app.modules.admin.auth import AdminContext, any_admin, log_admin_action, super_only

router = APIRouter(prefix="/ai", tags=["platform-admin-ai"])


@router.get("/usage")
async def ai_usage_summary(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    tenant_id: int | None = None,
    limit: int = Query(200, ge=1, le=2000),
):
    q = select(AiUsageLog).order_by(AiUsageLog.id.desc()).limit(limit)
    if tenant_id is not None:
        q = q.where(AiUsageLog.tenant_id == tenant_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "user_id": r.user_id,
                "model": r.model,
                "feature": r.feature,
                "total_tokens": r.total_tokens,
                "estimated_cost_usd": float(r.estimated_cost_usd) if r.estimated_cost_usd else None,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.get("/usage/{tid}")
async def ai_usage_tenant(
    tid: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
    limit: int = Query(500, ge=1, le=2000),
):
    q = (
        select(AiUsageLog)
        .where(AiUsageLog.tenant_id == tid)
        .order_by(AiUsageLog.id.desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    return {"tenant_id": tid, "items": [{"id": r.id, "feature": r.feature, "total_tokens": r.total_tokens} for r in rows]}


@router.get("/usage/export")
async def export_usage_csv(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    q = select(AiUsageLog).order_by(AiUsageLog.id.desc()).limit(10000)
    rows = (await db.execute(q)).scalars().all()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "tenant_id", "feature", "model", "total_tokens", "cost_usd", "created_at"])
    for r in rows:
        w.writerow(
            [
                r.id,
                r.tenant_id,
                r.feature or "",
                r.model or "",
                r.total_tokens or "",
                float(r.estimated_cost_usd) if r.estimated_cost_usd else "",
                r.created_at.isoformat() if r.created_at else "",
            ]
        )
    return Response(content=buf.getvalue(), media_type="text/csv")


@router.get("/budgets")
async def list_budgets(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    r = await db.execute(select(TenantAiBudget))
    rows = r.scalars().all()
    return {
        "items": [
            {
                "tenant_id": b.tenant_id,
                "monthly_token_limit": b.monthly_token_limit,
                "monthly_cost_limit_usd": float(b.monthly_cost_limit_usd),
                "current_month_tokens": b.current_month_tokens,
                "current_month_cost_usd": float(b.current_month_cost_usd),
                "is_throttled": b.is_throttled,
                "reset_day": b.reset_day,
            }
            for b in rows
        ]
    }


@router.put("/budgets/{tenant_id}")
async def put_budget(
    tenant_id: int,
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    t = await db.get(Tenant, tenant_id)
    if not t:
        raise HTTPException(status_code=404)
    b = await db.get(TenantAiBudget, tenant_id)
    if not b:
        b = TenantAiBudget(tenant_id=tenant_id)
        db.add(b)
        await db.flush()
    if "monthly_token_limit" in body:
        b.monthly_token_limit = int(body["monthly_token_limit"])
    if "monthly_cost_limit_usd" in body:
        b.monthly_cost_limit_usd = Decimal(str(body["monthly_cost_limit_usd"]))
    if "reset_day" in body:
        b.reset_day = int(body["reset_day"])
    if "alert_threshold_pct" in body:
        b.alert_threshold_pct = int(body["alert_threshold_pct"])
    b.is_throttled = False
    b.throttled_at = None
    await db.commit()
    return {"ok": True}


@router.post("/budgets/{tenant_id}/reset")
async def reset_budget(
    tenant_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    b = await db.get(TenantAiBudget, tenant_id)
    if not b:
        b = TenantAiBudget(tenant_id=tenant_id)
        db.add(b)
    b.current_month_tokens = 0
    b.current_month_cost_usd = Decimal("0")
    b.is_throttled = False
    b.throttled_at = None
    await db.commit()
    return {"ok": True}


@router.post("/kill-switch")
async def kill_switch(
    body: dict,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    on = bool(body.get("enabled", True))
    row = await db.get(PlatformSettings, 1)
    if not row:
        row = PlatformSettings(id=1, gemini_kill_switch=on)
        db.add(row)
    else:
        row.gemini_kill_switch = on
    row.updated_at = datetime.utcnow()
    await log_admin_action(db, admin_id=ctx.admin.id, action="GEMINI_KILL_SWITCH", resource="platform", details=str(on))
    await db.commit()
    return {"gemini_kill_switch": on}


@router.get("/costs")
async def costs_report(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(any_admin),
):
    r = await db.execute(
        select(
            AiUsageLog.tenant_id,
            func.sum(AiUsageLog.estimated_cost_usd),
            func.count(AiUsageLog.id),
        ).group_by(AiUsageLog.tenant_id)
    )
    rows = r.all()
    return {
        "by_tenant": [
            {"tenant_id": tid, "total_cost_usd": float(tc or 0), "calls": int(cnt or 0)}
            for tid, tc, cnt in rows
        ]
    }


# --- Hybrid RAG / AI governance (super admin) ---


@router.get("/usage-by-tenant")
async def ai_usage_by_tenant(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    limit: int = Query(200, ge=1, le=2000),
):
    """Aggregate AI audit activity: requests, tokens, tool calls (from audit JSON)."""
    q = (
        select(
            AiAuditLog.tenant_id,
            func.count(AiAuditLog.id),
            func.coalesce(func.sum(AiAuditLog.total_tokens), 0),
        )
        .group_by(AiAuditLog.tenant_id)
        .order_by(func.count(AiAuditLog.id).desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return {
        "items": [
            {
                "tenant_id": tid,
                "audit_events": int(ev or 0),
                "total_tokens_logged": int(tok or 0),
            }
            for tid, ev, tok in rows
        ]
    }


@router.get("/cost-by-tenant")
async def ai_cost_by_tenant(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    r = await db.execute(
        select(
            AiAuditLog.tenant_id,
            func.coalesce(func.sum(AiAuditLog.cost_estimate_usd), 0),
            func.count(AiAuditLog.id),
        ).group_by(AiAuditLog.tenant_id)
    )
    rows = r.all()
    return {
        "items": [
            {
                "tenant_id": tid,
                "estimated_cost_usd": float(cost or 0),
                "events": int(cnt or 0),
            }
            for tid, cost, cnt in rows
        ]
    }


@router.get("/top-modules")
async def ai_top_modules(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    limit: int = Query(30, ge=1, le=200),
):
    q = (
        select(AiAuditLog.resource, func.count(AiAuditLog.id))
        .where(AiAuditLog.resource.isnot(None))
        .group_by(AiAuditLog.resource)
        .order_by(func.count(AiAuditLog.id).desc())
        .limit(limit)
    )
    rows = (await db.execute(q)).all()
    return {"items": [{"resource": res, "events": int(c or 0)} for res, c in rows]}


@router.get("/tool-history")
async def ai_tool_history(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    limit: int = Query(100, ge=1, le=2000),
):
    q = select(AiToolInvocation).order_by(AiToolInvocation.id.desc()).limit(limit)
    if tenant_id is not None:
        q = q.where(AiToolInvocation.tenant_id == tenant_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "tool_name": r.tool_name,
                "status": r.status,
                "latency_ms": r.latency_ms,
                "started_at": r.started_at,
                "finished_at": r.finished_at,
            }
            for r in rows
        ]
    }


@router.get("/blocked-requests")
async def ai_blocked_requests(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    limit: int = Query(100, ge=1, le=2000),
):
    q = (
        select(AiAuditLog)
        .where(AiAuditLog.action.like("%BLOCKED%"))
        .order_by(AiAuditLog.id.desc())
        .limit(limit)
    )
    if tenant_id is not None:
        q = q.where(AiAuditLog.tenant_id == tenant_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "action": r.action,
                "severity": r.severity,
                "resource": r.resource,
                "details": r.details,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.get("/approval-queue")
async def ai_approval_queue(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    limit: int = Query(200, ge=1, le=2000),
):
    q = (
        select(AiSystemTask)
        .where(
            AiSystemTask.status == "pending_approval",
            AiSystemTask.requires_approval.is_(True),
        )
        .order_by(AiSystemTask.created_at.desc())
        .limit(limit)
    )
    if tenant_id is not None:
        q = q.where(AiSystemTask.tenant_id == tenant_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "task_code": r.task_code,
                "task_type": r.task_type,
                "task_category": r.task_category,
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.get("/task-stats")
async def ai_task_stats(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    q = select(AiSystemTask.status, func.count(AiSystemTask.id)).group_by(AiSystemTask.status)
    rows = (await db.execute(q)).all()
    return {"by_status": {status: int(c or 0) for status, c in rows}}


@router.get("/forecast-history")
async def ai_forecast_history(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    limit: int = Query(200, ge=1, le=2000),
):
    q = select(AiForecastRun).order_by(AiForecastRun.id.desc()).limit(limit)
    if tenant_id is not None:
        q = q.where(AiForecastRun.tenant_id == tenant_id)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "forecast_code": r.forecast_code,
                "status": r.status,
                "model_type": getattr(r, "model_type", None),
                "created_at": r.created_at,
            }
            for r in rows
        ]
    }


@router.get("/vector-health")
async def ai_vector_health(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    total = await db.scalar(select(func.count()).select_from(AiEmbeddingChunk))
    stale = await db.scalar(select(func.count()).select_from(AiEmbeddingChunk).where(AiEmbeddingChunk.is_stale.is_(True)))
    by_tenant = (
        await db.execute(
            select(
                AiEmbeddingChunk.tenant_id,
                func.count(AiEmbeddingChunk.id),
                func.sum(case((AiEmbeddingChunk.is_stale.is_(True), 1), else_=0)),
            ).group_by(AiEmbeddingChunk.tenant_id)
        )
    ).all()
    recent_jobs = (
        await db.execute(select(AiIngestionJob).order_by(AiIngestionJob.id.desc()).limit(30))
    ).scalars().all()
    return {
        "total_chunks": int(total or 0),
        "stale_chunks": int(stale or 0),
        "by_tenant": [
            {
                "tenant_id": tid,
                "chunks": int(c or 0),
                "stale": int(s or 0),
            }
            for tid, c, s in by_tenant
        ],
        "recent_ingestion_jobs": [
            {
                "id": j.id,
                "tenant_id": j.tenant_id,
                "source_type": j.source_type,
                "status": j.status,
                "trigger": j.trigger,
                "chunks_processed": j.chunks_processed,
                "chunks_skipped": j.chunks_skipped,
                "error_text": j.error_text,
                "created_at": j.created_at,
                "completed_at": j.completed_at,
            }
            for j in recent_jobs
        ],
    }


@router.get("/feedback")
async def admin_ai_feedback_list(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    rating: int | None = Query(default=None, ge=-1, le=1),
    flagged_only: bool = False,
    limit: int = Query(200, ge=1, le=2000),
):
    q = select(AiFeedback).order_by(AiFeedback.created_at.desc()).limit(limit)
    if tenant_id is not None:
        q = q.where(AiFeedback.tenant_id == tenant_id)
    if flagged_only:
        q = q.where(AiFeedback.flagged_for_review.is_(True))
    if rating is not None:
        q = q.where(AiFeedback.rating == rating)
    rows = (await db.execute(q)).scalars().all()
    return {
        "items": [
            {
                "id": r.id,
                "tenant_id": r.tenant_id,
                "user_id": r.user_id,
                "message_id": r.message_id,
                "trace_id": r.trace_id,
                "rating": r.rating,
                "feedback_category": r.feedback_category,
                "flagged_for_review": r.flagged_for_review,
                "correction_text": r.correction_text,
                "detected_intent": r.detected_intent,
                "route_used": r.route_used,
                "tools_used": r.tools_used,
                "created_at": r.created_at,
                "reviewed_at": r.reviewed_at,
            }
            for r in rows
        ]
    }


@router.post("/feedback/{feedback_id}/review")
async def admin_ai_feedback_review(
    feedback_id: int,
    body: AiAdminFeedbackReviewRequest,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    row = await ai_repository.update_ai_feedback_admin_review(
        db,
        feedback_id=feedback_id,
        admin_id=ctx.admin.id,
        admin_notes=body.admin_notes,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Feedback not found")
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="AI_FEEDBACK_REVIEWED",
        resource=f"ai_feedback:{feedback_id}",
        details=body.admin_notes or "",
    )
    await db.commit()
    return {"ok": True, "id": row.id}


@router.get("/permission-policies", response_model=list[AiPermissionPolicyResponse])
async def admin_list_ai_permission_policies(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int = Query(..., ge=1),
    limit: int = Query(200, ge=1, le=500),
):
    rows = await ai_repository.list_ai_permission_policies(db, tenant_id=tenant_id, limit=limit)
    return [AiPermissionPolicyResponse.model_validate(r) for r in rows]


@router.post("/permission-policies", response_model=AiPermissionPolicyResponse, status_code=201)
async def admin_create_ai_permission_policy(
    body: AiPermissionPolicyAdminCreateRequest,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    row = await ai_repository.create_ai_permission_policy(
        db,
        tenant_id=body.tenant_id,
        role_id=body.role_id,
        module=body.module,
        tool_name=body.tool_name,
        safety_class_allowed=body.safety_class_allowed,
        action=body.action,
        priority=body.priority,
        is_active=body.is_active,
    )
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="AI_PERMISSION_POLICY_CREATE",
        resource=f"tenant:{body.tenant_id}",
        details=f"{body.module}/{body.tool_name}",
    )
    await db.commit()
    return AiPermissionPolicyResponse.model_validate(row)


@router.delete("/permission-policies/{policy_id}")
async def admin_delete_ai_permission_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    row = await db.get(AiPermissionPolicy, policy_id)
    if not row:
        raise HTTPException(status_code=404, detail="Policy not found")
    await db.delete(row)
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="AI_PERMISSION_POLICY_DELETE",
        resource=f"ai_permission_policy:{policy_id}",
        details="",
    )
    await db.commit()
    return {"ok": True}


@router.get("/task-policies", response_model=list[AiTaskPolicyResponse])
async def admin_list_ai_task_policies(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    limit: int = Query(200, ge=1, le=500),
):
    rows = await ai_repository.list_ai_task_policies(db, tenant_id=tenant_id, limit=limit)
    return [AiTaskPolicyResponse.model_validate(r) for r in rows]


@router.post("/task-policies", response_model=AiTaskPolicyResponse, status_code=201)
async def admin_create_ai_task_policy(
    body: AiTaskPolicyAdminCreateRequest,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    row = await ai_repository.create_ai_task_policy(
        db,
        tenant_id=body.tenant_id,
        task_type=body.task_type,
        is_enabled=body.is_enabled,
        max_frequency_per_hour=body.max_frequency_per_hour,
        cooldown_seconds=body.cooldown_seconds,
        allow_simulation=body.allow_simulation,
        require_approval=body.require_approval,
        max_retries_override=body.max_retries_override,
        priority=body.priority,
    )
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="AI_TASK_POLICY_CREATE",
        resource=f"ai_task_policy:{row.id}",
        details=body.task_type,
    )
    await db.commit()
    return AiTaskPolicyResponse.model_validate(row)


@router.delete("/task-policies/{policy_id}")
async def admin_delete_ai_task_policy(
    policy_id: int,
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    row = await db.get(AiTaskPolicy, policy_id)
    if not row:
        raise HTTPException(status_code=404, detail="Task policy not found")
    await db.delete(row)
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="AI_TASK_POLICY_DELETE",
        resource=f"ai_task_policy:{policy_id}",
        details="",
    )
    await db.commit()
    return {"ok": True}


@router.get("/ingestion-jobs", response_model=list[AiIngestionJobResponse])
async def admin_list_ai_ingestion_jobs(
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
    tenant_id: int | None = None,
    limit: int = Query(100, ge=1, le=500),
):
    rows = await ai_repository.list_ai_ingestion_jobs(db, tenant_id=tenant_id, limit=limit)
    return [AiIngestionJobResponse.model_validate(r) for r in rows]


@router.post("/ingestion-jobs/trigger", response_model=AiIngestionJobResponse)
async def admin_trigger_ai_ingestion_job(
    tenant_id: int = Query(..., ge=1),
    source_type: str = Query(..., min_length=1, max_length=64),
    db: AsyncSession = Depends(get_db),
    ctx: AdminContext = Depends(super_only),
):
    """Run a checksum-aware full reindex for one source type; records AiIngestionJob."""
    job = await run_full_reindex_tracked(
        db,
        tenant_id=tenant_id,
        source_type=source_type,
        trigger="manual",
    )
    await log_admin_action(
        db,
        admin_id=ctx.admin.id,
        action="AI_INGESTION_TRIGGER",
        target_tenant_id=tenant_id,
        resource=f"ingestion:{source_type}",
        details=f"job_id={job.id} status={job.status}",
    )
    await db.commit()
    return AiIngestionJobResponse.model_validate(job)
