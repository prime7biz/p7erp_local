from __future__ import annotations

from datetime import date
from time import perf_counter
from uuid import uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Tenant, User
from app.models.ai_tool import AiActionRun, AiAnomalyEvent, AiForecastRun, AiMessage, AiReportRun, AiSession
from app.modules.ai_tool import audit, repository
from app.modules.ai_tool.automation import confirm_and_execute_action, propose_action
from app.modules.ai_tool.anomaly import generate_anomaly_insights
from app.modules.ai_tool.authz import ensure_tenant_access, has_tool_permission, require_ai_access
from app.modules.ai_tool.forecasting import build_forecast_tool_result, execute_forecast_request
from app.modules.ai_tool.guardrails import (
    build_policy_metadata,
    call_with_timeout,
    record_circuit_failure,
    record_circuit_success,
    should_block_circuit,
)
from app.modules.ai_tool.intents import detect_intent
from app.modules.ai_tool.knowledge import build_knowledge_tool_payload, list_knowledge_documents as list_knowledge_documents_core, query_knowledge
from app.modules.ai_tool.reporting import build_report_tool_result, execute_report_request
from app.modules.ai_tool.schemas import (
    AiChatResponse,
    AiActionRunResponse,
    AiAnomalyEventResponse,
    AiAnomalyGenerateResponse,
    AiOpsOverviewResponse,
    AiForecastRunResponse,
    AiKnowledgeDocumentResponse,
    AiKnowledgeQueryResponse,
    AiMessageResponse,
    AiQuickAction,
    AiQuickActionsResponse,
    AiReportRunResponse,
    AiSessionResponse,
    AiToolInvocationResult,
)
from app.modules.ai_tool.tool_registry import select_tools


def _normalize_prompt(prompt: str) -> str:
    text = prompt.strip()
    if not text:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Prompt cannot be empty")
    return text


def _safe_prompt_excerpt(prompt: str, limit: int = 220) -> str:
    text = " ".join(prompt.split())
    if len(text) > limit:
        return text[:limit] + "..."
    return text


def _token_hint(row: AiActionRun) -> str | None:
    if row.status != "PROPOSED":
        return None
    if row.confirmation_token_last4:
        return f"****{row.confirmation_token_last4}"
    return None


async def _ensure_session_access(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    session_id: int | None,
    request_id: str | None,
    action: str,
) -> AiSession | None:
    if session_id is None:
        return None
    session = await repository.get_session(db, tenant_id=tenant.id, session_id=session_id)
    if not session or session.user_id != user.id:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session_id,
            action=action,
            severity="WARN",
            request_id=request_id,
            resource="ai.session",
            details="Invalid session access",
            decision="deny",
            reason_code="SESSION_ACCESS_DENIED",
            error_category="authorization",
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


def _session_to_schema(row: AiSession) -> AiSessionResponse:
    return AiSessionResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        user_id=row.user_id,
        session_code=row.session_code,
        title=row.title,
        status=row.status,
        provider=row.provider,
        model_name=row.model_name,
        last_message_at=row.last_message_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _message_to_schema(row: AiMessage) -> AiMessageResponse:
    return AiMessageResponse(
        id=row.id,
        session_id=row.session_id,
        role=row.role,  # type: ignore[arg-type]
        content=row.content,
        content_json=row.content_json,
        created_at=row.created_at,
    )


def _report_to_schema(row: AiReportRun) -> AiReportRunResponse:
    return AiReportRunResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        user_id=row.user_id,
        session_id=row.session_id,
        request_id=row.request_id,
        report_code=row.report_code,
        report_name=row.report_name,
        status=row.status,
        source_modules=list(row.source_modules or []),
        parameters_json=row.parameters_json or {},
        result_json=row.result_json or {},
        narrative_summary=row.narrative_summary,
        created_at=row.created_at,
        completed_at=row.completed_at,
    )


def _forecast_to_schema(row: AiForecastRun) -> AiForecastRunResponse:
    return AiForecastRunResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        user_id=row.user_id,
        session_id=row.session_id,
        request_id=row.request_id,
        forecast_code=row.forecast_code,
        forecast_name=row.forecast_name,
        status=row.status,
        source_modules=list(row.source_modules or []),
        assumptions_json=row.assumptions_json or {},
        parameters_json=row.parameters_json or {},
        result_json=row.result_json or {},
        confidence_score=row.confidence_score,
        narrative_explanation=row.narrative_explanation,
        created_at=row.created_at,
        completed_at=row.completed_at,
    )


def _action_to_schema(row: AiActionRun) -> AiActionRunResponse:
    token = getattr(row, "_plain_confirmation_token", None) if row.status == "PROPOSED" else None
    return AiActionRunResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        user_id=row.user_id,
        session_id=row.session_id,
        message_id=row.message_id,
        request_id=row.request_id,
        action_key=row.action_key,
        status=row.status,
        requires_confirmation=row.requires_confirmation,
        confirmation_token=token,
        confirmation_token_hint=_token_hint(row),
        risk_level=row.risk_level,
        prompt_text=row.prompt_text,
        preview_text=row.preview_text,
        input_json=row.input_json or {},
        output_json=row.output_json or {},
        error_text=row.error_text,
        created_at=row.created_at,
        confirmed_at=row.confirmed_at,
        executed_at=row.executed_at,
    )


