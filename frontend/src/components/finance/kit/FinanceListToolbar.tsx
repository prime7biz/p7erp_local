import type { ReactNode } from "react";
import { listPageFilterBarClass, listPageToolbarInputClass } from "@/components/app/listPageLayout";

/**
 * Search + filter slot + primary Add button for finance list pages.
 */
export function FinanceListToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Search…",
  filters,
  primaryAction,
  secondaryActions,
  className = "",
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  primaryAction?: { label: string; onClick: () => void; disabled?: boolean };
  secondaryActions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${listPageFilterBarClass} ${className}`.trim()}>
      {onSearchChange != null ? (
        <input
          className={listPageToolbarInputClass}
          placeholder={searchPlaceholder}
          value={search ?? ""}
          onChange={(e) => onSearchChange(e.target.value)}
          aria-label={searchPlaceholder}
        />
      ) : null}
      {filters}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        {secondaryActions}
        {primaryAction ? (
          <button
            type="button"
            className="rounded-lg bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90 disabled:opacity-50"
            onClick={primaryAction.onClick}
            disabled={primaryAction.disabled}
          >
            {primaryAction.label}
          </button>
        ) : null}
      </div>
    </div>
  );
}
