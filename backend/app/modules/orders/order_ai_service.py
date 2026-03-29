"""Order AI orchestration — mirrors quotation AI on sales Order entity."""

from __future__ import annotations

import html
import json
import re
import time
from datetime import date, timedelta
from typing import Any, Literal

import httpx
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Order, OrderFollowupAction, Quotation, User
from app.models.ai_tool import AiAuditLog
from app.modules.ai_extract import service as extract_service
from app.modules.ai_tool.audit import log_ai_event
from app.modules.ai_tool.llm_provider import get_llm_provider
from app.modules.master_data_ai.audit_labels import order_ai_event_label
from app.modules.master_data_ai.gateway import invoke_structured_llm
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id
from app.modules.master_data_ai.sanitization import sanitize_untrusted_text
from app.modules.orders import order_ai_batches as ord_batches
from app.modules.orders import order_ai_prompts as prompts
from app.modules.orders.order_ai_schemas import (
    OrderAiAtpCtpSummaryRequest,
    OrderAiAtpCtpSummaryResponse,
    OrderAiAuditEntry,
    OrderAiAuditListResponse,
    OrderAiBottleneckOverlapOut,
    OrderAiCapacityBottleneckScanRequest,
    OrderAiCapacityBottleneckScanResponse,
    OrderAiDedupeMatch,
    OrderAiDedupeRequest,
    OrderAiDedupeResponse,
    OrderAiEnrichRequest,
    OrderAiEnrichResponse,
    OrderAiExecutionPlanningSummaryRequest,
    OrderAiExecutionPlanningSummaryResponse,
    OrderAiExtractWrapResponse,
    OrderAiFieldSuggestion,
    OrderAiIndicatorsOut,
    OrderAiNextActionItem,
    OrderAiNextActionsRequest,
    OrderAiNextActionsResponse,
    OrderAiPlanningRiskCheckRequest,
    OrderAiPlanningRiskCheckResponse,
    OrderAiPlanningRiskFactor,
    OrderAiPromiseCheckOut,
    OrderAiPromiseLineOut,
    OrderAiPromiseSensitivityCheckRequest,
    OrderAiPromiseSensitivityCheckResponse,
    OrderAiPromiseSensitivityPointOut,
    OrderAiSummaryRequest,
    OrderAiSummaryResponse,
    OrderAiValidateExecutionRequest,
    OrderAiValidateExecutionResponse,
    OrderAiValidateIssue,
    OrderAiValidateRequest,
    OrderAiValidateResponse,
    OrderAiWhatIfSimulationRequest,
    OrderAiWhatIfSimulationResponse,
    _LlmEnrichOut,
    _LlmNextActionsOut,
    _LlmSummaryOut,
)
from app.modules.orders.order_simulation_service import scan_capacity_bottlenecks_for_order
from app.modules.orders.promise_checks import run_order_promise_check


def _promise_sensitivity_score(o: Order) -> int:
    """How tight the commercial window is to small slips (deterministic, date-only)."""
    if not o.delivery_date:
        return 75
    d = (o.delivery_date - date.today()).days
    if d < 0:
        return 100
    if d <= 3:
        return 90
    if d <= 14:
        return 70
    if d <= 30:
        return 45
    return 25


def compute_order_ai_indicators(
    o: Order,
    *,
    production_layout_row_count: int | None = None,
) -> OrderAiIndicatorsOut:
    flags: list[str] = []
    if o.quantity is None or o.quantity <= 0:
        flags.append("missing_quantity")
    if not o.delivery_date:
        flags.append("missing_delivery_date")
    if not (o.style_ref or "").strip():
        flags.append("missing_style_ref")
    if not o.quotation_id:
        flags.append("missing_quotation_link")
    if o.delivery_date and o.delivery_date < date.today() and (o.status or "").upper() in {
        "NEW",
        "IN_PROGRESS",
        "DRAFT",
    }:
        flags.append("stale_or_past_delivery")
    if not (o.remarks or "").strip():
        flags.append("missing_remarks_or_po_ref")
    if not o.order_date:
        flags.append("missing_order_date")

    header_filled = sum(
        1
        for x in [
            bool((o.style_ref or "").strip()),
            bool((o.shipping_term or "").strip()),
            bool(o.order_date),
            bool(o.delivery_date),
            bool((o.remarks or "").strip()),
        ]
        if x
    )
    completeness = int(round(100 * header_filled / 5))

    exec_checks = [
        o.quantity is not None and o.quantity > 0,
        bool(o.delivery_date),
        bool((o.style_ref or "").strip()),
        o.quotation_id is not None,
        bool((o.shipping_term or "").strip()),
    ]
    execution_readiness = int(round(100 * sum(1 for x in exec_checks if x) / max(len(exec_checks), 1)))

    material_checks = [
        bool(o.quotation_id),
        bool(o.quantity and o.quantity > 0),
        bool((o.style_ref or "").strip()),
    ]
    material_readiness = int(round(100 * sum(1 for x in material_checks if x) / max(len(material_checks), 1)))

    promise_date_risk = 0
    if not o.delivery_date:
        promise_date_risk = 80
    elif o.delivery_date < date.today():
        promise_date_risk = 95
    elif o.delivery_date <= (date.today() + timedelta(days=7)):
        promise_date_risk = 55
    elif o.delivery_date <= (date.today() + timedelta(days=21)):
        promise_date_risk = 25

    missing_dependency_count = sum(
        1 for f in flags if f in {"missing_quantity", "missing_delivery_date", "missing_style_ref", "missing_quotation_link"}
    )
    urgent_planning = promise_date_risk >= 60 or missing_dependency_count >= 2
    planning_confidence = max(0, min(100, int(round((execution_readiness + material_readiness) / 2)) - missing_dependency_count * 8))
    dup_risk = min(
        100,
        20 * sum(1 for f in flags if f in ("missing_quotation_link", "missing_delivery_date")) + (15 if urgent_planning else 0),
    )

    cap_flag = bool(production_layout_row_count is not None and production_layout_row_count >= 2)
    bottleneck_severity = 0
    if production_layout_row_count is not None and production_layout_row_count >= 2:
        bottleneck_severity = min(100, 20 * (production_layout_row_count - 1))

    return OrderAiIndicatorsOut(
        completeness_score=completeness,
        execution_readiness_score=execution_readiness,
        material_readiness_score=material_readiness,
        planning_confidence_score=planning_confidence,
        promise_date_risk_score=promise_date_risk,
        duplicate_risk_score=dup_risk,
        missing_dependency_count=missing_dependency_count,
        urgent_planning_flag=urgent_planning,
        flags=flags[:12],
        capacity_bottleneck_flag=cap_flag,
        bottleneck_severity_score=bottleneck_severity,
        promise_sensitivity_score=_promise_sensitivity_score(o),
    )


