"""Read-only quotation costing intelligence API layer — audit + tenant fetch, no mutations."""

from __future__ import annotations

import hashlib
import time
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Quotation, User
from app.models.ai_tool import AiAuditLog
from app.models.costing import QuotationManufacturing, QuotationMaterial, QuotationOtherCost, QuotationSizeRatio
from app.modules.ai_tool.audit import log_ai_event
from app.modules.master_data_ai.request_context import get_master_data_ai_request_id
from app.modules.quotations.quotation_ai_service import _audit_entry
from app.modules.quotations.quotation_ai_schemas import (
    CostingIntelItem,
    QuotationAiAuditListResponse,
    QuotationCostingAiAnomalyScanResponse,
    QuotationCostingAiCompletenessResponse,
    QuotationCostingAiCostingSummaryResponse,
    QuotationCostingAiFxSensitivityResponse,
    QuotationCostingAiMarginRiskResponse,
    QuotationCostingAiNextActionsResponse,
    QuotationCostingAiRequest,
    QuotationCostingNextActionItem,
)
from app.modules.quotations.quotation_costing_intelligence import (
    build_costing_intelligence_bundle,
    derive_costing_summary_lines,
    derive_next_actions,
)

PROMPT_CATEGORY = "quotation_costing_ai"

_AUDIT_ACTION_TO_TYPE: dict[str, str] = {
    "QUOTATION_COSTING_COMPLETENESS_CHECK": "cost_completeness_check",
    "QUOTATION_COSTING_ANOMALY_SCAN": "costing_anomaly_scan",
    "QUOTATION_COSTING_MARGIN_RISK": "margin_risk_explanation",
    "QUOTATION_COSTING_FX_SENSITIVITY": "fx_sensitivity_summary",
    "QUOTATION_COSTING_SUMMARY": "costing_summary",
    "QUOTATION_COSTING_NEXT_ACTIONS": "costing_next_actions",
}


def _costing_request_fingerprint(
    *,
    tenant_id: int,
    quotation_id: int,
    action_type: str,
    line_counts: dict[str, int],
) -> str:
    raw = "|".join(
        [
            str(tenant_id),
            str(quotation_id),
            action_type,
            str(line_counts.get("materials", 0)),
            str(line_counts.get("manufacturing", 0)),
            str(line_counts.get("other_costs", 0)),
            str(line_counts.get("size_ratios", 0)),
        ]
    )
    return hashlib.sha256(raw.encode()).hexdigest()


def _indicator_snapshot(bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        "cost_completeness_score": bundle.get("cost_completeness_score"),
        "costing_confidence_score": bundle.get("costing_confidence_score"),
        "anomaly_severity": bundle.get("anomaly_severity"),
        "margin_pressure": bundle.get("margin_pressure"),
        "fx_sensitivity": bundle.get("fx_sensitivity"),
        "urgent_costing_review": bundle.get("urgent_costing_review"),
        "signal_scope": bundle.get("signal_scope"),
        "confidence_basis": bundle.get("confidence_basis"),
        "limited_confidence": bundle.get("limited_confidence"),
    }


def _signal_meta_kwargs(bundle: dict[str, Any]) -> dict[str, Any]:
    return {
        "signal_scope": bundle["signal_scope"],
        "confidence_basis": bundle["confidence_basis"],
        "source_mode": bundle["source_mode"],
        "reason_codes": list(bundle.get("reason_codes") or []),
        "limited_confidence": bool(bundle.get("limited_confidence")),
    }


def _intel_items(rows: list[dict[str, Any]]) -> list[CostingIntelItem]:
    out: list[CostingIntelItem] = []
    for x in rows:
        out.append(
            CostingIntelItem(
                reason_code=str(x.get("reason_code") or x.get("code") or ""),
                code=str(x.get("code") or x.get("reason_code") or ""),
                severity=str(x.get("severity") or "info"),
                message=str(x.get("message") or ""),
            )
        )
    return out


