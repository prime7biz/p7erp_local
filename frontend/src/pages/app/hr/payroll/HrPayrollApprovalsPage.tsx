import { useEffect, useState } from "react";
import { api, type HrPayrollApprovalResponse } from "@/api/client";

export function HrPayrollApprovalsPage() {
  const [rows, setRows] = useState<HrPayrollApprovalResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");

  const load = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listHrPayrollApprovals({ status: "pending" });
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const decide = async (id: number, decision: "approved" | "rejected"): Promise<void> => {
    setError("");
    try {
      await api.decideHrPayrollApproval(id, decision);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save approval decision");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Payroll Approvals</h1>
          <p className="text-sm text-text-muted">Review pending payroll approvals.</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
        >
          Refresh
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading pending approvals...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No pending approvals.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Payroll Run ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Approver User ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Decision</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Decision Time</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-surface-raised">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.payroll_run_id}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.approver_user_id}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.decision}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.decided_at ?? "-"}</td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => void decide(row.id, "approved")}
                        className="rounded border border-status-success/30 px-3 py-1 text-xs text-status-success-foreground hover:bg-status-success-subtle"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => void decide(row.id, "rejected")}
                        className="rounded border border-status-danger/30 px-3 py-1 text-xs text-status-danger-foreground hover:bg-status-danger-subtle"
                      >
                        Reject
                      </button>
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