def _anomaly_to_schema(row: AiAnomalyEvent) -> AiAnomalyEventResponse:
    return AiAnomalyEventResponse(
        id=row.id,
        tenant_id=row.tenant_id,
        user_id=row.user_id,
        session_id=row.session_id,
        request_id=row.request_id,
        source_area=row.source_area,
        rule_code=row.rule_code,
        severity=row.severity,
        title=row.title,
        explanation=row.explanation,
        metrics_json=row.metrics_json or {},
        dimensions_json=row.dimensions_json or {},
        created_at=row.created_at,
    )


def _is_anomaly_prompt(prompt: str) -> bool:
    text = prompt.lower()
    anomaly_keys = {
        "anomaly",
        "risk",
        "margin issue",
        "bottleneck",
        "deviation",
        "exception",
        "alert",
        "trend break",
    }
    return any(k in text for k in anomaly_keys)


def _assistant_text(results: list[AiToolInvocationResult], intent: str, blocked: bool) -> str:
    if blocked:
        return "I blocked this request because it is outside the allowed safe scope. Please ask for summary, search, report, or forecast."
    if not results:
        if intent == "search_query":
            return (
                "I could not safely map this search request. Try clearer prompts like: "
                "'show delayed orders', 'pending approvals above 10', 'inventory shortages', "
                "'buyer-wise order status', 'repeated late vendors', or 'production issues'."
            )
        return "I could not identify a safe tool for this request. Please try dashboard summary, pending approvals, order search, inventory, production, or finance summary."
    top = results[0]
    if top.status == "FAILED":
        return "I could not complete the request due to a tool error. Please try again or simplify the query."
    if intent == "help_request":
        return top.summary
    if intent == "forecast_request":
        return top.summary
    if intent == "action_request":
        return top.summary
    return top.summary


def default_quick_actions() -> AiQuickActionsResponse:
    return AiQuickActionsResponse(
        items=[
            AiQuickAction(
                key="dashboard_summary",
                label="Summarize dashboard",
                prompt="Summarize dashboard",
                source_area="dashboard",
            ),
            AiQuickAction(
                key="pending_approvals",
                label="Show pending approvals",
                prompt="Show pending approvals",
                source_area="workflow",
            ),
            AiQuickAction(
                key="search_delayed_orders",
                label="Search delayed orders",
                prompt="Search delayed orders",
                source_area="orders",
            ),
            AiQuickAction(
                key="buyer_wise_order_status",
                label="Buyer-wise order status",
                prompt="Show buyer-wise order status",
                source_area="orders",
            ),
            AiQuickAction(
                key="pending_approvals_threshold",
                label="Pending approvals above 10",
                prompt="Find pending approvals above 10",
                source_area="workflow",
            ),
            AiQuickAction(
                key="inventory_snapshot",
                label="Inventory snapshot",
                prompt="Inventory snapshot",
                source_area="inventory",
            ),
            AiQuickAction(
                key="inventory_shortages",
                label="Inventory shortages",
                prompt="Search inventory shortages",
                source_area="inventory",
            ),
            AiQuickAction(
                key="production_summary",
                label="Production summary",
                prompt="Production summary",
                source_area="manufacturing",
            ),
            AiQuickAction(
                key="production_issues",
                label="Production issues",
                prompt="Summarize production issues",
                source_area="manufacturing",
            ),
            AiQuickAction(
                key="late_vendors",
                label="Repeated late vendors",
                prompt="Show repeated late vendors",
                source_area="inventory",
            ),
            AiQuickAction(
                key="monthly_production_report",
                label="Generate monthly production summary",
                prompt="Generate monthly production summary",
                source_area="reports",
            ),
            AiQuickAction(
                key="executive_kpi_report",
                label="Executive dashboard KPI summary",
                prompt="Generate executive summary for dashboard KPIs",
                source_area="reports",
            ),
            AiQuickAction(
                key="cash_flow_forecast",
                label="Cash flow projection",
                prompt="Generate cash flow projection",
                source_area="forecast",
            ),
            AiQuickAction(
                key="inventory_shortage_forecast",
                label="Inventory shortage forecast",
                prompt="Generate inventory shortage forecast",
                source_area="forecast",
            ),
            AiQuickAction(
                key="production_output_forecast",
                label="Production output forecast",
                prompt="Generate production output forecast",
                source_area="forecast",
            ),
            AiQuickAction(
                key="shipment_delay_risk",
                label="Shipment delay risk projection",
                prompt="Generate shipment delay risk projection",
                source_area="forecast",
            ),
            AiQuickAction(
                key="receivable_risk",
                label="Receivable risk outlook",
                prompt="Generate receivable risk outlook",
                source_area="forecast",
            ),
            AiQuickAction(
                key="capacity_shortfall",
                label="Capacity shortfall projection",
                prompt="Generate capacity shortfall projection",
                source_area="forecast",
            ),
            AiQuickAction(
                key="finance_summary",
                label="Finance summary",
                prompt="Finance summary",
                source_area="finance",
            ),
            AiQuickAction(
                key="help_order_sop",
                label="Ask: order lifecycle SOP",
                prompt="Explain order lifecycle SOP and controls",
                source_area="knowledge",
            ),
            AiQuickAction(
                key="help_compliance_policy",
                label="Ask: compliance policy",
                prompt="What compliance policy applies to AI-assisted approvals?",
                source_area="knowledge",
            ),
            AiQuickAction(
                key="draft_followup_action",
                label="Draft follow-up action",
                prompt="Create follow-up reminder for order 123",
                source_area="automation",
            ),
            AiQuickAction(
                key="draft_message_action",
                label="Draft message/email",
                prompt="Draft a reminder email for delayed shipment",
                source_area="automation",
            ),
            AiQuickAction(
                key="anomaly_summary",
                label="Generate anomaly summary",
                prompt="Generate anomaly summary and top business risks",
                source_area="insights",
            ),
        ]
    )