def _order_profile_dict(o: Order) -> dict[str, Any]:
    return {
        "id": o.id,
        "order_code": o.order_code,
        "customer_id": o.customer_id,
        "quotation_id": o.quotation_id,
        "style_ref": o.style_ref,
        "shipping_term": o.shipping_term,
        "commission_mode": o.commission_mode,
        "order_date": str(o.order_date) if o.order_date else None,
        "delivery_date": str(o.delivery_date) if o.delivery_date else None,
        "quantity": o.quantity,
        "status": o.status,
        "remarks": (o.remarks or "")[:2000],
    }


def _order_health_snapshot(o: Order) -> dict[str, Any]:
    ind = compute_order_ai_indicators(o)
    return {
        "completeness_score": ind.completeness_score,
        "execution_readiness_score": ind.execution_readiness_score,
        "duplicate_risk_score": ind.duplicate_risk_score,
        "flags": ind.flags,
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
        merged["order_ai_request_id"] = rid
    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource="order",
        request_id=rid,
        trace_id=rid,
        severity=severity,
        details_json=merged,
        model_used=model_used,
        latency_ms=latency_ms,
        prompt_category="order_ai",
        error_category=error_category,
    )


async def ai_extract_document(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    file_bytes: bytes,
    content_type: str,
    order_id: int | None,
) -> OrderAiExtractWrapResponse:
    t0 = time.perf_counter()
    base = await extract_service.extract_order_form(db, tenant_id, file_bytes, content_type)
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
    suggestion_batch_id = await ord_batches.create_batch_from_extraction(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=order_id,
        extraction=resp,
        request_id=get_master_data_ai_request_id(),
        model_hint="gemini_multimodal",
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_EXTRACT",
        details={
            "order_id": order_id,
            "field_keys": list(resp.fields.keys()),
            "suggestion_batch_id": suggestion_batch_id,
        },
        model_used="gemini_multimodal",
        latency_ms=ms,
        result=ext_result,
        error_category=None if resp.success else "extraction_failed",
    )
    return OrderAiExtractWrapResponse(
        extraction=resp,
        model_hint="gemini_multimodal",
        request_id=get_master_data_ai_request_id(),
        suggestion_batch_id=suggestion_batch_id,
    )


