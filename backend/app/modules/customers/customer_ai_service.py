"""Customer intelligence orchestration (suggestions only; no silent DB writes)."""

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

from app.models import Customer, User
from app.models.ai_tool import AiAuditLog
from app.modules.ai_extract import service as extract_service
from app.modules.ai_extract.schemas import CustomerExtractionResponse
from app.modules.ai_tool.audit import log_ai_event
from app.modules.ai_tool.llm_provider import get_llm_provider
from app.modules.customers import customer_ai_batches as ai_batches
from app.modules.customers import customer_ai_prompts as prompts
from app.modules.customers import service as customer_service
from app.modules.customers.customer_ai_context import get_customer_ai_request_id
from app.modules.master_data_ai.audit_labels import customer_ai_event_label
from app.modules.customers.customer_ai_gateway import (
    invoke_structured_llm,
    sanitize_nl_user_query,
    sanitize_untrusted_text,
)
from app.modules.customers.customer_ai_schemas import (
    CustomerAiAuditEntry,
    CustomerAiAuditListResponse,
    CustomerAiDedupeMatch,
    CustomerAiDedupeRequest,
    CustomerAiDedupeResponse,
    CustomerAiEnrichRequest,
    CustomerAiEnrichResponse,
    CustomerAiExtractWrapResponse,
    CustomerAiFieldSuggestion,
    CustomerAiNextActionItem,
    CustomerAiNextActionsRequest,
    CustomerAiNextActionsResponse,
    CustomerAiNlSearchResponse,
    CustomerAiSummaryRequest,
    CustomerAiSummaryResponse,
    CustomerAiValidateIssue,
    CustomerAiValidateRequest,
    CustomerAiValidateResponse,
    _LlmEnrichOut,
    _LlmNextActionsOut,
    _LlmNlFiltersOut,
    _LlmSummaryOut,
)


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
    rid = get_customer_ai_request_id()
    merged = {**details, "result": result}
    if error_category:
        merged["error_category"] = error_category
    if rid:
        merged["customer_ai_request_id"] = rid
    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource="customer",
        request_id=rid,
        trace_id=rid,
        severity=severity,
        details_json=merged,
        model_used=model_used,
        latency_ms=latency_ms,
        prompt_category="customer_ai",
        error_category=error_category,
    )


async def ai_extract_document(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    file_bytes: bytes,
    content_type: str,
    customer_id: int | None,
) -> CustomerAiExtractWrapResponse:
    t0 = time.perf_counter()
    base = await extract_service.extract_customer_form(db, tenant_id, file_bytes, content_type)
    fields = {}
    for k, ef in base.fields.items():
        fields[k] = ef.model_copy(update={"source": "uploaded_document"})
    resp = CustomerExtractionResponse(
        success=base.success,
        document_type=base.document_type,
        fields=fields,
        unmapped_text=base.unmapped_text,
        warnings=base.warnings,
        duplicate_warnings=base.duplicate_warnings,
    )
    ms = int((time.perf_counter() - t0) * 1000)
    ext_result = (
        "failed"
        if not resp.success
        else "partial"
        if (resp.warnings or resp.unmapped_text or not resp.fields)
        else "success"
    )
    suggestion_batch_id = await ai_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        customer_id=customer_id,
        extraction=resp,
        request_id=get_customer_ai_request_id(),
        model_hint="gemini_multimodal",
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_EXTRACT",
        details={
            "customer_id": customer_id,
            "field_keys": list(resp.fields.keys()),
            "suggestion_batch_id": suggestion_batch_id,
        },
        model_used="gemini_multimodal",
        latency_ms=ms,
        result=ext_result,
        error_category=None if resp.success else "extraction_failed",
    )
    return CustomerAiExtractWrapResponse(
        extraction=resp,
        model_hint="gemini_multimodal",
        request_id=get_customer_ai_request_id(),
        suggestion_batch_id=suggestion_batch_id,
    )


