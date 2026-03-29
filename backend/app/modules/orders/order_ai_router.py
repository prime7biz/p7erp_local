"""Order AI routes: /api/v1/orders/ai/* (mounted before /{order_id})."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.master_data_ai.request_context import master_data_ai_trace_dependency
from app.modules.orders import order_ai_batches as ord_batches
from app.modules.orders import order_ai_service as ord_svc
from app.modules.orders.order_ai_authz import require_order_ai_capability
from app.modules.orders.order_ai_schemas import (
    OrderAiAtpCtpSummaryRequest,
    OrderAiAtpCtpSummaryResponse,
    OrderAiApplyConflict,
    OrderAiApplySuggestionsRequest,
    OrderAiApplySuggestionsResponse,
    OrderAiAuditListResponse,
    OrderAiCapacityBottleneckScanRequest,
    OrderAiCapacityBottleneckScanResponse,
    OrderAiDedupeRequest,
    OrderAiDedupeResponse,
    OrderAiDiscardBatchRequest,
    OrderAiEnrichRequest,
    OrderAiEnrichResponse,
    OrderAiExecutionPlanningSummaryRequest,
    OrderAiExecutionPlanningSummaryResponse,
    OrderAiExtractWrapResponse,
    OrderAiFinalizeAfterCreateRequest,
    OrderAiFinalizeAfterCreateResponse,
    OrderAiLinkBatchRequest,
    OrderAiMarkDecisionsRequest,
    OrderAiNextActionsRequest,
    OrderAiNextActionsResponse,
    OrderAiOrderOut,
    OrderAiPlanningRiskCheckRequest,
    OrderAiPlanningRiskCheckResponse,
    OrderAiPromiseSensitivityCheckRequest,
    OrderAiPromiseSensitivityCheckResponse,
    OrderAiSummaryRequest,
    OrderAiSummaryResponse,
    OrderAiValidateRequest,
    OrderAiValidateExecutionRequest,
    OrderAiValidateExecutionResponse,
    OrderAiValidateResponse,
    OrderAiWhatIfSimulationRequest,
    OrderAiWhatIfSimulationResponse,
)

router = APIRouter()

_heavy_rl = Depends(rate_limit_dependency("heavy"))
_read_rl = Depends(rate_limit_dependency("read"))


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/extract", response_model=OrderAiExtractWrapResponse)
async def order_ai_extract(
    file: UploadFile = File(...),
    order_id: int | None = Form(default=None),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "extract")
    body = await file.read()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    ct = file.content_type or "application/octet-stream"
    return await ord_svc.ai_extract_document(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        file_bytes=body,
        content_type=ct,
        order_id=order_id,
    )


@router.post("/enrich", response_model=OrderAiEnrichResponse)
async def order_ai_enrich(
    body: OrderAiEnrichRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "enrich")
    return await ord_svc.ai_enrich(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/validate", response_model=OrderAiValidateResponse)
async def order_ai_validate(
    body: OrderAiValidateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "validate")
    return await ord_svc.ai_validate(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/validate-execution", response_model=OrderAiValidateExecutionResponse)
async def order_ai_validate_execution(
    body: OrderAiValidateExecutionRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "validate_execution")
    return await ord_svc.ai_validate_execution(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/planning-risk-check", response_model=OrderAiPlanningRiskCheckResponse)
async def order_ai_planning_risk_check(
    body: OrderAiPlanningRiskCheckRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "planning_risk_check")
    return await ord_svc.ai_planning_risk_check(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/atp-ctp-summary", response_model=OrderAiAtpCtpSummaryResponse)
async def order_ai_atp_ctp_summary(
    body: OrderAiAtpCtpSummaryRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "atp_ctp_summary")
    return await ord_svc.ai_atp_ctp_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/dedupe", response_model=OrderAiDedupeResponse)
async def order_ai_dedupe(
    body: OrderAiDedupeRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "dedupe")
    return await ord_svc.ai_dedupe(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/summary", response_model=OrderAiSummaryResponse)
async def order_ai_summary(
    body: OrderAiSummaryRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "summary")
    return await ord_svc.ai_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/next-actions", response_model=OrderAiNextActionsResponse)
async def order_ai_next_actions(
    body: OrderAiNextActionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "next_actions")
    return await ord_svc.ai_next_actions(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/capacity-bottleneck-scan", response_model=OrderAiCapacityBottleneckScanResponse)
async def order_ai_capacity_bottleneck_scan(
    body: OrderAiCapacityBottleneckScanRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "capacity_bottleneck_scan")
    return await ord_svc.ai_capacity_bottleneck_scan(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/what-if-simulation", response_model=OrderAiWhatIfSimulationResponse)
async def order_ai_what_if_simulation(
    body: OrderAiWhatIfSimulationRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "what_if_simulation")
    return await ord_svc.ai_what_if_simulation(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/promise-sensitivity-check", response_model=OrderAiPromiseSensitivityCheckResponse)
async def order_ai_promise_sensitivity_check(
    body: OrderAiPromiseSensitivityCheckRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "promise_sensitivity_check")
    return await ord_svc.ai_promise_sensitivity_check(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/planning-summary", response_model=OrderAiExecutionPlanningSummaryResponse)
async def order_ai_execution_planning_summary(
    body: OrderAiExecutionPlanningSummaryRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "execution_planning_summary")
    return await ord_svc.ai_execution_planning_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.get("/audit-log", response_model=OrderAiAuditListResponse)
async def order_ai_audit_log(
    order_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    surface: str = Query(default="all", pattern="^(all|planning)$"),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "audit")
    return await ord_svc.list_order_ai_audit_logs(
        db,
        tenant_id=tenant.id,
        order_id=order_id,
        limit=limit,
        planning_only=(surface == "planning"),
    )


@router.get("/planning-audit-log", response_model=OrderAiAuditListResponse)
async def order_ai_planning_audit_log(
    order_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "planning_audit")
    return await ord_svc.list_order_ai_audit_logs(
        db,
        tenant_id=tenant.id,
        order_id=order_id,
        limit=limit,
        planning_only=True,
    )


@router.get("/simulation-audit-log", response_model=OrderAiAuditListResponse)
async def order_ai_simulation_audit_log(
    order_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "simulation_audit")
    return await ord_svc.list_order_ai_audit_logs(
        db,
        tenant_id=tenant.id,
        order_id=order_id,
        limit=limit,
        simulation_only=True,
    )


@router.post("/suggestion-batch/mark-decisions")
async def order_ai_suggestion_mark_decisions(
    body: OrderAiMarkDecisionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "apply_suggestions")
    await ord_batches.mark_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        decisions=[(d.field_key, d.decision) for d in body.decisions],
    )
    return {"ok": True}


@router.post("/suggestion-batch/apply-suggestions", response_model=OrderAiApplySuggestionsResponse)
async def order_ai_suggestion_apply(
    body: OrderAiApplySuggestionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "apply_suggestions")
    raw = await ord_batches.apply_suggestions_to_order(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        order_id=body.order_id,
        actions=[(i.field_key, i.decision) for i in body.items],
        conflict_mode=body.conflict_mode,
    )
    return OrderAiApplySuggestionsResponse(
        order=OrderAiOrderOut.model_validate(raw["order"]),
        applied_fields=raw["applied_fields"],
        skipped_fields=raw["skipped_fields"],
        rejected_fields=raw["rejected_fields"],
        conflicts=[
            OrderAiApplyConflict(
                field=c["field"],
                current=c.get("current") or "",
                suggested=c.get("suggested") or "",
            )
            for c in raw["conflicts"]
        ],
    )


@router.post("/suggestion-batch/discard")
async def order_ai_suggestion_discard(
    body: OrderAiDiscardBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "discard_suggestions")
    await ord_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=body.batch_id)
    return {"ok": True}


@router.post("/suggestion-batch/link-order")
async def order_ai_suggestion_link(
    body: OrderAiLinkBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "apply_suggestions")
    await ord_batches.link_batch_to_order(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        order_id=body.order_id,
    )
    return {"ok": True}


@router.post("/suggestion-batch/finalize-after-create", response_model=OrderAiFinalizeAfterCreateResponse)
async def order_ai_suggestion_finalize_create(
    body: OrderAiFinalizeAfterCreateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_order_ai_capability(db, user, "apply_suggestions")
    raw = await ord_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        order_id=body.order_id,
    )
    return OrderAiFinalizeAfterCreateResponse(**raw)
