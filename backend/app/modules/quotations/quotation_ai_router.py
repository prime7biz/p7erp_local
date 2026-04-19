"""Quotation AI routes: /api/v1/quotations/ai/* (mounted before /{quotation_id})."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.storage import _read_upload_with_limit
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Quotation, Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.quotations import quotation_ai_batches as qt_batches
from app.modules.quotations import quotation_ai_service as qt_svc
from app.modules.quotations import quotation_costing_ai_service as qc_svc
from app.modules.quotations import quotation_cost_benchmark_service as qcb_svc
from app.modules.quotations import quotation_costing_suggestion_service as qcs_svc
from app.modules.quotations.quotation_ai_authz import require_quotation_ai_capability
from app.modules.quotations.quotation_costing_feature import (
    require_quotation_cost_benchmark,
    require_quotation_costing_phase1,
    require_quotation_costing_phase2,
)
from app.modules.quotations.quotation_ai_schemas import (
    QuotationAiApplyConflict,
    QuotationAiApplyRequiresChangeItem,
    QuotationAiApplySuggestionsRequest,
    QuotationAiApplySuggestionsResponse,
    QuotationAiAuditListResponse,
    QuotationAiDedupeRequest,
    QuotationAiDedupeResponse,
    QuotationAiDiscardBatchRequest,
    QuotationAiEnrichRequest,
    QuotationAiEnrichResponse,
    QuotationAiExtractWrapResponse,
    QuotationAiFinalizeAfterCreateRequest,
    QuotationAiFinalizeAfterCreateResponse,
    QuotationAiLinkBatchRequest,
    QuotationAiMarkDecisionsRequest,
    QuotationAiNextActionsRequest,
    QuotationAiNextActionsResponse,
    QuotationAiQuotationOut,
    QuotationAiSummaryRequest,
    QuotationAiSummaryResponse,
    QuotationAiValidateRequest,
    QuotationAiValidateResponse,
    QuotationCostingAiAnomalyScanResponse,
    QuotationCostingAiCompletenessResponse,
    QuotationCostingAiCostingSummaryResponse,
    QuotationCostingAiFxSensitivityResponse,
    QuotationCostingAiMarginRiskResponse,
    QuotationCostingAiNextActionsResponse,
    QuotationCostingAiRequest,
    QuotationCostingSuggestionApplyRequest,
    QuotationCostingSuggestionApplyResponse,
    QuotationCostingSuggestionBatchOut,
    QuotationCostingSuggestionDiscardRequest,
    QuotationCostingSuggestionItemOut,
    QuotationCostingSuggestionMarkDecisionsRequest,
    CostBenchmarkRequest,
    CostBenchmarkResponse,
    CostBenchmarkHistoryResponse,
    CostBenchmarkHistoryEntry,
    BenchmarkMetricOut,
    BenchmarkRange,
)
from app.modules.master_data_ai.request_context import master_data_ai_trace_dependency

router = APIRouter()

_heavy_rl = Depends(rate_limit_dependency("heavy"))
_read_rl = Depends(rate_limit_dependency("read"))
_MAX_EXTRACT_BYTES = 10 * 1024 * 1024


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/extract", response_model=QuotationAiExtractWrapResponse)
async def quotation_ai_extract(
    file: UploadFile = File(...),
    quotation_id: int | None = Form(default=None),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "extract")
    if quotation_id is not None:
        r = await db.execute(
            select(Quotation).where(Quotation.id == quotation_id, Quotation.tenant_id == tenant.id)
        )
        if r.scalar_one_or_none() is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")
    body = await _read_upload_with_limit(file, _MAX_EXTRACT_BYTES)
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    ct = file.content_type or "application/octet-stream"
    return await qt_svc.ai_extract_document(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        file_bytes=body,
        content_type=ct,
        quotation_id=quotation_id,
    )


@router.post("/enrich", response_model=QuotationAiEnrichResponse)
async def quotation_ai_enrich(
    body: QuotationAiEnrichRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "enrich")
    return await qt_svc.ai_enrich(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/validate", response_model=QuotationAiValidateResponse)
async def quotation_ai_validate(
    body: QuotationAiValidateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "validate")
    return await qt_svc.ai_validate(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/dedupe", response_model=QuotationAiDedupeResponse)
async def quotation_ai_dedupe(
    body: QuotationAiDedupeRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "dedupe")
    return await qt_svc.ai_dedupe(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/summary", response_model=QuotationAiSummaryResponse)
async def quotation_ai_summary(
    body: QuotationAiSummaryRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "summary")
    return await qt_svc.ai_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/next-actions", response_model=QuotationAiNextActionsResponse)
async def quotation_ai_next_actions(
    body: QuotationAiNextActionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "next_actions")
    return await qt_svc.ai_next_actions(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.get("/audit-log", response_model=QuotationAiAuditListResponse)
async def quotation_ai_audit_log(
    quotation_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "audit")
    return await qt_svc.list_quotation_ai_audit_logs(db, tenant_id=tenant.id, quotation_id=quotation_id, limit=limit)


# ----- Read-only costing intelligence (Phase 1; no LLM; audited) -----


@router.post("/cost-completeness-check", response_model=QuotationCostingAiCompletenessResponse)
async def quotation_costing_completeness_check(
    body: QuotationCostingAiRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase1(tenant=tenant)
    return await qc_svc.run_cost_completeness_check(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/costing-anomaly-scan", response_model=QuotationCostingAiAnomalyScanResponse)
async def quotation_costing_anomaly_scan(
    body: QuotationCostingAiRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase1(tenant=tenant)
    return await qc_svc.run_costing_anomaly_scan(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/margin-risk-explanation", response_model=QuotationCostingAiMarginRiskResponse)
async def quotation_costing_margin_risk(
    body: QuotationCostingAiRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase1(tenant=tenant)
    return await qc_svc.run_margin_risk_explanation(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/fx-sensitivity-summary", response_model=QuotationCostingAiFxSensitivityResponse)
async def quotation_costing_fx_sensitivity(
    body: QuotationCostingAiRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase1(tenant=tenant)
    return await qc_svc.run_fx_sensitivity_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/costing-summary", response_model=QuotationCostingAiCostingSummaryResponse)
async def quotation_costing_summary(
    body: QuotationCostingAiRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase1(tenant=tenant)
    return await qc_svc.run_costing_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/costing-next-actions", response_model=QuotationCostingAiNextActionsResponse)
async def quotation_costing_next_actions(
    body: QuotationCostingAiRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase1(tenant=tenant)
    return await qc_svc.run_costing_next_actions(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/costing-suggestions", response_model=QuotationCostingSuggestionBatchOut)
async def quotation_costing_suggestions_generate(
    body: QuotationCostingAiRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase1(tenant=tenant)
    require_quotation_costing_phase2(tenant=tenant)
    raw = await qcs_svc.generate_costing_suggestions(
        db, tenant_id=tenant.id, user_id=user.id, quotation_id=body.quotation_id
    )
    batch = raw["batch"]
    items = raw["items"]
    return QuotationCostingSuggestionBatchOut(
        **qcs_svc.batch_to_dict(batch),
        items=[QuotationCostingSuggestionItemOut(**qcs_svc.item_to_dict(i)) for i in items],
    )


@router.post("/costing-suggestions/mark-decisions")
async def quotation_costing_suggestions_mark(
    body: QuotationCostingSuggestionMarkDecisionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "apply_suggestions")
    require_quotation_costing_phase2(tenant=tenant)
    await qcs_svc.mark_costing_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        decisions=[(d.item_id, d.decision) for d in body.decisions],
    )
    return {"ok": True}


@router.post("/costing-suggestions/apply", response_model=QuotationCostingSuggestionApplyResponse)
async def quotation_costing_suggestions_apply(
    body: QuotationCostingSuggestionApplyRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "apply_suggestions")
    require_quotation_costing_phase2(tenant=tenant)
    raw = await qcs_svc.apply_costing_suggestions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        quotation_id=body.quotation_id,
        batch_id=body.batch_id,
        actions=[(d.item_id, d.decision) for d in body.items],
    )
    return QuotationCostingSuggestionApplyResponse(**raw)


@router.post("/costing-suggestions/discard")
async def quotation_costing_suggestions_discard(
    body: QuotationCostingSuggestionDiscardRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "discard_suggestions")
    require_quotation_costing_phase2(tenant=tenant)
    await qcs_svc.discard_costing_suggestion_batch(
        db, tenant_id=tenant.id, user_id=user.id, batch_id=body.batch_id
    )
    return {"ok": True}


@router.get("/costing-suggestions/{batch_id}", response_model=QuotationCostingSuggestionBatchOut)
async def quotation_costing_suggestions_get(
    batch_id: int,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_costing_phase2(tenant=tenant)
    raw = await qcs_svc.get_costing_suggestion_batch(db, tenant_id=tenant.id, batch_id=batch_id)
    batch = raw["batch"]
    items = raw["items"]
    return QuotationCostingSuggestionBatchOut(
        **qcs_svc.batch_to_dict(batch),
        items=[QuotationCostingSuggestionItemOut(**qcs_svc.item_to_dict(i)) for i in items],
    )


@router.post("/cost-benchmark", response_model=CostBenchmarkResponse)
async def quotation_cost_benchmark(
    body: CostBenchmarkRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "costing_intelligence")
    require_quotation_cost_benchmark(tenant=tenant)
    raw = await qcb_svc.compute_cost_benchmark(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        quotation_id=body.quotation_id,
        same_customer_only=body.same_customer_only,
        months_back=body.months_back,
    )
    metrics = []
    for m in raw.get("metrics", []):
        br = m.get("benchmark_range") or {}
        metrics.append(
            BenchmarkMetricOut(
                metric_key=m["metric_key"],
                benchmark_range=BenchmarkRange(
                    min=br.get("min"),
                    max=br.get("max"),
                    avg=br.get("avg"),
                    p25=br.get("p25"),
                    p75=br.get("p75"),
                ),
                current_value=m.get("current_value"),
                deviation_percent=m.get("deviation_percent"),
                confidence=float(m.get("confidence") or 0.5),
                classification=m["classification"],
                reason_code=m.get("reason_code"),
                explanation=m.get("explanation"),
            )
        )
    return CostBenchmarkResponse(
        advisory_notice=raw.get("advisory_notice") or "",
        quotation_id=raw["quotation_id"],
        insufficient_data=raw["insufficient_data"],
        similar_quotation_count=raw["similar_quotation_count"],
        overall_classification=raw["overall_classification"],
        overall_confidence=float(raw.get("overall_confidence") or 0.2),
        metrics=metrics,
        summary=raw.get("summary") or "",
        next_actions=raw.get("next_actions") or [],
        source_mode=raw.get("source_mode") or "deterministic_only",
        reason_codes=raw.get("reason_codes") or [],
    )


@router.get("/cost-benchmark-history", response_model=CostBenchmarkHistoryResponse)
async def quotation_cost_benchmark_history(
    quotation_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "audit")
    require_quotation_cost_benchmark(tenant=tenant)
    rows = await qcb_svc.list_cost_benchmark_history(
        db, tenant_id=tenant.id, quotation_id=quotation_id, limit=limit
    )
    return CostBenchmarkHistoryResponse(
        items=[CostBenchmarkHistoryEntry(**x) for x in rows],
    )


@router.get("/costing-audit-log", response_model=QuotationAiAuditListResponse)
async def quotation_costing_audit_log(
    quotation_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "audit")
    return await qc_svc.list_quotation_costing_ai_audit_logs(
        db, tenant_id=tenant.id, quotation_id=quotation_id, limit=limit
    )


@router.post("/suggestion-batch/mark-decisions")
async def quotation_ai_suggestion_mark_decisions(
    body: QuotationAiMarkDecisionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "apply_suggestions")
    await qt_batches.mark_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        decisions=[(d.field_key, d.decision) for d in body.decisions],
    )
    return {"ok": True}


@router.post("/suggestion-batch/apply-suggestions", response_model=QuotationAiApplySuggestionsResponse)
async def quotation_ai_suggestion_apply(
    body: QuotationAiApplySuggestionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "apply_suggestions")
    raw = await qt_batches.apply_suggestions_to_quotation(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        quotation_id=body.quotation_id,
        actions=[(i.field_key, i.decision) for i in body.items],
        conflict_mode=body.conflict_mode,
    )
    return QuotationAiApplySuggestionsResponse(
        quotation=QuotationAiQuotationOut.model_validate(raw["quotation"]),
        applied_fields=raw["applied_fields"],
        skipped_fields=raw["skipped_fields"],
        rejected_fields=raw["rejected_fields"],
        conflicts=[
            QuotationAiApplyConflict(
                field=c["field"],
                current=c.get("current") or "",
                suggested=c.get("suggested") or "",
            )
            for c in raw["conflicts"]
        ],
        requires_change_request=[
            QuotationAiApplyRequiresChangeItem(field_key=x["field_key"], message=x.get("message") or "")
            for x in raw.get("requires_change_request") or []
        ],
    )


@router.post("/suggestion-batch/discard")
async def quotation_ai_suggestion_discard(
    body: QuotationAiDiscardBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "discard_suggestions")
    await qt_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=body.batch_id)
    return {"ok": True}


@router.post("/suggestion-batch/link-quotation")
async def quotation_ai_suggestion_link(
    body: QuotationAiLinkBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "apply_suggestions")
    await qt_batches.link_batch_to_quotation(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        quotation_id=body.quotation_id,
    )
    return {"ok": True}


@router.post("/suggestion-batch/finalize-after-create", response_model=QuotationAiFinalizeAfterCreateResponse)
async def quotation_ai_suggestion_finalize_create(
    body: QuotationAiFinalizeAfterCreateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_quotation_ai_capability(db, user, "apply_suggestions")
    raw = await qt_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        quotation_id=body.quotation_id,
    )
    return QuotationAiFinalizeAfterCreateResponse(**raw)
