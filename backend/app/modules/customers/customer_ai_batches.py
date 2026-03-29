"""Persisted suggestion batches, server-side apply, and audit for customer AI."""

from __future__ import annotations

import re
from datetime import datetime, timedelta
import json
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Customer, Tenant
from app.models.customer_ai_suggestion import CustomerAiSuggestionBatch, CustomerAiSuggestionItem
from app.modules.ai_extract.schemas import CustomerExtractionResponse
from app.modules.ai_tool.audit import log_ai_event
from app.modules.customers.customer_ai_context import get_customer_ai_request_id
from app.modules.customers.schemas import CustomerUpdate
from app.modules.customers import service as customer_service

TRUNC_VALUE = 2048
TRUNC_SNAP = 1024
TRUNC_META_JSON = 48_000

# Batches that carry per-field suggestion items (apply / mark / finalize).
FIELD_SUGGESTION_ACTION_TYPES: frozenset[str] = frozenset({"extract", "enrich"})
# Operational trace batches (no field items; audit / retention only).
TRACE_ACTION_TYPES: frozenset[str] = frozenset({"validate", "dedupe", "summary", "next_actions"})


def _batch_retention_days() -> int:
    try:
        return max(1, min(3650, int(get_settings().customer_ai_batch_retention_days)))
    except Exception:
        return 90


def _cap_meta_dict(data: dict[str, Any], max_bytes: int = TRUNC_META_JSON) -> dict[str, Any]:
    """Keep trace payloads bounded for DB and audit."""
    raw = json.dumps(data, default=str)
    if len(raw) <= max_bytes:
        return data
    return {
        "truncated": True,
        "preview": raw[: max_bytes - 80] + "...",
        "original_length": len(raw),
    }


def _require_field_suggestion_batch(batch: CustomerAiSuggestionBatch) -> None:
    if batch.action_type not in FIELD_SUGGESTION_ACTION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "BATCH_NOT_FIELD_SUGGESTIONS",
                "message": "This batch is an operational trace (validate/dedupe/summary). It cannot be applied as field suggestions.",
            },
        )

# Form field keys (camelCase) allowed for AI apply — must match extraction + ERP-safe columns.
ALLOWED_FORM_KEYS: frozenset[str] = frozenset(
    {
        "legalEntityName",
        "tradeName",
        "taxIdVatNumber",
        "website",
        "customerType",
        "status",
        "primaryContactName",
        "designation",
        "contactEmail",
        "countryCode",
        "contactPhone",
        "subscribeNewsletter",
        "companyLogoUrl",
        "billingAddressLine1",
        "billingCity",
        "billingPostalCode",
        "billingCountry",
        "shippingAddressLine1",
        "shippingCity",
        "shippingPostalCode",
        "shippingCountry",
        "sameAsBilling",
    }
)

_SNAKE_TO_CAMEL = {
    "legal_entity_name": "legalEntityName",
    "trade_name": "tradeName",
    "tax_id_vat_number": "taxIdVatNumber",
    "primary_contact_name": "primaryContactName",
    "contact_email": "contactEmail",
    "country_code": "countryCode",
    "contact_phone": "contactPhone",
    "subscribe_newsletter": "subscribeNewsletter",
    "company_logo_url": "companyLogoUrl",
    "billing_address_line1": "billingAddressLine1",
    "billing_city": "billingCity",
    "billing_postal_code": "billingPostalCode",
    "billing_country": "billingCountry",
    "shipping_address_line1": "shippingAddressLine1",
    "shipping_city": "shippingCity",
    "shipping_postal_code": "shippingPostalCode",
    "shipping_country": "shippingCountry",
    "same_as_billing": "sameAsBilling",
    "customer_type": "customerType",
}


def normalize_suggestion_field_key(raw: str) -> str | None:
    k = (raw or "").strip()
    if not k:
        return None
    if k in ALLOWED_FORM_KEYS:
        return k
    lk = k.lower().replace(" ", "_")
    return _SNAKE_TO_CAMEL.get(lk)


def _trunc(s: str | None, n: int) -> str | None:
    if s is None:
        return None
    s = str(s)
    return s if len(s) <= n else s[: n - 3] + "..."


def _norm_cmp(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip()).lower()


