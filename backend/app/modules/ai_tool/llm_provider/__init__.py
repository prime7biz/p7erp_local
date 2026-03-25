"""LLM provider: Gemini when configured, else stub."""

from __future__ import annotations

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider
from app.modules.ai_tool.llm_provider.gemini_provider import GeminiLlmProvider
from app.modules.ai_tool.llm_provider.stub_provider import StubLlmProvider


def get_llm_provider() -> BaseLlmProvider:
    s = get_settings()
    if s.gemini_enabled and (s.gemini_api_key or "").strip():
        return GeminiLlmProvider()
    return StubLlmProvider()
