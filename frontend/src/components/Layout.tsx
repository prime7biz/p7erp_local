import { useState, useMemo, useEffect } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getToken, getTenantId } from "@/api/client";
import type { TenantType } from "@/api/client";
import { menuSections } from "@/app/sidebarConfig";
import type { TenantTypeFilter } from "@/app/sidebarConfig";
import { prefetchSidebarRoute, prefetchTopSearchRoutes } from "@/app/prefetchRoutes";
import { AppBottomNav } from "@/components/navigation/AppBottomNav";
import {
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  Search,
  Sparkles,
} from "lucide-react";

function isVisible(tenantType: TenantType, filter?: TenantTypeFilter[]): boolean {
  if (!filter || filter.length === 0) return true;
  if (tenantType === "both") return true;
  return filter.includes(tenantType);
}

function getNameInitial(name?: string | null) {
  if (!name) return "U";
  return name.trim().charAt(0).toUpperCase();
}

function Sidebar({
  tenantType,
  tenantName,
  userName,
  isCollapsed,
  onToggleCollapse,
}: {
  tenantType: TenantType;
  tenantName: string;
  userName: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
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

  useEffect(() => {
    const activeModule = filtered.find((mod) =>
      mod.items.some((item) => location.pathname === item.href || location.pathname.startsWith(item.href)),
    );
    if (activeModule) setOpenSection(activeModule.section);
  }, [location.pathname, filtered]);

  const navLink = (to: string, label: string, icon: React.ComponentType<{ className?: string }>) => {
    const Icon = icon;
    const active = location.pathname === to || (to !== "/app" && location.pathname.startsWith(to));
    return (
      <Link
        key={to}
        to={to}
        onMouseEnter={() => prefetchSidebarRoute(to)}
        onFocus={() => prefetchSidebarRoute(to)}
        className={`group flex items-center gap-2 h-8 py-1.5 rounded-md no-underline transition ${
          isCollapsed ? "justify-center px-2" : "px-3 pl-9"
        } ${
          active
            ? "border-l-[3px] border-l-primary bg-primary/10 text-primary font-medium rounded-l-none"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
        }`}
        title={isCollapsed ? label : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!isCollapsed && <span className="truncate text-[13px]">{label}</span>}
      </Link>
    );
  };

  return (
    <aside
      className={`border-r border-gray-200 bg-gray-50 min-h-screen shrink-0 flex flex-col transition-all duration-200 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="h-14 border-b border-gray-200 bg-gray-50 flex items-center justify-between px-3">
        {!isCollapsed && (
          <Link to="/app" className="flex items-center gap-2">
            <img src="/images/logo.svg" alt="Prime7 ERP" className="h-8 w-auto" />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-md hover:bg-gray-100 text-gray-500 flex items-center justify-center"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {!isCollapsed && (
        <div className="px-3 py-3 border-b border-gray-200 bg-gray-50/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 text-primary font-semibold flex items-center justify-center">
              {getNameInitial(userName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{userName}</p>
              <p className="text-xs text-gray-500 truncate">{tenantName}</p>
            </div>
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
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
                  className={`flex items-center gap-2 w-full h-9 rounded-md transition text-left ${
                    isCollapsed ? "justify-center px-2" : "px-3"
                  } ${
                    isOpen
                      ? "text-primary bg-primary/5"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                  title={isCollapsed ? mod.section : undefined}
                >
                  <SectionIcon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && (
                    <>
                      <span className="flex-1 truncate text-sm font-medium">{mod.section}</span>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </>
                  )}
                </button>
                {!isCollapsed && isOpen && (
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
                <Link
                  to={directLink}
                  onMouseEnter={() => prefetchSidebarRoute(directLink)}
                  onFocus={() => prefetchSidebarRoute(directLink)}
                  className={`flex items-center gap-2 w-full h-9 rounded-md transition ${
                    isCollapsed ? "justify-center px-2" : "px-3"
                  } ${
                    location.pathname === directLink
                      ? "border-l-[3px] border-l-primary bg-primary/10 text-primary font-medium rounded-l-none"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
                  }`}
                  title={isCollapsed ? mod.section : undefined}
                >
                  <SectionIcon className="h-4 w-4 shrink-0" />
                  {!isCollapsed && <span className="font-medium text-sm">{mod.section}</span>}
                </Link>
              </div>
            );
          }
          return null;
        })}
      </nav>

      <div className="border-t border-gray-200 bg-gray-50 p-2">
        <Link
          to="/app/settings/users"
          onMouseEnter={() => prefetchSidebarRoute("/app/settings/users")}
          onFocus={() => prefetchSidebarRoute("/app/settings/users")}
          className={`flex items-center gap-2 h-8 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 ${
            isCollapsed ? "justify-center px-2" : "px-3"
          }`}
          title={isCollapsed ? "Settings" : undefined}
        >
          <Sparkles className="h-4 w-4" />
          {!isCollapsed && <span className="text-sm">Help & Tutorials</span>}
        </Link>
      </div>
    </aside>
  );
}

