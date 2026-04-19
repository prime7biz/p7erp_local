from __future__ import annotations

import json
import logging
from typing import Any

import httpx

from app.common.httpx_openrouter_retry import post_chat_completions_with_429_retry
from app.config import get_settings
from app.modules.ai_tool.escalation_shortcuts import maybe_lightweight_paid_escalation
from app.modules.ai_tool.llm_provider.base import BaseLlmProvider
from app.modules.ai_tool.llm_provider.openrouter_client import parse_openai_compatible_usage
from app.modules.ai_tool.llm_provider.prompt_sanitizer import clamp_text_for_llm, redact_pii_for_external_provider
from app.modules.mcp_server import call_registered_tool, get_registered_tools

logger = logging.getLogger(__name__)


def _sanitize_conv(
    conversation: list[dict[str, str]],
    *,
    max_chars_per_message: int,
) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for x in conversation:
        c = x.get("content") or ""
        c = redact_pii_for_external_provider(str(c))
        c = clamp_text_for_llm(c, max_chars=max_chars_per_message)
        role = x.get("role", "user")
        out.append({"role": str(role), "content": c})
    return out


class PaidLlmProvider(BaseLlmProvider):
    """Tier-2 paid provider (OpenAI-compatible, OpenRouter, or Anthropic)."""

    async def generate(self, prompt: str) -> str:
        # Backward-compatible thin wrapper.
        return await self.generate_with_mcp_loop(
            conversation=[{"role": "user", "content": prompt}],
            tenant_id=1,
            requested_tool=None,
            tenant_system_prefix=None,
        )

    async def generate_with_mcp_loop(
        self,
        *,
        conversation: list[dict[str, str]],
        tenant_id: int,
        requested_tool: str | None,
        tenant_system_prefix: str | None = None,
    ) -> str:
        if requested_tool:
            lite = await maybe_lightweight_paid_escalation(requested_tool)
            if lite is not None:
                return lite
        settings = get_settings()
        provider = (settings.paid_llm_provider or "").strip().lower()
        if not provider and (settings.openrouter_api_key or "").strip():
            provider = "openrouter"
        # Docs sometimes use PAID_LLM_PROVIDER=openai with OpenRouter URL + key; if base URL is empty,
        # the code would default to api.openai.com. Prefer OpenRouter when tier-1 keys exist.
        if provider == "openai" and not (settings.paid_llm_base_url or "").strip():
            if (settings.openrouter_api_key or "").strip() and (settings.openrouter_model or "").strip():
                provider = "openrouter"
        api_key = (settings.paid_llm_api_key or "").strip()
        model = (settings.paid_llm_model or "").strip()
        tools = get_registered_tools()

        if provider == "openrouter":
            s = get_settings()
            or_key = (s.openrouter_api_key or s.paid_llm_api_key or "").strip()
            or_model = (s.paid_llm_model or s.openrouter_model or "").strip()
            if not or_key or not or_model:
                return (
                    "Paid AI (OpenRouter) is not configured. Set OPENROUTER_API_KEY and OPENROUTER_MODEL "
                    "(or PAID_LLM_API_KEY / PAID_LLM_MODEL) with PAID_LLM_PROVIDER=openrouter."
                )
            base = (s.openrouter_base_url or "https://openrouter.ai/api/v1").strip().rstrip("/")
            extra: dict[str, str] = {}
            site = (s.openrouter_site_url or s.frontend_url or "").strip()
            if site:
                extra["HTTP-Referer"] = site
            if (s.openrouter_app_name or "").strip():
                extra["X-Title"] = s.openrouter_app_name.strip()
            return await self._generate_openai_with_tool_loop(
                conversation=conversation,
                model=or_model,
                api_key=or_key,
                tenant_id=tenant_id,
                tools=tools,
                requested_tool=requested_tool,
                chat_url=f"{base}/chat/completions",
                extra_headers=extra or None,
                tenant_system_prefix=tenant_system_prefix,
                error_label="OpenRouter",
            )

        if not provider or not api_key or not model:
            return (
                "Paid AI is not configured. Set PAID_LLM_PROVIDER, "
                "PAID_LLM_API_KEY, and PAID_LLM_MODEL."
            )
        if provider == "openai":
            s = get_settings()
            base = (s.paid_llm_base_url or "").strip().rstrip("/")
            chat_url = f"{base}/chat/completions" if base else None
            extra: dict[str, str] | None = None
            if base and "openrouter" in base.lower():
                extra = {}
                site = (s.openrouter_site_url or s.frontend_url or "").strip()
                if site:
                    extra["HTTP-Referer"] = site
                if (s.openrouter_app_name or "").strip():
                    extra["X-Title"] = s.openrouter_app_name.strip()
                if not extra:
                    extra = None
            label = "OpenRouter" if base and "openrouter" in base.lower() else "OpenAI"
            return await self._generate_openai_with_tool_loop(
                conversation=conversation,
                model=model,
                api_key=api_key,
                tenant_id=tenant_id,
                tools=tools,
                requested_tool=requested_tool,
                chat_url=chat_url,
                extra_headers=extra,
                tenant_system_prefix=tenant_system_prefix,
                error_label=label,
            )
        if provider == "anthropic":
            return await self._generate_anthropic_with_tool_loop(
                conversation=conversation,
                model=model,
                api_key=api_key,
                tenant_id=tenant_id,
                tools=tools,
                requested_tool=requested_tool,
                tenant_system_prefix=tenant_system_prefix,
            )
        return "Paid AI provider is not supported. Use 'openai', 'openrouter', or 'anthropic'."

    async def _generate_openai_with_tool_loop(
        self,
        *,
        conversation: list[dict[str, str]],
        model: str,
        api_key: str,
        tenant_id: int,
        tools: list[dict[str, Any]],
        requested_tool: str | None,
        chat_url: str | None = None,
        extra_headers: dict[str, str] | None = None,
        tenant_system_prefix: str | None = None,
        error_label: str = "OpenAI-compatible",
    ) -> str:
        settings = get_settings()
        max_tok = max(256, min(32_000, int(getattr(settings, "ai_max_tokens_per_request", 4096) or 4096)))
        max_chars = min(120_000, max_tok * 8)
        conv = _sanitize_conv(conversation, max_chars_per_message=max_chars)
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
        valid_tool_names = {t["name"] for t in tools}
        tool_choice: str | dict[str, Any] = "auto"
        # Tier-1 may hallucinate names like "system_resource_audit". Forcing a non-existent
        # function breaks OpenAI-compatible APIs (empty/failed completion). Only pin tool_choice
        # when the name is actually registered.
        req = (requested_tool or "").strip()
        if req and req in valid_tool_names:
            tool_choice = {"type": "function", "function": {"name": req}}
        sys_prefix = (tenant_system_prefix or "").strip()
        if sys_prefix:
            sys_prefix = sys_prefix + "\n\n"
        messages: list[dict[str, Any]] = [
            {
                "role": "system",
                "content": (
                    sys_prefix
                    + "You are a paid ERP execution assistant. "
                    + "Use tools when needed, then return clear final text."
                ),
            }
        ]
        messages.extend(
            {"role": x.get("role", "user"), "content": x.get("content", "")}
            for x in conv
            if x.get("content")
        )

        url = (chat_url or "https://api.openai.com/v1/chat/completions").strip()
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        if extra_headers:
            headers.update(extra_headers)
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                for _ in range(6):
                    body = {
                        "model": model,
                        "temperature": 0.2,
                        "max_tokens": max_tok,
                        "messages": messages,
                        "tools": openai_tools,
                        "tool_choice": tool_choice,
                    }
                    resp = await post_chat_completions_with_429_retry(
                        client,
                        url,
                        json=body,
                        headers=headers,
                        max_attempts=5,
                        log_feature="paid_mcp",
                    )
                    resp.raise_for_status()
                    data = resp.json()
                    msg = data["choices"][0]["message"]
                    tool_calls = msg.get("tool_calls") or []
                    if not tool_calls:
                        out = str(msg.get("content") or "").strip() or "Paid AI returned no text."
                        if error_label == "OpenRouter" or ("openrouter" in (url or "").lower()):
                            pt, ct, tt = parse_openai_compatible_usage(data)
                            logger.info(
                                "openrouter_chat_completion",
                                extra={
                                    "model": model,
                                    "feature": "paid_mcp",
                                    "prompt_tokens": pt,
                                    "completion_tokens": ct,
                                    "total_tokens": tt,
                                    "ok": bool(out and "returned no text" not in out.lower()),
                                },
                            )
                        return out
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
            detail = type(exc).__name__
            if isinstance(exc, httpx.HTTPStatusError):
                code = exc.response.status_code
                detail = f"{type(exc).__name__} {code}"
                if code == 429:
                    detail += (
                        " — OpenRouter rate limit or quota (common on :free models and Grok). "
                        "Wait a few minutes, add credits, set a single OPENROUTER_MODEL in .env, "
                        "or use OPENROUTER_TIER1_PREFERRED=false to prefer local Ollama."
                    )
            return f"Paid AI ({error_label}) call failed: {detail}"

    async def _generate_anthropic_with_tool_loop(
        self,
        *,
        conversation: list[dict[str, str]],
        model: str,
        api_key: str,
        tenant_id: int,
        tools: list[dict[str, Any]],
        requested_tool: str | None,
        tenant_system_prefix: str | None = None,
    ) -> str:
        settings = get_settings()
        max_tok = max(256, min(8192, int(getattr(settings, "ai_max_tokens_per_request", 4096) or 4096)))
        max_chars = min(120_000, max_tok * 8)
        conv = _sanitize_conv(conversation, max_chars_per_message=max_chars)
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
            for x in conv
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
                    sys_line = "You are a paid ERP execution assistant. Use tools when needed, then answer clearly."
                    if (tenant_system_prefix or "").strip():
                        sys_line = (tenant_system_prefix or "").strip() + "\n\n" + sys_line
                    body = {
                        "model": model,
                        "max_tokens": max_tok,
                        "temperature": 0.2,
                        "system": sys_line,
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
