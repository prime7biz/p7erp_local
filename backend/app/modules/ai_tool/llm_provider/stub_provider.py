from __future__ import annotations

from app.modules.ai_tool.llm_provider.base import BaseLlmProvider


class StubLlmProvider(BaseLlmProvider):
    """Safe Phase-1 fallback; does not call external services."""

    async def generate(self, prompt: str) -> str:
        del prompt
        return "LLM provider is not enabled in this phase."
