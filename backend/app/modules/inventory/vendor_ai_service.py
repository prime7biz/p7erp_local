"""Vendor (supplier) AI orchestration — mirrors customer_ai_service on Vendor master."""

from __future__ import annotations

import html
import json
import re
import time
from typing import Any
from urllib.parse import urlparse

import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import User, Vendor
from app.models.ai_tool import AiAuditLog
from app.modules.ai_extract import service as extract_service
from app.modules.ai_tool.audit import log_ai_event
from app.modules.ai_tool.llm_provider import get_llm_provider
from app.modules.inventory import vendor_ai_batches as v_batches
from app.modules.inventory import vendor_ai_prompts as prompts
from app.modules.master_data_ai.audit_labels import vendor_ai_event_label
from app.modules.master_data_ai.gateway import invoke_structured_llm
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id
from app.modules.master_data_ai.sanitization import sanitize_untrusted_text
from app.modules.inventory.vendor_ai_schemas import (
    VendorAiAuditEntry,
    VendorAiAuditListResponse,
    VendorAiDedupeMatch,
    VendorAiDedupeRequest,
    VendorAiDedupeResponse,
    VendorAiEnrichRequest,
    VendorAiEnrichResponse,
    VendorAiExtractWrapResponse,
    VendorAiFieldSuggestion,
    VendorAiNextActionItem,
    VendorAiNextActionsRequest,
    VendorAiNextActionsResponse,
    VendorAiSummaryRequest,
    VendorAiSummaryResponse,
    VendorAiValidateIssue,
    VendorAiValidateRequest,
    VendorAiValidateResponse,
    _LlmEnrichOut,
    _LlmNextActionsOut,
    _LlmSummaryOut,
)


def _vendor_profile_dict(v: Vendor) -> dict[str, Any]:
    return {
        "id": v.id,
        "vendor_code": v.vendor_code,
        "name": v.name,
        "legal_name": v.legal_name,
        "trade_name": v.trade_name,
        "contact_person": v.contact_person,
        "email": v.email,
        "phone": v.phone,
        "mobile": v.mobile,
        "website": v.website,
        "address": v.address,
        "address_line1": v.address_line1,
        "city": v.city,
        "state_or_region": v.state_or_region,
        "postal_code": v.postal_code,
        "country": v.country,
        "tax_id": v.tax_id,
        "registration_number": v.registration_number,
        "vendor_type": v.vendor_type,
        "default_currency": v.default_currency,
        "payment_terms_days": v.payment_terms_days,
        "payment_terms": v.payment_terms,
        "incoterms": v.incoterms,
        "shipping_terms": v.shipping_terms,
        "lead_time_notes": v.lead_time_notes,
        "bank_name": v.bank_name,
        "bank_account_title": v.bank_account_title,
        "bank_account_no": v.bank_account_no,
        "swift_code": v.swift_code,
        "iban": v.iban,
        "compliance_status": v.compliance_status,
        "compliance_reference_numbers": v.compliance_reference_numbers,
        "certifications_summary": v.certifications_summary,
        "onboarding_status": v.onboarding_status,
        "remarks": v.remarks,
        "is_active": v.is_active,
        "ledger_id": v.ledger_id,
    }


def _vendor_health_snapshot(v: Vendor) -> dict[str, Any]:
    checks = [
        bool((v.name or "").strip()),
        bool((v.email or "").strip() or (v.phone or "").strip() or (v.mobile or "").strip()),
        bool((v.country or "").strip()),
        bool((v.tax_id or "").strip() or (v.registration_number or "").strip()),
        bool((v.address or v.address_line1 or "").strip()),
        bool((v.default_currency or "").strip()),
    ]
    score = int(round(100 * sum(1 for x in checks if x) / max(len(checks), 1)))
    bank_checks = [
        bool((v.bank_name or "").strip()),
        bool((v.bank_account_no or "").strip() or (v.iban or "").strip()),
        bool((v.swift_code or "").strip()),
    ]
    bank_score = int(round(100 * sum(1 for x in bank_checks if x) / 3))
    comp_checks = [
        bool((v.compliance_status or "").strip()),
        bool((v.compliance_reference_numbers or "").strip() or (v.certifications_summary or "").strip()),
    ]
    comp_score = int(round(100 * sum(1 for x in comp_checks if x) / 2))
    return {
        "profile_completeness": score,
        "banking_completeness": bank_score,
        "compliance_completeness": comp_score,
        "onboarding_status": v.onboarding_status,
        "has_ledger": v.ledger_id is not None,
    }