async def list_report_runs(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    limit: int,
) -> list[AiReportRunResponse]:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    rows = await repository.list_report_runs(db, tenant_id=tenant.id, user_id=user.id, limit=limit)
    return [_report_to_schema(row) for row in rows]


async def list_forecast_runs(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    limit: int,
) -> list[AiForecastRunResponse]:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    rows = await repository.list_forecast_runs(db, tenant_id=tenant.id, user_id=user.id, limit=limit)
    return [_forecast_to_schema(row) for row in rows]


async def list_knowledge_documents(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    limit: int,
) -> list[AiKnowledgeDocumentResponse]:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    return await list_knowledge_documents_core(db, tenant_id=tenant.id, user=user, limit=limit)


async def get_ops_overview(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    period_hours: int,
) -> AiOpsOverviewResponse:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    payload = await repository.ai_ops_overview(db, tenant_id=tenant.id, period_hours=period_hours)
    return AiOpsOverviewResponse(
        period_hours=period_hours,
        total_events=int(payload.get("total_events", 0)),
        blocked_events=int(payload.get("blocked_events", 0)),
        error_events=int(payload.get("error_events", 0)),
        avg_duration_ms=int(payload.get("avg_duration_ms", 0)),
        tool_success_rate=float(payload.get("tool_success_rate", 0.0)),
    )


async def list_action_runs(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    limit: int,
) -> list[AiActionRunResponse]:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    rows = await repository.list_action_runs(db, tenant_id=tenant.id, user_id=user.id, limit=limit)
    return [_action_to_schema(x) for x in rows]


async def list_anomaly_events(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    limit: int,
) -> list[AiAnomalyEventResponse]:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    rows = await repository.list_anomaly_events(db, tenant_id=tenant.id, user_id=user.id, limit=limit)
    allow_finance = await has_tool_permission(db, user, "ai.tools.finance.read")
    filtered = [x for x in rows if allow_finance or x.source_area != "finance"]
    return [_anomaly_to_schema(x) for x in filtered]


async def create_session(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    title: str | None,
) -> AiSessionResponse:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    row = await repository.create_session(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_code=f"AIS-{uuid4().hex[:12].upper()}",
        title=title.strip() if title else "New AI Session",
    )
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=row.id,
        action="SESSION_CREATED",
        resource="ai.session",
    )
    return _session_to_schema(row)


async def list_user_sessions(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    limit: int,
    offset: int,
) -> list[AiSessionResponse]:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    rows = await repository.list_sessions(db, tenant_id=tenant.id, user_id=user.id, limit=limit, offset=offset)
    return [_session_to_schema(x) for x in rows]


async def list_session_messages(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    session_id: int,
) -> list[AiMessageResponse]:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    session = await repository.get_session(db, tenant_id=tenant.id, session_id=session_id)
    if not session or session.user_id != user.id:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session_id,
            action="SESSION_ACCESS_BLOCKED",
            severity="WARN",
            resource="ai.session",
            details="Attempt to access another user's session",
            decision="deny",
            reason_code="SESSION_ACCESS_DENIED",
            error_category="authorization",
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    messages = await repository.list_messages(db, tenant_id=tenant.id, session_id=session_id)
    return [_message_to_schema(x) for x in messages]


