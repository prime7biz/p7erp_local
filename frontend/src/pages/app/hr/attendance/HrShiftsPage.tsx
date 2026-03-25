import { useEffect, useState } from "react";
import { api, type HrShiftCreate, type HrShiftResponse } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrShiftsPage() {
  const [rows, setRows] = useState<HrShiftResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrShiftResponse | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<HrShiftCreate>({
    code: "",
    name: "",
    start_time: "",
    end_time: "",
    is_night_shift: false,
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrShifts({ active_only: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load shifts");
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

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", start_time: "", end_time: "", is_night_shift: false, is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row: HrShiftResponse) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      start_time: row.start_time,
      end_time: row.end_time,
      is_night_shift: row.is_night_shift,
      is_active: row.is_active,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.start_time || !form.end_time) return;
    setError("");
    try {
      if (editing) {
        await api.updateHrShift(editing.id, form);
      } else {
        await api.createHrShift(form);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader
          title="Shifts"
          description="Shift templates for roster and attendance."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Shifts" }]}
        />
        <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Add shift
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading shifts...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No shifts found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Start</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">End</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Night</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.code}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.start_time}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.end_time}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.is_night_shift ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.is_active ? "Active" : "Inactive"}</td>
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
                                openEdit(row);
                                setOpenActionsId(null);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-text-secondary hover:bg-surface-subtle"
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
          </div>
        )}
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={closeModal}>
          <div className="w-full max-w-md rounded-xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? "Edit shift" : "Add shift"}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Code"
                value={form.code}
                onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))}
                required
              />
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                required
              />
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Start time (HH:MM)"
                value={form.start_time}
                onChange={(e) => setForm((p) => ({ ...p, start_time: e.target.value }))}
                required
              />
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="End time (HH:MM)"
                value={form.end_time}
                onChange={(e) => setForm((p) => ({ ...p, end_time: e.target.value }))}
                required
              />
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.is_night_shift ?? false}
                  onChange={(e) => setForm((p) => ({ ...p, is_night_shift: e.target.checked }))}
                />
                Night shift
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))}
                />
                Active
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-white">
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
