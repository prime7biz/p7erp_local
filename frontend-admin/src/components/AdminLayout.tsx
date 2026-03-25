import { useCallback, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { useAdminAuth } from "@/context/AdminAuthContext";
import type { AdminCapability } from "@/auth/permissions";

type NavItem = { to: string; label: string; end?: boolean; cap?: AdminCapability };

const navSections: { section: string; items: NavItem[] }[] = [
  { section: "Overview", items: [{ to: "/", label: "Dashboard", end: true, cap: "dashboard" }] },
  {
    section: "Tenants",
    items: [
      { to: "/tenants", label: "All tenants", cap: "tenants.view" },
      { to: "/tenants/new", label: "Create tenant", cap: "tenants.create" },
    ],
  },
  {
    section: "Billing & revenue",
    items: [
      { to: "/billing/plans", label: "Plans", cap: "billing.view" },
      { to: "/billing/subscriptions", label: "Subscriptions", cap: "billing.view" },
      { to: "/billing/invoices", label: "Invoices", cap: "billing.view" },
      { to: "/billing/payments", label: "Payments", cap: "billing.view" },
      { to: "/billing/revenue", label: "Revenue", cap: "billing.view" },
    ],
  },
  {
    section: "Operations",
    items: [
      { to: "/operations/backups", label: "Backup center", cap: "operations.backups" },
      { to: "/operations/jobs", label: "Background jobs", cap: "operations.background_jobs" },
      { to: "/operations/restore", label: "Restore center", cap: "operations.restore" },
      { to: "/operations/ai", label: "AI operations", cap: "operations.ai" },
    ],
  },
  {
    section: "Support",
    items: [
      { to: "/support/announcements", label: "Announcements", cap: "support.announcements" },
      { to: "/support/tickets", label: "Support tickets", cap: "support.tickets" },
    ],
  },
  {
    section: "Monitoring",
    items: [
      { to: "/monitoring/audit", label: "Audit log", cap: "monitoring.tenant_audit" },
      { to: "/monitoring/admin-audit", label: "Admin activity", cap: "monitoring.admin_audit" },
      { to: "/monitoring/health", label: "System health", cap: "monitoring.health_basic" },
      { to: "/monitoring/usage", label: "Usage trends", cap: "monitoring.usage" },
    ],
  },
  {
    section: "Security",
    items: [
      { to: "/security/admins", label: "Platform admins", cap: "security.admins" },
      { to: "/security/sessions", label: "Sessions", cap: "security.sessions" },
      { to: "/security/rate-limits", label: "Rate limits", cap: "security.rate_limits" },
      { to: "/security/impersonation", label: "Impersonation log", cap: "security.impersonation" },
    ],
  },
  {
    section: "Configuration",
    items: [
      { to: "/config/settings", label: "Platform settings", cap: "config.settings_read" },
      { to: "/config/feature-flags", label: "Feature flags", cap: "config.feature_flags" },
    ],
  },
];

export function AdminLayout() {
  const { me, logout, can } = useAdminAuth();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggleSection = useCallback((section: string) => {
    setCollapsed((prev) => ({ ...prev, [section]: !prev[section] }));
  }, []);

  return (
    <div className="h-screen flex bg-slate-50 overflow-hidden">
      <aside className="w-60 shrink-0 border-r border-slate-200/80 bg-white shadow-sm flex flex-col h-full min-h-0">
        <div className="shrink-0 p-5 border-b border-slate-100">
          <div className="text-xs font-semibold uppercase tracking-wider text-indigo-600">P7 ERP</div>
          <div className="font-bold text-slate-900 text-lg mt-0.5">Platform Admin</div>
        </div>
        <nav className="flex-1 min-h-0 overflow-y-auto admin-sidebar-scroll p-3 space-y-1">
          {navSections.map((group) => {
            const items = group.items.filter((n) => !n.cap || can(n.cap));
            if (items.length === 0) return null;
            const isCollapsed = collapsed[group.section];
            return (
              <div key={group.section} className="rounded-lg border border-transparent">
                <button
                  type="button"
                  onClick={() => toggleSection(group.section)}
                  className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wider text-slate-400 hover:bg-slate-50 hover:text-slate-500"
                  aria-expanded={!isCollapsed}
                >
                  <span>{group.section}</span>
                  <ChevronDown
                    className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${isCollapsed ? "-rotate-90" : ""}`}
                  />
                </button>
                {!isCollapsed && (
                  <div className="mt-1 flex flex-col gap-0.5 pl-0.5">
                    {items.map((n) => (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        end={n.end}
                        className={({ isActive }) =>
                          `rounded-lg px-3 py-2 text-sm transition-colors ${
                            isActive
                              ? "bg-indigo-50 font-medium text-indigo-900 border border-indigo-100"
                              : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                          }`
                        }
                      >
                        {n.label}
                      </NavLink>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="shrink-0 p-4 border-t border-slate-100 bg-slate-50/80">
          <div className="text-sm font-medium text-slate-800">{me?.username}</div>
          <div className="text-xs text-slate-500 mt-0.5 capitalize">{me?.role?.replace(/_/g, " ")}</div>
          <button
            type="button"
            className="mt-3 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0 min-h-0 overflow-y-auto p-6 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
