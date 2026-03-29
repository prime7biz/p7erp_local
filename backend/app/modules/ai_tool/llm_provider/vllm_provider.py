from __future__ import annotations

from openai import AsyncOpenAI

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider
from app.modules.ai_tool.llm_provider.ollama_provider import TRIAGE_SYSTEM_PROMPT


class VllmLlmProvider(BaseLlmProvider):
    """Tier-1 local triage via vLLM OpenAI-compatible API."""

    async def generate(self, prompt: str) -> str:
        settings = get_settings()
        base = (settings.vllm_url or "").strip().rstrip("/")
        model = (settings.vllm_model or "").strip()
        if not base or not model:
            return "Local AI is unavailable because VLLM_URL or VLLM_MODEL is not configured."

        api_base = f"{base}/v1"
        max_tokens = max(64, int(settings.vllm_max_tokens or 1024))
        timeout = float(max(15, settings.ai_timeout_chat_seconds + 15))

        try:
            client = AsyncOpenAI(base_url=api_base, api_key="not-needed", timeout=timeout)
            resp = await client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": TRIAGE_SYSTEM_PROMPT},
                    {"role": "user", "content": prompt.strip()},
                ],
                max_tokens=max_tokens,
                temperature=0.2,
            )
            choice = resp.choices[0] if resp.choices else None
            text = (choice.message.content or "").strip() if choice and choice.message else ""
            if text:
                return text
            return "Local AI returned an empty response."
        except Exception as exc:
            return (
                "Local AI is unavailable right now. "
                f"vLLM request failed: {type(exc).__name__}: {exc!s}"[:500]
            )
