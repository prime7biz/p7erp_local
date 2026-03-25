import { NavLink, Outlet } from "react-router-dom";
import { useAdminAuth } from "@/context/AdminAuthContext";

const nav = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/tenants", label: "Tenants" },
  { to: "/monitoring/audit", label: "Audit log" },
  { to: "/monitoring/health", label: "System health" },
  { to: "/backup/jobs", label: "Backups" },
  { to: "/ai/usage", label: "AI usage" },
  { to: "/billing/plans", label: "Billing plans" },
  { to: "/support/announcements", label: "Announcements" },
  { to: "/security/admins", label: "Platform admins" },
];

export function AdminLayout() {
  const { me, logout } = useAdminAuth();
  return (
    <div className="min-h-screen flex">
      <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-4">
        <div className="font-bold text-slate-800 mb-4">P7 Platform Admin</div>
        <nav className="flex flex-col gap-1 text-sm">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `rounded-md px-2 py-1.5 ${isActive ? "bg-slate-100 font-medium text-slate-900" : "text-slate-600 hover:bg-slate-50"}`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-8 text-xs text-slate-500">
          <div>{me?.username}</div>
          <div className="text-slate-400">{me?.role}</div>
          <button type="button" className="mt-2 text-red-600 underline" onClick={logout}>
            Log out
          </button>
        </div>
      </aside>
      <main className="flex-1 p-6 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
