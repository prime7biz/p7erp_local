"""Inquiry AI suggestion batches — mirrors vendor_ai_batches / customer_ai_batches."""

from __future__ import annotations

import json
import re
from datetime import date, datetime, timedelta
from typing import Any, Literal

from fastapi import HTTPException, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Customer, CustomerIntermediary, GarmentStyle, Inquiry, Tenant
from app.models.inquiry_ai_suggestion import InquiryAiSuggestionBatch, InquiryAiSuggestionItem
from app.modules.ai_extract.schemas import InquiryExtractionResponse
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


def _require_field_suggestion_batch(batch: InquiryAiSuggestionBatch) -> None:
    if batch.action_type not in FIELD_SUGGESTION_ACTION_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "BATCH_NOT_FIELD_SUGGESTIONS",
                "message": "This batch is an operational trace. It cannot be applied as field suggestions.",
            },
        )


# snake_case keys aligned with ai_extract inquiry fields + FK ids (validated on apply)
ALLOWED_FORM_KEYS: frozenset[str] = frozenset(
    {
        "style_ref",
        "season",
        "department",
        "quantity",
        "target_price",
        "target_price_currency",
        "currency",
        "exchange_rate",
        "expected_delivery_date",
        "shipping_term",
        "commission_mode",
        "commission_type",
        "commission_value",
        "notes",
        "customer_id",
        "style_id",
        "customer_intermediary_id",
    }
)


def normalize_suggestion_field_key(raw: str) -> str | None:
    k = (raw or "").strip()
    if not k:
        return None
    if k in ALLOWED_FORM_KEYS:
        return k
    lk = k.lower().replace(" ", "_")
    aliases = {
        "customerid": "customer_id",
        "styleid": "style_id",
        "customerintermediaryid": "customer_intermediary_id",
        "targetprice": "target_price",
        "targetpricecurrency": "target_price_currency",
        "exchangerate": "exchange_rate",
        "expecteddeliverydate": "expected_delivery_date",
        "shippingterm": "shipping_term",
        "commissionmode": "commission_mode",
        "commissiontype": "commission_type",
        "commissionvalue": "commission_value",
    }
    return aliases.get(lk.replace("_", ""))


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


def inquiry_snapshot_for_field(inquiry: Inquiry, field_key: str) -> str:
    m: dict[str, str] = {
        "style_ref": inquiry.style_ref or "",
        "season": inquiry.season or "",
        "department": inquiry.department or "",
        "quantity": str(inquiry.quantity) if inquiry.quantity is not None else "",
        "target_price": inquiry.target_price or "",
        "target_price_currency": inquiry.target_price_currency or "",
        "currency": inquiry.currency or "",
        "exchange_rate": inquiry.exchange_rate or "",
        "expected_delivery_date": inquiry.expected_delivery_date.isoformat() if inquiry.expected_delivery_date else "",
        "shipping_term": inquiry.shipping_term or "",
        "commission_mode": inquiry.commission_mode or "",
        "commission_type": inquiry.commission_type or "",
        "commission_value": str(inquiry.commission_value) if inquiry.commission_value is not None else "",
        "notes": inquiry.notes or "",
        "customer_id": str(inquiry.customer_id),
        "style_id": str(inquiry.style_id) if inquiry.style_id is not None else "",
        "customer_intermediary_id": str(inquiry.customer_intermediary_id)
        if inquiry.customer_intermediary_id is not None
        else "",
    }
    v = m.get(field_key, "")
    return _trunc(v, TRUNC_SNAP) or ""