async def _audit(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    action: str,
    details: dict[str, Any],
    model_used: str | None = None,
    latency_ms: int | None = None,
    result: str = "success",
    error_category: str | None = None,
    severity: str = "INFO",
) -> None:
    rid = get_master_data_ai_request_id()
    merged = {**details, "result": result}
    if error_category:
        merged["error_category"] = error_category
    if rid:
        merged["vendor_ai_request_id"] = rid
    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource="vendor",
        request_id=rid,
        trace_id=rid,
        severity=severity,
        details_json=merged,
        model_used=model_used,
        latency_ms=latency_ms,
        prompt_category="vendor_ai",
        error_category=error_category,
    )


async def ai_extract_document(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    file_bytes: bytes,
    content_type: str,
    vendor_id: int | None,
) -> VendorAiExtractWrapResponse:
    t0 = time.perf_counter()
    base = await extract_service.extract_vendor_form(db, tenant_id, file_bytes, content_type)
    fields = {}
    for k, ef in base.fields.items():
        fields[k] = ef.model_copy(update={"source": "uploaded_document"})
    resp = base.model_copy(update={"fields": fields})
    ms = int((time.perf_counter() - t0) * 1000)
    ext_result = (
        "failed"
        if not resp.success
        else "partial"
        if (resp.warnings or resp.unmapped_text or not resp.fields)
        else "success"
    )
    suggestion_batch_id = await v_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        vendor_id=vendor_id,
        extraction=resp,
        request_id=get_master_data_ai_request_id(),
        model_hint="gemini_multimodal",
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="VENDOR_AI_EXTRACT",
        details={
            "vendor_id": vendor_id,
            "field_keys": list(resp.fields.keys()),
            "suggestion_batch_id": suggestion_batch_id,
        },
        model_used="gemini_multimodal",
        latency_ms=ms,
        result=ext_result,
        error_category=None if resp.success else "extraction_failed",
    )
    return VendorAiExtractWrapResponse(
        extraction=resp,
        model_hint="gemini_multimodal",
        request_id=get_master_data_ai_request_id(),
        suggestion_batch_id=suggestion_batch_id,
    )


async def _fetch_website_text(url: str) -> tuple[str, list[str]]:
    warnings: list[str] = []
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return "", ["Invalid URL scheme"]
        async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Prime7ERP-VendorEnrich/1.0"})
            r.raise_for_status()
            ct = (r.headers.get("content-type") or "").lower()
            if "text/html" not in ct and "text/plain" not in ct:
                warnings.append("Non-HTML response; text extraction may be poor.")
            raw = r.text[:200_000]
            text = re.sub(r"<script[\s\S]*?</script>", " ", raw, flags=re.I)
            text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
            text = re.sub(r"<[^>]+>", " ", text)
            text = re.sub(r"\s+", " ", text).strip()[:12000]
            return text, warnings
    except Exception as exc:
        return "", [f"Website fetch failed: {type(exc).__name__}"]


