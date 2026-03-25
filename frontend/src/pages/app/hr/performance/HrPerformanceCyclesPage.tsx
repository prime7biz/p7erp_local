import { useCallback, useEffect, useState } from "react";
import { api, type HrPerformanceCycleResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrPerformanceCyclesPage() {
  const [rows, setRows] = useState<HrPerformanceCycleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrPerformanceCycles());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!start || !end) return;
    setError("");
    try {
      await api.createHrPerformanceCycle({
        name: name.trim(),
        description: desc.trim() || null,
        start_date: start,
        end_date: end,
      });
      setName("");
      setDesc("");
      setStart("");
      setEnd("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Performance cycles"
        description="Define review periods (draft → active → closed)."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Cycles" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <form onSubmit={onCreate} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-raised p-4">
        <input className="rounded border px-2 py-1 text-sm" placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input className="min-w-[12rem] rounded border px-2 py-1 text-sm" placeholder="Description" value={desc} onChange={(e) => setDesc(e.target.value)} />
        <input type="date" className="rounded border px-2 py-1 text-sm" value={start} onChange={(e) => setStart(e.target.value)} required />
        <input type="date" className="rounded border px-2 py-1 text-sm" value={end} onChange={(e) => setEnd(e.target.value)} required />
        <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Add cycle
        </button>
      </form>
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Start</th>
                <th className="px-4 py-2 text-left text-xs uppercase">End</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2">{r.start_date}</td>
                  <td className="px-4 py-2">{r.end_date}</td>
                  <td className="px-4 py-2">{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
