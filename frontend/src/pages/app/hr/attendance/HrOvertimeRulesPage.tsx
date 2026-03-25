import { useCallback, useEffect, useState } from "react";
import { api, type HrOvertimeRuleResponse, type HrOvertimeRuleUpdate } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrOvertimeRulesPage() {
  const [rows, setRows] = useState<HrOvertimeRuleResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<HrOvertimeRuleUpdate>({});
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [createForm, setCreateForm] = useState({
    code: "",
    name: "",
    employee_category: "",
    weekday_multiplier: "1.5",
    weekend_multiplier: "2",
    holiday_multiplier: "2",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.listHrOvertimeRules());
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
    if (!createForm.code.trim() || !createForm.name.trim()) return;
    setError("");
    try {
      await api.createHrOvertimeRule({
        code: createForm.code.trim(),
        name: createForm.name.trim(),
        employee_category: createForm.employee_category.trim() || null,
        weekday_multiplier: createForm.weekday_multiplier,
        weekend_multiplier: createForm.weekend_multiplier,
        holiday_multiplier: createForm.holiday_multiplier,
        is_active: true,
      });
      setCreateForm({
        code: "",
        name: "",
        employee_category: "",
        weekday_multiplier: "1.5",
        weekend_multiplier: "2",
        holiday_multiplier: "2",
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  };

  const openEdit = (r: HrOvertimeRuleResponse) => {
    setEditId(r.id);
    setEditForm({
      code: r.code,
      name: r.name,
      employee_category: r.employee_category,
      weekday_multiplier: r.weekday_multiplier,
      weekend_multiplier: r.weekend_multiplier,
      holiday_multiplier: r.holiday_multiplier,
      is_active: r.is_active,
    });
    setOpenActionsId(null);
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editId == null) return;
    try {
      await api.updateHrOvertimeRule(editId, editForm);
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  };

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Overtime rules"
        description="Configure OT multipliers by category."
        breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "OT Rules" }]}
      />
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}

      <form onSubmit={onCreate} className="grid gap-2 rounded-xl border border-border bg-surface-raised p-4 sm:grid-cols-2 lg:grid-cols-3">
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Code"
          value={createForm.code}
          onChange={(e) => setCreateForm((f) => ({ ...f, code: e.target.value }))}
          required
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Name"
          value={createForm.name}
          onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
          required
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Employee category (optional)"
          value={createForm.employee_category}
          onChange={(e) => setCreateForm((f) => ({ ...f, employee_category: e.target.value }))}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Weekday mult"
          value={createForm.weekday_multiplier}
          onChange={(e) => setCreateForm((f) => ({ ...f, weekday_multiplier: e.target.value }))}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Weekend mult"
          value={createForm.weekend_multiplier}
          onChange={(e) => setCreateForm((f) => ({ ...f, weekend_multiplier: e.target.value }))}
        />
        <input
          className="rounded border px-2 py-1 text-sm"
          placeholder="Holiday mult"
          value={createForm.holiday_multiplier}
          onChange={(e) => setCreateForm((f) => ({ ...f, holiday_multiplier: e.target.value }))}
        />
        <div className="flex items-end">
          <button type="submit" className="rounded bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
            Add rule
          </button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Code</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Weekday x</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Weekend x</th>
                <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-4 py-2 text-sm">{r.code}</td>
                  <td className="px-4 py-2 text-sm">{r.name}</td>
                  <td className="px-4 py-2 text-sm">{r.weekday_multiplier}</td>
                  <td className="px-4 py-2 text-sm">{r.weekend_multiplier}</td>
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
          <form onSubmit={saveEdit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border bg-surface-raised p-6 shadow-xl space-y-3">
            <h3 className="text-lg font-semibold text-text-primary">Edit OT rule</h3>
            <label className="block text-sm">
              Code
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.code ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, code: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Name
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.name ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Weekday multiplier
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.weekday_multiplier ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, weekday_multiplier: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Weekend multiplier
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.weekend_multiplier ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, weekend_multiplier: e.target.value }))}
              />
            </label>
            <label className="block text-sm">
              Holiday multiplier
              <input
                className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                value={editForm.holiday_multiplier ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, holiday_multiplier: e.target.value }))}
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
