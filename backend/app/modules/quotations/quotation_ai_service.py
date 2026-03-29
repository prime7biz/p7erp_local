"""Quotation AI orchestration — mirrors inquiry_ai_service on Quotation master."""

from __future__ import annotations

import html
import json
import re
import time
from typing import Any

import httpx
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Quotation, User
from app.models.ai_tool import AiAuditLog
from app.modules.ai_tool.audit import log_ai_event
from app.modules.ai_tool.llm_provider import get_llm_provider
from app.modules.quotations import quotation_ai_batches as qt_batches
from app.modules.quotations import quotation_ai_prompts as prompts
from app.modules.quotations.quotation_ai_schemas import (
    QuotationAiAuditEntry,
    QuotationAiAuditListResponse,
    QuotationAiDedupeMatch,
    QuotationAiDedupeRequest,
    QuotationAiDedupeResponse,
    QuotationAiEnrichRequest,
    QuotationAiEnrichResponse,
    QuotationAiFieldSuggestion,
    QuotationAiIndicatorsOut,
    QuotationAiNextActionItem,
    QuotationAiNextActionsRequest,
    QuotationAiNextActionsResponse,
    QuotationAiSummaryRequest,
    QuotationAiSummaryResponse,
    QuotationAiValidateIssue,
    QuotationAiValidateRequest,
    QuotationAiValidateResponse,
    _LlmEnrichOut,
    _LlmNextActionsOut,
    _LlmSummaryOut,
)
from app.modules.master_data_ai.audit_labels import quotation_ai_event_label
from app.modules.master_data_ai.gateway import invoke_structured_llm
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id
from app.modules.master_data_ai.sanitization import sanitize_untrusted_text


def compute_quotation_ai_indicators(q: Quotation) -> QuotationAiIndicatorsOut:
    flags: list[str] = []
    if not q.style_id and not (q.style_ref or "").strip():
        flags.append("missing_style")
    if q.projected_quantity is None or q.projected_quantity <= 0:
        flags.append("missing_projected_quantity")
    if not q.target_price:
        flags.append("missing_target_price")
    if not q.target_price_currency:
        flags.append("missing_target_currency")
    if not q.exchange_rate:
        tc = (q.target_price_currency or "").strip().upper()
        bc = (q.currency or "").strip().upper()
        if tc and bc and tc != bc:
            flags.append("missing_exchange_rate")
    if not q.material_cost and not q.manufacturing_cost:
        flags.append("no_costing_lines")
    header_filled = sum(
        1
        for x in [
            bool((q.department or "").strip()),
            bool((q.shipping_term or "").strip()),
            bool(q.projected_delivery_date),
            bool(q.valid_until),
            bool((q.notes or "").strip()),
        ]
        if x
    )
    completeness = int(round(100 * header_filled / 5))
    costing_checks = [
        q.style_id is not None or bool((q.style_ref or "").strip()),
        q.projected_quantity is not None and q.projected_quantity > 0,
        bool((q.target_price or "").strip()),
        bool((q.material_cost or "").strip()) or bool((q.manufacturing_cost or "").strip()),
        bool((q.currency or "").strip()),
    ]
    costing_readiness = int(round(100 * sum(1 for x in costing_checks if x) / max(len(costing_checks), 1)))
    return QuotationAiIndicatorsOut(
        completeness_score=completeness,
        costing_readiness_score=costing_readiness,
        flags=flags[:12],
    )


def _quotation_profile_dict(q: Quotation) -> dict[str, Any]:
    return {
        "id": q.id,
        "quotation_code": q.quotation_code,
        "customer_id": q.customer_id,
        "inquiry_id": q.inquiry_id,
        "style_ref": q.style_ref,
        "style_id": q.style_id,
        "department": q.department,
        "projected_quantity": q.projected_quantity,
        "projected_delivery_date": str(q.projected_delivery_date) if q.projected_delivery_date else None,
        "quotation_date": str(q.quotation_date) if q.quotation_date else None,
        "target_price": q.target_price,
        "target_price_currency": q.target_price_currency,
        "exchange_rate": q.exchange_rate,
        "currency": q.currency,
        "shipping_term": q.shipping_term,
        "commission_mode": q.commission_mode,
        "status": q.status,
        "notes": (q.notes or "")[:2000],
    }


