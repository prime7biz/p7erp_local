import { Link, Outlet, useLocation } from "react-router-dom";

/** Settings overview is `/app/settings` only — deeper paths must not highlight it. */
function isSettingsNavActive(pathname: string, to: string) {
  const norm = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  if (to === "/app/settings") {
    return norm === "/app/settings";
  }
  return norm === to || norm.startsWith(`${to}/`);
}

const links = [
  { to: "/app/settings", label: "Overview" },
  { to: "/app/settings/config", label: "Configuration" },
  { to: "/app/settings/users", label: "Users" },
  { to: "/app/settings/roles", label: "Roles" },
  { to: "/app/settings/tenant", label: "Tenant" },
  { to: "/app/settings/currency", label: "Currency" },
  { to: "/app/accounts/accounting-periods", label: "Accounting periods" },
  { to: "/app/settings/pricing", label: "Pricing" },
  { to: "/app/settings/audit", label: "Audit" },
  { to: "/app/settings/external-access", label: "External access" },
  { to: "/app/settings/activity-logs", label: "Activity logs" },
  { to: "/app/settings/backup", label: "Backup & Restore" },
  { to: "/app/settings/statutory-compliance", label: "Statutory compliance" },
  { to: "/app/settings/data-import", label: "Data import" },
  { to: "/app/settings/bulk-tenant-onboarding", label: "Bulk tenant onboarding" },
  { to: "/app/settings/cheque-templates", label: "Cheque templates" },
];

export function SettingsLayout() {
  const location = useLocation();
  return (
    <div className="min-w-0 space-y-4">
      <h1 className="text-xl font-semibold tracking-tight text-text-primary">Settings</h1>
      <nav
        className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border-subtle pb-2"
        aria-label="Settings sections"
      >
        {links.map(({ to, label }) => {
          const active = isSettingsNavActive(location.pathname, to);
          return (
            <Link
              key={to}
              to={to}
              className={`text-sm no-underline transition-colors ${
                active
                  ? "font-semibold text-text-primary"
                  : "font-normal text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}