async def ai_enrich(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: VendorAiEnrichRequest,
) -> VendorAiEnrichResponse:
    t0 = time.perf_counter()
    warnings: list[str] = []
    snippet_parts: list[str] = []
    url = (body.website or "").strip()
    if url and not url.lower().startswith(("http://", "https://")):
        url = "https://" + url
    if url:
        text, w = await _fetch_website_text(url)
        warnings.extend(w)
        if text:
            snippet_parts.append(sanitize_untrusted_text(text))
            source_hint = "website"
        else:
            source_hint = "ai_inference"
    else:
        source_hint = "ai_inference"
    dom = (body.domain or "").strip()
    if dom:
        snippet_parts.append(f"Domain hint: {html.escape(dom, quote=True)[:200]}")
    em = (body.email or "").strip()
    if em:
        snippet_parts.append(f"Email hint: {html.escape(em, quote=True)[:200]}")
    co = (body.company_name or "").strip()
    if co:
        snippet_parts.append(f"Company hint: {html.escape(co, quote=True)[:200]}")
    snippet = "\n".join(snippet_parts) or "No external text; infer only from context JSON."
    ctx = json.dumps(body.fields, default=str)[:4000]
    prov = get_llm_provider()
    prompt = f"{prompts.ENRICH_SYSTEM}\n\n{prompts.enrich_user_prompt(snippet=snippet, context_json=ctx)}"
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="vendor_enrich",
        prompt=prompt,
        response_model=_LlmEnrichOut,
        tenant_id=tenant_id,
        request_id=get_master_data_ai_request_id(),
    )
    ms = int((time.perf_counter() - t0) * 1000)
    suggestions: dict[str, VendorAiFieldSuggestion] = {}
    if parsed and parsed.suggestions:
        for row in parsed.suggestions:
            if not isinstance(row, dict):
                continue
            fk = str(row.get("field_key") or "").strip()
            if not fk:
                continue
            try:
                conf = float(row.get("confidence") or 0.5)
            except (TypeError, ValueError):
                conf = 0.5
            conf = max(0.0, min(1.0, conf))
            suggestions[fk] = VendorAiFieldSuggestion(
                value=(str(row.get("value")).strip() if row.get("value") is not None else None),
                confidence=conf,
                source=source_hint if source_hint == "website" else "ai_inference",
                rationale=(str(row.get("rationale") or "")[:512] or None),
            )
        warnings.extend(parsed.warnings or [])
    if err:
        warnings.append(err)
    enr_result = "partial" if err or warnings else "success"
    suggestion_batch_id = await v_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        vendor_id=body.vendor_id,
        suggestions=suggestions,
        request_id=get_master_data_ai_request_id(),
        model_name=prov_name,
        source_type=source_hint,
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="VENDOR_AI_ENRICH",
        details={
            "vendor_id": body.vendor_id,
            "keys": list(suggestions.keys()),
            "suggestion_batch_id": suggestion_batch_id,
            "error": (err[:500] if err else None),
        },
        model_used=prov_name,
        latency_ms=ms,
        result=enr_result,
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return VendorAiEnrichResponse(
        suggestions=suggestions, warnings=warnings, suggestion_batch_id=suggestion_batch_id
    )


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


async def ai_validate(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: VendorAiValidateRequest,
) -> VendorAiValidateResponse:
    t0 = time.perf_counter()
    f = body.fields or {}
    issues: list[VendorAiValidateIssue] = []
    normalized: dict[str, str | None] = {}

    def g(*keys: str) -> str:
        for key in keys:
            v = f.get(key)
            if v is not None and str(v).strip():
                return str(v).strip()
        return ""

    email = g("email", "contactEmail")
    if email and not _EMAIL_RE.match(email):
        issues.append(
            VendorAiValidateIssue(
                field="email",
                severity="error",
                message="Email format looks invalid.",
                suggestion="Use a standard email like name@company.com",
            )
        )
    elif email:
        normalized["email"] = email.lower()

    website = g("website")
    if website:
        try:
            p = urlparse(website if "://" in website else f"https://{website}")
            if p.scheme not in ("http", "https") or not p.netloc:
                raise ValueError("bad")
            normalized["website"] = website if "://" in website else f"https://{website}"
        except Exception:
            issues.append(
                VendorAiValidateIssue(
                    field="website",
                    severity="warning",
                    message="Website URL may be incomplete.",
                    suggestion="Use https://example.com format",
                )
            )

    profile_checks = [
        ("vendorDisplayName", g("vendorDisplayName", "name")),
        ("legalName", g("legalName", "legal_name")),
        ("country", g("country")),
        ("emailOrPhone", email or g("phone", "mobile")),
        ("taxOrReg", g("taxId", "tax_id", "registrationNumber", "registration_number")),
        ("address", g("address", "addressLine1", "address_line1")),
        ("currency", g("defaultCurrency", "default_currency")),
    ]
    filled = sum(1 for _, v in profile_checks if v)
    score = int(round(100 * filled / len(profile_checks)))

    bank_checks = [
        g("bankName", "bank_name"),
        g("bankAccountNo", "bank_account_no", "iban"),
        g("swiftCode", "swift_code"),
    ]
    bank_filled = sum(1 for x in bank_checks if x)
    bank_score = int(round(100 * bank_filled / 3))

    comp_checks = [
        g("complianceStatus", "compliance_status"),
        g("complianceReferenceNumbers", "compliance_reference_numbers", "certificationsSummary", "certifications_summary"),
    ]
    comp_filled = sum(1 for x in comp_checks if x)
    compliance_score = int(round(100 * comp_filled / 2))

    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_master_data_ai_request_id()
    batch_id = await v_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        vendor_id=body.vendor_id,
        action_type="validate",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "completeness_score": score,
            "banking_score": bank_score,
            "compliance_score": compliance_score,
            "issue_count": len(issues),
            "issues": [i.model_dump() for i in issues[:40]],
            "normalized_field_keys": list(normalized.keys())[:30],
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="VENDOR_AI_VALIDATE",
        details={
            "vendor_id": body.vendor_id,
            "suggestion_batch_id": batch_id,
            "issue_count": len(issues),
            "completeness_score": score,
        },
        latency_ms=ms,
        result="success",
    )
    return VendorAiValidateResponse(
        issues=issues,
        completeness_score=score,
        banking_score=bank_score,
        compliance_score=compliance_score,
        normalized_fields=normalized,
        suggestion_batch_id=batch_id,
    )


