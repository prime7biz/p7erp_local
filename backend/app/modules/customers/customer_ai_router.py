"""Customer AI HTTP routes under /customers/ai/*."""

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.common.auth import get_current_user
from app.common.tenant import require_tenant
from app.database import get_db
from app.models import Tenant, User
from app.modules.ai_tool.guardrails import rate_limit_dependency
from app.modules.customers import customer_ai_batches as cai_batches
from app.modules.customers import customer_ai_service as ca_svc
from app.modules.customers import service as customer_service
from app.modules.customers.customer_ai_authz import require_customer_ai_capability
from app.modules.customers.customer_ai_context import customer_ai_trace_dependency
from app.modules.customers.customer_ai_schemas import (
    CustomerAiApplyConflict,
    CustomerAiApplySuggestionsRequest,
    CustomerAiApplySuggestionsResponse,
    CustomerAiAuditListResponse,
    CustomerAiDedupeRequest,
    CustomerAiDedupeResponse,
    CustomerAiDiscardBatchRequest,
    CustomerAiEnrichRequest,
    CustomerAiEnrichResponse,
    CustomerAiExtractWrapResponse,
    CustomerAiFinalizeAfterCreateRequest,
    CustomerAiFinalizeAfterCreateResponse,
    CustomerAiLinkBatchRequest,
    CustomerAiMarkDecisionsRequest,
    CustomerAiNextActionsRequest,
    CustomerAiNextActionsResponse,
    CustomerAiNlSearchResponse,
    CustomerAiSummaryRequest,
    CustomerAiSummaryResponse,
    CustomerAiValidateRequest,
    CustomerAiValidateResponse,
)

router = APIRouter()

_heavy_rl = Depends(rate_limit_dependency("heavy"))
_read_rl = Depends(rate_limit_dependency("read"))


@router.post("/extract", response_model=CustomerAiExtractWrapResponse)
async def customer_ai_extract(
    file: UploadFile = File(...),
    customer_id: int | None = Form(default=None),
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "extract")
    body = await file.read()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    ct = file.content_type or "application/octet-stream"
    return await ca_svc.ai_extract_document(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        file_bytes=body,
        content_type=ct,
        customer_id=customer_id,
    )


@router.post("/enrich", response_model=CustomerAiEnrichResponse)
async def customer_ai_enrich(
    body: CustomerAiEnrichRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "enrich")
    return await ca_svc.ai_enrich(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/validate", response_model=CustomerAiValidateResponse)
async def customer_ai_validate(
    body: CustomerAiValidateRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "validate")
    return await ca_svc.ai_validate(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/dedupe", response_model=CustomerAiDedupeResponse)
async def customer_ai_dedupe(
    body: CustomerAiDedupeRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "dedupe")
    return await ca_svc.ai_dedupe(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/summary", response_model=CustomerAiSummaryResponse)
async def customer_ai_summary(
    body: CustomerAiSummaryRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "summary")
    return await ca_svc.ai_summary(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.post("/next-actions", response_model=CustomerAiNextActionsResponse)
async def customer_ai_next_actions(
    body: CustomerAiNextActionsRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "next_actions")
    return await ca_svc.ai_next_actions(db, tenant_id=tenant.id, user_id=user.id, body=body)


@router.get("/nl-search", response_model=CustomerAiNlSearchResponse)
async def customer_ai_nl_search(
    q: str = Query(..., min_length=1, max_length=500),
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "nl_search")
    return await ca_svc.ai_nl_search(db, tenant_id=tenant.id, user_id=user.id, query=q)


@router.get("/audit-log", response_model=CustomerAiAuditListResponse)
async def customer_ai_audit_log(
    customer_id: int | None = Query(default=None),
    limit: int = Query(default=40, ge=1, le=100),
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "audit")
    return await ca_svc.list_customer_ai_audit_logs(
        db, tenant_id=tenant.id, customer_id=customer_id, limit=limit
    )


@router.post("/suggestion-batch/mark-decisions")
async def customer_ai_suggestion_mark_decisions(
    body: CustomerAiMarkDecisionsRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "apply_suggestions")
    await cai_batches.mark_suggestion_decisions(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        decisions=[(d.field_key, d.decision) for d in body.decisions],
    )
    return {"ok": True}


@router.post("/suggestion-batch/apply-suggestions", response_model=CustomerAiApplySuggestionsResponse)
async def customer_ai_suggestion_apply(
    body: CustomerAiApplySuggestionsRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "apply_suggestions")
    raw = await cai_batches.apply_suggestions_to_customer(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        customer_id=body.customer_id,
        actions=[(i.field_key, i.decision) for i in body.items],
        conflict_mode=body.conflict_mode,
    )
    return CustomerAiApplySuggestionsResponse(
        customer=raw["customer"],
        applied_fields=raw["applied_fields"],
        skipped_fields=raw["skipped_fields"],
        rejected_fields=raw["rejected_fields"],
        conflicts=[
            CustomerAiApplyConflict(
                field=c["field"],
                current=c.get("current") or "",
                suggested=c.get("suggested") or "",
            )
            for c in raw["conflicts"]
        ],
    )


@router.post("/suggestion-batch/discard")
async def customer_ai_suggestion_discard(
    body: CustomerAiDiscardBatchRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "discard_suggestions")
    await cai_batches.discard_suggestion_batch(
        db, tenant_id=tenant.id, user_id=user.id, batch_id=body.batch_id
    )
    return {"ok": True}


@router.post("/suggestion-batch/link-customer")
async def customer_ai_suggestion_link(
    body: CustomerAiLinkBatchRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _read_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "apply_suggestions")
    await cai_batches.link_batch_to_customer(
        db,
        tenant_id=tenant.id,
        user_id=user.id,
        batch_id=body.batch_id,
        customer_id=body.customer_id,
    )
    return {"ok": True}


@router.post("/suggestion-batch/finalize-after-create", response_model=CustomerAiFinalizeAfterCreateResponse)
async def customer_ai_suggestion_finalize_create(
    body: CustomerAiFinalizeAfterCreateRequest,
    _trace: str = Depends(customer_ai_trace_dependency),
    _rl: None = _heavy_rl,
    tenant: Tenant = Depends(require_tenant),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    customer_service.ensure_user_tenant(user, tenant)
    await require_customer_ai_capability(db, user, "apply_suggestions")
    raw = await cai_batches.finalize_batch_after_create(
        db,
        tenant=tenant,
        user_id=user.id,
        batch_id=body.batch_id,
        customer_id=body.customer_id,
    )
    return CustomerAiFinalizeAfterCreateResponse(**raw)
