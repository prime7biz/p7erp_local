import { useEffect, useState } from "react";
import { api, type ItemUnitCreate, type ItemUnitResponse } from "@/api/client";

export function UnitsPage() {
  const [items, setItems] = useState<ItemUnitResponse[]>([]);
  const [form, setForm] = useState<ItemUnitCreate>({ unit_code: "", name: "" });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setItems(await api.listInventoryItemUnits());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load units");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Units</h1>
        <p className="text-sm text-gray-500">Maintain UOM master (PCS, KG, YD, etc.).</p>
        <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createInventoryItemUnit(form);
          setForm({ unit_code: "", name: "" });
          await load();
        }}
        className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-2"
      >
        <input className="rounded border px-3 py-2 text-sm" placeholder="Unit code **" value={form.unit_code} onChange={(e) => setForm((p) => ({ ...p, unit_code: e.target.value }))} required />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Unit name **" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Add Unit</button>
      </form>
      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm">{row.unit_code}</td>
                <td className="px-3 py-2 text-sm">{row.name}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
