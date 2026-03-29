"""Vendor (supplier) AI suggestion batches — mirrors customer_ai_batches pattern."""

from __future__ import annotations

import json
import re
from datetime import datetime, timedelta
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Tenant, Vendor
from app.models.vendor_ai_suggestion import VendorAiSuggestionBatch, VendorAiSuggestionItem
from app.modules.ai_extract.schemas import VendorExtractionResponse
from app.modules.ai_tool.audit import log_ai_event
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id

TRUNC_VALUE = 2048
TRUNC_SNAP = 1024
TRUNC_META_JSON = 48_000

FIELD_SUGGESTION_ACTION_TYPES: frozenset[str] = frozenset({"extract", "enrich"})
TRACE_ACTION_TYPES: frozenset[str] = frozenset({"validate", "dedupe", "summary", "next_actions"})


def _batch_retention_days() -> int:
    try:
        return max(1, min(3650, int(get_settings().customer_ai_batch_retention_days)))
    except Exception:
        return 90


def _cap_meta_dict(data: dict[str, Any], max_bytes: int = TRUNC_META_JSON) -> dict[str, Any]:
    raw = json.dumps(data, default=str)
    if len(raw) <= max_bytes:
        return data
    return {
        "truncated": True,
        "preview": raw[: max_bytes - 80] + "...",
        "original_length": len(raw),
    }


def _require_field_suggestion_batch(batch: VendorAiSuggestionBatch) -> None:
    if batch.action_type not in FIELD_SUGGESTION_ACTION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "BATCH_NOT_FIELD_SUGGESTIONS",
                "message": "This batch is an operational trace. It cannot be applied as field suggestions.",
            },
        )


# camelCase keys aligned with extraction / frontend vendorFormShared
ALLOWED_FORM_KEYS: frozenset[str] = frozenset(
    {
        "vendorDisplayName",
        "legalName",
        "tradeName",
        "contactPerson",
        "designation",
        "email",
        "phone",
        "mobile",
        "website",
        "address",
        "addressLine1",
        "city",
        "stateOrRegion",
        "postalCode",
        "country",
        "taxId",
        "registrationNumber",
        "vendorType",
        "defaultCurrency",
        "paymentTermsDays",
        "paymentTerms",
        "incoterms",
        "shippingTerms",
        "leadTimeNotes",
        "bankName",
        "bankAccountTitle",
        "bankAccountNo",
        "swiftCode",
        "iban",
        "complianceStatus",
        "complianceReferenceNumbers",
        "certificationsSummary",
        "onboardingStatus",
        "remarks",
    }
)

