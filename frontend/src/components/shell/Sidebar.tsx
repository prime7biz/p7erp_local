import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { BookOpen, ChevronLeft, ChevronRight } from "lucide-react";
import type { MeResponse, TenantType } from "@/api/client";
import { isSidebarNavItemActive, menuSections } from "@/app/sidebarConfig";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import { getNavFavorites } from "@/components/shell/navShortcuts";
import { SidebarNavLink } from "@/components/shell/SidebarNavLink";
import { SidebarSection } from "@/components/shell/SidebarSection";
import { SidebarShortcuts } from "@/components/shell/SidebarShortcuts";
import { SidebarTooltip } from "@/components/shell/SidebarTooltip";
import { filterVisibleMenuSections, getNameInitial } from "@/components/shell/sidebarNavUtils";
import { useOpenMenuSection } from "@/components/shell/menuOpenSection";

export type SidebarProps = {
  tenantType: TenantType;
  tenantName: string;
  companyCode: string | null;
  userName: string;
  userId: number;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  enabledOptionalProductionUnits: string[];
  featureFlags?: MeResponse["feature_flags"];
  hasPermission: (key: string) => boolean;
  compact?: boolean;
};

export function Sidebar({
  tenantType,
  tenantName,
  companyCode,
  userName,
  userId,
  isCollapsed,
  onToggleCollapse,
  enabledOptionalProductionUnits,
  featureFlags,
  hasPermission,
  compact = false,
}: SidebarProps) {
  const location = useLocation();
  // One module open at a time; it stays open (across pages and reloads) until the user closes it
  // or signs in again. After sign-in every module starts closed.
  const [openSection, setOpenSection] = useOpenMenuSection();
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);
  const [userPopoverOpen, setUserPopoverOpen] = useState(false);
  const activeLinkRef = useRef<HTMLAnchorElement | null>(null);
  const userPopoverRef = useRef<HTMLDivElement>(null);

  // Re-read on navigation so favorites starred in the command palette show up.
  const favorites = useMemo(() => {
    void location.pathname;
    return getNavFavorites(userId);
  }, [userId, location.pathname]);

  const filtered = useMemo(
    () =>
      filterVisibleMenuSections(menuSections, {
        tenantType,
        enabledOptionalProductionUnits,
        featureFlags,
        hasPermission,
      }),
    [tenantType, enabledOptionalProductionUnits, featureFlags, hasPermission],
  );

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

  const setActiveRef = (el: HTMLAnchorElement | null) => {
    activeLinkRef.current = el;
  };

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
        <SidebarTooltip label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"} enabled={isCollapsed}>
          <button
            type="button"
            onClick={onToggleCollapse}
            aria-label="Toggle sidebar"
            className="h-8 w-8 rounded-md hover:bg-surface-base text-text-muted flex items-center justify-center"
          >
            {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
          </button>
        </SidebarTooltip>
      </div>

      {isCollapsed ? (
        <div className="relative border-b border-border bg-surface-subtle/80 px-2 py-2">
          <SidebarTooltip label={userName} enabled>
            <button
              type="button"
              data-sidebar-user-trigger
              onClick={() => setUserPopoverOpen((prev) => !prev)}
              className="w-10 h-10 rounded-full bg-brand-primary/10 text-brand-primary font-semibold flex items-center justify-center text-sm hover:bg-brand-primary/20 transition"
              aria-expanded={userPopoverOpen}
              aria-haspopup="true"
              aria-label={userName}
            >
              {getNameInitial(userName)}
            </button>
          </SidebarTooltip>
          {userPopoverOpen && (
            <div
              ref={userPopoverRef}
              className="absolute left-full top-0 ml-1 z-20 w-56 rounded-lg border border-border bg-surface-raised p-3 shadow-dropdown"
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

      <nav
        className={`sidebar-scroll flex-1 overflow-y-auto space-y-0.5 ${compact ? "p-1.5" : "p-2"}`}
        aria-label="Main navigation"
      >
        <SidebarShortcuts favorites={favorites} isCollapsed={isCollapsed} />

        {filtered.map((mod, index) => {
          const hasSubsections = Boolean(mod.subsections && mod.subsections.length > 0);
          const hasItems = mod.items.length > 0 || hasSubsections;
          const directLink = mod.directLink;
          const hasActiveItem =
            hasSubsections && mod.subsections
              ? mod.subsections.some((sub) =>
                  sub.items.some((item) => isSidebarNavItemActive(location.pathname, item.href, item.exact)),
                )
              : hasItems &&
                mod.items.some((item) => isSidebarNavItemActive(location.pathname, item.href, item.exact));
          const sectionWrapperClass =
            (index > 0 ? "border-t border-border/70 pt-2 mt-0.5 mb-1" : "mb-1") + (hasItems ? " relative" : "");

          if (hasItems) {
            return (
              <SidebarSection
                key={mod.section}
                section={mod.section}
                icon={mod.icon}
                items={mod.items}
                subsections={mod.subsections}
                isOpen={openSection === mod.section}
                onToggle={() => {
                  setOpenSection(openSection === mod.section ? null : mod.section);
                }}
                isActive={hasActiveItem}
                pathname={location.pathname}
                isCollapsed={isCollapsed}
                hovered={hoveredSection === mod.section}
                onHoverChange={(hovered) => setHoveredSection(hovered ? mod.section : null)}
                index={index}
                activeLinkRef={setActiveRef}
              />
            );
          }

          if (directLink) {
            const directActive =
              location.pathname === directLink ||
              (directLink !== "/app" && location.pathname.startsWith(directLink));
            return (
              <div key={mod.section} className={sectionWrapperClass}>
                <SidebarNavLink
                  href={directLink}
                  label={mod.section}
                  icon={mod.icon}
                  isActive={directActive}
                  isCollapsed={isCollapsed}
                  activeLinkRef={setActiveRef}
                />
              </div>
            );
          }
          return null;
        })}
      </nav>

      <div className="border-t border-border bg-surface-subtle p-2">
        <SidebarTooltip label="Help & Tutorials" enabled={isCollapsed}>
          <Link
            to="/app/tutorials"
            onMouseEnter={() => prefetchSidebarRoute("/app/tutorials")}
            onFocus={() => prefetchSidebarRoute("/app/tutorials")}
            aria-label={isCollapsed ? "Help & Tutorials" : undefined}
            className={`flex items-center gap-2 h-8 rounded-md text-text-secondary hover:text-text-primary hover:bg-surface-subtle ${
              isCollapsed ? "justify-center px-2" : "px-3"
            }`}
          >
            <BookOpen className="h-4 w-4" />
            {!isCollapsed && <span className="text-sm">Help & Tutorials</span>}
          </Link>
        </SidebarTooltip>
      </div>
    </aside>
  );
}