async def _fetch_website_text(url: str) -> tuple[str, list[str]]:
    warnings: list[str] = []
    try:
        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return "", ["Invalid URL scheme"]
        async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
            r = await client.get(
                url,
                headers={"User-Agent": "Prime7ERP-CustomerEnrich/1.0"},
            )
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
    body: CustomerAiEnrichRequest,
) -> CustomerAiEnrichResponse:
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
        operation="customer_enrich",
        prompt=prompt,
        response_model=_LlmEnrichOut,
        tenant_id=tenant_id,
        request_id=get_customer_ai_request_id(),
    )
    ms = int((time.perf_counter() - t0) * 1000)
    suggestions: dict[str, CustomerAiFieldSuggestion] = {}
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
            suggestions[fk] = CustomerAiFieldSuggestion(
                value=(str(row.get("value")).strip() if row.get("value") is not None else None),
                confidence=conf,
                source=source_hint if source_hint == "website" else "ai_inference",
                rationale=(str(row.get("rationale") or "")[:512] or None),
            )
        warnings.extend(parsed.warnings or [])
    if err:
        warnings.append(err)
    enr_result = "partial" if err or warnings else "success"
    suggestion_batch_id = await ai_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        customer_id=body.customer_id,
        suggestions=suggestions,
        request_id=get_customer_ai_request_id(),
        model_name=prov_name,
        source_type=source_hint,
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_ENRICH",
        details={
            "customer_id": body.customer_id,
            "keys": list(suggestions.keys()),
            "suggestion_batch_id": suggestion_batch_id,
            "error": (err[:500] if err else None),
        },
        model_used=prov_name,
        latency_ms=ms,
        result=enr_result,
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return CustomerAiEnrichResponse(
        suggestions=suggestions, warnings=warnings, suggestion_batch_id=suggestion_batch_id
    )


_EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


async def ai_validate(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: CustomerAiValidateRequest,
) -> CustomerAiValidateResponse:
    t0 = time.perf_counter()
    f = body.fields or {}
    issues: list[CustomerAiValidateIssue] = []
    normalized: dict[str, str | None] = {}

    def g(key: str) -> str:
        v = f.get(key)
        if v is None:
            return ""
        return str(v).strip()

    email = g("contactEmail") or g("contact_email") or g("email")
    if email and not _EMAIL_RE.match(email):
        issues.append(
            CustomerAiValidateIssue(
                field="contactEmail",
                severity="error",
                message="Email format looks invalid.",
                suggestion="Use a standard email like name@company.com",
            )
        )
    elif email:
        normalized["contactEmail"] = email.lower()

    website = g("website")
    if website:
        try:
            p = urlparse(website if "://" in website else f"https://{website}")
            if p.scheme not in ("http", "https") or not p.netloc:
                raise ValueError("bad")
            normalized["website"] = website if "://" in website else f"https://{website}"
        except Exception:
            issues.append(
                CustomerAiValidateIssue(
                    field="website",
                    severity="warning",
                    message="Website URL may be incomplete.",
                    suggestion="Use https://example.com format",
                )
            )

    checks = [
        ("legalEntityName", g("legalEntityName") or g("legal_entity_name")),
        ("tradeName", g("tradeName") or g("trade_name")),
        ("taxIdVatNumber", g("taxIdVatNumber") or g("tax_id_vat_number")),
        ("contactEmail", email),
        ("contactPhone", g("contactPhone") or g("contact_phone") or g("phone")),
        ("website", website),
        ("billingAddressLine1", g("billingAddressLine1") or g("billing_address_line1")),
        ("billingCity", g("billingCity") or g("billing_city")),
        ("billingCountry", g("billingCountry") or g("billing_country")),
        ("primaryContactName", g("primaryContactName") or g("primary_contact_name")),
        ("designation", g("designation")),
        ("companyLogoUrl", g("companyLogoUrl") or g("company_logo_url")),
    ]
    filled = sum(1 for _, v in checks if v)
    score = int(round(100 * filled / len(checks)))

    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_customer_ai_request_id()
    batch_id = await ai_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        customer_id=body.customer_id,
        action_type="validate",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "completeness_score": score,
            "issue_count": len(issues),
            "issues": [i.model_dump() for i in issues[:40]],
            "normalized_field_keys": list(normalized.keys())[:30],
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_VALIDATE",
        details={
            "customer_id": body.customer_id,
            "suggestion_batch_id": batch_id,
            "issue_count": len(issues),
            "completeness_score": score,
        },
        latency_ms=ms,
        result="success",
    )
    return CustomerAiValidateResponse(
        issues=issues,
        completeness_score=score,
        normalized_fields=normalized,
        suggestion_batch_id=batch_id,
    )


