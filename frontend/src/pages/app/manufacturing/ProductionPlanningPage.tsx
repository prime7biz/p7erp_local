import { useEffect, useMemo, useState } from "react";

import { api, type InventoryItemResponse, type MfgProductionPlanCreate } from "@/api/client";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function ProductionPlanningPage() {
  const [items, setItems] = useState<InventoryItemResponse[]>([]);
  const [plans, setPlans] = useState<Awaited<ReturnType<typeof api.listMfgProductionPlans>>>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<MfgProductionPlanCreate>({
    period_start: todayIso(),
    period_end: todayIso(),
    lines: [],
  });
  const [line, setLine] = useState({ item_id: 0, planned_qty: 0, due_date: todayIso(), priority: 5 });

  const load = async () => {
    setError("");
    try {
      const [itemRows, planRows] = await Promise.all([api.listInventoryItems(), api.listMfgProductionPlans()]);
      setItems(itemRows);
      setPlans(planRows);
      if (!line.item_id && itemRows[0]) {
        const firstItem = itemRows[0];
        if (firstItem) {
          setLine((prev) => ({ ...prev, item_id: firstItem.id }));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load planning data");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const itemName = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  const addLine = () => {
    if (!line.item_id || line.planned_qty <= 0) return;
    setForm((prev) => ({
      ...prev,
      lines: [
        ...prev.lines,
        {
          item_id: line.item_id,
          planned_qty: line.planned_qty,
          due_date: line.due_date,
          priority: line.priority,
        },
      ],
    }));
    setLine((prev) => ({ ...prev, planned_qty: 0 }));
  };

  const createPlan = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.period_start || !form.period_end || form.lines.length === 0) {
      setError("Please set period dates and add at least one line.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api.createMfgProductionPlan(form);
      setForm({ period_start: todayIso(), period_end: todayIso(), lines: [] });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create production plan");
    } finally {
      setSaving(false);
    }
  };

  const generateWorkOrders = async (planId: number) => {
    try {
      await api.generateMfgWorkOrders(planId);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to generate work orders");
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Production Planning</h1>
        <p className="text-sm text-slate-500">Create plans and generate work orders from planned demand.</p>
      </div>

      {error ? <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">Create Production Plan</h2>
        <form className="space-y-3" onSubmit={createPlan}>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input className="rounded border px-3 py-2 text-sm" type="date" value={form.period_start} onChange={(e) => setForm((prev) => ({ ...prev, period_start: e.target.value }))} />
            <input className="rounded border px-3 py-2 text-sm" type="date" value={form.period_end} onChange={(e) => setForm((prev) => ({ ...prev, period_end: e.target.value }))} />
            <input className="rounded border px-3 py-2 text-sm" placeholder="Optional plan code" value={form.plan_code ?? ""} onChange={(e) => setForm((prev) => ({ ...prev, plan_code: e.target.value }))} />
          </div>

          <div className="rounded border border-slate-200 p-3">
            <div className="mb-2 text-xs font-medium text-slate-600">Add line</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-5">
              <select className="rounded border px-3 py-2 text-sm" value={line.item_id} onChange={(e) => setLine((prev) => ({ ...prev, item_id: Number(e.target.value) }))}>
                {items.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
              <input className="rounded border px-3 py-2 text-sm" type="number" min={0} step="0.001" placeholder="Planned qty" value={line.planned_qty || ""} onChange={(e) => setLine((prev) => ({ ...prev, planned_qty: Number(e.target.value) }))} />
              <input className="rounded border px-3 py-2 text-sm" type="date" value={line.due_date} onChange={(e) => setLine((prev) => ({ ...prev, due_date: e.target.value }))} />
              <input className="rounded border px-3 py-2 text-sm" type="number" min={1} max={10} value={line.priority} onChange={(e) => setLine((prev) => ({ ...prev, priority: Number(e.target.value) }))} />
              <button type="button" className="rounded border px-3 py-2 text-sm" onClick={addLine}>Add Line</button>
            </div>
          </div>

          <div className="overflow-x-auto rounded border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-slate-600">
                <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2">Planned Qty</th><th className="px-3 py-2">Due Date</th><th className="px-3 py-2">Priority</th></tr>
              </thead>
              <tbody>
                {form.lines.map((row, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="px-3 py-2">{itemName.get(row.item_id) ?? `Item #${row.item_id}`}</td>
                    <td className="px-3 py-2">{row.planned_qty}</td>
                    <td className="px-3 py-2">{row.due_date ?? "-"}</td>
                    <td className="px-3 py-2">{row.priority ?? 5}</td>
                  </tr>
                ))}
                {form.lines.length === 0 ? <tr><td className="px-3 py-6 text-center text-slate-500" colSpan={4}>No lines added yet.</td></tr> : null}
              </tbody>
            </table>
          </div>

          <button className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-60" disabled={saving} type="submit">
            {saving ? "Saving..." : "Create Plan"}
          </button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr><th className="px-4 py-2">Plan Code</th><th className="px-4 py-2">Period</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Lines</th><th className="px-4 py-2">Action</th></tr>
          </thead>
          <tbody>
            {plans.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2 font-medium">{row.plan_code}</td>
                <td className="px-4 py-2">{row.period_start} to {row.period_end}</td>
                <td className="px-4 py-2">{row.status}</td>
                <td className="px-4 py-2">{row.lines.length}</td>
                <td className="px-4 py-2">
                  <button className="rounded border px-2 py-1 text-xs" onClick={() => void generateWorkOrders(row.id)}>Generate WOs</button>
                </td>
              </tr>
            ))}
            {plans.length === 0 ? <tr><td className="px-4 py-8 text-center text-slate-500" colSpan={5}>No production plans found.</td></tr> : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