_SNAKE_TO_CAMEL = {
    "vendor_display_name": "vendorDisplayName",
    "legal_name": "legalName",
    "trade_name": "tradeName",
    "contact_person": "contactPerson",
    "payment_terms_days": "paymentTermsDays",
    "address_line1": "addressLine1",
    "state_or_region": "stateOrRegion",
    "postal_code": "postalCode",
    "tax_id": "taxId",
    "registration_number": "registrationNumber",
    "vendor_type": "vendorType",
    "default_currency": "defaultCurrency",
    "payment_terms": "paymentTerms",
    "bank_name": "bankName",
    "bank_account_title": "bankAccountTitle",
    "bank_account_no": "bankAccountNo",
    "swift_code": "swiftCode",
    "lead_time_notes": "leadTimeNotes",
    "shipping_terms": "shippingTerms",
    "compliance_status": "complianceStatus",
    "compliance_reference_numbers": "complianceReferenceNumbers",
    "certifications_summary": "certificationsSummary",
    "onboarding_status": "onboardingStatus",
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


def _clean_str(v: str | None, max_len: int) -> str | None:
    if v is None:
        return None
    t = str(v).strip()
    if not t:
        return None
    return t[:max_len]


def vendor_snapshot_for_field(vendor: Vendor, field_key: str) -> str:
    m: dict[str, str] = {
        "vendorDisplayName": vendor.name or "",
        "legalName": vendor.legal_name or "",
        "tradeName": vendor.trade_name or "",
        "contactPerson": vendor.contact_person or "",
        "designation": vendor.designation or "",
        "email": vendor.email or "",
        "phone": vendor.phone or "",
        "mobile": vendor.mobile or "",
        "website": vendor.website or "",
        "address": vendor.address or "",
        "addressLine1": vendor.address_line1 or "",
        "city": vendor.city or "",
        "stateOrRegion": vendor.state_or_region or "",
        "postalCode": vendor.postal_code or "",
        "country": vendor.country or "",
        "taxId": vendor.tax_id or "",
        "registrationNumber": vendor.registration_number or "",
        "vendorType": vendor.vendor_type or "",
        "defaultCurrency": vendor.default_currency or "",
        "paymentTerms": vendor.payment_terms or "",
        "paymentTermsDays": str(vendor.payment_terms_days) if vendor.payment_terms_days is not None else "",
        "incoterms": vendor.incoterms or "",
        "shippingTerms": vendor.shipping_terms or "",
        "leadTimeNotes": vendor.lead_time_notes or "",
        "bankName": vendor.bank_name or "",
        "bankAccountTitle": vendor.bank_account_title or "",
        "bankAccountNo": vendor.bank_account_no or "",
        "swiftCode": vendor.swift_code or "",
        "iban": vendor.iban or "",
        "complianceStatus": vendor.compliance_status or "",
        "complianceReferenceNumbers": vendor.compliance_reference_numbers or "",
        "certificationsSummary": vendor.certifications_summary or "",
        "onboardingStatus": vendor.onboarding_status or "",
        "remarks": vendor.remarks or "",
    }
    v = m.get(field_key, "")
    return _trunc(v, TRUNC_SNAP) or ""


def accumulate_vendor_update(field_key: str, raw: str | None, acc: dict[str, Any]) -> None:
    v = (raw or "").strip()
    if field_key == "vendorDisplayName" and v:
        acc["name"] = v[:128]
    elif field_key == "legalName":
        acc["legal_name"] = _clean_str(v, 255)
    elif field_key == "tradeName":
        acc["trade_name"] = _clean_str(v, 255)
    elif field_key == "contactPerson":
        acc["contact_person"] = _clean_str(v, 128)
    elif field_key == "designation":
        acc["designation"] = _clean_str(v, 128)
    elif field_key == "email":
        acc["email"] = _clean_str(v, 128)
    elif field_key == "phone":
        acc["phone"] = _clean_str(v, 64)
    elif field_key == "mobile":
        acc["mobile"] = _clean_str(v, 64)
    elif field_key == "website":
        acc["website"] = _clean_str(v, 512)
    elif field_key == "address":
        acc["address"] = v[:8000] if v else None
    elif field_key == "addressLine1":
        acc["address_line1"] = _clean_str(v, 512)
    elif field_key == "city":
        acc["city"] = _clean_str(v, 128)
    elif field_key == "stateOrRegion":
        acc["state_or_region"] = _clean_str(v, 128)
    elif field_key == "postalCode":
        acc["postal_code"] = _clean_str(v, 32)
    elif field_key == "country":
        acc["country"] = _clean_str(v, 128)
    elif field_key == "taxId":
        acc["tax_id"] = _clean_str(v, 64)
    elif field_key == "registrationNumber":
        acc["registration_number"] = _clean_str(v, 128)
    elif field_key == "vendorType":
        t = v.lower()[:16]
        if t in ("local", "foreign"):
            acc["vendor_type"] = t
        elif v:
            acc["vendor_type"] = v[:16]
    elif field_key == "defaultCurrency":
        acc["default_currency"] = v.upper()[:10] if v else None
    elif field_key == "paymentTermsDays":
        try:
            n = int(float(v))
            if n >= 0:
                acc["payment_terms_days"] = n
        except (TypeError, ValueError):
            pass
    elif field_key == "paymentTerms":
        acc["payment_terms"] = _clean_str(v, 255)
    elif field_key == "incoterms":
        acc["incoterms"] = _clean_str(v, 64)
    elif field_key == "shippingTerms":
        acc["shipping_terms"] = _clean_str(v, 255)
    elif field_key == "leadTimeNotes":
        acc["lead_time_notes"] = v[:8000] if v else None
    elif field_key == "bankName":
        acc["bank_name"] = _clean_str(v, 255)
    elif field_key == "bankAccountTitle":
        acc["bank_account_title"] = _clean_str(v, 255)
    elif field_key == "bankAccountNo":
        acc["bank_account_no"] = _clean_str(v, 128)
    elif field_key == "swiftCode":
        acc["swift_code"] = _clean_str(v, 64)
    elif field_key == "iban":
        acc["iban"] = _clean_str(v, 64)
    elif field_key == "complianceStatus":
        acc["compliance_status"] = _clean_str(v, 64)
    elif field_key == "complianceReferenceNumbers":
        acc["compliance_reference_numbers"] = v[:8000] if v else None
    elif field_key == "certificationsSummary":
        acc["certifications_summary"] = v[:8000] if v else None
    elif field_key == "onboardingStatus":
        acc["onboarding_status"] = _clean_str(v, 64)
    elif field_key == "remarks":
        acc["remarks"] = v[:8000] if v else None


async def _load_batch_items(
    db: AsyncSession, *, batch_id: int, tenant_id: int
) -> tuple[VendorAiSuggestionBatch, list[VendorAiSuggestionItem]]:
    r = await db.execute(
        select(VendorAiSuggestionBatch).where(
            VendorAiSuggestionBatch.id == batch_id,
            VendorAiSuggestionBatch.tenant_id == tenant_id,
        )
    )
    batch = r.scalar_one_or_none()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BATCH_NOT_FOUND", "message": "Suggestion batch not found."},
        )
    if batch.status == "discarded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_DISCARDED", "message": "This suggestion batch was discarded."},
        )
    r2 = await db.execute(
        select(VendorAiSuggestionItem)
        .where(
            VendorAiSuggestionItem.batch_id == batch_id,
            VendorAiSuggestionItem.tenant_id == tenant_id,
        )
        .order_by(VendorAiSuggestionItem.id.asc())
    )
    items = list(r2.scalars().all())
    return batch, items