async def _fetch_website_text(url: str) -> tuple[str, list[str]]:
    warnings: list[str] = []
    try:
        from urllib.parse import urlparse

        parsed = urlparse(url)
        if parsed.scheme not in ("http", "https"):
            return "", ["Invalid URL scheme"]
        async with httpx.AsyncClient(timeout=18.0, follow_redirects=True) as client:
            r = await client.get(url, headers={"User-Agent": "Prime7ERP-OrderEnrich/1.0"})
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
    body: OrderAiEnrichRequest,
) -> OrderAiEnrichResponse:
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
        operation="order_enrich",
        prompt=prompt,
        response_model=_LlmEnrichOut,
        tenant_id=tenant_id,
        request_id=get_master_data_ai_request_id(),
    )
    ms = int((time.perf_counter() - t0) * 1000)
    suggestions: dict[str, OrderAiFieldSuggestion] = {}
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
            suggestions[fk] = OrderAiFieldSuggestion(
                value=(str(row.get("value")).strip() if row.get("value") is not None else None),
                confidence=conf,
                source=source_hint if source_hint == "website" else "ai_inference",
                rationale=(str(row.get("rationale") or "")[:512] or None),
            )
        warnings.extend(parsed.warnings or [])
    if err:
        warnings.append(err)
    enr_result = "partial" if err or warnings else "success"
    suggestion_batch_id = await ord_batches.create_batch_from_enrich(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        suggestions=suggestions,
        request_id=get_master_data_ai_request_id(),
        model_name=prov_name,
        source_type=source_hint,
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_ENRICH",
        details={
            "order_id": body.order_id,
            "keys": list(suggestions.keys()),
            "suggestion_batch_id": suggestion_batch_id,
            "error": (err[:500] if err else None),
        },
        model_used=prov_name,
        latency_ms=ms,
        result=enr_result,
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return OrderAiEnrichResponse(
        suggestions=suggestions, warnings=warnings, suggestion_batch_id=suggestion_batch_id
    )


def _field_merge(o: Order | None, f: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    if o:
        out.update(
            {
                "style_ref": o.style_ref,
                "shipping_term": o.shipping_term,
                "quantity": o.quantity,
                "order_date": str(o.order_date) if o.order_date else None,
                "delivery_date": str(o.delivery_date) if o.delivery_date else None,
                "remarks": o.remarks,
                "quotation_id": o.quotation_id,
                "customer_id": o.customer_id,
            }
        )
    for k, v in (f or {}).items():
        if v is not None and str(v).strip() != "":
            out[k] = v
    return out


def _to_promise_out(data: Any) -> OrderAiPromiseCheckOut:
    return OrderAiPromiseCheckOut(
        order_id=int(data.order_id),
        atp_ok=bool(data.atp_ok),
        ctp_ok=bool(data.ctp_ok),
        reasons=[str(x)[:200] for x in list(data.reasons or [])[:32]],
        lines=[
            OrderAiPromiseLineOut(
                item_id=int(l.item_id),
                item_code=str(l.item_code)[:128],
                required_qty=float(l.required_qty),
                available_qty=float(l.available_qty),
                shortage_qty=float(l.shortage_qty),
            )
            for l in list(data.lines or [])[:100]
        ],
    )


async def _planning_context_for_order(
    db: AsyncSession,
    *,
    tenant_id: int,
    order: Order,
) -> tuple[OrderAiPromiseCheckOut, list[OrderAiPlanningRiskFactor], list[str], int, int, int, int]:
    promise_raw = await run_order_promise_check(db, tenant_id=tenant_id, order=order)
    promise = _to_promise_out(promise_raw)
    indicators = compute_order_ai_indicators(order)
    shortage_lines = [ln for ln in promise.lines if ln.shortage_qty > 0]
    shortage_count = len(shortage_lines)
    pending_count = (
        (
            await db.execute(
                select(func.count(OrderFollowupAction.id)).where(
                    OrderFollowupAction.tenant_id == tenant_id,
                    OrderFollowupAction.order_id == order.id,
                    OrderFollowupAction.status == "pending",
                    OrderFollowupAction.is_active.is_(True),
                )
            )
        ).scalar_one()
        or 0
    )
    overdue_count = (
        (
            await db.execute(
                select(func.count(OrderFollowupAction.id)).where(
                    OrderFollowupAction.tenant_id == tenant_id,
                    OrderFollowupAction.order_id == order.id,
                    OrderFollowupAction.status == "pending",
                    OrderFollowupAction.is_active.is_(True),
                    OrderFollowupAction.planned_date.is_not(None),
                    OrderFollowupAction.planned_date < date.today(),
                )
            )
        ).scalar_one()
        or 0
    )

    factors: list[OrderAiPlanningRiskFactor] = []
    missing_prereqs: list[str] = []
    if not promise.atp_ok:
        factors.append(
            OrderAiPlanningRiskFactor(
                code="material_shortage",
                severity="error",
                message="ATP check failed due to stock/BOM constraints.",
                details={"shortage_line_count": shortage_count},
            )
        )
        missing_prereqs.append("material_readiness")
    if not promise.ctp_ok:
        factors.append(
            OrderAiPlanningRiskFactor(
                code="promise_date_risk",
                severity="error",
                message="CTP check failed for delivery date readiness.",
                details={"reasons": promise.reasons[:4]},
            )
        )
        missing_prereqs.append("date_feasibility")
    if indicators.missing_dependency_count > 0:
        factors.append(
            OrderAiPlanningRiskFactor(
                code="missing_dependencies",
                severity="warning",
                message="Critical planning dependencies are missing.",
                details={"flags": indicators.flags[:8], "count": indicators.missing_dependency_count},
            )
        )
        missing_prereqs.append("order_header_completeness")
    if overdue_count > 0:
        factors.append(
            OrderAiPlanningRiskFactor(
                code="overdue_followups",
                severity="warning",
                message="Pending follow-up actions are overdue.",
                details={"overdue_count": overdue_count, "pending_count": pending_count},
            )
        )

    total_lines = len(promise.lines)
    if total_lines <= 0:
        material_score = 25 if promise.atp_ok else 10
    else:
        ok_lines = total_lines - shortage_count
        material_score = int(round(100 * ok_lines / max(total_lines, 1)))
    promise_risk = indicators.promise_date_risk_score
    if not promise.atp_ok:
        promise_risk = max(promise_risk, 70)
    if not promise.ctp_ok:
        promise_risk = max(promise_risk, 85)

    planning_confidence = int(
        max(
            0,
            min(
                100,
                round(
                    (indicators.execution_readiness_score * 0.45)
                    + (material_score * 0.35)
                    + (max(0, 100 - promise_risk) * 0.2)
                    - overdue_count * 5
                ),
            ),
        )
    )
    risk_score = int(max(0, min(100, round((100 - planning_confidence) * 0.65 + promise_risk * 0.35))))
    return promise, factors, sorted(set(missing_prereqs)), material_score, planning_confidence, promise_risk, risk_score


async def ai_validate(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiValidateRequest,
) -> OrderAiValidateResponse:
    t0 = time.perf_counter()
    o: Order | None = None
    if body.order_id is not None:
        o = await db.get(Order, body.order_id)
        if not o or o.tenant_id != tenant_id:
            o = None
    merged = _field_merge(o, body.fields or {})
    issues: list[OrderAiValidateIssue] = []
    normalized: dict[str, str | None] = {}

    if not merged.get("quantity"):
        issues.append(
            OrderAiValidateIssue(
                field="quantity",
                severity="error",
                message="Order quantity is required for execution.",
                suggestion="Enter order quantity from buyer PO",
            )
        )
    if not merged.get("delivery_date"):
        issues.append(
            OrderAiValidateIssue(
                field="delivery_date",
                severity="warning",
                message="Delivery / ex-factory date missing — TNA and promise checks may fail.",
            )
        )
    if not merged.get("quotation_id") and not (o and o.quotation_id):
        issues.append(
            OrderAiValidateIssue(
                field="quotation_id",
                severity="warning",
                message="No quotation linked — material requirement / ATP checks may be blocked.",
            )
        )
    if not str(merged.get("style_ref") or "").strip():
        issues.append(
            OrderAiValidateIssue(
                field="style_ref",
                severity="warning",
                message="Style reference missing — harder to match BOM and duplicates.",
            )
        )
    if not str(merged.get("shipping_term") or "").strip():
        issues.append(
            OrderAiValidateIssue(
                field="shipping_term",
                severity="info",
                message="Shipping / incoterm not set.",
            )
        )

    q_consistency_note: str | None = None
    qid = merged.get("quotation_id") or (o.quotation_id if o else None)
    if qid and o:
        q = await db.get(Quotation, int(qid))
        if q and q.tenant_id == tenant_id:
            if (o.style_ref or "").strip() and (q.style_ref or "").strip() and (o.style_ref or "").strip() != (
                q.style_ref or ""
            ).strip():
                q_consistency_note = "Order style_ref differs from linked quotation.style_ref — verify with commercial."
                issues.append(
                    OrderAiValidateIssue(
                        field="style_ref",
                        severity="warning",
                        message=q_consistency_note,
                    )
                )

    profile_checks = [
        bool(str(merged.get("style_ref") or "").strip()),
        bool(merged.get("quantity")),
        bool(str(merged.get("shipping_term") or "").strip()),
        bool(merged.get("delivery_date")),
        bool(str(merged.get("remarks") or "").strip()),
    ]
    completeness = int(round(100 * sum(1 for x in profile_checks if x) / max(len(profile_checks), 1)))

    exec_checks = [
        bool(merged.get("quantity")),
        bool(merged.get("delivery_date")),
        bool(str(merged.get("style_ref") or "").strip()),
        bool(merged.get("quotation_id") or (o and o.quotation_id)),
        bool(str(merged.get("shipping_term") or "").strip()),
    ]
    execution_readiness = int(round(100 * sum(1 for x in exec_checks if x) / max(len(exec_checks), 1)))

    risk = 0
    if any(i.severity == "error" for i in issues):
        risk = min(100, 40 + 15 * sum(1 for i in issues if i.severity == "error"))
    elif issues:
        risk = min(100, 20 + 10 * len(issues))

    for k in ("style_ref", "remarks", "shipping_term"):
        v = merged.get(k)
        if v is not None:
            normalized[k] = str(v).strip() or None

    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="validate",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "completeness_score": completeness,
            "execution_readiness_score": execution_readiness,
            "commercial_risk_score": risk,
            "issue_count": len(issues),
            "issues": [i.model_dump() for i in issues[:40]],
            "quotation_consistency": q_consistency_note,
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_VALIDATE",
        details={"order_id": body.order_id, "suggestion_batch_id": batch_id, "issue_count": len(issues)},
        latency_ms=ms,
        result="success",
    )
    return OrderAiValidateResponse(
        issues=issues,
        completeness_score=completeness,
        execution_readiness_score=execution_readiness,
        commercial_risk_score=risk,
        normalized_fields=normalized,
        suggestion_batch_id=batch_id,
    )


async def ai_validate_execution(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiValidateExecutionRequest,
) -> OrderAiValidateExecutionResponse:
    base = await ai_validate(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        body=OrderAiValidateRequest(fields=body.fields, order_id=body.order_id),
    )
    order_row: Order | None = None
    if body.order_id is not None:
        order_row = await db.get(Order, body.order_id)
        if not order_row or order_row.tenant_id != tenant_id:
            order_row = None

    promise: OrderAiPromiseCheckOut | None = None
    factors: list[OrderAiPlanningRiskFactor] = []
    missing: list[str] = []
    material_score = max(0, min(100, base.execution_readiness_score))
    planning_confidence = max(0, min(100, base.execution_readiness_score - (8 * sum(1 for i in base.issues if i.severity != "info"))))
    promise_risk = 80 if any(i.field == "delivery_date" for i in base.issues) else 20
    if body.include_promise_snapshot and order_row is not None:
        promise, factors, missing, material_score, planning_confidence, promise_risk, _risk_score = await _planning_context_for_order(
            db,
            tenant_id=tenant_id,
            order=order_row,
        )
    else:
        missing = [i.field for i in base.issues if i.severity in {"error", "warning"}][:12]

    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="validate_execution",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "issue_count": len(base.issues),
            "execution_readiness_score": base.execution_readiness_score,
            "material_readiness_score": material_score,
            "planning_confidence_score": planning_confidence,
            "promise_date_risk_score": promise_risk,
            "missing_prerequisites": missing[:20],
            "factor_count": len(factors),
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_VALIDATE_EXECUTION",
        details={
            "order_id": body.order_id,
            "suggestion_batch_id": batch_id,
            "issue_count": len(base.issues),
            "missing_prerequisites_count": len(missing),
        },
        result="success",
    )
    return OrderAiValidateExecutionResponse(
        issues=base.issues,
        completeness_score=base.completeness_score,
        execution_readiness_score=base.execution_readiness_score,
        material_readiness_score=material_score,
        planning_confidence_score=planning_confidence,
        promise_date_risk_score=promise_risk,
        missing_prerequisites=missing[:20],
        normalized_fields=base.normalized_fields,
        promise_check=promise,
        suggestion_batch_id=batch_id,
    )