def accumulate_inquiry_update(field_key: str, raw: str | None, acc: dict[str, Any]) -> None:
    v = (raw or "").strip()
    if field_key == "style_ref":
        acc["style_ref"] = _clean_str(v, 128)
    elif field_key == "season":
        acc["season"] = _clean_str(v, 64)
    elif field_key == "department":
        acc["department"] = _clean_str(v, 64)
    elif field_key == "quantity":
        try:
            n = int(float(v))
            if n >= 0:
                acc["quantity"] = n
        except (TypeError, ValueError):
            pass
    elif field_key == "target_price":
        acc["target_price"] = _clean_str(v, 32)
    elif field_key == "target_price_currency":
        acc["target_price_currency"] = v.upper()[:10] if v else None
    elif field_key == "currency":
        acc["currency"] = v.upper()[:8] if v else None
    elif field_key == "exchange_rate":
        acc["exchange_rate"] = _clean_str(v, 32)
    elif field_key == "expected_delivery_date":
        if not v:
            acc["expected_delivery_date"] = None
        else:
            try:
                acc["expected_delivery_date"] = date.fromisoformat(v[:10])
            except ValueError:
                pass
    elif field_key == "shipping_term":
        acc["shipping_term"] = _clean_str(v, 64)
    elif field_key == "commission_mode":
        u = v.upper()
        if u in ("INCLUDE", "EXCLUDE"):
            acc["commission_mode"] = u
    elif field_key == "commission_type":
        u = v.upper()
        if u in ("PERCENTAGE", "FIXED"):
            acc["commission_type"] = u
    elif field_key == "commission_value":
        try:
            acc["commission_value"] = float(v)
        except (TypeError, ValueError):
            pass
    elif field_key == "notes":
        acc["notes"] = v[:8000] if v else None
    elif field_key == "customer_id":
        try:
            cid = int(float(v))
            if cid > 0:
                acc["customer_id"] = cid
        except (TypeError, ValueError):
            pass
    elif field_key == "style_id":
        try:
            sid = int(float(v))
            if sid > 0:
                acc["style_id"] = sid
        except (TypeError, ValueError):
            pass
    elif field_key == "customer_intermediary_id":
        if not v:
            acc["customer_intermediary_id"] = None
        else:
            try:
                iid = int(float(v))
                if iid > 0:
                    acc["customer_intermediary_id"] = iid
            except (TypeError, ValueError):
                pass