async def ai_dedupe(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: CustomerAiDedupeRequest,
) -> CustomerAiDedupeResponse:
    t0 = time.perf_counter()
    f = body.fields or {}
    exclude = body.exclude_customer_id

    def gx(*keys: str) -> str | None:
        for k in keys:
            v = f.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    legal = gx("legalEntityName", "legal_entity_name", "name")
    trade = gx("tradeName", "trade_name")
    email = gx("contactEmail", "contact_email", "email")
    phone = gx("contactPhone", "contact_phone", "phone")
    tax = gx("taxIdVatNumber", "tax_id_vat_number")
    country = gx("billingCountry", "billing_country", "country")
    contact = gx("primaryContactName", "primary_contact_name")

    matches_map: dict[int, CustomerAiDedupeMatch] = {}

    def add_row(row: Customer, score: float, reason: str) -> None:
        if exclude is not None and row.id == exclude:
            return
        cur = matches_map.get(row.id)
        m = CustomerAiDedupeMatch(
            customer_id=row.id,
            customer_code=row.customer_code,
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
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                or_(
                    func.lower(func.coalesce(Customer.contact_email, "")) == em,
                    func.lower(func.coalesce(Customer.email, "")) == em,
                ),
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.95, "email")

    if tax and len(tax) >= 3:
        r = await db.execute(
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                Customer.tax_id_vat_number.ilike(tax.strip()),
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.98, "tax_id_vat_number")

    if phone and len(re.sub(r"\D", "", phone)) >= 6:
        digits = re.sub(r"\D", "", phone)
        r = await db.execute(select(Customer).where(Customer.tenant_id == tenant_id).limit(500))
        for row in r.scalars().all():
            rp = row.contact_phone or row.phone or ""
            if digits and digits in re.sub(r"\D", "", rp):
                add_row(row, 0.88, "phone")

    if legal and len(legal) >= 3:
        pattern = f"%{legal.lower()}%"
        r = await db.execute(
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                or_(
                    Customer.name.ilike(pattern),
                    Customer.legal_entity_name.ilike(pattern),
                ),
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.72, "legal_entity_name")

    if trade and len(trade) >= 3:
        pattern = f"%{trade.lower()}%"
        r = await db.execute(
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                Customer.trade_name.ilike(pattern),
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.68, "trade_name")

    if country and contact and len(contact) >= 2:
        r = await db.execute(
            select(Customer).where(
                Customer.tenant_id == tenant_id,
                or_(
                    Customer.billing_country.ilike(country.strip()),
                    Customer.country.ilike(country.strip()),
                ),
                Customer.primary_contact_name.ilike(f"%{contact.strip()}%"),
            ).limit(20)
        )
        for row in r.scalars().all():
            add_row(row, 0.55, "country_and_contact")

    out = sorted(matches_map.values(), key=lambda m: (-m.score, m.customer_id))[:25]
    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_customer_ai_request_id()
    batch_id = await ai_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        customer_id=None,
        action_type="dedupe",
        request_id=rid,
        model_hint="db_similarity",
        meta_payload={
            "candidate_count": len(out),
            "exclude_customer_id": exclude,
            "matches": [
                {
                    "customer_id": m.customer_id,
                    "customer_code": m.customer_code,
                    "score": m.score,
                    "matched_on": m.matched_on[:8],
                    "name_excerpt": (m.name or "")[:120],
                }
                for m in out
            ],
            "merge_ready": True,
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_DEDUPE",
        details={
            "match_count": len(out),
            "exclude_customer_id": exclude,
            "suggestion_batch_id": batch_id,
        },
        latency_ms=ms,
        result="success",
    )
    return CustomerAiDedupeResponse(matches=out, warnings=[], suggestion_batch_id=batch_id)