async def process_prompt(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    session_id: int,
    prompt: str,
) -> AiChatResponse:
    overall_start = perf_counter()
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    prompt = _normalize_prompt(prompt)
    session = await repository.get_session(db, tenant_id=tenant.id, session_id=session_id)
    if not session or session.user_id != user.id:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session_id,
            action="PROMPT_BLOCKED",
            severity="WARN",
            resource="ai.session",
            details="Prompt blocked due to invalid session access",
            decision="deny",
            reason_code="SESSION_ACCESS_DENIED",
            error_category="authorization",
        )
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    request_id = uuid4().hex
    user_msg = await repository.create_message(
        db,
        tenant_id=tenant.id,
        session_id=session.id,
        sender_user_id=user.id,
        role="user",
        content=prompt,
        content_json={"request_id": request_id},
    )
    await repository.touch_session_last_message(db, session=session)
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session.id,
        message_id=user_msg.id,
        action="PROMPT_RECEIVED",
        request_id=request_id,
        resource="ai.prompt",
        details=_safe_prompt_excerpt(prompt, limit=500),
    )

    intent_result = detect_intent(prompt)
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session.id,
        message_id=user_msg.id,
        action="INTENT_DETECTED",
        request_id=request_id,
        resource="ai.intent",
        details=intent_result.reason,
        details_json={"intent": intent_result.intent, "confidence": intent_result.confidence},
    )

    blocked = intent_result.intent in {"unsupported_request"}
    tool_results: list[AiToolInvocationResult] = []
    selected_tools = [] if blocked else select_tools(intent_result.intent, prompt)
    if intent_result.intent == "report_request":
        # Report requests are handled by the dedicated report generator path in this phase.
        selected_tools = []
    ambiguous_rejected = False
    if not blocked:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session.id,
            message_id=user_msg.id,
            action="TOOLS_SELECTED",
            request_id=request_id,
            resource="ai.registry",
            details=f"Selected {len(selected_tools)} tool(s)",
            details_json={"tools": [x.name for x in selected_tools]},
        )
        if intent_result.intent == "search_query" and len(selected_tools) == 0:
            ambiguous_rejected = True
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="SEARCH_AMBIGUOUS_REJECTED",
                severity="WARN",
                request_id=request_id,
                resource="ai.search",
                details="Search request was ambiguous for safe tool mapping",
                decision="deny",
                reason_code="SEARCH_AMBIGUOUS",
                error_category="validation",
            )

    if blocked:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session.id,
            message_id=user_msg.id,
            action="REQUEST_BLOCKED",
            severity="WARN",
            request_id=request_id,
            resource="ai.guard",
            details=f"Blocked intent: {intent_result.intent}",
            decision="deny",
            reason_code="INTENT_UNSUPPORTED",
            error_category="policy",
        )

    if intent_result.intent == "report_request" and not blocked:
        settings = get_settings()
        report_template, report_payload, report_narrative, report_error = await call_with_timeout(
            settings.ai_timeout_heavy_seconds,
            execute_report_request(
                db,
                tenant_id=tenant.id,
                user=user,
                prompt=prompt,
            ),
            error_message="Report generation timed out. Please retry with a narrower scope.",
        )
        if report_error:
            tool_results.append(
                AiToolInvocationResult(
                    tool_name="generate_report",
                    status="BLOCKED",
                    summary="Report generation blocked by policy.",
                    source_area="reports",
                    data={},
                    error=report_error,
                    reason_code="REPORT_POLICY_BLOCK",
                    error_category="policy",
                )
            )
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="REPORT_BLOCKED",
                severity="WARN",
                request_id=request_id,
                resource="ai.report",
                details=report_error,
                decision="deny",
                reason_code="REPORT_POLICY_BLOCK",
                error_category="policy",
            )
        elif report_template and report_payload is not None and report_narrative is not None:
            report_run = await repository.create_report_run(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                request_id=request_id,
                report_code=report_template.report_code,
                report_name=report_template.report_name,
                source_modules=report_template.source_modules,
                parameters_json={"prompt": prompt},
            )
            await repository.complete_report_run(
                db,
                row=report_run,
                status="SUCCESS",
                narrative_summary=report_narrative,
                result_json=report_payload,
            )
            tool_result = build_report_tool_result(report_template, report_payload, report_narrative)
            tool_result.data["report_run_id"] = report_run.id
            tool_results.append(tool_result)
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="REPORT_GENERATED",
                request_id=request_id,
                resource="ai.report",
                details=f"Generated report {report_template.report_code}",
                details_json={"report_run_id": report_run.id, "report_code": report_template.report_code},
            )

    if intent_result.intent == "forecast_request" and not blocked:
        settings = get_settings()
        forecast_template, forecast_payload, forecast_narrative, forecast_error = await call_with_timeout(
            settings.ai_timeout_heavy_seconds,
            execute_forecast_request(
                db,
                tenant_id=tenant.id,
                user=user,
                prompt=prompt,
                horizon_days=30,
                from_date=None,
                to_date=None,
            ),
            error_message="Forecast generation timed out. Please retry with a smaller date range.",
        )
        if forecast_error:
            tool_results.append(
                AiToolInvocationResult(
                    tool_name="generate_forecast",
                    status="BLOCKED",
                    summary="Forecast generation blocked by policy.",
                    source_area="forecast",
                    data={},
                    error=forecast_error,
                    reason_code="FORECAST_POLICY_BLOCK",
                    error_category="policy",
                )
            )
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="FORECAST_BLOCKED",
                severity="WARN",
                request_id=request_id,
                resource="ai.forecast",
                details=forecast_error,
                decision="deny",
                reason_code="FORECAST_POLICY_BLOCK",
                error_category="policy",
            )
        elif forecast_template and forecast_payload is not None and forecast_narrative is not None:
            forecast_run = await repository.create_forecast_run(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                request_id=request_id,
                forecast_code=forecast_template.forecast_code,
                forecast_name=forecast_template.forecast_name,
                source_modules=forecast_template.source_modules,
                assumptions_json=forecast_payload.get("assumptions", {}),
                parameters_json={"prompt": prompt, "horizon_days": 30},
            )
            await repository.complete_forecast_run(
                db,
                row=forecast_run,
                status="SUCCESS",
                confidence_score=forecast_payload.get("confidence_score"),
                narrative_explanation=forecast_narrative,
                result_json=forecast_payload,
            )
            tool_result = build_forecast_tool_result(forecast_template, forecast_payload, forecast_narrative)
            tool_result.data["forecast_run_id"] = forecast_run.id
            tool_results.append(tool_result)
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="FORECAST_GENERATED",
                request_id=request_id,
                resource="ai.forecast",
                details=f"Generated forecast {forecast_template.forecast_code}",
                details_json={"forecast_run_id": forecast_run.id, "forecast_code": forecast_template.forecast_code},
            )

    if intent_result.intent == "help_request" and not blocked:
        retrieval = await query_knowledge(
            db,
            tenant_id=tenant.id,
            user=user,
            query=prompt,
            top_k=5,
            request_id=request_id,
            session_id=session.id,
            message_id=user_msg.id,
        )
        tool_results.append(
            AiToolInvocationResult(
                tool_name="knowledge_retrieval",
                status="SUCCESS",
                summary=retrieval.answer,
                source_area="knowledge",
                data=build_knowledge_tool_payload(retrieval),
            )
        )

    if intent_result.intent == "action_request" and not blocked:
        rule, proposal, action_run = await propose_action(
            db,
            tenant_id=tenant.id,
            user=user,
            prompt=prompt,
            request_id=request_id,
            session_id=session.id,
            message_id=user_msg.id,
        )
        if proposal.blocked_reason:
            tool_results.append(
                AiToolInvocationResult(
                    tool_name="automation_guard",
                    status="BLOCKED",
                    summary=f"Action blocked: {proposal.blocked_reason}",
                    source_area="automation",
                    data={
                        "action_key": proposal.action_key,
                        "risk_level": proposal.risk_level,
                        "preview": proposal.preview_text,
                    },
                    error=proposal.blocked_reason,
                    reason_code="ACTION_POLICY_BLOCK",
                    error_category="policy",
                )
            )
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="ACTION_BLOCKED",
                severity="WARN",
                request_id=request_id,
                resource="ai.automation",
                details=proposal.blocked_reason,
                decision="deny",
                reason_code="ACTION_POLICY_BLOCK",
                error_category="policy",
            )
        else:
            run_id = action_run.id if action_run else None
            token = getattr(action_run, "_plain_confirmation_token", None) if action_run else None
            tool_results.append(
                AiToolInvocationResult(
                    tool_name="automation_proposal",
                    status="SUCCESS",
                    summary="Draft action prepared. Confirm explicitly before execution.",
                    source_area="automation",
                    data={
                        "action_run_id": run_id,
                        "action_key": proposal.action_key,
                        "rule_code": proposal.rule_code,
                        "label": proposal.label,
                        "risk_level": proposal.risk_level,
                        "requires_confirmation": proposal.requires_confirmation,
                        "preview": proposal.preview_text,
                        "confirmation_token_hint": f"****{token[-4:]}" if token else _token_hint(action_run) if action_run else None,
                        "next_step": "Call confirm action endpoint with action_run_id + confirmation_token.",
                    },
                )
            )
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="ACTION_PROPOSED",
                request_id=request_id,
                resource="ai.automation",
                details=f"Proposed action {proposal.action_key}",
                details_json={"action_run_id": run_id, "rule_code": proposal.rule_code, "rule_id": rule.id if rule else None},
            )

    if _is_anomaly_prompt(prompt) and not blocked:
        settings = get_settings()
        anomaly_payload = await call_with_timeout(
            settings.ai_timeout_heavy_seconds,
            generate_anomaly_insights(
                db,
                tenant_id=tenant.id,
                user=user,
                request_id=request_id,
                session_id=session.id,
            ),
            error_message="Anomaly generation timed out. Please retry.",
        )
        tool_results.append(
            AiToolInvocationResult(
                tool_name="anomaly_insights",
                status="SUCCESS",
                summary=str(anomaly_payload.get("summary") or "Anomaly analysis completed."),
                source_area="insights",
                data={
                    "items": anomaly_payload.get("events", []),
                    "logic_version": anomaly_payload.get("logic_version"),
                    "scheduler_ready": anomaly_payload.get("scheduler_ready"),
                    "persisted_event_ids": anomaly_payload.get("persisted_event_ids", []),
                },
            )
        )
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session.id,
            message_id=user_msg.id,
            action="ANOMALY_INSIGHTS_GENERATED",
            request_id=request_id,
            resource="ai.insights",
            details="Anomaly insight run completed",
            details_json={
                "events_count": len(anomaly_payload.get("events", [])),
                "logic_version": anomaly_payload.get("logic_version"),
            },
        )

    for tool in selected_tools:
        if not await has_tool_permission(db, user, tool.permission_key):
            result = AiToolInvocationResult(
                tool_name=tool.name,
                status="BLOCKED",
                summary=f"Blocked due to missing permission for {tool.name}.",
                source_area=tool.source_area,
                data={},
                error="Permission denied",
                reason_code="RBAC_DENIED",
                error_category="authorization",
            )
            tool_results.append(result)
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="TOOL_BLOCKED",
                severity="WARN",
                request_id=request_id,
                resource=tool.name,
                details="Tool blocked by RBAC policy",
                decision="deny",
                reason_code="RBAC_DENIED",
                error_category="authorization",
            )
            continue

        if await should_block_circuit(tool.name):
            result = AiToolInvocationResult(
                tool_name=tool.name,
                status="BLOCKED",
                summary=f"Tool {tool.name} is temporarily unavailable after repeated failures.",
                source_area=tool.source_area,
                data={},
                error="Circuit breaker open",
                reason_code="CIRCUIT_OPEN",
                error_category="reliability",
            )
            tool_results.append(result)
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                action="TOOL_BLOCKED",
                severity="WARN",
                request_id=request_id,
                resource=tool.name,
                details="Tool blocked by circuit breaker",
                decision="deny",
                reason_code="CIRCUIT_OPEN",
                error_category="reliability",
            )
            continue

        invocation = await repository.create_tool_invocation(
            db,
            tenant_id=tenant.id,
            session_id=session.id,
            message_id=user_msg.id,
            invocation_code=f"TOOL-{uuid4().hex[:12].upper()}",
            tool_name=tool.name,
            input_json={"prompt": prompt[:300]},
        )

        start = perf_counter()
        try:
            settings = get_settings()
            raw = await call_with_timeout(
                settings.ai_timeout_chat_seconds,
                tool.handler(db, tenant.id, prompt),
                error_message=f"Tool {tool.name} timed out. Please retry.",
            )
            elapsed_ms = int((perf_counter() - start) * 1000)
            result = AiToolInvocationResult(
                tool_name=tool.name,
                status="SUCCESS",
                summary=str(raw.get("summary") or "Completed"),
                source_area=tool.source_area,
                data=raw.get("data") or {},
            )
            tool_results.append(result)
            await record_circuit_success(tool.name)
            await repository.finish_tool_invocation(
                db,
                invocation=invocation,
                status="SUCCESS",
                latency_ms=elapsed_ms,
                output_json=raw,
            )
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                tool_invocation_id=invocation.id,
                action="TOOL_EXECUTED",
                request_id=request_id,
                resource=tool.name,
                details=f"Tool completed in {elapsed_ms}ms",
                details_json={"result_keys": list((raw.get("data") or {}).keys())},
                decision="allow",
                reason_code="TOOL_EXECUTED",
            )
        except Exception as exc:
            elapsed_ms = int((perf_counter() - start) * 1000)
            await record_circuit_failure(tool.name)
            await repository.finish_tool_invocation(
                db,
                invocation=invocation,
                status="FAILED",
                latency_ms=elapsed_ms,
                error_text=str(exc),
            )
            tool_results.append(
                AiToolInvocationResult(
                    tool_name=tool.name,
                    status="FAILED",
                    summary=f"{tool.name} failed.",
                    source_area=tool.source_area,
                    error=str(exc),
                    data={},
                    reason_code="TOOL_EXECUTION_FAILED",
                    error_category="runtime",
                )
            )
            await audit.log_ai_event(
                db,
                tenant_id=tenant.id,
                user_id=user.id,
                session_id=session.id,
                message_id=user_msg.id,
                tool_invocation_id=invocation.id,
                action="TOOL_FAILED",
                severity="ERROR",
                request_id=request_id,
                resource=tool.name,
                details=str(exc),
                decision="error",
                reason_code="TOOL_EXECUTION_FAILED",
                error_category="runtime",
            )

    assistant_text = _assistant_text(tool_results, intent_result.intent, blocked)
    assistant_msg = await repository.create_message(
        db,
        tenant_id=tenant.id,
        session_id=session.id,
        sender_user_id=None,
        role="assistant",
        content=assistant_text,
        content_json={
            "request_id": request_id,
            "intent": intent_result.intent,
            "confidence": intent_result.confidence,
            "tool_results": [x.model_dump() for x in tool_results],
            "blocked": blocked,
            "ambiguous_rejected": ambiguous_rejected,
        },
    )
    await repository.touch_session_last_message(db, session=session)
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session.id,
        message_id=assistant_msg.id,
        action="RESPONSE_SENT",
        request_id=request_id,
        resource="ai.response",
        details=assistant_text[:500],
    )
    elapsed_ms = int((perf_counter() - overall_start) * 1000)
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session.id,
        message_id=assistant_msg.id,
        action="REQUEST_COMPLETED",
        request_id=request_id,
        resource="ai.request",
        details=f"Completed in {elapsed_ms}ms",
        details_json={
            "duration_ms": elapsed_ms,
            "intent": intent_result.intent,
            "tool_results_count": len(tool_results),
            "blocked": blocked,
            **build_policy_metadata(decision="allow" if not blocked else "deny"),
        },
    )

    return AiChatResponse(
        session=_session_to_schema(session),
        user_message=_message_to_schema(user_msg),
        assistant_message=_message_to_schema(assistant_msg),
        detected_intent=intent_result.intent,
        confidence=intent_result.confidence,
        request_id=request_id,
        tool_results=tool_results,
        blocked=blocked,
    )


