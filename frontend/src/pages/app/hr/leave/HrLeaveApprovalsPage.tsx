import { useEffect, useState } from "react";
import { api, type HrLeaveRequestResponse } from "@/api/client";

export function HrLeaveApprovalsPage() {
  const [rows, setRows] = useState<HrLeaveRequestResponse[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = async (): Promise<void> => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listHrLeaveRequests({ status_filter: "PENDING" });
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load leave approvals");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const decide = async (id: number, decision: "approved" | "rejected"): Promise<void> => {
    setError("");
    try {
      await api.decideHrLeaveRequest(id, decision);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update decision");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">Leave Approvals</h1>
          <p className="text-sm text-text-muted">Approve or reject pending leave requests.</p>
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
          <div className="p-10 text-center text-sm text-text-muted">Loading pending requests...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No pending requests.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Employee ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Leave Type ID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">From</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">To</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Days</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-surface-raised">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.employee_id}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.leave_type_id}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.from_date}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.to_date}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.days_requested}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenActionsId(openActionsId === row.id ? null : row.id)}
                          className="rounded-lg border border-border-strong px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle"
                        >
                          Actions
                        </button>
                        {openActionsId === row.id && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
                            <button
                              type="button"
                              onClick={() => {
                                void decide(row.id, "approved");
                                setOpenActionsId(null);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                void decide(row.id, "rejected");
                                setOpenActionsId(null);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
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
