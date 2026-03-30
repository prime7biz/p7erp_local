"""Feature flags for ERP AI Phases 14–20 (global env + optional tenant.feature_flags override)."""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException, status

_FLAG_KEYS = {
    "production_planning_ai_enhanced": "production_planning_ai_enhanced_enabled",
    "tna_followup_ai": "tna_followup_ai_enabled",
    "document_ai_validation": "document_ai_validation_enabled",
    "finance_ai_readonly": "finance_ai_readonly_enabled",
    "executive_ai_dashboard": "executive_ai_dashboard_enabled",
    "ai_copilot_readonly": "ai_copilot_readonly_enabled",
    "ai_controlled_automation": "ai_controlled_automation_enabled",
}

_SETTINGS_ATTR = {
    "production_planning_ai_enhanced": "production_planning_ai_enhanced_enabled",
    "tna_followup_ai": "tna_followup_ai_enabled",
    "document_ai_validation": "document_ai_validation_enabled",
    "finance_ai_readonly": "finance_ai_readonly_enabled",
    "executive_ai_dashboard": "executive_ai_dashboard_enabled",
    "ai_copilot_readonly": "ai_copilot_readonly_enabled",
    "ai_controlled_automation": "ai_controlled_automation_enabled",
}

_DISABLED_CODES = {
    "production_planning_ai_enhanced": "PRODUCTION_PLANNING_AI_ENHANCED_DISABLED",
    "tna_followup_ai": "TNA_FOLLOWUP_AI_DISABLED",
    "document_ai_validation": "DOCUMENT_AI_VALIDATION_DISABLED",
    "finance_ai_readonly": "FINANCE_AI_READONLY_DISABLED",
    "executive_ai_dashboard": "EXECUTIVE_AI_DASHBOARD_DISABLED",
    "ai_copilot_readonly": "AI_COPILOT_READONLY_DISABLED",
    "ai_controlled_automation": "AI_CONTROLLED_AUTOMATION_DISABLED",
}


def _global_on(phase_key: str) -> bool:
    from app.config import get_settings

    attr = _SETTINGS_ATTR[phase_key]
    return bool(getattr(get_settings(), attr))


def _tenant_allows(phase_key: str, tenant: Any | None) -> bool | None:
    raw = getattr(tenant, "feature_flags", None) if tenant is not None else None
    if not isinstance(raw, dict):
        return None
    fk = _FLAG_KEYS[phase_key]
    if fk not in raw:
        return None
    return bool(raw[fk])


def is_phase_enabled(phase_key: str, *, tenant: Any | None) -> bool:
    if phase_key not in _FLAG_KEYS:
        raise ValueError(f"unknown phase_key: {phase_key}")
    if not _global_on(phase_key):
        return False
    t = _tenant_allows(phase_key, tenant)
    if t is not None:
        return t
    return True


def require_phase(phase_key: str, *, tenant: Any) -> None:
    if is_phase_enabled(phase_key, tenant=tenant):
        return
    code = _DISABLED_CODES[phase_key]
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail={
            "code": code,
            "message": "This AI capability is disabled globally or for this tenant.",
        },
    )
