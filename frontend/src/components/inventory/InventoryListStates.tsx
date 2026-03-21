/**
 * Shared loading / empty / error UI for inventory list and dashboard pages (Phase 4.2).
 */

type TableSkeletonProps = {
  rows?: number;
  cols?: number;
};

export function InventoryTableSkeleton({ rows = 8, cols = 5 }: TableSkeletonProps) {
  return (
    <div
      className="animate-pulse rounded-xl border border-border bg-surface-raised overflow-x-auto"
      aria-busy="true"
      aria-label="Loading table"
    >
      <table className="min-w-full">
        <thead className="bg-surface-subtle">
          <tr>
            {Array.from({ length: cols }).map((_, i) => (
              <th key={i} className="px-3 py-2">
                <div className="h-3 rounded bg-surface-subtle" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: rows }).map((_, ri) => (
            <tr key={ri} className="border-t border-border">
              {Array.from({ length: cols }).map((_, ci) => (
                <td key={ci} className="px-3 py-3">
                  <div className="h-4 rounded bg-surface-subtle/80" />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type KpiStripProps = { cards?: number };

export function InventoryKpiStripSkeleton({ cards = 4 }: KpiStripProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-busy="true" aria-label="Loading summary">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-surface-raised p-4">
          <div className="h-3 w-24 rounded bg-surface-subtle" />
          <div className="mt-3 h-8 w-16 rounded bg-surface-subtle" />
        </div>
      ))}
    </div>
  );
}

type CardListProps = { count?: number };

export function InventoryCardListSkeleton({ count = 3 }: CardListProps) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading list">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-xl border border-border bg-surface-raised p-4">
          <div className="h-5 w-48 rounded bg-surface-subtle" />
          <div className="mt-2 h-3 w-64 max-w-full rounded bg-surface-subtle" />
          <div className="mt-4 grid h-24 gap-2 rounded bg-surface-subtle/60 md:grid-cols-3" />
        </div>
      ))}
    </div>
  );
}

type EmptyProps = {
  title?: string;
  description?: string;
};

export function InventoryEmptyState({ title = "No records found", description }: EmptyProps) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-surface-subtle/40 px-6 py-12 text-center">
      <p className="text-sm font-medium text-text-secondary">{title}</p>
      {description ? <p className="mt-1 text-xs text-text-muted">{description}</p> : null}
    </div>
  );
}

type ErrorPanelProps = {
  message: string;
  onRetry: () => void;
};

export function InventoryErrorPanel({ message, onRetry }: ErrorPanelProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-status-danger/20 bg-status-danger-subtle px-3 py-3 text-sm text-status-danger-foreground sm:flex-row sm:items-center sm:justify-between">
      <span>{message}</span>
      <button
        type="button"
        className="shrink-0 rounded-lg border border-status-danger/30 bg-white px-3 py-1.5 text-xs font-medium text-status-danger-foreground hover:bg-red-50"
        onClick={onRetry}
      >
        Retry
      </button>
    </div>
  );
}

export function InventoryValuationSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading valuation">
      <div className="animate-pulse rounded-xl border border-border bg-surface-raised p-4">
        <div className="h-3 w-56 rounded bg-surface-subtle" />
        <div className="mt-3 h-10 w-48 rounded bg-surface-subtle" />
      </div>
      <InventoryTableSkeleton rows={10} cols={5} />
    </div>
  );
}
