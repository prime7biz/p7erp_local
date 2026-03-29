"""Quotation AI routes: /api/v1/quotations/ai/* (mounted before /{quotation_id})."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.quotations import quotation_ai_batches as qt_batches
from app.modules.quotations import quotation_ai_service as qt_svc
from app.modules.quotations.quotation_ai_authz import require_quotation_ai_capability
from app.modules.quotations.quotation_ai_schemas import (
    QuotationAiApplyConflict,
    QuotationAiApplySuggestionsRequest,
    QuotationAiApplySuggestionsResponse,
    QuotationAiAuditListResponse,
    QuotationAiDedupeRequest,
    QuotationAiDedupeResponse,
    QuotationAiDiscardBatchRequest,
    QuotationAiEnrichRequest,
    QuotationAiEnrichResponse,
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
)
from app.modules.master_data_ai.request_context import master_data_ai_trace_dependency

router = APIRouter()

_heavy_rl = Depends(rate_limit_dependency("heavy"))
_read_rl = Depends(rate_limit_dependency("read"))


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


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