async def ai_dedupe(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: VendorAiDedupeRequest,
) -> VendorAiDedupeResponse:
    t0 = time.perf_counter()
    f = body.fields or {}
    exclude = body.exclude_vendor_id

    def gx(*keys: str) -> str | None:
        for k in keys:
            v = f.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    legal = gx("legalName", "legal_name", "name", "vendorDisplayName")
    trade = gx("tradeName", "trade_name")
    email = gx("email", "contactEmail")
    phone = gx("phone", "mobile", "contactPhone")
    tax = gx("taxId", "tax_id")
    bank_no = gx("bankAccountNo", "bank_account_no")

    matches_map: dict[int, VendorAiDedupeMatch] = {}

    def add_row(row: Vendor, score: float, reason: str) -> None:
        if exclude is not None and row.id == exclude:
            return
        cur = matches_map.get(row.id)
        m = VendorAiDedupeMatch(
            vendor_id=row.id,
            vendor_code=row.vendor_code,
            name=row.name,
            score=score,
            matched_on=[reason],
        )
        if cur is None or score > cur.score:
            matches_map[row.id] = m
        elif abs(score - cur.score) < 0.01:
            mo = list(cur.matched_on)
            if reason not in mo:
                mo.append(reason)
            matches_map[row.id] = cur.model_copy(update={"matched_on": mo})

    if email:
        em = email.lower()
        r = await db.execute(
            select(Vendor).where(
                Vendor.tenant_id == tenant_id,
                func.lower(func.coalesce(Vendor.email, "")) == em,
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.95, "email")

    if tax and len(tax) >= 3:
        r = await db.execute(
            select(Vendor).where(
                Vendor.tenant_id == tenant_id,
                Vendor.tax_id.ilike(tax.strip()),
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.98, "tax_id")

    if bank_no and len(re.sub(r"\D", "", bank_no)) >= 4:
        digits = re.sub(r"\D", "", bank_no)
        r = await db.execute(select(Vendor).where(Vendor.tenant_id == tenant_id).limit(500))
        for row in r.scalars().all():
            acc = row.bank_account_no or ""
            if digits and digits in re.sub(r"\D", "", acc):
                add_row(row, 0.9, "bank_account")

    if phone and len(re.sub(r"\D", "", phone)) >= 6:
        digits = re.sub(r"\D", "", phone)
        r = await db.execute(select(Vendor).where(Vendor.tenant_id == tenant_id).limit(500))
        for row in r.scalars().all():
            rp = row.phone or row.mobile or ""
            if digits and digits in re.sub(r"\D", "", rp):
                add_row(row, 0.88, "phone")

    if legal and len(legal) >= 3:
        pattern = f"%{legal.lower()}%"
        r = await db.execute(
            select(Vendor).where(
                Vendor.tenant_id == tenant_id,
                or_(
                    Vendor.name.ilike(pattern),
                    Vendor.legal_name.ilike(pattern),
                ),
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.72, "legal_name")

    if trade and len(trade) >= 3:
        pattern = f"%{trade.lower()}%"
        r = await db.execute(
            select(Vendor).where(Vendor.tenant_id == tenant_id, Vendor.trade_name.ilike(pattern)).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.68, "trade_name")

    out = sorted(matches_map.values(), key=lambda m: (-m.score, m.vendor_id))[:25]
    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_master_data_ai_request_id()
    batch_id = await v_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        vendor_id=None,
        action_type="dedupe",
        request_id=rid,
        model_hint="db_similarity",
        meta_payload={
            "candidate_count": len(out),
            "exclude_vendor_id": exclude,
            "matches": [
                {
                    "vendor_id": m.vendor_id,
                    "vendor_code": m.vendor_code,
                    "score": m.score,
                    "matched_on": m.matched_on[:8],
                    "name_excerpt": (m.name or "")[:120],
                }
                for m in out
            ],
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="VENDOR_AI_DEDUPE",
        details={
            "match_count": len(out),
            "exclude_vendor_id": exclude,
            "suggestion_batch_id": batch_id,
        },
        latency_ms=ms,
        result="success",
    )
    return VendorAiDedupeResponse(matches=out, warnings=[], suggestion_batch_id=batch_id)


async def ai_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: VendorAiSummaryRequest,
) -> VendorAiSummaryResponse:
    t0 = time.perf_counter()
    r = await db.execute(select(Vendor).where(Vendor.id == body.vendor_id, Vendor.tenant_id == tenant_id))
    v = r.scalar_one_or_none()
    if not v:
        return VendorAiSummaryResponse(
            summary_text="",
            key_facts=[],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=None,
        )
    health = _vendor_health_snapshot(v)
    profile = _vendor_profile_dict(v)
    prov = get_llm_provider()
    prompt = f"{prompts.summary_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(health, default=str))}"
    rid = get_master_data_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="vendor_summary",
        prompt=prompt,
        response_model=_LlmSummaryOut,
        tenant_id=tenant_id,
        request_id=rid,
    )
    ms = int((time.perf_counter() - t0) * 1000)
    summary_text = (parsed.summary_text or "") if parsed else ""
    key_facts = list(parsed.key_facts or []) if parsed else []
    risk_indicators = list(parsed.risk_indicators or []) if parsed else []
    profile_grade = (parsed.profile_grade or "fair")[:32] if parsed else "unknown"
    excerpt_src = summary_text if parsed else (err or "unavailable")
    excerpt = excerpt_src if len(excerpt_src) <= 800 else excerpt_src[:797] + "..."
    batch_id = await v_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        vendor_id=body.vendor_id,
        action_type="summary",
        request_id=rid,
        model_hint=prov_name,
        meta_payload={
            "profile_grade": profile_grade,
            "summary_excerpt": excerpt,
            "key_facts_count": len(key_facts),
            "risk_indicators_count": len(risk_indicators),
            "parse_error": bool(err),
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="VENDOR_AI_SUMMARY",
        details={
            "vendor_id": body.vendor_id,
            "error": (err[:500] if err else None),
            "suggestion_batch_id": batch_id,
            "key_facts_count": len(key_facts),
        },
        model_used=prov_name,
        latency_ms=ms,
        result="partial" if err else "success",
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    if not parsed:
        return VendorAiSummaryResponse(
            summary_text="AI summary unavailable.",
            key_facts=[err or "parse_error"],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=batch_id,
        )
    return VendorAiSummaryResponse(
        summary_text=summary_text,
        key_facts=key_facts,
        risk_indicators=risk_indicators,
        profile_grade=profile_grade,
        suggestion_batch_id=batch_id,
    )


async def ai_next_actions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: VendorAiNextActionsRequest,
) -> VendorAiNextActionsResponse:
    t0 = time.perf_counter()
    r = await db.execute(select(Vendor).where(Vendor.id == body.vendor_id, Vendor.tenant_id == tenant_id))
    v = r.scalar_one_or_none()
    if not v:
        return VendorAiNextActionsResponse(actions=[], suggestion_batch_id=None)
    health = _vendor_health_snapshot(v)
    profile = _vendor_profile_dict(v)
    prov = get_llm_provider()
    prompt = f"{prompts.NEXT_ACTIONS_SYSTEM}\n\n{prompts.next_actions_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(health, default=str))}"
    rid = get_master_data_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="vendor_next_actions",
        prompt=prompt,
        response_model=_LlmNextActionsOut,
        tenant_id=tenant_id,
        request_id=rid,
    )
    ms = int((time.perf_counter() - t0) * 1000)
    actions: list[VendorAiNextActionItem] = []
    if parsed and parsed.actions:
        for a in parsed.actions:
            if not isinstance(a, dict):
                continue
            actions.append(
                VendorAiNextActionItem(
                    action_type=str(a.get("action_type") or "complete_profile")[:64],
                    title=str(a.get("title") or "Follow up")[:255],
                    description=str(a.get("description") or "")[:2000],
                    priority=int(a.get("priority") or 5),
                    target_module=str(a.get("target_module") or "inventory")[:64],
                    target_url=(str(a.get("target_url"))[:512] if a.get("target_url") else None),
                )
            )
    batch_id = await v_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        vendor_id=body.vendor_id,
        action_type="next_actions",
        request_id=rid,
        model_hint=prov_name,
        meta_payload={
            "action_count": len(actions),
            "titles": [a.title[:160] for a in actions[:25]],
            "parse_error": bool(err),
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="VENDOR_AI_NEXT_ACTIONS",
        details={
            "vendor_id": body.vendor_id,
            "count": len(actions),
            "error": (err[:500] if err else None),
            "suggestion_batch_id": batch_id,
        },
        model_used=prov_name,
        latency_ms=ms,
        result="partial" if err else "success",
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return VendorAiNextActionsResponse(actions=actions, suggestion_batch_id=batch_id)


def _int_detail(val: object) -> int | None:
    if isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, str) and val.strip().isdigit():
        return int(val.strip())
    return None


