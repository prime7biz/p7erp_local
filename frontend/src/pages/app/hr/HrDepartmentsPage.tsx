import { useEffect, useState } from "react";
import {
  api,
  type HrDepartmentCreate,
  type HrDepartmentResponse,
  type HrDepartmentUpdate,
} from "@/api/client";

export function HrDepartmentsPage() {
  const [departments, setDepartments] = useState<HrDepartmentResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrDepartmentResponse | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<HrDepartmentCreate>({ code: "", name: "", is_active: true });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const rows = await api.listHrDepartments({ active_only: false });
      setDepartments(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({ code: "", name: "", is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row: HrDepartmentResponse) => {
    setEditing(row);
    setForm({ code: row.code, name: row.name, is_active: row.is_active });
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditing(null);
    setForm({ code: "", name: "", is_active: true });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) return;
    setError("");
    try {
      if (editing) {
        const payload: HrDepartmentUpdate = { ...form };
        await api.updateHrDepartment(editing.id, payload);
      } else {
        await api.createHrDepartment(form);
      }
      closeModal();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  const onDelete = async (row: HrDepartmentResponse) => {
    const ok = window.confirm(
      `Delete department "${row.code} - ${row.name}"?\n\nIf this department has linked records, deletion will be blocked.`
    );
    if (!ok) return;
    setError("");
    try {
      await api.deleteHrDepartment(row.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">HR Departments</h1>
          <p className="text-sm text-text-muted">Create and manage department masters.</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
        >
          Add department
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading departments...</div>
        ) : departments.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No departments found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-surface-raised">
                {departments.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.code}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
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
                            <button
                              type="button"
                              onClick={() => {
                                onDelete(row);
                                setOpenActionsId(null);
                              }}
                              className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-status-danger hover:bg-status-danger-subtle"
                            >
                              Delete
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
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? "Edit department" : "Add department"}</h2>
            <form onSubmit={onSubmit} className="space-y-3">
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Department code"
                value={form.code}
                onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))}
                required
              />
              <input
                className="w-full rounded border border-border-strong px-3 py-2 text-sm"
                placeholder="Department name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                required
              />
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.is_active ?? true}
                  onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                />
                Active
              </label>
              <div className="flex justify-end gap-2 pt-1">
                <button type="button" onClick={closeModal} className="rounded border border-border-strong px-3 py-1.5 text-sm text-text-secondary">
                  Cancel
                </button>
                <button type="submit" className="rounded bg-brand-primary px-4 py-1.5 text-sm font-semibold text-brand-primary-foreground">
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
