"""Non-sensitive tenant metadata for external LLM system prompts."""

from __future__ import annotations

from app.models import Tenant


def build_tenant_system_prompt_line(tenant: Tenant) -> str:
    """Short business-context line for cloud models (no customer PII)."""
    flags = tenant.feature_flags or {}
    trade = flags.get("trade_enabled")
    comm = tenant.default_commission_mode
    comm_s = getattr(comm, "value", comm) if comm is not None else "unspecified"
    parts = [
        "You are assisting a P7 ERP tenant.",
        f"tenant_type={tenant.tenant_type.value}",
        f"base_currency={tenant.base_currency}",
        f"default_commission_mode={comm_s}",
        f"allow_negative_stock={tenant.allow_negative_stock}",
    ]
    if trade is not None:
        parts.append(f"trade_enabled={trade}")
    if tenant.country_code:
        parts.append(f"country_code={tenant.country_code}")
    return " ".join(parts)
