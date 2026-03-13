import { useEffect, useState } from "react";
import { api, type WarehouseCreate, type WarehouseResponse } from "@/api/client";

export function WarehousesPage() {
  const [items, setItems] = useState<WarehouseResponse[]>([]);
  const [form, setForm] = useState<WarehouseCreate>({ warehouse_code: "", name: "" });
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setItems(await api.listWarehouses());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load warehouses");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Warehouses</h1>
        <p className="text-sm text-gray-500">Create and manage warehouse master data.</p>
        <p className="text-xs text-gray-500 mt-1">Fields marked with ** are mandatory.</p>
      </div>
      {error && <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await api.createWarehouse(form);
          setForm({ warehouse_code: "", name: "" });
          await load();
        }}
        className="rounded-xl border border-gray-200 bg-white p-4 grid grid-cols-1 md:grid-cols-4 gap-2"
      >
        <input className="rounded border px-3 py-2 text-sm" placeholder="Warehouse code **" value={form.warehouse_code} onChange={(e) => setForm((p) => ({ ...p, warehouse_code: e.target.value }))} required />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Warehouse name **" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} required />
        <input className="rounded border px-3 py-2 text-sm" placeholder="Address" value={form.address ?? ""} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />
        <button className="rounded bg-primary px-3 py-2 text-sm font-medium text-white">Add Warehouse</button>
      </form>

      <div className="rounded-xl border border-gray-200 bg-white overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Code</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Name</th>
              <th className="px-3 py-2 text-left text-xs font-medium uppercase text-gray-500">Address</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {items.map((row) => (
              <tr key={row.id}>
                <td className="px-3 py-2 text-sm">{row.warehouse_code}</td>
                <td className="px-3 py-2 text-sm">{row.name}</td>
                <td className="px-3 py-2 text-sm text-gray-600">{row.address ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
