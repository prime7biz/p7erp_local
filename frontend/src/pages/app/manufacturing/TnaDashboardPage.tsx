import { useEffect, useState } from "react";

import { api } from "@/api/client";

export function TnaDashboardPage() {
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof api.getMfgTnaDashboardSummary>> | null>(null);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.listMfgTnaPlans>>>([]);
  const [error, setError] = useState("");

  const load = async () => {
    setError("");
    try {
      const [summaryRow, planRows] = await Promise.all([api.getMfgTnaDashboardSummary(), api.listMfgTnaPlans()]);
      setSummary(summaryRow);
      setPlans(planRows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load TNA dashboard");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">TNA Dashboard</h1>
        <p className="text-sm text-text-muted">Track active plans, delayed tasks, and execution health.</p>
      </div>
      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div> : null}

      {summary ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
          <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Total Plans</div><div className="text-xl font-semibold">{summary.total_plans}</div></div>
          <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Active Plans</div><div className="text-xl font-semibold">{summary.active_plans}</div></div>
          <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Done Tasks</div><div className="text-xl font-semibold">{summary.done_tasks}</div></div>
          <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Delayed Tasks</div><div className="text-xl font-semibold">{summary.delayed_tasks}</div></div>
          <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Upcoming (7d)</div><div className="text-xl font-semibold">{summary.upcoming_tasks_7d}</div></div>
          <div className="rounded-xl border border-border bg-surface-raised p-3"><div className="text-xs text-text-muted">Overdue</div><div className="text-xl font-semibold">{summary.overdue_tasks}</div></div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
            <tr><th className="px-3 py-2">Plan Code</th><th className="px-3 py-2">Start</th><th className="px-3 py-2">Target End</th><th className="px-3 py-2">Status</th></tr>
          </thead>
          <tbody>
            {plans.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-3 py-2 font-medium">{row.plan_code}</td>
                <td className="px-3 py-2">{row.start_date}</td>
                <td className="px-3 py-2">{row.target_end_date ?? "-"}</td>
                <td className="px-3 py-2">{row.status}</td>
              </tr>
            ))}
            {plans.length === 0 ? <tr><td className="px-3 py-8 text-center text-text-muted" colSpan={4}>No TNA plans yet.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
