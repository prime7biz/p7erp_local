from __future__ import annotations

import json

import httpx

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider

TRIAGE_SYSTEM_PROMPT = """
You are the Tier 1 AI Triage Agent for Prime7 ERP.

RULE 1 - HANDLE these yourself with a short, helpful answer:
- Navigation help ("How do I find the ledger?")
- Definitions ("What is a GRN?", "What does TNA mean?")
- Read-only data summaries or lookups
- General ERP usage questions

RULE 2 - ESCALATE by outputting ONLY raw JSON (no other text):
If the user wants ANY of these, you MUST NOT answer. Output this JSON exactly:
{"status": "escalate", "tool_required": "<tool name>", "reason": "<1-line explanation>"}

Escalation triggers:
- Creating a Sales Inquiry -> tool: "create_sales_inquiry"
- Generating a Financial Voucher -> tool: "create_financial_voucher"
- Processing a Goods Receipt (GRN) -> tool: "process_goods_receipt"
- Any write operation, transaction creation, or complex data generation

NEVER attempt to perform write operations yourself.
""".strip()


class OllamaLlmProvider(BaseLlmProvider):
    """Tier-1 local triage provider backed by Ollama."""

    async def generate(self, prompt: str) -> str:
        settings = get_settings()
        base_url = (settings.ollama_url or "").rstrip("/")
        model = (settings.ollama_model or "llama3").strip() or "llama3"
        if not base_url:
            return "Local AI is unavailable because OLLAMA_URL is not configured."

        payload = {
            "model": model,
            "stream": False,
            "prompt": f"{TRIAGE_SYSTEM_PROMPT}\n\nUser message:\n{prompt.strip()}",
        }
        timeout_seconds = float(max(10, settings.ai_timeout_chat_seconds + 10))
        try:
            async with httpx.AsyncClient(timeout=timeout_seconds) as client:
                resp = await client.post(f"{base_url}/api/generate", json=payload)
                resp.raise_for_status()
                data = resp.json()
        except Exception as exc:
            return (
                "Local AI is unavailable right now. "
                f"Ollama request failed: {type(exc).__name__}"
            )

        text = str(data.get("response") or "").strip()
        if text:
            return text
        try:
            return json.dumps(data)[:1000]
        except Exception:
            return "Local AI returned an empty response."
