import { useCallback, useEffect, useState } from "react";
import { api, type HrHolidayResponse, type HrHolidayUpdate } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrAttendanceHolidaysPage() {
  const [rows, setRows] = useState<HrHolidayResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [holidayDate, setHolidayDate] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<HrHolidayUpdate>({});
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrHolidays());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
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

  const onAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!holidayDate || !name.trim()) return;
    try {
      await api.createHrHoliday({
        holiday_date: holidayDate,
        name: name.trim(),
        is_optional: false,
      });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const openEdit = (r: HrHolidayResponse) => {
    setEditId(r.id);
    setEditForm({ name: r.name, is_optional: r.is_optional, note: r.note ?? undefined });
    setOpenActionsId(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId == null) return;
    try {
      await api.updateHrHoliday(editId, editForm);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Holidays"
        description="Plant-wide holidays for attendance and OT rules."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Holidays" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <form onSubmit={onAdd} className="flex flex-wrap items-end gap-2 rounded-xl border border-border bg-surface-raised p-4">
        <label className="text-sm text-text-secondary">
          Date
          <input
            type="date"
            className="ml-2 rounded border border-border-strong px-2 py-1 text-sm"
            value={holidayDate}
            onChange={(e) => setHolidayDate(e.target.value)}
            required
          />
        </label>
        <label className="text-sm text-text-secondary">
          Name
          <input
            className="ml-2 rounded border border-border-strong px-2 py-1 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <button type="submit" className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Add holiday
        </button>
      </form>
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase text-text-muted">Date</th>
                <th className="px-4 py-2 text-left text-xs uppercase text-text-muted">Name</th>
                <th className="px-4 py-2 text-right text-xs uppercase text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="divide-y divide-border">
                  <td className="px-4 py-2 text-sm">{r.holiday_date}</td>
                  <td className="px-4 py-2 text-sm">{r.name}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenActionsId(openActionsId === r.id ? null : r.id)}
                        className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        Actions
                      </button>
                      {openActionsId === r.id && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                            onClick={() => openEdit(r)}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-xl space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Edit holiday</h3>
            <label className="block text-sm text-text-secondary">
              Name
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.is_optional ?? false}
                onChange={(e) => setEditForm((f) => ({ ...f, is_optional: e.target.checked }))}
              />
              Optional holiday
            </label>
            <label className="block text-sm text-text-secondary">
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
