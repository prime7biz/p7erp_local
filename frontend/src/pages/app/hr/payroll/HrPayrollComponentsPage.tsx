import { useCallback, useEffect, useState } from "react";
import { api } from "@/api/client";
import { HrPageHeader } from "@/components/hr/HrPageHeader";

const PREFIX = "/app/hr";

export function HrPayrollComponentsPage() {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [form, setForm] = useState({
    code: "",
    name: "",
    component_type: "EARNING",
    calculation_type: "FIXED",
    default_amount: "0",
    formula: "",
    applies_to: "ALL",
    is_active: true,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRows(await api.listHrPayrollComponents({ active_only: false }));
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
    const c = () => setOpenActionsId(null);
    document.addEventListener("click", c);
    return () => document.removeEventListener("click", c);
  }, []);

  const openCreate = () => {
    setEditing(null);
    setForm({
      code: "",
      name: "",
      component_type: "EARNING",
      calculation_type: "FIXED",
      default_amount: "0",
      formula: "",
      applies_to: "ALL",
      is_active: true,
    });
    setModalOpen(true);
  };

  const openEdit = (row: Record<string, unknown>) => {
    setEditing(row);
    setForm({
      code: String(row.code ?? ""),
      name: String(row.name ?? ""),
      component_type: String(row.component_type ?? "EARNING"),
      calculation_type: String(row.calculation_type ?? "FIXED"),
      default_amount: String(row.default_amount ?? "0"),
      formula: String(row.formula ?? ""),
      applies_to: String(row.applies_to ?? "ALL"),
      is_active: Boolean(row.is_active),
    });
    setModalOpen(true);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        component_type: form.component_type,
        calculation_type: form.calculation_type,
        default_amount: form.default_amount,
        formula: form.formula || null,
        applies_to: form.applies_to,
        is_active: form.is_active,
      };
      if (editing) {
        await api.updateHrPayrollComponent(Number(editing.id), payload);
      } else {
        await api.createHrPayrollComponent(payload);
      }
      setModalOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <HrPageHeader
          title="Payroll components"
          description="Earnings and deductions; optional formula and worker/staff applicability."
          breadcrumbs={[{ label: "HR", href: PREFIX }, { label: "Components" }]}
        />
        <button type="button" onClick={openCreate} className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-white">
          Add component
        </button>
      </div>
      {error && <div className="text-sm text-status-danger-foreground">{error}</div>}
      <div className="rounded-xl border border-border bg-surface-raised overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-text-muted">Loading...</div>
        ) : (
          <table className="min-w-full divide-y divide-border text-sm">
            <thead className="bg-surface-subtle">
              <tr>
                <th className="px-4 py-2 text-left text-xs uppercase">Code</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Name</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Type</th>
                <th className="px-4 py-2 text-left text-xs uppercase">Applies</th>
                <th className="px-4 py-2 text-right text-xs uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={String(r.id)}>
                  <td className="px-4 py-2">{String(r.code)}</td>
                  <td className="px-4 py-2">{String(r.name)}</td>
                  <td className="px-4 py-2">{String(r.component_type)}</td>
                  <td className="px-4 py-2">{String(r.applies_to ?? "ALL")}</td>
                  <td className="px-4 py-2 text-right">
                    <div className="relative inline-block" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setOpenActionsId(openActionsId === Number(r.id) ? null : Number(r.id))}
                        className="rounded-lg border border-border-strong px-2.5 py-1 text-xs"
                      >
                        Actions
                      </button>
                      {openActionsId === Number(r.id) && (
                        <div className="absolute right-0 z-10 mt-1 w-36 rounded-lg border border-border bg-white p-1 shadow-lg">
                          <button
                            type="button"
                            className="block w-full rounded-md px-2 py-1.5 text-left text-xs hover:bg-gray-50"
                            onClick={() => {
                              openEdit(r);
                              setOpenActionsId(null);
                            }}
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

      {modalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={() => setModalOpen(false)}>
          <div className="w-full max-w-lg rounded-xl bg-surface-raised p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">{editing ? "Edit component" : "Add component"}</h2>
            <form onSubmit={onSubmit} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input className="rounded border px-2 py-1 text-sm" placeholder="Code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} required />
              <input className="rounded border px-2 py-1 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
              <input className="rounded border px-2 py-1 text-sm" placeholder="Component type" value={form.component_type} onChange={(e) => setForm((p) => ({ ...p, component_type: e.target.value }))} />
              <input className="rounded border px-2 py-1 text-sm" placeholder="Calculation type" value={form.calculation_type} onChange={(e) => setForm((p) => ({ ...p, calculation_type: e.target.value }))} />
              <input className="rounded border px-2 py-1 text-sm" placeholder="Default amount" value={form.default_amount} onChange={(e) => setForm((p) => ({ ...p, default_amount: e.target.value }))} />
              <input className="rounded border px-2 py-1 text-sm" placeholder="Applies to (ALL, WORKER, STAFF)" value={form.applies_to} onChange={(e) => setForm((p) => ({ ...p, applies_to: e.target.value }))} />
              <input className="sm:col-span-2 rounded border px-2 py-1 text-sm" placeholder="Formula (optional)" value={form.formula} onChange={(e) => setForm((p) => ({ ...p, formula: e.target.value }))} />
              <label className="flex items-center gap-2 text-sm sm:col-span-2">
                <input type="checkbox" checked={form.is_active} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
                Active
              </label>
              <div className="sm:col-span-2 flex justify-end gap-2">
                <button type="button" className="rounded border px-3 py-1.5 text-sm" onClick={() => setModalOpen(false)}>
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