function TopHeader({
  tenantName,
  userEmail,
  onLogout,
}: {
  tenantName: string;
  userEmail: string;
  onLogout: () => void;
}) {
  return (
    <header className="h-14 bg-gray-50 border-b border-gray-200 px-4 md:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onMouseEnter={prefetchTopSearchRoutes}
          onFocus={prefetchTopSearchRoutes}
          onClick={prefetchTopSearchRoutes}
          className="h-9 w-full max-w-sm rounded-md border border-gray-300 bg-white text-gray-500 text-sm px-3 flex items-center gap-2"
        >
          <Search className="h-4 w-4" />
          <span className="truncate">Search modules, pages, documents...</span>
        </button>
        <span className="hidden lg:inline text-sm font-medium text-gray-700 truncate">
          {tenantName}
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Link
          to="/app/inquiries/new"
          className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-gray-300 text-sm text-gray-700 hover:bg-gray-100"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
        <button type="button" className="h-8 w-8 rounded-md hover:bg-gray-100 text-gray-600 flex items-center justify-center">
          <Bell className="h-4 w-4" />
        </button>
        <span className="hidden md:inline text-sm text-gray-600 max-w-[180px] truncate">{userEmail}</span>
        <button
          type="button"
          onClick={onLogout}
          className="h-8 px-2.5 rounded-md text-red-600 hover:bg-red-50 text-sm inline-flex items-center gap-1.5"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}

function AppFooter() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  return (
    <footer className="h-11 border-t border-gray-200 bg-gray-50 px-4 md:px-6 flex items-center justify-between text-xs text-gray-500">
      <div className="flex items-center gap-4">
        <span>
          System Status: <span className="text-emerald-600 font-semibold">99.9%</span>
        </span>
        <span className="hidden md:inline">Enterprise-grade security enabled</span>
      </div>
      <div className="text-right">
        <span className="font-medium text-gray-600">Prime7 ERP</span> · {now.toLocaleDateString()} {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
      </div>
    </footer>
  );
}

export function Layout() {
  const { me, loading, error, logout, refetch } = useAuth();
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    if (getToken() && getTenantId() && !me && !loading) refetch();
  }, [me, loading, refetch]);

  useEffect(() => {
    const saved = localStorage.getItem("p7_sidebar_collapsed");
    if (saved) setIsCollapsed(saved === "1");
  }, []);

  useEffect(() => {
    localStorage.setItem("p7_sidebar_collapsed", isCollapsed ? "1" : "0");
  }, [isCollapsed]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!me) return <div className="p-6">Loading session...</div>;

  const displayName = me.first_name ? `${me.first_name} ${me.last_name ?? ""}`.trim() : me.username;

  return (
    <div className="flex min-h-[100dvh] lg:h-screen bg-gray-100 overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar
          tenantType={me.tenant_type}
          tenantName={me.tenant_name}
          userName={displayName}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader tenantName={me.tenant_name} userEmail={me.email} onLogout={logout} />
        <main className="flex-1 overflow-y-auto bg-gray-100 p-3 sm:p-4 md:p-5 lg:p-6 pb-20 lg:pb-6">
          <Outlet />
        </main>
        <div className="hidden lg:block">
          <AppFooter />
        </div>
      </div>
      <AppBottomNav tenantType={me.tenant_type} />
    </div>
  );
}