def _quotation_health_snapshot(q: Quotation) -> dict[str, Any]:
    ind = compute_quotation_ai_indicators(q)
    return {
        "completeness_score": ind.completeness_score,
        "costing_readiness_score": ind.costing_readiness_score,
        "flags": ind.flags,
        "is_converted_to_order": (q.status or "").upper() in ("CONVERTED", "ORDERED"),
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
        merged["quotation_ai_request_id"] = rid
    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource="quotation",
        request_id=rid,
        trace_id=rid,
        severity=severity,
        details_json=merged,
        model_used=model_used,
        latency_ms=latency_ms,
        prompt_category="quotation_ai",
        error_category=error_category,
    )


async def _fetch_website_text(url: str) -> tuple[str, list[str]]:
    warnings: list[str] = []
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return "", ["Invalid URL scheme"]
        async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Prime7ERP-QuotationEnrich/1.0"})
            r.raise_for_status()
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
    body: QuotationAiEnrichRequest,
) -> QuotationAiEnrichResponse:
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
        operation="quotation_enrich",
        prompt=prompt,
        response_model=_LlmEnrichOut,
        tenant_id=tenant_id,
        request_id=get_master_data_ai_request_id(),
    )
    ms = int((time.perf_counter() - t0) * 1000)
    suggestions: dict[str, QuotationAiFieldSuggestion] = {}
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
            suggestions[fk] = QuotationAiFieldSuggestion(
                value=(str(row.get("value")).strip() if row.get("value") is not None else None),
                confidence=conf,
                source=source_hint if source_hint == "website" else "ai_inference",
                rationale=(str(row.get("rationale") or "")[:512] or None),
            )
        warnings.extend(parsed.warnings or [])
    if err:
        warnings.append(err)
    enr_result = "partial" if err or warnings else "success"
    suggestion_batch_id = await qt_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        quotation_id=body.quotation_id,
        suggestions=suggestions,
        request_id=get_master_data_ai_request_id(),
        model_name=prov_name,
        source_type=source_hint,
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_AI_ENRICH",
        details={
            "quotation_id": body.quotation_id,
            "keys": list(suggestions.keys()),
            "suggestion_batch_id": suggestion_batch_id,
            "error": (err[:500] if err else None),
        },
        model_used=prov_name,
        latency_ms=ms,
        result=enr_result,
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return QuotationAiEnrichResponse(
        suggestions=suggestions, warnings=warnings, suggestion_batch_id=suggestion_batch_id
    )