def customer_snapshot_for_field(customer: Customer, field_key: str) -> str:
    if field_key == "legalEntityName":
        v = customer.legal_entity_name or customer.name or ""
    elif field_key == "tradeName":
        v = customer.trade_name or ""
    elif field_key == "taxIdVatNumber":
        v = customer.tax_id_vat_number or ""
    elif field_key == "website":
        v = customer.website or ""
    elif field_key == "customerType":
        v = customer.customer_type or ""
    elif field_key == "status":
        v = customer.status or ""
    elif field_key == "primaryContactName":
        v = customer.primary_contact_name or ""
    elif field_key == "designation":
        v = customer.designation or ""
    elif field_key == "contactEmail":
        v = customer.contact_email or customer.email or ""
    elif field_key == "countryCode":
        v = customer.phone_country_code or ""
    elif field_key == "contactPhone":
        v = customer.contact_phone or customer.phone or ""
    elif field_key == "subscribeNewsletter":
        v = "true" if customer.subscribe_newsletter else "false"
    elif field_key == "companyLogoUrl":
        v = customer.company_logo_url or ""
    elif field_key == "billingAddressLine1":
        v = customer.billing_address_line1 or ""
    elif field_key == "billingCity":
        v = customer.billing_city or ""
    elif field_key == "billingPostalCode":
        v = customer.billing_postal_code or ""
    elif field_key == "billingCountry":
        v = customer.billing_country or customer.country or ""
    elif field_key == "shippingAddressLine1":
        v = customer.shipping_address_line1 or ""
    elif field_key == "shippingCity":
        v = customer.shipping_city or ""
    elif field_key == "shippingPostalCode":
        v = customer.shipping_postal_code or ""
    elif field_key == "shippingCountry":
        v = customer.shipping_country or ""
    elif field_key == "sameAsBilling":
        v = "true" if customer.same_as_billing else "false"
    else:
        v = ""
    return _trunc(v, TRUNC_SNAP) or ""


def _parse_bool(raw: str | None) -> bool | None:
    if raw is None:
        return None
    t = str(raw).strip().lower()
    if t in {"true", "1", "yes", "y"}:
        return True
    if t in {"false", "0", "no", "n"}:
        return False
    return None


def accumulate_customer_update(field_key: str, raw: str | None, acc: dict[str, Any]) -> None:
    """Merge one AI field into CustomerUpdate kwargs (snake_case keys)."""
    v = (raw or "").strip()
    if field_key == "legalEntityName":
        acc["name"] = v
        acc["legal_entity_name"] = v
    elif field_key == "tradeName":
        acc["trade_name"] = customer_service.clean_optional(v) or ""
    elif field_key == "taxIdVatNumber":
        acc["tax_id_vat_number"] = customer_service.clean_optional(v)
    elif field_key == "website":
        acc["website"] = customer_service.clean_optional(v)
    elif field_key == "customerType":
        acc["customer_type"] = customer_service.clean_optional(v)
    elif field_key == "status":
        acc["status"] = customer_service.clean_optional(v) or "active"
    elif field_key == "primaryContactName":
        acc["primary_contact_name"] = customer_service.clean_optional(v) or ""
    elif field_key == "designation":
        acc["designation"] = customer_service.clean_optional(v)
    elif field_key == "contactEmail":
        acc["contact_email"] = v
        acc["email"] = v
    elif field_key == "countryCode":
        acc["phone_country_code"] = customer_service.clean_optional(v)
    elif field_key == "contactPhone":
        acc["contact_phone"] = customer_service.clean_optional(v)
        acc["phone"] = customer_service.clean_optional(v)
    elif field_key == "subscribeNewsletter":
        b = _parse_bool(v)
        if b is not None:
            acc["subscribe_newsletter"] = b
    elif field_key == "companyLogoUrl":
        acc["company_logo_url"] = customer_service.clean_optional(v)
    elif field_key == "billingAddressLine1":
        acc["billing_address_line1"] = v
        acc["address"] = v
    elif field_key == "billingCity":
        acc["billing_city"] = v
    elif field_key == "billingPostalCode":
        acc["billing_postal_code"] = customer_service.clean_optional(v)
    elif field_key == "billingCountry":
        acc["billing_country"] = v
        acc["country"] = v
    elif field_key == "shippingAddressLine1":
        acc["shipping_address_line1"] = v
    elif field_key == "shippingCity":
        acc["shipping_city"] = v
    elif field_key == "shippingPostalCode":
        acc["shipping_postal_code"] = customer_service.clean_optional(v)
    elif field_key == "shippingCountry":
        acc["shipping_country"] = v
    elif field_key == "sameAsBilling":
        b = _parse_bool(v)
        if b is not None:
            acc["same_as_billing"] = b


