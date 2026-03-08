import { Link, Outlet, useLocation } from "react-router-dom";

const links = [
  { to: "/app/settings/users", label: "Users" },
  { to: "/app/settings/roles", label: "Roles" },
  { to: "/app/settings/audit", label: "Audit log" },
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
