import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  api,
  type StockBatchRow,
  type StockByGodownMatrixResponse,
  type StockGroupResponse,
  type WarehouseResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { logApiError } from "@/utils/logApiError";
import { getWarehousesCached } from "@/lib/masterData";

export function GodownStockPage() {
  const [matrix, setMatrix] = useState<StockByGodownMatrixResponse | null>(null);
  const [groups, setGroups] = useState<StockGroupResponse[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseResponse[]>([]);
  const [groupId, setGroupId] = useState("");
  const [godownId, setGodownId] = useState("");
  const [error, setError] = useState("");
  const [drill, setDrill] = useState<{
    itemId: number;
    itemLabel: string;
    godownId: number;
    godownLabel: string;
    batches: StockBatchRow[];
  } | null>(null);
  const latest = useLatestRequest();

  const load = useCallback(async () => {
    const token = latest.begin();
    try {
      setError("");
      const res = await api.getStockByGodownMatrix({
        group_id: groupId ? Number(groupId) : undefined,
        godown_id: godownId ? Number(godownId) : undefined,
      });
      if (!latest.isCurrent(token)) return;
      setMatrix(res);
    } catch (e) {
      logApiError("GodownStockPage.load", e);
      if (!latest.isCurrent(token)) return;
      setError((e as Error).message);
    }
  }, [latest, groupId, godownId]);

  useEffect(() => {
    void Promise.all([api.listStockGroups(), getWarehousesCached()])
      .then(([g, w]) => {
        setGroups(g);
        setWarehouses(w.filter((x) => x.is_active));
      })
      .catch((e) => logApiError("GodownStockPage.masters", e));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function openCell(itemId: number, itemLabel: string, whId: number, whLabel: string) {
    try {
      const batches = await api.listStockItemBatches(itemId, whId);
      setDrill({ itemId, itemLabel, godownId: whId, godownLabel: whLabel, batches });
    } catch (e) {
      logApiError("GodownStockPage.drill", e);
      setDrill({
        itemId,
        itemLabel,
        godownId: whId,
        godownLabel: whLabel,
        batches: [],
      });
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-6">
      <AppPageHeader
        title="Godown Stock"
        description="Matrix of item quantities by godown. Click a cell for batch detail."
      />

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      ) : null}

      <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3">
        <label className="text-xs text-gray-600">
          Item group
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
          >
            <option value="">All</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.group_code} — {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-gray-600">
          Godown
          <select
            className="mt-1 block rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            value={godownId}
            onChange={(e) => setGodownId(e.target.value)}
          >
            <option value="">All</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.warehouse_code} — {w.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="sticky left-0 z-[1] bg-gray-50 px-3 py-2">Item</th>
              {(matrix?.godowns ?? []).map((g) => (
                <th key={g.id} className="px-3 py-2 text-right whitespace-nowrap">
                  {g.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(matrix?.rows ?? []).map((row) => (
              <tr key={row.item_id} className="border-t border-gray-100">
                <td className="sticky left-0 z-[1] bg-white px-3 py-2">
                  <Link
                    to={`/app/inventory/stock-items/${row.item_id}`}
                    className="text-blue-700 hover:underline"
                  >
                    {row.item_code}
                  </Link>
                  <span className="ml-1 text-gray-500">{row.name}</span>
                </td>
                {(matrix?.godowns ?? []).map((g) => {
                  const qty = row.cells[String(g.id)] ?? "0";
                  const n = Number(qty);
                  return (
                    <td key={g.id} className="px-3 py-2 text-right">
                      <button
                        type="button"
                        className={`tabular-nums ${n > 0 ? "text-blue-700 hover:underline" : "text-gray-400"}`}
                        onClick={() =>
                          openCell(row.item_id, `${row.item_code} — ${row.name}`, g.id, g.name)
                        }
                        disabled={!(n > 0)}
                      >
                        {qty}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!matrix?.rows?.length ? (
              <tr>
                <td colSpan={(matrix?.godowns.length ?? 0) + 1} className="px-3 py-8 text-center text-gray-500">
                  No stock matrix rows.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {drill ? (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-gray-900">
              Batches: {drill.itemLabel} @ {drill.godownLabel}
            </h3>
            <button
              type="button"
              className="text-xs text-gray-600 hover:underline"
              onClick={() => setDrill(null)}
            >
              Close
            </button>
          </div>
          {drill.batches.length ? (
            <table className="min-w-full text-left text-sm">
              <thead className="bg-gray-50 text-xs uppercase text-gray-500">
                <tr>
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2 text-right">Qty</th>
                  <th className="px-3 py-2 text-right">Cost</th>
                  <th className="px-3 py-2">Expiry</th>
                </tr>
              </thead>
              <tbody>
                {drill.batches.map((b) => (
                  <tr key={b.id ?? b.batch_id} className="border-t border-gray-100">
                    <td className="px-3 py-2 font-mono text-xs">{b.batch_number}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.current_qty}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{b.cost_per_unit ?? "—"}</td>
                    <td className="px-3 py-2">{b.expiry_date ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-gray-500">No batch detail (batch tracking may be off).</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
