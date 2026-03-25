"""Orchestrate extraction, normalization, matching, and duplicate hints."""

from __future__ import annotations

import html
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Customer
from app.modules.ai_extract.matchers import match_customers, match_styles
from app.modules.ai_extract.normalizers import (
    normalize_date,
    normalize_email,
    normalize_int,
    normalize_numeric_string,
    normalize_url,
    sanitize_text,
    split_phone_for_form,
)
from app.config import get_settings
from app.modules.ai_extract.providers.base import BaseExtractionProvider
from app.modules.ai_extract.providers.gemini_provider import GeminiExtractionProvider
from app.modules.ai_extract.providers.stub_provider import StubExtractionProvider
from app.modules.ai_extract.schemas import (
    CandidateMatch,
    CustomerExtractionResponse,
    DuplicateWarning,
    ExtractedField,
    InquiryExtractionResponse,
    InquiryItemExtracted,
)


def _get_provider() -> BaseExtractionProvider:
    s = get_settings()
    if s.gemini_enabled and (s.gemini_api_key or "").strip():
        return GeminiExtractionProvider()
    return StubExtractionProvider()


def _esc(s: str | None) -> str | None:
    if s is None:
        return None
    return html.escape(s, quote=False)


def _to_extracted_field(
    value: Any,
    confidence: float,
    source_text: str | None = None,
) -> ExtractedField:
    st = _esc(sanitize_text(source_text, 2048)) if source_text else None
    if isinstance(value, str):
        value = _esc(sanitize_text(value, 2048))
    return ExtractedField(value=value, confidence=max(0.0, min(1.0, confidence)), source_text=st)


async def _duplicate_warnings_for_customer(
    db: AsyncSession,
    tenant_id: int,
    fields: dict[str, ExtractedField],
) -> list[DuplicateWarning]:
    out: list[DuplicateWarning] = []
    seen_ids: set[int] = set()
    email_f = fields.get("contactEmail")
    if email_f and email_f.value:
        em = str(email_f.value).strip().lower()
        stmt = select(Customer).where(Customer.tenant_id == tenant_id).where(Customer.contact_email.ilike(em)).limit(5)
        r = await db.execute(stmt)
        for row in r.scalars().all():
            if row.id in seen_ids:
                continue
            seen_ids.add(row.id)
            out.append(
                DuplicateWarning(
                    field="contactEmail",
                    existing_value=row.contact_email or row.email or "",
                    existing_id=row.id,
                )
            )
    legal_f = fields.get("legalEntityName")
    if legal_f and legal_f.value:
        name = str(legal_f.value).strip()
        if len(name) >= 3:
            pattern = f"%{name}%"
            stmt = (
                select(Customer)
                .where(Customer.tenant_id == tenant_id)
                .where(or_(Customer.legal_entity_name.ilike(pattern), Customer.name.ilike(pattern)))
                .limit(5)
            )
            r = await db.execute(stmt)
            for row in r.scalars().all():
                if row.id in seen_ids:
                    continue
                seen_ids.add(row.id)
                out.append(
                    DuplicateWarning(
                        field="legalEntityName",
                        existing_value=row.legal_entity_name or row.name or "",
                        existing_id=row.id,
                    )
                )
    return out[:10]


def _normalize_customer_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.72)
        src = str(val) if val is not None else None

        if key == "contactEmail":
            norm, ok = normalize_email(str(val) if val else None)
            c = base_conf * (1.0 if ok else 0.35)
            fields_out[key] = _to_extracted_field(norm if ok else None, c, src)
            continue
        if key == "website":
            nu = normalize_url(str(val) if val else None)
            c = base_conf * (1.0 if nu else 0.45)
            fields_out[key] = _to_extracted_field(nu, c, src)
            continue
        if key == "contactPhone":
            # may be full string — also fill countryCode if missing in raw
            cc, num = split_phone_for_form(str(val) if val else None)
            fields_out[key] = _to_extracted_field(num, base_conf * 0.95, src)
            if cc and "countryCode" not in raw:
                fields_out["countryCode"] = _to_extracted_field(cc, base_conf * 0.9, src)
            continue
        if key == "countryCode":
            s = sanitize_text(str(val) if val else None, 16)
            if s and not s.startswith("+"):
                s = "+" + s.lstrip("+")
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        if key in ("legalEntityName", "tradeName", "primaryContactName", "designation"):
            s = sanitize_text(str(val) if val else None, 255)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        if key == "taxIdVatNumber":
            s = sanitize_text(str(val) if val else None, 128)
            fields_out[key] = _to_extracted_field(s, base_conf * (0.9 if s else 0.2), src)
            continue
        if key == "countryCode":
            s = sanitize_text(str(val) if val else None, 16)
            if s and not s.startswith("+"):
                s = "+" + s.lstrip("+")
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        if key.startswith("billing") or key.startswith("shipping"):
            s = sanitize_text(str(val) if val else None, 255)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        # fallback
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)

    return fields_out


