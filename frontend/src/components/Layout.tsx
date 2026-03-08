import { useState, useMemo } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import type { TenantType } from "@/api/client";
import { menuSections } from "@/app/sidebarConfig";
import type { TenantTypeFilter } from "@/app/sidebarConfig";
import { ChevronDown, ChevronRight } from "lucide-react";

function isVisible(tenantType: TenantType, filter?: TenantTypeFilter[]): boolean {
  if (!filter || filter.length === 0) return true;
  if (tenantType === "both") return true;
  return filter.includes(tenantType);
}

function Sidebar({ tenantType }: { tenantType: TenantType }) {
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>("Dashboard");

  const filtered = useMemo(() => {
    return menuSections
      .filter((s) => isVisible(tenantType, s.visibleFor))
      .map((s) => ({
        ...s,
        items: s.items.filter((i) => isVisible(tenantType, i.visibleFor)),
      }));
  }, [tenantType]);

  const navLink = (to: string, label: string, icon: React.ComponentType<{ className?: string }>) => {
    const Icon = icon;
    const active = location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));
    return (
      <Link
        key={to}
        to={to}
        className={`flex items-center gap-2 py-2 px-3 rounded-md no-underline transition ${
          active ? "text-white bg-white/10" : "text-slate-400 hover:text-white"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{label}</span>
      </Link>
    );
  };

  return (
    <aside className="w-60 bg-slate-800 text-white p-3 min-h-screen shrink-0 overflow-y-auto">
      <h2 className="text-lg font-bold mb-4 px-2">P7 ERP</h2>
      <nav className="flex flex-col gap-0.5">
        {filtered.map((mod) => {
          const SectionIcon = mod.icon;
          const isOpen = openSection === mod.section;
          const hasItems = mod.items.length > 0;
          const directLink = mod.directLink;

          if (hasItems) {
            return (
              <div key={mod.section} className="mb-1">
                <button
                  type="button"
                  onClick={() => setOpenSection(isOpen ? null : mod.section)}
                  className="flex items-center gap-2 w-full py-2 px-3 rounded-md text-slate-300 hover:text-white hover:bg-white/5 transition text-left"
                >
                  <SectionIcon className="h-4 w-4 shrink-0" />
                  <span className="flex-1 truncate text-sm font-medium">{mod.section}</span>
                  {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </button>
                {isOpen && (
                  <div className="pl-6 pr-1 py-1 space-y-0.5">
                    {mod.items.map((item) => navLink(item.href, item.label, item.icon))}
                  </div>
                )}
              </div>
            );
          }
          if (directLink) {
            return (
              <div key={mod.section} className="mb-1">
                {navLink(directLink, mod.section, SectionIcon)}
              </div>
            );
          }
          return null;
        })}
      </nav>
    </aside>
  );
}

export function Layout() {
  const { me, loading, error, logout } = useAuth();

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!me) return null;

  return (
    <div className="flex min-h-screen">
      <Sidebar tenantType={me.tenant_type} />
      <main className="flex-1 p-6 bg-gray-50 overflow-auto">
        <header className="flex justify-between items-center mb-6">
          <span className="text-gray-500 font-medium">{me.tenant_name}</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{me.email}</span>
            <button
              type="button"
              onClick={logout}
              className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 hover:bg-gray-100"
            >
              Logout
            </button>
          </div>
        </header>
        <Outlet />
      </main>
    </div>
  );
}