async def _load_batch_items(
    db: AsyncSession, *, batch_id: int, tenant_id: int
) -> tuple[InquiryAiSuggestionBatch, list[InquiryAiSuggestionItem]]:
    r = await db.execute(
        select(InquiryAiSuggestionBatch).where(
            InquiryAiSuggestionBatch.id == batch_id,
            InquiryAiSuggestionBatch.tenant_id == tenant_id,
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
        select(InquiryAiSuggestionItem)
        .where(
            InquiryAiSuggestionItem.batch_id == batch_id,
            InquiryAiSuggestionItem.tenant_id == tenant_id,
        )
        .order_by(InquiryAiSuggestionItem.id.asc())
    )
    return batch, list(r2.scalars().all())


async def create_batch_from_extraction(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    inquiry_id: int | None,
    extraction: InquiryExtractionResponse,
    request_id: str | None,
    model_hint: str | None,
) -> int:
    now = datetime.utcnow()
    batch = InquiryAiSuggestionBatch(
        tenant_id=tenant_id,
        inquiry_id=inquiry_id,
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
            InquiryAiSuggestionItem(
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
        action="INQUIRY_AI_SUGGESTION_BATCH",
        resource="inquiry",
        details_json={
            "inquiry_id": inquiry_id,
            "suggestion_batch_id": batch.id,
            "action_type": "extract",
            "phase": "generated",
            "item_count": len(extraction.fields or {}),
        },
        request_id=request_id,
        prompt_category="inquiry_ai",
        severity="INFO",
    )
    return batch.id


async def create_batch_from_enrich(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    inquiry_id: int | None,
    suggestions: dict[str, Any],
    request_id: str | None,
    model_name: str | None,
    source_type: str,
) -> int:
    now = datetime.utcnow()
    batch = InquiryAiSuggestionBatch(
        tenant_id=tenant_id,
        inquiry_id=inquiry_id,
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
            InquiryAiSuggestionItem(
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
        action="INQUIRY_AI_SUGGESTION_BATCH",
        resource="inquiry",
        details_json={
            "inquiry_id": inquiry_id,
            "suggestion_batch_id": batch.id,
            "action_type": "enrich",
            "phase": "generated",
        },
        request_id=request_id,
        prompt_category="inquiry_ai",
        severity="INFO",
    )
    return batch.id


async def create_trace_result_batch(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    inquiry_id: int | None,
    action_type: Literal["validate", "dedupe", "summary", "next_actions"],
    request_id: str | None,
    model_hint: str | None,
    meta_payload: dict[str, Any],
) -> int:
    if action_type not in TRACE_ACTION_TYPES:
        raise ValueError(f"Invalid trace action_type: {action_type}")
    now = datetime.utcnow()
    meta = _cap_meta_dict(meta_payload)
    batch = InquiryAiSuggestionBatch(
        tenant_id=tenant_id,
        inquiry_id=inquiry_id,
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
        action="INQUIRY_AI_SUGGESTION_BATCH",
        resource="inquiry",
        details_json={
            "inquiry_id": inquiry_id,
            "suggestion_batch_id": batch.id,
            "action_type": action_type,
            "phase": "trace_result",
            "issue_count": meta.get("issue_count"),
            "match_count": meta.get("candidate_count") or meta.get("match_count"),
            "key_facts_count": meta.get("key_facts_count"),
            "action_count": meta.get("action_count"),
        },
        request_id=request_id,
        prompt_category="inquiry_ai",
        severity="INFO",
    )
    return batch.id


async def cleanup_expired_inquiry_ai_batches(
    db: AsyncSession,
    *,
    dry_run: bool = False,
) -> dict[str, int]:
    now = datetime.utcnow()
    cond = (
        InquiryAiSuggestionBatch.expires_at.is_not(None),
        InquiryAiSuggestionBatch.expires_at < now,
    )
    if dry_run:
        r = await db.execute(select(func.count(InquiryAiSuggestionBatch.id)).where(*cond))
        return {"would_delete": int(r.scalar_one() or 0), "deleted": 0}
    r2 = await db.execute(delete(InquiryAiSuggestionBatch).where(*cond))
    deleted = r2.rowcount if r2.rowcount is not None else 0
    await db.flush()
    return {"would_delete": 0, "deleted": deleted}


def _recompute_batch_status(batch: InquiryAiSuggestionBatch, items: list[InquiryAiSuggestionItem]) -> None:
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
        action="INQUIRY_AI_SUGGESTION_MARKED",
        resource="inquiry",
        details_json={
            "inquiry_id": batch.inquiry_id,
            "suggestion_batch_id": batch.id,
            "phase": "marked",
            "decisions": [{"field": normalize_suggestion_field_key(f) or f, "decision": d} for f, d in decisions],
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="inquiry_ai",
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
        select(InquiryAiSuggestionBatch).where(
            InquiryAiSuggestionBatch.id == batch_id,
            InquiryAiSuggestionBatch.tenant_id == tenant_id,
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
        select(InquiryAiSuggestionItem).where(
            InquiryAiSuggestionItem.batch_id == batch_id,
            InquiryAiSuggestionItem.tenant_id == tenant_id,
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
        action="INQUIRY_AI_SUGGESTION_DISCARD",
        resource="inquiry",
        details_json={
            "inquiry_id": batch.inquiry_id,
            "suggestion_batch_id": batch.id,
            "item_count": len(items),
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="inquiry_ai",
        severity="INFO",
    )


async def link_batch_to_inquiry(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    batch_id: int,
    inquiry_id: int,
) -> None:
    batch, _items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant_id)
    r = await db.execute(select(Inquiry.id).where(Inquiry.id == inquiry_id, Inquiry.tenant_id == tenant_id))
    if r.scalar_one_or_none() is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INQUIRY_NOT_FOUND", "message": "Inquiry not found."},
        )
    if batch.inquiry_id is not None and batch.inquiry_id != inquiry_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_INQUIRY_MISMATCH", "message": "Batch is already linked to another inquiry."},
        )
    batch.inquiry_id = inquiry_id
    batch.updated_at = datetime.utcnow()
    await db.flush()

    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="INQUIRY_AI_SUGGESTION_LINK",
        resource="inquiry",
        details_json={
            "inquiry_id": inquiry_id,
            "suggestion_batch_id": batch.id,
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="inquiry_ai",
        severity="INFO",
    )


async def finalize_batch_after_create(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    batch_id: int,
    inquiry_id: int,
) -> dict[str, Any]:
    batch, items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant.id)
    _require_field_suggestion_batch(batch)
    r = await db.execute(select(Inquiry).where(Inquiry.id == inquiry_id, Inquiry.tenant_id == tenant.id))
    inquiry = r.scalar_one_or_none()
    if not inquiry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INQUIRY_NOT_FOUND", "message": "Inquiry not found."},
        )

    if batch.inquiry_id is None:
        batch.inquiry_id = inquiry_id
    elif batch.inquiry_id != inquiry_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_INQUIRY_MISMATCH", "message": "Batch linked to another inquiry."},
        )

    applied_fields: list[str] = []
    diff_summary: list[dict[str, str]] = []
    for it in items:
        if it.disposition == "marked_apply":
            it.disposition = "applied_to_record"
            it.before_value_snapshot = ""
            after = inquiry_snapshot_for_field(inquiry, it.field_key)
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
        action="INQUIRY_AI_SUGGESTION_FINALIZE_CREATE",
        resource="inquiry",
        details_json={
            "inquiry_id": inquiry_id,
            "suggestion_batch_id": batch.id,
            "applied_field_count": len(applied_fields),
            "applied_fields": applied_fields[:50],
            "diff_summary": diff_summary[:30],
        },
        request_id=get_master_data_ai_request_id(),
        prompt_category="inquiry_ai",
        severity="INFO",
    )
    return {"applied_fields": applied_fields, "diff_summary": diff_summary}