async def ai_planning_risk_check(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiPlanningRiskCheckRequest,
) -> OrderAiPlanningRiskCheckResponse:
    order_row = await db.get(Order, body.order_id)
    if not order_row or order_row.tenant_id != tenant_id:
        return OrderAiPlanningRiskCheckResponse(
            order_id=body.order_id,
            risk_band="high",
            risk_score=100,
            missing_prerequisites=["order_not_found"],
            factors=[
                OrderAiPlanningRiskFactor(
                    code="order_not_found",
                    severity="error",
                    message="Order not found in tenant context.",
                )
            ],
            promise_check=OrderAiPromiseCheckOut(order_id=body.order_id, atp_ok=False, ctp_ok=False, reasons=["not_found"], lines=[]),
            suggestion_batch_id=None,
        )
    promise, factors, missing, material_score, planning_confidence, promise_risk, risk_score = await _planning_context_for_order(
        db,
        tenant_id=tenant_id,
        order=order_row,
    )
    band: Literal["low", "medium", "high"] = "low"
    if risk_score >= 70:
        band = "high"
    elif risk_score >= 35:
        band = "medium"

    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="planning_risk_check",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "risk_band": band,
            "risk_score": risk_score,
            "material_readiness_score": material_score,
            "planning_confidence_score": planning_confidence,
            "promise_date_risk_score": promise_risk,
            "missing_prerequisites": missing[:20],
            "factor_count": len(factors),
            "factors": [f.model_dump() for f in factors[:40]],
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_PLANNING_RISK_CHECK",
        details={
            "order_id": body.order_id,
            "suggestion_batch_id": batch_id,
            "risk_band": band,
            "risk_score": risk_score,
            "issue_count": len(factors),
        },
        result="success",
    )
    return OrderAiPlanningRiskCheckResponse(
        order_id=body.order_id,
        risk_band=band,
        risk_score=risk_score,
        material_readiness_score=material_score,
        planning_confidence_score=planning_confidence,
        promise_date_risk_score=promise_risk,
        missing_prerequisites=missing[:20],
        factors=factors[:40],
        promise_check=promise,
        suggestion_batch_id=batch_id,
    )


async def ai_atp_ctp_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiAtpCtpSummaryRequest,
) -> OrderAiAtpCtpSummaryResponse:
    order_row = await db.get(Order, body.order_id)
    if not order_row or order_row.tenant_id != tenant_id:
        return OrderAiAtpCtpSummaryResponse(
            order_id=body.order_id,
            atp_ok=False,
            ctp_ok=False,
            reasons=["Order not found"],
            shortage_line_count=0,
            max_shortage_qty=0.0,
            summary_text="Order not found for tenant.",
            lines=[],
            suggestion_batch_id=None,
        )
    promise = _to_promise_out(await run_order_promise_check(db, tenant_id=tenant_id, order=order_row))
    shortage_lines = [x for x in promise.lines if x.shortage_qty > 0]
    max_shortage = max((x.shortage_qty for x in shortage_lines), default=0.0)
    if promise.atp_ok and promise.ctp_ok:
        text = "ATP/CTP checks are currently clear for planning review."
    else:
        text = "ATP/CTP checks indicate planning risk. Resolve listed reasons before commitment."
    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="atp_ctp_summary",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "atp_ok": promise.atp_ok,
            "ctp_ok": promise.ctp_ok,
            "reason_count": len(promise.reasons),
            "shortage_line_count": len(shortage_lines),
            "max_shortage_qty": max_shortage,
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_ATP_CTP_SUMMARY",
        details={
            "order_id": body.order_id,
            "suggestion_batch_id": batch_id,
            "atp_ok": promise.atp_ok,
            "ctp_ok": promise.ctp_ok,
        },
        result="success",
    )
    return OrderAiAtpCtpSummaryResponse(
        order_id=body.order_id,
        atp_ok=promise.atp_ok,
        ctp_ok=promise.ctp_ok,
        reasons=promise.reasons,
        shortage_line_count=len(shortage_lines),
        max_shortage_qty=float(max_shortage),
        summary_text=text,
        lines=promise.lines,
        suggestion_batch_id=batch_id,
    )