async def generate_report_direct(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    prompt: str,
    session_id: int | None = None,
) -> AiReportRunResponse:
    start = perf_counter()
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    prompt = _normalize_prompt(prompt)
    request_id = uuid4().hex
    await _ensure_session_access(
        db,
        tenant=tenant,
        user=user,
        session_id=session_id,
        request_id=request_id,
        action="REPORT_SESSION_ACCESS_BLOCKED",
    )
    settings = get_settings()
    report_template, report_payload, report_narrative, report_error = await call_with_timeout(
        settings.ai_timeout_heavy_seconds,
        execute_report_request(
            db,
            tenant_id=tenant.id,
            user=user,
            prompt=prompt,
        ),
        error_message="Report generation timed out. Please retry with a narrower scope.",
    )
    if report_error or not report_template or report_payload is None or report_narrative is None:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session_id,
            action="REPORT_BLOCKED",
            severity="WARN",
            request_id=request_id,
            resource="ai.report",
            details=report_error or "Unable to determine report template",
            decision="deny",
            reason_code="REPORT_POLICY_BLOCK",
            error_category="policy",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=report_error or "Report request blocked")

    row = await repository.create_report_run(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        request_id=request_id,
        report_code=report_template.report_code,
        report_name=report_template.report_name,
        source_modules=report_template.source_modules,
        parameters_json={"prompt": prompt},
    )
    await repository.complete_report_run(
        db,
        row=row,
        status="SUCCESS",
        narrative_summary=report_narrative,
        result_json=report_payload,
    )
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        action="REPORT_GENERATED",
        request_id=request_id,
        resource="ai.report",
        details=f"Generated report {report_template.report_code}",
        details_json={"report_run_id": row.id, "report_code": report_template.report_code},
    )
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        action="REPORT_REQUEST_COMPLETED",
        request_id=request_id,
        resource="ai.report",
        details=f"Completed in {int((perf_counter() - start) * 1000)}ms",
    )
    return _report_to_schema(row)