def _normalize_inquiry_map(raw: dict[str, Any]) -> dict[str, ExtractedField]:
    confidences: dict[str, float] = {k: float(v) for k, v in (raw.get("_confidences") or {}).items()}
    fields_out: dict[str, ExtractedField] = {}
    for key, val in raw.items():
        if key.startswith("_"):
            continue
        base_conf = confidences.get(key, 0.7)
        src = str(val) if val is not None else None

        if key == "quantity":
            n = normalize_int(val)
            fields_out[key] = _to_extracted_field(n, base_conf * (1.0 if n is not None else 0.25), src)
            continue
        if key in ("target_price", "exchange_rate", "commission_value"):
            ns = normalize_numeric_string(val)
            fields_out[key] = _to_extracted_field(ns, base_conf * (1.0 if ns else 0.3), src)
            continue
        if key == "expected_delivery_date":
            nd = normalize_date(str(val) if val else None)
            fields_out[key] = _to_extracted_field(nd, base_conf * (1.0 if nd else 0.35), src)
            continue
        if key in ("commission_mode", "commission_type"):
            s = sanitize_text(str(val) if val else None, 32)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key in ("shipping_term",):
            s = sanitize_text(str(val) if val else None, 64)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key in ("currency", "target_price_currency"):
            s = sanitize_text(str(val) if val else None, 10)
            fields_out[key] = _to_extracted_field(s.upper() if s else None, base_conf, src)
            continue
        if key == "notes":
            s = sanitize_text(str(val) if val else None, 8000)
            fields_out[key] = _to_extracted_field(s, base_conf, src)
            continue
        s = sanitize_text(str(val) if val else None, 512)
        fields_out[key] = _to_extracted_field(s, base_conf, src)
    return fields_out


async def extract_customer_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
) -> CustomerExtractionResponse:
    provider = _get_provider()
    raw = await provider.extract_customer_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    fields = _normalize_customer_map(raw)
    dups = await _duplicate_warnings_for_customer(db, tenant_id, fields)
    success = bool(fields)
    return CustomerExtractionResponse(
        success=success,
        document_type="customer_info",
        fields=fields,
        unmapped_text=unmapped,
        warnings=warnings,
        duplicate_warnings=dups,
    )


async def extract_inquiry_form(
    db: AsyncSession,
    tenant_id: int,
    file_bytes: bytes,
    content_type: str,
) -> InquiryExtractionResponse:
    provider = _get_provider()
    raw = await provider.extract_inquiry_fields(file_bytes, content_type)
    unmapped = [html.escape(x, quote=False) for x in (raw.get("_unmapped_text") or [])]
    warnings = list(raw.get("_warnings") or [])
    items_raw = raw.get("_items") or []
    fields = _normalize_inquiry_map(raw)

    items: list[InquiryItemExtracted] = []
    for it in items_raw:
        if not isinstance(it, dict):
            continue
        items.append(
            InquiryItemExtracted(
                item_name=sanitize_text(it.get("item_name"), 255) or "",
                description=sanitize_text(it.get("description"), 1000) or "",
                quantity=normalize_int(it.get("quantity")),
                confidence=float(it.get("confidence", 0.5)),
            )
        )

    cand: dict[str, list[CandidateMatch]] = {}
    cust_name = None
    cust_code = None
    if fields.get("customer_name_candidate") and fields["customer_name_candidate"].value:
        cust_name = str(fields["customer_name_candidate"].value)
    if fields.get("customer_code_candidate") and fields["customer_code_candidate"].value:
        cust_code = str(fields["customer_code_candidate"].value)
    style_name = None
    style_ref = None
    if fields.get("style_name_candidate") and fields["style_name_candidate"].value:
        style_name = str(fields["style_name_candidate"].value)
    if fields.get("style_ref") and fields["style_ref"].value:
        style_ref = str(fields["style_ref"].value)

    q_customer = cust_code or cust_name
    if q_customer:
        rows = await match_customers(db, tenant_id, q_customer)
        cand["customer"] = [CandidateMatch(id=r["id"], name=r["name"], score=r["score"]) for r in rows]

    q_style = style_ref or style_name
    if q_style:
        rows = await match_styles(db, tenant_id, q_style)
        cand["style"] = [CandidateMatch(id=r["id"], name=r["name"], score=r["score"]) for r in rows]

    success = bool(fields) or bool(items)
    return InquiryExtractionResponse(
        success=success,
        document_type="inquiry_info",
        fields=fields,
        items=items,
        candidate_matches=cand,
        unmapped_text=unmapped,
        warnings=warnings,
    )
