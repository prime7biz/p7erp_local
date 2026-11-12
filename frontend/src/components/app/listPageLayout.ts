/**
 * Shared layout tokens for ERP list pages (Customers, Orders, Inquiries, Quotations, Vendors, inventory lists).
 * Import these into page components so structure and density stay consistent.
 */

/** Root wrapper directly under AppPageHeader */
export const listPageRootClass = "min-w-0 space-y-4";

/** Search / filter toolbar (single row on sm+) */
export const listPageFilterBarClass =
  "flex flex-col flex-wrap gap-2 rounded-lg border border-border bg-surface-raised p-2.5 sm:flex-row sm:items-center";

/** Larger filter panel (e.g. Customers AI + grid filters) */
export const listPageFilterPanelClass =
  "rounded-lg border border-border bg-surface-raised p-3 space-y-3";

/** Compact panel wrapping a custom filter component (e.g. Vendors filter bar) */
export const listPagePanelClass =
  "rounded-lg border border-border bg-surface-raised p-2.5";

/** Primary search input in the list toolbar */
/**
 * Single focus stroke: border turns brand; ring off so there is no second outline.
 * (Keep as one literal string so Tailwind JIT includes utilities.)
 */
export const erpControlFocusClass =
  "focus:border-brand-primary focus:outline-none focus:ring-0";

export const listPageToolbarInputClass =
  "w-full min-w-[12rem] flex-1 rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0";

/** Status / facet select in the list toolbar */
export const listPageToolbarSelectClass =
  "w-full rounded-lg border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-primary focus:border-brand-primary focus:outline-none focus:ring-0 sm:w-40";

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
export const listPageKpiGridClass = "grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3";

/** KPI summary grid (3 columns) — e.g. Quotations */
export const listPageKpiGridClass3 = "grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3";

export const listPageKpiCardClass =
  "rounded-lg border border-border bg-surface-raised p-3";

export const listPageKpiLabelClass =
  "text-xs font-semibold uppercase tracking-wide text-text-muted";

/** Inline error banner under filters */
export const listPageErrorClass =
  "rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-2.5 text-sm text-status-danger-foreground";

/** Outer card around scrollable table + pagination */
export const listPageTableCardClass =
  "rounded-lg border border-border bg-surface-raised overflow-hidden";

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

/**
 * Phone touch sizes (used with the tenant switch `mobile_ui_v2`). Never applied globally: desktop
 * tables and toolbars keep their compact controls.
 * - `mobileTouchControlClass`: always 44px tall; add it only when the page already knows it is on a phone.
 * - `mobileFieldClass`: 44px below `sm`, the usual 38px from `sm` up (same as inventory `touchFieldClass`).
 */
export const mobileTouchControlClass = "min-h-11 touch-manipulation";
export const mobileFieldClass = "min-h-[44px] touch-manipulation sm:min-h-[38px]";

/**
 * Save / Cancel bar that stays visible at the bottom of a long phone form or dialog, above the
 * iPhone home bar. From `sm` up it is a normal row of buttons.
 */
export const mobileStickyActionsClass =
  "sticky bottom-0 z-10 -mx-4 flex flex-wrap justify-end gap-2 border-t border-border bg-surface-raised px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:px-0 sm:pb-0";

/**
 * Same bar for a form on a normal page (not a dialog): it sits just above the bottom menu, which
 * covers the last 4rem of the screen below `lg`. The right padding leaves room for the floating
 * quick-create (+) button so it never covers the Save button. No negative margin, so it fits any
 * card padding.
 */
export const mobilePageStickyActionsClass =
  "sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap justify-end gap-2 border-t border-border bg-surface-raised py-3 pr-16 sm:static sm:border-0 sm:bg-transparent sm:py-0 sm:pr-0";

/** Aliases for portal / settings tables (same tokens as ERP list tables) */
export const listTableHeadCellClass = listTableThClass;
export const listTableRowClass = listTableTrClass;
