from __future__ import annotations

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool import repository, service
from app.modules.ai_tool.weekly_report_service import list_weekly_reports
from app.modules.dashboard.ai_services import generate_data_quality_scan
from app.modules.ai_tool.authz import ensure_tenant_access, require_ai_access
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.ai_tool.schemas import (
    AiChatRequest,
    AiChatResponse,
    AiActionRunResponse,
    AiAnomalyEventResponse,
    AiAnomalyGenerateResponse,
    AiOpsOverviewResponse,
    AiConfirmActionRequest,
    AiForecastRunResponse,
    AiGenerateAnomalyInsightsRequest,
    AiGenerateForecastRequest,
    AiKnowledgeDocumentResponse,
    AiKnowledgeQueryRequest,
    AiKnowledgeQueryResponse,
    AiProposeActionRequest,
    AiGenerateReportRequest,
    AiMessageResponse,
    AiQuickAction,
    AiQuickActionsResponse,
    AiReportRunResponse,
    ApproveEscalationRequest,
    AiSessionCreateRequest,
    AiSessionResponse,
    AiApprovalArtifactCommitResult,
    AiApprovalArtifactResponse,
    AiApprovalArtifactReviewRequest,
    AiApprovalArtifactRollbackRequest,
    AiFeedbackResponse,
    AiFeedbackSubmitRequest,
    AiSystemTaskCreateRequest,
    AiSystemTaskResponse,
    AiWeeklyReportListResponse,
    AiWeeklyReportResponse,
)

router = APIRouter(prefix="/ai-tool", tags=["ai-tool"])
chat_limit = Depends(rate_limit_dependency("chat"))
read_limit = Depends(rate_limit_dependency("read"))
heavy_limit = Depends(rate_limit_dependency("heavy"))


