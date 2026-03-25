import { useEffect, useState } from "react";
import { api, type HrLeaveTypeCreate, type HrLeaveTypeResponse, type HrLeaveTypeUpdate } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { HrStatusBadge } from "@/components/hr/HrStatusBadge";

const PREFIX = "/app/hr";

export function HrLeaveTypesPage() {
  const [rows, setRows] = useState<HrLeaveTypeResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<HrLeaveTypeResponse | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState<HrLeaveTypeCreate>({
    code: "",
    name: "",
    is_paid: true,
    requires_approval: true,
    is_active: true,
  });

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrLeaveTypes({ active_only: false }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leave types");
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
    setForm({ code: "", name: "", is_paid: true, requires_approval: true, is_active: true });
    setModalOpen(true);
  };

  const openEdit = (row: HrLeaveTypeResponse) => {
    setEditing(row);
    setForm({
      code: row.code,
      name: row.name,
      is_paid: row.is_paid,
      requires_approval: row.requires_approval,
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
    if (!form.code.trim() || !form.name.trim()) return;
    setError("");
    try {
      if (editing) {
        const patch: HrLeaveTypeUpdate = {
          code: form.code.trim(),
          name: form.name.trim(),
          is_paid: form.is_paid,
          requires_approval: form.requires_approval,
          is_active: form.is_active,
        };
        await api.updateHrLeaveType(editing.id, patch);
      } else {
        await api.createHrLeaveType({
          code: form.code.trim(),
          name: form.name.trim(),
          is_paid: form.is_paid,
          requires_approval: form.requires_approval,
          is_active: form.is_active,
        });
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
          title="Leave types"
          description="Configure leave categories (casual, sick, annual, etc.). Quotas are set in Leave policies."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Leave types" }]}
        />
        <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Add leave type
        </button>
      </div>

      {error && <div className="rounded-lg border border-status-danger/20 bg-status-danger-subtle px-4 py-2 text-sm text-status-danger-foreground">{error}</div>}

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-sm text-text-muted">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-text-muted">No leave types found.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-surface-subtle">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Code</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Name</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Paid</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Approval</th>
                  <th className="px-4 py-3 text-left text-xs font-medium uppercase text-text-muted">Status</th>
                  <th className="px-4 py-3 text-right text-xs font-medium uppercase text-text-muted">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td className="px-4 py-3 text-sm font-medium text-text-primary">{row.code}</td>
                    <td className="px-4 py-3 text-sm text-text-secondary">{row.name}</td>
                    <td className="px-4 py-3 text-sm">{row.is_paid ? "Yes" : "No"}</td>
                    <td className="px-4 py-3 text-sm">{row.requires_approval ? "Required" : "No"}</td>
                    <td className="px-4 py-3 text-sm">
                      <HrStatusBadge status={row.is_active ? "active" : "inactive"} />
                    </td>
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
            <h2 className="mb-4 text-lg font-semibold text-text-primary">{editing ? "Edit leave type" : "Add leave type"}</h2>
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
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={form.is_paid ?? true} onChange={(e) => setForm((p) => ({ ...p, is_paid: e.target.checked }))} />
                Paid leave
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input
                  type="checkbox"
                  checked={form.requires_approval ?? true}
                  onChange={(e) => setForm((p) => ({ ...p, requires_approval: e.target.checked }))}
                />
                Requires approval
              </label>
              <label className="flex items-center gap-2 text-sm text-text-secondary">
                <input type="checkbox" checked={form.is_active ?? true} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
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