def _field_merge(q: Quotation | None, f: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if q:
        out.update(
            {
                "style_ref": q.style_ref,
                "department": q.department,
                "projected_quantity": q.projected_quantity,
                "projected_delivery_date": str(q.projected_delivery_date) if q.projected_delivery_date else None,
                "quotation_date": str(q.quotation_date) if q.quotation_date else None,
                "target_price": q.target_price,
                "target_price_currency": q.target_price_currency,
                "exchange_rate": q.exchange_rate,
                "currency": q.currency,
                "shipping_term": q.shipping_term,
                "notes": q.notes,
            }
        )
    for k, v in (f or {}).items():
        if v is not None and str(v).strip() != "":
            out[k] = v
    return out


async def ai_validate(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationAiValidateRequest,
) -> QuotationAiValidateResponse:
    t0 = time.perf_counter()
    q: Quotation | None = None
    if body.quotation_id is not None:
        q = await db.get(Quotation, body.quotation_id)
        if not q or q.tenant_id != tenant_id:
            q = None
    merged = _field_merge(q, body.fields or {})
    issues: list[QuotationAiValidateIssue] = []
    normalized: dict[str, str | None] = {}

    if not merged.get("projected_quantity"):
        issues.append(
            QuotationAiValidateIssue(
                field="projected_quantity",
                severity="error",
                message="Projected quantity is required for costing.",
                suggestion="Enter order quantity",
            )
        )
    if not merged.get("target_price"):
        issues.append(
            QuotationAiValidateIssue(
                field="target_price",
                severity="warning",
                message="Target price missing — margin analysis may be incomplete.",
            )
        )
    if not merged.get("target_price_currency"):
        issues.append(
            QuotationAiValidateIssue(
                field="target_price_currency",
                severity="warning",
                message="Target price currency missing.",
            )
        )
    tc = str(merged.get("target_price_currency") or "").strip().upper()
    bc = str(merged.get("currency") or "").strip().upper()
    if tc and bc and tc != bc and not str(merged.get("exchange_rate") or "").strip():
        issues.append(
            QuotationAiValidateIssue(
                field="exchange_rate",
                severity="error",
                message="Different target and base currency without exchange rate.",
                suggestion="Add FX rate or align currencies",
            )
        )
    if not merged.get("currency"):
        issues.append(
            QuotationAiValidateIssue(
                field="currency",
                severity="warning",
                message="Base currency missing — costing may default to wrong currency.",
            )
        )

    profile_checks = [
        bool(str(merged.get("department") or "").strip()),
        bool(str(merged.get("style_ref") or "").strip() or (q and q.style_id)),
        bool(merged.get("projected_quantity")),
        bool(str(merged.get("shipping_term") or "").strip()),
        bool(merged.get("projected_delivery_date")),
    ]
    completeness = int(round(100 * sum(1 for x in profile_checks if x) / max(len(profile_checks), 1)))

    costing_checks = [
        bool(q and q.style_id) or bool(str(merged.get("style_ref") or "").strip()),
        bool(merged.get("projected_quantity")),
        bool(str(merged.get("target_price") or "").strip()),
        bool(str(merged.get("currency") or "").strip()),
        not (tc and bc and tc != bc) or bool(str(merged.get("exchange_rate") or "").strip()),
    ]
    costing_readiness = int(round(100 * sum(1 for x in costing_checks if x) / max(len(costing_checks), 1)))

    risk = 0
    if any(i.severity == "error" for i in issues):
        risk = min(100, 40 + 15 * sum(1 for i in issues if i.severity == "error"))
    elif issues:
        risk = min(100, 20 + 10 * len(issues))

    for k in ("style_ref", "department", "notes"):
        v = merged.get(k)
        if v is not None:
            normalized[k] = str(v).strip() or None

    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_master_data_ai_request_id()
    batch_id = await qt_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        quotation_id=body.quotation_id,
        action_type="validate",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "completeness_score": completeness,
            "costing_readiness_score": costing_readiness,
            "commercial_risk_score": risk,
            "issue_count": len(issues),
            "issues": [i.model_dump() for i in issues[:40]],
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_AI_VALIDATE",
        details={
            "quotation_id": body.quotation_id,
            "suggestion_batch_id": batch_id,
            "issue_count": len(issues),
        },
        latency_ms=ms,
        result="success",
    )
    return QuotationAiValidateResponse(
        issues=issues,
        completeness_score=completeness,
        costing_readiness_score=costing_readiness,
        commercial_risk_score=risk,
        normalized_fields=normalized,
        suggestion_batch_id=batch_id,
    )


