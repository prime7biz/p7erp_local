import type { ReactNode } from "react";

type SidebarTooltipProps = {
  label: string;
  children: ReactNode;
  /** Show tooltip only when sidebar is collapsed (caller decides). */
  enabled?: boolean;
};

/**
 * Custom dark pill tooltip for collapsed sidebar icons.
 * Uses CSS group-hover / group-focus-within so it works with keyboard focus too.
 */
export function SidebarTooltip({ label, children, enabled = true }: SidebarTooltipProps) {
  if (!enabled) return <>{children}</>;

  return (
    <span className="relative group/tooltip inline-flex">
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md bg-surface-inverse px-2 py-1 text-[11px] font-medium text-text-inverse opacity-0 shadow-dropdown transition-opacity group-hover/tooltip:opacity-100 group-focus-within/tooltip:opacity-100"
      >
        {label}
        <span
          aria-hidden
          className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-surface-inverse"
        />
      </span>
    </span>
  );
}
