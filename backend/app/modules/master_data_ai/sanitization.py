"""Sanitize untrusted text and short NL queries before LLM prompts."""

from __future__ import annotations

import html
import re

from app.modules.ai_tool.guardrails import screen_prompt

_EXTRA_INJECTION = re.compile(
    r"(?i)(<\|im_start\|>|</s>|begin\s+system\s+message|override\s+previous|disregard\s+above)",
)


def sanitize_untrusted_text(text: str, *, max_len: int = 24_000) -> str:
    """HTML-escape and trim untrusted document / web / OCR text before it enters prompts."""
    raw = (text or "")[:max_len]
    t = html.escape(raw, quote=True)
    t = _EXTRA_INJECTION.sub("[redacted]", t)
    return t


def sanitize_nl_user_query(query: str, *, max_len: int = 500) -> tuple[str, str | None]:
    """Short NL filter queries: reuse guardrail screen + length."""
    q = (query or "").strip()[:max_len]
    ok, reason = screen_prompt(q)
    if not ok:
        return "", reason or "Query blocked by safety rules."
    return q, None
