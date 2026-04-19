"""Redact obvious PII before sending text to external LLM providers (OpenRouter, paid tier)."""

from __future__ import annotations

import re

_EMAIL = re.compile(
    r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}",
    re.IGNORECASE,
)
# Loose phone / national id style digit runs (mask, do not validate country rules)
_PHONE = re.compile(r"\b(?:\+?\d{1,3}[\s.\-]?)?(?:\(?\d{3}\)?[\s.\-]?)\d{3}[\s.\-]?\d{4}\b")
_CARD = re.compile(r"\b(?:\d[ \-]?){13,19}\d\b")


def redact_pii_for_external_provider(text: str) -> str:
    """Replace common PII patterns with placeholders. Best-effort; not a compliance guarantee."""
    if not text:
        return ""
    out = _EMAIL.sub("[EMAIL_REDACTED]", text)
    out = _PHONE.sub("[PHONE_REDACTED]", out)
    out = _CARD.sub("[CARD_REDACTED]", out)
    return out


def clamp_text_for_llm(text: str, *, max_chars: int) -> str:
    """Truncate to max_chars for provider request size limits."""
    if max_chars <= 0 or len(text) <= max_chars:
        return text
    return text[: max_chars - 1] + "…"