async def generate_forecast_direct(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    prompt: str,
    horizon_days: int,
    from_date: date | None,
    to_date: date | None,
    session_id: int | None = None,
) -> AiForecastRunResponse:
    start = perf_counter()
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    prompt = _normalize_prompt(prompt)
    request_id = uuid4().hex
    await _ensure_session_access(
        db,
        tenant=tenant,
        user=user,
        session_id=session_id,
        request_id=request_id,
        action="FORECAST_SESSION_ACCESS_BLOCKED",
    )
    settings = get_settings()
    template, payload, narrative, error = await call_with_timeout(
        settings.ai_timeout_heavy_seconds,
        execute_forecast_request(
            db,
            tenant_id=tenant.id,
            user=user,
            prompt=prompt,
            horizon_days=horizon_days,
            from_date=from_date,
            to_date=to_date,
        ),
        error_message="Forecast generation timed out. Please retry with a smaller range.",
    )
    if error or not template or payload is None or narrative is None:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session_id,
            action="FORECAST_BLOCKED",
            severity="WARN",
            request_id=request_id,
            resource="ai.forecast",
            details=error or "Unable to determine forecast template",
            decision="deny",
            reason_code="FORECAST_POLICY_BLOCK",
            error_category="policy",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error or "Forecast request blocked")

    row = await repository.create_forecast_run(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        request_id=request_id,
        forecast_code=template.forecast_code,
        forecast_name=template.forecast_name,
        source_modules=template.source_modules,
        assumptions_json=payload.get("assumptions", {}),
        parameters_json={
            "prompt": prompt,
            "horizon_days": horizon_days,
            "from_date": from_date.isoformat() if from_date else None,
            "to_date": to_date.isoformat() if to_date else None,
        },
    )
    await repository.complete_forecast_run(
        db,
        row=row,
        status="SUCCESS",
        confidence_score=payload.get("confidence_score"),
        narrative_explanation=narrative,
        result_json=payload,
    )
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        action="FORECAST_GENERATED",
        request_id=request_id,
        resource="ai.forecast",
        details=f"Generated forecast {template.forecast_code}",
        details_json={"forecast_run_id": row.id, "forecast_code": template.forecast_code},
    )
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        action="FORECAST_REQUEST_COMPLETED",
        request_id=request_id,
        resource="ai.forecast",
        details=f"Completed in {int((perf_counter() - start) * 1000)}ms",
    )
    return _forecast_to_schema(row)


