"""AI advisory metadata (AI never posts vouchers)."""

from __future__ import annotations

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class AiGovernanceMeta(BaseModel):
    generated_at: str
    data_as_of: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    source_modules: list[str]
    assumptions: list[str]
    limitations: list[str]
    tenant_review_required: bool = False
    approved_for_external: bool = True


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def default_meta(*, data_as_of: str, source_modules: list[str]) -> AiGovernanceMeta:
    return AiGovernanceMeta(
        generated_at=utc_now_iso(),
        data_as_of=data_as_of,
        confidence_score=0.55,
        source_modules=source_modules,
        assumptions=["Figures are ERP aggregates; not audited financial statements."],
        limitations=["Does not replace professional credit or legal advice."],
        tenant_review_required=False,
        approved_for_external=True,
    )