async def _load_batch_items(
    db: AsyncSession, *, batch_id: int, tenant_id: int
) -> tuple[CustomerAiSuggestionBatch, list[CustomerAiSuggestionItem]]:
    r = await db.execute(
        select(CustomerAiSuggestionBatch).where(
            CustomerAiSuggestionBatch.id == batch_id,
            CustomerAiSuggestionBatch.tenant_id == tenant_id,
        )
    )
    batch = r.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "BATCH_NOT_FOUND", "message": "Suggestion batch not found."})
    if batch.status == "discarded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_DISCARDED", "message": "This suggestion batch was discarded."},
        )
    r2 = await db.execute(
        select(CustomerAiSuggestionItem)
        .where(
            CustomerAiSuggestionItem.batch_id == batch_id,
            CustomerAiSuggestionItem.tenant_id == tenant_id,
        )
        .order_by(CustomerAiSuggestionItem.id.asc())
    )
    items = list(r2.scalars().all())
    return batch, items


async def create_batch_from_extraction(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    customer_id: int | None,
    extraction: CustomerExtractionResponse,
    request_id: str | None,
    model_hint: str | None,
) -> int:
    now = datetime.utcnow()
    batch = CustomerAiSuggestionBatch(
        tenant_id=tenant_id,
        customer_id=customer_id,
        action_type="extract",
        provider=None,
        model_hint=model_hint,
        request_id=request_id,
        generated_by_user_id=user_id,
        source_type="document",
        status="generated",
        meta_json={
            "extraction_success": extraction.success,
            "field_count": len(extraction.fields),
            "warnings_count": len(extraction.warnings or []),
        },
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=_batch_retention_days()),
    )
    db.add(batch)
    await db.flush()

    for fk, ef in (extraction.fields or {}).items():
        nk = normalize_suggestion_field_key(fk)
        if not nk or nk not in ALLOWED_FORM_KEYS:
            continue
        if ef.value is None:
            continue
        sv = _trunc(str(ef.value).strip(), TRUNC_VALUE)
        if not sv:
            continue
        db.add(
            CustomerAiSuggestionItem(
                batch_id=batch.id,
                tenant_id=tenant_id,
                field_key=nk,
                suggested_value=sv,
                confidence=float(ef.confidence) if ef.confidence is not None else None,
                source=_trunc(ef.source, 64),
                rationale=None,
                disposition="pending",
                created_at=now,
                updated_at=now,
            )
        )
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_BATCH",
        resource="customer",
        details_json={
            "customer_id": customer_id,
            "suggestion_batch_id": batch.id,
            "action_type": "extract",
            "phase": "generated",
            "item_count": len(extraction.fields or {}),
        },
        request_id=request_id,
        prompt_category="customer_ai",
        severity="INFO",
    )
    return batch.id


async def create_batch_from_enrich(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    customer_id: int | None,
    suggestions: dict[str, Any],
    request_id: str | None,
    model_name: str | None,
    source_type: str,
) -> int:
    now = datetime.utcnow()
    batch = CustomerAiSuggestionBatch(
        tenant_id=tenant_id,
        customer_id=customer_id,
        action_type="enrich",
        provider=None,
        model_hint=model_name,
        request_id=request_id,
        generated_by_user_id=user_id,
        source_type=source_type[:32] if source_type else "inference",
        status="generated",
        meta_json={"suggestion_keys": list(suggestions.keys())[:40]},
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=_batch_retention_days()),
    )
    db.add(batch)
    await db.flush()

    for fk, sug in suggestions.items():
        nk = normalize_suggestion_field_key(str(fk))
        if not nk or nk not in ALLOWED_FORM_KEYS:
            continue
        val = getattr(sug, "value", None) if not isinstance(sug, dict) else sug.get("value")
        if val is None:
            continue
        sv = _trunc(str(val).strip(), TRUNC_VALUE)
        if not sv:
            continue
        conf = getattr(sug, "confidence", 0.5) if not isinstance(sug, dict) else sug.get("confidence", 0.5)
        src = getattr(sug, "source", None) if not isinstance(sug, dict) else sug.get("source")
        rat = getattr(sug, "rationale", None) if not isinstance(sug, dict) else sug.get("rationale")
        try:
            c = float(conf)
        except (TypeError, ValueError):
            c = 0.5
        db.add(
            CustomerAiSuggestionItem(
                batch_id=batch.id,
                tenant_id=tenant_id,
                field_key=nk,
                suggested_value=sv,
                confidence=max(0.0, min(1.0, c)),
                source=_trunc(str(src) if src else None, 64),
                rationale=_trunc(str(rat) if rat else None, 512),
                disposition="pending",
                created_at=now,
                updated_at=now,
            )
        )
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_BATCH",
        resource="customer",
        details_json={
            "customer_id": customer_id,
            "suggestion_batch_id": batch.id,
            "action_type": "enrich",
            "phase": "generated",
        },
        request_id=request_id,
        prompt_category="customer_ai",
        severity="INFO",
    )
    return batch.id