async def ai_dedupe(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiDedupeRequest,
) -> OrderAiDedupeResponse:
    t0 = time.perf_counter()
    f = body.fields or {}
    exclude = body.exclude_order_id

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

    matches_map: dict[int, OrderAiDedupeMatch] = {}

    def add_row(row: Order, score: float, reason: str) -> None:
        if exclude is not None and row.id == exclude:
            return
        cur = matches_map.get(row.id)
        m = OrderAiDedupeMatch(
            order_id=row.id,
            order_code=row.order_code,
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
        stmt = select(Order).where(Order.tenant_id == tenant_id, Order.customer_id == customer_id).limit(80)
        r = await db.execute(stmt)
        for row in r.scalars().all():
            add_row(row, 0.55, "same_customer")

    if customer_id and style_ref and len(style_ref) >= 2:
        pattern = f"%{style_ref.lower()}%"
        r = await db.execute(
            select(Order).where(
                Order.tenant_id == tenant_id,
                Order.customer_id == customer_id,
                or_(Order.style_ref.ilike(pattern), Order.order_code.ilike(pattern)),
            ).limit(40)
        )
        for row in r.scalars().all():
            add_row(row, 0.85, "customer_and_style_ref")

    out = sorted(matches_map.values(), key=lambda m: (-m.score, m.order_id))[:25]
    ms = int((time.perf_counter() - t0) * 1000)
    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=None,
        action_type="dedupe",
        request_id=rid,
        model_hint="db_similarity",
        meta_payload={
            "candidate_count": len(out),
            "exclude_order_id": exclude,
            "matches": [m.model_dump() for m in out],
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_DEDUPE",
        details={"match_count": len(out), "exclude_order_id": exclude, "suggestion_batch_id": batch_id},
        latency_ms=ms,
        result="success",
    )
    return OrderAiDedupeResponse(matches=out, warnings=[], suggestion_batch_id=batch_id)


async def ai_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiSummaryRequest,
) -> OrderAiSummaryResponse:
    t0 = time.perf_counter()
    r = await db.execute(select(Order).where(Order.id == body.order_id, Order.tenant_id == tenant_id))
    o = r.scalar_one_or_none()
    if not o:
        return OrderAiSummaryResponse(
            summary_text="",
            key_facts=[],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=None,
        )
    health = _order_health_snapshot(o)
    profile = _order_profile_dict(o)
    prov = get_llm_provider()
    prompt = f"{prompts.SUMMARY_SYSTEM}\n\n{prompts.summary_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(health, default=str))}"
    rid = get_master_data_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="order_summary",
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
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
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
        action="ORDER_AI_SUMMARY",
        details={
            "order_id": body.order_id,
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
        return OrderAiSummaryResponse(
            summary_text="AI summary unavailable.",
            key_facts=[err or "parse_error"],
            risk_indicators=[],
            profile_grade="unknown",
            suggestion_batch_id=batch_id,
        )
    return OrderAiSummaryResponse(
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
    body: OrderAiNextActionsRequest,
) -> OrderAiNextActionsResponse:
    t0 = time.perf_counter()
    r = await db.execute(select(Order).where(Order.id == body.order_id, Order.tenant_id == tenant_id))
    o = r.scalar_one_or_none()
    if not o:
        return OrderAiNextActionsResponse(actions=[], suggestion_batch_id=None)
    health = _order_health_snapshot(o)
    profile = _order_profile_dict(o)
    deterministic_actions: list[OrderAiNextActionItem] = []
    if body.include_planning_context:
        promise, factors, missing, _material_score, planning_confidence, promise_risk, _risk_score = await _planning_context_for_order(
            db, tenant_id=tenant_id, order=o
        )
        health["planning_context"] = {
            "planning_confidence_score": planning_confidence,
            "promise_date_risk_score": promise_risk,
            "missing_prerequisites": missing[:8],
            "atp_ok": promise.atp_ok,
            "ctp_ok": promise.ctp_ok,
            "risk_factors": [f.model_dump() for f in factors[:8]],
        }
        if not promise.atp_ok:
            deterministic_actions.append(
                OrderAiNextActionItem(
                    action_type="request_sourcing_confirmation",
                    title="Request sourcing confirmation for shortage items",
                    description="ATP is blocked. Ask sourcing to confirm material availability or alternate plan.",
                    priority=9,
                    target_module="merch",
                    target_url=f"/app/orders/{o.id}",
                )
            )
        if not promise.ctp_ok:
            deterministic_actions.append(
                OrderAiNextActionItem(
                    action_type="request_commercial_date_review",
                    title="Review commercial delivery promise date",
                    description="CTP risk exists. Recheck delivery commitment with planning and commercial teams.",
                    priority=9,
                    target_module="orders",
                    target_url=f"/app/orders/{o.id}",
                )
            )
        if planning_confidence < 55:
            deterministic_actions.append(
                OrderAiNextActionItem(
                    action_type="hold_promise_until_dependencies_clear",
                    title="Hold promise confirmation until dependencies clear",
                    description="Planning confidence is low. Confirm BOM, material and follow-up dependencies first.",
                    priority=8,
                    target_module="merch",
                    target_url="/app/followup",
                )
            )
    prov = get_llm_provider()
    prompt = f"{prompts.NEXT_ACTIONS_SYSTEM}\n\n{prompts.next_actions_user_prompt(profile_json=json.dumps(profile, default=str), health_json=json.dumps(health, default=str))}"
    rid = get_master_data_ai_request_id()
    parsed, err, prov_name = await invoke_structured_llm(
        prov,
        operation="order_next_actions",
        prompt=prompt,
        response_model=_LlmNextActionsOut,
        tenant_id=tenant_id,
        request_id=rid,
    )
    ms = int((time.perf_counter() - t0) * 1000)
    actions: list[OrderAiNextActionItem] = list(deterministic_actions)
    if parsed and parsed.actions:
        for a in parsed.actions:
            if not isinstance(a, dict):
                continue
            actions.append(
                OrderAiNextActionItem(
                    action_type=str(a.get("action_type") or "follow_up")[:64],
                    title=str(a.get("title") or "Follow up")[:255],
                    description=str(a.get("description") or "")[:2000],
                    priority=int(a.get("priority") or 5),
                    target_module=str(a.get("target_module") or "merch")[:64],
                    target_url=(str(a.get("target_url"))[:512] if a.get("target_url") else None),
                )
            )
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="next_actions",
        request_id=rid,
        model_hint=prov_name,
        meta_payload={
            "action_count": len(actions),
            "planning_context": bool(body.include_planning_context),
            "titles": [a.title[:160] for a in actions[:25]],
            "parse_error": bool(err),
        },
    )
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_NEXT_ACTIONS",
        details={
            "order_id": body.order_id,
            "count": len(actions),
            "error": (err[:500] if err else None),
            "suggestion_batch_id": batch_id,
        },
        model_used=prov_name,
        latency_ms=ms,
        result="partial" if err else "success",
        error_category="llm_timeout" if err and "timed out" in (err or "").lower() else ("schema_error" if err else None),
    )
    return OrderAiNextActionsResponse(actions=actions, suggestion_batch_id=batch_id)