async def ai_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: CustomerAiSummaryRequest,
) -> CustomerAiSummaryResponse:
    t0 = time.perf_counter()
    r = await db.execute(
        select(Customer).where(Customer.id == body.customer_id, Customer.tenant_id == tenant_id)
    )
    c = r.scalar_one_or_none()
    if not c:
        return CustomerAiSummaryResponse(
            summary_text="",
            key_facts=[],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=None,
        )
    health = await customer_service.get_health(db, tenant_id=tenant_id, customer_id=body.customer_id)
    profile = customer_service.customer_to_response(c).model_dump()
    hjson = health.model_dump() if health else {}
    prov = get_llm_provider()
    prompt = f"{prompts.summary_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(hjson, default=str))}"
    rid = get_customer_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="customer_summary",
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
    batch_id = await ai_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        customer_id=body.customer_id,
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
        action="CUSTOMER_AI_SUMMARY",
        details={
            "customer_id": body.customer_id,
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
        return CustomerAiSummaryResponse(
            summary_text="AI summary unavailable.",
            key_facts=[err or "parse_error"],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=batch_id,
        )
    return CustomerAiSummaryResponse(
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
    body: CustomerAiNextActionsRequest,
) -> CustomerAiNextActionsResponse:
    t0 = time.perf_counter()
    r = await db.execute(
        select(Customer).where(Customer.id == body.customer_id, Customer.tenant_id == tenant_id)
    )
    c = r.scalar_one_or_none()
    if not c:
        return CustomerAiNextActionsResponse(actions=[], suggestion_batch_id=None)
    health = await customer_service.get_health(db, tenant_id=tenant_id, customer_id=body.customer_id)
    profile = customer_service.customer_to_response(c).model_dump()
    hjson = health.model_dump() if health else {}
    prov = get_llm_provider()
    prompt = f"{prompts.NEXT_ACTIONS_SYSTEM}\n\n{prompts.next_actions_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(hjson, default=str))}"
    rid = get_customer_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="customer_next_actions",
        prompt=prompt,
        response_model=_LlmNextActionsOut,
        tenant_id=tenant_id,
        request_id=rid,
    )
    ms = int((time.perf_counter() - t0) * 1000)
    actions: list[CustomerAiNextActionItem] = []
    if parsed and parsed.actions:
        for a in parsed.actions:
            if not isinstance(a, dict):
                continue
            actions.append(
                CustomerAiNextActionItem(
                    action_type=str(a.get("action_type") or "complete_profile")[:64],
                    title=str(a.get("title") or "Follow up")[:255],
                    description=str(a.get("description") or "")[:2000],
                    priority=int(a.get("priority") or 5),
                    target_module=str(a.get("target_module") or "customers")[:64],
                    target_url=(str(a.get("target_url"))[:512] if a.get("target_url") else None),
                )
            )
    batch_id = await ai_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        customer_id=body.customer_id,
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
        action="CUSTOMER_AI_NEXT_ACTIONS",
        details={
            "customer_id": body.customer_id,
            "count": len(actions),
            "error": (err[:500] if err else None),
            "suggestion_batch_id": batch_id,
        },
        model_used=prov_name,
        latency_ms=ms,
        result="partial" if err else "success",
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return CustomerAiNextActionsResponse(actions=actions, suggestion_batch_id=batch_id)


