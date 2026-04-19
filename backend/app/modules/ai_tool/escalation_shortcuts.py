"""Paid escalation paths that should not call cloud chat/completions (avoid OpenRouter 429 on huge sessions)."""

from __future__ import annotations

from typing import Final

from app.common.openrouter_connectivity import is_openrouter_connection_escalation_tool, probe_openrouter_connectivity
from app.config import get_settings

# Synthetic tools (assistant / MCP) for "what are my settings?" — not ERP commit tools.
_SYSTEM_SETTINGS_TOOL_NAMES: Final[frozenset[str]] = frozenset(
    {
        "system_setup",
        "application_settings",
        "critical_application_settings",
        "critical_settings_check",
        "environment_check",
    }
)


def is_system_settings_escalation_tool(name: str | None) -> bool:
    return (name or "").strip().lower().replace("-", "_") in _SYSTEM_SETTINGS_TOOL_NAMES


def _secret_state(value: str | None) -> str:
    return "(configured)" if (value or "").strip() else "(not set)"


def summarize_critical_application_settings() -> str:
    """Deterministic summary for operators; no OpenRouter round-trip."""
    s = get_settings()
    lines = [
        "Critical application settings (from server environment; secret values are not printed):",
        f"- APP_ENV: {s.app_env}",
        f"- API prefix: {s.api_v1_prefix}",
        f"- JWT_SECRET: {_secret_state(s.jwt_secret)}",
        f"- DATABASE_URL: {_secret_state(s.database_url)}",
        f"- REDIS_URL: {_secret_state(s.redis_url)}",
        f"- Tenant API rate limit (middleware): {s.tenant_rate_limit_requests_per_minute} req/min per tenant (0 disables)",
        "",
        "AI / LLM:",
        f"- AI_MAX_REQUESTS_PER_TENANT_PER_DAY: {s.ai_max_requests_per_tenant_per_day} (0 = unlimited; this is ERP-side, not OpenRouter)",
        f"- AI_MAX_TOKENS_PER_REQUEST: {s.ai_max_tokens_per_request}",
        f"- AI rate limit window: {s.ai_rate_limit_window_seconds}s (chat/heavy caps in config)",
        f"- OPENROUTER_ENABLED: {s.openrouter_enabled}",
        f"- OPENROUTER_API_KEY: {_secret_state(s.openrouter_api_key)}",
        f"- OPENROUTER_MODEL: {(s.openrouter_model or '').strip() or '(not set)'}",
        f"- OPENROUTER_TIER1_PREFERRED: {getattr(s, 'openrouter_tier1_preferred', False)}",
        f"- OPENROUTER_TENANT_TEXT_ENABLED: {getattr(s, 'openrouter_tenant_text_enabled', False)}",
        f"- OLLAMA_ENABLED: {s.ollama_enabled}",
        f"- OLLAMA_URL: {(s.ollama_url or '').strip() or '(not set)'}",
        f"- OLLAMA_MODEL: {(s.ollama_model or '').strip() or '(not set)'}",
        f"- GEMINI_ENABLED: {getattr(s, 'gemini_enabled', False)}",
        f"- GEMINI_API_KEY: {_secret_state(getattr(s, 'gemini_api_key', '') or '')}",
        f"- MCP_ENABLED: {getattr(s, 'mcp_enabled', False)}",
        "",
        "If you saw HTTP 429 from OpenRouter on other tools, that is OpenRouter’s throttle/credits — not the ERP daily cap above. "
        "Use a non-:free model with credits or OPENROUTER_TIER1_PREFERRED=false (see docs/OPENROUTER.md).",
    ]
    return "\n".join(lines)


async def maybe_lightweight_paid_escalation(requested_tool: str | None) -> str | None:
    """Return a string to use instead of paid chat, or None to continue with the LLM."""
    if not requested_tool:
        return None
    if is_openrouter_connection_escalation_tool(requested_tool):
        return await probe_openrouter_connectivity()
    if is_system_settings_escalation_tool(requested_tool):
        return summarize_critical_application_settings()
    return None