def _not_found_promise_out(order_id: int) -> OrderAiPromiseCheckOut:
    return OrderAiPromiseCheckOut(
        order_id=order_id,
        atp_ok=False,
        ctp_ok=False,
        reasons=["Order not found for this tenant"],
        lines=[],
    )


async def ai_capacity_bottleneck_scan(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiCapacityBottleneckScanRequest,
) -> OrderAiCapacityBottleneckScanResponse:
    t0 = time.perf_counter()
    order_row = await db.get(Order, body.order_id)
    if not order_row or order_row.tenant_id != tenant_id:
        rid = get_master_data_ai_request_id()
        batch_id = await ord_batches.create_trace_result_batch(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            order_id=body.order_id,
            action_type="capacity_bottleneck_scan",
            request_id=rid,
            model_hint="rules_engine",
            meta_payload={"order_not_found": True},
        )
        ms = int((time.perf_counter() - t0) * 1000)
        await _audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="ORDER_AI_CAPACITY_BOTTLENECK_SCAN",
            details={"order_id": body.order_id, "suggestion_batch_id": batch_id, "order_not_found": True},
            model_used="rules_engine",
            latency_ms=ms,
            result="partial",
        )
        return OrderAiCapacityBottleneckScanResponse(
            order_id=body.order_id,
            explainability_notes=["Order is not visible in this tenant — no scan performed."],
            suggestion_batch_id=batch_id,
        )

    raw = await scan_capacity_bottlenecks_for_order(db, tenant_id=tenant_id, order=order_row)
    hits = [OrderAiBottleneckOverlapOut.model_validate(x) for x in raw["bottlenecks"]]
    notes = [
        "Advisory only: overlaps use planned/start–end windows, not finite-capacity scheduling.",
        f"Linked production configs: {raw['config_count']} across {raw['distinct_lines']} line(s).",
    ]
    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="capacity_bottleneck_scan",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "severity_score": raw["severity_score"],
            "overlap_hits": raw["overlap_hits"],
            "config_count": raw["config_count"],
        },
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_CAPACITY_BOTTLENECK_SCAN",
        details={
            "order_id": body.order_id,
            "suggestion_batch_id": batch_id,
            "severity_score": raw["severity_score"],
            "overlap_hits": raw["overlap_hits"],
        },
        model_used="rules_engine",
        latency_ms=ms,
        result="success",
    )
    return OrderAiCapacityBottleneckScanResponse(
        order_id=body.order_id,
        config_count=int(raw["config_count"]),
        distinct_lines=int(raw["distinct_lines"]),
        overlap_hits=int(raw["overlap_hits"]),
        severity_score=int(raw["severity_score"]),
        bottlenecks=hits,
        limitations=list(raw.get("limitations") or [])[:12],
        explainability_notes=notes,
        suggestion_batch_id=batch_id,
    )


async def ai_what_if_simulation(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiWhatIfSimulationRequest,
) -> OrderAiWhatIfSimulationResponse:
    t0 = time.perf_counter()
    order_row = await db.get(Order, body.order_id)
    if not order_row or order_row.tenant_id != tenant_id:
        rid = get_master_data_ai_request_id()
        batch_id = await ord_batches.create_trace_result_batch(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            order_id=body.order_id,
            action_type="what_if_simulation",
            request_id=rid,
            model_hint="rules_engine",
            meta_payload={"order_not_found": True},
        )
        ms = int((time.perf_counter() - t0) * 1000)
        ph = _not_found_promise_out(body.order_id)
        await _audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="ORDER_AI_WHAT_IF_SIMULATION",
            details={"order_id": body.order_id, "suggestion_batch_id": batch_id},
            model_used="rules_engine",
            latency_ms=ms,
            result="partial",
        )
        return OrderAiWhatIfSimulationResponse(
            order_id=body.order_id,
            scenario_label=body.scenario_label,
            assumptions=["Tenant could not resolve this order — simulation skipped."],
            baseline_promise=ph,
            simulated_promise=ph,
            advisory_notes=["No writes performed; scenario is hypothetical only."],
            suggestion_batch_id=batch_id,
        )

    base_raw = await run_order_promise_check(db, tenant_id=tenant_id, order=order_row)
    baseline = _to_promise_out(base_raw)

    eff_date: date | None = None
    if order_row.delivery_date is not None:
        eff_date = order_row.delivery_date + timedelta(days=int(body.delivery_date_shift_days))
    elif body.delivery_date_shift_days != 0:
        eff_date = date.today() + timedelta(days=int(body.delivery_date_shift_days))

    qty_override: float | None = None
    if body.quantity_scale_pct is not None and order_row.quantity is not None:
        qty_override = float(order_row.quantity) * (float(body.quantity_scale_pct) / 100.0)

    sim_raw = await run_order_promise_check(
        db,
        tenant_id=tenant_id,
        order=order_row,
        delivery_date_override=eff_date,
        quantity_override=qty_override,
    )
    simulated = _to_promise_out(sim_raw)

    scan = await scan_capacity_bottlenecks_for_order(db, tenant_id=tenant_id, order=order_row)
    sev_base = int(scan["severity_score"])
    sev_adj = sev_base
    if body.capacity_load_pct is not None and body.capacity_load_pct > 0:
        sev_adj = min(100, int(round(sev_base * (100.0 / float(body.capacity_load_pct)))))

    mat_note = ""
    if body.material_assumption == "strict":
        sev_adj = min(100, sev_adj + 8)
        mat_note = "Material assumption 'strict' adds conservative load to the bottleneck score only (ATP math unchanged)."
    elif body.material_assumption == "relaxed":
        sev_adj = max(0, sev_adj - 5)
        mat_note = "Material assumption 'relaxed' shaves bottleneck score slightly; ATP still uses live stock."

    readiness = 100
    readiness -= min(50, sev_adj // 2)
    if not (simulated.atp_ok and simulated.ctp_ok):
        readiness -= 35
    readiness = max(0, min(100, readiness))

    assumptions: list[str] = [
        f"Delivery shift: {body.delivery_date_shift_days} calendar day(s) vs recorded delivery date.",
    ]
    if body.quantity_scale_pct is not None:
        assumptions.append(f"Quantity scaled to {body.quantity_scale_pct}% of order quantity for ATP math.")
    else:
        assumptions.append("Quantity unchanged from the order record.")
    if body.capacity_load_pct is not None:
        assumptions.append(
            f"Capacity load factor {body.capacity_load_pct}% applied heuristically to overlap severity (not an APS solver)."
        )
    if mat_note:
        assumptions.append(mat_note)

    advisory = [
        "Read-only scenario: order rows, plans, and allocations were not modified.",
        "Use with merchandising / planning judgment — confirm on the floor before committing dates.",
    ]

    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="what_if_simulation",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={
            "readiness": readiness,
            "severity_baseline": sev_base,
            "severity_adjusted": sev_adj,
            "atp_baseline": baseline.atp_ok,
            "atp_sim": simulated.atp_ok,
        },
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_WHAT_IF_SIMULATION",
        details={
            "order_id": body.order_id,
            "suggestion_batch_id": batch_id,
            "readiness": readiness,
            "shift_days": body.delivery_date_shift_days,
        },
        model_used="rules_engine",
        latency_ms=ms,
        result="success",
    )
    return OrderAiWhatIfSimulationResponse(
        order_id=body.order_id,
        scenario_label=body.scenario_label,
        assumptions=assumptions,
        baseline_promise=baseline,
        simulated_promise=simulated,
        bottleneck_severity_baseline=sev_base,
        bottleneck_severity_adjusted=sev_adj,
        scenario_readiness_score=readiness,
        advisory_notes=advisory,
        suggestion_batch_id=batch_id,
    )


