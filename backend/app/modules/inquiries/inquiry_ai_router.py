"""Inquiry AI routes: /api/v1/inquiries/ai/* (mounted before /{inquiry_id})."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.inquiries import inquiry_ai_batches as iq_batches
from app.modules.inquiries import inquiry_ai_service as iq_svc
from app.modules.inquiries.inquiry_ai_authz import require_inquiry_ai_capability
from app.modules.inquiries.inquiry_ai_schemas import (
    InquiryAiApplyConflict,
    InquiryAiApplySuggestionsRequest,
    InquiryAiApplySuggestionsResponse,
    InquiryAiAuditListResponse,
    InquiryAiDedupeRequest,
    InquiryAiDedupeResponse,
    InquiryAiDiscardBatchRequest,
    InquiryAiEnrichRequest,
    InquiryAiEnrichResponse,
    InquiryAiExtractWrapResponse,
    InquiryAiFinalizeAfterCreateRequest,
    InquiryAiFinalizeAfterCreateResponse,
    InquiryAiInquiryOut,
    InquiryAiLinkBatchRequest,
    InquiryAiMarkDecisionsRequest,
    InquiryAiNextActionsRequest,
    InquiryAiNextActionsResponse,
    InquiryAiSummaryRequest,
    InquiryAiSummaryResponse,
    InquiryAiValidateRequest,
    InquiryAiValidateResponse,
)
from app.modules.master_data_ai.request_context import master_data_ai_trace_dependency

router = APIRouter()

_heavy_rl = Depends(rate_limit_dependency("heavy"))
_read_rl = Depends(rate_limit_dependency("read"))


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/extract", response_model=InquiryAiExtractWrapResponse)
async def inquiry_ai_extract(
    file: UploadFile = File(...),
    inquiry_id: int | None = Form(default=None),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "extract")
    body = await file.read()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    ct = file.content_type or "application/octet-stream"
    return await iq_svc.ai_extract_document(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        file_bytes=body,
        content_type=ct,
        inquiry_id=inquiry_id,
    )


@router.post("/enrich", response_model=InquiryAiEnrichResponse)
async def inquiry_ai_enrich(
    body: InquiryAiEnrichRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "enrich")
    return await iq_svc.ai_enrich(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/validate", response_model=InquiryAiValidateResponse)
async def inquiry_ai_validate(
    body: InquiryAiValidateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "validate")
    return await iq_svc.ai_validate(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/dedupe", response_model=InquiryAiDedupeResponse)
async def inquiry_ai_dedupe(
    body: InquiryAiDedupeRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "dedupe")
    return await iq_svc.ai_dedupe(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/summary", response_model=InquiryAiSummaryResponse)
async def inquiry_ai_summary(
    body: InquiryAiSummaryRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "summary")
    return await iq_svc.ai_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/next-actions", response_model=InquiryAiNextActionsResponse)
async def inquiry_ai_next_actions(
    body: InquiryAiNextActionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "next_actions")
    return await iq_svc.ai_next_actions(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.get("/audit-log", response_model=InquiryAiAuditListResponse)
async def inquiry_ai_audit_log(
    inquiry_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "audit")
    return await iq_svc.list_inquiry_ai_audit_logs(db, tenant_id=tenant.id, inquiry_id=inquiry_id, limit=limit)


@router.post("/suggestion-batch/mark-decisions")
async def inquiry_ai_suggestion_mark_decisions(
    body: InquiryAiMarkDecisionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "apply_suggestions")
    await iq_batches.mark_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        decisions=[(d.field_key, d.decision) for d in body.decisions],
    )
    return {"ok": True}


@router.post("/suggestion-batch/apply-suggestions", response_model=InquiryAiApplySuggestionsResponse)
async def inquiry_ai_suggestion_apply(
    body: InquiryAiApplySuggestionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "apply_suggestions")
    raw = await iq_batches.apply_suggestions_to_inquiry(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        inquiry_id=body.inquiry_id,
        actions=[(i.field_key, i.decision) for i in body.items],
        conflict_mode=body.conflict_mode,
    )
    return InquiryAiApplySuggestionsResponse(
        inquiry=InquiryAiInquiryOut.model_validate(raw["inquiry"]),
        applied_fields=raw["applied_fields"],
        skipped_fields=raw["skipped_fields"],
        rejected_fields=raw["rejected_fields"],
        conflicts=[
            InquiryAiApplyConflict(
                field=c["field"],
                current=c.get("current") or "",
                suggested=c.get("suggested") or "",
            )
            for c in raw["conflicts"]
        ],
    )


@router.post("/suggestion-batch/discard")
async def inquiry_ai_suggestion_discard(
    body: InquiryAiDiscardBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "discard_suggestions")
    await iq_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=body.batch_id)
    return {"ok": True}


@router.post("/suggestion-batch/link-inquiry")
async def inquiry_ai_suggestion_link(
    body: InquiryAiLinkBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "apply_suggestions")
    await iq_batches.link_batch_to_inquiry(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        inquiry_id=body.inquiry_id,
    )
    return {"ok": True}


@router.post("/suggestion-batch/finalize-after-create", response_model=InquiryAiFinalizeAfterCreateResponse)
async def inquiry_ai_suggestion_finalize_create(
    body: InquiryAiFinalizeAfterCreateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_inquiry_ai_capability(db, user, "apply_suggestions")
    raw = await iq_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        inquiry_id=body.inquiry_id,
    )
    return InquiryAiFinalizeAfterCreateResponse(**raw)
