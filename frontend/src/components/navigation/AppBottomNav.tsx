import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { TenantType } from "@/api/client";
import {
  bottomNavItems,
  isNavItemVisibleForTenant,
  menuSections,
  type BottomNavItem,
  type TenantTypeFilter,
} from "@/app/sidebarConfig";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import { getRbacMode } from "@/components/auth/rbacMode";
import { Landmark, Settings, Users, X } from "lucide-react";

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

function isTabActive(pathname: string, tab: BottomNavItem, hasPrimaryActive: boolean, isMoreOpen: boolean): boolean {
  if (tab.isMore) {
    return isMoreOpen || !hasPrimaryActive;
  }
  if (tab.exact) {
    return pathname === tab.href;
  }
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
        const topItems = section.items.filter((item) =>
          isNavItemVisibleForTenant(item, tenantType, enabledOptionalProductionUnits, featureFlags),
        );
        const subItems =
          section.subsections?.flatMap((sub) =>
            sub.items.filter((item) =>
              isNavItemVisibleForTenant(item, tenantType, enabledOptionalProductionUnits, featureFlags),
            ),
          ) ?? [];
        return {
          ...section,
          items: [...topItems, ...subItems],
        };
      })
      .filter((section) => section.items.length > 0 || Boolean(section.directLink));
  }, [tenantType, enabledOptionalProductionUnits, featureFlags, hasPermission]);

  const hasPrimaryActive = useMemo(() => {
    const primaryTabs = tabs.filter((tab) => !tab.isMore);
    return primaryTabs.some((tab) => {
      if (tab.exact) return location.pathname === tab.href;
      const prefixes = tab.matchPrefixes?.length ? tab.matchPrefixes : [tab.href];
      return prefixes.some((prefix) => isPathMatch(location.pathname, prefix));
    });
  }, [location.pathname, tabs]);

  useEffect(() => {
    setIsMoreOpen(false);
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

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-subtle/95 backdrop-blur supports-[backdrop-filter]:bg-surface-subtle/85 lg:hidden">
        <div className="grid h-16 grid-cols-5 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(location.pathname, tab, hasPrimaryActive, isMoreOpen);
            const baseClassName = `flex h-full flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium transition ${
              active ? "bg-brand-primary/10 text-brand-primary" : "text-text-secondary hover:text-text-primary"
            }`;

            if (tab.isMore) {
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setIsMoreOpen((open) => !open)}
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
            onClick={() => setIsMoreOpen(false)}
            aria-label="Close menu"
          />
          <div
            id="mobile-more-menu"
            className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-border bg-surface-subtle p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-text-primary">All Modules</h2>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-base"
                aria-label="Close modules"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 pb-4">
              <section className="rounded-xl border border-border bg-surface-raised p-3">
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Stakeholder portals</h3>
                <div className="space-y-1">
                  <Link
                    to="/login?role=customer"
                    onClick={() => setIsMoreOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Users className="h-4 w-4 text-text-muted" />
                    Customer portal login
                  </Link>
                  <Link
                    to="/login?role=financier"
                    onClick={() => setIsMoreOpen(false)}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Landmark className="h-4 w-4 text-text-muted" />
                    Financier portal login
                  </Link>
                  <Link
                    to="/app/settings/external-access"
                    onClick={() => setIsMoreOpen(false)}
                    onMouseEnter={() => prefetchSidebarRoute("/app/settings/external-access")}
                    onFocus={() => prefetchSidebarRoute("/app/settings/external-access")}
                    className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-surface-subtle"
                  >
                    <Settings className="h-4 w-4 text-text-muted" />
                    Manage external access
                  </Link>
                </div>
              </section>
              {filteredSections.map((section) => {
                const SectionIcon = section.icon;
                return (
                  <section key={section.section} className="rounded-xl border border-border bg-surface-raised p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <SectionIcon className="h-4 w-4 text-text-secondary" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">{section.section}</h3>
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
                      {section.items.map((item) => {
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
          </div>
        </div>
      )}
    </>
  );
}