async def ai_promise_sensitivity_check(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiPromiseSensitivityCheckRequest,
) -> OrderAiPromiseSensitivityCheckResponse:
    t0 = time.perf_counter()
    order_row = await db.get(Order, body.order_id)
    if not order_row or order_row.tenant_id != tenant_id:
        rid = get_master_data_ai_request_id()
        batch_id = await ord_batches.create_trace_result_batch(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            order_id=body.order_id,
            action_type="promise_sensitivity_check",
            request_id=rid,
            model_hint="rules_engine",
            meta_payload={"order_not_found": True},
        )
        ms = int((time.perf_counter() - t0) * 1000)
        await _audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="ORDER_AI_PROMISE_SENSITIVITY_CHECK",
            details={"order_id": body.order_id, "suggestion_batch_id": batch_id},
            model_used="rules_engine",
            latency_ms=ms,
            result="partial",
        )
        return OrderAiPromiseSensitivityCheckResponse(
            order_id=body.order_id,
            explainability_notes=["Order not found for this tenant — no sensitivity grid."],
            suggestion_batch_id=batch_id,
        )

    base = await run_order_promise_check(db, tenant_id=tenant_id, order=order_row)
    base_sig = (base.atp_ok, base.ctp_ok)
    points: list[OrderAiPromiseSensitivityPointOut] = []
    flips = 0
    seen: set[int] = set()
    for off in body.delivery_offsets_days:
        if off in seen:
            continue
        seen.add(off)
        eff: date | None = None
        if order_row.delivery_date is not None:
            eff = order_row.delivery_date + timedelta(days=int(off))
        elif off != 0:
            eff = date.today() + timedelta(days=int(off))
        pr = await run_order_promise_check(
            db,
            tenant_id=tenant_id,
            order=order_row,
            delivery_date_override=eff,
        )
        sig = (pr.atp_ok, pr.ctp_ok)
        if sig != base_sig:
            flips += 1
        points.append(
            OrderAiPromiseSensitivityPointOut(
                offset_days=int(off),
                effective_delivery_date=eff.isoformat() if eff else None,
                atp_ok=bool(pr.atp_ok),
                ctp_ok=bool(pr.ctp_ok),
                reason_count=len(pr.reasons or []),
            )
        )

    sensitivity = min(100, flips * 22 + (10 if not order_row.delivery_date else 0))

    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="promise_sensitivity_check",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={"points": len(points), "flips": flips, "sensitivity_score": sensitivity},
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_PROMISE_SENSITIVITY_CHECK",
        details={"order_id": body.order_id, "suggestion_batch_id": batch_id, "flips": flips},
        model_used="rules_engine",
        latency_ms=ms,
        result="success",
    )
    return OrderAiPromiseSensitivityCheckResponse(
        order_id=body.order_id,
        points=points,
        sensitivity_score=sensitivity,
        explainability_notes=[
            "Sensitivity compares ATP/CTP outcomes when only the delivery date shifts (BOM/stock unchanged).",
        ],
        suggestion_batch_id=batch_id,
    )


