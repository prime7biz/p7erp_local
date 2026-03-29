"""LLM provider selection for tiered AI flow."""

from __future__ import annotations

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider
from app.modules.ai_tool.llm_provider.gemini_provider import GeminiLlmProvider
from app.modules.ai_tool.llm_provider.ollama_provider import OllamaLlmProvider
from app.modules.ai_tool.llm_provider.paid_provider import PaidLlmProvider
from app.modules.ai_tool.llm_provider.stub_provider import StubLlmProvider
from app.modules.ai_tool.llm_provider.vllm_provider import VllmLlmProvider


def get_llm_provider() -> BaseLlmProvider:
    """Primary provider for tier-1 gatekeeper routing."""
    s = get_settings()
    if s.vllm_enabled and (s.vllm_url or "").strip() and (s.vllm_model or "").strip():
        return VllmLlmProvider()
    if s.ollama_enabled and (s.ollama_url or "").strip():
        return OllamaLlmProvider()
    if s.gemini_enabled and (s.gemini_api_key or "").strip():
        return GeminiLlmProvider()
    return StubLlmProvider()


def get_response_llm_provider() -> BaseLlmProvider:
    """Optional rewrite provider for assistant natural-language polish."""
    s = get_settings()
    if s.gemini_enabled and (s.gemini_api_key or "").strip():
        return GeminiLlmProvider()
    return StubLlmProvider()


def get_paid_llm_provider() -> BaseLlmProvider:
    """Tier-2 paid provider used only after explicit approval."""
    return PaidLlmProvider()