@router.get("/quick-actions", response_model=AiQuickActionsResponse)
async def list_quick_actions(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    custom = await repository.list_saved_prompts(db, tenant_id=tenant.id)
    if custom:
        return AiQuickActionsResponse(
            items=[
                AiQuickAction(
                    key=row.key,
                    label=row.label,
                    prompt=row.prompt_text,
                    source_area="custom",
                )
                for row in custom
            ]
        )
    return service.default_quick_actions()


@router.post("/sessions", response_model=AiSessionResponse, status_code=201)
async def create_session(
    body: AiSessionCreateRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = chat_limit,
):
    return await service.create_session(db, tenant=tenant, user=user, title=body.title)


@router.get("/sessions", response_model=list[AiSessionResponse])
async def list_sessions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_user_sessions(db, tenant=tenant, user=user, limit=limit, offset=offset)


@router.get("/sessions/{session_id}/messages", response_model=list[AiMessageResponse])
async def list_messages(
    session_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_session_messages(db, tenant=tenant, user=user, session_id=session_id)


@router.post("/sessions/{session_id}/messages", response_model=AiChatResponse)
async def send_message(
    session_id: int,
    body: AiChatRequest,
    response: Response,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = chat_limit,
):
    result = await service.process_prompt(
        db,
        tenant=tenant,
        user=user,
        session_id=session_id,
        prompt=body.prompt.strip(),
    )
    if result.escalation is not None:
        response.status_code = status.HTTP_202_ACCEPTED
    return result


@router.post("/sessions/{session_id}/approve-escalation", response_model=AiChatResponse)
async def approve_escalation(
    session_id: int,
    body: ApproveEscalationRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.approve_escalation(
        db,
        tenant=tenant,
        user=user,
        session_id=session_id,
        message_id=body.message_id,
        tool_required=body.tool_required.strip(),
        approved=body.approved,
    )


@router.get("/report-runs", response_model=list[AiReportRunResponse])
async def list_report_runs(
    limit: int = Query(default=30, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_report_runs(db, tenant=tenant, user=user, limit=limit)


@router.post("/report-runs/generate", response_model=AiReportRunResponse, status_code=201)
async def generate_report(
    body: AiGenerateReportRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.generate_report_direct(
        db,
        tenant=tenant,
        user=user,
        prompt=body.prompt.strip(),
        session_id=body.session_id,
    )


@router.get("/forecast-runs", response_model=list[AiForecastRunResponse])
async def list_forecast_runs(
    limit: int = Query(default=30, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_forecast_runs(db, tenant=tenant, user=user, limit=limit)


@router.get("/forecast-runs/{run_id}", response_model=AiForecastRunResponse)
async def get_forecast_run(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.get_forecast_run_by_id(db, tenant=tenant, user=user, run_id=run_id)


@router.post("/forecast-runs/generate", response_model=AiForecastRunResponse, status_code=201)
async def generate_forecast(
    body: AiGenerateForecastRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.generate_forecast_direct(
        db,
        tenant=tenant,
        user=user,
        prompt=body.prompt.strip(),
        horizon_days=body.horizon_days,
        from_date=body.from_date,
        to_date=body.to_date,
        session_id=body.session_id,
    )


@router.post("/tasks", response_model=AiSystemTaskResponse, status_code=201)
async def create_ai_system_task(
    body: AiSystemTaskCreateRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.create_system_task_direct(db, tenant=tenant, user=user, body=body)


@router.get("/tasks", response_model=list[AiSystemTaskResponse])
async def list_ai_system_tasks(
    limit: int = Query(default=50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_system_tasks_direct(db, tenant=tenant, user=user, limit=limit)


@router.get("/tasks/{task_id}", response_model=AiSystemTaskResponse)
async def get_ai_system_task(
    task_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.get_system_task_direct(db, tenant=tenant, user=user, task_id=task_id)


@router.post("/tasks/{task_id}/approve", response_model=AiSystemTaskResponse)
async def approve_ai_system_task(
    task_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.approve_system_task_direct(db, tenant=tenant, user=user, task_id=task_id)


@router.post("/tasks/{task_id}/cancel", response_model=AiSystemTaskResponse)
async def cancel_ai_system_task(
    task_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.cancel_system_task_direct(db, tenant=tenant, user=user, task_id=task_id)


@router.get("/knowledge/documents", response_model=list[AiKnowledgeDocumentResponse])
async def list_knowledge_documents(
    limit: int = Query(default=100, ge=1, le=500),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_knowledge_documents(db, tenant=tenant, user=user, limit=limit)


@router.post("/knowledge/query", response_model=AiKnowledgeQueryResponse)
async def query_knowledge(
    body: AiKnowledgeQueryRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = chat_limit,
):
    return await service.query_knowledge_direct(
        db,
        tenant=tenant,
        user=user,
        query=body.query.strip(),
        top_k=body.top_k,
    )


@router.get("/actions/runs", response_model=list[AiActionRunResponse])
async def list_action_runs(
    limit: int = Query(default=30, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_action_runs(db, tenant=tenant, user=user, limit=limit)


@router.post("/actions/propose", response_model=AiActionRunResponse, status_code=201)
async def propose_action(
    body: AiProposeActionRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.propose_action_direct(
        db,
        tenant=tenant,
        user=user,
        prompt=body.prompt.strip(),
        session_id=body.session_id,
    )


@router.post("/actions/{action_run_id}/confirm", response_model=AiActionRunResponse)
async def confirm_action(
    action_run_id: int,
    body: AiConfirmActionRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.confirm_action_direct(
        db,
        tenant=tenant,
        user=user,
        action_run_id=action_run_id,
        confirmation_token=body.confirmation_token.strip(),
    )


@router.get("/anomalies/events", response_model=list[AiAnomalyEventResponse])
async def list_anomaly_events(
    limit: int = Query(default=50, ge=1, le=300),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_anomaly_events(db, tenant=tenant, user=user, limit=limit)


@router.post("/anomalies/generate", response_model=AiAnomalyGenerateResponse)
async def generate_anomaly_insights(
    body: AiGenerateAnomalyInsightsRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.generate_anomaly_insights_direct(
        db,
        tenant=tenant,
        user=user,
        session_id=body.session_id,
    )


@router.get("/weekly-reports", response_model=AiWeeklyReportListResponse)
async def weekly_reports_list(
    limit: int = Query(default=24, ge=1, le=100),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    rows = await list_weekly_reports(db, tenant.id, limit=limit)
    return AiWeeklyReportListResponse(
        items=[
            AiWeeklyReportResponse(
                id=r.id,
                tenant_id=r.tenant_id,
                week_start=r.week_start,
                week_end=r.week_end,
                narrative=r.narrative,
                kpi_snapshot_json=r.kpi_snapshot_json,
                created_at=r.created_at,
            )
            for r in rows
        ]
    )


@router.post("/data-quality-scan")
async def data_quality_scan(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    """Scan for common data issues + optional Gemini narrative."""
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    return await generate_data_quality_scan(db, tenant.id)


@router.get("/ops/overview", response_model=AiOpsOverviewResponse)
async def ops_overview(
    period_hours: int = Query(default=24, ge=1, le=168),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.get_ops_overview(db, tenant=tenant, user=user, period_hours=period_hours)


@router.post("/feedback", response_model=AiFeedbackResponse, status_code=201)
async def submit_ai_feedback(
    body: AiFeedbackSubmitRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = chat_limit,
):
    return await service.submit_ai_feedback_direct(db, tenant=tenant, user=user, body=body)


@router.get("/artifacts", response_model=list[AiApprovalArtifactResponse])
async def list_ai_artifacts(
    status_filter: str | None = Query(default=None, alias="status"),
    limit: int = Query(default=50, ge=1, le=200),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_approval_artifacts_direct(
        db, tenant=tenant, user=user, status_filter=status_filter, limit=limit
    )


@router.get("/artifacts/{artifact_id}", response_model=AiApprovalArtifactResponse)
async def get_ai_artifact(
    artifact_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.get_approval_artifact_direct(
        db, tenant=tenant, user=user, artifact_id=artifact_id
    )


@router.post("/artifacts/{artifact_id}/approve", response_model=AiApprovalArtifactResponse)
async def approve_ai_artifact(
    artifact_id: int,
    body: AiApprovalArtifactReviewRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.approve_approval_artifact_direct(
        db, tenant=tenant, user=user, artifact_id=artifact_id, body=body
    )


@router.post("/artifacts/{artifact_id}/reject", response_model=AiApprovalArtifactResponse)
async def reject_ai_artifact(
    artifact_id: int,
    body: AiApprovalArtifactReviewRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.reject_approval_artifact_direct(
        db, tenant=tenant, user=user, artifact_id=artifact_id, body=body
    )


@router.post("/artifacts/{artifact_id}/commit", response_model=AiApprovalArtifactCommitResult)
async def commit_ai_artifact(
    artifact_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.commit_approval_artifact_direct(
        db, tenant=tenant, user=user, artifact_id=artifact_id
    )


@router.post("/artifacts/{artifact_id}/rollback", response_model=AiApprovalArtifactResponse)
async def rollback_ai_artifact(
    artifact_id: int,
    body: AiApprovalArtifactRollbackRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
):
    return await service.rollback_approval_artifact_direct(
        db, tenant=tenant, user=user, artifact_id=artifact_id, body=body
    )
