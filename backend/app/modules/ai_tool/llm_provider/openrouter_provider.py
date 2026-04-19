"""OpenRouter (OpenAI-compatible) with optional fallback to local Ollama."""

from __future__ import annotations

import logging

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider
from app.modules.ai_tool.llm_provider.openrouter_client import openrouter_generate_text
from app.modules.ai_tool.llm_provider.ollama_provider import OllamaLlmProvider

logger = logging.getLogger(__name__)


def openrouter_is_configured() -> bool:
    s = get_settings()
    if not s.openrouter_enabled:
        return False
    if not (s.openrouter_api_key or "").strip():
        return False
    if not (s.openrouter_model or "").strip():
        return False
    return True


class OpenRouterLlmProvider(BaseLlmProvider):
    """Primary cloud model via OpenRouter; falls back to Ollama on failure or empty output."""

    async def generate(self, prompt: str) -> str:
        res = await openrouter_generate_text(prompt, log_feature="tier1")
        text = res.text
        if text and len(str(text).strip()) > 5:
            return str(text).strip()

        s = get_settings()
        if s.ollama_enabled and (s.ollama_url or "").strip():
            logger.warning("OpenRouter returned empty or failed; falling back to Ollama")
            ollama = OllamaLlmProvider()
            return await ollama.generate(prompt)
        return (
            text.strip()
            if text
            else "AI is unavailable. Configure OPENROUTER_API_KEY or ensure Ollama is running."
        )
