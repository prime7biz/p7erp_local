/**
 * Platform admin capabilities — must match backend `compute_capabilities` keys
 * (`backend/app/modules/admin/permissions.py`).
 */
export const ADMIN_CAPABILITIES = [
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
] as const;

export type AdminCapability = (typeof ADMIN_CAPABILITIES)[number];

/** Route path (relative to basename) → minimum capability to render the page. */
export const ROUTE_REQUIRED_CAPABILITY: Record<string, AdminCapability> = {
  "/": "dashboard",
  "/tenants": "tenants.view",
  "/tenants/new": "tenants.create",
  "/billing/plans": "billing.view",
  "/billing/plans/new": "billing.manage_plans",
  "/billing/subscriptions": "billing.view",
  "/billing/invoices": "billing.view",
  "/billing/payments": "billing.view",
  "/billing/revenue": "billing.view",
  "/operations/backups": "operations.backups",
  "/operations/jobs": "operations.background_jobs",
  "/operations/restore": "operations.restore",
  "/operations/ai": "operations.ai",
  "/support/announcements": "support.announcements",
  "/support/tickets": "support.tickets",
  "/monitoring/audit": "monitoring.tenant_audit",
  "/monitoring/admin-audit": "monitoring.admin_audit",
  "/monitoring/health": "monitoring.health_basic",
  "/monitoring/usage": "monitoring.usage",
  "/security/admins": "security.admins",
  "/security/sessions": "security.sessions",
  "/security/rate-limits": "security.rate_limits",
  "/security/impersonation": "security.impersonation",
  "/config/settings": "config.settings_read",
  "/config/feature-flags": "config.feature_flags",
};

export function capabilityForPath(pathname: string): AdminCapability | null {
  const normalized = pathname.replace(/\/$/, "") || "/";
  if (normalized.startsWith("/billing/plans/") && normalized.endsWith("/edit")) {
    return "billing.manage_plans";
  }
  if (/^\/support\/announcements\/\d+\/edit$/.test(normalized)) {
    return "support.announcements";
  }
  return ROUTE_REQUIRED_CAPABILITY[normalized] ?? null;
}
