import { FormEvent, useEffect, useState } from "react";
import { api, type CostCenterCreate, type CostCenterDashboardRow, type CostCenterResponse } from "@/api/client";
import { logApiError } from "@/utils/logApiError";

export function CostCentersPage() {
  const [rows, setRows] = useState<CostCenterResponse[]>([]);
  const [dashboard, setDashboard] = useState<CostCenterDashboardRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [openActionsId, setOpenActionsId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState<CostCenterCreate>({
    center_code: "",
    name: "",
    department: "",
    is_active: true,
  });

  async function load() {
    try {
      setError("");
      const [centers, dash] = await Promise.all([api.listCostCenters({ active_only: false }), api.getCostCenterDashboard()]);
      setRows(centers);
      setDashboard(dash);
    } catch (e) {
      logApiError("CostCentersPage.load", e);
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const close = () => setOpenActionsId(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    try {
      if (!form.name?.trim()) throw new Error("Cost center name is required");
      if (editingId) await api.updateCostCenter(editingId, form);
      else await api.createCostCenter(form);
      setEditingId(null);
      setForm({ center_code: "", name: "", department: "", is_active: true });
      await load();
    } catch (e) {
      logApiError("CostCentersPage.submit", e);
      setError((e as Error).message);
    }
  }

  function startEdit(row: CostCenterResponse) {
    setEditingId(row.id);
    setForm({
      center_code: row.center_code,
      name: row.name,
      department: row.department,
      is_active: row.is_active,
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Cost Centers</h1>
        <p className="text-sm text-text-muted">Department or operation wise financial tracking.</p>
      </div>
      {error ? <div className="rounded border border-status-danger/20 bg-status-danger-subtle px-3 py-2 text-sm text-status-danger-foreground">{error}</div> : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-surface-raised p-4 md:grid-cols-5">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Center Code" value={form.center_code} onChange={(e) => setForm((p) => ({ ...p, center_code: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Department" value={form.department ?? ""} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_active !== false} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} />
          Active
        </label>
        <button
          type="submit"
          className="rounded-xl bg-brand-primary px-3 py-2 text-sm font-semibold text-brand-primary-foreground shadow hover:bg-brand-primary/90"
        >
          {editingId ? "Update" : "Create"}
        </button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className="px-2 py-1">Code</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Department</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.center_code}</td>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1">{r.department ?? "-"}</td>
                <td className="px-2 py-1">{r.is_active ? "ACTIVE" : "INACTIVE"}</td>
                <td className="px-2 py-1 text-right">
                  <div className="relative inline-block text-left">
                    <button
                      type="button"
                      className="rounded-lg border border-gray-300 px-2.5 py-1 text-xs text-gray-700 hover:bg-gray-50"
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenActionsId((id) => (id === r.id ? null : r.id));
                      }}
                    >
                      Actions
                    </button>
                    {openActionsId === r.id && (
                      <div className="absolute right-0 z-10 mt-1 w-44 rounded-lg border border-gray-200 bg-white p-1 shadow-lg">
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionsId(null);
                            startEdit(r);
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenActionsId(null);
                            document.getElementById("cost-center-dashboard")?.scrollIntoView({ behavior: "smooth" });
                          }}
                        >
                          View dashboard
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

      <div id="cost-center-dashboard" className="overflow-x-auto rounded-xl border border-border bg-surface-raised p-4">
        <h2 className="mb-2 text-lg font-semibold">Cost Center Dashboard</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left">
            <tr>
              <th className="px-2 py-1">Code</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1 text-right">Debit</th>
              <th className="px-2 py-1 text-right">Credit</th>
              <th className="px-2 py-1 text-right">Net</th>
            </tr>
          </thead>
          <tbody>
            {dashboard.map((d) => (
              <tr key={d.cost_center_id} className="border-t">
                <td className="px-2 py-1">{d.center_code}</td>
                <td className="px-2 py-1">{d.name}</td>
                <td className="px-2 py-1 text-right">{d.debit_total.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{d.credit_total.toLocaleString()}</td>
                <td className="px-2 py-1 text-right">{d.net.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