def _audit_entry(row: AiAuditLog, *, actor_username: str | None = None) -> VendorAiAuditEntry:
    dj = row.details_json if isinstance(row.details_json, dict) else {}
    vid = dj.get("vendor_id")
    vid_int: int | None = None
    if isinstance(vid, int):
        vid_int = vid
    elif isinstance(vid, str) and vid.strip().isdigit():
        vid_int = int(vid.strip())
    summary = row.action.replace("_", " ").title()
    if row.model_used:
        summary = f"{summary} · {row.model_used}"
    sbid = dj.get("suggestion_batch_id")
    sbid_int: int | None = None
    if isinstance(sbid, int):
        sbid_int = sbid
    elif isinstance(sbid, str) and sbid.strip().isdigit():
        sbid_int = int(sbid.strip())
    event_label = vendor_ai_event_label(row.action, dj)
    issue_count = _int_detail(dj.get("issue_count"))
    match_count = _int_detail(dj.get("match_count"))
    key_facts_count = _int_detail(dj.get("key_facts_count"))
    action_count = _int_detail(dj.get("count")) or _int_detail(dj.get("action_count"))
    applied_field_count = _int_detail(dj.get("applied_field_count")) or _int_detail(dj.get("applied_count"))
    return VendorAiAuditEntry(
        id=row.id,
        action=row.action,
        created_at=row.created_at.isoformat() if row.created_at else "",
        model_used=row.model_used,
        latency_ms=row.latency_ms,
        result=dj.get("result") if isinstance(dj.get("result"), str) else None,
        error_category=dj.get("error_category") if isinstance(dj.get("error_category"), str) else None,
        vendor_id=vid_int,
        summary=summary,
        suggestion_batch_id=sbid_int,
        actor_username=actor_username,
        event_label=event_label,
        issue_count=issue_count,
        match_count=match_count,
        key_facts_count=key_facts_count,
        action_count=action_count,
        applied_field_count=applied_field_count,
    )


async def list_vendor_ai_audit_logs(
    db: AsyncSession,
    *,
    tenant_id: int,
    vendor_id: int | None = None,
    limit: int = 40,
) -> VendorAiAuditListResponse:
    lim = max(1, min(int(limit), 100))
    stmt = (
        select(AiAuditLog, User.username)
        .outerjoin(User, User.id == AiAuditLog.user_id)
        .where(
            AiAuditLog.tenant_id == tenant_id,
            AiAuditLog.prompt_category == "vendor_ai",
        )
        .order_by(AiAuditLog.created_at.desc())
        .limit(lim)
    )
    if vendor_id is not None:
        stmt = stmt.where(AiAuditLog.details_json["vendor_id"].as_string() == str(vendor_id))
    r = await db.execute(stmt)
    pairs = r.all()
    return VendorAiAuditListResponse(items=[_audit_entry(row, actor_username=uname) for row, uname in pairs])
