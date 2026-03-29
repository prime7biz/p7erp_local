from __future__ import annotations

import json
from typing import Any

import httpx

from app.config import get_settings
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider
from app.modules.mcp_server import call_registered_tool, get_registered_tools


class PaidLlmProvider(BaseLlmProvider):
    """Tier-2 paid provider (OpenAI or Anthropic)."""

    async def generate(self, prompt: str) -> str:
        # Backward-compatible thin wrapper.
        return await self.generate_with_mcp_loop(
            conversation=[{"role": "user", "content": prompt}],
            tenant_id=1,
            requested_tool=None,
        )

    async def generate_with_mcp_loop(
        self,
        *,
        conversation: list[dict[str, str]],
        tenant_id: int,
        requested_tool: str | None,
    ) -> str:
        settings = get_settings()
        provider = (settings.paid_llm_provider or "").strip().lower()
        api_key = (settings.paid_llm_api_key or "").strip()
        model = (settings.paid_llm_model or "").strip()
        tools = get_registered_tools()

        if not provider or not api_key or not model:
            return (
                "Paid AI is not configured. Set PAID_LLM_PROVIDER, "
                "PAID_LLM_API_KEY, and PAID_LLM_MODEL."
            )
        if provider == "openai":
            return await self._generate_openai_with_tool_loop(
                conversation=conversation,
                model=model,
                api_key=api_key,
                tenant_id=tenant_id,
                tools=tools,
                requested_tool=requested_tool,
            )
        if provider == "anthropic":
            return await self._generate_anthropic_with_tool_loop(
                conversation=conversation,
                model=model,
                api_key=api_key,
                tenant_id=tenant_id,
                tools=tools,
                requested_tool=requested_tool,
            )
        return "Paid AI provider is not supported. Use 'openai' or 'anthropic'."

    async def _generate_openai_with_tool_loop(
        self,
        *,
        conversation: list[dict[str, str]],
        model: str,
        api_key: str,
        tenant_id: int,
        tools: list[dict[str, Any]],
        requested_tool: str | None,
    ) -> str:
        openai_tools = [
            {
                "type": "function",
                "function": {
                    "name": t["name"],
                    "description": t.get("description", ""),
                    "parameters": t["input_schema"],
                },
            }
            for t in tools
        ]
        tool_choice: str | dict[str, Any] = "auto"
        if requested_tool:
            tool_choice = {"type": "function", "function": {"name": requested_tool}}
        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": (
                    "You are a paid ERP execution assistant. "
                    "Use tools when needed, then return clear final text."
                ),
            }
        ]
        messages.extend(
            {"role": x.get("role", "user"), "content": x.get("content", "")}
            for x in conversation
            if x.get("content")
        )

        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                for _ in range(6):
                    body = {
                        "model": model,
                        "temperature": 0.2,
                        "messages": messages,
                        "tools": openai_tools,
                        "tool_choice": tool_choice,
                    }
                    resp = await client.post("https://api.openai.com/v1/chat/completions", json=body, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    msg = data["choices"][0]["message"]
                    tool_calls = msg.get("tool_calls") or []
                    if not tool_calls:
                        return str(msg.get("content") or "").strip() or "Paid AI returned no text."
                    messages.append(msg)
                    for call in tool_calls:
                        fname = call["function"]["name"]
                        raw_args = call["function"].get("arguments") or "{}"
                        args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                        if "tenant_id" not in args:
                            args["tenant_id"] = tenant_id
                        tool_result = await call_registered_tool(fname, args, context_tenant_id=tenant_id)
                        messages.append(
                            {
                                "role": "tool",
                                "tool_call_id": call["id"],
                                "content": json.dumps(tool_result, default=str),
                            }
                        )
                return "Paid AI reached tool-call iteration limit."
        except Exception as exc:
            return f"Paid AI (OpenAI) call failed: {type(exc).__name__}"

    async def _generate_anthropic_with_tool_loop(
        self,
        *,
        conversation: list[dict[str, str]],
        model: str,
        api_key: str,
        tenant_id: int,
        tools: list[dict[str, Any]],
        requested_tool: str | None,
    ) -> str:
        anthropic_tools = [
            {
                "name": t["name"],
                "description": t.get("description", ""),
                "input_schema": t["input_schema"],
            }
            for t in tools
            if not requested_tool or t["name"] == requested_tool
        ]
        messages: list[dict[str, Any]] = [
            {
                "role": x.get("role", "user"),
                "content": x.get("content", ""),
            }
            for x in conversation
            if x.get("content")
        ]
        headers = {
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                for _ in range(6):
                    body = {
                        "model": model,
                        "max_tokens": 800,
                        "temperature": 0.2,
                        "system": "You are a paid ERP execution assistant. Use tools when needed, then answer clearly.",
                        "messages": messages,
                        "tools": anthropic_tools,
                    }
                    resp = await client.post("https://api.anthropic.com/v1/messages", json=body, headers=headers)
                    resp.raise_for_status()
                    data = resp.json()
                    blocks = data.get("content") or []
                    tool_uses = [b for b in blocks if isinstance(b, dict) and b.get("type") == "tool_use"]
                    if not tool_uses:
                        text_blocks = [b.get("text", "") for b in blocks if isinstance(b, dict) and b.get("type") == "text"]
                        return "\n".join(x for x in text_blocks if x).strip() or "Paid AI returned no text."

                    messages.append({"role": "assistant", "content": blocks})
                    tool_results_blocks = []
                    for b in tool_uses:
                        fname = str(b.get("name") or "")
                        args = b.get("input") or {}
                        if "tenant_id" not in args:
                            args["tenant_id"] = tenant_id
                        tool_result = await call_registered_tool(fname, args, context_tenant_id=tenant_id)
                        tool_results_blocks.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": b.get("id"),
                                "content": json.dumps(tool_result, default=str),
                            }
                        )
                    messages.append({"role": "user", "content": tool_results_blocks})
                return "Paid AI reached tool-call iteration limit."
        except Exception as exc:
            return f"Paid AI (Anthropic) call failed: {type(exc).__name__}"
