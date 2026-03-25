"""Platform admin UI/API capability flags (aligned with FastAPI role dependencies).

Each key mirrors what the frontend should show; backend routes still enforce roles via Depends(...).
"""

from __future__ import annotations

# Stable keys consumed by frontend-admin (keep in sync with frontend `auth/permissions.ts`).
CAPABILITY_KEYS: tuple[str, ...] = (
    "dashboard",
    "tenants.view",
    "tenants.create",
    "tenants.manage",
    "tenant_users",
    "tenant_support",
    "billing.view",
    "billing.manage_plans",
    "billing.manage_billing",
    "operations.backups",
    "operations.background_jobs",
    "operations.restore",
    "operations.ai",
    "operations.ai_manage",
    "support.announcements",
    "support.tickets",
    "monitoring.tenant_audit",
    "monitoring.audit_export",
    "monitoring.admin_audit",
    "monitoring.health_basic",
    "monitoring.health_advanced",
    "monitoring.usage",
    "security.admins",
    "security.sessions",
    "security.rate_limits",
    "security.impersonation",
    "config.settings_read",
    "config.settings_write",
    "config.feature_flags",
)


def compute_capabilities(role: str) -> dict[str, bool]:
    """Derive capability map from platform_admins.role (see auth.require_admin_roles)."""
    is_super = role == "super_admin"
    is_billing = role == "billing_admin"
    is_support = role == "support_agent"

    return {
        "dashboard": True,
        "tenants.view": True,
        "tenants.create": is_super,
        "tenants.manage": is_super,
        "tenant_users": is_super or is_support,
        "tenant_support": is_super or is_support,
        "billing.view": is_super or is_billing,
        "billing.manage_plans": is_super,
        "billing.manage_billing": is_super or is_billing,
        "operations.backups": is_super,
        "operations.background_jobs": True,
        "operations.restore": is_super,
        "operations.ai": True,
        "operations.ai_manage": is_super,
        "support.announcements": is_super,
        "support.tickets": is_super or is_support,
        "monitoring.tenant_audit": True,
        "monitoring.audit_export": is_super,
        "monitoring.admin_audit": is_super,
        "monitoring.health_basic": True,
        "monitoring.health_advanced": is_super,
        "monitoring.usage": True,
        "security.admins": is_super,
        "security.sessions": is_super,
        "security.rate_limits": is_super,
        "security.impersonation": is_super,
        "config.settings_read": True,
        "config.settings_write": is_super,
        "config.feature_flags": is_super,
    }
