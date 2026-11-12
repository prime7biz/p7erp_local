import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { Link, useLocation } from "react-router-dom";
import type { TenantType } from "@/api/client";
import { APP_VERSION } from "@/api/client";
import { bottomNavItems, menuSections, type BottomNavItem, type MenuSection } from "@/app/sidebarConfig";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import {
  filterVisibleMenuSections,
  isMenuPermissionAllowed,
  isVisible,
} from "@/components/shell/sidebarNavUtils";
import { hrTabPaletteRoutes } from "@/components/hr/kit/hrHubs";
import { isFinanceHubsV2Enabled } from "@/components/finance/hubs/financeHubs";
import { financeTabPaletteRoutes } from "@/components/finance/hubs/financeNavigation";
import { readOpenMenuSection, useOpenMenuSection } from "@/components/shell/menuOpenSection";
import { isMobileUiV2Enabled } from "@/lib/mobileUi";
import { mobileMenuSections, pickMobileTabs } from "./mobileNavLogic";
import { ChevronDown, Landmark, ScanBarcode, Search, Settings, Timer, TriangleAlert, Users, X } from "lucide-react";

function isPathMatch(pathname: string, basePath: string): boolean {
  return pathname === basePath || pathname.startsWith(`${basePath}/`);
}

function sectionHrefs(section: MenuSection): string[] {
  return [
    ...(section.directLink ? [section.directLink] : []),
    ...section.items.map((i) => i.href),
    ...(section.subsections ?? []).flatMap((sub) => sub.items.map((i) => i.href)),
  ];
}

function sectionPageCount(section: MenuSection): number {
  return sectionHrefs(section).length;
}

const PORTALS_SECTION = "Stakeholder portals";

/** More is active only while the drawer is open — not for every deep route. */
function isTabActive(pathname: string, tab: BottomNavItem, isMoreOpen: boolean): boolean {
  if (tab.isMore) return isMoreOpen;
  if (tab.exact) return pathname === tab.href;
  const prefixes = tab.matchPrefixes?.length ? tab.matchPrefixes : [tab.href];
  return prefixes.some((prefix) => isPathMatch(pathname, prefix));
}

type DrawerLink = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  /** Shown only when this sidebar section is visible to the user (tenant type + RBAC). */
  requiresSection?: string;
};

const MOBILE_SHORTCUTS: DrawerLink[] = [
  { href: "/app/inventory/stock-inventory-summary", label: "Scan barcode / stock", icon: ScanBarcode, requiresSection: "Inventory" },
  { href: "/app/hr/my?tab=attendance", label: "Quick clock-in", icon: Timer },
  { href: "/app/production/quality", label: "Report defect", icon: TriangleAlert, requiresSection: "Manufacturing" },
];

const PORTAL_LINKS: DrawerLink[] = [
  { href: "/login?role=customer", label: "Customer portal login", icon: Users },
  { href: "/login?role=financier", label: "Financier portal login", icon: Landmark },
  { href: "/app/settings/external-access", label: "Manage external access", icon: Settings, requiresSection: "Settings" },
];

const groupHeadingClass = "px-1 text-xs font-semibold uppercase tracking-wide text-text-muted";

const drawerLinkClass =
  "flex min-h-11 items-center gap-2 rounded-md px-2 py-2 text-sm text-text-secondary hover:bg-state-hover";

