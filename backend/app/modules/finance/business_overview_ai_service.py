"""Optional Gemini narrative on top of deterministic overview."""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from app.common.ai_governance import default_meta
from app.config import get_settings
from app.modules.finance.business_overview_rules import deterministic_summary
from app.modules.finance.business_overview_service import build_business_overview

try:
    from app.common.gemini_client import generate_text_for_tenant
except Exception:  # pragma: no cover
    generate_text_for_tenant = None  # type: ignore[assignment]


async def build_business_overview_ai_narrative(
    db: AsyncSession, *, tenant_id: int, user_id: int | None = None
) -> dict:
    settings = get_settings()
    overview = await build_business_overview(db, tenant_id=tenant_id)
    det = deterministic_summary(overview)
    meta = default_meta(
        data_as_of=str(overview.get("data_as_of") or ""),
        source_modules=list(overview.get("source_modules") or []),
    )
    narrative = ""
    if settings.business_overview_ai_enabled and generate_text_for_tenant:
        try:
            prompt = (
                "Summarize this JSON business snapshot in 3 short paragraphs for an owner/CFO. "
                "No tables. Flag risks and opportunities. JSON:\n"
                + str(overview)[:12000]
            )
            narrative = await generate_text_for_tenant(
                db,
                tenant_id,
                user_id,
                feature="business_overview",
                prompt=prompt,
            )
            narrative = (narrative or "").strip() or " ".join(det["bullets"])
            meta.confidence_score = 0.72
        except Exception:
            narrative = " ".join(det["bullets"])
            meta.confidence_score = 0.35
            meta.limitations.append("LLM unavailable; using rule-based fallback.")
    else:
        narrative = " ".join(det["bullets"])
        meta.confidence_score = 0.4
        meta.limitations.append("AI narrative disabled or not configured.")
    return {"meta": meta.model_dump(), "narrative": narrative, "deterministic": det}
