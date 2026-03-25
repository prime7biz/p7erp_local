from __future__ import annotations

from app.common.gemini_client import generate_text_sync
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider


class GeminiLlmProvider(BaseLlmProvider):
    """Gemini Flash-lite for natural-language assistant responses."""

    async def generate(self, prompt: str) -> str:
        text = generate_text_sync(prompt)
        if text:
            return text
        return (
            "AI text generation is unavailable. Ensure GEMINI_API_KEY is set in the server environment "
            "(for Docker: set it in the repo root `.env` used by docker compose) and GEMINI_ENABLED=true."
        )
