import { FormEvent, useEffect, useState } from "react";
import { api, type CostCenterCreate, type CostCenterDashboardRow, type CostCenterResponse } from "@/api/client";

export function CostCentersPage() {
  const [rows, setRows] = useState<CostCenterResponse[]>([]);
  const [dashboard, setDashboard] = useState<CostCenterDashboardRow[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
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
      setError((e as Error).message);
    }
  }

  useEffect(() => {
    void load();
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
        <h1 className="text-2xl font-semibold text-slate-900">Cost Centers</h1>
        <p className="text-sm text-slate-500">Department or operation wise financial tracking.</p>
      </div>
      {error ? <div className="rounded border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div> : null}

      <form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-4">
        <input className="rounded border px-3 py-2 text-sm" placeholder="Center Code" value={form.center_code} onChange={(e) => setForm((p) => ({ ...p, center_code: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Name" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Department" value={form.department ?? ""} onChange={(e) => setForm((p) => ({ ...p, department: e.target.value }))} />
        <button className="rounded bg-slate-900 px-3 py-2 text-sm text-white">{editingId ? "Update" : "Create"}</button>
      </form>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-2 py-1">Code</th>
              <th className="px-2 py-1">Name</th>
              <th className="px-2 py-1">Department</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-2 py-1">{r.center_code}</td>
                <td className="px-2 py-1">{r.name}</td>
                <td className="px-2 py-1">{r.department ?? "-"}</td>
                <td className="px-2 py-1">{r.is_active ? "ACTIVE" : "INACTIVE"}</td>
                <td className="px-2 py-1">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => startEdit(r)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-2 text-lg font-semibold">Cost Center Dashboard</h2>
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left">
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
