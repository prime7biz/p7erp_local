"""Backward-compatible exports; implementation lives in master_data_ai."""

from __future__ import annotations

from app.modules.master_data_ai.gateway import invoke_structured_llm
from app.modules.master_data_ai.sanitization import sanitize_nl_user_query, sanitize_untrusted_text

__all__ = ["invoke_structured_llm", "sanitize_nl_user_query", "sanitize_untrusted_text"]