async def create_trace_result_batch(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    customer_id: int | None,
    action_type: Literal["validate", "dedupe", "summary", "next_actions"],
    request_id: str | None,
    model_hint: str | None,
    meta_payload: dict[str, Any],
) -> int:
    """Persist a non-field AI outcome (validate/dedupe/summary/next) for audit and retention."""
    if action_type not in TRACE_ACTION_TYPES:
        raise ValueError(f"Invalid trace action_type: {action_type}")
    now = datetime.utcnow()
    meta = _cap_meta_dict(meta_payload)
    batch = CustomerAiSuggestionBatch(
        tenant_id=tenant_id,
        customer_id=customer_id,
        action_type=action_type,
        provider=None,
        model_hint=_trunc(model_hint, 128),
        request_id=_trunc(request_id, 64),
        generated_by_user_id=user_id,
        source_type="inference",
        status="completed",
        meta_json=meta,
        created_at=now,
        updated_at=now,
        expires_at=now + timedelta(days=_batch_retention_days()),
    )
    db.add(batch)
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_BATCH",
        resource="customer",
        details_json={
            "customer_id": customer_id,
            "suggestion_batch_id": batch.id,
            "action_type": action_type,
            "phase": "trace_result",
            "issue_count": meta.get("issue_count"),
            "match_count": meta.get("candidate_count") or meta.get("match_count"),
            "key_facts_count": meta.get("key_facts_count"),
            "action_count": meta.get("action_count"),
        },
        request_id=request_id,
        prompt_category="customer_ai",
        severity="INFO",
    )
    return batch.id


async def cleanup_expired_customer_ai_batches(
    db: AsyncSession,
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    """Hard-delete batches (and cascading items) past expires_at. Safe to run manually or from cron."""
    now = datetime.utcnow()
    cond = (
        CustomerAiSuggestionBatch.expires_at.is_not(None),
        CustomerAiSuggestionBatch.expires_at < now,
    )
    if dry_run:
        r = await db.execute(select(func.count(CustomerAiSuggestionBatch.id)).where(*cond))
        n = int(r.scalar_one() or 0)
        return {"would_delete": n, "deleted": 0}
    r2 = await db.execute(delete(CustomerAiSuggestionBatch).where(*cond))
    deleted = r2.rowcount if r2.rowcount is not None else 0
    await db.flush()
    return {"would_delete": 0, "deleted": deleted}


def _recompute_batch_status(batch: CustomerAiSuggestionBatch, items: list[CustomerAiSuggestionItem]) -> None:
    if batch.status == "discarded":
        return
    if not items:
        batch.status = "generated"
        batch.updated_at = datetime.utcnow()
        return
    applied_n = sum(1 for i in items if i.disposition == "applied_to_record")
    open_n = sum(1 for i in items if i.disposition in {"pending", "marked_apply"})
    if applied_n and open_n:
        batch.status = "partially_applied"
    elif applied_n and not open_n:
        batch.status = "fully_applied"
    elif not applied_n and all(
        i.disposition in {"rejected", "marked_skip", "marked_reject"} for i in items
    ):
        batch.status = "fully_applied"
    else:
        batch.status = "generated"
    batch.updated_at = datetime.utcnow()


async def mark_suggestion_decisions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    batch_id: int,
    decisions: list[tuple[str, Literal["apply", "reject", "skip"]]],
) -> None:
    if not decisions:
        return
    batch, items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant_id)
    _require_field_suggestion_batch(batch)
    by_key = {i.field_key: i for i in items}
    for field_key, dec in decisions:
        nk = normalize_suggestion_field_key(field_key) or field_key
        it = by_key.get(nk)
        if not it:
            continue
        if dec == "apply":
            it.disposition = "marked_apply"
        elif dec == "reject":
            it.disposition = "marked_reject"
        else:
            it.disposition = "marked_skip"
        it.updated_at = datetime.utcnow()
    _recompute_batch_status(batch, items)
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_MARKED",
        resource="customer",
        details_json={
            "customer_id": batch.customer_id,
            "suggestion_batch_id": batch.id,
            "phase": "marked",
            "decisions": [{"field": normalize_suggestion_field_key(f) or f, "decision": d} for f, d in decisions],
        },
        request_id=get_customer_ai_request_id(),
        prompt_category="customer_ai",
        severity="INFO",
    )


