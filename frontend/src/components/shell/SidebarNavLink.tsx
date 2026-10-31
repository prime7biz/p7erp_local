import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { prefetchSidebarRoute } from "@/app/prefetchRoutes";
import { SidebarTooltip } from "@/components/shell/SidebarTooltip";

type SidebarNavLinkProps = {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  isCollapsed: boolean;
  badge?: string;
  /** Indent for nested items under a section. */
  nested?: boolean;
  activeLinkRef?: (el: HTMLAnchorElement | null) => void;
};

export function SidebarNavLink({
  href,
  label,
  icon: Icon,
  isActive,
  isCollapsed,
  badge,
  nested = false,
  activeLinkRef,
}: SidebarNavLinkProps) {
  const tooltipLabel = badge ? `${label} (${badge})` : label;

  const link = (
    <Link
      to={href}
      ref={isActive ? activeLinkRef : undefined}
      onMouseEnter={() => prefetchSidebarRoute(href)}
      onFocus={() => prefetchSidebarRoute(href)}
      aria-current={isActive ? "page" : undefined}
      aria-label={isCollapsed ? tooltipLabel : undefined}
      className={`relative group flex items-center gap-2 h-8 py-1.5 rounded-md no-underline transition ${
        isCollapsed ? "justify-center px-2" : nested ? "min-w-0 px-3 pl-9" : "min-w-0 px-3"
      } ${
        isActive
          ? "bg-brand-primary/10 text-brand-primary font-medium"
          : "text-text-secondary hover:text-text-primary hover:bg-surface-subtle"
      }`}
    >
      {isActive && (
        <span
          aria-hidden
          className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r-full bg-brand-primary"
        />
      )}
      <Icon className="h-4 w-4 shrink-0" />
      {!isCollapsed && (
        <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
          <span className="truncate text-[13px]">{label}</span>
          {badge ? (
            <span className="shrink-0 rounded border border-border bg-surface-base px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
              {badge}
            </span>
          ) : null}
        </span>
      )}
    </Link>
  );

  return (
    <SidebarTooltip label={tooltipLabel} enabled={isCollapsed}>
      {link}
    </SidebarTooltip>
  );
}
