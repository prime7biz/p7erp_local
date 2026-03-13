import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import type { TenantType } from "@/api/client";
import { bottomNavItems, menuSections, type BottomNavItem, type TenantTypeFilter } from "@/app/sidebarConfig";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import { X } from "lucide-react";

function isVisible(tenantType: TenantType, filter?: TenantTypeFilter[]): boolean {
  if (!filter || filter.length === 0) return true;
  if (tenantType === "both") return true;
  return filter.includes(tenantType);
}

function isPathMatch(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
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

export function AppBottomNav({ tenantType }: { tenantType: TenantType }) {
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const tabs = useMemo(
    () => bottomNavItems.filter((item) => isVisible(tenantType, item.visibleFor)),
    [tenantType],
  );

  const filteredSections = useMemo(() => {
    return menuSections
      .filter((section) => isVisible(tenantType, section.visibleFor))
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => isVisible(tenantType, item.visibleFor)),
      }))
      .filter((section) => section.items.length > 0 || Boolean(section.directLink));
  }, [tenantType]);

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
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-gray-50/95 backdrop-blur supports-[backdrop-filter]:bg-gray-50/85 lg:hidden">
        <div className="grid h-16 grid-cols-5 px-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isTabActive(location.pathname, tab, hasPrimaryActive, isMoreOpen);
            const baseClassName = `flex h-full flex-col items-center justify-center gap-1 rounded-md text-[11px] font-medium transition ${
              active ? "bg-primary/10 text-primary" : "text-gray-600 hover:text-gray-900"
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
            className="absolute inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-gray-50 p-4 shadow-2xl"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">All Modules</h2>
              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100"
                aria-label="Close modules"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 pb-4">
              {filteredSections.map((section) => {
                const SectionIcon = section.icon;
                return (
                  <section key={section.section} className="rounded-xl border border-gray-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2">
                      <SectionIcon className="h-4 w-4 text-gray-700" />
                      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{section.section}</h3>
                    </div>
                    <div className="space-y-1">
                      {section.directLink && (
                        <Link
                          to={section.directLink}
                          onMouseEnter={() => prefetchSidebarRoute(section.directLink as string)}
                          onFocus={() => prefetchSidebarRoute(section.directLink as string)}
                          className="block rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"
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
                            className="flex items-center gap-2 rounded-md px-2 py-2 text-sm text-gray-700 hover:bg-gray-50"
                          >
                            <ItemIcon className="h-4 w-4 text-gray-500" />
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
