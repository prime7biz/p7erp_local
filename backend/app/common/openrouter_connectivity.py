"""Lightweight OpenRouter reachability (GET /models) — avoids paid chat/completions for 'connection check' escalations."""

from __future__ import annotations

import logging
from typing import Final

import httpx

from app.common.httpx_openrouter_retry import get_with_429_retry
from app.config import get_settings

logger = logging.getLogger(__name__)

# Names seen from assistants / MCP when users ask to verify OpenRouter (not real ERP commit tools).
_OPENROUTER_PING_TOOL_NAMES: Final[frozenset[str]] = frozenset(
    {
        "check_openrouter_connection",
        "openrouter_connection",
        "get_open_router_connection",
        "get_openrouter_connection",
        "verify_openrouter_connection",
        "openrouter_health",
    }
)


def is_openrouter_connection_escalation_tool(name: str | None) -> bool:
    key = (name or "").strip().lower().replace("-", "_")
    return key in _OPENROUTER_PING_TOOL_NAMES


async def probe_openrouter_connectivity() -> str:
    """
    Call OpenRouter GET /models with the configured API key.

    Used instead of chat/completions when the escalation tool is a synthetic 'connection check',
    which would otherwise send a huge message history and hit 429 on free tiers.
    """
    s = get_settings()
    if not getattr(s, "openrouter_enabled", True):
        return "OpenRouter is disabled (OPENROUTER_ENABLED=false). Enable it or use local Ollama for tier-1."
    key = (s.openrouter_api_key or "").strip()
    if not key:
        return "OpenRouter API key is not set (OPENROUTER_API_KEY). Add a key from https://openrouter.ai/keys"
    base = (s.openrouter_base_url or "https://openrouter.ai/api/v1").strip().rstrip("/")
    model = (s.openrouter_model or "").strip() or "(not set)"
    url = f"{base}/models"
    headers: dict[str, str] = {"Authorization": f"Bearer {key}"}
    site = (s.openrouter_site_url or s.frontend_url or "").strip()
    if site:
        headers["HTTP-Referer"] = site
    title = (s.openrouter_app_name or "P7 ERP").strip()
    if title:
        headers["X-Title"] = title
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await get_with_429_retry(
                client,
                url,
                headers=headers,
                max_attempts=6,
                log_feature="openrouter_models_probe",
            )
    except Exception as exc:
        logger.warning("openrouter_probe_failed", extra={"exc_type": type(exc).__name__})
        return f"OpenRouter connectivity check failed: {type(exc).__name__}: {exc}"

    if resp.status_code == 200:
        return (
            f"OpenRouter is reachable (GET /models HTTP 200). "
            f"Configured tier-1 model slug: {model}. "
            "Chat/completions was not called for this check, so free-tier chat rate limits do not apply here."
        )
    if resp.status_code == 401:
        return "OpenRouter rejected the API key (HTTP 401). Create or rotate a key at https://openrouter.ai/keys"
    if resp.status_code == 429:
        return (
            "OpenRouter returned HTTP 429 even for GET /models after retries. "
            "Your account or IP may be heavily throttled—wait several minutes, add credits, or contact OpenRouter support."
        )
    snippet = (resp.text or "")[:240].replace("\n", " ")
    return f"OpenRouter GET /models returned HTTP {resp.status_code}. Body prefix: {snippet}"
