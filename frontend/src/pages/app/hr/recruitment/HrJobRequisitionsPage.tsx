import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrJobRequisitionsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");
  const [title, setTitle] = useState("");
  const [vacancyCount, setVacancyCount] = useState(1);
  const [departmentId, setDepartmentId] = useState("");
  const [statusDraft, setStatusDraft] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.listHrJobRequisitions();
      setRows(data as unknown as Record<string, unknown>[]);
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

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    setMsg("");
    try {
      await api.createHrJobRequisition({
        title: title.trim(),
        vacancy_count: vacancyCount,
        department_id: departmentId ? Number(departmentId) : null,
      });
      setTitle("");
      setMsg("Requisition created.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    }
  };

  const applyStatus = async (id: number) => {
    const st = statusDraft[id];
    if (!st?.trim()) return;
    setMsg("");
    try {
      await api.postHrJobRequisitionStatus(id, { status: st.trim() });
      setMsg("Status updated.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Status update failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Job requisitions"
        description="Open roles and hiring pipeline. Update status as you progress (e.g. open, filled, cancelled)."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Requisitions" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      {msg && <div className="text-sm text-text-secondary">{msg}</div>}

      <form onSubmit={(e) => void create(e)} className="grid gap-2 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          type="number"
          min={1}
          className="rounded border px-2 py-1 text-sm"
          value={vacancyCount}
          onChange={(e) => setVacancyCount(Number(e.target.value) || 1)}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Department ID (optional)"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        />
        <div className="flex items-end">
          <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add requisition
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-sm text-text-muted">No requisitions.</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">ID</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Title</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Vacancies</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Status</th>
                <th className="px-4 py-2 text-left text-xs uppercase">New status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const id = Number(r.id);
                return (
                  <tr key={id}>
                    <td className="px-4 py-2">{id}</td>
                    <td className="px-4 py-2">{String(r.title ?? "")}</td>
                    <td className="px-4 py-2">{String(r.vacancy_count ?? "")}</td>
                    <td className="px-4 py-2">{String(r.status ?? "")}</td>
                    <td className="px-4 py-2 flex flex-wrap items-center gap-1">
                      <input
                        className="w-28 rounded border px-2 py-1 text-xs"
                        placeholder="e.g. open"
                        value={statusDraft[id] ?? ""}
                        onChange={(e) => setStatusDraft((d) => ({ ...d, [id]: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="rounded border px-2 py-1 text-xs"
                        onClick={() => void applyStatus(id)}
                      >
                        Apply
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