/** Keep whole sections whose name matches; otherwise keep only the matching pages. */
function filterSectionsByQuery(sections: MenuSection[], query: string): MenuSection[] {
  const q = query.trim().toLowerCase();
  if (!q) return sections;
  const matches = (label: string) => label.toLowerCase().includes(q);
  return sections
    .map((s) => {
      if (matches(s.section)) return s;
      if (s.subsections && s.subsections.length > 0) {
        const subsections = s.subsections
          .map((sub) => (matches(sub.label) ? sub : { ...sub, items: sub.items.filter((i) => matches(i.label)) }))
          .filter((sub) => sub.items.length > 0);
        return { ...s, directLink: undefined, subsections };
      }
      return { ...s, directLink: undefined, items: s.items.filter((i) => matches(i.label)) };
    })
    .filter((s) => {
      if (s.directLink) return true;
      if (s.subsections && s.subsections.length > 0) return true;
      return s.items.length > 0;
    });
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
  // One module open at a time, shared with the desktop sidebar; it stays open until the user
  // closes it or signs in again (after sign-in every module starts closed).
  const [openSection, setOpenSection] = useOpenMenuSection();
  const moreButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const mobileV2 = isMobileUiV2Enabled(featureFlags);
  // With mobile_ui_v2 the current module starts open; this remembers that the user closed it.
  const [currentClosed, setCurrentClosed] = useState(false);

  /** Every section the user may open (same filter as the desktop sidebar and search). */
  const permittedSections = useMemo(
    () =>
      filterVisibleMenuSections(menuSections, {
        tenantType,
        enabledOptionalProductionUnits,
        featureFlags,
        hasPermission,
      }),
    [tenantType, enabledOptionalProductionUnits, featureFlags, hasPermission],
  );

  const financeHubsOn = isFinanceHubsV2Enabled(featureFlags);

  const tabs = useMemo(() => {
    const picked = mobileV2
      ? pickMobileTabs(new Set(permittedSections.map((s) => s.section)))
      : bottomNavItems.filter(
          (item) =>
            isVisible(tenantType, item.visibleFor) &&
            isMenuPermissionAllowed(item.permissionKey, featureFlags, hasPermission),
        );
    if (!financeHubsOn) return picked;
    // finance_hubs_v2: the Finance tab opens the first Finance hub the user may see.
    const firstHub = permittedSections.find((s) => s.section === "Finance")?.items[0]?.href;
    return firstHub ? picked.map((tab) => (tab.key === "finance" ? { ...tab, href: firstHub } : tab)) : picked;
  }, [mobileV2, financeHubsOn, permittedSections, tenantType, featureFlags, hasPermission]);

  /** Sections listed in the More menu (mobile_ui_v2 leaves out Reports, AI Tools and Settings). */
  const filteredSections = useMemo(
    () => (mobileV2 ? mobileMenuSections(permittedSections) : permittedSections),
    [mobileV2, permittedSections],
  );

  const visibleSectionNames = useMemo(
    () => new Set(filteredSections.map((s) => s.section)),
    [filteredSections],
  );
  const isDrawerLinkVisible = (link: DrawerLink) =>
    !link.requiresSection || visibleSectionNames.has(link.requiresSection);
  const shortcuts = MOBILE_SHORTCUTS.filter(isDrawerLinkVisible);
  const portalLinks = PORTAL_LINKS.filter(isDrawerLinkVisible);

  const filteredDrawerSections = useMemo(
    () => filterSectionsByQuery(filteredSections, drawerSearch),
    [drawerSearch, filteredSections],
  );
  // HR pages are tabs inside hubs, not sidebar items; search them by tab name too.
  const hrTabMatches = useMemo<DrawerLink[]>(() => {
    const q = drawerSearch.trim().toLowerCase();
    if (!q || !visibleSectionNames.has("HR")) return [];
    return hrTabPaletteRoutes(featureFlags)
      .filter((r) => r.label.toLowerCase().includes(q))
      .map((r) => ({ href: r.href, label: `${r.label} · ${r.section.replace(/^HR · /, "")}`, icon: r.icon }));
  }, [drawerSearch, featureFlags, visibleSectionNames]);

  // finance_hubs_v2: Finance pages are tabs inside hubs; search them by tab name too.
  const financeTabMatches = useMemo<DrawerLink[]>(() => {
    const q = drawerSearch.trim().toLowerCase();
    if (!q || !financeHubsOn || !visibleSectionNames.has("Finance")) return [];
    const canAccess = (key: string) => isMenuPermissionAllowed(key, featureFlags, hasPermission);
    return financeTabPaletteRoutes(featureFlags, canAccess)
      .filter((r) => r.label.toLowerCase().includes(q))
      .map((r) => ({ href: r.href, label: `${r.label} · ${r.section.replace(/^Finance · /, "")}`, icon: r.icon }));
  }, [drawerSearch, financeHubsOn, featureFlags, hasPermission, visibleSectionNames]);

  useEffect(() => {
    setIsMoreOpen(false);
    setDrawerSearch("");
  }, [location.pathname]);

  /** Module of the page you are on: the longest matching link wins, and `/app` only matches the dashboard. */
  const currentSectionName = useMemo(() => {
    let best: { section: string; length: number } | null = null;
    for (const s of filteredSections) {
      for (const href of sectionHrefs(s)) {
        const path = href.split("?")[0]!;
        const matches = path === "/app" ? location.pathname === "/app" : isPathMatch(location.pathname, path);
        if (matches && (!best || path.length > best.length)) best = { section: s.section, length: path.length };
      }
    }
    return best?.section ?? null;
  }, [filteredSections, location.pathname]);

  const defaultOpenSection = mobileV2 && openSection === null && !currentClosed ? currentSectionName : null;
  const isSectionOpen = (name: string) => openSection === name || defaultOpenSection === name;

  const toggleSection = (name: string) => {
    if (defaultOpenSection === name) {
      setCurrentClosed(true);
      return;
    }
    if (openSection === name && name === currentSectionName) setCurrentClosed(true);
    const opening = openSection !== name;
    setOpenSection(opening ? name : null);
    if (!opening) return;
    // Bring the opened module's header to the top so its pages are visible without extra scrolling.
    window.setTimeout(() => {
      document.getElementById(`more-section-${name}`)?.scrollIntoView?.({ block: "start", behavior: "smooth" });
    }, 0);
  };

  const isSearching = drawerSearch.trim().length > 0;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    if (isMoreOpen) {
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMoreOpen]);

  const closeMore = useCallback((restoreFocus = true) => {
    setIsMoreOpen(false);
    setDrawerSearch("");
    if (restoreFocus) window.setTimeout(() => moreButtonRef.current?.focus(), 0);
  }, []);

  useEffect(() => {
    if (isMoreOpen) setCurrentClosed(false);
  }, [isMoreOpen]);

  useEffect(() => {
    if (!isMoreOpen) return;
    // Focus the close button (not the search box) so phones do not pop up the keyboard.
    closeButtonRef.current?.focus();
    const remembered = readOpenMenuSection();
    if (remembered) {
      window.setTimeout(() => {
        document.getElementById(`more-section-${remembered}`)?.scrollIntoView?.({ block: "start" });
      }, 0);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeMore();
        return;
      }
      if (e.key !== "Tab" || !drawerRef.current) return;
      // Keep keyboard focus inside the open drawer (it is a modal dialog).
      const focusable = drawerRef.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input");
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isMoreOpen, closeMore]);

  const renderDrawerLink = (link: DrawerLink) => {
    const Icon = link.icon;
    return (
      <Link
        key={link.href}
        to={link.href}
        onClick={() => closeMore(false)}
        onMouseEnter={() => prefetchSidebarRoute(link.href)}
        onFocus={() => prefetchSidebarRoute(link.href)}
        className={drawerLinkClass}
      >
        <Icon className="h-4 w-4 shrink-0 text-text-muted" />
        <span className="truncate">{link.label}</span>
      </Link>
    );
  };

  const renderSectionToggle = ({
    name,
    icon: Icon,
    count,
    isOpen,
    isCurrent = false,
    disabled = false,
  }: {
    name: string;
    icon: ComponentType<{ className?: string }>;
    count: number;
    isOpen: boolean;
    isCurrent?: boolean;
    disabled?: boolean;
  }) => (
    <h3>
      <button
        type="button"
        onClick={() => toggleSection(name)}
        disabled={disabled}
        aria-expanded={isOpen}
        aria-controls={isOpen ? `more-panel-${name}` : undefined}
        className="flex min-h-12 w-full items-center gap-2 rounded-lg px-3 text-left disabled:cursor-default"
      >
        <Icon className={`h-4 w-4 shrink-0 ${isCurrent ? "text-brand-primary" : "text-text-secondary"}`} />
        <span
          className={`flex-1 truncate text-sm font-semibold ${isCurrent ? "text-brand-primary" : "text-text-primary"}`}
        >
          {name}
        </span>
        {isCurrent && (
          <span aria-hidden className="rounded-full bg-brand-subtle px-2 py-0.5 text-[10px] font-semibold text-brand-primary">
            You are here
          </span>
        )}
        <span aria-hidden className="text-xs text-text-muted">
          {count}
        </span>
        {!disabled && (
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${isOpen ? "rotate-180" : ""}`}
          />
        )}
      </button>
    </h3>
  );

  const renderPortalsSection = () => (
    <section id={`more-section-${PORTALS_SECTION}`} className="rounded-xl border border-border bg-surface-raised">
      {renderSectionToggle({
        name: PORTALS_SECTION,
        icon: Users,
        count: portalLinks.length,
        isOpen: isSectionOpen(PORTALS_SECTION),
      })}
      {isSectionOpen(PORTALS_SECTION) && (
        <div id={`more-panel-${PORTALS_SECTION}`} className="space-y-1 px-3 pb-3">
          {portalLinks.map(renderDrawerLink)}
        </div>
      )}
    </section>
  );

  const renderModuleSection = (section: MenuSection) => {
    const SectionIcon = section.icon;
    const isCurrent = section.section === currentSectionName;
    // A module with one page (e.g. Dashboard) opens that page straight away.
    const onlyHref = sectionPageCount(section) === 1 ? sectionHrefs(section)[0] : undefined;
    if (onlyHref && !isSearching) {
      return (
        <section key={section.section} className="rounded-lg border border-border bg-surface-raised">
          <Link
            to={onlyHref}
            onClick={() => closeMore(false)}
            onMouseEnter={() => prefetchSidebarRoute(onlyHref)}
            onFocus={() => prefetchSidebarRoute(onlyHref)}
            className="flex min-h-12 items-center gap-2 rounded-lg px-3 text-left"
          >
            <SectionIcon className={`h-4 w-4 shrink-0 ${isCurrent ? "text-brand-primary" : "text-text-secondary"}`} />
            <span className={`flex-1 truncate text-sm font-semibold ${isCurrent ? "text-brand-primary" : "text-text-primary"}`}>
              {section.section}
            </span>
          </Link>
        </section>
      );
    }
    // While searching every matching module is shown open; otherwise only the tapped one.
    const isOpen = isSearching || isSectionOpen(section.section);
    return (
      <section
        key={section.section}
        id={`more-section-${section.section}`}
        className="rounded-lg border border-border bg-surface-raised"
      >
        {renderSectionToggle({
          name: section.section,
          icon: SectionIcon,
          count: sectionPageCount(section),
          isOpen,
          isCurrent,
          disabled: isSearching,
        })}
        {isOpen && (
          <div id={`more-panel-${section.section}`} className="space-y-1 px-3 pb-3">
            {section.directLink &&
              renderDrawerLink({ href: section.directLink, label: section.section, icon: SectionIcon })}
            {section.subsections && section.subsections.length > 0
              ? section.subsections.map((sub) => (
                  <div key={sub.label} className="space-y-0.5">
                    <p className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                      {sub.label}
                    </p>
                    {sub.items.map((item) => renderDrawerLink(item))}
                  </div>
                ))
              : section.items.map((item) => renderDrawerLink(item))}
          </div>
        )}
      </section>
    );
  };

  const currentDrawerSection = filteredDrawerSections.find((s) => s.section === currentSectionName) ?? null;
  const otherDrawerSections = filteredDrawerSections.filter((s) => s !== currentDrawerSection);

  return (
    <>
      <nav
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-border bg-surface-subtle/95 backdrop-blur supports-[backdrop-filter]:bg-surface-subtle/85 pb-[env(safe-area-inset-bottom)] lg:hidden"
        aria-label="Main menu"
      >
        <div
          className="grid h-16 px-1"
          style={{ gridTemplateColumns: `repeat(${Math.max(tabs.length, 1)}, minmax(0, 1fr))` }}
        >
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
                  ref={moreButtonRef}
                  type="button"
                  onClick={() => (isMoreOpen ? closeMore() : setIsMoreOpen(true))}
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
                aria-current={active ? "page" : undefined}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {isMoreOpen && (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-black/30"
            onClick={() => closeMore()}
            aria-label="Close menu"
            tabIndex={-1}
          />
          <div
            ref={drawerRef}
            id="mobile-more-menu"
            role="dialog"
            aria-modal="true"
            aria-label="All modules"
            className="absolute inset-x-0 bottom-0 flex h-[85dvh] max-h-[85vh] flex-col overflow-hidden rounded-t-2xl border-t border-border bg-surface-subtle shadow-2xl pb-[env(safe-area-inset-bottom)]"
          >
            <div className="shrink-0 bg-surface-subtle px-4 pt-4 pb-2 border-b border-border-subtle">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-text-primary">All Modules</h2>
                <button
                  ref={closeButtonRef}
                  type="button"
                  onClick={() => closeMore()}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-base"
                  aria-label="Close modules"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-3 py-2">
                <Search className="h-4 w-4 text-text-muted" />
                <input
                  type="search"
                  placeholder="Filter modules and pages..."
                  aria-label="Filter modules and pages"
                  className="flex-1 bg-transparent text-base outline-none text-text-primary placeholder:text-text-muted"
                  value={drawerSearch}
                  onChange={(e) => setDrawerSearch(e.target.value)}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain p-4 pb-4">
              {!drawerSearch.trim() && shortcuts.length > 0 && (
                <section className="rounded-xl border border-border bg-surface-raised p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                    {mobileV2 ? "Shortcuts" : "Mobile shortcuts"}
                  </h3>
                  <div className="space-y-1">{shortcuts.map(renderDrawerLink)}</div>
                </section>
              )}
              {!isSearching && !mobileV2 && renderPortalsSection()}
              {drawerSearch.trim() &&
                filteredDrawerSections.length === 0 &&
                hrTabMatches.length === 0 &&
                financeTabMatches.length === 0 && (
                <p className="px-2 py-6 text-center text-sm text-text-muted">No pages match “{drawerSearch.trim()}”.</p>
              )}
              {hrTabMatches.length > 0 && (
                <section className="rounded-lg border border-border bg-surface-raised p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">HR tabs</h3>
                  <div className="space-y-1">{hrTabMatches.map(renderDrawerLink)}</div>
                </section>
              )}
              {financeTabMatches.length > 0 && (
                <section className="rounded-lg border border-border bg-surface-raised p-3">
                  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Finance tabs</h3>
                  <div className="space-y-1">{financeTabMatches.map(renderDrawerLink)}</div>
                </section>
              )}
              {mobileV2 && !isSearching ? (
                <>
                  {currentDrawerSection && (
                    <div className="space-y-2">
                      <p className={groupHeadingClass}>Current module</p>
                      {renderModuleSection(currentDrawerSection)}
                    </div>
                  )}
                  <div className="space-y-2">
                    <p className={groupHeadingClass}>{currentDrawerSection ? "Other modules" : "Modules"}</p>
                    {otherDrawerSections.map(renderModuleSection)}
                    {renderPortalsSection()}
                  </div>
                </>
              ) : (
                filteredDrawerSections.map(renderModuleSection)
              )}
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
