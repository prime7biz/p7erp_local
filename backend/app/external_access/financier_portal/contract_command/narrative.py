"""Governed LLM brief for contract command center (optional)."""

from __future__ import annotations

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ai_governance import default_meta, utc_now_iso
from app.config import get_settings
from app.models import ExternalPrincipal, Tenant
from app.common.gemini_client import generate_text_for_tenant


async def build_contract_narrative(
    db: AsyncSession,
    *,
    principal: ExternalPrincipal,
    contract_payload: dict[str, Any],
) -> dict[str, Any]:
    """Short bank-style brief from numeric payload only."""
    settings = get_settings()
    tenant = await db.get(Tenant, principal.tenant_id)
    tenant_name = tenant.name if tenant else f"Tenant #{principal.tenant_id}"
    mc = contract_payload.get("master_contract") or {}
    risk = contract_payload.get("risk") or {}
    rollup = contract_payload.get("rollup") or {}
    mat = contract_payload.get("maturity") or {}
    cash = contract_payload.get("cash_ladder") or {}

    facts = (
        f"Tenant: {tenant_name}. Contract {mc.get('reference')}. "
        f"Composite score {risk.get('composite_score')}. "
        f"Avg OTD {rollup.get('avg_otd_score')}, max delay days {rollup.get('max_predicted_delay_days')}. "
        f"Maturity safety {mat.get('maturity_safety_score')}. "
        f"Cashability {cash.get('cashability_score')}, red weeks {cash.get('red_weeks')}."
    )
    meta = default_meta(
        data_as_of=utc_now_iso(),
        source_modules=["external_portal", "contract_command", "finance", "orders"],
    )
    meta.confidence_score = min(1.0, max(0.0, float(risk.get("composite_score") or 0) / 100.0))
    if settings.external_ai_requires_approval:
        meta.tenant_review_required = True
        meta.approved_for_external = False

    narrative = facts
    if settings.financier_confidence_ai_enabled:
        prompt = (
            "You are a bank credit analyst. Write 2-3 sentences for an export garment financing monitor. "
            "Use ONLY the facts below; do not invent numbers. If data is incomplete, say so.\n\n" + facts
        )
        gen = await generate_text_for_tenant(
            db,
            principal.tenant_id,
            None,
            "financier_contract_narrative",
            prompt,
        )
        if gen:
            narrative = gen.strip()

    return {
        "narrative": narrative,
        "meta": meta.model_dump(),
        "ai_narrative_enabled": settings.financier_confidence_ai_enabled,
        "external_ai_requires_approval": settings.external_ai_requires_approval,
    }