async def ai_execution_planning_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: OrderAiExecutionPlanningSummaryRequest,
) -> OrderAiExecutionPlanningSummaryResponse:
    t0 = time.perf_counter()
    order_row = await db.get(Order, body.order_id)
    if not order_row or order_row.tenant_id != tenant_id:
        rid = get_master_data_ai_request_id()
        batch_id = await ord_batches.create_trace_result_batch(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            order_id=body.order_id,
            action_type="planning_summary",
            request_id=rid,
            model_hint="rules_engine",
            meta_payload={"order_not_found": True},
        )
        ms = int((time.perf_counter() - t0) * 1000)
        await _audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="ORDER_AI_EXECUTION_PLANNING_SUMMARY",
            details={"order_id": body.order_id, "suggestion_batch_id": batch_id},
            model_used="rules_engine",
            latency_ms=ms,
            result="partial",
        )
        return OrderAiExecutionPlanningSummaryResponse(
            order_id=body.order_id,
            headline="Order not found for this tenant.",
            limitations=["No summary generated."],
            suggestion_batch_id=batch_id,
        )

    ind = compute_order_ai_indicators(order_row)
    scan = await scan_capacity_bottlenecks_for_order(db, tenant_id=tenant_id, order=order_row)
    sev = int(scan["severity_score"])
    promise_raw = await run_order_promise_check(db, tenant_id=tenant_id, order=order_row)
    promise = _to_promise_out(promise_raw)

    proxy_readiness = max(0, min(100, ind.planning_confidence_score - sev // 3))
    psens = _promise_sensitivity_score(order_row)

    bullets: list[str] = [
        f"Execution readiness (header rules): {ind.execution_readiness_score}%",
        f"Material / quotation signals: {ind.material_readiness_score}%",
        f"Capacity overlap severity (heuristic): {sev}/100 — {scan['overlap_hits']} peer overlap hit(s), {scan['config_count']} config row(s).",
        f"ATP: {'OK' if promise.atp_ok else 'Blocked'} · CTP: {'OK' if promise.ctp_ok else 'Blocked'}",
    ]
    if promise.reasons:
        bullets.append(f"Promise notes: {'; '.join(promise.reasons[:3])}")

    hints: list[str] = []
    if not promise.atp_ok:
        hints.append("Request sourcing confirmation or alternate materials before locking shipment.")
    if not promise.ctp_ok:
        hints.append("Request commercial / planning review of delivery commitment.")
    if sev >= 45:
        hints.append("Request capacity verification on overlapping sewing lines.")
    if ind.urgent_planning_flag:
        hints.append("Treat as urgent planning — validate dependencies and follow-ups.")

    review_path = ["Order header", "ATP/CTP / materials", "Line board / capacity"]
    if scan["config_count"] == 0:
        review_path.append("Link production configs when available for richer bottleneck signals")

    lims = list(scan.get("limitations") or [])[:6]
    lims.append("Summary is deterministic rules + overlap heuristic — not an optimizer.")

    headline = f"{order_row.order_code}: planning snapshot (read-only)"

    rid = get_master_data_ai_request_id()
    batch_id = await ord_batches.create_trace_result_batch(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        order_id=body.order_id,
        action_type="planning_summary",
        request_id=rid,
        model_hint="rules_engine",
        meta_payload={"bottleneck_severity": sev, "proxy_readiness": proxy_readiness},
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="ORDER_AI_EXECUTION_PLANNING_SUMMARY",
        details={"order_id": body.order_id, "suggestion_batch_id": batch_id},
        model_used="rules_engine",
        latency_ms=ms,
        result="success",
    )
    return OrderAiExecutionPlanningSummaryResponse(
        order_id=body.order_id,
        headline=headline[:512],
        bullets=bullets[:16],
        bottleneck_severity_score=sev,
        scenario_readiness_proxy=proxy_readiness,
        promise_sensitivity_score=psens,
        recommended_review_path=review_path,
        next_step_hints=hints[:12],
        limitations=lims[:12],
        suggestion_batch_id=batch_id,
    )


def _int_detail(val: object) -> int | None:
    if isinstance(val, bool):
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, str) and val.strip().isdigit():
        return int(val.strip())
    return None


def _audit_entry(row: AiAuditLog, *, actor_username: str | None = None) -> OrderAiAuditEntry:
    dj = row.details_json if isinstance(row.details_json, dict) else {}
    oid = dj.get("order_id")
    oid_int: int | None = None
    if isinstance(oid, int):
        oid_int = oid
    elif isinstance(oid, str) and oid.strip().isdigit():
        oid_int = int(oid.strip())
    summary = row.action.replace("_", " ").title()
    if row.model_used:
        summary = f"{summary} · {row.model_used}"
    sbid = dj.get("suggestion_batch_id")
    sbid_int: int | None = None
    if isinstance(sbid, int):
        sbid_int = sbid
    elif isinstance(sbid, str) and sbid.strip().isdigit():
        sbid_int = int(sbid.strip())
    event_label = order_ai_event_label(row.action, dj)
    issue_count = _int_detail(dj.get("issue_count"))
    match_count = _int_detail(dj.get("match_count"))
    key_facts_count = _int_detail(dj.get("key_facts_count"))
    action_count = _int_detail(dj.get("count")) or _int_detail(dj.get("action_count"))
    applied_field_count = _int_detail(dj.get("applied_field_count")) or _int_detail(dj.get("applied_count"))
    return OrderAiAuditEntry(
        id=row.id,
        action=row.action,
        created_at=row.created_at.isoformat() if row.created_at else "",
        model_used=row.model_used,
        latency_ms=row.latency_ms,
        result=dj.get("result") if isinstance(dj.get("result"), str) else None,
        error_category=dj.get("error_category") if isinstance(dj.get("error_category"), str) else None,
        order_id=oid_int,
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


_SIMULATION_AUDIT_ACTIONS: tuple[str, ...] = (
    "ORDER_AI_CAPACITY_BOTTLENECK_SCAN",
    "ORDER_AI_WHAT_IF_SIMULATION",
    "ORDER_AI_PROMISE_SENSITIVITY_CHECK",
    "ORDER_AI_EXECUTION_PLANNING_SUMMARY",
)


async def list_order_ai_audit_logs(
    db: AsyncSession,
    *,
    tenant_id: int,
    order_id: int | None = None,
    limit: int = 40,
    planning_only: bool = False,
    simulation_only: bool = False,
) -> OrderAiAuditListResponse:
    lim = max(1, min(int(limit), 100))
    stmt = (
        select(AiAuditLog, User.username)
        .outerjoin(User, User.id == AiAuditLog.user_id)
        .where(
            AiAuditLog.tenant_id == tenant_id,
            AiAuditLog.prompt_category == "order_ai",
        )
        .order_by(AiAuditLog.created_at.desc())
        .limit(lim)
    )
    if simulation_only:
        stmt = stmt.where(AiAuditLog.action.in_(_SIMULATION_AUDIT_ACTIONS))
    elif planning_only:
        stmt = stmt.where(
            AiAuditLog.action.in_(
                (
                    "ORDER_AI_VALIDATE_EXECUTION",
                    "ORDER_AI_PLANNING_RISK_CHECK",
                    "ORDER_AI_ATP_CTP_SUMMARY",
                    "ORDER_AI_NEXT_ACTIONS",
                )
            )
        )
    if order_id is not None:
        stmt = stmt.where(AiAuditLog.details_json["order_id"].as_string() == str(order_id))
    r = await db.execute(stmt)
    pairs = r.all()
    return OrderAiAuditListResponse(items=[_audit_entry(row, actor_username=uname) for row, uname in pairs])
