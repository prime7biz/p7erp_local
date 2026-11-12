"""Request / response contracts of the finance commentary API. Fact values are decimal strings (never floats)."""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.ai_tool.llm_provider.prompt_sanitizer import redact_pii_for_external_provider
from app.modules.finance.ai_insights.constants import MAX_QUESTION_CHARS

ReportName = Literal[
    "trial_balance",
    "balance_sheet",
    "profit_loss",
    "cash_flow_monthly",
    "funds_flow_monthly",
    "ratio_analysis",
    "budget_analytics",
    "expense_analysis",
    "control_tower",
]
Comparison = Literal["none", "previous_period", "previous_year"]

_CONTROL_CHARS = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")
_SPACES = re.compile(r"\s+")


def sanitize_question(text: str | None) -> str | None:
    """Strip control characters, collapse spaces, redact obvious PII. Empty -> None. Length is checked by pydantic."""
    if text is None:
        return None
    cleaned = _SPACES.sub(" ", _CONTROL_CHARS.sub(" ", text)).strip()
    cleaned = redact_pii_for_external_provider(cleaned).strip()
    return cleaned or None


class CommentaryRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    report: ReportName
    from_date: date | None = None
    to_date: date | None = None
    fiscal_year: int | None = Field(default=None, ge=1900, le=9990)
    comparison: Comparison = "none"
    question: str | None = Field(default=None, max_length=MAX_QUESTION_CHARS)
    use_ai: bool = True  # false = deterministic commentary only (no provider call)

    @field_validator("question")
    @classmethod
    def _clean_question(cls, value: str | None) -> str | None:
        return sanitize_question(value)


class Finding(BaseModel):
    text: str
    fact_ids: list[str] = Field(default_factory=list)


class Fact(BaseModel):
    id: str
    label: str
    value: str
    unit: Literal["currency", "percent", "count", "days", "ratio"]


class CommentaryPeriod(BaseModel):
    from_date: date | None = None
    to_date: date | None = None
    fiscal_year: int | None = None
    comparison: Comparison = "none"
    previous_from_date: date | None = None
    previous_to_date: date | None = None


class CommentaryResponse(BaseModel):
    report: str
    summary: str
    findings: list[Finding]
    source: Literal["ai", "deterministic"]
    deterministic_fallback: bool
    reason: str | None = None
    facts: list[Fact]
    period: CommentaryPeriod
    base_currency: str
    notes: list[str] = Field(default_factory=list)
    data_as_of: datetime