async def ai_dedupe(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationAiDedupeRequest,
) -> QuotationAiDedupeResponse:
    t0 = time.perf_counter()
    f = body.fields or {}
    exclude = body.exclude_quotation_id

    def gx(*keys: str) -> str | None:
        for k in keys:
            v = f.get(k)
            if v is not None and str(v).strip():
                return str(v).strip()
        return None

    cust_s = gx("customer_id")
    customer_id: int | None = None
    if cust_s:
        try:
            customer_id = int(float(cust_s))
        except (TypeError, ValueError):
            customer_id = None
    style_ref = gx("style_ref")
    department = gx("department")

    matches_map: dict[int, QuotationAiDedupeMatch] = {}

    def add_row(row: Quotation, score: float, reason: str) -> None:
        if exclude is not None and row.id == exclude:
            return
        cur = matches_map.get(row.id)
        m = QuotationAiDedupeMatch(
            quotation_id=row.id,
            quotation_code=row.quotation_code,
            customer_id=row.customer_id,
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

    if customer_id:
        stmt = select(Quotation).where(Quotation.tenant_id == tenant_id, Quotation.customer_id == customer_id).limit(80)
        r = await db.execute(stmt)
        for row in r.scalars().all():
            add_row(row, 0.55, "same_customer")

    if customer_id and style_ref and len(style_ref) >= 2:
        pattern = f"%{style_ref.lower()}%"
        r = await db.execute(
            select(Quotation).where(
                Quotation.tenant_id == tenant_id,
                Quotation.customer_id == customer_id,
                or_(Quotation.style_ref.ilike(pattern), Quotation.quotation_code.ilike(pattern)),
            ).limit(40)
        )
        for row in r.scalars().all():
            add_row(row, 0.82, "customer_and_style_ref")

    if customer_id and department and len(department) >= 2:
        pattern = f"%{department.lower()}%"
        r = await db.execute(
            select(Quotation).where(
                Quotation.tenant_id == tenant_id,
                Quotation.customer_id == customer_id,
                Quotation.department.ilike(pattern),
            ).limit(40)
        )
        for row in r.scalars().all():
            add_row(row, 0.68, "customer_and_department")

    out = sorted(matches_map.values(), key=lambda m: (-m.score, m.quotation_id))[:25]
    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_master_data_ai_request_id()
    batch_id = await qt_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        quotation_id=None,
        action_type="dedupe",
        request_id=rid,
        model_hint="db_similarity",
        meta_payload={
            "candidate_count": len(out),
            "exclude_quotation_id": exclude,
            "matches": [m.model_dump() for m in out],
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_AI_DEDUPE",
        details={
            "match_count": len(out),
            "exclude_quotation_id": exclude,
            "suggestion_batch_id": batch_id,
        },
        latency_ms=ms,
        result="success",
    )
    return QuotationAiDedupeResponse(matches=out, warnings=[], suggestion_batch_id=batch_id)


async def ai_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationAiSummaryRequest,
) -> QuotationAiSummaryResponse:
    t0 = time.perf_counter()
    r = await db.execute(select(Quotation).where(Quotation.id == body.quotation_id, Quotation.tenant_id == tenant_id))
    q = r.scalar_one_or_none()
    if not q:
        return QuotationAiSummaryResponse(
            summary_text="",
            key_facts=[],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=None,
        )
    health = _quotation_health_snapshot(q)
    profile = _quotation_profile_dict(q)
    prov = get_llm_provider()
    prompt = f"{prompts.SUMMARY_SYSTEM}\n\n{prompts.summary_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(health, default=str))}"
    rid = get_master_data_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="quotation_summary",
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
    batch_id = await qt_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        quotation_id=body.quotation_id,
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
        action="QUOTATION_AI_SUMMARY",
        details={
            "quotation_id": body.quotation_id,
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
        return QuotationAiSummaryResponse(
            summary_text="AI summary unavailable.",
            key_facts=[err or "parse_error"],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=batch_id,
        )
    return QuotationAiSummaryResponse(
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
    body: QuotationAiNextActionsRequest,
) -> QuotationAiNextActionsResponse:
    t0 = time.perf_counter()
    r = await db.execute(select(Quotation).where(Quotation.id == body.quotation_id, Quotation.tenant_id == tenant_id))
    q = r.scalar_one_or_none()
    if not q:
        return QuotationAiNextActionsResponse(actions=[], suggestion_batch_id=None)
    health = _quotation_health_snapshot(q)
    profile = _quotation_profile_dict(q)
    prov = get_llm_provider()
    prompt = f"{prompts.NEXT_ACTIONS_SYSTEM}\n\n{prompts.next_actions_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(health, default=str))}"
    rid = get_master_data_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="quotation_next_actions",
        prompt=prompt,
        response_model=_LlmNextActionsOut,
        tenant_id=tenant_id,
        request_id=rid,
    )
    ms = int((time.perf_counter() - t0) * 1000)
    actions: list[QuotationAiNextActionItem] = []
    if parsed and parsed.actions:
        for a in parsed.actions:
            if not isinstance(a, dict):
                continue
            actions.append(
                QuotationAiNextActionItem(
                    action_type=str(a.get("action_type") or "follow_up")[:64],
                    title=str(a.get("title") or "Follow up")[:255],
                    description=str(a.get("description") or "")[:2000],
                    priority=int(a.get("priority") or 5),
                    target_module=str(a.get("target_module") or "costing")[:64],
                    target_url=(str(a.get("target_url"))[:512] if a.get("target_url") else None),
                )
            )
    batch_id = await qt_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        quotation_id=body.quotation_id,
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
        action="QUOTATION_AI_NEXT_ACTIONS",
        details={
            "quotation_id": body.quotation_id,
            "count": len(actions),
            "error": (err[:500] if err else None),
            "suggestion_batch_id": batch_id,
        },
        model_used=prov_name,
        latency_ms=ms,
        result="partial" if err else "success",
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return QuotationAiNextActionsResponse(actions=actions, suggestion_batch_id=batch_id)