async def discard_suggestion_batch(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    batch_id: int,
) -> None:
    r = await db.execute(
        select(CustomerAiSuggestionBatch).where(
            CustomerAiSuggestionBatch.id == batch_id,
            CustomerAiSuggestionBatch.tenant_id == tenant_id,
        )
    )
    batch = r.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "BATCH_NOT_FOUND", "message": "Suggestion batch not found."})
    if batch.status == "discarded":
        return
    r2 = await db.execute(
        select(CustomerAiSuggestionItem).where(
            CustomerAiSuggestionItem.batch_id == batch_id,
            CustomerAiSuggestionItem.tenant_id == tenant_id,
        )
    )
    items = list(r2.scalars().all())
    batch.status = "discarded"
    batch.updated_at = datetime.utcnow()
    for it in items:
        if it.disposition == "pending":
            it.disposition = "marked_skip"
        it.updated_at = datetime.utcnow()
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_DISCARD",
        resource="customer",
        details_json={
            "customer_id": batch.customer_id,
            "suggestion_batch_id": batch.id,
            "item_count": len(items),
        },
        request_id=get_customer_ai_request_id(),
        prompt_category="customer_ai",
        severity="INFO",
    )


async def link_batch_to_customer(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    batch_id: int,
    customer_id: int,
) -> None:
    batch, _items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant_id)
    r = await db.execute(
        select(Customer.id).where(Customer.id == customer_id, Customer.tenant_id == tenant_id)
    )
    if r.scalar_one_or_none() is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "CUSTOMER_NOT_FOUND", "message": "Customer not found."})
    if batch.customer_id is not None and batch.customer_id != customer_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_CUSTOMER_MISMATCH", "message": "Batch is already linked to another customer."},
        )
    batch.customer_id = customer_id
    batch.updated_at = datetime.utcnow()
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_LINK",
        resource="customer",
        details_json={
            "customer_id": customer_id,
            "suggestion_batch_id": batch.id,
        },
        request_id=get_customer_ai_request_id(),
        prompt_category="customer_ai",
        severity="INFO",
    )


async def finalize_batch_after_create(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    batch_id: int,
    customer_id: int,
) -> dict[str, Any]:
    """After POST /customers create: link batch and mark marked_* items as applied_to_record (audit only; DB already has values)."""
    batch, items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant.id)
    _require_field_suggestion_batch(batch)
    r = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant.id)
    )
    customer = r.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "CUSTOMER_NOT_FOUND", "message": "Customer not found."})

    if batch.customer_id is None:
        batch.customer_id = customer_id
    elif batch.customer_id != customer_id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={"code": "BATCH_CUSTOMER_MISMATCH", "message": "Batch linked to another customer."})

    applied_fields: list[str] = []
    diff_summary: list[dict[str, str]] = []
    for it in items:
        if it.disposition == "marked_apply":
            it.disposition = "applied_to_record"
            it.before_value_snapshot = ""
            after = customer_snapshot_for_field(customer, it.field_key)
            it.updated_at = datetime.utcnow()
            applied_fields.append(it.field_key)
            diff_summary.append({"field": it.field_key, "after": _trunc(after, 200) or ""})
        elif it.disposition == "marked_reject":
            it.disposition = "rejected"
            it.updated_at = datetime.utcnow()
        elif it.disposition == "marked_skip":
            it.updated_at = datetime.utcnow()

    _recompute_batch_status(batch, items)
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_FINALIZE_CREATE",
        resource="customer",
        details_json={
            "customer_id": customer_id,
            "suggestion_batch_id": batch.id,
            "applied_field_count": len(applied_fields),
            "applied_fields": applied_fields[:50],
            "diff_summary": diff_summary[:30],
        },
        request_id=get_customer_ai_request_id(),
        prompt_category="customer_ai",
        severity="INFO",
    )
    return {"applied_fields": applied_fields, "diff_summary": diff_summary}


