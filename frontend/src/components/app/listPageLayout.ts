/**
 * Shared layout tokens for ERP list pages (Customers, Orders, Inquiries, Quotations, Vendors, inventory lists).
 * Import these into page components so structure and density stay consistent.
 */

/** Root wrapper directly under AppPageHeader */
export const listPageRootClass = "min-w-0 space-y-6";

/** Search / filter toolbar (single row on sm+) */
export const listPageFilterBarClass =
  "flex flex-col flex-wrap gap-2 rounded-xl border border-border bg-surface-raised p-3 shadow-sm sm:flex-row sm:items-center";

/** Larger filter panel (e.g. Customers AI + grid filters) */
export const listPageFilterPanelClass =
  "rounded-xl border border-border bg-surface-raised p-4 shadow-sm space-y-3";

/** Compact panel wrapping a custom filter component (e.g. Vendors filter bar) */
export const listPagePanelClass =
  "rounded-xl border border-border bg-surface-raised p-3 shadow-sm";

/** Primary search input in the list toolbar */
export const listPageToolbarInputClass =
  "w-full min-w-[12rem] flex-1 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring";

/** Status / facet select in the list toolbar */
export const listPageToolbarSelectClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-1 focus:ring-focus-ring sm:w-40";

/** Secondary button in the list toolbar (Clear, Refresh) */
export const listPageToolbarButtonClass =
  "rounded-lg border border-border-strong px-3 py-2 text-sm text-text-secondary hover:bg-surface-subtle";

/** Row of quick-filter chips under the toolbar */
export const listPageChipRowClass = "flex flex-wrap gap-2";

export const listPageChipActiveClass =
  "rounded-full border border-brand-primary bg-brand-primary/10 px-3 py-1 text-xs font-semibold text-brand-primary";

export const listPageChipInactiveClass =
  "rounded-full border border-border px-3 py-1 text-xs font-semibold text-text-secondary";

/** KPI summary grid (4 columns on sm+) */
export const listPageKpiGridClass = "grid grid-cols-1 gap-3 sm:grid-cols-4";

/** KPI summary grid (3 columns) — e.g. Quotations */
export const listPageKpiGridClass3 = "grid grid-cols-1 gap-3 sm:grid-cols-3";

export const listPageKpiCardClass =
  "rounded-xl border border-border bg-surface-raised p-4 shadow-sm";

export const listPageKpiLabelClass =
  "text-xs font-semibold uppercase tracking-wide text-text-muted";

/** Inline error banner under filters */
export const listPageErrorClass =
  "rounded-xl border border-status-danger/20 bg-status-danger-subtle px-4 py-3 text-sm text-status-danger-foreground";

/** Outer card around scrollable table + pagination */
export const listPageTableCardClass =
  "rounded-xl border border-border bg-surface-raised overflow-hidden shadow-sm";

export const listPageEmptyClass = "p-12 text-center text-text-muted";

export const listPageLoadingClass = "p-12 text-center text-text-muted";

/** Base table width + text size; add min-w-[…] in the page when needed */
export const listTableBaseClass = "w-full text-sm";

export const listTableTheadClass =
  "sticky top-0 z-[1] bg-surface-subtle border-b border-border";

export const listTableThClass =
  "px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-text-muted";

export const listTableThRightClass =
  "px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-text-muted";

export const listTableThCenterClass =
  "px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-text-muted";

export const listTableTdClass = "px-4 py-3 text-sm text-text-secondary";

export const listTableTdPrimaryClass = "px-4 py-3 text-sm font-medium text-text-primary";

export const listTableTrClass =
  "border-b border-border-subtle last:border-0 hover:bg-surface-subtle/80";
