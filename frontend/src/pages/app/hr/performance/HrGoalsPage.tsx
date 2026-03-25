import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

/** Backend returns performance goals; we only need id/status for submit. */
export function HrGoalsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listHrGoals();
      setRows(data as unknown as Record<string, unknown>[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load goals");
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

  const submit = async (id: number) => {
    setMsg("");
    try {
      await api.submitHrGoal(id, {});
      setMsg("Goal submitted.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Submit failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Performance goals"
        description="Create goals in a cycle, then submit them for manager review."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Goals" }]}
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
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-text-muted">No goals.</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">ID</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Title</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = Number(r.id);
                const status = String(r.status ?? "");
                return (
                  <tr key={id}>
                    <td className="px-4 py-2">{id}</td>
                    <td className="px-4 py-2">{String(r.employee_id ?? "")}</td>
                    <td className="px-4 py-2">{String(r.title ?? "")}</td>
                    <td className="px-4 py-2">{status}</td>
                    <td className="px-4 py-2 text-right">
                      <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => setOpenActionsId(openActionsId === id ? null : id)}
                          className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                        >
                          Actions
                        </button>
                        {openActionsId === id && status === "draft" && (
                          <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                            <button
                              type="button"
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                              onClick={() => {
                                setOpenActionsId(null);
                                void submit(id);
                              }}
                            >
                              Submit
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="text-xs text-text-muted">
        New goals must be created via API with a valid <code className="text-xs">cycle_id</code> and employee. Use Submit when status is{" "}
        <code className="text-xs">draft</code>.
      </p>
    </div>
  );
}
