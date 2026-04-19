"""Shared OpenRouter HTTP client (OpenAI-compatible chat/completions)."""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

import httpx

from app.common.httpx_openrouter_retry import post_chat_completions_with_429_retry
from app.config import get_settings

logger = logging.getLogger(__name__)


def parse_openai_compatible_usage(data: dict[str, Any]) -> tuple[int | None, int | None, int | None]:
    u = data.get("usage")
    if not isinstance(u, dict):
        return None, None, None
    pt, ct, tt = u.get("prompt_tokens"), u.get("completion_tokens"), u.get("total_tokens")
    try:
        return (
            int(pt) if pt is not None else None,
            int(ct) if ct is not None else None,
            int(tt) if tt is not None else None,
        )
    except (TypeError, ValueError):
        return None, None, None


def message_text_from_chat_response(data: dict[str, Any]) -> str | None:
    try:
        choices = data.get("choices") or []
        if not choices:
            return None
        msg = choices[0].get("message") or {}
        content = msg.get("content")
        if content is None:
            return None
        out = str(content).strip()
        return out or None
    except (KeyError, TypeError, IndexError):
        return None


@dataclass
class OpenRouterChatResult:
    text: str | None
    model: str | None
    prompt_tokens: int | None
    completion_tokens: int | None
    total_tokens: int | None
    error: str | None
    latency_ms: int


async def openrouter_chat_completion(
    *,
    messages: list[dict[str, Any]],
    temperature: float = 0.2,
    max_tokens: int | None = None,
    model_override: str | None = None,
    log_context: dict[str, Any] | None = None,
) -> OpenRouterChatResult:
    """POST /chat/completions to OpenRouter. Logs structured `openrouter_chat_completion` on success."""
    s = get_settings()
    api_key = (s.openrouter_api_key or "").strip()
    model = (model_override or s.openrouter_model or "").strip()
    base = (s.openrouter_base_url or "https://openrouter.ai/api/v1").strip().rstrip("/")
    t0 = time.perf_counter()
    if not api_key or not model:
        return OpenRouterChatResult(None, None, None, None, None, "not_configured", 0)

    url = f"{base}/chat/completions"
    timeout = float(max(15, s.ai_timeout_chat_seconds + 15))
    headers: dict[str, str] = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    site = (s.openrouter_site_url or s.frontend_url or "").strip()
    if site:
        headers["HTTP-Referer"] = site
    title = (s.openrouter_app_name or "P7 ERP").strip()
    if title:
        headers["X-Title"] = title

    if max_tokens is None:
        max_tokens = max(256, min(32_000, int(getattr(s, "ai_max_tokens_per_request", 4096) or 4096)))

    body: dict[str, Any] = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": messages,
    }
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            log_feat = "tier1"
            if isinstance(log_context, dict) and log_context.get("feature"):
                log_feat = str(log_context["feature"])
            resp = await post_chat_completions_with_429_retry(
                client,
                url,
                json=body,
                headers=headers,
                max_attempts=5,
                log_feature=log_feat,
            )
            resp.raise_for_status()
            data = resp.json()
    except Exception as exc:
        latency_ms = int((time.perf_counter() - t0) * 1000)
        logger.warning(
            "openrouter_request_failed",
            extra={
                "model": model,
                "latency_ms": latency_ms,
                "exc_type": type(exc).__name__,
                **(log_context or {}),
            },
        )
        return OpenRouterChatResult(None, model, None, None, None, f"{type(exc).__name__}: {exc}", latency_ms)

    latency_ms = int((time.perf_counter() - t0) * 1000)
    pt, ct, tt = parse_openai_compatible_usage(data)
    text = message_text_from_chat_response(data)
    logger.info(
        "openrouter_chat_completion",
        extra={
            "model": model,
            "latency_ms": latency_ms,
            "prompt_tokens": pt,
            "completion_tokens": ct,
            "total_tokens": tt,
            "ok": bool(text and len(text) > 5),
            **(log_context or {}),
        },
    )
    return OpenRouterChatResult(
        text=text,
        model=model,
        prompt_tokens=pt,
        completion_tokens=ct,
        total_tokens=tt,
        error=None,
        latency_ms=latency_ms,
    )


async def openrouter_generate_text(
    prompt: str,
    *,
    log_feature: str | None = None,
    temperature: float = 0.2,
) -> OpenRouterChatResult:
    ctx = {"feature": log_feature} if log_feature else {}
    messages: list[dict[str, Any]] = [{"role": "user", "content": prompt.strip()[:120000]}]
    return await openrouter_chat_completion(messages=messages, temperature=temperature, log_context=ctx)
