import { RefreshCw, TrendingUp } from "lucide-react";

export function HubHeader({ onRefreshAll, refreshing }: { onRefreshAll: () => void; refreshing: boolean }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-text-primary">
          <TrendingUp className="h-5 w-5 text-status-success-foreground" /> AI Predictions
        </h1>
        <p className="text-sm text-text-muted">
          Custom and quick forecasts, KPIs, run history with charts, and profitability narrative — tenant-scoped and permission-aware.
        </p>
      </div>
      <button
        type="button"
        onClick={onRefreshAll}
        disabled={refreshing}
        className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh all
      </button>
    </div>
  );
}
