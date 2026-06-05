"""Smoke checks for tier-1 LLM provider selection (OpenRouter vs Ollama vs stub)."""

from __future__ import annotations

import pytest

from app.config import get_settings
from app.modules.ai_tool.llm_provider import get_llm_provider, get_response_llm_provider
from app.modules.ai_tool.llm_provider.ollama_provider import OllamaLlmProvider
from app.modules.ai_tool.llm_provider.openrouter_provider import OpenRouterLlmProvider
from app.modules.ai_tool.llm_provider.stub_provider import StubLlmProvider
from app.modules.ai_tool.llm_provider.vllm_provider import VllmLlmProvider


@pytest.fixture(autouse=True)
def clear_settings_cache():
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_tier1_prefers_openrouter_when_preferred_and_ollama_up(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_TIER1_PREFERRED", "true")
    monkeypatch.setenv("OPENROUTER_ENABLED", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
    monkeypatch.setenv("VLLM_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_ENABLED", "true")
    monkeypatch.setenv("OLLAMA_URL", "http://ollama:11434")
    get_settings.cache_clear()
    prov = get_llm_provider()
    assert isinstance(prov, OpenRouterLlmProvider)


def test_tier1_prefers_ollama_when_local_and_openrouter_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_TIER1_PREFERRED", "false")
    monkeypatch.setenv("OPENROUTER_ENABLED", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
    monkeypatch.setenv("VLLM_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_ENABLED", "true")
    monkeypatch.setenv("OLLAMA_URL", "http://ollama:11434")
    get_settings.cache_clear()
    prov = get_llm_provider()
    assert isinstance(prov, OllamaLlmProvider)


def test_tier1_prefers_openrouter_when_ollama_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_ENABLED", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
    monkeypatch.setenv("OLLAMA_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_URL", "")
    get_settings.cache_clear()
    prov = get_llm_provider()
    assert isinstance(prov, OpenRouterLlmProvider)


def test_tier1_prefers_ollama_when_openrouter_not_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("OPENROUTER_ENABLED", "true")
    monkeypatch.setenv("VLLM_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_ENABLED", "true")
    monkeypatch.setenv("OLLAMA_URL", "http://ollama:11434")
    monkeypatch.setenv("OLLAMA_MODEL", "gemma2:2b-instruct-q4_K_M")
    get_settings.cache_clear()
    prov = get_llm_provider()
    assert isinstance(prov, OllamaLlmProvider)


def test_tier1_prefers_vllm_when_ollama_and_openrouter_unavailable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("VLLM_ENABLED", "true")
    monkeypatch.setenv("VLLM_URL", "http://vllm:8000")
    monkeypatch.setenv("VLLM_MODEL", "meta-llama/Meta-Llama-3-8B-Instruct")
    monkeypatch.setenv("OLLAMA_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_URL", "")
    get_settings.cache_clear()
    prov = get_llm_provider()
    assert isinstance(prov, VllmLlmProvider)


def test_response_llm_matches_tier1_local_first(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_TIER1_PREFERRED", "false")
    monkeypatch.setenv("OPENROUTER_ENABLED", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
    monkeypatch.setenv("OLLAMA_ENABLED", "true")
    monkeypatch.setenv("OLLAMA_URL", "http://ollama:11434")
    get_settings.cache_clear()
    prov = get_response_llm_provider()
    assert isinstance(prov, OllamaLlmProvider)


def test_response_llm_prefers_openrouter_when_tier1_preferred(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OPENROUTER_TIER1_PREFERRED", "true")
    monkeypatch.setenv("OPENROUTER_ENABLED", "true")
    monkeypatch.setenv("OPENROUTER_API_KEY", "sk-or-test")
    monkeypatch.setenv("OPENROUTER_MODEL", "google/gemma-4-31b-it:free")
    monkeypatch.setenv("OLLAMA_ENABLED", "true")
    monkeypatch.setenv("OLLAMA_URL", "http://ollama:11434")
    get_settings.cache_clear()
    prov = get_response_llm_provider()
    assert isinstance(prov, OpenRouterLlmProvider)


def test_tier1_stub_when_no_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setenv("VLLM_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_ENABLED", "false")
    monkeypatch.setenv("OLLAMA_URL", "")
    get_settings.cache_clear()
    prov = get_llm_provider()
    assert isinstance(prov, StubLlmProvider)
