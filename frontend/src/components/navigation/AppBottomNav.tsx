import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { TenantType } from "@/api/client";
import { APP_VERSION } from "@/api/client";
import {
  bottomNavItems,
  isNavItemVisibleForTenant,
  menuSections,
  type BottomNavItem,
  type TenantTypeFilter,
} from "@/app/sidebarConfig";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import { getRbacMode } from "@/components/auth/rbacMode";
import { Landmark, ScanBarcode, Search, Settings, Timer, TriangleAlert, Users, X } from "lucide-react";

function isVisible(tenantType: TenantType, filter?: TenantTypeFilter[]): boolean {
  if (!filter || filter.length === 0) return true;
  if (tenantType === "both") return true;
  return filter.includes(tenantType);
}

function isPathMatch(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function sectionPermissionKey(section: string): string | null {
  if (section === "Merchandising") return "merch.access";
  if (section === "Export & Import") return "merch.access";
  if (section === "Inventory") return "inventory.access";
  if (section === "Manufacturing") return "production.access";
  if (section === "AI Tools") return "ai.access";
  if (section === "HR") return "hr.access";
  if (section === "Finance") return "finance.access";
  if (section === "Reports") return "reports.access";
  if (section === "Settings") return "settings.access";
  return null;
}

/** More is active only while the drawer is open — not for every deep route. */
function isTabActive(pathname: string, tab: BottomNavItem, isMoreOpen: boolean): boolean {
  if (tab.isMore) return isMoreOpen;
  if (tab.exact) return pathname === tab.href;
  const prefixes = tab.matchPrefixes?.length ? tab.matchPrefixes : [tab.href];
  return prefixes.some((prefix) => isPathMatch(pathname, prefix));
}

export function AppBottomNav({
  tenantType,
  enabledOptionalProductionUnits = [],
  featureFlags,
  hasPermission,
}: {
  tenantType: TenantType;
  /** From Production setup; gates optional units (knitting, dyeing, …) in the mobile “More” menu. */
  enabledOptionalProductionUnits?: string[];
  featureFlags?: Record<string, boolean | string | number | null> | null;
  hasPermission: (key: string) => boolean;
}) {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [drawerSearch, setDrawerSearch] = useState("");

  const tabs = useMemo(
    () => bottomNavItems.filter((item) => isVisible(tenantType, item.visibleFor)),
    [tenantType],
  );

  const filteredSections = useMemo(() => {
    const rbacMode = getRbacMode(featureFlags);
    return menuSections
      .filter((section) => isVisible(tenantType, section.visibleFor))
      .filter((section) => {
        if (rbacMode !== "enforce") return true;
        const permissionKey = sectionPermissionKey(section.section);
        if (!permissionKey) return true;
        return hasPermission(permissionKey);
      })
      .map((section) => {
        if (section.subsections && section.subsections.length > 0) {
          const subsections = section.subsections
            .map((sub) => ({
              ...sub,
              items: sub.items.filter((item) =>
                isNavItemVisibleForTenant(item, tenantType, enabledOptionalProductionUnits, featureFlags),
              ),
            }))
            .filter((sub) => sub.items.length > 0);
          return { ...section, items: [], subsections };
        }
        const topItems = section.items.filter((item) =>
          isNavItemVisibleForTenant(item, tenantType, enabledOptionalProductionUnits, featureFlags),
        );
        return {
          ...section,
          items: topItems,
          subsections: undefined,
        };
      })
      .filter((section) => {
        if (section.directLink) return true;
        if (section.subsections && section.subsections.length > 0) {
          return section.subsections.some((sub) => sub.items.length > 0);
        }
        return section.items.length > 0;
      });
  }, [tenantType, enabledOptionalProductionUnits, featureFlags, hasPermission]);

  const filteredDrawerSections = useMemo(() => {
    if (!drawerSearch.trim()) return filteredSections;
    const q = drawerSearch.toLowerCase();
    return filteredSections.filter((s) => {
      const sectionMatch = s.section.toLowerCase().includes(q);
      const itemMatch = s.items?.some((i) => i.label.toLowerCase().includes(q));
      const subMatch = s.subsections?.some(
        (sub) =>
          sub.label.toLowerCase().includes(q) ||
          sub.items.some((i) => i.label.toLowerCase().includes(q)),
      );
      return sectionMatch || itemMatch || subMatch;
    });
  }, [drawerSearch, filteredSections]);

  useEffect(() => {
    setIsMoreOpen(false);
    setDrawerSearch("");
  }, [location.pathname]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (isMoreOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMoreOpen]);

  const closeMore = () => {
    setIsMoreOpen(false);
    setDrawerSearch("");
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-subtle/95 backdrop-blur supports-[backdrop-filter]:bg-surface-subtle/85 pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="grid h-16 grid-cols-5 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(location.pathname, tab, isMoreOpen);
            const baseClassName = `flex h-full flex-col items-center justify-center gap-1 rounded-md text-[11px] transition ${
              active
                ? "bg-brand-subtle text-brand-primary font-semibold border-t-2 border-t-brand-primary"
                : "font-medium text-text-secondary hover:text-text-primary"
            }`;

            if (tab.isMore) {
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() =>
                    setIsMoreOpen((open) => {
                      if (open) setDrawerSearch("");
                      return !open;
                    })
                  }
                  className={baseClassName}
                  aria-expanded={isMoreOpen}
                  aria-controls="mobile-more-menu"
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            }

            return (
              <Link
                key={tab.key}
                to={tab.href}
                onMouseEnter={() => prefetchSidebarRoute(tab.href)}
                onFocus={() => prefetchSidebarRoute(tab.href)}
                className={baseClassName}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {isMoreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={closeMore}
            aria-label="Close menu"
          />
          <div
            id="mobile-more-menu"
            className="absolute inset-x-0 bottom-0 flex max-h-[75vh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-surface-subtle shadow-2xl pb-[env(safe-area-inset-bottom)]"
          >
            <div className="shrink-0 bg-surface-subtle px-4 pt-4 pb-2 border-b border-border-subtle">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">All Modules</h2>
                <button
                  type="button"
                  onClick={closeMore}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-base"
                  aria-label="Close modules"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  type="text"
                  placeholder="Filter modules..."
                  className="flex-1 bg-transparent text-sm outline-none text-text-primary placeholder:text-text-muted"
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                  autoFocus
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 pb-4">
              <section className="rounded-xl border border-border bg-surface-raised p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Mobile shortcuts
                </h3>
                <div className="space-y-1">
                  <Link
                    to="/app/inventory/stock-inventory-summary"
                    onClick={closeMore}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-state-hover"
                  >
                    <ScanBarcode className="h-4 w-4 text-text-muted" />
                    Scan barcode / stock
                  </Link>
                  <Link
                    to="/app/hr/ess/attendance"
                    onClick={closeMore}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-state-hover"
                  >
                    <Timer className="h-4 w-4 text-text-muted" />
                    Quick clock-in
                  </Link>
                  <Link
                    to="/app/production/quality"
                    onClick={closeMore}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-state-hover"
                  >
                    <TriangleAlert className="h-4 w-4 text-text-muted" />
                    Report defect
                  </Link>
                </div>
              </section>
              <section className="rounded-xl border border-border bg-surface-raised p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Stakeholder portals
                </h3>
                <div className="space-y-1">
                  <Link
                    to="/login?role=customer"
                    onClick={closeMore}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Users className="h-4 w-4 text-text-muted" />
                    Customer portal login
                  </Link>
                  <Link
                    to="/login?role=financier"
                    onClick={closeMore}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Landmark className="h-4 w-4 text-text-muted" />
                    Financier portal login
                  </Link>
                  <Link
                    to="/app/settings/external-access"
                    onClick={closeMore}
                    onMouseEnter={() => prefetchSidebarRoute("/app/settings/external-access")}
                    onFocus={() => prefetchSidebarRoute("/app/settings/external-access")}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Settings className="h-4 w-4 text-text-muted" />
                    Manage external access
                  </Link>
                </div>
              </section>
              {filteredDrawerSections.map((section) => {
                const SectionIcon = section.icon;
                return (
                  <section key={section.section} className="rounded-lg border border-border bg-surface-raised p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <SectionIcon className="h-4 w-4 text-text-secondary" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
                        {section.section}
                      </h3>
                    </div>
                    <div className="space-y-1">
                      {section.directLink && (
                        <Link
                          to={section.directLink}
                          onMouseEnter={() => prefetchSidebarRoute(section.directLink as string)}
                          onFocus={() => prefetchSidebarRoute(section.directLink as string)}
                          className="block rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                        >
                          {section.section}
                        </Link>
                      )}
                      {section.subsections && section.subsections.length > 0
                        ? section.subsections.map((sub) => (
                            <div key={sub.label} className="space-y-0.5">
                              <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                                {sub.label}
                              </p>
                              {sub.items.map((item) => {
                                const ItemIcon = item.icon;
                                return (
                                  <Link
                                    key={item.href}
                                    to={item.href}
                                    onMouseEnter={() => prefetchSidebarRoute(item.href)}
                                    onFocus={() => prefetchSidebarRoute(item.href)}
                                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                                  >
                                    <ItemIcon className="h-4 w-4 text-text-muted" />
                                    <span className="truncate">{item.label}</span>
                                  </Link>
                                );
                              })}
                            </div>
                          ))
                        : section.items.map((item) => {
                            const ItemIcon = item.icon;
                            return (
                              <Link
                                key={item.href}
                                to={item.href}
                                onMouseEnter={() => prefetchSidebarRoute(item.href)}
                                onFocus={() => prefetchSidebarRoute(item.href)}
                                className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                              >
                                <ItemIcon className="h-4 w-4 text-text-muted" />
                                <span className="truncate">{item.label}</span>
                              </Link>
                            );
                          })}
                    </div>
                  </section>
                );
              })}
            </div>
            <p className="shrink-0 border-t border-border px-4 py-2.5 text-center text-[11px] text-text-muted">
              Prime7 ERP · v{APP_VERSION}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
