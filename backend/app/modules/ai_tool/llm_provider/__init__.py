"""LLM provider selection for tiered AI flow."""

from __future__ import annotations

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider
from app.modules.ai_tool.llm_provider.ollama_provider import OllamaLlmProvider
from app.modules.ai_tool.llm_provider.openrouter_provider import OpenRouterLlmProvider, openrouter_is_configured
from app.modules.ai_tool.llm_provider.paid_provider import PaidLlmProvider
from app.modules.ai_tool.llm_provider.stub_provider import StubLlmProvider
from app.modules.ai_tool.llm_provider.vllm_provider import VllmLlmProvider


def get_llm_provider() -> BaseLlmProvider:
    """Primary provider for tier-1 gatekeeper routing.

    Default: OpenRouter when configured, then Ollama, then vLLM, then stub.
    Set ``OPENROUTER_TIER1_PREFERRED=false`` to use local Ollama before OpenRouter when both exist.
    """
    s = get_settings()
    ollama_ok = bool(s.ollama_enabled and (s.ollama_url or "").strip())
    or_ok = openrouter_is_configured()
    if getattr(s, "openrouter_tier1_preferred", False) and or_ok:
        return OpenRouterLlmProvider()
    if ollama_ok:
        return OllamaLlmProvider()
    if or_ok:
        return OpenRouterLlmProvider()
    if s.vllm_enabled and (s.vllm_url or "").strip() and (s.vllm_model or "").strip():
        return VllmLlmProvider()
    return StubLlmProvider()


def get_response_llm_provider() -> BaseLlmProvider:
    """Optional rewrite provider for assistant natural-language polish (same order as tier-1)."""
    s = get_settings()
    ollama_ok = bool(s.ollama_enabled and (s.ollama_url or "").strip())
    or_ok = openrouter_is_configured()
    if getattr(s, "openrouter_tier1_preferred", False) and or_ok:
        return OpenRouterLlmProvider()
    if ollama_ok:
        return OllamaLlmProvider()
    if or_ok:
        return OpenRouterLlmProvider()
    return StubLlmProvider()


def get_paid_llm_provider() -> BaseLlmProvider:
    """Tier-2 paid provider used only after explicit approval."""
    return PaidLlmProvider()
