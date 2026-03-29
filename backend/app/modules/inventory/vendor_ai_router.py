"""Vendor (supplier) AI routes: /api/v1/inventory/vendors/ai/*"""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.inventory import vendor_ai_batches as vai_batches
from app.modules.inventory import vendor_ai_service as vai_svc
from app.modules.inventory.vendor_ai_authz import require_vendor_ai_capability
from app.modules.inventory.vendor_ai_schemas import (
    VendorAiApplyConflict,
    VendorAiApplySuggestionsRequest,
    VendorAiApplySuggestionsResponse,
    VendorAiAuditListResponse,
    VendorAiDedupeRequest,
    VendorAiDedupeResponse,
    VendorAiDiscardBatchRequest,
    VendorAiEnrichRequest,
    VendorAiEnrichResponse,
    VendorAiExtractWrapResponse,
    VendorAiFinalizeAfterCreateRequest,
    VendorAiFinalizeAfterCreateResponse,
    VendorAiLinkBatchRequest,
    VendorAiMarkDecisionsRequest,
    VendorAiNextActionsRequest,
    VendorAiNextActionsResponse,
    VendorAiSummaryRequest,
    VendorAiSummaryResponse,
    VendorAiValidateRequest,
    VendorAiValidateResponse,
    VendorAiVendorOut,
)
from app.modules.master_data_ai.request_context import master_data_ai_trace_dependency

router = APIRouter()

_heavy_rl = Depends(rate_limit_dependency("heavy"))
_read_rl = Depends(rate_limit_dependency("read"))


def _ensure_tenant(user: User, tenant: Tenant) -> None:
    if user.tenant_id != tenant.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant mismatch")


@router.post("/extract", response_model=VendorAiExtractWrapResponse)
async def vendor_ai_extract(
    file: UploadFile = File(...),
    vendor_id: int | None = Form(default=None),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "extract")
    body = await file.read()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    ct = file.content_type or "application/octet-stream"
    return await vai_svc.ai_extract_document(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        file_bytes=body,
        content_type=ct,
        vendor_id=vendor_id,
    )


@router.post("/enrich", response_model=VendorAiEnrichResponse)
async def vendor_ai_enrich(
    body: VendorAiEnrichRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "enrich")
    return await vai_svc.ai_enrich(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/validate", response_model=VendorAiValidateResponse)
async def vendor_ai_validate(
    body: VendorAiValidateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "validate")
    return await vai_svc.ai_validate(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/dedupe", response_model=VendorAiDedupeResponse)
async def vendor_ai_dedupe(
    body: VendorAiDedupeRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "dedupe")
    return await vai_svc.ai_dedupe(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/summary", response_model=VendorAiSummaryResponse)
async def vendor_ai_summary(
    body: VendorAiSummaryRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "summary")
    return await vai_svc.ai_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/next-actions", response_model=VendorAiNextActionsResponse)
async def vendor_ai_next_actions(
    body: VendorAiNextActionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "next_actions")
    return await vai_svc.ai_next_actions(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.get("/audit-log", response_model=VendorAiAuditListResponse)
async def vendor_ai_audit_log(
    vendor_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "audit")
    return await vai_svc.list_vendor_ai_audit_logs(db, tenant_id=tenant.id, vendor_id=vendor_id, limit=limit)


@router.post("/suggestion-batch/mark-decisions")
async def vendor_ai_suggestion_mark_decisions(
    body: VendorAiMarkDecisionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "apply_suggestions")
    await vai_batches.mark_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        decisions=[(d.field_key, d.decision) for d in body.decisions],
    )
    return {"ok": True}


@router.post("/suggestion-batch/apply-suggestions", response_model=VendorAiApplySuggestionsResponse)
async def vendor_ai_suggestion_apply(
    body: VendorAiApplySuggestionsRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "apply_suggestions")
    raw = await vai_batches.apply_suggestions_to_vendor(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        vendor_id=body.vendor_id,
        actions=[(i.field_key, i.decision) for i in body.items],
        conflict_mode=body.conflict_mode,
    )
    return VendorAiApplySuggestionsResponse(
        vendor=VendorAiVendorOut.model_validate(raw["vendor"]),
        applied_fields=raw["applied_fields"],
        skipped_fields=raw["skipped_fields"],
        rejected_fields=raw["rejected_fields"],
        conflicts=[
            VendorAiApplyConflict(
                field=c["field"],
                current=c.get("current") or "",
                suggested=c.get("suggested") or "",
            )
            for c in raw["conflicts"]
        ],
    )


@router.post("/suggestion-batch/discard")
async def vendor_ai_suggestion_discard(
    body: VendorAiDiscardBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "discard_suggestions")
    await vai_batches.discard_suggestion_batch(db, tenant_id=tenant.id, user_id=user.id, batch_id=body.batch_id)
    return {"ok": True}


@router.post("/suggestion-batch/link-vendor")
async def vendor_ai_suggestion_link(
    body: VendorAiLinkBatchRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "apply_suggestions")
    await vai_batches.link_batch_to_vendor(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        vendor_id=body.vendor_id,
    )
    return {"ok": True}


@router.post("/suggestion-batch/finalize-after-create", response_model=VendorAiFinalizeAfterCreateResponse)
async def vendor_ai_suggestion_finalize_create(
    body: VendorAiFinalizeAfterCreateRequest,
    _trace: str = Depends(master_data_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _ensure_tenant(user, tenant)
    await require_vendor_ai_capability(db, user, "apply_suggestions")
    raw = await vai_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        vendor_id=body.vendor_id,
    )
    return VendorAiFinalizeAfterCreateResponse(**raw)