async def create_batch_from_extraction(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    vendor_id: int | None,
    extraction: VendorExtractionResponse,
    request_id: str | None,
    model_hint: str | None,
) -> int:
    now = datetime.utcnow()
    batch = VendorAiSuggestionBatch(
        tenant_id=tenant_id,
        vendor_id=vendor_id,
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
            VendorAiSuggestionItem(
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
        action="VENDOR_AI_SUGGESTION_BATCH",
        resource="vendor",
        details_json={
            "vendor_id": vendor_id,
            "suggestion_batch_id": batch.id,
            "action_type": "extract",
            "phase": "generated",
            "item_count": len(extraction.fields or {}),
        },
        request_id=request_id,
        prompt_category="vendor_ai",
        severity="INFO",
    )
    return batch.id


async def create_batch_from_enrich(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    vendor_id: int | None,
    suggestions: dict[str, Any],
    request_id: str | None,
    model_name: str | None,
    source_type: str,
) -> int:
    now = datetime.utcnow()
    batch = VendorAiSuggestionBatch(
        tenant_id=tenant_id,
        vendor_id=vendor_id,
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
            VendorAiSuggestionItem(
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
        action="VENDOR_AI_SUGGESTION_BATCH",
        resource="vendor",
        details_json={
            "vendor_id": vendor_id,
            "suggestion_batch_id": batch.id,
            "action_type": "enrich",
            "phase": "generated",
        },
        request_id=request_id,
        prompt_category="vendor_ai",
        severity="INFO",
    )
    return batch.id


async def create_trace_result_batch(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    vendor_id: int | None,
    action_type: Literal["validate", "dedupe", "summary", "next_actions"],
    request_id: str | None,
    model_hint: str | None,
    meta_payload: dict[str, Any],
) -> int:
    if action_type not in TRACE_ACTION_TYPES:
        raise ValueError(f"Invalid trace action_type: {action_type}")
    now = datetime.utcnow()
    meta = _cap_meta_dict(meta_payload)
    batch = VendorAiSuggestionBatch(
        tenant_id=tenant_id,
        vendor_id=vendor_id,
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
        action="VENDOR_AI_SUGGESTION_BATCH",
        resource="vendor",
        details_json={
            "vendor_id": vendor_id,
            "suggestion_batch_id": batch.id,
            "action_type": action_type,
            "phase": "trace_result",
            "issue_count": meta.get("issue_count"),
            "match_count": meta.get("candidate_count") or meta.get("match_count"),
            "key_facts_count": meta.get("key_facts_count"),
            "action_count": meta.get("action_count"),
        },
        request_id=request_id,
        prompt_category="vendor_ai",
        severity="INFO",
    )
    return batch.id


async def cleanup_expired_vendor_ai_batches(
    db: AsyncSession,
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    now = datetime.utcnow()
    cond = (
        VendorAiSuggestionBatch.expires_at.is_not(None),
        VendorAiSuggestionBatch.expires_at < now,
    )
    if dry_run:
        r = await db.execute(select(func.count(VendorAiSuggestionBatch.id)).where(*cond))
        n = int(r.scalar_one() or 0)
        return {"would_delete": n, "deleted": 0}
    r2 = await db.execute(delete(VendorAiSuggestionBatch).where(*cond))
    deleted = r2.rowcount if r2.rowcount is not None else 0
    await db.flush()
    return {"would_delete": 0, "deleted": deleted}


def _recompute_batch_status(batch: VendorAiSuggestionBatch, items: list[VendorAiSuggestionItem]) -> None:
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
    elif not applied_n and all(i.disposition in {"rejected", "marked_skip", "marked_reject"} for i in items):
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
        action="VENDOR_AI_SUGGESTION_MARKED",
        resource="vendor",
        details_json={
            "vendor_id": batch.vendor_id,
            "suggestion_batch_id": batch.id,
            "phase": "marked",
            "decisions": [{"field": normalize_suggestion_field_key(f) or f, "decision": d} for f, d in decisions],
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="vendor_ai",
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
        select(VendorAiSuggestionBatch).where(
            VendorAiSuggestionBatch.id == batch_id,
            VendorAiSuggestionBatch.tenant_id == tenant_id,
        )
    )
    batch = r.scalar_one_or_none()
    if not batch:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "BATCH_NOT_FOUND", "message": "Suggestion batch not found."},
        )
    if batch.status == "discarded":
        return
    r2 = await db.execute(
        select(VendorAiSuggestionItem).where(
            VendorAiSuggestionItem.batch_id == batch_id,
            VendorAiSuggestionItem.tenant_id == tenant_id,
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
        action="VENDOR_AI_SUGGESTION_DISCARD",
        resource="vendor",
        details_json={
            "vendor_id": batch.vendor_id,
            "suggestion_batch_id": batch.id,
            "item_count": len(items),
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="vendor_ai",
        severity="INFO",
    )


async def link_batch_to_vendor(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    batch_id: int,
    vendor_id: int,
) -> None:
    batch, _items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant_id)
    r = await db.execute(select(Vendor.id).where(Vendor.id == vendor_id, Vendor.tenant_id == tenant_id))
    if r.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VENDOR_NOT_FOUND", "message": "Vendor not found."},
        )
    if batch.vendor_id is not None and batch.vendor_id != vendor_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_VENDOR_MISMATCH", "message": "Batch is already linked to another vendor."},
        )
    batch.vendor_id = vendor_id
    batch.updated_at = datetime.utcnow()
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="VENDOR_AI_SUGGESTION_LINK",
        resource="vendor",
        details_json={
            "vendor_id": vendor_id,
            "suggestion_batch_id": batch.id,
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="vendor_ai",
        severity="INFO",
    )