async def _validate_inquiry_fk_updates(
    db: AsyncSession, *, tenant_id: int, inquiry: Inquiry, acc: dict[str, Any]
) -> None:
    cid = acc.get("customer_id", inquiry.customer_id)
    if "customer_id" in acc:
        c = await db.get(Customer, acc["customer_id"])
        if not c or c.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid customer for tenant")
    if "style_id" in acc and acc["style_id"] is not None:
        st = await db.get(GarmentStyle, acc["style_id"])
        if not st or st.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid style for tenant")
    if "customer_intermediary_id" in acc and acc["customer_intermediary_id"] is not None:
        link = await db.get(CustomerIntermediary, acc["customer_intermediary_id"])
        if not link or link.tenant_id != tenant_id:
            raise HTTPException(status_code=400, detail="Invalid intermediary for tenant")
        if link.customer_id != cid:
            raise HTTPException(status_code=400, detail="Intermediary does not belong to inquiry customer")


async def apply_suggestions_to_inquiry(
    db: AsyncSession,
    *,
    tenant: Tenant,
    user_id: int | None,
    batch_id: int,
    inquiry_id: int,
    actions: list[tuple[str, Literal["apply", "reject", "skip"]]],
    conflict_mode: Literal["overwrite", "skip_if_different"],
) -> dict[str, Any]:
    batch, items = await _load_batch_items(db, batch_id=batch_id, tenant_id=tenant.id)
    _require_field_suggestion_batch(batch)
    if batch.inquiry_id is not None and batch.inquiry_id != inquiry_id:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"code": "BATCH_INQUIRY_MISMATCH", "message": "Batch belongs to a different inquiry."},
        )
    batch.inquiry_id = inquiry_id

    r = await db.execute(select(Inquiry).where(Inquiry.id == inquiry_id, Inquiry.tenant_id == tenant.id))
    inquiry = r.scalar_one_or_none()
    if not inquiry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "INQUIRY_NOT_FOUND", "message": "Inquiry not found."},
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
        before = inquiry_snapshot_for_field(inquiry, nk)
        it.before_value_snapshot = before
        cur = before
        if conflict_mode == "skip_if_different" and _norm_cmp(cur) and _norm_cmp(cur) != _norm_cmp(sug):
            conflicts.append({"field": nk, "current": cur[:200], "suggested": sug[:200]})
            skipped.append(nk)
            continue
        accumulate_inquiry_update(nk, sug, acc)
        it.disposition = "applied_to_record"
        it.updated_at = datetime.utcnow()
        applied.append(nk)

    if acc:
        await _validate_inquiry_fk_updates(db, tenant_id=tenant.id, inquiry=inquiry, acc=acc)
        for k, v in acc.items():
            setattr(inquiry, k, v)
        inquiry.updated_at = datetime.utcnow()
        await db.flush()
        await db.refresh(inquiry)

    _recompute_batch_status(batch, items)
    await db.flush()

    after_snap = {k: inquiry_snapshot_for_field(inquiry, k) for k in applied}

    await log_ai_event(
        db,
        tenant_id=tenant.id,
        user_id=user_id,
        action="INQUIRY_AI_SUGGESTION_APPLY",
        resource="inquiry",
        details_json={
            "inquiry_id": inquiry_id,
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
        prompt_category="inquiry_ai",
        severity="INFO",
    )

    return {
        "inquiry": inquiry,
        "applied_fields": applied,
        "skipped_fields": skipped,
        "rejected_fields": rejected,
        "conflicts": conflicts,
    }