async def query_knowledge_direct(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    query: str,
    top_k: int,
) -> AiKnowledgeQueryResponse:
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    query = _normalize_prompt(query)
    return await query_knowledge(
        db,
        tenant_id=tenant.id,
        user=user,
        query=query,
        top_k=top_k,
        request_id=uuid4().hex,
        session_id=None,
        message_id=None,
    )


async def propose_action_direct(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    prompt: str,
    session_id: int | None = None,
) -> AiActionRunResponse:
    start = perf_counter()
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    prompt = _normalize_prompt(prompt)
    request_id = uuid4().hex
    await _ensure_session_access(
        db,
        tenant=tenant,
        user=user,
        session_id=session_id,
        request_id=request_id,
        action="ACTION_SESSION_ACCESS_BLOCKED",
    )
    _, proposal, run = await propose_action(
        db,
        tenant_id=tenant.id,
        user=user,
        prompt=prompt,
        request_id=request_id,
        session_id=session_id,
        message_id=None,
    )
    if proposal.blocked_reason or not run:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=session_id,
            action="ACTION_BLOCKED",
            severity="WARN",
            request_id=request_id,
            resource="ai.automation",
            details=proposal.blocked_reason or "Blocked by policy",
            decision="deny",
            reason_code="ACTION_POLICY_BLOCK",
            error_category="policy",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=proposal.blocked_reason or "Action blocked")
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        action="ACTION_PROPOSED",
        request_id=request_id,
        resource="ai.automation",
        details=f"Proposed action {run.action_key}",
        details_json={"action_run_id": run.id, "duration_ms": int((perf_counter() - start) * 1000)},
    )
    return _action_to_schema(run)


