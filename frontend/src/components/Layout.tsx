import { useState, useMemo, useEffect, useRef } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { getToken, getTenantId } from "@/api/client";
import type { TenantType } from "@/api/client";
import { isSidebarNavItemActive, menuSections, type NavItem, type TenantTypeFilter } from "@/app/sidebarConfig";
import { prefetchSidebarRoute, prefetchTopSearchRoutes } from "@/app/prefetchRoutes";
import { AppBottomNav } from "@/components/navigation/AppBottomNav";
import {
  Bell,
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Plus,
  Search,
  Settings,
  User,
} from "lucide-react";
import type { MeResponse } from "@/api/client";

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
  companyCode,
  userName,
  isCollapsed,
  onToggleCollapse,
}: {
  tenantType: TenantType;
  tenantName: string;
  companyCode: string | null;
  userName: string;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const location = useLocation();
  const [openSection, setOpenSection] = useState<string | null>("Dashboard");
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const navContainerRef = useRef<HTMLDivElement>(null);
  const userPopoverRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!isCollapsed && activeLinkRef.current) {
      activeLinkRef.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [location.pathname, isCollapsed]);

  useEffect(() => {
    if (!userPopoverOpen) return;
    function handleClickOutside(event: MouseEvent) {
      if (
        userPopoverRef.current &&
        !userPopoverRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest("[data-sidebar-user-trigger]")
      ) {
        setUserPopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [userPopoverOpen]);

  const navLink = (item: NavItem) => {
    const Icon = item.icon;
    const isActive = isSidebarNavItemActive(location.pathname, item.href);
    const to = item.href;
    const label = item.label;
    return (
      <Link
        key={to}
        to={to}
        ref={isActive ? (el) => (activeLinkRef.current = el) : undefined}
        onMouseEnter={() => prefetchSidebarRoute(to)}
        onFocus={() => prefetchSidebarRoute(to)}
        aria-current={isActive ? "page" : undefined}
        className={`group flex items-center gap-2 h-8 py-1.5 rounded-md no-underline transition ${
          isCollapsed ? "justify-center px-2" : "min-w-0 px-3 pl-9"
        } ${
          isActive
            ? "border-l-[3px] border-l-brand-primary bg-brand-primary/10 text-brand-primary font-medium rounded-l-none"
            : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
        }`}
        title={isCollapsed ? (item.badge ? `${label} (${item.badge})` : label) : undefined}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!isCollapsed && (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate text-[13px]">{label}</span>
            {item.badge ? (
              <span className="shrink-0 rounded border border-border bg-surface-base px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                {item.badge}
              </span>
            ) : null}
          </span>
        )}
      </Link>
    );
  };

  const sectionId = (s: string) => `sidebar-section-${s.replace(/\s+/g, "-").toLowerCase()}`;
  const buttonId = (s: string) => `sidebar-btn-${s.replace(/\s+/g, "-").toLowerCase()}`;

  return (
    <aside
      className={`relative border-r border-border bg-surface-subtle min-h-screen shrink-0 flex flex-col transition-all duration-200 ${
        isCollapsed ? "w-16" : "w-64"
      }`}
    >
      <div className="h-14 border-b border-border bg-surface-subtle flex items-center justify-between px-3">
        {!isCollapsed && (
          <Link to="/app" className="flex items-center gap-2">
            <img src="/images/logo.png" alt="Prime7 ERP" className="h-8 w-auto" />
          </Link>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="h-8 w-8 rounded-md hover:bg-surface-base text-text-muted flex items-center justify-center"
          title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {isCollapsed ? (
        <div className="relative border-b border-border bg-surface-subtle/80 px-2 py-2">
          <button
            type="button"
            data-sidebar-user-trigger
            onClick={() => setUserPopoverOpen((prev) => !prev)}
            className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary font-semibold flex items-center justify-center text-sm hover:bg-brand-primary/20 transition"
            title={userName}
            aria-expanded={userPopoverOpen}
            aria-haspopup="true"
          >
            {getNameInitial(userName)}
          </button>
          {userPopoverOpen && (
            <div
              ref={userPopoverRef}
              className="absolute left-full top-0 ml-1 z-20 w-56 rounded-lg border border-border bg-surface-raised p-3 shadow-lg"
              role="dialog"
              aria-label="User and tenant info"
            >
              <p className="text-sm font-medium text-text-primary truncate">{userName}</p>
              <p className="text-sm font-medium text-text-secondary truncate">{tenantName}</p>
              <p className="text-xs text-text-muted">Code: {companyCode ?? "—"}</p>
            </div>
          )}
        </div>
      ) : (
        <div className="px-3 py-3 border-b border-border bg-surface-subtle/80">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary font-semibold flex items-center justify-center">
              {getNameInitial(userName)}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">{userName}</p>
              <p className="text-sm font-medium text-text-secondary truncate">{tenantName}</p>
              <p className="text-xs text-text-muted">Code: {companyCode ?? "—"}</p>
            </div>
          </div>
        </div>
      )}

      <nav ref={navContainerRef} className="flex-1 overflow-y-auto p-2 space-y-0.5" aria-label="Main navigation">
        {filtered.map((mod, index) => {
          const SectionIcon = mod.icon;
          const isOpen = openSection === mod.section;
          const hasItems = mod.items.length > 0;
          const directLink = mod.directLink;
          const hasActiveItem =
            hasItems && mod.items.some((item) => isSidebarNavItemActive(location.pathname, item.href));
          const sectionWrapperClass =
            (index > 0 ? "border-t border-border/70 pt-2 mt-0.5 mb-1" : "mb-1") + (hasItems ? " relative" : "");

          if (hasItems) {
            return (
              <div key={mod.section} className={sectionWrapperClass}>
                <button
                  type="button"
                  id={buttonId(mod.section)}
                  aria-expanded={isOpen}
                  aria-controls={sectionId(mod.section)}
                  onMouseEnter={() => isCollapsed && setHoveredSection(mod.section)}
                  onMouseLeave={() => isCollapsed && setHoveredSection(null)}
                  onClick={() => setOpenSection(isOpen ? null : mod.section)}
                  className={`relative flex items-center gap-2 w-full h-9 rounded-md transition text-left ${
                    isCollapsed ? "justify-center px-2" : "px-3"
                  } ${
                    isOpen
                      ? "text-brand-primary bg-brand-primary/5"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
                  } ${isCollapsed && hasActiveItem ? "border-l-2 border-l-brand-primary" : ""}`}
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
                  <div id={sectionId(mod.section)} className="pl-6 pr-1 py-1 space-y-0.5" role="region" aria-labelledby={buttonId(mod.section)}>
                    {mod.items.map((item) => navLink(item))}
                  </div>
                )}
                {isCollapsed && hoveredSection === mod.section && (
                  <div
                    className="absolute left-full top-0 ml-0 z-20 min-w-[200px] rounded-r-lg border border-border border-l-0 bg-surface-raised py-2 shadow-lg"
                    onMouseEnter={() => setHoveredSection(mod.section)}
                    onMouseLeave={() => setHoveredSection(null)}
                    role="menu"
                  >
                    <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
                      {mod.section}
                    </p>
                    {mod.items.map((item) => {
                      const ItemIcon = item.icon;
                      const active = isSidebarNavItemActive(location.pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          to={item.href}
                          role="menuitem"
                          onMouseEnter={() => prefetchSidebarRoute(item.href)}
                          className={`flex items-center gap-2 px-3 py-1.5 text-sm no-underline ${
                            active ? "bg-brand-primary/10 text-brand-primary font-medium" : "text-text-secondary hover:bg-surface-subtle"
                          }`}
                        >
                          <ItemIcon className="h-4 w-4 shrink-0" />
                          <span className="flex-1 truncate">{item.label}</span>
                          {item.badge ? (
                            <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-[10px] font-semibold uppercase text-text-muted">
                              {item.badge}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          }
          if (directLink) {
            const directActive =
              location.pathname === directLink ||
              (directLink !== "/app" && location.pathname.startsWith(directLink));
            return (
              <div key={mod.section} className={sectionWrapperClass}>
                <Link
                  to={directLink}
                  onMouseEnter={() => prefetchSidebarRoute(directLink)}
                  onFocus={() => prefetchSidebarRoute(directLink)}
                  aria-current={directActive ? "page" : undefined}
                  className={`flex items-center gap-2 w-full h-9 rounded-md transition ${
                    isCollapsed ? "justify-center px-2" : "px-3"
                  } ${
                    directActive
                      ? "border-l-[3px] border-l-brand-primary bg-brand-primary/10 text-brand-primary font-medium rounded-l-none"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
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

      <div className="border-t border-border bg-surface-subtle p-2">
        <Link
          to="/app/tutorials"
          onMouseEnter={() => prefetchSidebarRoute("/app/tutorials")}
          onFocus={() => prefetchSidebarRoute("/app/tutorials")}
          className={`flex items-center gap-2 h-8 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-subtle ${
            isCollapsed ? "justify-center px-2" : "px-3"
          }`}
          title={isCollapsed ? "Help & Tutorials" : undefined}
        >
          <BookOpen className="h-4 w-4" />
          {!isCollapsed && <span className="text-sm">Help & Tutorials</span>}
        </Link>
      </div>
    </aside>
  );
}

function TopHeader({
  me,
  displayName,
  onLogout,
}: {
  me: MeResponse;
  displayName: string;
  onLogout: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    if (profileOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [profileOpen]);

  return (
    <header className="h-14 bg-surface-subtle border-b border-border px-4 md:px-6 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <button
          type="button"
          onMouseEnter={prefetchTopSearchRoutes}
          onFocus={prefetchTopSearchRoutes}
          onClick={prefetchTopSearchRoutes}
          className="h-9 w-full max-w-sm rounded-md border border-border-strong bg-surface-raised text-text-muted text-sm px-3 flex items-center gap-2"
        >
          <Search className="h-4 w-4" />
          <span className="truncate">Search modules, pages, documents...</span>
        </button>
      </div>
      <div className="flex items-center gap-1">
        <Link
          to="/app/inquiries/new"
          className="hidden md:inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border-strong text-sm text-text-secondary hover:bg-surface-subtle"
        >
          <Plus className="h-4 w-4" />
          New
        </Link>
        <button type="button" className="h-8 w-8 rounded-md hover:bg-surface-subtle text-text-secondary flex items-center justify-center">
          <Bell className="h-4 w-4" />
        </button>
        <div className="relative" ref={profileRef}>
          <button
            type="button"
            onClick={() => setProfileOpen((prev) => !prev)}
            className="flex items-center gap-2 h-8 rounded-lg border border-border-strong px-2.5 py-1.5 text-left bg-surface-raised hover:bg-surface-subtle min-w-0 max-w-[200px]"
            aria-expanded={profileOpen}
            aria-haspopup="true"
          >
            <div className="w-7 h-7 rounded-full bg-brand-primary/10 text-brand-primary font-semibold flex items-center justify-center shrink-0 text-sm">
              {getNameInitial(displayName)}
            </div>
            <span className="hidden sm:block truncate text-sm font-medium text-text-secondary">{displayName}</span>
            <ChevronDown className="h-4 w-4 shrink-0 text-text-muted" />
          </button>
          {profileOpen && (
            <div className="absolute right-0 z-10 mt-1 w-64 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
              <div className="px-2 py-1.5 border-b border-border-subtle">
                <p className="text-sm font-semibold text-text-primary truncate">{displayName}</p>
                <p className="text-xs text-text-secondary truncate">{me.email}</p>
              </div>
              <div className="px-2 py-1.5 border-b border-border-subtle">
                <p className="text-sm font-medium text-brand-primary">{me.tenant_name}</p>
                <p className="text-xs text-text-muted">Company code: {me.company_code ?? "—"}</p>
              </div>
              <div className="pt-1 space-y-0.5">
                <Link
                  to="/app/hr/ess/profile"
                  onClick={() => setProfileOpen(false)}
                  className="block rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle flex items-center gap-2"
                >
                  <User className="h-4 w-4" />
                  My Profile
                </Link>
                <Link
                  to="/app/settings"
                  onClick={() => setProfileOpen(false)}
                  className="block rounded-md px-2 py-1.5 text-left text-sm text-text-secondary hover:bg-surface-subtle flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Settings
                </Link>
              </div>
              <div className="border-t border-border-subtle mt-1 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                  className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-status-danger hover:bg-status-danger-subtle flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </div>
          )}
        </div>
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
    <footer className="h-11 border-t border-border bg-surface-subtle px-4 md:px-6 flex items-center justify-between text-xs text-text-muted">
      <div className="flex items-center gap-4">
        <span>
          System Status: <span className="text-status-success font-semibold">99.9%</span>
        </span>
        <span className="hidden md:inline">Enterprise-grade security enabled</span>
      </div>
      <div className="text-right">
        <span className="font-medium text-text-secondary">Prime7 ERP</span> · {now.toLocaleDateString()} {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
  if (error) return <div className="p-6 text-status-danger">{error}</div>;
  if (!me) return <div className="p-6">Loading session...</div>;

  const displayName = me.first_name ? `${me.first_name} ${me.last_name ?? ""}`.trim() : me.username;

  return (
    <div className="flex min-h-[100dvh] lg:h-screen bg-surface-base overflow-hidden">
      <div className="hidden lg:flex">
        <Sidebar
          tenantType={me.tenant_type}
          tenantName={me.tenant_name}
          companyCode={me.company_code}
          userName={displayName}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed((prev) => !prev)}
        />
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <TopHeader me={me} displayName={displayName} onLogout={logout} />
        <main className="erp-main-content flex-1 overflow-y-auto bg-surface-base p-3 sm:p-4 md:p-5 lg:p-6 pb-20 lg:pb-6">
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
