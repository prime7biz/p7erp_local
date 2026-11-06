import { Link } from "react-router-dom";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import {
  isSidebarNavItemActive,
  type NavItem,
  type NavSubsection,
} from "@/app/sidebarConfig";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import { SidebarNavLink } from "@/components/shell/SidebarNavLink";
import { SidebarTooltip } from "@/components/shell/SidebarTooltip";

type SidebarSectionProps = {
  section: string;
  icon: LucideIcon;
  items: NavItem[];
  subsections?: NavSubsection[];
  isOpen: boolean;
  onToggle: () => void;
  isActive: boolean;
  pathname: string;
  isCollapsed: boolean;
  hovered: boolean;
  onHoverChange: (hovered: boolean) => void;
  index: number;
  activeLinkRef: (el: HTMLAnchorElement | null) => void;
};

function sectionDomId(s: string) {
  return `sidebar-section-${s.replace(/\s+/g, "-").toLowerCase()}`;
}
function buttonDomId(s: string) {
  return `sidebar-btn-${s.replace(/\s+/g, "-").toLowerCase()}`;
}

/** Collapsible module section with nested items and collapsed flyout menu. */
export function SidebarSection({
  section,
  icon: SectionIcon,
  items,
  subsections,
  isOpen,
  onToggle,
  isActive,
  pathname,
  isCollapsed,
  hovered,
  onHoverChange,
  index,
  activeLinkRef,
}: SidebarSectionProps) {
  const hasSubsections = Boolean(subsections && subsections.length > 0);
  const flatFlyoutItems = (subsections ?? []).flatMap((sub) => sub.items).concat(items);
  const sectionWrapperClass =
    (index > 0 ? "border-t border-border/70 pt-2 mt-0.5 mb-1" : "mb-1") + " relative";

  return (
    <div className={sectionWrapperClass}>
      {/* Opaque background: the open-state colour is translucent and items scroll underneath. */}
      <div className={isCollapsed ? undefined : "sticky top-0 z-10 rounded-md bg-surface-subtle"}>
        <SidebarTooltip label={section} enabled={isCollapsed}>
          <button
            type="button"
            id={buttonDomId(section)}
            aria-expanded={isOpen}
            aria-controls={sectionDomId(section)}
            aria-label={isCollapsed ? section : undefined}
            onMouseEnter={() => isCollapsed && onHoverChange(true)}
            onMouseLeave={() => isCollapsed && onHoverChange(false)}
            onClick={onToggle}
            className={`relative flex items-center gap-2 w-full h-9 rounded-md transition text-left ${
              isCollapsed ? "justify-center px-2" : "px-3"
            } ${
              isOpen
                ? "text-brand-primary bg-brand-primary/5"
                : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
            }`}
          >
            {isCollapsed && isActive && (
              <span
                aria-hidden
                className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-primary"
              />
            )}
            <SectionIcon className="h-4 w-4 shrink-0" />
            {!isCollapsed && (
              <>
                <span className="flex-1 truncate text-sm font-medium">{section}</span>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </>
            )}
          </button>
        </SidebarTooltip>
      </div>

      {!isCollapsed && isOpen && (
        <div
          id={sectionDomId(section)}
          className="pl-2 pr-1 py-1 space-y-1"
          role="region"
          aria-labelledby={buttonDomId(section)}
        >
          {hasSubsections && subsections
            ? subsections.map((sub) => (
                <div key={sub.label} className="space-y-0.5">
                  <p className="px-3 pt-1 pb-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
                    {sub.label}
                  </p>
                  <div className="pl-2 space-y-0.5 border-l border-border/60 ml-2">
                    {sub.items.map((item) => (
                      <SidebarNavLink
                        key={item.href}
                        href={item.href}
                        label={item.label}
                        icon={item.icon}
                        badge={item.badge}
                        isActive={isSidebarNavItemActive(pathname, item.href, item.exact)}
                        isCollapsed={false}
                        nested
                        activeLinkRef={activeLinkRef}
                      />
                    ))}
                  </div>
                </div>
              ))
            : items.map((item) => (
                <SidebarNavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  icon={item.icon}
                  badge={item.badge}
                  isActive={isSidebarNavItemActive(pathname, item.href, item.exact)}
                  isCollapsed={false}
                  nested
                  activeLinkRef={activeLinkRef}
                />
              ))}
        </div>
      )}

      {isCollapsed && hovered && (
        <div
          className="absolute left-full top-0 ml-0 z-20 min-w-[200px] rounded-r-lg border border-border border-l-0 bg-surface-raised py-2 shadow-dropdown"
          onMouseEnter={() => onHoverChange(true)}
          onMouseLeave={() => onHoverChange(false)}
          role="menu"
        >
          <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-text-muted">{section}</p>
          {flatFlyoutItems.map((item) => {
            const ItemIcon = item.icon;
            const active = isSidebarNavItemActive(pathname, item.href, item.exact);
            return (
              <Link
                key={item.href}
                to={item.href}
                role="menuitem"
                onMouseEnter={() => prefetchSidebarRoute(item.href)}
                aria-current={active ? "page" : undefined}
                className={`relative flex items-center gap-2 px-3 py-1.5 text-sm no-underline ${
                  active
                    ? "bg-brand-primary/10 text-brand-primary font-medium"
                    : "text-text-secondary hover:bg-surface-subtle"
                }`}
              >
                {active && (
                  <span
                    aria-hidden
                    className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-primary"
                  />
                )}
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
