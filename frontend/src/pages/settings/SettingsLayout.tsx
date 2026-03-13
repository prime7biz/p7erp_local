import { Link, Outlet, useLocation } from "react-router-dom";

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
  { to: "/app/settings/activity-logs", label: "Activity logs" },
  { to: "/app/settings/backup", label: "Backup & Restore" },
  { to: "/app/settings/cheque-templates", label: "Cheque templates" },
];

export function SettingsLayout() {
  const location = useLocation();
  return (
    <div>
      <h1 style={{ marginTop: 0 }}>Settings</h1>
      <nav style={{ display: "flex", gap: 16, marginBottom: 24, borderBottom: "1px solid #e2e8f0", paddingBottom: 8 }}>
        {links.map(({ to, label }) => (
          <Link
            key={to}
            to={to}
            style={{
              color: location.pathname === to ? "#0f172a" : "#64748b",
              fontWeight: location.pathname === to ? 600 : 400,
              textDecoration: "none",
            }}
          >
            {label}
          </Link>
        ))}
      </nav>
      <Outlet />
    </div>
  );
}
