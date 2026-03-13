import { useEffect, useMemo, useState } from "react";
import { api, type StockGroupCreate, type StockGroupResponse } from "@/api/client";

export function StockGroupsPage() {
  const [items, setItems] = useState<StockGroupResponse[]>([]);
  const [form, setForm] = useState<StockGroupCreate>({ group_code: "", name: "", parent_id: null });
  const [error, setError] = useState("");
  const nameMap = useMemo(() => new Map(items.map((i) => [i.id, i.name])), [items]);

  const load = async () => {
    try {
      setItems(await api.listStockGroups());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load stock groups");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Stock Groups</h1>
        <p className="text-sm text-gray-500">Maintain stock group hierarchy for reporting.</p>
        <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createStockGroup(form);
          setForm({ group_code: "", name: "", parent_id: null });
          await load();
        }}
        className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-4 gap-2"
      >
        <input className="rounded border px-3 py-2 text-sm" placeholder="Group code **" value={form.group_code} onChange={(e) => setForm((p) => ({ ...p, group_code: e.target.value }))} required />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Group name **" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <select className="rounded border px-3 py-2 text-sm" value={form.parent_id ?? ""} onChange={(e) => setForm((p) => ({ ...p, parent_id: e.target.value ? Number(e.target.value) : null }))}>
          <option value="">No parent</option>
          {items.map((row) => (
            <option key={row.id} value={row.id}>{row.name}</option>
          ))}
        </select>
        <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Add Group</button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Parent</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm">{row.group_code}</td>
                <td className="px-3 py-2 text-sm">{row.name}</td>
                <td className="px-3 py-2 text-sm text-gray-600">{row.parent_id ? nameMap.get(row.parent_id) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
