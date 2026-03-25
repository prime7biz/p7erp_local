import { useCallback, useEffect, useState } from "react";
import { api, type HrRegularizationResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrRegularizationsPage() {
  const [rows, setRows] = useState<HrRegularizationResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrRegularizations());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const approve = async (id: number) => {
    setMsg("");
    try {
      await api.approveHrRegularization(id, {});
      setMsg("Request approved.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Approve failed");
    }
  };

  const reject = async (id: number) => {
    setMsg("");
    try {
      await api.rejectHrRegularization(id, { decision_note: "Rejected" });
      setMsg("Request rejected.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Reject failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Attendance regularizations"
        description="Employees request corrections to punch times; managers approve or reject."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Regularizations" }]}
      />
      <div className="flex justify-end">
        <button
          type="button"
          className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {msg && <div className="text-sm text-text-secondary">{msg}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">No regularization requests.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-2 text-left text-xs uppercase">ID</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Entry ID</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                  <th className="px-4 py-2 text-left text-xs uppercase">Reason</th>
                  <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-border-subtle">
                    <td className="px-4 py-2">{row.id}</td>
                    <td className="px-4 py-2">{row.attendance_entry_id}</td>
                    <td className="px-4 py-2">{row.status}</td>
                    <td className="px-4 py-2 max-w-xs truncate">{row.reason}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenActionsId(openActionsId === row.id ? null : row.id)}
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Actions
                        </button>
                        {openActionsId === row.id && row.status === "PENDING" && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => {
                                setOpenActionsId(null);
                                void approve(row.id);
                              }}
                            >
                              Approve
                            </button>
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-red-600 hover:bg-red-50"
                              onClick={() => {
                                setOpenActionsId(null);
                                void reject(row.id);
                              }}
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