def _material_dict(m: QuotationMaterial) -> dict[str, Any]:
    return {
        "serial_no": m.serial_no,
        "category_id": m.category_id,
        "item_id": m.item_id,
        "description": m.description,
        "total_amount": m.total_amount,
        "amount_per_dozen": m.amount_per_dozen,
        "currency": m.currency,
    }


def _mfg_dict(m: QuotationManufacturing) -> dict[str, Any]:
    return {
        "serial_no": m.serial_no,
        "style_part": m.style_part,
        "total_line_cost": m.total_line_cost,
        "total_order_cost": m.total_order_cost,
        "cost_per_dozen": m.cost_per_dozen,
        "currency": m.currency,
    }


def _other_dict(m: QuotationOtherCost) -> dict[str, Any]:
    return {
        "serial_no": m.serial_no,
        "cost_head": m.cost_head,
        "calculated_amount": m.calculated_amount,
        "total_amount": m.total_amount,
        "currency": m.currency,
    }


def _sr_dict(m: QuotationSizeRatio) -> dict[str, Any]:
    return {
        "serial_no": m.serial_no,
        "ratio_percentage": m.ratio_percentage,
        "size": m.size,
    }


async def _load_quotation_lines(
    db: AsyncSession,
    *,
    tenant_id: int,
    quotation_id: int,
) -> tuple[Quotation, list[dict], list[dict], list[dict], list[dict]]:
    q = await db.get(Quotation, quotation_id)
    if not q or q.tenant_id != tenant_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Quotation not found")

    mats = (
        await db.execute(
            select(QuotationMaterial)
            .where(
                QuotationMaterial.quotation_id == quotation_id,
                QuotationMaterial.tenant_id == tenant_id,
            )
            .order_by(QuotationMaterial.serial_no)
        )
    ).scalars().all()
    mfg = (
        await db.execute(
            select(QuotationManufacturing)
            .where(
                QuotationManufacturing.quotation_id == quotation_id,
                QuotationManufacturing.tenant_id == tenant_id,
            )
            .order_by(QuotationManufacturing.serial_no)
        )
    ).scalars().all()
    oth = (
        await db.execute(
            select(QuotationOtherCost)
            .where(
                QuotationOtherCost.quotation_id == quotation_id,
                QuotationOtherCost.tenant_id == tenant_id,
            )
            .order_by(QuotationOtherCost.serial_no)
        )
    ).scalars().all()
    sr = (
        await db.execute(
            select(QuotationSizeRatio)
            .where(
                QuotationSizeRatio.quotation_id == quotation_id,
                QuotationSizeRatio.tenant_id == tenant_id,
            )
            .order_by(QuotationSizeRatio.serial_no)
        )
    ).scalars().all()

    return (
        q,
        [_material_dict(x) for x in mats],
        [_mfg_dict(x) for x in mfg],
        [_other_dict(x) for x in oth],
        [_sr_dict(x) for x in sr],
    )


async def _audit_costing(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    action: str,
    quotation_id: int,
    bundle: dict[str, Any],
    details: dict[str, Any],
    latency_ms: int | None = None,
) -> None:
    rid = get_master_data_ai_request_id()
    audit_type = _AUDIT_ACTION_TO_TYPE.get(action, action.lower())
    lc = bundle.get("line_counts") or {}
    fp = _costing_request_fingerprint(
        tenant_id=tenant_id,
        quotation_id=quotation_id,
        action_type=audit_type,
        line_counts={
            "materials": int(lc.get("materials", 0)),
            "manufacturing": int(lc.get("manufacturing", 0)),
            "other_costs": int(lc.get("other_costs", 0)),
            "size_ratios": int(lc.get("size_ratios", 0)),
        },
    )
    snap = _indicator_snapshot(bundle)
    merged = {
        **details,
        "quotation_id": quotation_id,
        "result": "success",
        "read_only": True,
        "action_type": audit_type,
        "result_status": "success",
        "source_mode": bundle.get("source_mode"),
        "reason_codes": list(bundle.get("reason_codes") or [])[:40],
        "indicator_snapshot": snap,
        "correlation_id": rid or "",
        "request_fingerprint_sha256": fp,
    }
    if rid:
        merged["quotation_costing_ai_request_id"] = rid
    await log_ai_event(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        resource="quotation",
        request_id=rid,
        trace_id=rid,
        severity="INFO",
        details_json=merged,
        latency_ms=latency_ms,
        prompt_category=PROMPT_CATEGORY,
    )


