import { useCallback, useEffect, useState } from "react";
import { api, type HrLeavePolicyResponse, type HrLeavePolicyUpdate } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrLeavePoliciesPage() {
  const [rows, setRows] = useState<HrLeavePolicyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<HrLeavePolicyUpdate>({});
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrLeavePolicies());
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

  const openEdit = (r: HrLeavePolicyResponse) => {
    setEditId(r.id);
    setEditForm({
      employment_type: r.employment_type ?? undefined,
      annual_quota_days: r.annual_quota_days,
      max_carry_forward_days: r.max_carry_forward_days,
      effective_from: r.effective_from ?? undefined,
      effective_to: r.effective_to ?? undefined,
      is_active: r.is_active,
    });
    setOpenActionsId(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId == null) return;
    try {
      await api.updateHrLeavePolicy(editId, editForm);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Leave policies"
        description="Quota and carry-forward rules by employment type."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Policies" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">ID</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Leave type</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Employment</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Annual quota</th>
                <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2">{r.id}</td>
                  <td className="px-4 py-2">{r.leave_type_id}</td>
                  <td className="px-4 py-2">{r.employment_type ?? "—"}</td>
                  <td className="px-4 py-2">{r.annual_quota_days}</td>
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={saveEdit} className="w-full max-w-md rounded-xl border border-border bg-surface-raised p-6 shadow-xl space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Edit leave policy</h3>
            <label className="block text-sm">
              Employment type
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.employment_type ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, employment_type: e.target.value || undefined }))}
              />
            </label>
            <label className="block text-sm">
              Annual quota (days)
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.annual_quota_days ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, annual_quota_days: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Max carry-forward (days)
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.max_carry_forward_days ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, max_carry_forward_days: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Effective from
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.effective_from ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, effective_from: e.target.value || null }))}
              />
            </label>
            <label className="block text-sm">
              Effective to
              <input
                type="date"
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.effective_to ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, effective_to: e.target.value || null }))}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editForm.is_active ?? true}
                onChange={(e) => setEditForm((f) => ({ ...f, is_active: e.target.checked }))}
              />
              Active
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
