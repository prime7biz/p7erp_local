import { useEffect, useState } from "react";
import { api, type HrPerformanceDashboardResponse } from "@/api/client";

export function HrPerformanceDashboardPage() {
  const [data, setData] = useState<HrPerformanceDashboardResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const load = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const row = await api.getHrPerformanceDashboard();
      setData(row);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load performance dashboard");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Performance Dashboard</h1>
          <p className="text-sm text-text-muted">Quick metrics for goals and reviews.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border px-3 py-1.5 text-sm text-text-secondary"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Total Goals</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{loading || !data ? "-" : data.total_goals}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Completed Goals</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{loading || !data ? "-" : data.completed_goals}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Pending Reviews</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{loading || !data ? "-" : data.pending_reviews}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface-raised p-4">
          <div className="text-xs uppercase text-text-muted">Average Rating</div>
          <div className="mt-2 text-2xl font-semibold text-text-primary">{loading || !data ? "-" : data.avg_rating}</div>
        </div>
      </div>
    </div>
  );
}
