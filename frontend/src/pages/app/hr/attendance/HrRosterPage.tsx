import { useCallback, useEffect, useState } from "react";
import { api, type HrRosterEntryCreate, type HrRosterEntryResponse, type HrRosterEntryUpdate } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrRosterPage() {
  const [rows, setRows] = useState<HrRosterEntryResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [form, setForm] = useState<HrRosterEntryCreate>({
    employee_id: 0,
    roster_date: "",
    shift_id: 0,
    is_week_off: false,
    note: "",
  });
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<HrRosterEntryUpdate>({});
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrRosterEntries());
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

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.roster_date || !form.employee_id || !form.shift_id) return;
    setError("");
    try {
      await api.createHrRosterEntry({
        ...form,
        employee_id: Number(form.employee_id),
        shift_id: Number(form.shift_id),
      });
      setForm({ employee_id: 0, roster_date: "", shift_id: 0, is_week_off: false, note: "" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const openEdit = (r: HrRosterEntryResponse) => {
    setEditId(r.id);
    setEditForm({
      shift_id: r.shift_id ?? undefined,
      is_week_off: r.is_week_off,
      note: r.note ?? undefined,
    });
    setOpenActionsId(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId == null) return;
    try {
      await api.updateHrRosterEntry(editId, editForm);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="HR Roster"
        description="Assign employees to shifts by day."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Roster" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}

      <form onSubmit={onCreate} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-3">
        <input
          type="number"
          className="rounded border px-2 py-1 text-sm"
          placeholder="Employee ID"
          value={form.employee_id || ""}
          onChange={(e) => setForm((p) => ({ ...p, employee_id: Number(e.target.value) }))}
          required
        />
        <input
          type="date"
          className="rounded border px-2 py-1 text-sm"
          value={form.roster_date}
          onChange={(e) => setForm((p) => ({ ...p, roster_date: e.target.value }))}
          required
        />
        <input
          type="number"
          className="rounded border px-2 py-1 text-sm"
          placeholder="Shift ID"
          value={form.shift_id || ""}
          onChange={(e) => setForm((p) => ({ ...p, shift_id: Number(e.target.value) }))}
          required
        />
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input
            type="checkbox"
            checked={form.is_week_off}
            onChange={(e) => setForm((p) => ({ ...p, is_week_off: e.target.checked }))}
          />
          Week off
        </label>
        <input
          className="sm:col-span-2 rounded border px-2 py-1 text-sm"
          placeholder="Note"
          value={form.note ?? ""}
          onChange={(e) => setForm((p) => ({ ...p, note: e.target.value || null }))}
        />
        <div className="flex items-end">
          <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add roster entry
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-sm text-text-muted">No roster entries.</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Employee</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Date</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Shift</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Week off</th>
                <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border-subtle">
                  <td className="px-4 py-2">{row.employee_id}</td>
                  <td className="px-4 py-2">{row.roster_date}</td>
                  <td className="px-4 py-2">{row.shift_id ?? "—"}</td>
                  <td className="px-4 py-2">{row.is_week_off ? "Yes" : "No"}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenActionsId(openActionsId === row.id ? null : row.id)}
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Actions
                      </button>
                      {openActionsId === row.id && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => openEdit(row)}
                          >
                            Edit
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editId != null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-xl space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Edit roster</h3>
            <label className="block text-sm">
              Shift ID
              <input
                type="number"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.shift_id ?? ""}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, shift_id: e.target.value ? Number(e.target.value) : undefined }))
                }
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.is_week_off ?? false}
                onChange={(e) => setEditForm((f) => ({ ...f, is_week_off: e.target.checked }))}
              />
              Week off
            </label>
            <label className="block text-sm">
              Note
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.note ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value || null }))}
              />
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setEditId(null)}>
                Cancel
              </button>
              <button type="submit" className="rounded bg-brand-primary px-3 py-1.5 text-sm font-semibold text-white">
                Save
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
