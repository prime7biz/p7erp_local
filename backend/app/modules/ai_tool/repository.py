from __future__ import annotations

from datetime import datetime, timedelta
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order
from app.models.ai_tool import (
    AiAuditLog,
    AiActionRun,
    AiAnomalyEvent,
    AiAutomationRule,
    AiForecastRun,
    AiKnowledgeChunk,
    AiKnowledgeDocument,
    AiMessage,
    AiReportRun,
    AiSavedPrompt,
    AiSession,
    AiToolInvocation,
)


async def list_sessions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    limit: int = 50,
    offset: int = 0,
) -> list[AiSession]:
    result = await db.execute(
        select(AiSession)
        .where(AiSession.tenant_id == tenant_id, AiSession.user_id == user_id)
        .order_by(AiSession.last_message_at.desc().nullslast(), AiSession.id.desc())
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all())


async def create_session(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    session_code: str,
    title: str | None,
) -> AiSession:
    row = AiSession(
        tenant_id=tenant_id,
        user_id=user_id,
        session_code=session_code,
        title=title,
        status="ACTIVE",
    )
    db.add(row)
    await db.flush()
    return row


async def get_session(
    db: AsyncSession,
    *,
    tenant_id: int,
    session_id: int,
) -> AiSession | None:
    result = await db.execute(
        select(AiSession).where(
            AiSession.id == session_id,
            AiSession.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


async def list_messages(
    db: AsyncSession,
    *,
    tenant_id: int,
    session_id: int,
    limit: int = 200,
) -> list[AiMessage]:
    result = await db.execute(
        select(AiMessage)
        .where(AiMessage.tenant_id == tenant_id, AiMessage.session_id == session_id)
        .order_by(AiMessage.message_index.asc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def create_message(
    db: AsyncSession,
    *,
    tenant_id: int,
    session_id: int,
    sender_user_id: int | None,
    role: str,
    content: str,
    content_json: dict | None = None,
) -> AiMessage:
    current_index = (
        await db.execute(
            select(func.max(AiMessage.message_index)).where(
                AiMessage.tenant_id == tenant_id,
                AiMessage.session_id == session_id,
            )
        )
    ).scalar()
    next_index = int(current_index or 0) + 1
    row = AiMessage(
        tenant_id=tenant_id,
        session_id=session_id,
        sender_user_id=sender_user_id,
        message_index=next_index,
        role=role,
        content=content,
        content_json=content_json,
    )
    db.add(row)
    await db.flush()
    return row


async def touch_session_last_message(
    db: AsyncSession,
    *,
    session: AiSession,
) -> None:
    session.last_message_at = datetime.utcnow()
    await db.flush()


async def create_tool_invocation(
    db: AsyncSession,
    *,
    tenant_id: int,
    session_id: int,
    message_id: int | None,
    invocation_code: str,
    tool_name: str,
    input_json: dict | None,
) -> AiToolInvocation:
    row = AiToolInvocation(
        tenant_id=tenant_id,
        session_id=session_id,
        message_id=message_id,
        invocation_code=invocation_code,
        tool_name=tool_name,
        status="RUNNING",
        input_json=input_json,
    )
    db.add(row)
    await db.flush()
    return row


async def finish_tool_invocation(
    db: AsyncSession,
    *,
    invocation: AiToolInvocation,
    status: str,
    latency_ms: int,
    output_json: dict | None = None,
    error_text: str | None = None,
) -> None:
    invocation.status = status
    invocation.latency_ms = latency_ms
    invocation.output_json = output_json
    invocation.error_text = error_text
    invocation.finished_at = datetime.utcnow()
    await db.flush()


async def list_saved_prompts(db: AsyncSession, *, tenant_id: int) -> list[AiSavedPrompt]:
    result = await db.execute(
        select(AiSavedPrompt)
        .where(AiSavedPrompt.tenant_id == tenant_id, AiSavedPrompt.is_active.is_(True))
        .order_by(AiSavedPrompt.id.asc())
    )
    return list(result.scalars().all())


async def create_report_run(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    session_id: int | None,
    request_id: str | None,
    report_code: str,
    report_name: str,
    source_modules: list[str],
    parameters_json: dict | None,
) -> AiReportRun:
    row = AiReportRun(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        request_id=request_id,
        report_code=report_code,
        report_name=report_name,
        status="RUNNING",
        source_modules=source_modules,
        parameters_json=parameters_json,
    )
    db.add(row)
    await db.flush()
    return row


async def complete_report_run(
    db: AsyncSession,
    *,
    row: AiReportRun,
    status: str,
    narrative_summary: str,
    result_json: dict,
) -> None:
    row.status = status
    row.narrative_summary = narrative_summary
    row.result_json = result_json
    row.completed_at = datetime.utcnow()
    await db.flush()


async def list_report_runs(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    limit: int = 30,
) -> list[AiReportRun]:
    result = await db.execute(
        select(AiReportRun)
        .where(AiReportRun.tenant_id == tenant_id, AiReportRun.user_id == user_id)
        .order_by(AiReportRun.created_at.desc(), AiReportRun.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def create_forecast_run(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    session_id: int | None,
    request_id: str | None,
    forecast_code: str,
    forecast_name: str,
    source_modules: list[str],
    assumptions_json: dict | None,
    parameters_json: dict | None,
) -> AiForecastRun:
    row = AiForecastRun(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        request_id=request_id,
        forecast_code=forecast_code,
        forecast_name=forecast_name,
        status="RUNNING",
        source_modules=source_modules,
        assumptions_json=assumptions_json,
        parameters_json=parameters_json,
    )
    db.add(row)
    await db.flush()
    return row


async def complete_forecast_run(
    db: AsyncSession,
    *,
    row: AiForecastRun,
    status: str,
    confidence_score: float | None,
    narrative_explanation: str,
    result_json: dict,
) -> None:
    row.status = status
    row.confidence_score = confidence_score
    row.narrative_explanation = narrative_explanation
    row.result_json = result_json
    row.completed_at = datetime.utcnow()
    await db.flush()


async def list_forecast_runs(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    limit: int = 30,
) -> list[AiForecastRun]:
    result = await db.execute(
        select(AiForecastRun)
        .where(AiForecastRun.tenant_id == tenant_id, AiForecastRun.user_id == user_id)
        .order_by(AiForecastRun.created_at.desc(), AiForecastRun.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_knowledge_document_by_code(
    db: AsyncSession,
    *,
    tenant_id: int | None,
    document_code: str,
) -> AiKnowledgeDocument | None:
    result = await db.execute(
        select(AiKnowledgeDocument).where(
            AiKnowledgeDocument.tenant_id == tenant_id,
            AiKnowledgeDocument.document_code == document_code,
        )
    )
    return result.scalar_one_or_none()


async def create_knowledge_document(
    db: AsyncSession,
    *,
    tenant_id: int | None,
    document_code: str,
    title: str,
    doc_type: str,
    source_area: str,
    owner_scope: str,
    visibility: str,
    permission_key: str | None,
    version_tag: str | None,
    metadata_json: dict | None,
) -> AiKnowledgeDocument:
    row = AiKnowledgeDocument(
        tenant_id=tenant_id,
        document_code=document_code,
        title=title,
        doc_type=doc_type,
        source_area=source_area,
        owner_scope=owner_scope,
        visibility=visibility,
        permission_key=permission_key,
        version_tag=version_tag,
        metadata_json=metadata_json,
        is_active=True,
    )
    db.add(row)
    await db.flush()
    return row


async def replace_knowledge_chunks(
    db: AsyncSession,
    *,
    document: AiKnowledgeDocument,
    tenant_id: int | None,
    chunks: list[dict],
) -> None:
    old_rows = await db.execute(select(AiKnowledgeChunk).where(AiKnowledgeChunk.document_id == document.id))
    for row in old_rows.scalars().all():
        await db.delete(row)
    for idx, chunk in enumerate(chunks):
        row = AiKnowledgeChunk(
            tenant_id=tenant_id,
            document_id=document.id,
            chunk_index=idx,
            heading=chunk.get("heading"),
            content_text=str(chunk.get("content_text") or "").strip(),
            metadata_json=chunk.get("metadata_json") or {},
            token_count=chunk.get("token_count"),
        )
        db.add(row)
    await db.flush()


async def list_accessible_knowledge_documents(
    db: AsyncSession,
    *,
    tenant_id: int,
    limit: int = 100,
) -> list[AiKnowledgeDocument]:
    result = await db.execute(
        select(AiKnowledgeDocument)
        .where(
            AiKnowledgeDocument.is_active.is_(True),
            or_(AiKnowledgeDocument.tenant_id.is_(None), AiKnowledgeDocument.tenant_id == tenant_id),
        )
        .order_by(AiKnowledgeDocument.created_at.desc(), AiKnowledgeDocument.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def search_knowledge_chunks_raw(
    db: AsyncSession,
    *,
    tenant_id: int,
    terms: list[str],
    limit: int,
) -> list[tuple[AiKnowledgeChunk, AiKnowledgeDocument]]:
    clauses = [AiKnowledgeChunk.content_text.ilike(f"%{term}%") for term in terms if term]
    where_clause = or_(*clauses) if clauses else AiKnowledgeChunk.content_text.ilike("%%")
    result = await db.execute(
        select(AiKnowledgeChunk, AiKnowledgeDocument)
        .join(AiKnowledgeDocument, AiKnowledgeDocument.id == AiKnowledgeChunk.document_id)
        .where(
            where_clause,
            AiKnowledgeDocument.is_active.is_(True),
            or_(AiKnowledgeDocument.tenant_id.is_(None), AiKnowledgeDocument.tenant_id == tenant_id),
        )
        .order_by(AiKnowledgeChunk.id.desc())
        .limit(max(1, min(500, limit)))
    )
    return list(result.all())


async def get_automation_rule_by_code(
    db: AsyncSession,
    *,
    tenant_id: int,
    rule_code: str,
) -> AiAutomationRule | None:
    result = await db.execute(
        select(AiAutomationRule).where(
            AiAutomationRule.tenant_id == tenant_id,
            AiAutomationRule.rule_code == rule_code,
        )
    )
    return result.scalar_one_or_none()


async def create_automation_rule(
    db: AsyncSession,
    *,
    tenant_id: int,
    rule_code: str,
    action_key: str,
    label: str,
    is_enabled: bool,
    requires_confirmation: bool,
    permission_key: str | None,
    policy_json: dict | None,
) -> AiAutomationRule:
    row = AiAutomationRule(
        tenant_id=tenant_id,
        rule_code=rule_code,
        action_key=action_key,
        label=label,
        is_enabled=is_enabled,
        requires_confirmation=requires_confirmation,
        permission_key=permission_key,
        policy_json=policy_json or {},
    )
    db.add(row)
    await db.flush()
    return row


async def list_action_runs(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int,
    limit: int = 50,
) -> list[AiActionRun]:
    result = await db.execute(
        select(AiActionRun)
        .where(AiActionRun.tenant_id == tenant_id, AiActionRun.user_id == user_id)
        .order_by(AiActionRun.created_at.desc(), AiActionRun.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def get_action_run(
    db: AsyncSession,
    *,
    tenant_id: int,
    action_run_id: int,
) -> AiActionRun | None:
    result = await db.execute(
        select(AiActionRun).where(
            AiActionRun.id == action_run_id,
            AiActionRun.tenant_id == tenant_id,
        )
    )
    return result.scalar_one_or_none()


async def get_order_by_id(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int,
) -> Order | None:
    result = await db.execute(
        select(Order).where(Order.tenant_id == tenant_id, Order.id == order_id)
    )
    return result.scalar_one_or_none()


async def create_action_run(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    session_id: int | None,
    message_id: int | None,
    rule_id: int | None,
    request_id: str,
    action_key: str,
    status: str,
    requires_confirmation: bool,
    confirmation_token: str | None,
    confirmation_token_hash: str | None,
    confirmation_token_last4: str | None,
    risk_level: str,
    prompt_text: str,
    preview_text: str | None,
    input_json: dict | None,
) -> AiActionRun:
    row = AiActionRun(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        message_id=message_id,
        rule_id=rule_id,
        request_id=request_id,
        action_key=action_key,
        status=status,
        requires_confirmation=requires_confirmation,
        confirmation_token=confirmation_token,
        confirmation_token_hash=confirmation_token_hash,
        confirmation_token_last4=confirmation_token_last4,
        risk_level=risk_level,
        prompt_text=prompt_text,
        preview_text=preview_text,
        input_json=input_json or {},
    )
    db.add(row)
    await db.flush()
    return row


async def mark_action_run_confirmed(
    db: AsyncSession,
    *,
    row: AiActionRun,
) -> None:
    row.status = "CONFIRMED"
    row.confirmed_at = datetime.utcnow()
    # One-time token: clear it after successful confirmation.
    row.confirmation_token = None
    row.confirmation_token_hash = None
    row.confirmation_token_last4 = None
    await db.flush()


async def complete_action_run(
    db: AsyncSession,
    *,
    row: AiActionRun,
    status: str,
    output_json: dict | None = None,
    error_text: str | None = None,
) -> None:
    row.status = status
    row.output_json = output_json or {}
    row.error_text = error_text
    row.executed_at = datetime.utcnow()
    await db.flush()


async def create_anomaly_event(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    session_id: int | None,
    request_id: str | None,
    source_area: str,
    rule_code: str,
    severity: str,
    title: str,
    explanation: str,
    metrics_json: dict | None,
    dimensions_json: dict | None,
) -> AiAnomalyEvent:
    row = AiAnomalyEvent(
        tenant_id=tenant_id,
        user_id=user_id,
        session_id=session_id,
        request_id=request_id,
        source_area=source_area,
        rule_code=rule_code,
        severity=severity,
        title=title,
        explanation=explanation,
        metrics_json=metrics_json or {},
        dimensions_json=dimensions_json or {},
    )
    db.add(row)
    await db.flush()
    return row


async def list_anomaly_events(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None = None,
    limit: int = 50,
) -> list[AiAnomalyEvent]:
    clauses = [AiAnomalyEvent.tenant_id == tenant_id]
    if user_id is not None:
        clauses.append(AiAnomalyEvent.user_id == user_id)
    result = await db.execute(
        select(AiAnomalyEvent)
        .where(*clauses)
        .order_by(AiAnomalyEvent.created_at.desc(), AiAnomalyEvent.id.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def ai_ops_overview(
    db: AsyncSession,
    *,
    tenant_id: int,
    period_hours: int = 24,
) -> dict[str, int | float]:
    since = datetime.utcnow() - timedelta(hours=max(1, period_hours))

    total_events = (
        await db.execute(
            select(func.count(AiAuditLog.id)).where(
                AiAuditLog.tenant_id == tenant_id,
                AiAuditLog.created_at >= since,
            )
        )
    ).scalar_one()
    blocked_events = (
        await db.execute(
            select(func.count(AiAuditLog.id)).where(
                AiAuditLog.tenant_id == tenant_id,
                AiAuditLog.created_at >= since,
                AiAuditLog.severity == "WARN",
            )
        )
    ).scalar_one()
    error_events = (
        await db.execute(
            select(func.count(AiAuditLog.id)).where(
                AiAuditLog.tenant_id == tenant_id,
                AiAuditLog.created_at >= since,
                AiAuditLog.severity == "ERROR",
            )
        )
    ).scalar_one()
    avg_latency = (
        await db.execute(
            select(func.avg(AiToolInvocation.latency_ms)).where(
                AiToolInvocation.tenant_id == tenant_id,
                AiToolInvocation.started_at >= since,
                AiToolInvocation.latency_ms.is_not(None),
            )
        )
    ).scalar()
    total_invocations = (
        await db.execute(
            select(func.count(AiToolInvocation.id)).where(
                AiToolInvocation.tenant_id == tenant_id,
                AiToolInvocation.started_at >= since,
            )
        )
    ).scalar_one()
    success_invocations = (
        await db.execute(
            select(func.count(AiToolInvocation.id)).where(
                AiToolInvocation.tenant_id == tenant_id,
                AiToolInvocation.started_at >= since,
                AiToolInvocation.status == "SUCCESS",
            )
        )
    ).scalar_one()

    success_rate = (float(success_invocations) / float(total_invocations) * 100.0) if total_invocations else 0.0
    return {
        "total_events": int(total_events or 0),
        "blocked_events": int(blocked_events or 0),
        "error_events": int(error_events or 0),
        "avg_duration_ms": int(float(avg_latency or 0.0)),
        "tool_success_rate": round(success_rate, 2),
    }
