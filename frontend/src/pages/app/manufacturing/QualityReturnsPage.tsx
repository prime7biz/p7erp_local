import { useCallback, useEffect, useState } from "react";
import { api, type MfgMaterialReturnResponse } from "@/api/client";

export function QualityReturnsPage() {
  const [returns, setReturns] = useState<MfgMaterialReturnResponse[]>([]);
  const [error, setError] = useState("");
  const [workOrderFilter, setWorkOrderFilter] = useState<string>("");

  const load = useCallback(async (opts?: { work_order_id?: number }) => {
    setError("");
    try {
      const rows = await api.listMfgMaterialReturns(opts);
      setReturns(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load material returns");
    }
  }, []);

  useEffect(() => {
    void load(undefined);
  }, [load]);

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
        <h1 className="text-2xl font-semibold text-text-primary">Quality / Material Returns</h1>
        <p className="text-sm text-text-muted">
          View material returns from production (issued stock returned to warehouse). To create a return, use the shop floor execution flow for the relevant work order.
        </p>
      </div>
      {error ? (
        <div className="rounded border border-status-danger/20 bg-status-danger-subtle p-3 text-sm text-status-danger-foreground">{error}</div>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <form className="flex items-center gap-2" onSubmit={onFilter}>
          <input
            className="w-32 rounded border border-border px-3 py-2 text-sm"
            type="number"
            min={1}
            placeholder="Work order ID"
            value={workOrderFilter}
            onChange={(e) => setWorkOrderFilter(e.target.value)}
          />
          <button type="submit" className="rounded bg-primary px-3 py-2 text-sm text-primary-foreground">
            Filter
          </button>
        </form>
        <button
          type="button"
          onClick={onClear}
          className="rounded border border-border px-3 py-2 text-sm text-text-secondary"
        >
          Clear
        </button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface-raised">
        <table className="min-w-full text-sm">
          <thead className="bg-surface-subtle text-left text-text-secondary">
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
              <tr key={row.id} className="border-t border-border-subtle">
                <td className="px-4 py-2">{row.id}</td>
                <td className="px-4 py-2">{row.issue_id}</td>
                <td className="px-4 py-2">{row.qty_returned}</td>
                <td className="px-4 py-2">{row.warehouse_id ?? "–"}</td>
                <td className="px-4 py-2 text-text-secondary">
                  {row.returned_at ? new Date(row.returned_at).toLocaleString() : "–"}
                </td>
              </tr>
            ))}
            {returns.length === 0 ? (
              <tr>
                <td className="px-4 py-8 text-center text-text-muted" colSpan={5}>
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