async def confirm_action_direct(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    action_run_id: int,
    confirmation_token: str,
) -> AiActionRunResponse:
    start = perf_counter()
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    request_id = uuid4().hex
    run, output, error = await confirm_and_execute_action(
        db,
        tenant_id=tenant.id,
        user=user,
        action_run_id=action_run_id,
        confirmation_token=confirmation_token,
    )
    if error or not run:
        await audit.log_ai_event(
            db,
            tenant_id=tenant.id,
            user_id=user.id,
            session_id=None,
            action="ACTION_CONFIRM_BLOCKED",
            severity="WARN",
            request_id=request_id,
            resource="ai.automation",
            details=error or "Action confirmation blocked",
            details_json={"action_run_id": action_run_id},
            decision="deny",
            reason_code="ACTION_CONFIRM_DENIED",
            error_category="authorization",
        )
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=error or "Action confirmation blocked")
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=run.session_id,
        action="ACTION_EXECUTED",
        request_id=request_id,
        resource="ai.automation",
        details=f"Executed action {run.action_key}",
        details_json={
            "action_run_id": run.id,
            "output_keys": list((output or {}).keys()),
            "duration_ms": int((perf_counter() - start) * 1000),
        },
    )
    return _action_to_schema(run)


async def generate_anomaly_insights_direct(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user: User,
    session_id: int | None = None,
) -> AiAnomalyGenerateResponse:
    start = perf_counter()
    ensure_tenant_access(user, tenant)
    await require_ai_access(db, user)
    request_id = uuid4().hex
    await _ensure_session_access(
        db,
        tenant=tenant,
        user=user,
        session_id=session_id,
        request_id=request_id,
        action="ANOMALY_SESSION_ACCESS_BLOCKED",
    )
    settings = get_settings()
    payload = await call_with_timeout(
        settings.ai_timeout_heavy_seconds,
        generate_anomaly_insights(
            db,
            tenant_id=tenant.id,
            user=user,
            request_id=request_id,
            session_id=session_id,
        ),
        error_message="Anomaly generation timed out. Please retry.",
    )
    await audit.log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        session_id=session_id,
        action="ANOMALY_INSIGHTS_GENERATED",
        request_id=request_id,
        resource="ai.insights",
        details="Direct anomaly insight run completed",
        details_json={
            "events_count": len(payload.get("events", [])),
            "logic_version": payload.get("logic_version"),
            "duration_ms": int((perf_counter() - start) * 1000),
        },
    )
    return AiAnomalyGenerateResponse(
        summary=str(payload.get("summary") or ""),
        events=list(payload.get("events") or []),
        persisted_event_ids=list(payload.get("persisted_event_ids") or []),
        logic_version=str(payload.get("logic_version") or "phase7-rules-v1"),
        scheduler_ready=bool(payload.get("scheduler_ready", True)),
    )