async def apply_suggestions_to_customer(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    batch_id: int,
    customer_id: int,
    actions: list[tuple[str, Literal["apply", "reject", "skip"]]],
    conflict_mode: Literal["overwrite", "skip_if_different"],
) -> dict[str, Any]:
    batch, items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant.id)
    _require_field_suggestion_batch(batch)
    if batch.customer_id is not None and batch.customer_id != customer_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_CUSTOMER_MISMATCH", "message": "Batch belongs to a different customer."},
        )
    batch.customer_id = customer_id

    r = await db.execute(
        select(Customer).where(Customer.id == customer_id, Customer.tenant_id == tenant.id)
    )
    customer = r.scalar_one_or_none()
    if not customer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail={"code": "CUSTOMER_NOT_FOUND", "message": "Customer not found."})

    by_key = {i.field_key: i for i in items}
    acc: dict[str, Any] = {}
    applied: list[str] = []
    skipped: list[str] = []
    rejected: list[str] = []
    conflicts: list[dict[str, str]] = []

    for field_key_raw, act in actions:
        nk = normalize_suggestion_field_key(field_key_raw) or field_key_raw
        it = by_key.get(nk)
        if not it:
            skipped.append(nk)
            continue
        if act == "reject":
            it.disposition = "rejected"
            it.updated_at = datetime.utcnow()
            rejected.append(nk)
            continue
        if act == "skip":
            it.disposition = "marked_skip"
            it.updated_at = datetime.utcnow()
            skipped.append(nk)
            continue
        if nk not in ALLOWED_FORM_KEYS:
            skipped.append(nk)
            continue
        sug = (it.suggested_value or "").strip()
        before = customer_snapshot_for_field(customer, nk)
        it.before_value_snapshot = before
        cur = before
        if conflict_mode == "skip_if_different" and _norm_cmp(cur) and _norm_cmp(cur) != _norm_cmp(sug):
            conflicts.append({"field": nk, "current": cur[:200], "suggested": sug[:200]})
            skipped.append(nk)
            continue
        accumulate_customer_update(nk, sug, acc)
        it.disposition = "applied_to_record"
        it.updated_at = datetime.utcnow()
        applied.append(nk)

    if acc:
        shipping_keys = {"shippingAddressLine1", "shippingCity", "shippingPostalCode", "shippingCountry"}
        if applied and any(k in shipping_keys for k in applied):
            acc["same_as_billing"] = False
        cc = acc.get("phone_country_code")
        if cc is None:
            cc = customer.phone_country_code
        cp = acc.get("contact_phone")
        if cp is None:
            cp = customer.contact_phone or ""
        if "contact_phone" in acc or "phone_country_code" in acc:
            acc["phone"] = customer_service.clean_optional(f"{(cc or '').strip()} {(cp or '').strip()}".strip())

        body = CustomerUpdate.model_validate(acc)
        await customer_service.update_customer(db, tenant, customer_id, body)
        await db.refresh(customer)

    _recompute_batch_status(batch, items)
    await db.flush()

    after_snap = {k: customer_snapshot_for_field(customer, k) for k in applied}

    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user_id,
        action="CUSTOMER_AI_SUGGESTION_APPLY",
        resource="customer",
        details_json={
            "customer_id": customer_id,
            "suggestion_batch_id": batch.id,
            "applied_count": len(applied),
            "rejected_count": len(rejected),
            "skipped_count": len(skipped),
            "conflict_count": len(conflicts),
            "applied_fields": applied[:50],
            "conflicts": conflicts[:20],
            "after_snapshot": {k: (v[:200] if v else "") for k, v in list(after_snap.items())[:20]},
        },
        request_id=get_customer_ai_request_id(),
        prompt_category="customer_ai",
        severity="INFO",
    )

    resp_customer = customer_service.customer_to_response(customer)
    return {
        "customer": resp_customer,
        "applied_fields": applied,
        "skipped_fields": skipped,
        "rejected_fields": rejected,
        "conflicts": conflicts,
    }