async def run_cost_completeness_check(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationCostingAiRequest,
) -> QuotationCostingAiCompletenessResponse:
    t0 = time.perf_counter()
    q, ml, mfgl, ol, srl = await _load_quotation_lines(db, tenant_id=tenant_id, quotation_id=body.quotation_id)
    bundle = build_costing_intelligence_bundle(
        q,
        material_lines=ml,
        manufacturing_lines=mfgl,
        other_cost_lines=ol,
        size_ratio_lines=srl,
        signal_scope="full_costing",
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit_costing(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_COMPLETENESS_CHECK",
        quotation_id=body.quotation_id,
        bundle=bundle,
        details={
            "cost_completeness_score": bundle["cost_completeness_score"],
            "item_count": len(bundle["completeness_items"]),
        },
        latency_ms=ms,
    )
    return QuotationCostingAiCompletenessResponse(
        advisory_notice=bundle["advisory_notice"],
        quotation_id=body.quotation_id,
        cost_completeness_score=bundle["cost_completeness_score"],
        costing_confidence_score=bundle["costing_confidence_score"],
        items=_intel_items(bundle["completeness_items"]),
        line_counts=bundle["line_counts"],
        **_signal_meta_kwargs(bundle),
    )


async def run_costing_anomaly_scan(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationCostingAiRequest,
) -> QuotationCostingAiAnomalyScanResponse:
    t0 = time.perf_counter()
    q, ml, mfgl, ol, srl = await _load_quotation_lines(db, tenant_id=tenant_id, quotation_id=body.quotation_id)
    bundle = build_costing_intelligence_bundle(
        q,
        material_lines=ml,
        manufacturing_lines=mfgl,
        other_cost_lines=ol,
        size_ratio_lines=srl,
        signal_scope="full_costing",
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit_costing(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_ANOMALY_SCAN",
        quotation_id=body.quotation_id,
        bundle=bundle,
        details={
            "anomaly_severity": bundle["anomaly_severity"],
            "anomaly_count": len(bundle["anomaly_items"]),
        },
        latency_ms=ms,
    )
    return QuotationCostingAiAnomalyScanResponse(
        advisory_notice=bundle["advisory_notice"],
        quotation_id=body.quotation_id,
        anomaly_severity=bundle["anomaly_severity"],
        items=_intel_items(bundle["anomaly_items"]),
        **_signal_meta_kwargs(bundle),
    )


async def run_margin_risk_explanation(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationCostingAiRequest,
) -> QuotationCostingAiMarginRiskResponse:
    t0 = time.perf_counter()
    q, ml, mfgl, ol, srl = await _load_quotation_lines(db, tenant_id=tenant_id, quotation_id=body.quotation_id)
    bundle = build_costing_intelligence_bundle(
        q,
        material_lines=ml,
        manufacturing_lines=mfgl,
        other_cost_lines=ol,
        size_ratio_lines=srl,
        signal_scope="full_costing",
    )
    ms = int((time.perf_counter() - t0) * 1000)
    ctx = bundle["margin_context"]
    await _audit_costing(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_MARGIN_RISK",
        quotation_id=body.quotation_id,
        bundle=bundle,
        details={"margin_pressure": bundle["margin_pressure"]},
        latency_ms=ms,
    )
    return QuotationCostingAiMarginRiskResponse(
        advisory_notice=bundle["advisory_notice"],
        quotation_id=body.quotation_id,
        margin_pressure=bundle["margin_pressure"],
        context=ctx,
        **_signal_meta_kwargs(bundle),
    )


async def run_fx_sensitivity_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationCostingAiRequest,
) -> QuotationCostingAiFxSensitivityResponse:
    t0 = time.perf_counter()
    q, ml, mfgl, ol, srl = await _load_quotation_lines(db, tenant_id=tenant_id, quotation_id=body.quotation_id)
    bundle = build_costing_intelligence_bundle(
        q,
        material_lines=ml,
        manufacturing_lines=mfgl,
        other_cost_lines=ol,
        size_ratio_lines=srl,
        signal_scope="full_costing",
    )
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit_costing(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_FX_SENSITIVITY",
        quotation_id=body.quotation_id,
        bundle=bundle,
        details={"fx_sensitivity": bundle["fx_sensitivity"]},
        latency_ms=ms,
    )
    return QuotationCostingAiFxSensitivityResponse(
        advisory_notice=bundle["advisory_notice"],
        quotation_id=body.quotation_id,
        fx_sensitivity=bundle["fx_sensitivity"],
        context=bundle["fx_context"],
        **_signal_meta_kwargs(bundle),
    )


async def run_costing_summary(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationCostingAiRequest,
) -> QuotationCostingAiCostingSummaryResponse:
    t0 = time.perf_counter()
    q, ml, mfgl, ol, srl = await _load_quotation_lines(db, tenant_id=tenant_id, quotation_id=body.quotation_id)
    bundle = build_costing_intelligence_bundle(
        q,
        material_lines=ml,
        manufacturing_lines=mfgl,
        other_cost_lines=ol,
        size_ratio_lines=srl,
        signal_scope="full_costing",
    )
    ms = int((time.perf_counter() - t0) * 1000)
    lines = derive_costing_summary_lines(bundle)
    await _audit_costing(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_SUMMARY",
        quotation_id=body.quotation_id,
        bundle=bundle,
        details={
            "cost_completeness_score": bundle["cost_completeness_score"],
            "anomaly_severity": bundle["anomaly_severity"],
        },
        latency_ms=ms,
    )
    return QuotationCostingAiCostingSummaryResponse(
        advisory_notice=bundle["advisory_notice"],
        quotation_id=body.quotation_id,
        summary_lines=lines,
        scores={
            "cost_completeness_score": bundle["cost_completeness_score"],
            "costing_confidence_score": bundle["costing_confidence_score"],
            "anomaly_severity": bundle["anomaly_severity"],
            "margin_pressure": bundle["margin_pressure"],
            "fx_sensitivity": bundle["fx_sensitivity"],
            "urgent_costing_review": bundle["urgent_costing_review"],
        },
        **_signal_meta_kwargs(bundle),
    )


async def run_costing_next_actions(
    db: AsyncSession,
    *,
    tenant_id: int,
    user_id: int | None,
    body: QuotationCostingAiRequest,
) -> QuotationCostingAiNextActionsResponse:
    t0 = time.perf_counter()
    q, ml, mfgl, ol, srl = await _load_quotation_lines(db, tenant_id=tenant_id, quotation_id=body.quotation_id)
    bundle = build_costing_intelligence_bundle(
        q,
        material_lines=ml,
        manufacturing_lines=mfgl,
        other_cost_lines=ol,
        size_ratio_lines=srl,
        signal_scope="full_costing",
    )
    raw_actions = derive_next_actions(bundle)
    ms = int((time.perf_counter() - t0) * 1000)
    await _audit_costing(
        db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="QUOTATION_COSTING_NEXT_ACTIONS",
        quotation_id=body.quotation_id,
        bundle=bundle,
        details={"action_count": len(raw_actions)},
        latency_ms=ms,
    )
    return QuotationCostingAiNextActionsResponse(
        advisory_notice=bundle["advisory_notice"],
        quotation_id=body.quotation_id,
        actions=[QuotationCostingNextActionItem(**a) for a in raw_actions],
        **_signal_meta_kwargs(bundle),
    )


async def list_quotation_costing_ai_audit_logs(
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
            AiAuditLog.prompt_category == PROMPT_CATEGORY,
        )
        .order_by(AiAuditLog.created_at.desc())
        .limit(lim)
    )
    if quotation_id is not None:
        stmt = stmt.where(AiAuditLog.details_json["quotation_id"].as_string() == str(quotation_id))
    r = await db.execute(stmt)
    pairs = r.all()
    return QuotationAiAuditListResponse(items=[_audit_entry(row, actor_username=uname) for row, uname in pairs])