async def finalize_batch_after_create(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    batch_id: int,
    vendor_id: int,
) -> dict[str, Any]:
    batch, items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant.id)
    _require_field_suggestion_batch(batch)
    r = await db.execute(select(Vendor).where(Vendor.id == vendor_id, Vendor.tenant_id == tenant.id))
    vendor = r.scalar_one_or_none()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VENDOR_NOT_FOUND", "message": "Vendor not found."},
        )

    if batch.vendor_id is None:
        batch.vendor_id = vendor_id
    elif batch.vendor_id != vendor_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_VENDOR_MISMATCH", "message": "Batch linked to another vendor."},
        )

    applied_fields: list[str] = []
    diff_summary: list[dict[str, str]] = []
    for it in items:
        if it.disposition == "marked_apply":
            it.disposition = "applied_to_record"
            it.before_value_snapshot = ""
            after = vendor_snapshot_for_field(vendor, it.field_key)
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
        action="VENDOR_AI_SUGGESTION_FINALIZE_CREATE",
        resource="vendor",
        details_json={
            "vendor_id": vendor_id,
            "suggestion_batch_id": batch.id,
            "applied_field_count": len(applied_fields),
            "applied_fields": applied_fields[:50],
            "diff_summary": diff_summary[:30],
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="vendor_ai",
        severity="INFO",
    )
    return {"applied_fields": applied_fields, "diff_summary": diff_summary}


