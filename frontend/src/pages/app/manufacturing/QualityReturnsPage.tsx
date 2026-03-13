import { useEffect, useState } from "react";
import { api, type MfgMaterialReturnResponse } from "@/api/client";

export function QualityReturnsPage() {
  const [returns, setReturns] = useState<MfgMaterialReturnResponse[]>([]);
  const [error, setError] = useState("");
  const [workOrderFilter, setWorkOrderFilter] = useState<string>("");

  const load = async (opts?: { work_order_id?: number }) => {
    setError("");
    try {
      const rows = await api.listMfgMaterialReturns(opts);
      setReturns(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load material returns");
    }
  };

  useEffect(() => {
    const workOrderId = workOrderFilter.trim() ? Number(workOrderFilter) : undefined;
    const valid = workOrderId != null && !Number.isNaN(workOrderId);
    void load(valid ? { work_order_id: workOrderId } : undefined);
  }, []);

  const onFilter = (e: React.FormEvent) => {
    e.preventDefault();
    const workOrderId = workOrderFilter.trim() ? Number(workOrderFilter) : undefined;
    const valid = workOrderId != null && !Number.isNaN(workOrderId);
    void load(valid ? { work_order_id: workOrderId } : undefined);
  };

  const onClear = () => {
    setWorkOrderFilter("");
    void load(undefined);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Quality / Material Returns</h1>
        <p className="text-sm text-slate-500">
          View material returns from production (issued stock returned to warehouse). To create a return, use the shop floor execution flow for the relevant work order.
        </p>
      </div>
      {error ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2" onSubmit={onFilter}>
          <input
            className="w-32 rounded border border-slate-300 px-3 py-2 text-sm"
            type="number"
            min={1}
            placeholder="Work order ID"
            value={workOrderFilter}
            onChange={(e) => setWorkOrderFilter(e.target.value)}
          />
          <button type="submit" className="rounded bg-slate-800 px-3 py-2 text-sm text-white">
            Filter
          </button>
        </form>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
        >
          Clear
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-slate-600">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Issue ID</th>
              <th className="px-4 py-2">Qty returned</th>
              <th className="px-4 py-2">Warehouse</th>
              <th className="px-4 py-2">Returned at</th>
            </tr>
          </thead>
          <tbody>
            {returns.map((row) => (
              <tr key={row.id} className="border-t border-slate-100">
                <td className="px-4 py-2">{row.id}</td>
                <td className="px-4 py-2">{row.issue_id}</td>
                <td className="px-4 py-2">{row.qty_returned}</td>
                <td className="px-4 py-2">{row.warehouse_id ?? "–"}</td>
                <td className="px-4 py-2 text-slate-600">
                  {row.returned_at ? new Date(row.returned_at).toLocaleString() : "–"}
                </td>
              </tr>
            ))}
            {returns.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-slate-500" colSpan={5}>
                  No material returns found. Returns are created from the production execution flow when returning issued material.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
