import { useCallback, useEffect, useState } from "react";
import { api, type HrPayrollRunResponse } from "@/api/client";
import { RowActionsMenu } from "@/components/app/RowActionsMenu";
import { logApiError } from "@/utils/logApiError";

/** Runs waiting for a manager decision (approval records only exist after a decision). */
const AWAITING_STATUSES = ["FINALIZED", "CHECKED"] as const;

export function HrPayrollApprovalsPage() {
  const [rows, setRows] = useState<HrPayrollRunResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<string | number | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const pages = await Promise.all(
        AWAITING_STATUSES.map((s) => api.listHrPayrollRuns({ status_filter: s })),
      );
      setRows(pages.flat().sort((a, b) => b.id - a.id));
    } catch (err) {
      logApiError("HrPayrollApprovalsPage.load", err);
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const decide = async (run: HrPayrollRunResponse, decision: "approve" | "reject"): Promise<void> => {
    if (busyId != null) return;
    let note: string | null = null;
    if (decision === "reject") {
      const entered = window.prompt("Reason for rejecting this payroll run:", "");
      if (entered == null) return;
      note = entered.trim() || null;
    }
    setBusyId(run.id);
    setError("");
    try {
      if (decision === "approve") await api.approveHrPayrollRun(run.id);
      else await api.rejectHrPayrollRun(run.id, { note });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save approval decision");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Payroll Approvals</h1>
          <p className="text-sm text-text-muted">Finalized payroll runs waiting for a manager decision.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading pending approvals...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No payroll runs are waiting for approval.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Run</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Run date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Gross</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Net</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-surface-raised">
                {rows.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{run.run_code}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{run.run_date}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{run.status}</td>
                    <td className="px-4 py-3 text-right text-sm text-text-secondary">
                      {Number(run.gross_total || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right text-sm text-text-secondary">
                      {Number(run.net_total || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <RowActionsMenu
                        rowId={run.id}
                        openId={openActionsId}
                        onOpenChange={setOpenActionsId}
                        label={busyId === run.id ? "Working…" : "Actions"}
                        items={[
                          {
                            key: "approve",
                            label: "Approve",
                            disabled: busyId != null,
                            onClick: () => void decide(run, "approve"),
                          },
                          {
                            key: "reject",
                            label: "Reject",
                            danger: true,
                            disabled: busyId != null,
                            onClick: () => void decide(run, "reject"),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
