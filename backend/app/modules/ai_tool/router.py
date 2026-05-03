from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel
from fastapi import APIRouter, Depends, HTTPException, Path, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import AiWeeklyReport, Tenant, User
from app.modules.ai_tool import repository, service
from app.modules.ai_tool.weekly_report_service import (
    get_report_by_id,
    get_weekly_report_status,
    list_weekly_report_deltas,
    list_weekly_reports,
    upsert_weekly_report,
)
from app.modules.ai_tool.automation import ensure_default_rules
from app.modules.dashboard.ai_services import generate_data_quality_scan
from app.modules.ai_tool.authz import ensure_tenant_access, require_ai_access
from app.modules.ai_tool.guardrails import enforce_ai_daily_tenant_quota, rate_limit_dependency
from app.modules.ai_tool.schemas import (
    AiChatRequest,
    AiChatResponse,
    AiActionRunResponse,
    AiAnomalyEventResponse,
    AiAnomalyGenerateResponse,
    AiOpsOverviewResponse,
    AiConfirmActionRequest,
    AiForecastRunResponse,
    AiForecastSummaryResponse,
    AiForecastTemplateInfo,
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
    AiWeeklyReportDeltaEntry,
    AiWeeklyReportGenerateRequest,
    AiWeeklyReportGenerateResponse,
    AiWeeklyReportListResponse,
    AiWeeklyReportResponse,
    AiWeeklyReportStatusResponse,
)


class AiAutomationRuleOut(BaseModel):
    rule_code: str
    action_key: str
    label: str
    description: str | None = None
    is_enabled: bool
    requires_confirmation: bool
    permission_key: str | None = None


router = APIRouter(prefix="/ai-tool", tags=["ai-tool"])
chat_limit = Depends(rate_limit_dependency("chat"))
read_limit = Depends(rate_limit_dependency("read"))
heavy_limit = Depends(rate_limit_dependency("heavy"))


async def ai_tool_daily_quota(tenant: Tenant = Depends(require_tenant)) -> None:
    await enforce_ai_daily_tenant_quota(tenant_id=tenant.id)


daily_quota = Depends(ai_tool_daily_quota)


def _weekly_report_to_response(
    r: AiWeeklyReport, delta: dict | None
) -> AiWeeklyReportResponse:
    delta_m: dict[str, AiWeeklyReportDeltaEntry] | None = None
    if delta:
        built = {
            k: AiWeeklyReportDeltaEntry(**v)
            for k, v in delta.items()
            if isinstance(v, dict)
        }
        delta_m = built or None
    return AiWeeklyReportResponse(
        id=r.id,
        tenant_id=r.tenant_id,
        week_start=r.week_start,
        week_end=r.week_end,
        narrative=r.narrative,
        kpi_snapshot_json=r.kpi_snapshot_json,
        delta=delta_m,
        created_at=r.created_at,
    )


@router.get("/weekly-reports/status", response_model=AiWeeklyReportStatusResponse)
async def weekly_reports_status(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    s = await get_weekly_report_status(db, tenant.id)
    return AiWeeklyReportStatusResponse(
        gemini_configured=s["gemini_configured"],
        current_week_start=s["current_week_start"],
        current_week_end=s["current_week_end"],
        has_current_week_report=s["has_current_week_report"],
        last_report_created_at=s["last_report_created_at"],
        next_scheduled_utc=s["next_scheduled_utc"],
    )


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
    __: None = daily_quota,
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
    __: None = daily_quota,
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
    offset: int = Query(default=0, ge=0, le=1000),
    forecast_code: str | None = Query(default=None),
    status: list[str] | None = Query(default=None),
    since: datetime | None = Query(default=None),
    until: datetime | None = Query(default=None),
    min_confidence: float | None = Query(default=None, ge=0.0, le=1.0),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_forecast_runs(
        db,
        tenant=tenant,
        user=user,
        limit=limit,
        offset=offset,
        forecast_code=forecast_code,
        statuses=status,
        since=since,
        until=until,
        min_confidence=min_confidence,
    )


@router.get("/forecast-runs/summary", response_model=AiForecastSummaryResponse)
async def get_forecast_runs_summary(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.get_forecast_summary(db, tenant=tenant, user=user)


@router.get("/forecast-templates", response_model=list[AiForecastTemplateInfo])
async def list_forecast_templates(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    return await service.list_forecast_template_catalog(db, tenant=tenant, user=user)


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


@router.delete("/forecast-runs/{run_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_forecast_run(
    run_id: int,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    await service.delete_forecast_run(db, tenant=tenant, user=user, run_id=run_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


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
    delta_list = await list_weekly_report_deltas(db, tenant.id, rows)
    return AiWeeklyReportListResponse(
        items=[_weekly_report_to_response(r, d) for r, d in zip(rows, delta_list, strict=True)]
    )


@router.get("/weekly-reports/{report_id}", response_model=AiWeeklyReportResponse)
async def weekly_report_get(
    report_id: int = Path(..., ge=1),
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    row = await get_report_by_id(db, tenant.id, report_id)
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")
    deltas = await list_weekly_report_deltas(db, tenant.id, [row])
    return _weekly_report_to_response(row, deltas[0] if deltas else None)


@router.post("/weekly-reports/generate", response_model=AiWeeklyReportGenerateResponse)
async def weekly_report_generate(
    body: AiWeeklyReportGenerateRequest,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = heavy_limit,
    __: None = daily_quota,
):
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    row, gen_status = await upsert_weekly_report(
        db, tenant.id, force=body.force, target_date=body.target_date
    )
    if not row:
        return AiWeeklyReportGenerateResponse(status=gen_status, report=None)
    d_list = await list_weekly_report_deltas(db, tenant.id, [row])
    return AiWeeklyReportGenerateResponse(
        status=gen_status,
        report=_weekly_report_to_response(row, d_list[0] if d_list else None),
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


@router.get("/automation/rules", response_model=list[AiAutomationRuleOut])
async def list_automation_rules(
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    _: None = read_limit,
):
    """List tenant AI automation rules (ensures default templates exist)."""
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    await ensure_default_rules(db, tenant_id=tenant.id)
    rows = await repository.list_automation_rules(db, tenant_id=tenant.id)
    await db.commit()
    return [
        AiAutomationRuleOut(
            rule_code=r.rule_code,
            action_key=r.action_key,
            label=r.label,
            description=r.description,
            is_enabled=r.is_enabled,
            requires_confirmation=r.requires_confirmation,
            permission_key=r.permission_key,
        )
        for r in rows
    ]


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