async def ai_nl_search(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    query: str,
) -> CustomerAiNlSearchResponse:
    t0 = time.perf_counter()
    safe_q, block_reason = sanitize_nl_user_query(query)
    if block_reason:
        ms = int((time.perf_counter() - t0) * 1000)
        await _audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="CUSTOMER_AI_NL_SEARCH",
            details={"query_len": len(query), "error": block_reason},
            latency_ms=ms,
            result="failed",
            error_category="safety_rejection",
            severity="WARN",
        )
        return CustomerAiNlSearchResponse(
            interpreted_filters={},
            keyword=None,
            explanation=block_reason,
        )
    prov = get_llm_provider()
    prompt = prompts.nl_search_user_prompt(query=safe_q)
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="customer_nl_search",
        prompt=prompt,
        response_model=_LlmNlFiltersOut,
        tenant_id=tenant_id,
        request_id=get_customer_ai_request_id(),
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CUSTOMER_AI_NL_SEARCH",
        details={"query_len": len(safe_q), "error": (err[:500] if err else None)},
        model_used=prov_name,
        latency_ms=ms,
        result="partial" if err else "success",
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    if not parsed:
        return CustomerAiNlSearchResponse(
            interpreted_filters={},
            keyword=safe_q.strip() or None,
            explanation=err,
        )
    return CustomerAiNlSearchResponse(
        interpreted_filters={
            k: v
            for k, v in {
                "country": parsed.country,
                "status": parsed.status,
                "customer_type": parsed.customer_type,
            }.items()
            if v
        },
        keyword=parsed.keyword or safe_q.strip() or None,
        explanation=parsed.explanation,
    )


def _int_detail(val: object) -> int | None:
    if isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, str) and val.strip().isdigit():
        return int(val.strip())
    return None


def _audit_entry(row: AiAuditLog, *, actor_username: str | None = None) -> CustomerAiAuditEntry:
    dj = row.details_json if isinstance(row.details_json, dict) else {}
    cid = dj.get("customer_id")
    cid_int: int | None = None
    if isinstance(cid, int):
        cid_int = cid
    elif isinstance(cid, str) and cid.strip().isdigit():
        cid_int = int(cid.strip())
    summary = row.action.replace("_", " ").title()
    if row.model_used:
        summary = f"{summary} · {row.model_used}"
    sbid = dj.get("suggestion_batch_id")
    sbid_int: int | None = None
    if isinstance(sbid, int):
        sbid_int = sbid
    elif isinstance(sbid, str) and sbid.strip().isdigit():
        sbid_int = int(sbid.strip())
    event_label = customer_ai_event_label(row.action, dj)
    issue_count = _int_detail(dj.get("issue_count"))
    match_count = _int_detail(dj.get("match_count"))
    key_facts_count = _int_detail(dj.get("key_facts_count"))
    action_count = _int_detail(dj.get("count")) or _int_detail(dj.get("action_count"))
    applied_field_count = _int_detail(dj.get("applied_field_count")) or _int_detail(dj.get("applied_count"))
    return CustomerAiAuditEntry(
        id=row.id,
        action=row.action,
        created_at=row.created_at.isoformat() if row.created_at else "",
        model_used=row.model_used,
        latency_ms=row.latency_ms,
        result=dj.get("result") if isinstance(dj.get("result"), str) else None,
        error_category=dj.get("error_category") if isinstance(dj.get("error_category"), str) else None,
        customer_id=cid_int,
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


async def list_customer_ai_audit_logs(
    db: AsyncSession,
    *,
    tenant_id: int,
    customer_id: int | None = None,
    limit: int = 40,
) -> CustomerAiAuditListResponse:
    lim = max(1, min(int(limit), 100))
    stmt = (
        select(AiAuditLog, User.username)
        .outerjoin(User, User.id == AiAuditLog.user_id)
        .where(
            AiAuditLog.tenant_id == tenant_id,
            AiAuditLog.prompt_category == "customer_ai",
        )
        .order_by(AiAuditLog.created_at.desc())
        .limit(lim)
    )
    if customer_id is not None:
        stmt = stmt.where(AiAuditLog.details_json["customer_id"].as_string() == str(customer_id))
    r = await db.execute(stmt)
    pairs = r.all()
    return CustomerAiAuditListResponse(
        items=[_audit_entry(row, actor_username=uname) for row, uname in pairs],
    )