async def apply_suggestions_to_vendor(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    batch_id: int,
    vendor_id: int,
    actions: list[tuple[str, Literal["apply", "reject", "skip"]]],
    conflict_mode: Literal["overwrite", "skip_if_different"],
) -> dict[str, Any]:
    batch, items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant.id)
    _require_field_suggestion_batch(batch)
    if batch.vendor_id is not None and batch.vendor_id != vendor_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_VENDOR_MISMATCH", "message": "Batch belongs to a different vendor."},
        )
    batch.vendor_id = vendor_id

    r = await db.execute(select(Vendor).where(Vendor.id == vendor_id, Vendor.tenant_id == tenant.id))
    vendor = r.scalar_one_or_none()
    if not vendor:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "VENDOR_NOT_FOUND", "message": "Vendor not found."},
        )

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
        before = vendor_snapshot_for_field(vendor, nk)
        it.before_value_snapshot = before
        cur = before
        if conflict_mode == "skip_if_different" and _norm_cmp(cur) and _norm_cmp(cur) != _norm_cmp(sug):
            conflicts.append({"field": nk, "current": cur[:200], "suggested": sug[:200]})
            skipped.append(nk)
            continue
        accumulate_vendor_update(nk, sug, acc)
        it.disposition = "applied_to_record"
        it.updated_at = datetime.utcnow()
        applied.append(nk)

    if acc:
        acc.pop("ledger_id", None)
        if "payment_terms_days" in acc and acc["payment_terms_days"] is not None and acc["payment_terms_days"] < 0:
            raise HTTPException(status_code=400, detail="payment_terms_days cannot be negative")
        for k, v in acc.items():
            setattr(vendor, k, v)
        vendor.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(vendor)

    _recompute_batch_status(batch, items)
    await db.flush()

    after_snap = {k: vendor_snapshot_for_field(vendor, k) for k in applied}

    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user_id,
        action="VENDOR_AI_SUGGESTION_APPLY",
        resource="vendor",
        details_json={
            "vendor_id": vendor_id,
            "suggestion_batch_id": batch.id,
            "applied_count": len(applied),
            "rejected_count": len(rejected),
            "skipped_count": len(skipped),
            "conflict_count": len(conflicts),
            "applied_fields": applied[:50],
            "conflicts": conflicts[:20],
            "after_snapshot": {k: (v[:200] if v else "") for k, v in list(after_snap.items())[:20]},
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="vendor_ai",
        severity="INFO",
    )

    return {
        "vendor": vendor,
        "applied_fields": applied,
        "skipped_fields": skipped,
        "rejected_fields": rejected,
        "conflicts": conflicts,
    }