def _int_detail(val: object) -> int | None:
    if isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, str) and val.strip().isdigit():
        return int(val.strip())
    return None


def _audit_entry(row: AiAuditLog, *, actor_username: str | None = None) -> QuotationAiAuditEntry:
    dj = row.details_json if isinstance(row.details_json, dict) else {}
    qid = dj.get("quotation_id")
    qid_int: int | None = None
    if isinstance(qid, int):
        qid_int = qid
    elif isinstance(qid, str) and qid.strip().isdigit():
        qid_int = int(qid.strip())
    summary = row.action.replace("_", " ").title()
    if row.model_used:
        summary = f"{summary} · {row.model_used}"
    sbid = dj.get("suggestion_batch_id")
    sbid_int: int | None = None
    if isinstance(sbid, int):
        sbid_int = sbid
    elif isinstance(sbid, str) and sbid.strip().isdigit():
        sbid_int = int(sbid.strip())
    event_label = quotation_ai_event_label(row.action, dj)
    issue_count = _int_detail(dj.get("issue_count"))
    match_count = _int_detail(dj.get("match_count"))
    key_facts_count = _int_detail(dj.get("key_facts_count"))
    action_count = _int_detail(dj.get("count")) or _int_detail(dj.get("action_count"))
    applied_field_count = _int_detail(dj.get("applied_field_count")) or _int_detail(dj.get("applied_count"))
    return QuotationAiAuditEntry(
        id=row.id,
        action=row.action,
        created_at=row.created_at.isoformat() if row.created_at else "",
        model_used=row.model_used,
        latency_ms=row.latency_ms,
        result=dj.get("result") if isinstance(dj.get("result"), str) else None,
        error_category=dj.get("error_category") if isinstance(dj.get("error_category"), str) else None,
        quotation_id=qid_int,
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


async def list_quotation_ai_audit_logs(
    db: AsyncSession,
    *,
    tenant_id: int,
    quotation_id: int | None = None,
    limit: int = 40,
) -> QuotationAiAuditListResponse:
    lim = max(1, min(int(limit), 100))
    stmt = (
        select(AiAuditLog, User.username)
        .outerjoin(User, User.id == AiAuditLog.user_id)
        .where(
            AiAuditLog.tenant_id == tenant_id,
            AiAuditLog.prompt_category == "quotation_ai",
        )
        .order_by(AiAuditLog.created_at.desc())
        .limit(lim)
    )
    if quotation_id is not None:
        stmt = stmt.where(AiAuditLog.details_json["quotation_id"].as_string() == str(quotation_id))
    r = await db.execute(stmt)
    pairs = r.all()
    return QuotationAiAuditListResponse(items=[_audit_entry(row, actor_username=uname) for row, uname in pairs])
